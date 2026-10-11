import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/start-trip';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

export const handler: Schema['startTrip']['functionHandler'] = async (event) => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw new Error('Not signed in.');
  const { tripId } = event.arguments;

  const trip = unwrap(
    await client.models.Trip.get({ id: tripId }),
    'Reading trip',
  );
  if (!trip) throw new Error(`Trip ${tripId} not found.`);
  if (trip.driverId !== identity.sub) {
    throw new Error('Only the driver of this trip can start it.');
  }
  if (trip.status !== 'OPEN') {
    throw new Error(`Trip is ${trip.status}; only an OPEN trip can be started.`);
  }

  return unwrap(
    await client.models.Trip.update({ id: tripId, status: 'ACTIVE' }),
    'Starting trip',
  );
};
