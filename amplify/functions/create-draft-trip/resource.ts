import { defineFunction } from '@aws-amplify/backend';
export const createDraftTrip = defineFunction({ name: 'create-draft-trip', entry: './handler.ts', timeoutSeconds: 15, resourceGroupName: 'data' });
