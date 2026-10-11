import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/request-seat';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

/** True if the rider already has a PENDING or ACCEPTED request on the trip. */
async function hasLiveRequest(tripId: string, riderId: string): Promise<boolean> {
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.RideRequest.listRideRequestByTripId(
      { tripId },
      { filter: { riderId: { eq: riderId } }, nextToken },
    );
    const requests = unwrap(page, 'Reading existing requests') ?? [];
    if (requests.some((r) => r.status === 'PENDING' || r.status === 'ACCEPTED')) {
      return true;
    }
    nextToken = page.nextToken;
  } while (nextToken);
  return false;
}

export const handler: Schema['requestSeat']['functionHandler'] = async (
  event,
) => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw new Error('Not signed in.');
  const riderId = identity.sub;
  const { tripId, ...places } = event.arguments;

  const rider = unwrap(
    await client.models.UserProfile.get({ userId: riderId }),
    'Reading profile',
  );
  if (!rider?.orgId) {
    throw new Error('You have no organisation yet; call ensureProfile first.');
  }

  const trip = unwrap(
    await client.models.Trip.get({ id: tripId }),
    'Reading trip',
  );
  if (!trip) throw new Error(`Trip ${tripId} not found.`);
  if (trip.orgId !== rider.orgId) {
    throw new Error('This trip belongs to another organisation.');
  }
  if (trip.driverId === riderId) {
    throw new Error('You cannot request a seat on your own trip.');
  }
  if (trip.status !== 'OPEN') {
    throw new Error(`This trip is ${trip.status} and not open for requests.`);
  }
  if ((trip.seatsLeft ?? 0) <= 0) throw new Error('This trip is full.');
  if (await hasLiveRequest(tripId, riderId)) {
    throw new Error('You already have a request on this trip.');
  }

  return unwrap(
    await client.models.RideRequest.create({
      tripId,
      riderId,
      driverId: trip.driverId,
      ...places,
      status: 'PENDING',
    }),
    'Creating ride request',
  );
};
