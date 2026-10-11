import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/complete-trip';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';
import {
  driverPoints,
  fuelPrice,
  istDate,
  riderImpact,
  round2,
  upiLink,
} from '../../shared/impact';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

type Totals = { kmShared: number; kgCO2: number; rupees: number; points: number };

async function acceptedRequests(tripId: string) {
  const accepted = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.RideRequest.listRideRequestByTripId(
      { tripId },
      { filter: { status: { eq: 'ACCEPTED' } }, nextToken },
    );
    accepted.push(...(unwrap(page, 'Reading ride requests') ?? []));
    nextToken = page.nextToken;
  } while (nextToken);
  return accepted;
}

async function getProfile(userId: string) {
  return unwrap(
    await client.models.UserProfile.get({ userId }),
    'Reading profile',
  );
}

/** Add a trip's impact to the user's running totals. */
async function addToTotals(userId: string, add: Totals): Promise<void> {
  const profile = await getProfile(userId);
  if (!profile) return;
  unwrap(
    await client.models.UserProfile.update({
      userId,
      totalKm: round2((profile.totalKm ?? 0) + add.kmShared),
      totalKgCO2: round2((profile.totalKgCO2 ?? 0) + add.kgCO2),
      totalRupees: round2((profile.totalRupees ?? 0) + add.rupees),
      points: (profile.points ?? 0) + add.points,
    }),
    'Updating profile totals',
  );
}

export const handler: Schema['completeTrip']['functionHandler'] = async (
  event,
) => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw new Error('Not signed in.');
  const driverId = identity.sub;
  const { tripId } = event.arguments;

  const trip = unwrap(
    await client.models.Trip.get({ id: tripId }),
    'Reading trip',
  );
  if (!trip) throw new Error(`Trip ${tripId} not found.`);
  if (trip.driverId !== driverId) {
    throw new Error('Only the driver of this trip can complete it.');
  }
  if (trip.status !== 'ACTIVE') {
    throw new Error(`Trip is ${trip.status}; only an ACTIVE trip can be completed.`);
  }

  // DONE first, so a second call cannot count the same trip twice.
  unwrap(
    await client.models.Trip.update({ id: tripId, status: 'DONE' }),
    'Completing trip',
  );

  const [driver, requests] = await Promise.all([
    getProfile(driverId),
    acceptedRequests(tripId),
  ]);
  const riders = requests.length;
  const driverTotals: Totals = { kmShared: 0, kgCO2: 0, rupees: 0, points: 0 };
  if (riders === 0) return { perRider: [], driverTotals };

  const today = istDate();
  const month = today.slice(0, 7);
  const aqi = trip.city
    ? unwrap(
        await client.models.AqiDaily.get({ city: trip.city, date: today }),
        'Reading air quality',
      )
    : null;
  const badAir = aqi?.badAir === true;
  const price = fuelPrice(trip.city, driver?.fuel);

  const perRider = [];
  for (const request of requests) {
    if (!request.riderId) continue;
    const riderId = request.riderId;
    const sharedKm = request.sharedKm ?? 0;
    const impact = riderImpact({
      sharedKm,
      riders,
      price,
      driverMileageKmpl: driver?.mileageKmpl,
      rider: await getProfile(riderId),
      badAir,
    });

    // Deterministic ids, so a retry overwrites nothing and duplicates nothing.
    unwrap(
      await client.models.ImpactEntry.create({
        id: `${tripId}#${riderId}`,
        userId: riderId,
        orgId: trip.orgId,
        tripId,
        month,
        role: 'RIDER',
        kmShared: sharedKm,
        kgCO2: impact.kgCO2,
        rupees: impact.rupeesSaved,
        points: impact.points,
        badAirDay: badAir,
      }),
      'Writing rider impact',
    );
    await addToTotals(riderId, {
      kmShared: sharedKm,
      kgCO2: impact.kgCO2,
      rupees: impact.rupeesSaved,
      points: impact.points,
    });
    unwrap(
      await client.models.RideRequest.update({ id: request.id, status: 'DONE' }),
      'Closing ride request',
    );

    driverTotals.kmShared = round2(driverTotals.kmShared + sharedKm);
    driverTotals.kgCO2 = round2(driverTotals.kgCO2 + impact.kgCO2);
    driverTotals.rupees = round2(driverTotals.rupees + impact.share);
    perRider.push({
      riderId,
      kgCO2: impact.kgCO2,
      rupeesSaved: impact.rupeesSaved,
      share: impact.share,
      upiLink: upiLink(driver?.upiVpa, driver?.name, impact.share),
    });
  }
  driverTotals.points = driverPoints(perRider.length, badAir);

  unwrap(
    await client.models.ImpactEntry.create({
      id: `${tripId}#${driverId}`,
      userId: driverId,
      orgId: trip.orgId,
      tripId,
      month,
      role: 'DRIVER',
      ...driverTotals,
      badAirDay: badAir,
    }),
    'Writing driver impact',
  );
  await addToTotals(driverId, driverTotals);

  return { perRider, driverTotals };
};
