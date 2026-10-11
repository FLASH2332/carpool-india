import type { Impact } from "./domain";

export type Leader = { userId: string; name: string; kgCO2: number; carbonPoints: number; ridePoints: number; trips: number };
export const carbonPoints = (kg: number) => Math.floor(Math.max(0, Number.isFinite(kg) ? kg : 0) * 10 + 1e-9);
export const milestones = [
  { kg: 1, name: "First footprint" },
  { kg: 5, name: "Greener regular" },
  { kg: 10, name: "Commute champion" },
  { kg: 25, name: "Carbon trailblazer" },
];
export function makeLeaderboard(
  impacts: Pick<Impact, "userId" | "tripId" | "month" | "kgCO2" | "points">[],
  members: { userId: string; name: string }[],
  month: string,
): Leader[] {
  const rows = new Map<string, Leader>();
  const names = new Map(members.map(m => [m.userId, m.name]));
  const seen = new Set<string>();
  for (const impact of impacts) {
    const key = `${impact.tripId}:${impact.userId}`;
    if (impact.month !== month || !names.has(impact.userId) || seen.has(key)) continue;
    seen.add(key);
    const row = rows.get(impact.userId) ?? { userId: impact.userId, name: names.get(impact.userId) || "Community member", kgCO2: 0, carbonPoints: 0, ridePoints: 0, trips: 0 };
    row.kgCO2 += Math.max(0, Number.isFinite(impact.kgCO2) ? impact.kgCO2 : 0);
    row.ridePoints += Math.max(0, Number.isFinite(impact.points) ? impact.points : 0);
    row.trips += 1;
    rows.set(row.userId, row);
  }
  return [...rows.values()].map(row => ({ ...row, kgCO2: Math.round(row.kgCO2 * 100) / 100, carbonPoints: carbonPoints(row.kgCO2) }))
    .sort((a, b) => b.carbonPoints - a.carbonPoints || b.kgCO2 - a.kgCO2 || b.ridePoints - a.ridePoints || a.userId.localeCompare(b.userId));
}
