import {
  DEFAULT_MILEAGE_KMPL,
  EMISSION_FACTORS,
  FUEL_PRICE_PER_UNIT,
} from './factors';

export const RIDER_POINTS = 5;
export const DRIVER_POINTS_PER_RIDER = 10;
export const BAD_AIR_MULTIPLIER = 2;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's date in India as YYYY-MM-DD. */
export function istDate(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

type Vehicle = {
  vehicleType?: string | null;
  fuel?: string | null;
  mileageKmpl?: number | null;
};

/** kg CO2 per km the person would emit driving alone; DEFAULT if they have no vehicle. */
export function emissionFactor(vehicle: Vehicle | null | undefined): number {
  const key = `${vehicle?.vehicleType}_${vehicle?.fuel}`;
  return EMISSION_FACTORS[key] ?? EMISSION_FACTORS.DEFAULT;
}

/** Rupees per unit of the driver's fuel in the given city. */
export function fuelPrice(
  city: string | null | undefined,
  fuel: string | null | undefined,
): number {
  const prices = FUEL_PRICE_PER_UNIT[city ?? ''] ?? FUEL_PRICE_PER_UNIT.DEFAULT;
  const key = fuel ?? 'PETROL';
  return prices[key] ?? FUEL_PRICE_PER_UNIT.DEFAULT[key];
}

export type RiderImpact = {
  kgCO2: number;
  share: number;
  rupeesSaved: number;
  points: number;
};

/** One rider's impact for a completed trip. Money and CO2 are rounded to 2 decimals. */
export function riderImpact(input: {
  sharedKm: number;
  riders: number;
  price: number;
  driverMileageKmpl?: number | null;
  rider: Vehicle | null | undefined;
  badAir: boolean;
}): RiderImpact {
  const { sharedKm, riders, price, rider, badAir } = input;
  const driverMileage = input.driverMileageKmpl || DEFAULT_MILEAGE_KMPL;
  const riderMileage = rider?.mileageKmpl || DEFAULT_MILEAGE_KMPL;

  const share = (sharedKm * price) / driverMileage / (riders + 1);
  const costAlone = (sharedKm * price) / riderMileage;
  return {
    kgCO2: round2(sharedKm * emissionFactor(rider)),
    share: round2(share),
    rupeesSaved: round2(Math.max(0, costAlone - share)),
    points: RIDER_POINTS * (badAir ? BAD_AIR_MULTIPLIER : 1),
  };
}

export function driverPoints(riders: number, badAir: boolean): number {
  return DRIVER_POINTS_PER_RIDER * riders * (badAir ? BAD_AIR_MULTIPLIER : 1);
}

/** UPI deep link for paying the driver, or null if the driver has no VPA. */
export function upiLink(
  upiVpa: string | null | undefined,
  name: string | null | undefined,
  amount: number,
): string | null {
  if (!upiVpa) return null;
  const pa = encodeURIComponent(upiVpa).replace(/%40/g, '@');
  const pn = encodeURIComponent(name ?? '');
  return `upi://pay?pa=${pa}&pn=${pn}&am=${amount.toFixed(2)}&cu=INR`;
}
