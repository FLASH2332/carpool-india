import { createHash, randomUUID } from 'node:crypto';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import { LocationClient, SearchPlaceIndexForTextCommand, CalculateRouteCommand } from '@aws-sdk/client-location';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/transit-claims';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';
import { istDate } from '../../shared/impact';
import { requireOrganisation } from '../../shared/access';
import { isListedAdmin } from '../../shared/org';
import { dayEnd, duplicateText, MAX_IMAGE_BYTES, needsReview, parseTicket, todayOnly, transitReward, userDayPartition, type TransitClaim } from '../../shared/transit';
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const data = generateClient<Schema>();
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const ocr = new TextractClient({}), location = new LocationClient({});
const table = env.TRANSIT_TABLE_NAME;
const second = () => Math.floor(Date.now() / 1000);
const partition = (user: string) => userDayPartition(user, istDate());
type Stored = TransitClaim & { pk: string; sk: string; rewardId: string; expiryBucket: string; reviewOrg: string; carFactorVehicle: string; carFactorFuel: string };

async function caller(identity: unknown) {
  const auth = identity as AppSyncIdentityCognito | null;
  if (!auth?.sub) throw Error('Sign in first.');
  const profile = unwrap(await data.models.UserProfile.get({ userId: auth.sub }), 'Reading profile');
  requireOrganisation(profile);
  if (!profile) throw Error('Create your profile first.');
  return { auth, profile };
}
async function admin(identity: unknown) {
  const who = await caller(identity);
  if (!who.auth.groups?.includes('OrgAdmins')) throw Error('Organisation admin access required.');
  const org = unwrap(await data.models.Organization.get({ id: who.profile.orgId! }), 'Checking admin membership');
  if (!isListedAdmin(who.profile.email, org?.adminEmails)) throw Error('You are not an active admin for this organisation.');
  return who;
}
// Driving distance is the counterfactual car journey, not a claimed transit
// operator distance. Ambiguous geocoding always needs an admin, never a guess.
async function routeKm(from: string, to: string, city: string) {
  if (!env.TRANSIT_PLACE_INDEX || !env.TRANSIT_ROUTE_CALCULATOR) return 0;
  try {
    const points = await Promise.all([from, to].map(async label => {
      const result = await location.send(new SearchPlaceIndexForTextCommand({ IndexName: env.TRANSIT_PLACE_INDEX, Text: `${label}, ${city}`, FilterCountries: ['IND'], MaxResults: 2 }));
      const first = result.Results?.[0];
      if (!first?.Place?.Geometry?.Point || (first.Relevance ?? 0) < .95 || result.Results?.[1] && (result.Results[1].Relevance ?? 0) >= .9) return null;
      return first.Place.Geometry.Point;
    }));
    if (!points[0] || !points[1]) return 0;
    const route = await location.send(new CalculateRouteCommand({ CalculatorName: env.TRANSIT_ROUTE_CALCULATOR, DeparturePosition: points[0], DestinationPosition: points[1], TravelMode: 'Car', DistanceUnit: 'Kilometers' }));
    const km = route.Summary?.Distance ?? 0;
    return km > 0 && km <= 200 ? km : 0;
  } catch { return 0; } // service/configuration failures require review
}
function award(row: Stored) {
  const now = new Date().toISOString();
  return [
    { Put: { TableName: env.IMPACT_TABLE_NAME, Item: { id: row.rewardId, __typename: 'ImpactEntry', userId: row.userId, orgId: row.orgId, tripId: row.rewardId, month: row.date.slice(0, 7), role: 'TRANSIT', kmShared: row.km, kgCO2: row.kgCO2, rupees: 0, points: row.points, badAirDay: row.badAir, createdAt: now, updatedAt: now }, ConditionExpression: 'attribute_not_exists(id)' } },
    { Update: { TableName: env.PROFILE_TABLE_NAME, Key: { userId: row.userId }, UpdateExpression: 'SET updatedAt = :now ADD totalKm :km, totalKgCO2 :co2, points :points', ConditionExpression: 'orgId = :org AND vehicleType = :vehicle AND fuel = :fuel', ExpressionAttributeValues: { ':now': now, ':km': row.km, ':co2': row.kgCO2, ':points': row.points, ':org': row.orgId, ':vehicle': row.carFactorVehicle, ':fuel': row.carFactorFuel } } },
  ];
}
function visible(row: Stored): TransitClaim {
  const { id, userId, orgId, date, mode, from, to, ticket, time, confidence, expiresAt, status, km, kgCO2, points, badAir, reason } = row;
  return { id, userId, orgId, date, mode, from, to, ticket, time, confidence, expiresAt, status, km, kgCO2, points, badAir, reason };
}
export const submitHandler = async (event: Parameters<Schema['submitTransitClaim']['functionHandler']>[0]) => {
  const { profile, auth } = await caller(event.identity);
  if (env.TRANSIT_OCR_OPT_OUT_CONFIRMED !== 'true') throw Error('Ticket scanning is not enabled until your organiser verifies the OCR provider’s image-retention opt-out.');
  // Check eligibility before incurring OCR cost, without any client profile override.
  transitReward(profile, 'METRO', 1, false);
  const encoded = event.arguments.imageBase64;
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Error('Provide a JPEG or PNG under 450 kB.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES || !(bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) || bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))) throw Error('Only JPEG and PNG ticket images are supported.');
  // Bound OCR charges even for repeated or unreadable tickets. Attempts contain
  // only a per-user/day count and expire with the other metadata.
  try {
    await db.send(new UpdateCommand({ TableName: table, Key: { pk: partition(auth.sub), sk: 'ATTEMPTS' }, UpdateExpression: 'SET expiresAt = :expiry, expiryBucket = :bucket ADD attempts :one', ConditionExpression: 'attribute_not_exists(attempts) OR attempts < :limit', ExpressionAttributeValues: { ':expiry': dayEnd(istDate()), ':bucket': 'transit', ':one': 1, ':limit': 30 } }));
  } catch { bytes.fill(0); throw Error('Ticket scanning limit reached or unavailable. Try later.'); }
  // No S3, image hash, raw OCR persistence, request logging or async OCR jobs.
  let extracted;
  try { extracted = await ocr.send(new DetectDocumentTextCommand({ Document: { Bytes: bytes } })); }
  catch { throw Error('Ticket extraction is unavailable. No claim or image was stored; try later.'); }
  finally { bytes.fill(0); }
  const ticket = parseTicket((extracted.Blocks ?? []).filter(b => b.BlockType === 'LINE' && b.Text).map(b => ({ text: b.Text!, confidence: b.Confidence ?? 0 })));
  todayOnly(ticket.date);
  const pk = partition(auth.sub);
  const id = createHash('sha256').update(duplicateText(ticket)).digest('hex');
  const km = await routeKm(ticket.from, ticket.to, profile.city ?? 'India');
  const badAir = unwrap(await data.models.AqiDaily.get({ city: profile.city ?? '', date: ticket.date }), 'Reading AQI')?.badAir === true;
  for (let attempt = 0; attempt < 4; attempt++) {
    const existing = await db.send(new GetCommand({ TableName: table, Key: { pk, sk: id }, ConsistentRead: true }));
    if (existing.Item) throw Error('You already submitted this ticket today. Duplicate claims do not earn points.');
    const counter = (await db.send(new GetCommand({ TableName: table, Key: { pk, sk: 'COUNT' }, ConsistentRead: true }))).Item;
    const count = Number(counter?.count ?? 0);
    if (count >= 20) throw Error('Daily submission limit reached. Contact your organiser.');
    const review = needsReview(ticket, count, km > 0, env.TRANSIT_AUTO_APPROVE === 'true');
    const reward = km ? transitReward(profile, ticket.mode, km, badAir) : { points: 0, kgCO2: 0 };
    const row: Stored = { ...ticket, ...reward, id, pk, sk: id, userId: auth.sub, orgId: profile.orgId!, expiresAt: dayEnd(ticket.date), expiryBucket: 'transit', reviewOrg: profile.orgId!, rewardId: `transit-${randomUUID()}`, status: review ? 'PENDING' : 'APPROVED', km, badAir, reason: review ? 'Admin review required: extraction confidence, daily threshold, distance or factor verification.' : 'Automatic checks passed.', carFactorVehicle: profile.vehicleType!, carFactorFuel: profile.fuel ?? 'PETROL' };
    if (second() >= row.expiresAt) throw Error('This ticket day has ended.');
    try {
      await db.send(new TransactWriteCommand({ TransactItems: [
        { Put: { TableName: table, Item: row, ConditionExpression: 'attribute_not_exists(pk)' } },
        { Put: { TableName: table, Item: { pk, sk: 'COUNT', count: count + 1, expiresAt: row.expiresAt, expiryBucket: 'transit' }, ConditionExpression: counter ? '#count = :previous' : 'attribute_not_exists(pk)', ...(counter ? { ExpressionAttributeNames: { '#count': 'count' }, ExpressionAttributeValues: { ':previous': count } } : {}) } },
        ...(review ? [] : award(row)),
      ] }));
      return visible(row);
    } catch (error) { if (!(error instanceof TransactionCanceledException)) throw Error('Claim could not be saved. Refresh before retrying.'); }
  }
  throw Error('Another claim or profile change was processed at the same time. Refresh and try again.');
};
export const listHandler = async (event: Parameters<Schema['transitClaimsToday']['functionHandler']>[0]) => {
  const { auth, profile } = event.arguments.reviewQueue ? await admin(event.identity) : await caller(event.identity);
  const rows: TransitClaim[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db.send(new QueryCommand(event.arguments.reviewQueue ? { TableName: table, IndexName: 'review', KeyConditionExpression: 'reviewOrg = :org AND expiresAt > :now', ExpressionAttributeValues: { ':org': profile.orgId, ':now': second() }, ExclusiveStartKey: cursor } : { TableName: table, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': partition(auth.sub) }, ConsistentRead: true, ExclusiveStartKey: cursor }));
    for (const raw of page.Items ?? []) { const row = raw as Stored; if (!['COUNT', 'ATTEMPTS'].includes(row.sk) && row.expiresAt > second() && row.orgId === profile.orgId && (!event.arguments.reviewQueue || row.status === 'PENDING')) rows.push(visible(row)); }
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  return rows;
};
export const reviewHandler = async (event: Parameters<Schema['reviewTransitClaim']['functionHandler']>[0]) => {
  const { auth, profile } = await admin(event.identity);
  const { userId, claimId, approve, verifiedKm, note } = event.arguments;
  if (!/^[a-f0-9]{64}$/.test(claimId)) throw Error('Invalid claim identifier.');
  const key = { pk: partition(userId), sk: claimId };
  const row = (await db.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: true }))).Item as Stored | undefined;
  if (!row || row.orgId !== profile.orgId || row.expiresAt <= second() || row.status !== 'PENDING') throw Error('This pending claim is unavailable or expired.');
  if (userId === auth.sub) throw Error('You cannot review your own claim.');
  if (!note?.trim() || note.length > 300) throw Error('Add a review note (1–300 characters).');
  const claimant = unwrap(await data.models.UserProfile.get({ userId }), 'Checking claimant');
  if (!claimant || claimant.orgId !== row.orgId) throw Error('Claimant organisation changed.');
  const km = approve ? verifiedKm ?? row.km : 0;
  const reward = approve ? transitReward(claimant, row.mode, km, row.badAir) : { points: 0, kgCO2: 0 };
  const updated = { ...row, ...reward, km, status: approve ? 'APPROVED' as const : 'REJECTED' as const, reason: note.trim(), carFactorVehicle: claimant.vehicleType!, carFactorFuel: claimant.fuel ?? 'PETROL', reviewer: auth.sub };
  try {
    await db.send(new TransactWriteCommand({ TransactItems: [
      { Put: { TableName: table, Item: updated, ConditionExpression: '#status = :pending AND expiresAt > :now AND orgId = :org', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':pending': 'PENDING', ':now': second(), ':org': profile.orgId } } },
      ...(approve ? award(updated) : []),
    ] }));
  } catch { throw Error('Review was not confirmed. Refresh; do not approve it again without checking its status.'); }
  return visible(updated);
};
// A single Lambda can handle several explicitly authorized schema operations.
export const handler = async (event: Parameters<typeof submitHandler>[0]) => {
  // Amplify invokes the function with the operation name at the top level of the
  // event; there is no `info` object, whatever the handler type says.
  const { fieldName } = event as unknown as { fieldName?: string };
  switch (fieldName ?? event.info?.fieldName) {
    case 'submitTransitClaim': return submitHandler(event);
    case 'transitClaimsToday': return listHandler(event as unknown as Parameters<typeof listHandler>[0]);
    case 'reviewTransitClaim': return reviewHandler(event as unknown as Parameters<typeof reviewHandler>[0]);
    default: throw Error('Unknown transit operation.');
  }
};
