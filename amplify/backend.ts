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
import { startTrip } from './functions/start-trip/resource';
import { storage } from './storage/resource';

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
  startTrip,
  storage,
});

// Sandbox deploys use CloudFormation Express mode, which fails any update to the
// user pool ("Invalid AttributeDataType input") while the template lists the
// email attribute. Email is still mandatory because it is the sign-in name.
backend.auth.resources.cfnResources.cfnUserPool.addPropertyDeletionOverride(
  'Schema',
);

// respondToRequest takes a seat with a conditional write straight to the Trip
// table, so two accepts at the same moment can never oversell the last seat.
const tripTable = backend.data.resources.tables['Trip'];
backend.respondToRequest.addEnvironment('TRIP_TABLE_NAME', tripTable.tableName);
tripTable.grant(backend.respondToRequest.resources.lambda, 'dynamodb:UpdateItem');
