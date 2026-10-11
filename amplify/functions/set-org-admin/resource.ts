import { defineFunction } from '@aws-amplify/backend';

export const setOrgAdmin = defineFunction({
  name: 'set-org-admin',
  entry: './handler.ts',
  timeoutSeconds: 15,
  // Lives in the data stack: it is a resolver and also calls the data API.
  // USER_POOL_ID and the Cognito permissions are added in backend.ts.
  resourceGroupName: 'data',
});
