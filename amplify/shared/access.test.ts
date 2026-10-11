import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireActiveDriver, requireSameOrganisation, validatePoint, validateMonth, discoveryTrip } from './access';

test('organisation checks deny missing membership and cross-org callers', () => {
  assert.throws(() => requireSameOrganisation({ orgId: 'college-a' }, { orgId: 'college-b' }));
  assert.throws(() => requireSameOrganisation({ orgId: 'college-a' }, null));
  assert.throws(() => requireSameOrganisation({}, {}));
  assert.doesNotThrow(() => requireSameOrganisation({ orgId: 'college-a' }, { orgId: 'college-a' }));
});
test('location writes reject riders, unrelated drivers and inactive trips', () => {
  const trip = { driverId: 'driver', status: 'ACTIVE' };
  assert.doesNotThrow(() => requireActiveDriver(trip, 'driver'));
  assert.throws(() => requireActiveDriver(trip, 'rider'));
  assert.throws(() => requireActiveDriver({ ...trip, status: 'DONE' }, 'driver'));
  assert.throws(() => requireActiveDriver(null, 'driver'));
  for (const [lat, lng] of [[NaN, 0], [0, Infinity], [91, 0], [0, -181]]) assert.throws(() => validatePoint(lat, lng));
  assert.doesNotThrow(() => validatePoint(12.97, 77.59));
});
test('discovery cannot leak participant identities or live GPS even when present on source trip', () => {
  const safe = discoveryTrip({ id: 'trip', orgId: 'college-a', routeKm: 20, riderIds: ['rider'], lastLat: 12, lastLng: 77, lastAt: 'now' });
  assert.deepEqual(safe, { id: 'trip', orgId: 'college-a', routeKm: 20 });
});
test('leaderboard month arguments reject malformed values', () => {
  for (const month of ['2026-00', '2026-13', '../org-b', '2026-1']) assert.throws(() => validateMonth(month));
  assert.doesNotThrow(() => validateMonth('2026-10'));
});
