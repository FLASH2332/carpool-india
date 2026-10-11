# GreenCommute India — team handover

Updated 11 October 2026 for Flash / JD (FLASH2332) and WinterSun / Ashwin (WinterSun23). Replaces the earlier handover.

## Transit idea implementation — new branch

`kapil/transit-claims` starts from `platform-admin-dashboard` at `53c616a`. It implements ticket extraction without image storage, user-specific day-only duplicate metadata, conditional reward transactions, My Impact upload/status and scoped organisation review. It is not merged into main or deployed. See [TRANSIT_CLAIMS.md](TRANSIT_CLAIMS.md) for retention limits, configuration and release tests.

The requested base already supplies map/autocomplete components, AQI infrastructure, admin report download, platform admin UI and the previous participant-access source changes. Earlier statements below about these UI/source items being absent are historical; their live end-to-end deployment remains to be verified.

Flash/JD: review/deploy the transit backend in the existing environment, verify Textract privacy opt-out, cleanup and transactions, and regenerate outputs. Ashwin: validate transit factors and distance methodology before automatic approval. Kapil/integration: run the documented authenticated UI/lifecycle checks against fresh outputs before releasing the frontend. The old main outputs build existing rides but lack transit operations (and setOrgAdmin), so transit stays disabled with that file. All 48 tests, lint and frontend build pass; full backend checking still needs generated environment declarations. Keep the current live demo available.

## Kapil's delivered work

- React frontend and rewards on kapil/react-frontend in [draft PR #1](https://github.com/FLASH2332/carpool-india/pull/1); not merged into main.
- [Live frontend](https://demo.dl7lvp454dd36.amplifyapp.com/): manual Sydney Amplify Hosting job 3 DEPLOY/VERIFY succeeded, connected to Flash's existing Mumbai sandbox. GitHub auto-deployment remains unconnected.
- Merged main through c79fe9b. New supplied outputs validate Mumbai Auth/Data, six mutations (ensureProfile, indexTrip, requestSeat, respondToRequest, startTrip, completeTrip), searchTrips, orgReport and OrgAdmins. Outputs remain ignored.
- Profile setup via ensureProfile; owner saves exclude organisation/city/totals. Driver accept/decline/start/complete call backend operations; participant subscriptions refresh trips and seats.
- Typed map adapters for search, requests and DRAFT → indexTrip publishing in src/cloud.ts. Cloud discovery/publishing remain gated until real coordinates/routes arrive.
- Gamification: 10 carbon points/kg, 1/5/10/25 kg milestones and monthly organisation leaderboard from ImpactEntry. Backend ride points stay separate.
- Driver displays returned final rider fuel shares. Rider UI no longer presents published estimates as final payments; settlements need backend persistence.
- Browser demo request → accept → start → end → rewards verified: 22.4 km, 3.14 kg reported CO₂, 31 carbon points, 5 ride points and First footprint badge.

Preserve Flash's Mumbai backend (ap-south-1). Sydney (ap-southeast-2) hosts only the frontend. amplify.yml has no backend phase.

## Parallel work

### Latest repository check and access-control update

Checked origin/main through **9b9629a** on 11 October 2026. Flash added lockfile/hosting build fixes (74bff49, 465c86c, 9b9629a); these are merged, retaining this branch's frontend-only hosting configuration. No new maps, domain configuration, completion recovery or access-control implementation appeared in those commits. This is a source check, not proof of deployment.

Sydney project inventory still shows the existing greencommute-india app with no repository connection, so GitHub automatic hosting remains pending.

Kapil has now added **owner/participant model authorization and organisation-scoped discovery/leaderboard queries in code**, plus transactionally granted accepted-rider access. They are **not deployed**. Existing live job 3 remains unchanged. See [ACCESS_CONTROL.md](ACCESS_CONTROL.md) for the permission matrix, existing-record backfill and direct API tests.

| Owner | New release responsibilities |
| --- | --- |
| Flash / JD | Review/deploy the access patch to the existing Mumbai sandbox; audit legacy records and backfill only verified accepted/DONE rider IDs; regenerate outputs and verify direct API denial tests. |
| Kapil | Integrate fresh outputs/maps, validate frontend subscriptions under the deployed rules, then publish the coordinated frontend update. Old outputs intentionally block cloud loading in this branch. |
| Flash + Kapil | Test same-org unrelated member, pending/accepted rider, cross-org user and admin access, plus concurrent acceptance and full two-device flow. |

| Owner | Remaining deliverable |
| --- | --- |
| Flash / JD | Real allowed test domains and two permitted verified test identities; live operation validation, transaction-safe acceptance and recoverable completion. |
| Flash / JD | Review/deploy/test the new access controls; finish validated route distance, recoverable completion and persistent final settlements. |
| WinterSun / Ashwin | Amazon Location map/autocomplete; pickup/drop coordinates, labels, ISO departure, [longitude, latitude] route and road distance. Use src/cloud.ts adapters. |
| WinterSun / Ashwin | Live AQI ingestion, factor provenance and demo video. Current prices/domains are placeholders. |
| Flash, repo owner | Authorize Sydney Amplify GitHub app for carpool-india and connect frontend-only builds. Manual hosting remains usable. |

Maps and backend fixes can progress together. Then test two devices sequentially: signup/profile → publish → search → request → accept → GPS/start → complete → rewards. Test last-seat concurrency, repeated completion and cross-org rejection before a live video.

## Validation and limits

The access patch passes **15 tests**, including compiled-schema authorization and access checks, plus lint and production TypeScript/Vite build. Backend-wide type checking still needs generated function environment declarations from Flash's sandbox. This is not live API authorization/concurrency validation.

JSON compatibility is validated, but authenticated behavior is not verified end to end: source permits only example-corp.com / example-college.ac.in, and no permitted test identity was provided. Live maps, admin report UI, recurring trips and persistent settlement retrieval are not delivered.

See [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md) for technical findings and [AWS_SETUP.md](AWS_SETUP.md) for hosting.
