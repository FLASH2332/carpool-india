# Participant access and organisation isolation

Code prepared on 11 October 2026. **Not deployed to Flash's Mumbai sandbox.** The live Sydney demo remains on frontend deployment job 3.

## Access matrix after backend deployment

| Data/action | Allowed users |
| --- | --- |
| Profile, phone/email/UPI, personal impact | Record owner; trusted backend functions |
| Trip, route and latest GPS | Driver and server-accepted riders |
| Ride request and pickup/drop | That rider and that trip's driver |
| Trip/Request/Impact raw writes | Backend functions only |
| Profile name/phone/vehicle/UPI updates | Owner; membership/email/city/totals remain server-managed |
| Organisation and geohash tables | Backend functions only; Cognito rules grant zero operations |
| Trip discovery | Server searchTrips derives caller org and returns matching OPEN trips; no GPS/riderIds in response |
| Monthly leaderboard | Server communityLeaderboard derives caller org, returns at most ten display-name/score rows |
| Monthly CSV | OrgAdmins, scoped to the caller's org; storage remains function-only |

Driver/rider are per-trip relationships, not permanent Cognito roles. OrgAdmins is the existing report role. Client filters are convenience, not enforcement. Organisational discovery is provided by server queries; raw private records are more restrictive than general same-org access.

## Changes in this branch

- Removed broad authenticated reads from Trip, RideRequest, UserProfile and ImpactEntry.
- Trip.riderIds is read-only to clients and set by accepted-request transaction; clients cannot create/update Trip or grant membership.
- Acceptance/decline condition request status and Trip OPEN. Acceptance atomically updates request, seats and membership, also rejecting duplicate rider membership.
- No request-status rewrite during subscription notification; committed acceptance is not rolled back if notification fails.
- New createDraftTrip derives driver/org/city and DRAFT status server-side. New updateTripLocation checks active driver, same org and coordinate bounds.
- New communityLeaderboard replaces client-wide impact/profile reads. No client orgId parameter.
- Frontend uses these operations and loads referenced trips only for ACCEPTED/DONE requests. With old outputs, cloud loading stops with an organiser message; browser demo remains available.
- Added compiled-schema authorization matrix and access-check tests. All 15 tests, lint and production TypeScript/Vite build pass. Backend-wide type checking requires generated Amplify function environment declarations; live API/concurrency tests remain pending.

## Flash: deployment and existing-record migration

1. Review the PR; deploy these changes in the **existing Mumbai sandbox using your own authorised environment**. Do not recreate the sandbox, migrate it or deploy this backend in Kapil's Sydney project.
2. Before activation, audit existing records for forged org/driver/status/impact values possible under the old rules. Backfill Trip.riderIds from verified ACCEPTED/DONE requests only when request driver matches trip driver and rider/driver profiles belong to trip org. Deduplicate IDs; never include PENDING/DECLINED/CANCELLED riders. No live-record migration has been run here.
3. Confirm generated IAM function access remains intact; Organization/TripCell explicitly grant no Cognito operations. Schema compilation passes locally; live resolver behavior must be verified.
4. Ensure respondToRequest receives REQUEST_TABLE_NAME and TRIP_TABLE_NAME, UpdateItem on both tables, and ConditionCheckItem on Trip for decline transactions. These are wired in backend.ts; TransactWriteItems authorizes its underlying operations.
5. Regenerate outputs including riderIds, createDraftTrip, updateTripLocation and communityLeaderboard. Share privately; do not commit generated outputs.
6. Supply real approved domains and verified driver/rider plus cross-org test identities. Current example domains remain unchanged.
7. Run tests below, then coordinate the frontend release with Kapil. Keep the current live demo until the replacement is verified.

## Required live acceptance tests

Use driver A, accepted rider A, pending rider A, unrelated member A, and member B in another org. Call the API directly, not just UI controls.

- Only driver and accepted rider can get/list/subscribe to the private Trip/GPS; pending, unrelated and cross-org callers are denied.
- Request reads/subscriptions reach only its rider and driver. Personal profile/impact reads cannot be accessed by other members or admins.
- Raw model create/update cannot forge Trip membership/state, requests or rewards. Profile updates cannot set email/org/city/totals.
- Same-org search works; cross-org Trip IDs cannot be requested. Discovery selection cannot request GPS or riderIds.
- Leaderboard accepts only month, never an org override; returns own-org names/scores and no contact/payee data. Reports reject nonadmins and remain own-org for admins.
- Concurrent same-request and last-seat accepts consume exactly one seat and grant only the committed rider. Declined/duplicate acceptance grants no access. Verify rider refresh/subscription after the transaction.
- After backfill, previously accepted participants retain access. Test fresh signup, profile edits, draft/index/search, GPS, completion and rewards end to end.

## Still separate work

Flash: recoverable/idempotent completeTrip and atomic profile totals; persistent final settlements; server route-distance validation; search geohash coverage; domain configuration. Participant changes do not repair completion recovery.

WinterSun: real Location map/autocomplete/routes and live AQI/factor provenance. Kapil: integrate supplied maps/fresh outputs, test frontend subscriptions against deployed rules and release the frontend after backend validation.

Admin report UI and recurring commutes are optional/unimplemented. Member org changes require an explicit migration/revocation policy; this patch assumes stable server-assigned organisation membership.
