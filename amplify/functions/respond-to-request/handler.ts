import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/respond-to-request';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TRIP_TABLE_NAME = process.env.TRIP_TABLE_NAME;

/** Atomically add `delta` to Trip.seatsLeft; taking a seat fails when none are left. */
async function changeSeatsLeft(tripId: string, delta: 1 | -1): Promise<void> {
  await dynamo.send(
    new UpdateCommand({
      TableName: TRIP_TABLE_NAME,
      Key: { id: tripId },
      UpdateExpression: 'SET seatsLeft = seatsLeft + :delta, updatedAt = :now',
      ConditionExpression:
        delta < 0 ? 'seatsLeft > :zero' : 'attribute_exists(id)',
      ExpressionAttributeValues: {
        ':delta': delta,
        ':now': new Date().toISOString(),
        ...(delta < 0 && { ':zero': 0 }),
      },
    }),
  );
}

export const handler: Schema['respondToRequest']['functionHandler'] = async (
  event,
) => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw new Error('Not signed in.');
  const { requestId, accept } = event.arguments;

  const request = unwrap(
    await client.models.RideRequest.get({ id: requestId }),
    'Reading ride request',
  );
  if (!request?.tripId) throw new Error(`Ride request ${requestId} not found.`);
  const tripId = request.tripId;

  const trip = unwrap(
    await client.models.Trip.get({ id: tripId }),
    'Reading trip',
  );
  if (!trip) throw new Error(`Trip ${tripId} not found.`);
  if (trip.driverId !== identity.sub) {
    throw new Error('Only the driver of this trip can respond to its requests.');
  }
  if (request.status !== 'PENDING') {
    throw new Error(`This request is already ${request.status}.`);
  }

  if (!accept) {
    return unwrap(
      await client.models.RideRequest.update({ id: requestId, status: 'DECLINED' }),
      'Declining ride request',
    );
  }

  try {
    await changeSeatsLeft(tripId, -1);
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      throw new Error('Trip full: there are no seats left on this trip.');
    }
    throw error;
  }

  try {
    // Through the data client so the rider's onUpdate subscription fires.
    return unwrap(
      await client.models.RideRequest.update({ id: requestId, status: 'ACCEPTED' }),
      'Accepting ride request',
    );
  } catch (error) {
    // Give the seat back if the request could not be marked ACCEPTED.
    await changeSeatsLeft(tripId, 1);
    throw error;
  }
};
