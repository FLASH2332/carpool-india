/** CPCB National AQI categories. `badAir` is the spec's "Poor (201+)" threshold for E2. */
export const AQI_CATEGORIES = [
  { max: 50, category: 'Good', color: '#00b050' },
  { max: 100, category: 'Satisfactory', color: '#92d050' },
  { max: 200, category: 'Moderate', color: '#ffd400' },
  { max: 300, category: 'Poor', color: '#ff9900' },
  { max: 400, category: 'Very Poor', color: '#ff0000' },
  { max: Infinity, category: 'Severe', color: '#c00000' },
] as const;

export const BAD_AIR_THRESHOLD = 201;

export function aqiCategory(aqi: number) {
  return AQI_CATEGORIES.find((c) => aqi <= c.max) ?? AQI_CATEGORIES[5];
}

export const isBadAir = (aqi: number) => aqi >= BAD_AIR_THRESHOLD;

/**
 * CPCB sub-index breakpoints as [concentration, index] points, joined by straight lines.
 * Units: CO in mg/m3, everything else ug/m3. Above the last point the last segment is
 * extended and the result is capped at 500.
 * TODO: check these against the CPCB technical note before the demo.
 */
const BREAKPOINTS: Record<string, [number, number][]> = {
  'PM2.5': [[0, 0], [30, 50], [60, 100], [90, 200], [120, 300], [250, 400]],
  PM10: [[0, 0], [50, 50], [100, 100], [250, 200], [350, 300], [430, 400]],
  NO2: [[0, 0], [40, 50], [80, 100], [180, 200], [280, 300], [400, 400]],
  SO2: [[0, 0], [40, 50], [80, 100], [380, 200], [800, 300], [1600, 400]],
  CO: [[0, 0], [1, 50], [2, 100], [10, 200], [17, 300], [34, 400]],
  O3: [[0, 0], [50, 50], [100, 100], [168, 200], [208, 300], [748, 400]],
  NH3: [[0, 0], [200, 50], [400, 100], [800, 200], [1200, 300], [1800, 400]],
};

/** Feed names -> keys above. */
const POLLUTANT_ALIASES: Record<string, string> = { OZONE: 'O3' };

export function subIndex(pollutant: string, concentration: number) {
  const key = POLLUTANT_ALIASES[pollutant] ?? pollutant;
  const points = BREAKPOINTS[key];
  if (!points || !Number.isFinite(concentration) || concentration < 0) {
    return null;
  }
  let i = points.findIndex(([c]) => concentration <= c);
  if (i === 0) i = 1;
  if (i === -1) i = points.length - 1;
  const [c0, i0] = points[i - 1];
  const [c1, i1] = points[i];
  const value = i0 + ((i1 - i0) / (c1 - c0)) * (concentration - c0);
  return Math.min(500, Math.round(value));
}

/**
 * Station AQI = the worst sub-index. CPCB requires at least three pollutants, one of
 * them PM2.5 or PM10; otherwise there is no AQI.
 */
export function stationAqi(readings: Record<string, number>) {
  const subs = Object.entries(readings)
    .map(([p, c]) => [p, subIndex(p, c)] as const)
    .filter((s): s is readonly [string, number] => s[1] !== null);
  const hasPm = subs.some(([p]) => p === 'PM2.5' || p === 'PM10');
  if (subs.length < 3 || !hasPm) return null;
  return Math.max(...subs.map(([, v]) => v));
}

/** Today's date in India, YYYY-MM-DD (the AqiDaily sort key). */
export const istDate = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);

type AqiRowGetter = (
  city: string,
  date: string,
) => Promise<{ badAir?: boolean | null } | null | undefined>;

/**
 * Whether `city` has a bad-air day (E2). `getRow` reads the AqiDaily row, so the caller
 * can use whichever data client it has; a missing row or flag counts as not bad air.
 */
export async function isBadAirDay(
  getRow: AqiRowGetter,
  city: string | null | undefined,
  date = istDate(),
) {
  if (!city) return false;
  return (await getRow(city, date))?.badAir === true;
}
