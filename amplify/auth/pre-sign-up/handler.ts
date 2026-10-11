import type { PreSignUpTriggerHandler } from 'aws-lambda';
import { ORG_DOMAINS } from '../../shared/factors';

// Uses the ORG_DOMAINS map only (no data access), so auth never depends on data.
export const handler: PreSignUpTriggerHandler = async (event) => {
  const email = event.request.userAttributes.email ?? '';
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (!Object.hasOwn(ORG_DOMAINS, domain)) {
    throw new Error('Use your work or college email');
  }
  return event;
};
