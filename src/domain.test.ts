import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptDemo,
  completeDemo,
  fuelShare,
  seed,
  today,
  upiLink,
} from "./domain";

test("fuel cost is split equally including the driver, and invalid mileage is refused", () => {
  assert.equal(fuelShare(30, 100, 15, 3), 50);
  assert.throws(() => fuelShare(30, 100, 0, 3));
});
test("UPI values are encoded and invalid payees and amounts cannot become payment links", () => {
  const link = upiLink("driver@bank", "A & B", 42.5)!;
  const params = new URL(link).searchParams;
  assert.equal(params.get("pn"), "A & B");
  assert.equal(params.get("am"), "42.50");
  assert.equal(upiLink("javascript:bad", "Driver", 50), null);
  assert.equal(upiLink("driver@bank", "Driver", -1), null);
});
test("last demo seat cannot be accepted twice or by another driver", () => {
  let store = seed();
  const trip = store.trips[0];
  trip.seatsLeft = 1;
  store.requests = ["one", "two"].map((id) => ({
    id,
    tripId: trip.id,
    riderId: id,
    driverId: trip.driverId,
    status: "PENDING",
    pickupLabel: trip.startLabel,
    dropLabel: trip.endLabel,
    pickupLat: trip.startLat,
    pickupLng: trip.startLng,
    dropLat: trip.endLat,
    dropLng: trip.endLng,
    sharedKm: trip.routeKm,
  }));
  assert.throws(() => acceptDemo(store, "one", "someone-else"));
  store = acceptDemo(store, "one", trip.driverId);
  assert.equal(store.trips[0].seatsLeft, 0);
  assert.throws(() => acceptDemo(store, "two", trip.driverId));
  assert.throws(() => acceptDemo(store, "one", trip.driverId));
});
test("trip completion is idempotent, doubles bad-air points and avoids double-counting CO2", () => {
  let store = seed();
  const trip = store.trips[0];
  trip.status = "ACTIVE";
  store.aqis = [
    {
      city: trip.city,
      date: today(),
      aqi: 320,
      category: "Very poor",
      badAir: true,
    },
  ];
  store.requests = [
    {
      id: "one",
      tripId: trip.id,
      riderId: "rider",
      driverId: trip.driverId,
      status: "ACCEPTED",
      pickupLabel: trip.startLabel,
      dropLabel: trip.endLabel,
      pickupLat: trip.startLat,
      pickupLng: trip.startLng,
      dropLat: trip.endLat,
      dropLng: trip.endLng,
      sharedKm: 20,
    },
  ];
  assert.throws(() => completeDemo(store, trip.id, "rider"));
  store = completeDemo(store, trip.id, trip.driverId);
  assert.equal(store.impacts.find((i) => i.role === "RIDER")?.points, 10);
  assert.equal(store.impacts.find((i) => i.role === "DRIVER")?.points, 20);
  assert.ok(
    Math.abs(store.impacts.reduce((sum, i) => sum + i.kgCO2, 0) - 2.8) < 1e-10,
  );
  assert.throws(() => completeDemo(store, trip.id, trip.driverId));
});
