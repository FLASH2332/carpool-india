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
import { transitClaims } from './functions/transit-claims/resource';
import { transitCleanup } from './functions/transit-cleanup/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { ArnFormat, Stack } from 'aws-cdk-lib';
import { createTransitMetadataTable } from './transit-table';

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
  transitClaims,
  transitCleanup,
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

// New ephemeral metadata only: no image bucket, backups or raw OCR text.
// APIs deny expired records immediately; sweeper deletes them, TTL is fallback.
const transitStack = Stack.of(backend.transitClaims.resources.lambda);
const transitTable = createTransitMetadataTable(transitStack);
backend.transitClaims.addEnvironment('TRANSIT_TABLE_NAME', transitTable.tableName);
backend.transitCleanup.addEnvironment('TRANSIT_TABLE_NAME', transitTable.tableName);
transitTable.grant(backend.transitClaims.resources.lambda, 'dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:PutItem', 'dynamodb:UpdateItem');
transitTable.grant(backend.transitCleanup.resources.lambda, 'dynamodb:Query', 'dynamodb:DeleteItem');
const impactTable = backend.data.resources.tables['ImpactEntry'];
const profileTable = backend.data.resources.tables['UserProfile'];
backend.transitClaims.addEnvironment('IMPACT_TABLE_NAME', impactTable.tableName);
backend.transitClaims.addEnvironment('PROFILE_TABLE_NAME', profileTable.tableName);
impactTable.grant(backend.transitClaims.resources.lambda, 'dynamodb:PutItem');
profileTable.grant(backend.transitClaims.resources.lambda, 'dynamodb:UpdateItem');
backend.transitClaims.resources.lambda.addToRolePolicy(new PolicyStatement({ actions: ['textract:DetectDocumentText'], resources: ['*'] })); // Synchronous OCR has no resource-level ARN.
const stack = Stack.of(transitTable);
if (process.env.TRANSIT_PLACE_INDEX) backend.transitClaims.resources.lambda.addToRolePolicy(new PolicyStatement({ actions: ['geo:SearchPlaceIndexForText'], resources: [stack.formatArn({ service: 'geo', resource: 'place-index', resourceName: process.env.TRANSIT_PLACE_INDEX, arnFormat: ArnFormat.SLASH_RESOURCE_NAME })] }));
if (process.env.TRANSIT_ROUTE_CALCULATOR) backend.transitClaims.resources.lambda.addToRolePolicy(new PolicyStatement({ actions: ['geo:CalculateRoute'], resources: [stack.formatArn({ service: 'geo', resource: 'route-calculator', resourceName: process.env.TRANSIT_ROUTE_CALCULATOR, arnFormat: ArnFormat.SLASH_RESOURCE_NAME })] }));
// Ticket bytes must not enter AppSync field/context logs. Lambda handlers also
// deliberately do not log events, OCR responses or ticket metadata.
backend.data.resources.cfnResources.cfnGraphqlApi.addPropertyDeletionOverride('LogConfig');
