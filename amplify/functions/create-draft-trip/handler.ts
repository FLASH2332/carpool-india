import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/create-draft-trip';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();
import { requireOrganisation, validatePoint } from '../../shared/access';
import { parseRouteLine } from '../../shared/geo';
export const handler: Schema['createDraftTrip']['functionHandler'] = async event => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw Error('Not signed in.');
  const profile = unwrap(await client.models.UserProfile.get({ userId: identity.sub }), 'Reading profile');
  const orgId = requireOrganisation(profile);
  const args = event.arguments;
  validatePoint(args.startLat, args.startLng);
  validatePoint(args.endLat, args.endLng);
  const line = parseRouteLine(args.routeLine);
  if (line.length < 2 || line.length > 5000) throw Error('Select a valid driving route.');
  for (const [lng, lat] of line) validatePoint(lat, lng);
  if (!Number.isFinite(args.routeKm) || args.routeKm <= 0 || args.routeKm > 1000) throw Error('Invalid route distance.');
  if (!Number.isInteger(args.seatsTotal) || args.seatsTotal < 1 || args.seatsTotal > 6 || args.seatsTotal > (profile?.seats ?? 0)) throw Error('Seats exceed vehicle capacity.');
  if (!profile?.vehicleType || profile.vehicleType === 'NONE') throw Error('Save your vehicle first.');
  if (!Number.isFinite(Date.parse(args.departAt)) || Date.parse(args.departAt) <= Date.now()) throw Error('Departure must be in the future.');
  if (!args.startLabel.trim() || !args.endLabel.trim() || args.startLabel.length > 200 || args.endLabel.length > 200) throw Error('Invalid place labels.');
  return unwrap(await client.models.Trip.create({
    ...args, routeLine: JSON.stringify(line), departAt: new Date(args.departAt).toISOString(),
    driverId: identity.sub, orgId, city: profile?.city, status: 'DRAFT', riderIds: [], seatsLeft: 0,
  }), 'Creating draft');
};
