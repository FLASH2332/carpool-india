import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/search-trips';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';
import { type LngLat, cellAndNeighbours, parseRouteLine } from '../../shared/geo';
import { matchRoute } from '../../shared/match';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

const DEFAULT_WINDOW_MINUTES = 30;

/** Ids of trips in the caller's org with a TripCell in `cell` departing in the window. */
async function tripIdsInCell(
  cell: string,
  from: string,
  to: string,
  orgId: string,
): Promise<string[]> {
  const tripIds: string[] = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.TripCell.listTripCellByCellAndDepartAt(
      { cell, departAt: { between: [from, to] } },
      { filter: { orgId: { eq: orgId } }, nextToken },
    );
    for (const item of unwrap(page, 'Searching trip cells') ?? []) {
      if (item.tripId) tripIds.push(item.tripId);
    }
    nextToken = page.nextToken;
  } while (nextToken);
  return tripIds;
}

export const handler: Schema['searchTrips']['functionHandler'] = async (
  event,
) => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw new Error('Not signed in.');
  const callerId = identity.sub;
  const args = event.arguments;

  const caller = unwrap(
    await client.models.UserProfile.get({ userId: callerId }),
    'Reading profile',
  );
  const orgId = caller?.orgId;
  if (!orgId) {
    throw new Error('You have no organisation yet; call ensureProfile first.');
  }

  const pickup: LngLat = [args.pickupLng, args.pickupLat];
  const drop: LngLat = [args.dropLng, args.dropLat];
  const departMs = new Date(args.departAt).getTime();
  if (Number.isNaN(departMs)) throw new Error('departAt is not a valid date-time.');
  const windowMs = (args.windowMinutes ?? DEFAULT_WINDOW_MINUTES) * 60_000;
  const from = new Date(departMs - windowMs).toISOString();
  const to = new Date(departMs + windowMs).toISOString();

  const idsPerCell = await Promise.all(
    cellAndNeighbours(pickup).map((cell) => tripIdsInCell(cell, from, to, orgId)),
  );
  const tripIds = [...new Set(idsPerCell.flat())];

  const trips = await Promise.all(
    tripIds.map(async (id) =>
      unwrap(await client.models.Trip.get({ id }), 'Reading trip'),
    ),
  );

  const matches = [];
  for (const trip of trips) {
    if (
      !trip ||
      trip.status !== 'OPEN' ||
      (trip.seatsLeft ?? 0) <= 0 ||
      trip.orgId !== orgId ||
      !trip.driverId ||
      trip.driverId === callerId
    ) {
      continue;
    }
    const match = matchRoute(parseRouteLine(trip.routeLine), pickup, drop);
    if (match) matches.push({ trip, driverId: trip.driverId, ...match });
  }

  const driverIds = [...new Set(matches.map((m) => m.driverId))];
  const drivers = new Map(
    await Promise.all(
      driverIds.map(
        async (userId) =>
          [
            userId,
            unwrap(
              await client.models.UserProfile.get({ userId }),
              'Reading driver profile',
            ),
          ] as const,
      ),
    ),
  );

  return matches
    .map(({ trip, driverId, walkKmToPickup, sharedKm }) => ({
      trip,
      driverName: drivers.get(driverId)?.name ?? null,
      vehicleType: drivers.get(driverId)?.vehicleType ?? null,
      walkKmToPickup,
      sharedKm,
    }))
    .sort((a, b) => a.walkKmToPickup - b.walkKmToPickup);
};
