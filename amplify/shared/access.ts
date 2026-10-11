/** Checks shared by server operations; identifiers always come from Cognito sub. */
export function requireOrganisation(profile: { orgId?: string | null } | null | undefined): string {
  if (!profile?.orgId) throw Error('Set up your organisation profile first.');
  return profile.orgId;
}
export function requireSameOrganisation(a: { orgId?: string | null } | null | undefined, b: { orgId?: string | null } | null | undefined) {
  if (requireOrganisation(a) !== requireOrganisation(b)) throw Error('Access denied.');
}
export function requireActiveDriver(trip: { driverId?: string | null; status?: string | null } | null | undefined, userId: string) {
  if (!trip || trip.driverId !== userId || trip.status !== 'ACTIVE') throw Error('Only the active trip driver can update location.');
}
export function validatePoint(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw Error('Invalid location.');
}
export function discoveryTrip<T extends { riderIds?: unknown; lastLat?: unknown; lastLng?: unknown; lastAt?: unknown }>(trip: T) {
  const { riderIds: _riders, lastLat: _lat, lastLng: _lng, lastAt: _at, ...safe } = trip;
  return safe;
}
export function validateMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('month must be YYYY-MM.');
}
