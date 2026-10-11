import { defineAuth } from '@aws-amplify/backend';
import { preSignUp } from './pre-sign-up/resource';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  // OrgAdmins: an organisation's admins; they can run orgReport. Managed through
  // setOrgAdmin and ensureProfile.
  // PlatformAdmins: us; they manage every organisation's admins. Added by hand in
  // the Cognito console.
  groups: ['OrgAdmins', 'PlatformAdmins'],
  triggers: {
    preSignUp,
  },
});
