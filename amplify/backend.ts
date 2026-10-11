import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { completeTrip } from './functions/complete-trip/resource';
import { ensureProfile } from './functions/ensure-profile/resource';
import { indexTrip } from './functions/index-trip/resource';
import { orgReport } from './functions/org-report/resource';
import { requestSeat } from './functions/request-seat/resource';
import { respondToRequest } from './functions/respond-to-request/resource';
import { searchTrips } from './functions/search-trips/resource';
import { setOrgAdmin } from './functions/set-org-admin/resource';
import { startTrip } from './functions/start-trip/resource';
import { storage } from './storage/resource';
import { createDraftTrip } from './functions/create-draft-trip/resource';
import { updateTripLocation } from './functions/update-trip-location/resource';
import { communityLeaderboard } from './functions/community-leaderboard/resource';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  completeTrip,
  ensureProfile,
  indexTrip,
  orgReport,
  requestSeat,
  respondToRequest,
  searchTrips,
  setOrgAdmin,
  startTrip,
  storage,
  createDraftTrip,
  updateTripLocation,
  communityLeaderboard,
});

// Sandbox deploys use CloudFormation Express mode, which fails any update to the
// user pool ("Invalid AttributeDataType input") while the template lists the
// email attribute. Email is still mandatory because it is the sign-in name.
backend.auth.resources.cfnResources.cfnUserPool.addPropertyDeletionOverride(
  'Schema',
);

// ensureProfile adds the organisation's listed admins to the OrgAdmins group.
const userPool = backend.auth.resources.userPool;
backend.ensureProfile.addEnvironment('USER_POOL_ID', userPool.userPoolId);
userPool.grant(backend.ensureProfile.resources.lambda, 'cognito-idp:AdminAddUserToGroup');

// setOrgAdmin finds a user by email and adds them to or removes them from OrgAdmins.
backend.setOrgAdmin.addEnvironment('USER_POOL_ID', userPool.userPoolId);
userPool.grant(
  backend.setOrgAdmin.resources.lambda,
  'cognito-idp:ListUsers',
  'cognito-idp:AdminAddUserToGroup',
  'cognito-idp:AdminRemoveUserFromGroup',
);

// respondToRequest transactionally changes request status, seat count and rider access.
const tripTable = backend.data.resources.tables['Trip'];
backend.respondToRequest.addEnvironment('TRIP_TABLE_NAME', tripTable.tableName);
tripTable.grant(backend.respondToRequest.resources.lambda, 'dynamodb:UpdateItem', 'dynamodb:ConditionCheckItem');
const requestTable = backend.data.resources.tables['RideRequest'];
backend.respondToRequest.addEnvironment('REQUEST_TABLE_NAME', requestTable.tableName);
requestTable.grant(backend.respondToRequest.resources.lambda, 'dynamodb:UpdateItem');
