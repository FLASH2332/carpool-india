# Team deployment guide (three AWS accounts)

Written 2026-10-11. Each person deploys only what lives in their own account; the guide says who hands what to whom, and in which order. Commands are PowerShell from the repo root. Everything is tied to the code as of the merge of `origin/main` and `origin/kapil/react-frontend`.

## 1. Who owns what

| Person | AWS account and region | What is deployed there |
| --- | --- | --- |
| **Flash / JD** (GitHub `FLASH2332`, repo owner) | Mumbai `ap-south-1` | The Amplify Gen 2 backend: Cognito (with the pre-sign-up trigger and `OrgAdmins` group), AppSync, DynamoDB tables, all backend Lambdas, the S3 reports bucket. Plus one IAM role for Ashwin's AQI Lambda. |
| **Ashwin** (GitHub `WinterSun23`, account `589159458616`) | Mumbai `ap-south-1` | Amazon Location Service (map, place index, route calculator, browser API key) and the AQI Lambda with its 07:00 IST schedule (CDK stacks `GreenCommuteGeo`, `GreenCommuteAqi`). |
| **Kapil** (profile `kapil-aws`) | Sydney `ap-southeast-2` | Amplify Hosting for the React app only (app `greencommute-india`, ID `dl7lvp454dd36`, branch `demo`). The build file `amplify.yml` has no backend step. |

The backend must stay in Mumbai. The frontend build refuses outputs that are not `ap-south-1`.

## 2. What flows between people

| # | From | To | What | How |
| --- | --- | --- | --- | --- |
| H1 | Ashwin | Kapil | Five `VITE_LOCATION_*` values from `.env.local` | Private message. They end up in the browser bundle, so they are not a secret, but the key is billable. |
| H2 | JD | Kapil | The complete `amplify_outputs.json` | Private message or file, never git. |
| H3 | JD | Ashwin | JD's AWS account ID, the name of the `AqiDaily-...` table, the role ARN `GreenCommuteAqiWriter` | Private message. |
| H4 | Ashwin | JD | Ashwin's account ID (`589159458616`) and a chosen **external ID** | Private message. |
| H5 | JD | Everyone | Real organisation domains and the two permitted test identities | Chat, then a code change in `amplify/shared/factors.ts` (JD). |

## 3. Order of operations

```
Phase 0  everyone      identities, tools, budgets, one merged main
Phase 1  JD            deploy the backend            ->  H2, H3
         Ashwin        deploy maps (done) + AQI test ->  H1, H4
Phase 2  JD            create the role for Ashwin    ->  H3
         Ashwin        point AQI at JD's table, deploy AQI
         Kapil         set env vars, deploy the frontend
Phase 3  everyone      end-to-end check (section 8)
```

Phases 1 and 2 run in parallel across people; the arrows show who is waiting for whom.

## 4. Phase 0: everyone

1. **Merged main.** Both branches must be merged into `main` and pushed before anyone deploys from it: `kapil/react-frontend` (draft PR #1) and Ashwin's merge of `origin/main` plus `origin/kapil/react-frontend` (staged but not yet committed locally). The repo owner (Flash) decides the order. `package.json`, `package-lock.json` and `README.md` were conflict points; use the resolved versions.
2. **Tools.** Node 22 (`node -v`), AWS CLI v2 (`aws --version`), Git.
3. **A real identity, not the root user.** Use an IAM user or IAM Identity Center in your own account, never root access keys. Check:

```powershell
aws sts get-caller-identity --profile <your-profile>
```

   The `Arn` must not end in `:root`.
4. **Budget alert.** In your own account: Billing > Budgets > create a $20 monthly budget with an email alert. Do this before deploying anything.
5. **Install.** `npm ci` (the repo has an `.npmrc` with `legacy-peer-deps=true`; use `npm ci`, which also matches what Hosting runs).

## 5. JD: backend in the Mumbai account

**Before you deploy**
1. In `amplify/shared/factors.ts`, replace the placeholder `ORG_DOMAINS` (`example-corp.com`, `example-college.ac.in`) with the real allowed test domains, and the fuel prices marked `TODO` with that day's prices. Keep one list; sign-up and `ensureProfile` both read it.
2. Optional hardening listed in `docs/codebase-notes.md` section 1 (client-supplied `sharedKm`/`routeKm`, completion recovery). They are not blockers for a first deploy.

**Deploy**

```powershell
npm ci
npm run sandbox          # add "-- --once" to deploy once and exit instead of watching
```

The script uses the profile `greencommute`; if yours differs, run `npx ampx sandbox --profile <name>`. It writes `amplify_outputs.json` to the repo root (git-ignored). Check it lists `ap-south-1` for both `auth` and `data`, and the operations `ensureProfile`, `indexTrip`, `requestSeat`, `respondToRequest`, `startTrip`, `completeTrip`, `searchTrips`, `createDraftTrip`, `updateTripLocation`, `communityLeaderboard`.

**After the deploy**
3. **Send `amplify_outputs.json` to Kapil (H2).**
4. **Test users.** Pool ID is `auth.user_pool_id` in the outputs. For each of two users from the same organisation, one driver and one rider, plus one from another organisation:

```powershell
aws cognito-idp admin-create-user --user-pool-id <pool> --username <email> --user-attributes Name=email,Value=<email> Name=email_verified,Value=true --message-action SUPPRESS --profile <p> --region ap-south-1
aws cognito-idp admin-set-user-password --user-pool-id <pool> --username <email> --password '<strong password>' --permanent --profile <p> --region ap-south-1
```

   The pre-sign-up trigger also runs for admin-created users, so the email domain must be on the allow-list.
5. **Report admin.** `aws cognito-idp admin-add-user-to-group --user-pool-id <pool> --username <email> --group-name OrgAdmins --profile <p> --region ap-south-1`.
6. **Find the AQI table (H3).**

```powershell
aws dynamodb list-tables --profile <p> --region ap-south-1 --query "TableNames[?starts_with(@,'AqiDaily')]"
aws dynamodb describe-table --table-name <that name> --profile <p> --region ap-south-1 --query "Table.KeySchema"
```

   The key schema must be `city` (HASH) and `date` (RANGE). If not, tell Ashwin before he deploys.
7. **Create the role Ashwin's Lambda writes through.** Ask Ashwin for his account ID and an **external ID (H4)** (generate one with `[guid]::NewGuid()`). Save `trust.json`:

```json
{ "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::589159458616:root" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "sts:ExternalId": "<EXTERNAL_ID>" } } }] }
```

   and `policy.json` (use your own account ID and the table name from step 6):

```json
{ "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow", "Action": "dynamodb:PutItem",
    "Resource": "arn:aws:dynamodb:ap-south-1:<JD_ACCOUNT_ID>:table/<AqiDaily table name>" }] }
```

```powershell
aws iam create-role --role-name GreenCommuteAqiWriter --assume-role-policy-document file://trust.json --profile <p>
aws iam put-role-policy --role-name GreenCommuteAqiWriter --policy-name put-aqi --policy-document file://policy.json --profile <p>
```

   Send Ashwin your account ID, the table name and the role ARN `arn:aws:iam::<JD_ACCOUNT_ID>:role/GreenCommuteAqiWriter` (H3).
8. **Access tests.** Run the live acceptance tests in `docs/ACCESS_CONTROL.md` (driver, accepted/pending rider, unrelated member, other-organisation user). If the sandbox already held old trips and requests, do the backfill from that document first.
9. **GitHub for Hosting.** Authorize the Sydney Amplify GitHub app for `carpool-india` so Kapil can connect automatic builds (optional; manual hosting works).

## 6. Ashwin: maps and AQI in account `589159458616`

**Already done:** the `GreenCommuteGeo` stack, `.env.local`, and a verified key (map, search and route all return 200 from `localhost:5173`).

**Phase 1**
1. **Replace the root credentials** with an IAM user or Identity Center profile and delete the root access keys (see `docs/setup.md` Level 1). Set `accounts.own.profile` in `config/aws.config.json`.
2. **Send Kapil the five `VITE_LOCATION_*` values (H1).** Print them without the key on screen with `Get-Content .env.local`, then send privately.
3. **Choose an external ID** and send it with your account ID to JD (H4).
4. **Optional, before the final map deploy:** in `infra/lib/geo-stack.ts` change `intendedUse` from `SingleUse` to `Storage` because trips and requests store the place names and coordinates; then `npm run infra -- deploy geo`. Check the borders on the map using the scratch page in `docs/setup.md` Level 3.
5. **Request the data.gov.in key**, then store it in SSM in your account (the Lambda reads it there):

```powershell
aws ssm put-parameter --name /greencommute/data-gov-in-api-key --type SecureString --value <key> --region ap-south-1 --profile <p>
```

   Until it arrives, the Lambda uses the values in `aqi.seed`.

**Phase 2 (after JD sends H3)**
6. Edit `config/aws.config.json`:

```json
"accounts": {
  "own":  { "profile": "<your-profile>" },
  "data": { "sourceProfile": "<your-profile>",
            "roleArn": "arn:aws:iam::<JD_ACCOUNT_ID>:role/GreenCommuteAqiWriter",
            "externalId": "<EXTERNAL_ID>", "sessionName": "ashwin" }
},
"deploy": { "geo": "own", "aqi": "own" },
"aqi": { "cities": ["Delhi", "Bengaluru"],
         "target": { "tableName": "<AqiDaily table name from JD>", "account": "data" } }
```

7. Your IAM user needs permission to assume that role: allow `sts:AssumeRole` on `arn:aws:iam::<JD_ACCOUNT_ID>:role/GreenCommuteAqiWriter` in a policy attached to it.
8. Create the profiles and check them:

```powershell
npm run aws:access -- write
npm run aws:access -- check
```

   Both `own` and `data` must say `ok`.
9. Deploy and test the AQI Lambda:

```powershell
npm run infra -- deploy aqi
npm run seed:aqi -- Delhi=320
aws dynamodb get-item --table-name <table> --key '{\"city\":{\"S\":\"Delhi\"},\"date\":{\"S\":\"<today IST>\"}}' --profile gc-data --region ap-south-1
```

   The item must show `badAir` true. Then invoke the real Lambda once (Level 2 in `docs/setup.md`) and read its log.
10. Tell Kapil the AQI row exists, so the banner can be checked.

## 7. Kapil: frontend in the Sydney account

**Phase 1:** `aws login --profile kapil-aws --region ap-southeast-2`, confirm `aws sts get-caller-identity`, set a budget alert, and make sure nothing in `docs/AWS_SETUP.md` has changed.

**Phase 2 (after JD sends H2 and Ashwin sends H1)**
1. **Test locally.** Put `amplify_outputs.json` in the repo root and the five values in `.env.local`, then:

```powershell
npm ci
npm test
npm run dev -- --host 127.0.0.1
```

   Old outputs intentionally stop cloud mode; the new outputs must list `communityLeaderboard`, `createDraftTrip` and `updateTripLocation`.
2. **Wire the map components** (code, not deploy): replace the SVG `RouteMap` and the fixed coordinates in `src/App.tsx` with `src/components/RouteMap.tsx`, `PlaceAutocomplete.tsx` and `calculateRoute()` from `src/lib/location.ts`. Pass memoized arrays to `RouteMap`. `AqiBanner` can replace the local banner, or keep yours and rename the CSS class `.aqi-banner` in one place.
3. **Set Hosting environment variables** in Amplify (Sydney) for the app: `AMPLIFY_OUTPUTS_JSON` (the whole outputs file as one JSON string), `VITE_LOCATION_REGION`, `VITE_LOCATION_API_KEY`, `VITE_LOCATION_MAP`, `VITE_LOCATION_PLACE_INDEX`, `VITE_LOCATION_ROUTE_CALCULATOR`.
4. **Deploy.**
   - Manual deployment (current): the build runs on your machine, so make sure `amplify_outputs.json` and `.env.local` are in place, run `npm run build`, zip `dist/`, and upload it to the `demo` branch.
   - Connected deployment (once Flash authorizes the GitHub app): connect the branch and let Hosting run `amplify.yml`; the variables above are used then.
5. The map key only accepts `localhost:5173` and `*.amplifyapp.com`. If you use a custom domain, ask Ashwin to add it to `geo.allowedReferrers` and redeploy `geo`.

## 8. End-to-end check (all three, after Phase 2)

| # | Check | Expected |
| --- | --- | --- |
| 1 | Sign up with a Gmail address | Refused |
| 2 | Sign up with an allowed domain, and with a sub-domain | Both accepted; `ensureProfile` creates the profile in both cases |
| 3 | Driver searches a place and publishes a trip | A route is drawn; the trip becomes OPEN |
| 4 | Rider from the same organisation searches near the route | The trip appears; a rider from another organisation does not see it |
| 5 | Rider requests; driver accepts on a second device | The rider's screen updates within a few seconds; seats drop by one |
| 6 | Two riders ask for the last seat at the same moment | Exactly one is accepted |
| 7 | Driver starts, the position updates, driver ends the trip | Summary shows km, CO2, rupees and a UPI link; impact appears in My Impact |
| 8 | AQI for Delhi set to 320 (`npm run seed:aqi -- Delhi=320`) | Red banner; the next completed trip gives doubled points |
| 9 | `OrgAdmins` user downloads the monthly report | CSV totals match the impact pages |
| 10 | Direct API calls as an unrelated user | Other people's trips, requests, profiles and impact are denied |

## 9. If something fails

- **`prebuild` stops the build:** the outputs are missing or not for `ap-south-1`, or lack one of the required operations. Ask JD for fresh outputs.
- **Map shows 403:** the page's origin is not in `geo.allowedReferrers`.
- **Map says not configured:** `.env.local` / Hosting variables are missing; restart `npm run dev` after changing them.
- **`aws:access -- check` fails for `data`:** the role ARN, external ID or the `sts:AssumeRole` permission is wrong.
- **AQI Lambda log says `AccessDenied` on PutItem:** the role policy's table ARN or name is wrong.
- **AQI Lambda log says no key:** expected until the data.gov.in key is stored; it falls back to seeded values.
- **Banner says AQI not available:** no row for today's IST date for that city; city names must match exactly (`Delhi`, `Bengaluru`).
- **Hosting `npm ci` fails:** the lockfile does not match the build's npm; regenerate with `npm install` and push (JD saw this before).
- **Sign-up works but profile creation fails:** the email's domain is on the sign-up allow-list but the code deployed differs between auth and `ensureProfile`; both must come from the same `main`.

## 10. Tearing down

- JD: stop the sandbox and delete it with `npx ampx sandbox delete --profile <p>`.
- Ashwin: `npm run infra -- destroy aqi` then `destroy geo`.
- Kapil: delete the Hosting app or branch in Amplify (Sydney).
- Remove any test IAM roles and users, and confirm the budget alerts stay on.
