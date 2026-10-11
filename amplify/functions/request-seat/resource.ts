import { defineFunction } from '@aws-amplify/backend';

export const requestSeat = defineFunction({
  name: 'request-seat',
  entry: './handler.ts',
  timeoutSeconds: 15,
  // Lives in the data stack: it is a resolver and also calls the data API.
  resourceGroupName: 'data',
});
