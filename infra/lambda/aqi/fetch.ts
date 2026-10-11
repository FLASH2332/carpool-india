import { stationAqi } from '../../../amplify/shared/aqi';

// data.gov.in "Real time Air Quality Index from various locations" (CPCB).
// TODO: confirm the resource id and field names once the API key arrives.
const RESOURCE = '3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69';

type Record_ = {
  station?: string;
  pollutant_id?: string;
  pollutant_avg?: string;
};

/** City AQI = mean of the station AQIs computed from pollutant averages, or null if none qualify. */
export function cityAqiFromRecords(records: Record_[]): number | null {
  const byStation = new Map<string, Record<string, number>>();
  for (const r of records) {
    const value = Number(r.pollutant_avg);
    if (!r.station || !r.pollutant_id || !Number.isFinite(value)) continue;
    const readings = byStation.get(r.station) ?? {};
    readings[r.pollutant_id] = value;
    byStation.set(r.station, readings);
  }
  const aqis = [...byStation.values()]
    .map(stationAqi)
    .filter((v): v is number => v !== null);
  if (aqis.length === 0) return null;
  return Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length);
}

export async function fetchCityAqi(
  city: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<number | null> {
  const url = new URL(`https://api.data.gov.in/resource/${RESOURCE}`);
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1000');
  url.searchParams.set('filters[city]', city);
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`data.gov.in ${res.status} for ${city}`);
  const body = (await res.json()) as { records?: Record_[] };
  return cityAqiFromRecords(body.records ?? []);
}
