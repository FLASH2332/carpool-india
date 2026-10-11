# GreenCommute India

Office and college carpooling. React + Vite + TypeScript frontend, AWS Amplify Gen 2 backend
(Cognito, AppSync + DynamoDB and Lambda workflows) in `ap-south-1`.

[Hosted demo](https://demo.dl7lvp454dd36.amplifyapp.com/) — frontend hosted in Kapil's Sydney project, connected to Flash's Mumbai sandbox. This is a manual deployment; GitHub auto-deployment is not connected yet.

The React app includes authentication, profiles, an overview, ride search, ride offers,
requests, a live-trip panel, summaries and My Impact. Explore the labelled browser-local
demo to click through a full rider/driver journey. Cognito and existing AppSync model
reads/profile writes connect to Flash's sandbox via `amplify_outputs.json`.

**Cloud workflow status:** the new handoff includes server ride operations. Profile
setup and driver actions are wired; real search/publishing need Amazon Location map
coordinates and permitted test identities. This branch adds owner/participant access
and organisation-scoped queries, pending deployment by Flash to the existing Mumbai
sandbox. It must receive fresh outputs before cloud mode is enabled. Completion safety
still needs work. A live two-device workflow has not been verified.

My Impact includes CO₂ carbon points, milestone badges and a monthly community
leaderboard, separate from backend ride points.

- [AWS / Builder ID / Amplify Hosting setup](docs/AWS_SETUP.md)
- [Backend and maps handoff, demo steps and limitations](docs/BACKEND_HANDOFF.md)
- [Team responsibilities and validation status](docs/TEAM_HANDOVER.md)
- [Access-control changes and deployment checklist](docs/ACCESS_CONTROL.md)

Install with `npm ci`, copy Flash's generated outputs to the repository root, then
run `npm run dev`. For Hosting, supply `AMPLIFY_OUTPUTS_JSON` as described in the setup
guide; `amplify.yml` builds only the frontend against that existing backend.

## Commands

| Command | What it does |
| --- | --- |
| `npm run sandbox` | Deploy your personal cloud sandbox and watch `amplify/` for changes (AWS profile `greencommute`). Writes `amplify_outputs.json`. |
| `npm run dev` | Start the Vite dev server (needs `amplify_outputs.json`). |
| `npm run lint` | Lint with oxlint. |
| `npm run typecheck` | Type-check the frontend and the backend. |
| `npm run build` | Production build of the frontend. |
| `npm test` | Unit tests: demo seat transitions, impact attribution and UPI/fuel calculations (frontend), plus the impact formulas, AQI maths, AQI feed parser and email-to-organisation matcher (backend). |
| `npm run aws:access` | Print (`-- write` to apply, `-- check` to verify) the AWS CLI profiles for the accounts in `config/aws.config.json`. |
| `npm run infra -- deploy geo` | Deploy the Location Service stack (`geo`) or the AQI Lambda and 07:00 IST schedule (`aqi`) to the configured account. |
| `npm run geo:env` | Write the map names and API key of the deployed `geo` stack into `.env.local`. |
| `npm run seed:aqi` | Write today's `AqiDaily` rows from the config (`-- Delhi=320` to override). |

## Layout

- `amplify/auth/resource.ts` – Cognito, email sign-in.
- `amplify/data/resource.ts` – data models and authorization rules.
- `amplify/shared/factors.ts` – emission factors, fuel prices, organisation domains (placeholders marked TODO).
- `amplify/shared/` – emission factors, `impact.ts` (fuel share, CO2, points) and `aqi.ts` (CPCB categories, AQI maths, bad-air lookup) and `org.ts` (email to organisation); pure TypeScript, usable from Lambdas and the app.
- `amplify/auth/pre-sign-up/` – Cognito trigger that refuses non-organisation emails (E1).
- `infra/` – CDK app for the resources outside the Amplify backend: Location Service (`geo`) and the AQI Lambda (`aqi`).
- `config/` – `aws.config.example.json` shows how to point each stack, and cross-account access, at an AWS account. Copy it to `config/aws.config.json` (git-ignored).
- `src/components/` – `RouteMap`, `PlaceAutocomplete`, `AqiBanner`; `src/lib/location.ts` wraps place search and routing.
- `src/` – frontend.

## Using other AWS accounts

List each account in `config/aws.config.json`: either an existing CLI `profile`, or a `roleArn` (plus `externalId`) assumed from your `sourceProfile`. `deploy` says which account each stack goes to, and `aqi.target` says where the `AqiDaily` table lives. Then run `npm run aws:access -- write` and `npm run aws:access -- check`. Credentials stay in `~/.aws`; nothing secret goes in the config.
