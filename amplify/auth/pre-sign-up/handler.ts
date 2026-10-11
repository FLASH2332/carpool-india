import type { PreSignUpTriggerHandler } from 'aws-lambda';
import { orgForEmail } from '../../shared/org';

// The domain list is bundled in from shared/factors.ts rather than read from the
// Organization table: a trigger that reads the data stack would make auth and data
// depend on each other.
export const handler: PreSignUpTriggerHandler = async (event) => {
  if (!orgForEmail(event.request.userAttributes.email)) {
    throw new Error('Sign up with your work or college email address.');
  }
  return event;
};
