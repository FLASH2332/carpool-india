# GreenCommute India — team handover

Updated 11 October 2026 for Flash / JD (FLASH2332) and WinterSun / Ashwin (WinterSun23). Replaces the earlier handover.

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

| Owner | Remaining deliverable |
| --- | --- |
| Flash / JD | Real allowed test domains and two permitted verified test identities; live operation validation, transaction-safe acceptance and recoverable completion. |
| Flash / JD | Backend organisation/participant access, protected server fields, validated route distance and persistent final settlements. |
| WinterSun / Ashwin | Amazon Location map/autocomplete; pickup/drop coordinates, labels, ISO departure, [longitude, latitude] route and road distance. Use src/cloud.ts adapters. |
| WinterSun / Ashwin | Live AQI ingestion, factor provenance and demo video. Current prices/domains are placeholders. |
| Flash, repo owner | Authorize Sydney Amplify GitHub app for carpool-india and connect frontend-only builds. Manual hosting remains usable. |

Maps and backend fixes can progress together. Then test two devices sequentially: signup/profile → publish → search → request → accept → GPS/start → complete → rewards. Test last-seat concurrency, repeated completion and cross-org rejection before a live video.

## Validation and limits

Seven tests, lint and production TypeScript/Vite build pass. JS is approximately 539 kB / 157 kB gzip with a size warning. Backend-wide type checking needs generated function environment declarations from Flash's sandbox.

JSON compatibility is validated, but authenticated behavior is not verified end to end: source permits only example-corp.com / example-college.ac.in, and no permitted test identity was provided. Live maps, admin report UI, recurring trips and persistent settlement retrieval are not delivered.

See [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md) for technical findings and [AWS_SETUP.md](AWS_SETUP.md) for hosting.
