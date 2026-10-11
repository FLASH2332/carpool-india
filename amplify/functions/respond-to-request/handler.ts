import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/respond-to-request';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';
import { requireSameOrganisation } from '../../shared/access';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: Schema['respondToRequest']['functionHandler'] = async event => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw Error('Not signed in.');
  const { requestId, accept } = event.arguments;
  const request = unwrap(await client.models.RideRequest.get({ id: requestId }), 'Reading request');
  if (!request?.tripId || !request.riderId) throw Error('Request not found.');
  const trip = unwrap(await client.models.Trip.get({ id: request.tripId }), 'Reading trip');
  if (!trip || trip.driverId !== identity.sub || request.driverId !== identity.sub || request.riderId === identity.sub) throw Error('Access denied.');
  if (request.status !== 'PENDING' || trip.status !== 'OPEN') throw Error('Request or trip is no longer open.');
  const [driver, rider] = await Promise.all([
    client.models.UserProfile.get({ userId: identity.sub }),
    client.models.UserProfile.get({ userId: request.riderId }),
  ]);
  requireSameOrganisation(trip, unwrap(driver, 'Reading driver'));
  requireSameOrganisation(trip, unwrap(rider, 'Reading rider'));
  const now = new Date().toISOString();
  // Grant access, take a seat and transition the request in one conditional transaction.
  // A repeated request cannot decrement seats or duplicate participant membership.
  try {
    await dynamo.send(new TransactWriteCommand({
      TransactItems: [
        { Update: {
          TableName: process.env.REQUEST_TABLE_NAME, Key: { id: requestId },
          UpdateExpression: 'SET #status = :new, updatedAt = :now',
          ConditionExpression: '#status = :pending AND driverId = :driver AND riderId = :rider AND tripId = :trip',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':new': accept ? 'ACCEPTED' : 'DECLINED', ':pending': 'PENDING', ':driver': identity.sub, ':rider': request.riderId, ':trip': trip.id, ':now': now },
        } },
        accept ? { Update: {
          TableName: process.env.TRIP_TABLE_NAME, Key: { id: trip.id },
          UpdateExpression: 'SET seatsLeft = seatsLeft - :one, riderIds = list_append(if_not_exists(riderIds, :empty), :riders), updatedAt = :now',
          ConditionExpression: '#status = :open AND seatsLeft > :zero AND driverId = :driver AND orgId = :org AND (attribute_not_exists(riderIds) OR NOT contains(riderIds, :rider))',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':open': 'OPEN', ':one': 1, ':zero': 0, ':driver': identity.sub, ':org': trip.orgId, ':rider': request.riderId, ':empty': [], ':riders': [request.riderId], ':now': now },
        } } : { ConditionCheck: {
          TableName: process.env.TRIP_TABLE_NAME, Key: { id: trip.id },
          ConditionExpression: '#status = :open AND driverId = :driver AND orgId = :org',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':open': 'OPEN', ':driver': identity.sub, ':org': trip.orgId },
        } },
      ],
    }));
  } catch (error) {
    if (error instanceof TransactionCanceledException) throw Error('The trip or request changed, or no seat remains. Refresh before responding again.');
    throw error;
  }
  // Touch through AppSync for subscriptions, without reasserting status after a concurrent completion.
  // Notification failure must not roll back or repeat the committed acceptance.
  try {
    return unwrap(await client.models.RideRequest.update({ id: requestId }), 'Refreshing request notification');
  } catch {
    return unwrap(await client.models.RideRequest.get({ id: requestId }), 'Reading committed request');
  }
};
