import { defineFunction } from '@aws-amplify/backend';

/** Refuses sign-ups from email domains that are not a known organisation (E1). */
export const preSignUp = defineFunction({
  name: 'pre-sign-up',
  entry: './handler.ts',
});
