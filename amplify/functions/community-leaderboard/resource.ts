import { defineFunction } from '@aws-amplify/backend';
export const communityLeaderboard = defineFunction({ name: 'community-leaderboard', entry: './handler.ts', timeoutSeconds: 30, resourceGroupName: 'data' });
