import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { ensureProfile } from '../functions/ensure-profile/resource';
import { indexTrip } from '../functions/index-trip/resource';
import { searchTrips } from '../functions/search-trips/resource';

/**
 * Authorization conventions:
 * - Every signed-in user can read every model.
 * - Models with no further rule are written by Lambdas only. Each Lambda gets
 *   access through a schema-level `allow.resource(fn)` rule, added alongside the
 *   function that needs it.
 * - UserProfile and Trip are also writable by their owner (matched on Cognito sub).
 */

// Shared by the Trip model and MatchedTrip (the copy searchTrips returns),
// because a custom type cannot reference a model.
const tripFields = () => ({
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
  lastLat: a.float(),
  lastLng: a.float(),
  lastAt: a.datetime(),
});

const schema = a.schema({
  Organization: a
    .model({
      domain: a.string().required(),
      name: a.string(),
      city: a.string(),
    })
    .secondaryIndexes((index) => [index('domain')])
    .authorization((allow) => [allow.authenticated().to(['read'])]),

  UserProfile: a
    .model({
      userId: a.id().required(), // Cognito sub
      name: a.string(),
      phone: a.string(),
      email: a.email(),
      // orgId is read-only for clients; Lambdas set it. Totals and points can
      // only be written by the owner on create (so the default 0 applies), then
      // by Lambdas.
      orgId: a
        .id()
        .authorization((allow) => [allow.authenticated().to(['read'])]),
      city: a.string(),
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
        .authorization((allow) => [
          allow.authenticated().to(['read']),
          allow.ownerDefinedIn('userId').identityClaim('sub').to(['create']),
        ]),
      totalKgCO2: a
        .float()
        .default(0)
        .authorization((allow) => [
          allow.authenticated().to(['read']),
          allow.ownerDefinedIn('userId').identityClaim('sub').to(['create']),
        ]),
      totalRupees: a
        .float()
        .default(0)
        .authorization((allow) => [
          allow.authenticated().to(['read']),
          allow.ownerDefinedIn('userId').identityClaim('sub').to(['create']),
        ]),
      points: a
        .integer()
        .default(0)
        .authorization((allow) => [
          allow.authenticated().to(['read']),
          allow.ownerDefinedIn('userId').identityClaim('sub').to(['create']),
        ]),
    })
    .identifier(['userId'])
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow
        .ownerDefinedIn('userId')
        .identityClaim('sub')
        .to(['create', 'update']),
    ]),

  TripStatus: a.enum(['DRAFT', 'OPEN', 'ACTIVE', 'DONE', 'CANCELLED']),

  Trip: a
    .model(tripFields())
    .secondaryIndexes((index) => [
      index('driverId'),
      index('orgId').sortKeys(['departAt']),
    ])
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow
        .ownerDefinedIn('driverId')
        .identityClaim('sub')
        .to(['create', 'update']),
    ]),

  TripCell: a
    .model({
      cell: a.string(), // geohash, precision 6
      departAt: a.datetime(),
      tripId: a.id(),
      orgId: a.id(),
    })
    .secondaryIndexes((index) => [index('cell').sortKeys(['departAt'])])
    .authorization((allow) => [allow.authenticated().to(['read'])]),

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
    .authorization((allow) => [allow.authenticated().to(['read'])]),

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
    .authorization((allow) => [allow.authenticated().to(['read'])]),

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
    ...tripFields(),
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
})
  .authorization((allow) => [
    allow.resource(ensureProfile),
    allow.resource(indexTrip),
    allow.resource(searchTrips),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
