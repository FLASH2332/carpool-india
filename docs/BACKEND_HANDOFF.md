# Backend integration handoff

Reviewed Flash's supplied handoff HTML, new amplify_outputs.json and source through c79fe9b on 11 October 2026. The handoff describes a deployed Mumbai sandbox; its old note about unpushed ride steps is superseded by current main. Config validation does not prove a live two-device test passed.

**Access-control follow-up:** main is now merged through 9b9629a (hosting/lockfile fixes). This branch replaces broad reads with owner/participant rules and server-scoped discovery/leaderboard, and acceptance now grants rider access transactionally. These changes are not deployed. [ACCESS_CONTROL.md](ACCESS_CONTROL.md) supersedes the broad-read and nontransactional-acceptance findings below for this branch; they still describe the previous live backend until Flash deploys and verifies the patch.

## Integrated frontend

- ensureProfile assigns organisation/city after sign-in. Owner saves update personal/vehicle/UPI fields without sending organisation or totals.
- respondToRequest, startTrip and completeTrip drive driver actions. Completion failures refresh and warn against blind retries.
- Load owned trips, participant requests and their referenced trips, avoiding a download of all profiles/requests. Request subscriptions refresh seats because direct DynamoDB seat writes do not emit Trip events.
- Foreground driver GPS updates latest Trip position at most every five seconds. LocationPing/history is absent from the current contract.
- searchCloud, requestCloud and publishCloud provide typed map adapters; real search/publishing remain gated until map coordinates exist. Publishing validates the route line, creates DRAFT then indexes it.
- Driver displays completion's final per-rider shares for this session. Trip.shareRupees is a published estimate, not a persistent rider settlement.
- orgReport exists with OrgAdmins authorization; no frontend administrator report screen.

## WinterSun map/data contract

Search needs pickupLat/pickupLng/dropLat/dropLng and ISO departAt. Preserve search result sharedKm and pickup/drop for requestCloud, with labels. Offering needs actual start/end coordinates, a driving line as [longitude, latitude][] and road distance in km. Never publish the fixed-coordinate demo.

The SVG is illustrative. Live position is coordinates/time rather than a moving map marker. Fuel prices and demo AQI are placeholders; document provenance and missing-data behavior before calling them live.

## Gamification

Original fixed ride points remain: 5 for rider, 10 per shared rider for driver, doubled on bad-air days. Added carbon points = floor(10 × reported CO₂ kg), lifetime 1/5/10/25 kg milestones and a monthly top-10 organisation leaderboard.

Live rankings use paginated ImpactEntry org/month index reads and only userId/name/orgId profile fields. No phone/email/UPI is fetched for standings. Duplicate trip/user attribution is ignored; carbon points do not modify backend totals.

The backend also attributes riders' avoided emissions to the driver. Do not sum rankings as net organisation savings. Demo attributes avoided emissions only to riders, so driver carbon attribution differs.

## Flash: source findings to address

1. Organisation privacy: authenticated model reads are broad. Client filters/domain checks do not enforce isolation. Restrict profiles, requests, impact and trips to org/participants; protect server-managed owner fields.
2. Acceptance: respondToRequest reads PENDING, decrements seats conditionally, then updates request without a transaction. Concurrent acceptance of the same request can consume two seats. Condition request status, Trip OPEN and seats in one transaction.
3. Completion: completeTrip marks DONE before all impact/profile writes. Partial failures cannot resume; concurrent calls and profile read-modify-write can duplicate/lose totals. Add conditional transitions, recoverable idempotent per-participant writes and atomic totals.
4. Requests: validate sharedKm and pickup/drop against the route server-side; make duplicate requests conditionally unique.
5. Settlements: persist final rider amount/payee with participant access so refresh/another device can recover it.
6. Search/data: handoff notes missed north/south routes around 0.6–1 km geohash coverage. Verify boundaries. No live AQI writer is confirmed.

No backend resources were recreated, migrated or deployed by frontend integration.

## Hardcoded organisation suggestions

For the hackathon, keep a small explicit allowlist but replace example domains with real approved test domains. Keep pre-signup and ensureProfile mappings consistent. Do not add Gmail simply to bypass restrictions without agreeing product scope.

If public users are intended, a separate Public organisation is a viable choice: public users share with each other while college/company trips remain private. This requires backend access enforcement; current broad model reads defeat isolation.

Later, use separately provisioned DynamoDB or SSM domain → org configuration with narrowly scoped signup-function read access. Avoid making auth provisioning depend on data that itself depends on auth. Add an approval process for organisation/domain ownership.

## Demo and validation

Explore demo → request Ashwin's ride → switch to Ashwin → accept → view/start/end → switch to Kapil → My impact. All state stays in one browser; no payments collected.

Run npm test, npm run lint and npm run build. Full npm run typecheck also needs generated backend environment declarations. Flash must provide permitted verified test users for live two-device validation, last-seat races, repeated completion, cross-org rejection, GPS errors and final settlement recovery.
