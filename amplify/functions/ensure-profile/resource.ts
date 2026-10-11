import { defineFunction } from '@aws-amplify/backend';

export const ensureProfile = defineFunction({
  name: 'ensure-profile',
  entry: './handler.ts',
  timeoutSeconds: 15,
  // Lives in the data stack: it is a resolver and also calls the data API.
  resourceGroupName: 'data',
});
