import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/org-report';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';
import { buildOrgReportCsv } from '../../shared/report';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();
const s3 = new S3Client({});

const URL_TTL_SECONDS = 15 * 60;

async function impactEntries(orgId: string, month: string) {
  const entries = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.ImpactEntry.listImpactEntryByOrgIdAndMonth(
      { orgId, month: { eq: month } },
      { nextToken },
    );
    entries.push(...(unwrap(page, 'Reading impact entries') ?? []));
    nextToken = page.nextToken;
  } while (nextToken);
  return entries;
}

export const handler: Schema['orgReport']['functionHandler'] = async (event) => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw new Error('Not signed in.');
  const { month } = event.arguments;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('month must be in YYYY-MM format.');
  }

  // An admin can only report on their own organisation.
  const admin = unwrap(
    await client.models.UserProfile.get({ userId: identity.sub }),
    'Reading profile',
  );
  const orgId = admin?.orgId;
  if (!orgId) {
    throw new Error('You have no organisation yet; call ensureProfile first.');
  }
  const org = unwrap(
    await client.models.Organization.get({ id: orgId }),
    'Reading organisation',
  );

  const csv = buildOrgReportCsv(
    org?.name ?? orgId,
    month,
    await impactEntries(orgId, month),
  );

  const Bucket = env.REPORTS_BUCKET_NAME;
  const Key = `reports/${orgId}/${month}.csv`;
  await s3.send(
    new PutObjectCommand({ Bucket, Key, Body: csv, ContentType: 'text/csv' }),
  );
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket,
      Key,
      ResponseContentDisposition: `attachment; filename="greencommute-${orgId}-${month}.csv"`,
    }),
    { expiresIn: URL_TTL_SECONDS },
  );
};
