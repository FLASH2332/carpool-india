# GreenCommute India

Office and college carpooling. React + Vite + TypeScript frontend, AWS Amplify Gen 2 backend
(Cognito, AppSync + DynamoDB; Lambda workflows pending) in `ap-south-1`.

The React app includes authentication, profiles, an overview, ride search, ride offers,
requests, a live-trip panel, summaries and My Impact. Explore the labelled browser-local
demo to click through a full rider/driver journey. Cognito and existing AppSync model
reads/profile writes connect to Flash's sandbox via `amplify_outputs.json`.

**Cloud workflow status:** the current backend is model/auth scaffolding. It does not
yet implement the Lambda ride workflows, Amazon Location maps or organisation access
boundaries from the feature spec. Real ride mutations are blocked until those exist;
demo data is never represented as a working two-device cloud ride.

- [AWS / Builder ID / Amplify Hosting setup](docs/AWS_SETUP.md)
- [Backend and maps handoff, demo steps and limitations](docs/BACKEND_HANDOFF.md)

Install with `npm ci`, copy Flash's generated outputs to the repository root, then
run `npm run dev`. For Hosting, supply `AMPLIFY_OUTPUTS_JSON` as described in the setup
guide; `amplify.yml` builds only the frontend against that existing backend.

## Commands

| Command             | What it does                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run sandbox`   | Deploy your personal cloud sandbox and watch `amplify/` for changes (AWS profile `greencommute`). Writes `amplify_outputs.json`. |
| `npm run dev`       | Start the Vite dev server (needs `amplify_outputs.json`).                                                                        |
| `npm run lint`      | Lint with oxlint.                                                                                                                |
| `npm run typecheck` | Type-check the frontend and the backend.                                                                                         |
| `npm run build`     | Production build of the frontend.                                                                                                |
| `npm test`          | Verify demo seat transitions, impact attribution and UPI/fuel calculations.                                                      |

## Layout

- `amplify/auth/resource.ts` – Cognito, email sign-in.
- `amplify/data/resource.ts` – data models and authorization rules.
- `amplify/shared/factors.ts` – emission factors, fuel prices, organisation domains (placeholders marked TODO).
- `src/` – frontend.
