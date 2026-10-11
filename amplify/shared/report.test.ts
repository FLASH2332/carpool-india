import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrgReportCsv } from './report';
test('organisation reports include approved transit without repeating driver totals', () => {
  const csv = buildOrgReportCsv('College', '2026-10', [
    { role: 'RIDER', userId: 'a', tripId: 'ride', kmShared: 5, kgCO2: .5 },
    { role: 'DRIVER', userId: 'b', tripId: 'ride', kmShared: 5, kgCO2: .5 },
    { role: 'TRANSIT', userId: 'a', tripId: 'transit-1', kmShared: 10, kgCO2: 1.1 },
  ]);
  assert.ok(csv.endsWith('College,2026-10,2,2,15,1.6,2,1\r\n'));
  assert.ok(csv.startsWith('organisation,month,employees_pooling,trips_shared,km_shared,kg_co2_avoided,cars_kept_off_road,transit_journeys'));
});
