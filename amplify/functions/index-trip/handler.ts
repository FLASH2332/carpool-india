import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/index-trip';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';
import {
  DEFAULT_MILEAGE_KMPL,
  FUEL_PRICE_PER_UNIT,
} from '../../shared/factors';
import { cellsAlongLine, lineLengthKm, parseRouteLine } from '../../shared/geo';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

const SAMPLE_STEP_KM = 0.2;
const WRITE_BATCH = 25;

export const handler: Schema['indexTrip']['functionHandler'] = async (event) => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw new Error('Not signed in.');
  const { tripId } = event.arguments;

  const trip = unwrap(
    await client.models.Trip.get({ id: tripId }),
    'Reading trip',
  );
  if (!trip) throw new Error(`Trip ${tripId} not found.`);
  if (trip.driverId !== identity.sub) {
    throw new Error('Only the driver of this trip can publish it.');
  }
  if (trip.status !== 'DRAFT') {
    throw new Error(`Trip is already ${trip.status}; only a DRAFT can be published.`);
  }

  const seatsTotal = trip.seatsTotal ?? 0;
  if (seatsTotal < 1) throw new Error('Trip needs seatsTotal of at least 1.');
  if (!trip.departAt) throw new Error('Trip needs departAt.');
  const routeLine = parseRouteLine(trip.routeLine);
  if (routeLine.length < 2) {
    throw new Error('Trip needs a routeLine with at least 2 [lng, lat] points.');
  }
  const routeKm = trip.routeKm || lineLengthKm(routeLine);

  const driver = unwrap(
    await client.models.UserProfile.get({ userId: identity.sub }),
    'Reading driver profile',
  );
  if (!driver?.orgId) {
    throw new Error('Driver has no organisation yet; call ensureProfile first.');
  }

  const fuel = driver.fuel ?? 'PETROL';
  const prices =
    FUEL_PRICE_PER_UNIT[driver.city ?? ''] ?? FUEL_PRICE_PER_UNIT.DEFAULT;
  const fuelPrice = prices[fuel] ?? FUEL_PRICE_PER_UNIT.DEFAULT[fuel];
  const mileage = driver.mileageKmpl || DEFAULT_MILEAGE_KMPL;
  const shareRupees = Math.round(
    (routeKm * fuelPrice) / mileage / (seatsTotal + 1),
  );

  const cells = cellsAlongLine(routeLine, SAMPLE_STEP_KM);
  for (let i = 0; i < cells.length; i += WRITE_BATCH) {
    await Promise.all(
      cells.slice(i, i + WRITE_BATCH).map(async (cell) => {
        // Deterministic id, so a retry after a partial failure cannot duplicate cells.
        const result = await client.models.TripCell.create({
          id: `${tripId}#${cell}`,
          cell,
          departAt: trip.departAt,
          tripId,
          orgId: driver.orgId,
        });
        const alreadyThere = result.errors?.every((e) =>
          /conditional/i.test(`${e.errorType} ${e.message}`),
        );
        if (!alreadyThere) unwrap(result, 'Writing trip cell');
      }),
    );
  }

  return unwrap(
    await client.models.Trip.update({
      id: tripId,
      orgId: driver.orgId,
      city: driver.city,
      routeKm,
      seatsLeft: seatsTotal,
      shareRupees,
      status: 'OPEN',
    }),
    'Publishing trip',
  );
};
