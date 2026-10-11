import { defineFunction } from '@aws-amplify/backend';

export const orgReport = defineFunction({
  name: 'org-report',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 512,
  // Lives in the data stack: it is a resolver and also calls the data API.
  resourceGroupName: 'data',
});
