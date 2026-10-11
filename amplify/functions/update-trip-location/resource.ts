import { defineFunction } from '@aws-amplify/backend';
export const updateTripLocation = defineFunction({ name: 'update-trip-location', entry: './handler.ts', timeoutSeconds: 15, resourceGroupName: 'data' });
