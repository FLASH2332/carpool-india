import { emissionFactor, istDate, round2 } from './impact';
import { EMISSION_FACTORS, TRANSIT_FACTORS } from './factors';

// TODO: indicative factors, not verified India operator-specific measurements.
// Automatic approval stays disabled until the deployment owner verifies these.
export type TransitMode = keyof typeof TRANSIT_FACTORS;
export type Ticket = { date: string; mode: TransitMode; from: string; to: string; ticket: string; time: string; confidence: number };
export type TransitClaim = Ticket & { id: string; userId: string; orgId: string; expiresAt: number; status: 'PENDING' | 'APPROVED' | 'REJECTED'; km: number; kgCO2: number; points: number; badAir: boolean; reason: string };
export const MAX_IMAGE_BYTES = 450_000;
export function dayEnd(date: string) {
  const start = Date.parse(`${date}T00:00:00+05:30`);
  if (!Number.isFinite(start) || istDate(new Date(start)) !== date) throw Error('Invalid ticket date.');
  return Math.floor(start / 1000) + 86400;
}
export function todayOnly(date: string, now = new Date()) {
  dayEnd(date);
  if (date !== istDate(now)) throw Error('Only tickets dated today in India can earn rewards.');
}
const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// This is a digest of extracted text, never a hash of the image. Partitioning by
// the authenticated user prevents cross-user comparison.
export function duplicateText(t: Ticket) {
  if (normalize(t.ticket)) return [t.date, t.mode, 'ticket', normalize(t.ticket)].join('|');
  return [t.date, t.mode, normalize(t.from), normalize(t.to), normalize(t.ticket), t.time].join('|');
}
export function userDayPartition(userId: string, date: string) { return `USER#${userId}#${date}`; }
export function parseTicket(lines: { text: string; confidence: number }[]): Ticket {
  const text = lines.map(l => l.text).join('\n');
  if (/\bcarpool\b/i.test(text)) throw Error('Carpool rewards use the ride workflow; ticket bonuses are only for metro or bus.');
  const metro = /\b(metro|dmrc|bmrcl|cmrl)\b/i.test(text);
  const bus = /\bbus\b/i.test(text);
  if (metro === bus) throw Error('The ticket must clearly identify metro or bus transport.');
  const dates = [...text.matchAll(/\b(\d{4})[-/](\d{2})[-/](\d{2})\b|\b(\d{2})[-/](\d{2})[-/](\d{4})\b/g)].map(m => m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[6]}-${m[5]}-${m[4]}`);
  if (new Set(dates).size !== 1) throw Error('A single unambiguous journey date is required (YYYY-MM-DD or DD-MM-YYYY).');
  const field = (pattern: RegExp) => text.match(pattern)?.[1]?.trim().slice(0, 160) ?? '';
  const from = field(/^(?:from|source|origin)\s*[:-]\s*(.+)$/im);
  const to = field(/^(?:to|destination)\s*[:-]\s*(.+)$/im);
  if (!from || !to || normalize(from) === normalize(to)) throw Error('Could not extract distinct From and To stations. Use a dated single-journey ticket with readable route labels.');
  const ticket = field(/^(?:ticket(?:\s*(?:id|no\.?|number))?|pnr)\s*[:-]\s*(.+)$/im);
  const time = field(/^(?:time|journey time)\s*[:-]\s*(\d{2}:\d{2})(?:\s|$)/im);
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('Invalid journey time.');
  return { date: dates[0], mode: metro ? 'METRO' : 'BUS', from, to, ticket, time, confidence: Math.min(...lines.map(l => l.confidence)) };
}
export function transitReward(vehicle: { vehicleType?: string | null; fuel?: string | null }, mode: TransitMode, km: number, badAir: boolean) {
  if (!['HATCHBACK', 'SEDAN', 'SUV', 'SCOOTER', 'MOTORCYCLE'].includes(vehicle.vehicleType ?? '')) throw Error('Transit rewards require a vehicle on your profile.');
  if (!vehicle.fuel || !EMISSION_FACTORS[`${vehicle.vehicleType}_${vehicle.fuel}`]) throw Error('Save a supported fuel type on your car profile first.');
  if (!Number.isFinite(km) || km <= 0 || km > 200) throw Error('Distance must be greater than zero and at most 200 km.');
  const car = emissionFactor(vehicle), transit = TRANSIT_FACTORS[mode];
  const saving = Math.max(0, Math.min(1, (car - transit) / car));
  return { kgCO2: round2(km * Math.max(0, car - transit)), points: Math.round(5 * (1 + 0.5 * saving)) * (badAir ? 2 : 1) };
}
export function needsReview(ticket: Ticket, count: number, distanceVerified: boolean, automaticEnabled: boolean) {
  return !automaticEnabled || ticket.confidence < 95 || !ticket.ticket || !distanceVerified || count >= 3;
}
