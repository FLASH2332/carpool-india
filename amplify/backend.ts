import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { ensureProfile } from './functions/ensure-profile/resource';
import { indexTrip } from './functions/index-trip/resource';
import { searchTrips } from './functions/search-trips/resource';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
defineBackend({
  auth,
  data,
  ensureProfile,
  indexTrip,
  searchTrips,
});
