import "./configure";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../amplify/data/resource";
import type { Profile, Store, Trip } from "./domain";
import { makeLeaderboard } from "./rewards";

export const client = generateClient<Schema>();
function checked<T>(result: { data?: T; errors?: { message: string }[] }): T {
  if (result.errors?.length)
    throw Error(result.errors.map((e) => e.message).join("; "));
  return result.data as T;
}
export async function loadCloud(userId: string): Promise<Store> {
  const page = async (
    fetch: (
      token?: string,
    ) => Promise<{
      data: unknown[];
      nextToken?: string | null;
      errors?: { message: string }[];
    }>,
  ) => {
    const rows: unknown[] = [];
    let token: string | undefined;
    do {
      const result = await fetch(token);
      rows.push(...checked(result));
      token = result.nextToken ?? undefined;
    } while (token);
    return rows;
  };
  // Do not download all profiles or ride requests: current backend permits broad reads.
  const profile = await client.mutations.ensureProfile({});
  const own = checked(profile);
  if (!own?.orgId) throw Error("Your organisation could not be assigned. Contact your team organiser.");
  const [trips, requests, impacts, aqis] = await Promise.all([
    page((nextToken) =>
      client.models.Trip.list({
        nextToken,
        filter: { driverId: { eq: userId }, status: { ne: "CANCELLED" } },
      }),
    ),
    page((nextToken) =>
      client.models.RideRequest.list({
        nextToken,
        filter: {
          or: [{ riderId: { eq: userId } }, { driverId: { eq: userId } }],
        },
      }),
    ),
    page((nextToken) =>
      client.models.ImpactEntry.list({
        nextToken,
        filter: { userId: { eq: userId } },
      }),
    ),
    page((nextToken) => client.models.AqiDaily.list({ nextToken })),
  ]);
  const store = {
    profiles: own ? [{ ...own, name: own.name ?? "", city: own.city ?? "Bengaluru", vehicleType: own.vehicleType ?? "NONE", fuel: own.fuel ?? "PETROL", mileageKmpl: own.mileageKmpl ?? 15, seats: own.seats ?? 1 }] : [],
    trips,
    requests,
    impacts,
    aqis,
  } as Store;
  // The backend scaffold permits nullable fields; keep incomplete records out of ride cards.
  store.trips = store.trips.filter(t => t.id && t.startLabel && t.endLabel && t.departAt).map(t => ({ ...t, routeKm: t.routeKm ?? 0, shareRupees: t.shareRupees ?? 0, seatsLeft: t.seatsLeft ?? 0 }));
  store.impacts = store.impacts.map(i => ({ ...i, kmShared: i.kmShared ?? 0, kgCO2: i.kgCO2 ?? 0, rupees: i.rupees ?? 0, points: i.points ?? 0 }));
  // Riders need the referenced trips even though discovery is handled by searchTrips.
  const missingIds = [...new Set(store.requests.map(r => r.tripId))].filter(id => !store.trips.some(t => t.id === id));
  const referenced = await Promise.all(missingIds.map(id => client.models.Trip.get({ id })));
  for (const result of referenced) {
    const trip = checked(result);
    if (trip?.id && trip.startLabel && trip.endLabel && trip.departAt)
      store.trips.push({ ...trip, routeKm: trip.routeKm ?? 0, shareRupees: trip.shareRupees ?? 0, seatsLeft: trip.seatsLeft ?? 0 } as Store["trips"][number]);
  }
  return store;
}
export async function saveCloudProfile(profile: Profile) {
  // Organisation and impact totals are server-managed; never send them in an owner update.
  const {
    userId,
    name,
    phone,
    vehicleType,
    fuel,
    mileageKmpl,
    seats,
    plate,
    upiVpa,
  } = profile;
  const input = {
    userId,
    name,
    phone,
    vehicleType,
    fuel,
    mileageKmpl,
    seats,
    plate,
    upiVpa,
  };
  const ensured = checked(await client.mutations.ensureProfile({ name, phone }));
  if (!ensured?.orgId) throw Error("Profile setup did not return an organisation.");
  checked(await client.models.UserProfile.update(input));
}
export function subscribeCloud(
  userId: string,
  tripIds: string[],
  refresh: () => void,
  onError: (error: unknown) => void,
) {
  const subscriptions = [
    client.models.Trip.onUpdate({ filter: { or: [{ driverId: { eq: userId } }, ...tripIds.map(id => ({ id: { eq: id } }))] } }).subscribe({ next: refresh, error: onError }),
    client.models.Trip.onCreate({ filter: { driverId: { eq: userId } } }).subscribe({ next: refresh, error: onError }),
    client.models.RideRequest.onCreate({ filter: { driverId: { eq: userId } } }).subscribe({ next: refresh, error: onError }),
    client.models.RideRequest.onUpdate({ filter: { or: [{ riderId: { eq: userId } }, { driverId: { eq: userId } }] } }).subscribe({ next: refresh, error: onError }),
    client.models.ImpactEntry.onCreate({ filter: { userId: { eq: userId } } }).subscribe({ next: refresh, error: onError }),
    client.models.AqiDaily.onUpdate().subscribe({ next: refresh, error: onError }),
  ];
  return () => subscriptions.forEach((s) => s.unsubscribe());
}
export const workflowMissing =
  "Route search and publishing need the real map and autocomplete components. Explore demo mode while that integration is prepared.";

export async function respondCloud(requestId: string, accept: boolean) {
  const request = checked(await client.mutations.respondToRequest({ requestId, accept }));
  if (!request) throw Error("The backend did not confirm the response. Refresh before trying again.");
}
export type RideSearch = { pickupLat: number; pickupLng: number; dropLat: number; dropLng: number; departAt: string };
export async function searchCloud(places: RideSearch) {
  return checked(await client.queries.searchTrips(places));
}
export async function requestCloud(trip: Trip, places: Omit<RideSearch, "departAt"> & { pickupLabel: string; dropLabel: string; sharedKm: number }) {
  const request = checked(await client.mutations.requestSeat({ tripId: trip.id, ...places }));
  if (!request) throw Error("The backend did not confirm the seat request. Refresh before trying again.");
}
export async function publishCloud(trip: Trip, routeLine: [number, number][]) {
  if (routeLine.length < 2 || !routeLine.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90))
    throw Error("Select a valid driving route before publishing.");
  const { id, driverId, startLabel, endLabel, startLat, startLng, endLat, endLng, departAt, seatsTotal, routeKm } = trip;
  const draft = checked(await client.models.Trip.create({ id, driverId, startLabel, endLabel, startLat, startLng, endLat, endLng, departAt, seatsTotal, routeKm, routeLine: JSON.stringify(routeLine), status: "DRAFT" }));
  if (!draft) throw Error("The draft trip was not confirmed.");
  const published = checked(await client.mutations.indexTrip({ tripId: draft.id }));
  if (!published) throw Error("Draft saved, but publishing was not confirmed. Refresh before retrying.");
  return published;
}
export async function startCloud(tripId: string) {
  const trip = checked(await client.mutations.startTrip({ tripId }));
  if (!trip) throw Error("The backend did not confirm the start. Refresh before trying again.");
}
export async function completeCloud(tripId: string) {
  // The current backend cannot recover partial completion: never retry automatically.
  try {
    const completion = checked(await client.mutations.completeTrip({ tripId }));
    if (!completion) throw Error("No completion result returned.");
    return completion;
  } catch (error) {
    throw Error(`${error instanceof Error ? error.message : "Trip completion failed."} Refresh and ask your organiser to check the trip before retrying; some impact records may already have been written.`);
  }
}

export async function loadLeaderboard(orgId: string, month: string) {
  const impacts = [];
  let nextToken: string | null | undefined;
  do {
    const result = await client.models.ImpactEntry.listImpactEntryByOrgIdAndMonth(
      { orgId, month: { eq: month } },
      { nextToken, selectionSet: ["userId", "tripId", "month", "kgCO2", "points"] },
    );
    impacts.push(...checked(result));
    nextToken = result.nextToken;
  } while (nextToken);
  const memberIds = [...new Set(impacts.map(i => i.userId).filter((id): id is string => !!id))];
  // Only fetch display names, never phone, email or UPI for the leaderboard.
  const members = await Promise.all(memberIds.map(async userId => {
    const result = checked(await client.models.UserProfile.get({ userId }, { selectionSet: ["userId", "name", "orgId"] }));
    return result?.orgId === orgId ? { userId, name: result.name || "Community member" } : null;
  }));
  return makeLeaderboard(impacts.filter(i => i.userId && i.tripId && i.month).map(i => ({ userId: i.userId!, tripId: i.tripId!, month: i.month!, kgCO2: i.kgCO2 ?? 0, points: i.points ?? 0 })), members.filter((m): m is { userId: string; name: string } => !!m), month);
}
