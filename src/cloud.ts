import "./configure";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../amplify/data/resource";
import type { Profile, Store } from "./domain";

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
  const [profile, trips, requests, impacts, aqis] = await Promise.all([
    client.models.UserProfile.get({ userId }),
    page((nextToken) =>
      client.models.Trip.list({
        nextToken,
        filter: { status: { ne: "CANCELLED" } },
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
  const own = checked(profile);
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
  return store;
}
export async function saveCloudProfile(profile: Profile, exists: boolean) {
  // Organisation and impact totals are server-managed; never send them in an owner update.
  const {
    userId,
    name,
    email,
    phone,
    city,
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
    email,
    phone,
    city,
    vehicleType,
    fuel,
    mileageKmpl,
    seats,
    plate,
    upiVpa,
  };
  checked(
    await (exists
      ? client.models.UserProfile.update(input)
      : client.models.UserProfile.create(input)),
  );
}
export function subscribeCloud(
  refresh: () => void,
  onError: (error: unknown) => void,
) {
  const subscriptions = [
    client.models.Trip.onUpdate().subscribe({ next: refresh, error: onError }),
    client.models.Trip.onCreate().subscribe({ next: refresh, error: onError }),
    client.models.RideRequest.onCreate().subscribe({ next: refresh, error: onError }),
    client.models.RideRequest.onUpdate().subscribe({ next: refresh, error: onError }),
    client.models.ImpactEntry.onCreate().subscribe({ next: refresh, error: onError }),
    client.models.AqiDaily.onUpdate().subscribe({ next: refresh, error: onError }),
  ];
  return () => subscriptions.forEach((s) => s.unsubscribe());
}
export const workflowMissing =
  "Flash’s deployed schema does not yet expose the ride workflow Lambdas. See docs/BACKEND_HANDOFF.md. You can try the full flow in demo mode.";
