import { defineFunction } from '@aws-amplify/backend';

export const respondToRequest = defineFunction({
  name: 'respond-to-request',
  entry: './handler.ts',
  timeoutSeconds: 15,
  // Lives in the data stack: it is a resolver and also calls the data API.
  // TRIP_TABLE_NAME and the DynamoDB permission are added in backend.ts.
  resourceGroupName: 'data',
});
