import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cityAqiFromRecords, fetchCityAqi } from './fetch';
import { istDate } from '../../../amplify/shared/aqi';

const station = (name: string, pm25: string, pm10: string, no2: string) => [
  { station: name, pollutant_id: 'PM2.5', pollutant_avg: pm25 },
  { station: name, pollutant_id: 'PM10', pollutant_avg: pm10 },
  { station: name, pollutant_id: 'NO2', pollutant_avg: no2 },
];

test('city AQI is the mean of station AQIs, skipping NA values and incomplete stations', () => {
  const records = [
    ...station('A', '105', '100', '40'), // 250
    ...station('B', '30', '50', '40'), // 50
    { station: 'C', pollutant_id: 'PM2.5', pollutant_avg: 'NA' },
    { station: 'C', pollutant_id: 'NO2', pollutant_avg: '10' },
  ];
  assert.equal(cityAqiFromRecords(records), 150);
});

test('city AQI is null when no station qualifies', () => {
  assert.equal(cityAqiFromRecords([]), null);
});

test('fetchCityAqi queries the city and parses the records', async () => {
  let requested = '';
  const fakeFetch = (async (url: URL) => {
    requested = String(url);
    return new Response(JSON.stringify({ records: station('A', '105', '100', '40') }));
  }) as unknown as typeof fetch;
  assert.equal(await fetchCityAqi('Delhi', 'KEY', fakeFetch), 250);
  assert.match(requested, /filters%5Bcity%5D=Delhi/);
  assert.match(requested, /api-key=KEY/);
});

test('istDate rolls over at 18:30 UTC', () => {
  assert.equal(istDate(new Date('2026-10-10T18:29:00Z')), '2026-10-10');
  assert.equal(istDate(new Date('2026-10-10T18:30:00Z')), '2026-10-11');
});
