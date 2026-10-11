import { defineFunction } from '@aws-amplify/backend';
export const transitCleanup = defineFunction({ name: 'transit-cleanup', entry: './handler.ts', timeoutSeconds: 60, resourceGroupName: 'data', schedule: 'every 1m' });
