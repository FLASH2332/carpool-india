import { test } from "node:test";
import assert from "node:assert/strict";
import { carbonPoints, makeLeaderboard } from "./rewards";

test("carbon points award ten per kg with no rounding-up or nonfinite rewards", () => {
  assert.equal(carbonPoints(1.29), 12);
  assert.equal(carbonPoints(0.1 + 0.2), 3);
  assert.equal(carbonPoints(-1), 0);
  assert.equal(carbonPoints(Infinity), 0);
});
test("monthly leaderboard excludes other members/months and duplicate trip attribution", () => {
  const row = { userId: "a", tripId: "one", month: "2026-10", kgCO2: 2, points: 5 };
  const result = makeLeaderboard([row, row, { ...row, userId: "outsider" }, { ...row, month: "2026-09", tripId: "old" }], [{ userId: "a", name: "A" }], "2026-10");
  assert.deepEqual(result, [{ userId: "a", name: "A", kgCO2: 2, carbonPoints: 20, ridePoints: 5, trips: 1 }]);
});
test("leaderboard ties have stable order and keep ride points separate", () => {
  const rows = makeLeaderboard([
    { userId: "b", tripId: "one", month: "2026-10", kgCO2: 1, points: 10 },
    { userId: "a", tripId: "two", month: "2026-10", kgCO2: 1, points: 20 },
  ], [{ userId: "b", name: "B" }, { userId: "a", name: "A" }], "2026-10");
  assert.equal(rows[0].userId, "a");
  assert.equal(rows[0].carbonPoints, 10);
  assert.equal(rows[0].ridePoints, 20);
});
