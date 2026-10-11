# Public transport rewards

Implemented on `kapil/transit-claims`, created from `origin/platform-admin-dashboard` at `53c616a`. Not merged into main or deployed. Existing Mumbai backend and Sydney demo are preserved.

## Behaviour and scope

- My Impact includes a scan form, today's own claims and an OrgAdmins review queue. Eligibility follows the idea: a vehicle other than NONE, with a supported saved fuel factor.
- JPEG/PNG bytes under 450 kB go directly to synchronous Textract in Lambda memory. No ticket S3 object, image hash, raw OCR text or browser storage is used. The file input is cleared immediately. Handlers never log events/OCR responses; AppSync field logging is disabled.
- Extraction supports clearly identified metro/bus single-journey tickets with one unambiguous YYYY-MM-DD or DD-MM-YYYY date and readable From/Source/Origin and To/Destination labels. Missing/ambiguous dates/routes, undated passes and carpool screenshots fail closed with an explanation. These unsupported formats cannot enter review because no image is available to verify them later. Carpool uses its existing rewards flow.
- Duplicate lookup uses the **authenticated user's India-day partition**, never another user's metadata. A digest of extracted text identifies the claim; it is not an image hash. A ticket number identifies date/mode/ticket despite route/time variations. Without a number, normalized date/mode/route/time identify repeats. Rejected claims also block repeats that day. Distinct journeys and carpool/transit on the same day are allowed.
- First three confident, identifiable claims can auto-approve only when automatic approval is explicitly enabled and a server-calculated distance is unambiguous. Fourth onwards, OCR confidence below 95%, missing ticket number or uncertain distance requires review. Automatic approval defaults **off** because factors are provisional. OCR confidence measures readability, not proof of travel; forged/edited screenshots need issuer verification.
- Distance is the counterfactual driving route calculated server-side using extracted endpoints and Amazon Location, in the backend's own Region. No browser-supplied distance earns automatic points. Ambiguous geocoding/unavailable routing sends the claim to review. Admins verify the journey with the claimant and supply a driving distance greater than 0 and no more than 200 km. They must reject evidence they cannot verify; stored images are unavailable.
- Points follow the idea's formula: `round(5 * (1 + 0.5 * clamp((vehicleFactor - transitFactor) / vehicleFactor, 0, 1)))`, doubled on bad-air days. CO₂ avoided is distance times max(vehicleFactor minus transitFactor, 0). Missing AQI is not bad air. Factors in `amplify/shared/factors.ts` are TODO estimates: metro 0.03 and bus 0.05 kg/passenger-km, not operator measurements.
- Submission, daily claim count and any automatic reward are one conditional transaction. Review atomically changes PENDING to APPROVED/REJECTED with ImpactEntry creation and profile increments. Concurrent/repeated approval cannot award twice. Org/vehicle/fuel must still match at award time. Limits are 20 stored claims and 30 OCR attempts per user/day.
- Review requires OrgAdmins group membership **and** current membership in the caller's organisation's adminEmails list. Self-review and cross-org review are denied. No client can directly access the metadata table; listing/review use scoped functions.
- Approved TRANSIT impact enters My Impact, standings and reports. Reports exclude repeated driver attribution and append a `transit_journeys` column. Durable reward rows contain normal impact fields and a random reward identifier, not extracted ticket/route data. Direct transaction writes do not emit AppSync events; the UI refreshes after approval, and other devices use Refresh.

## Day-only retention

Metadata, review/rejection notes and counts expire at **00:00 Asia/Kolkata following the ticket day**. APIs/UI deny expired records immediately. A cleanup Lambda runs every minute and deletes expired rows; DynamoDB TTL is a fallback. No backups/PITR or image bucket are provisioned for the metadata table.

Physical deletion is asynchronous and can lag midnight, or longer if cleanup fails. Do not promise exact-second erasure. Monitor cleanup errors and verify actual deletion before production. Pending reviews expire without points; approved impact totals remain for rewards/reporting.

A ticket dated the 9th can be claimed on the 9th. Its metadata expires at midnight. Scanning it on the 10th is rejected as a past-date ticket even after metadata deletion. Stable extracted ticket identifiers drive repeat detection; edited images/OCR variation without an identifier are not a cryptographic fraud guarantee.

## Privacy activation

AWS may retain Textract inputs for service improvement without an AI-services opt-out. The deployment owner must verify the applicable opt-out is active, then set `TRANSIT_OCR_OPT_OUT_CONFIRMED=true` during backend synthesis/deployment. Default false rejects scans **before bytes reach Textract**. The flag does not create the policy. If the managed project cannot verify/apply it, keep scanning disabled until a compliant extractor is chosen.

References: [Textract input retention and opt-out](https://aws.amazon.com/textract/faqs/), [synchronous byte processing](https://docs.aws.amazon.com/textract/latest/dg/sync-calling.html), [DynamoDB TTL timing](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html).

## Deployment handover

1. Flash/JD reviews against platform-admin-dashboard and deploys only with the existing backend's authorized environment. Check CDK diff for unintended replacements. The new metadata table deliberately has deletion policy Delete; existing tables/resources are unchanged. No second backend in Kapil's Sydney hosting project.
2. Verify Textract opt-out, availability and IAM. Keep payload traces, browser analytics and error capture from recording images. Do not commit passwords or real tickets.
3. Optional: configure `TRANSIT_PLACE_INDEX` and `TRANSIT_ROUTE_CALCULATOR` to existing Location resources in the **same backend Region**, at synthesis/deployment. They generate scoped IAM and Lambda environment. Without them all claims need admin-verified driving distance. Do not reuse a browser API key in Lambda.
4. Ashwin verifies factor provenance and counterfactual-distance methodology. Keep `TRANSIT_AUTO_APPROVE=false` until operator/evidence verification is reviewed. The true path exists for a controlled pilot; OCR alone does not prove purchase or travel.
5. Generate function environment declarations and run backend-wide type checks. Verify schedule/TTL/deletion and monitor cleanup failures.
6. Generate fresh outputs with submitTransitClaim, reviewTransitClaim and transitClaimsToday. The supplied amplify_outputs.main.json includes the earlier access-controlled ride APIs, but **none of the transit APIs** and no setOrgAdmin. It builds successfully and safely disables transit rather than calling unsupported operations. It was copied only to the ignored local outputs file, not committed or edited.
7. Run live checks below before a coordinated frontend release. Inherited amplify.yml is unchanged: AMPLIFY_OUTPUTS_JSON selects frontend-only hosting; without it, hosting deploys the backend. Verify the intended mode before connecting another hosting branch. The current live demo stays available.

## Validation and release checks

48 tests pass: existing ride/auth/AQI/rewards plus metadata extraction, date boundaries, per-user partitioning, points, threshold, compiled schema authorization, reports and synthesized metadata-table/IAM configuration. Lint and frontend TypeScript/Vite production build pass. Backend checking reports only missing generated `$amplify/env/*` modules; actual OCR/DynamoDB transactions and full backend deployment are not verified here. The map bundle retains a size warning. npm install reports dependency advisories; no broad dependency upgrade was attempted.

- Same user/same ticket twice: one claim/reward/count increment. Same metadata/different user: no cross-user duplicate rejection. Repeat after normalized labels and unchanged number. Distinct ticket numbers remain separate.
- Verify first-three/fourth-review behaviour, low confidence, missing identifier, unsupported passes, missing route/date, future/past dates, invalid bytes/size, OCR limits and missing vehicle/fuel.
- Race submissions and two admin approvals: one reward/profile increment; transaction failure leaves no partial award. Verify self/cross-org/stale admin denials and forged user/org/points through direct GraphQL.
- Exercise India midnight: immediate logical expiry, pending claim unreviewable, metadata/counts actually deleted, yesterday's screenshot rejected. Test in-flight midnight operations and cleanup failure.
- Confirm no image/raw OCR in S3, DynamoDB, CloudWatch/AppSync logs or browser storage; verify provider opt-out. Only normal impact records persist.
- Regression-test original two-device carpool flow, platform dashboard and report download. Refresh impact/standings on both devices and verify transit report totals.
