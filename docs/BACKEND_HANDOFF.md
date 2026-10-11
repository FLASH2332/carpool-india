# Frontend integration handoff

Kapil's React frontend is implemented on the existing React/Vite starter. `amplify_outputs.json` from Flash is configured for Mumbai. The current schema has seven models (not the eight in the feature spec); no LocationPing model or custom workflows exist yet.

## Working against the supplied sandbox

- Cognito email sign-up, code confirmation/resend, sign-in, password recovery, sign-out and session restoration.
- Owner profile create/update. The client does not write organisation membership or impact totals.
- AppSync reads for trips, the current user's requests and impact entries, and AQI.
- Trip/request/impact/AQI subscriptions refresh the screens. Subscription failures display a refresh prompt.
- Explicitly enabled foreground GPS on an already-active owned trip writes the latest position at most once per five seconds. The current backend supports updating those Trip fields, but not history/TTL.

## Flash / JD: remaining production contracts

Please add server operations and regenerate outputs before wiring the blocked frontend actions in `src/App.tsx`. Names below come from the supplied feature spec; they are a proposed contract, not operations that already exist.

| Operation                                      | Minimum behavior                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| createTrip                                     | Validate authenticated driver and organisation; calculate actual route distance, line, fuel share and TripCell index; return Trip. Do not trust client driver IDs, price or coordinates without validation. |
| searchTrips                                    | Route-near pickup/drop, pickup-before-drop, ±30 minutes, free seats, organisation isolation; return trips with walking distance sorted ascending.                                                           |
| requestRide                                    | Validate rider, trip, duplicate request and pickup/drop; create PENDING request. Never derive identity from user-supplied riderId.                                                                          |
| acceptRequest / declineRequest / cancelRequest | Authorize participant; accept request and decrement seat atomically with conditional writes; enforce legal status transitions and idempotency.                                                              |
| startTrip / completeTrip                       | Driver-only transitions; completed impact and totals computed once server-side, using factors and actual accepted riders.                                                                                   |
| updateLocation                                 | Restrict to active driver/accepted riders; store latest position plus short-lived LocationPing history with TTL.                                                                                            |
| generateReport                                 | Optional E3; authorise org admins and issue a short-lived CSV link.                                                                                                                                         |

**Authorization gap:** the current schema grants all signed-in users read access to profiles (including phone/UPI), requests, impact and trips. A client-side organisation filter is not an access boundary. Add participant and organisation-based backend rules/resolvers before using real personal data. Org membership/pre-sign-up domain checks are not implemented; existing output has no OrgAdmins group. Owner Trip updates currently allow seat/status/organisation changes, so protect server-managed fields when adding workflows.

## Ashwin: map and data components

Replace `RouteMap` with your Amazon Location map and autocomplete. Route state needs `[longitude, latitude][]`, road distance, duration, pickup and drop coordinates/labels. The existing SVG is an explicitly illustrative diagram; its car marker is not georeferenced. Location changes currently appear as coordinates/time, not a moving map. Demo offered trips use fixed Bengaluru coordinates irrespective of the labels entered. Restrict demo geography or replace this with real map state before the recording of a live AWS ride.

AQI demo values and fuel prices are seeded/placeholder values. Today's AQI is selected by date in Asia/Kolkata; a missing reading is not represented as live data. Demo emissions use the default rider hatchback factor, assume zero detour, and attribute avoided CO2 to the rider only to avoid double counting. Replace with server-calculated per-person attribution before production. The demo driver's rupees are fuel contributions received rather than a verified fuel-saving estimate.

## Demo walkthrough

1. Choose **Explore the interactive demo**; Kapil starts as a rider.
2. Request Ashwin's Indiranagar → Electronic City trip.
3. Switch the top-right demo person to Ashwin, open My rides and accept.
4. View the trip, start it, optionally simulate location, then end it.
5. Switch to Kapil; open My rides → View trip and My impact.
6. Switch to JD or Ashwin to offer another ride, or add a vehicle to Kapil's profile.

The demo runs entirely in one browser's local storage. It is not a two-phone AppSync demo. Real-account workflow buttons are blocked while the server operations are missing. No payments are collected in demo mode.

## Validation before submission

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Then test real verified driver/rider accounts on two devices, subscription updates, last-seat concurrent acceptance, organisation access rejection, GPS consent/errors and completion idempotency after the server operations are implemented. Reports and recurring commutes remain optional and are not implemented in this frontend.
