export type ReportEntry = {
  userId?: string | null;
  tripId?: string | null;
  role?: string | null;
  kmShared?: number | null;
  kgCO2?: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * One-row monthly summary for an organisation. Km and CO2 are summed over
 * RIDER and TRANSIT entries, because a driver's entry repeats their riders' figures.
 */
export function buildOrgReportCsv(
  orgName: string,
  month: string,
  entries: ReportEntry[],
): string {
  const riderEntries = entries.filter((e) => e.role === 'RIDER' || e.role === 'TRANSIT');
  const sum = (pick: (e: ReportEntry) => number | null | undefined) =>
    round2(riderEntries.reduce((total, e) => total + (pick(e) ?? 0), 0));

  const header = [
    'organisation',
    'month',
    'employees_pooling',
    'trips_shared',
    'km_shared',
    'kg_co2_avoided',
    'cars_kept_off_road',
    'transit_journeys',
  ];
  const row = [
    orgName,
    month,
    new Set(entries.map((e) => e.userId).filter(Boolean)).size,
    new Set(entries.map((e) => e.tripId).filter(Boolean)).size,
    sum((e) => e.kmShared),
    sum((e) => e.kgCO2),
    riderEntries.length, // each rider/transit journey substitutes a solo vehicle journey
    entries.filter(e => e.role === 'TRANSIT').length,
  ];
  return `${header.join(',')}\r\n${row.map(csvCell).join(',')}\r\n`;
}
