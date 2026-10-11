import { defineStorage } from '@aws-amplify/backend';
import { orgReport } from '../functions/org-report/resource';

// Monthly organisation reports at reports/<orgId>/<month>.csv. Only the
// orgReport Lambda can touch them; admins download through a presigned URL.
export const storage = defineStorage({
  name: 'reports',
  access: (allow) => ({
    'reports/*': [allow.resource(orgReport).to(['read', 'write'])],
  }),
});
