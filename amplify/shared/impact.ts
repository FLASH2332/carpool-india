import {
  DEFAULT_MILEAGE_KMPL,
  EMISSION_FACTORS,
  FUEL_PRICE_PER_UNIT,
} from './factors';

export type Vehicle = { vehicleType?: string | null; fuel?: string | null };

const round = (n: number, dp: number) => {
  const m = 10 ** dp;
  return Math.round(n * m) / m;
};

/** kg CO2 per km. No vehicle (or an unknown combination) uses the default petrol hatchback. */
export function emissionFactor(vehicle?: Vehicle | null): number {
  if (!vehicle?.vehicleType || vehicle.vehicleType === 'NONE') {
    return EMISSION_FACTORS.DEFAULT;
  }
  return (
    EMISSION_FACTORS[`${vehicle.vehicleType}_${vehicle.fuel}`] ??
    EMISSION_FACTORS.DEFAULT
  );
}

/** Rupees per fuel unit for a city, falling back to the DEFAULT row. */
export function fuelPrice(city: string | null | undefined, fuel = 'PETROL') {
  const prices = FUEL_PRICE_PER_UNIT[city ?? ''] ?? FUEL_PRICE_PER_UNIT.DEFAULT;
  return prices[fuel] ?? FUEL_PRICE_PER_UNIT.DEFAULT[fuel];
}

/** Equal split of the running cost between the driver and `riders` riders, in rupees. */
export function fuelShare(args: {
  tripKm: number;
  city?: string | null;
  fuel?: string | null;
  mileageKmpl?: number | null;
  riders: number;
}): number {
  const mileage =
    args.mileageKmpl && args.mileageKmpl > 0
      ? args.mileageKmpl
      : DEFAULT_MILEAGE_KMPL;
  const price = fuelPrice(args.city, args.fuel ?? 'PETROL');
  return round((args.tripKm * price) / (mileage * (args.riders + 1)), 2);
}

/** kg CO2 avoided by one rider: their solo trip minus the driver's detour. */
export function co2AvoidedKg(args: {
  riderKm: number;
  rider?: Vehicle | null;
  detourKm: number;
  driver?: Vehicle | null;
}): number {
  return round(
    args.riderKm * emissionFactor(args.rider) -
      args.detourKm * emissionFactor(args.driver),
    3,
  );
}

/** Rupees a rider saves: driving the same km alone (15 km/l petrol) minus their share. */
export function rupeesSaved(args: {
  riderKm: number;
  city?: string | null;
  share: number;
}): number {
  const solo =
    (args.riderKm * fuelPrice(args.city, 'PETROL')) / DEFAULT_MILEAGE_KMPL;
  return round(solo - args.share, 2);
}

export const POINTS_PER_TRIP = { DRIVER: 10, RIDER: 5 } as const;

/** Points for one shared trip; doubled on a bad-air day. */
export function tripPoints(role: 'DRIVER' | 'RIDER', badAir: boolean): number {
  return POINTS_PER_TRIP[role] * (badAir ? 2 : 1);
}

export type TripImpactInput = {
  tripId: string;
  orgId: string;
  city: string;
  /** YYYY-MM of the day the trip ended. */
  month: string;
  tripKm: number;
  badAir: boolean;
  driver: { userId: string; vehicle?: Vehicle | null; mileageKmpl?: number | null };
  riders: {
    userId: string;
    vehicle?: Vehicle | null;
    /** Km the rider was in the car. */
    sharedKm: number;
    /** Extra km the driver drove to pick this rider up. */
    detourKm: number;
  }[];
};

/** One row per person, in the shape of the ImpactEntry model. */
export type ImpactRow = {
  id: string;
  userId: string;
  orgId: string;
  tripId: string;
  month: string;
  role: 'DRIVER' | 'RIDER';
  kmShared: number;
  kgCO2: number;
  rupees: number;
  points: number;
  badAir: boolean;
};

/**
 * Everything `completeTrip` writes for a finished trip. The id is `${tripId}#${userId}`, so
 * retrying the Lambda overwrites the same rows instead of double-counting.
 *
 * Assumptions to confirm with the team:
 * - The driver's CO2 is 0, because the riders' avoided CO2 already counts the trip once.
 * - The driver's rupees are the fuel shares the riders pay.
 */
export function computeTripImpact(input: TripImpactInput) {
  const { driver, riders, badAir } = input;
  const share = fuelShare({
    tripKm: input.tripKm,
    city: input.city,
    fuel: driver.vehicle?.fuel,
    mileageKmpl: driver.mileageKmpl,
    riders: riders.length,
  });
  const base = {
    orgId: input.orgId,
    tripId: input.tripId,
    month: input.month,
    badAir,
  };

  const riderRows: ImpactRow[] = riders.map((r) => ({
    ...base,
    id: `${input.tripId}#${r.userId}`,
    userId: r.userId,
    role: 'RIDER',
    kmShared: r.sharedKm,
    kgCO2: co2AvoidedKg({
      riderKm: r.sharedKm,
      rider: r.vehicle,
      detourKm: r.detourKm,
      driver: driver.vehicle,
    }),
    rupees: rupeesSaved({ riderKm: r.sharedKm, city: input.city, share }),
    points: tripPoints('RIDER', badAir),
  }));
  const driverRow: ImpactRow = {
    ...base,
    id: `${input.tripId}#${driver.userId}`,
    userId: driver.userId,
    role: 'DRIVER',
    kmShared: input.tripKm,
    kgCO2: 0,
    rupees: round(share * riders.length, 2),
    points: tripPoints('DRIVER', badAir),
  };

  return {
    /** What each rider pays the driver, for the UPI link. */
    share,
    entries: [driverRow, ...riderRows],
  };
}
