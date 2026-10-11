import { lineString, nearestPointOnLine, point } from '@turf/turf';
import type { LngLat } from './geo';

export const MAX_WALK_KM = 1;

export type RouteMatch = {
  walkKmToPickup: number;
  walkKmFromDrop: number;
  /** Length of the route between the points nearest to pickup and drop. */
  sharedKm: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Match a rider's pickup and drop against a driver's route. Returns null unless
 * both are within MAX_WALK_KM of the route and the pickup comes before the drop
 * in the direction of travel.
 */
export function matchRoute(
  routeLine: LngLat[],
  pickup: LngLat,
  drop: LngLat,
): RouteMatch | null {
  if (routeLine.length < 2) return null;
  const line = lineString(routeLine);
  const options = { units: 'kilometers' } as const;
  const nearPickup = nearestPointOnLine(line, point(pickup), options).properties;
  const nearDrop = nearestPointOnLine(line, point(drop), options).properties;

  if (nearPickup.dist > MAX_WALK_KM || nearDrop.dist > MAX_WALK_KM) return null;
  if (nearPickup.location >= nearDrop.location) return null;

  return {
    walkKmToPickup: round2(nearPickup.dist),
    walkKmFromDrop: round2(nearDrop.dist),
    sharedKm: round2(nearDrop.location - nearPickup.location),
  };
}
