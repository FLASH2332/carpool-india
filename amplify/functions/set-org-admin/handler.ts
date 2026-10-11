import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import {
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { AppSyncIdentityCognito } from 'aws-lambda';
import { env } from '$amplify/env/set-org-admin';
import type { Schema } from '../../data/resource';
import { unwrap } from '../../shared/data';
import { emailBelongsToDomain, normaliseEmail, withAdmin } from '../../shared/org';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();
const cognito = new CognitoIdentityProviderClient({});
const ORG_ADMINS_GROUP = 'OrgAdmins';
const UserPoolId = process.env.USER_POOL_ID;

/** Puts the user with this email in, or takes them out of, OrgAdmins. No-op if they have not signed up. */
async function applyGroup(email: string, isAdmin: boolean): Promise<void> {
  const { Users } = await cognito.send(
    new ListUsersCommand({ UserPoolId, Filter: `email = "${email}"`, Limit: 1 }),
  );
  const Username = Users?.[0]?.Username;
  if (!Username) return;
  const membership = { UserPoolId, Username, GroupName: ORG_ADMINS_GROUP };
  await cognito.send(
    isAdmin
      ? new AdminAddUserToGroupCommand(membership)
      : new AdminRemoveUserFromGroupCommand(membership),
  );
}

export const handler: Schema['setOrgAdmin']['functionHandler'] = async (
  event,
) => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw new Error('Not signed in.');
  const { orgId, isAdmin } = event.arguments;
  const email = normaliseEmail(event.arguments.email);
  // Also keeps the address safe to place in the Cognito filter above.
  if (!/^[^\s@"\\]+@[^\s@"\\]+\.[^\s@"\\]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }

  const org = unwrap(
    await client.models.Organization.get({ id: orgId }),
    'Reading organisation',
  );
  if (!org) throw new Error(`Organisation ${orgId} not found.`);
  if (!emailBelongsToDomain(email, org.domain)) {
    throw new Error(`${email} is not on this organisation's domain (${org.domain}).`);
  }

  const save = async () =>
    unwrap(
      await client.models.Organization.update({
        id: orgId,
        adminEmails: withAdmin(org.adminEmails, email, isAdmin),
      }),
      'Saving organisation admins',
    );

  if (isAdmin) {
    // List first: if the group step fails, ensureProfile promotes them at their next sign-in.
    const saved = await save();
    await applyGroup(email, true);
    return saved;
  }
  // Group first: never leave someone off the list but still in the group.
  await applyGroup(email, false);
  return save();
};
