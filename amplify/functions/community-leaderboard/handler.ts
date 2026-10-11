import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/community-leaderboard';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();
import { requireOrganisation, validateMonth } from '../../shared/access';
export const handler: Schema['communityLeaderboard']['functionHandler'] = async event => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw Error('Not signed in.');
  const { month } = event.arguments;
  validateMonth(month);
  const caller = unwrap(await client.models.UserProfile.get({ userId: identity.sub }), 'Reading caller');
  const orgId = requireOrganisation(caller);
  const entries = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.ImpactEntry.listImpactEntryByOrgIdAndMonth({ orgId, month: { eq: month } }, { nextToken });
    entries.push(...(unwrap(page, 'Reading standings') ?? []));
    nextToken = page.nextToken;
  } while (nextToken);
  const rows = new Map<string, { userId: string; name: string; kgCO2: number; points: number; trips: number }>();
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.userId || !entry.tripId || entry.orgId !== orgId || entry.month !== month) continue;
    const key = entry.tripId + ':' + entry.userId;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = rows.get(entry.userId) ?? { userId: entry.userId, name: 'Community member', kgCO2: 0, points: 0, trips: 0 };
    row.kgCO2 += Math.max(0, Number.isFinite(entry.kgCO2) ? entry.kgCO2 ?? 0 : 0);
    row.points += Math.max(0, Number.isFinite(entry.points) ? entry.points ?? 0 : 0);
    row.trips += 1;
    rows.set(entry.userId, row);
  }
  const standings = [...rows.values()].sort((a, b) => b.kgCO2 - a.kgCO2 || b.points - a.points || a.userId.localeCompare(b.userId));
  const safe = [];
  for (const row of standings) {
    const member = unwrap(await client.models.UserProfile.get({ userId: row.userId }, { selectionSet: ['userId', 'name', 'orgId'] }), 'Reading display name');
    if (member?.orgId === orgId) safe.push({ ...row, name: member.name || 'Community member' });
    if (safe.length === 10) break;
  }
  return safe;
};
