# GreenCommute India — Kapil's handover

Status checked on 11 October 2026. For Flash / JD (`FLASH2332`) and WinterSun / Ashwin (`WinterSun23`). The feature specification assigns backend, React frontend, and maps/data/video by layer.

## Kapil's delivered work

- React/TypeScript frontend on `kapil/react-frontend`, in [draft PR #1](https://github.com/FLASH2332/carpool-india/pull/1). Not merged into main.
- Live frontend: https://demo.dl7lvp454dd36.amplifyapp.com/ . Amplify app `greencommute-india`, branch `demo`, Sydney (`ap-southeast-2`); deployment job 2 succeeded. Manual ZIP deployment; GitHub automatic deployment remains unconnected.
- Cognito auth screens/session handling, profile/vehicle settings, cloud reads/subscriptions, foreground GPS on an already-active owned trip, summaries/impact and UPI links. Real auth/profile and the full two-device cloud flow have not been verified end to end.
- Browser-local demo: request → driver accepts → starts → ends → rider sees impact. Fictional riders, seeded AQI, fixed coordinates and illustrative SVG map are labeled.
- Frontend-only `amplify.yml`, Node 22.20.0 and `AMPLIFY_OUTPUTS_JSON` validation. No backend deployment phase.
- Flash's `c008f11` (`ensureProfile`, `indexTrip`) and `2862360` (`searchTrips`) are merged into this branch. The supplied outputs lack these operations; their deployment is unverified.

Preserve Flash's existing Mumbai backend (`ap-south-1`). Kapil's Sydney project hosts the frontend only. Do not deploy a second sandbox or migrate the backend to finish hosting.

## Parallel work

| Owner | Next work | Integration deliverable |
| --- | --- | --- |
| Flash / JD | Configure real organisation domains and deploy/verify `ensureProfile`, `indexTrip`, `searchTrips` in the existing backend. | Fresh generated outputs, permitted test identities/domains and operation contracts. Keep outputs out of Git. |
| Flash / JD | Request/accept/decline/cancel/start/complete operations; participant/org access controls and protected server fields. | Atomic last-seat acceptance, idempotent completion and verified driver/rider test identities. Broad model reads are not an org access boundary. |
| WinterSun / Ashwin | Amazon Location map, place autocomplete, real route calculation and location display. | React components; selected coordinates/labels; `[longitude, latitude][]` line; road distance in km and duration. Search needs pickup/drop coordinates and departure time. |
| WinterSun / Ashwin | India AQI/fuel factors and video preparation. | Data provenance/update times, missing-data behavior, agreed per-person impact factors and recording script. Current demo assumes no detour and attributes avoided CO2 to riders only. |
| Flash, repository owner | Authorize [Sydney Amplify GitHub app](https://github.com/apps/aws-amplify-ap-southeast-2/installations/new), limited to `carpool-india`. | Amplify can see `FLASH2332/carpool-india`. Kapil's installation targets did not include FLASH2332; this was blocked in his session. |

Backend and map work can happen at the same time using the coordinate contract above. Neither depends on automatic hosting. A local demo video is possible now if it is clearly labeled; a live two-device video needs integration and validation first.

## Sequential integration

1. Flash deploys operations/configures accepted domains and shares fresh outputs securely. Never share passwords, tokens or CLI keys in Git/chat.
2. Connect `ensureProfile` so server logic sets organisation/city; save vehicle/UPI fields separately. Surface domain rejection rather than bypassing it.
3. Integrate WinterSun's places/routes. Call `searchTrips` with actual coordinates; use walking-distance results instead of the current label-substring search/departure sorting. Create a valid DRAFT trip and publish with `indexTrip`.
4. Wire server ride mutations; unblock real-account actions only after authorization/transitions are verified. Connect the agreed location-history contract when available.
5. Configure a Git-connected frontend app in Sydney, using `kapil/react-frontend`, committed frontend-only build settings and `dist`. Set `AMPLIFY_OUTPUTS_JSON` to complete latest Mumbai outputs. Do not add `ampx pipeline-deploy` or a backend deployment role. Keep the working manual demo until the replacement is verified.
6. Test two devices: allowed signup/profile, routes, request/subscription, concurrent last-seat acceptance, driver-only transitions, cross-org rejection, GPS consent/errors and exactly-once impact. Then record the live flow.

## Validation and limits

After merging `2862360`, the frontend production build (including TypeScript), lint and all four domain tests passed. Vite reports a bundle-size warning (approximately 525 kB JS, 154 kB gzip). Hosting job 2 remains successful; the backend-only merge does not add new runtime frontend behavior.

Run `npm test`, `npm run lint`, `npm run build` after integration. Backend `npm run typecheck` needs generated `$amplify/env/ensure-profile`, `$amplify/env/index-trip` and `$amplify/env/search-trips` declarations from the backend owner's environment. Do not invent runtime config or deploy a second sandbox just to satisfy this check.

The real ride workflow is incomplete. Maps, live AQI and backend authorization fixes remain pending. Location history/TTL, reports and recurring commutes are not implemented in this frontend. See [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md) for technical details/demo steps and [AWS_SETUP.md](AWS_SETUP.md) for hosting.
