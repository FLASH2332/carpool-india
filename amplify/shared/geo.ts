import ngeohash from 'ngeohash';

/** A point as stored in Trip.routeLine: [lng, lat]. */
export type LngLat = [number, number];

export const GEOHASH_PRECISION = 6;

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function lineLengthKm(line: LngLat[]): number {
  let km = 0;
  for (let i = 1; i < line.length; i++) km += haversineKm(line[i - 1], line[i]);
  return km;
}

/** Points along the line every `stepKm`, always including the first and last point. */
export function sampleLine(line: LngLat[], stepKm: number): LngLat[] {
  if (line.length === 0) return [];
  const samples: LngLat[] = [line[0]];
  let untilNext = stepKm;
  for (let i = 1; i < line.length; i++) {
    const from = line[i - 1];
    const to = line[i];
    const segKm = haversineKm(from, to);
    let doneKm = 0;
    while (segKm - doneKm >= untilNext) {
      doneKm += untilNext;
      const t = doneKm / segKm;
      samples.push([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
      ]);
      untilNext = stepKm;
    }
    untilNext -= segKm - doneKm;
  }
  samples.push(line[line.length - 1]);
  return samples;
}

export function geohashOf(point: LngLat): string {
  return ngeohash.encode(point[1], point[0], GEOHASH_PRECISION);
}

/** Distinct geohash cells the line passes through, sampled every `stepKm`. */
export function cellsAlongLine(line: LngLat[], stepKm = 0.2): string[] {
  return [...new Set(sampleLine(line, stepKm).map(geohashOf))];
}

/**
 * Parse an AWSJSON routeLine. Accepts the parsed array or a JSON string
 * (including one that was stringified twice by a client).
 */
export function parseRouteLine(value: unknown): LngLat[] {
  let parsed = value;
  for (let i = 0; i < 2 && typeof parsed === 'string'; i++) {
    parsed = JSON.parse(parsed);
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (p): p is LngLat =>
      Array.isArray(p) &&
      p.length >= 2 &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]),
  );
}
