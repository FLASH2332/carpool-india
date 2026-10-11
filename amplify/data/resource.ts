import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { completeTrip } from '../functions/complete-trip/resource';
import { ensureProfile } from '../functions/ensure-profile/resource';
import { indexTrip } from '../functions/index-trip/resource';
import { orgReport } from '../functions/org-report/resource';
import { requestSeat } from '../functions/request-seat/resource';
import { respondToRequest } from '../functions/respond-to-request/resource';
import { searchTrips } from '../functions/search-trips/resource';
import { startTrip } from '../functions/start-trip/resource';
import { createDraftTrip } from '../functions/create-draft-trip/resource';
import { updateTripLocation } from '../functions/update-trip-location/resource';
import { communityLeaderboard } from '../functions/community-leaderboard/resource';

/**
 * Authorization conventions:
 * - Private reads are owner/participant-only; organisation discovery uses scoped functions.
 * - Models with no further rule are written by Lambdas only. Each Lambda gets
 *   access through a schema-level `allow.resource(fn)` rule, added alongside the
 *   function that needs it.
 * - Profiles permit owner updates; trips and participant membership are server-written.
 */

// Shared by the Trip model and MatchedTrip (the copy searchTrips returns),
// because a custom type cannot reference a model.
const discoveryFields = () => ({
  driverId: a.id(), // Cognito sub of the driver
  orgId: a.id(),
  city: a.string(),
  startLat: a.float(),
  startLng: a.float(),
  startLabel: a.string(),
  endLat: a.float(),
  endLng: a.float(),
  endLabel: a.string(),
  departAt: a.datetime(),
  seatsTotal: a.integer(),
  seatsLeft: a.integer(),
  routeLine: a.json(), // array of [lng, lat]
  routeKm: a.float(),
  shareRupees: a.float(),
  status: a.ref('TripStatus'),
});
const tripFields = () => ({ ...discoveryFields(), lastLat: a.float(), lastLng: a.float(), lastAt: a.datetime() });


export const schema = a.schema({
  Organization: a
    .model({
      domain: a.string().required(),
      name: a.string(),
      city: a.string(),
    })
    .secondaryIndexes((index) => [index('domain')])
    // No Cognito client operations; schema-level function grants provide IAM access.
    .authorization(allow => [allow.authenticated().to([])]),

  UserProfile: a
    .model({
      userId: a.id().required(), // Cognito sub
      name: a.string(),
      phone: a.string(),
      email: a.email().authorization(allow => [allow.ownerDefinedIn('userId').identityClaim('sub').to(['read'])]),
      // Membership and totals are server-managed, including initial creation.
      orgId: a
        .id()
        .authorization(allow => [allow.ownerDefinedIn('userId').identityClaim('sub').to(['read'])]),
      city: a.string().authorization(allow => [allow.ownerDefinedIn('userId').identityClaim('sub').to(['read'])]),
      vehicleType: a.enum([
        'NONE',
        'HATCHBACK',
        'SEDAN',
        'SUV',
        'SCOOTER',
        'MOTORCYCLE',
      ]),
      fuel: a.enum(['PETROL', 'DIESEL', 'CNG', 'ELECTRIC']),
      mileageKmpl: a.float(),
      seats: a.integer(),
      plate: a.string(),
      upiVpa: a.string(),
      totalKm: a
        .float()
        .default(0)
        .authorization(allow => [allow.ownerDefinedIn('userId').identityClaim('sub').to(['read'])]),
      totalKgCO2: a
        .float()
        .default(0)
        .authorization(allow => [allow.ownerDefinedIn('userId').identityClaim('sub').to(['read'])]),
      totalRupees: a
        .float()
        .default(0)
        .authorization(allow => [allow.ownerDefinedIn('userId').identityClaim('sub').to(['read'])]),
      points: a
        .integer()
        .default(0)
        .authorization(allow => [allow.ownerDefinedIn('userId').identityClaim('sub').to(['read'])]),
    })
    .identifier(['userId'])
    .authorization((allow) => [
      allow
        .ownerDefinedIn('userId')
        .identityClaim('sub')
        .to(['read', 'update']),
    ]),

  TripStatus: a.enum(['DRAFT', 'OPEN', 'ACTIVE', 'DONE', 'CANCELLED']),

  Trip: a
    .model({ ...tripFields(), riderIds: a.string().array() })
    .secondaryIndexes((index) => [
      index('driverId'),
      index('orgId').sortKeys(['departAt']),
    ])
    .authorization((allow) => [
      allow
        .ownerDefinedIn('driverId')
        .identityClaim('sub')
        .to(['read']),
      allow.ownersDefinedIn('riderIds').identityClaim('sub').to(['read']),
    ]),

  TripCell: a
    .model({
      cell: a.string(), // geohash, precision 6
      departAt: a.datetime(),
      tripId: a.id(),
      orgId: a.id(),
    })
    .secondaryIndexes((index) => [index('cell').sortKeys(['departAt'])])
    .authorization(allow => [allow.authenticated().to([])]),

  RideRequest: a
    .model({
      tripId: a.id(),
      riderId: a.id(),
      driverId: a.id(),
      pickupLat: a.float(),
      pickupLng: a.float(),
      pickupLabel: a.string(),
      dropLat: a.float(),
      dropLng: a.float(),
      dropLabel: a.string(),
      sharedKm: a.float(),
      status: a.enum(['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'DONE']),
    })
    .secondaryIndexes((index) => [index('tripId'), index('riderId')])
    .authorization((allow) => [
      allow.ownerDefinedIn('riderId').identityClaim('sub').to(['read']),
      allow.ownerDefinedIn('driverId').identityClaim('sub').to(['read']),
    ]),

  ImpactEntry: a
    .model({
      userId: a.id(),
      orgId: a.id(),
      tripId: a.id(),
      month: a.string(), // YYYY-MM
      role: a.enum(['DRIVER', 'RIDER']),
      kmShared: a.float(),
      kgCO2: a.float(),
      rupees: a.float(),
      points: a.integer(),
      badAirDay: a.boolean(),
    })
    .secondaryIndexes((index) => [
      index('userId'),
      index('orgId').sortKeys(['month']),
    ])
    .authorization((allow) => [allow.ownerDefinedIn('userId').identityClaim('sub').to(['read'])]),

  AqiDaily: a
    .model({
      city: a.string().required(),
      date: a.string().required(), // YYYY-MM-DD
      aqi: a.integer(),
      category: a.string(),
      badAir: a.boolean(),
    })
    .identifier(['city', 'date'])
    .authorization((allow) => [allow.authenticated().to(['read'])]),

  // Creates or updates the caller's UserProfile, setting orgId and city from
  // their email domain.
  ensureProfile: a
    .mutation()
    .arguments({ name: a.string(), phone: a.string() })
    .returns(a.ref('UserProfile'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(ensureProfile)),

  // Publishes the caller's DRAFT trip: fills orgId, city, seatsLeft and
  // shareRupees, writes its TripCells and sets status OPEN.
  indexTrip: a
    .mutation()
    .arguments({ tripId: a.id().required() })
    .returns(a.ref('Trip'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(indexTrip)),

  // Same fields as the Trip model.
  MatchedTrip: a.customType({
    id: a.id().required(),
    ...discoveryFields(),
    createdAt: a.datetime(),
    updatedAt: a.datetime(),
  }),

  TripMatch: a.customType({
    trip: a.ref('MatchedTrip'),
    driverName: a.string(),
    vehicleType: a.string(), // a UserProfile vehicleType value
    walkKmToPickup: a.float(),
    sharedKm: a.float(), // route length between the rider's pickup and drop
  }),

  // OPEN trips in the caller's organisation whose route passes within 1 km of
  // both pickup and drop, nearest pickup first.
  searchTrips: a
    .query()
    .arguments({
      pickupLat: a.float().required(),
      pickupLng: a.float().required(),
      dropLat: a.float().required(),
      dropLng: a.float().required(),
      departAt: a.datetime().required(),
      windowMinutes: a.integer(), // defaults to 30
    })
    .returns(a.ref('TripMatch').array())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(searchTrips)),

  // Rider asks for a seat on an OPEN trip in their organisation.
  requestSeat: a
    .mutation()
    .arguments({
      tripId: a.id().required(),
      pickupLat: a.float().required(),
      pickupLng: a.float().required(),
      pickupLabel: a.string(),
      dropLat: a.float().required(),
      dropLng: a.float().required(),
      dropLabel: a.string(),
      sharedKm: a.float(),
    })
    .returns(a.ref('RideRequest'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(requestSeat)),

  // Driver accepts (taking a seat) or declines a PENDING request.
  respondToRequest: a
    .mutation()
    .arguments({
      requestId: a.id().required(),
      accept: a.boolean().required(),
    })
    .returns(a.ref('RideRequest'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(respondToRequest)),

  // Driver starts their OPEN trip: status becomes ACTIVE.
  startTrip: a
    .mutation()
    .arguments({ tripId: a.id().required() })
    .returns(a.ref('Trip'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(startTrip)),

  RiderSettlement: a.customType({
    riderId: a.id(),
    kgCO2: a.float(),
    rupeesSaved: a.float(),
    share: a.float(), // rupees the rider owes the driver
    upiLink: a.string(), // null if the driver has no upiVpa
  }),

  DriverTotals: a.customType({
    kmShared: a.float(),
    kgCO2: a.float(),
    rupees: a.float(), // sum of the riders' shares
    points: a.integer(),
  }),

  TripCompletion: a.customType({
    perRider: a.ref('RiderSettlement').array(),
    driverTotals: a.ref('DriverTotals'),
  }),

  // Driver ends their ACTIVE trip: status DONE, impact written for everyone.
  completeTrip: a
    .mutation()
    .arguments({ tripId: a.id().required() })
    .returns(a.ref('TripCompletion'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(completeTrip)),

  createDraftTrip: a.mutation()
    .arguments({ startLabel: a.string().required(), endLabel: a.string().required(), startLat: a.float().required(), startLng: a.float().required(), endLat: a.float().required(), endLng: a.float().required(), departAt: a.datetime().required(), seatsTotal: a.integer().required(), routeLine: a.json().required(), routeKm: a.float().required() })
    .returns(a.ref('Trip'))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(createDraftTrip)),
  updateTripLocation: a.mutation()
    .arguments({ tripId: a.id().required(), lat: a.float().required(), lng: a.float().required() })
    .returns(a.ref('Trip'))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(updateTripLocation)),
  CommunityStanding: a.customType({ userId: a.id().required(), name: a.string().required(), kgCO2: a.float().required(), points: a.integer().required(), trips: a.integer().required() }),
  communityLeaderboard: a.query()
    .arguments({ month: a.string().required() })
    .returns(a.ref('CommunityStanding').array())
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(communityLeaderboard)),

  // OrgAdmins only: builds the caller's organisation report for a month
  // (YYYY-MM) and returns a download URL valid for 15 minutes.
  orgReport: a
    .query()
    .arguments({ month: a.string().required() })
    .returns(a.string())
    .authorization((allow) => [allow.group('OrgAdmins')])
    .handler(a.handler.function(orgReport)),
})
  .authorization((allow) => [
    allow.resource(createDraftTrip),
    allow.resource(updateTripLocation),
    allow.resource(communityLeaderboard),
    allow.resource(orgReport),
    allow.resource(completeTrip),
    allow.resource(startTrip),
    allow.resource(ensureProfile),
    allow.resource(indexTrip),
    allow.resource(searchTrips),
    allow.resource(requestSeat),
    allow.resource(respondToRequest),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
