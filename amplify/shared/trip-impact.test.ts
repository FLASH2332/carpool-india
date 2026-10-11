import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  co2AvoidedKg,
  computeTripImpact,
  emissionFactor,
  fuelShare,
  rupeesSaved,
  tripPoints,
} from './trip-impact';

test('emissionFactor uses the table, and the default for no vehicle', () => {
  assert.equal(emissionFactor({ vehicleType: 'SEDAN', fuel: 'DIESEL' }), 0.141);
  assert.equal(emissionFactor({ vehicleType: 'NONE', fuel: null }), 0.14);
  assert.equal(emissionFactor(null), 0.14);
  assert.equal(emissionFactor({ vehicleType: 'SCOOTER', fuel: 'DIESEL' }), 0.14);
});

// Hand calculation: 20 km, Delhi petrol Rs100/l, 15 km/l, 2 riders.
// share = 20*100 / (15*3) = 44.44; solo = 20*100/15 = 133.33; saved = 88.89.
test('fuelShare and rupeesSaved match the hand calculation', () => {
  const share = fuelShare({
    tripKm: 20,
    city: 'Delhi',
    fuel: 'PETROL',
    mileageKmpl: 15,
    riders: 2,
  });
  assert.equal(share, 44.44);
  assert.equal(rupeesSaved({ riderKm: 20, city: 'Delhi', share }), 88.89);
});

test('fuelShare falls back to default mileage and default city prices', () => {
  assert.equal(
    fuelShare({ tripKm: 15, city: 'Nowhere', mileageKmpl: null, riders: 1 }),
    50,
  );
});

// Rider with no vehicle rides 18 km; driver (petrol sedan) detours 1 km.
// 18*0.14 - 1*0.153 = 2.367.
test('co2AvoidedKg subtracts the driver detour', () => {
  assert.equal(
    co2AvoidedKg({
      riderKm: 18,
      rider: null,
      detourKm: 1,
      driver: { vehicleType: 'SEDAN', fuel: 'PETROL' },
    }),
    2.367,
  );
});

test('tripPoints doubles on a bad-air day', () => {
  assert.equal(tripPoints('DRIVER', false), 10);
  assert.equal(tripPoints('RIDER', false), 5);
  assert.equal(tripPoints('DRIVER', true), 20);
  assert.equal(tripPoints('RIDER', true), 10);
});

// Petrol sedan driver, 20 km in Delhi at Rs100/l and 15 km/l, two riders without vehicles.
// share = 44.44 each; rider A rides 20 km with a 1 km detour, rider B rides 10 km with no detour.
const trip = {
  tripId: 't1',
  orgId: 'org-example-corp',
  city: 'Delhi',
  month: '2026-10',
  tripKm: 20,
  driver: {
    userId: 'd',
    vehicle: { vehicleType: 'SEDAN', fuel: 'PETROL' },
    mileageKmpl: 15,
  },
  riders: [
    { userId: 'a', sharedKm: 20, detourKm: 1 },
    { userId: 'b', sharedKm: 10, detourKm: 0 },
  ],
};

test('computeTripImpact writes one row per person with hand-checked numbers', () => {
  const { share, entries } = computeTripImpact({ ...trip, badAir: false });
  assert.equal(share, 44.44);
  assert.deepEqual(
    entries.map((e) => [e.id, e.role, e.kmShared, e.kgCO2, e.rupees, e.points]),
    [
      ['t1#d', 'DRIVER', 20, 0, 88.88, 10],
      ['t1#a', 'RIDER', 20, 2.647, 88.89, 5], // 20*0.14 - 1*0.153; 133.33 - 44.44
      ['t1#b', 'RIDER', 10, 1.4, 22.23, 5], // 10*0.14; 66.667 - 44.44
    ],
  );
  assert.ok(entries.every((e) => e.badAir === false && e.month === '2026-10'));
});

test('computeTripImpact doubles points on a bad-air day and flags the rows', () => {
  const { entries } = computeTripImpact({ ...trip, badAir: true });
  assert.deepEqual(entries.map((e) => e.points), [20, 10, 10]);
  assert.ok(entries.every((e) => e.badAir));
});
