# GreenCommute India

Office and college carpooling. React + Vite + TypeScript frontend, AWS Amplify Gen 2 backend
(Cognito, AppSync + DynamoDB, Lambda) in `ap-south-1`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run sandbox` | Deploy your personal cloud sandbox and watch `amplify/` for changes (AWS profile `greencommute`). Writes `amplify_outputs.json`. |
| `npm run dev` | Start the Vite dev server (needs `amplify_outputs.json`). |
| `npm run lint` | Lint with oxlint. |
| `npm run typecheck` | Type-check the frontend and the backend. |
| `npm run build` | Production build of the frontend. |

## Layout

- `amplify/auth/resource.ts` – Cognito, email sign-in.
- `amplify/data/resource.ts` – data models and authorization rules.
- `amplify/shared/factors.ts` – emission factors, fuel prices, organisation domains (placeholders marked TODO).
- `src/` – frontend.
