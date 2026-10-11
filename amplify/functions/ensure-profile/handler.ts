import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/ensure-profile';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';
import { ORG_DOMAINS } from '../../shared/factors';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

/**
 * Email of the caller. ID tokens carry it as a claim; access tokens (which the
 * Amplify JS client sends) do not, so fall back to asking Cognito with the
 * caller's own token.
 */
async function callerEmail(
  identity: AppSyncIdentityCognito,
  authHeader: string | undefined,
): Promise<string | undefined> {
  if (typeof identity.claims?.email === 'string') return identity.claims.email;
  if (!authHeader) return undefined;

  const response = await fetch(
    `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.GetUser',
      },
      body: JSON.stringify({ AccessToken: authHeader.replace(/^Bearer /i, '') }),
    },
  );
  if (!response.ok) return undefined;
  const user = (await response.json()) as {
    UserAttributes?: { Name: string; Value: string }[];
  };
  return user.UserAttributes?.find((attr) => attr.Name === 'email')?.Value;
}

export const handler: Schema['ensureProfile']['functionHandler'] = async (
  event,
) => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw new Error('Not signed in.');
  const userId = identity.sub;

  const email = (
    await callerEmail(identity, event.request.headers.authorization)
  )?.toLowerCase();
  if (!email) throw new Error('Could not read your email address.');

  const domain = email.split('@')[1] ?? '';
  const org = ORG_DOMAINS[domain];
  if (!org) {
    throw new Error(
      `Your email domain "${domain}" is not a registered organisation on GreenCommute.`,
    );
  }

  const existingOrg = unwrap(
    await client.models.Organization.get({ id: org.orgId }),
    'Reading organisation',
  );
  if (!existingOrg) {
    unwrap(
      await client.models.Organization.create({
        id: org.orgId,
        domain,
        name: org.name,
        city: org.city,
      }),
      'Creating organisation',
    );
  }

  const { name, phone } = event.arguments;
  const fields = {
    userId,
    email,
    orgId: org.orgId,
    city: org.city,
    // Only overwrite name and phone when the caller sent them.
    ...(name != null && { name }),
    ...(phone != null && { phone }),
  };

  const existing = unwrap(
    await client.models.UserProfile.get({ userId }),
    'Reading profile',
  );
  const saved = existing
    ? await client.models.UserProfile.update(fields)
    : await client.models.UserProfile.create(fields);
  return unwrap(saved, 'Saving profile');
};
