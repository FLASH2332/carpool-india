import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aqiCategory, isBadAir, isBadAirDay, stationAqi, subIndex } from './aqi';

test('aqiCategory follows the CPCB bands', () => {
  assert.equal(aqiCategory(50).category, 'Good');
  assert.equal(aqiCategory(51).category, 'Satisfactory');
  assert.equal(aqiCategory(200).category, 'Moderate');
  assert.equal(aqiCategory(201).category, 'Poor');
  assert.equal(aqiCategory(320).category, 'Very Poor');
  assert.equal(aqiCategory(401).category, 'Severe');
});

test('bad air starts at Poor (201)', () => {
  assert.equal(isBadAir(200), false);
  assert.equal(isBadAir(201), true);
  assert.equal(isBadAir(320), true);
});

test('subIndex interpolates on breakpoints', () => {
  assert.equal(subIndex('PM2.5', 30), 50);
  assert.equal(subIndex('PM2.5', 105), 250);
  assert.equal(subIndex('PM10', 430), 400);
  assert.equal(subIndex('OZONE', 168), 200);
  assert.equal(subIndex('PM2.5', 1000), 500);
  assert.equal(subIndex('XYZ', 5), null);
});

test('stationAqi takes the worst sub-index and needs 3 pollutants incl. PM', () => {
  assert.equal(stationAqi({ 'PM2.5': 105, PM10: 100, NO2: 40 }), 250);
  assert.equal(stationAqi({ 'PM2.5': 30, NO2: 40 }), null);
  assert.equal(stationAqi({ NO2: 40, SO2: 10, CO: 1 }), null);
});

test('isBadAirDay reads the row for the city and date, and is false when there is none', async () => {
  const rows: Record<string, { badAir: boolean }> = { 'Delhi|2026-10-11': { badAir: true } };
  const get = async (city: string, date: string) => rows[`${city}|${date}`] ?? null;
  assert.equal(await isBadAirDay(get, 'Delhi', '2026-10-11'), true);
  assert.equal(await isBadAirDay(get, 'Delhi', '2026-10-12'), false);
  assert.equal(await isBadAirDay(get, 'Bengaluru', '2026-10-11'), false);
  assert.equal(await isBadAirDay(get, null, '2026-10-11'), false);
});
