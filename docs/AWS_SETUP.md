# Kapil's AWS and hosting setup

Flash's existing backend uses Mumbai **ap-south-1**. Kapil selected Sydney **ap-southeast-2** for his new AWS experience project and the separate CLI profile **kapil-aws**. A CLI region setting does not migrate Flash's resources. The commute city is independent of the AWS region.

## Account distinctions

- **AWS Builder ID:** profile for Builder Center and developer/learning tools. Separate from an AWS cloud account; it does not grant Amplify deployment access or restore expired Academy courses/credits.
- **AWS cloud account:** Management Console, billing, IAM, Amplify, Cognito and AppSync resources.
- **AWS Academy Learner Lab:** institution-provided temporary lab. The supplied screenshot says the course ended; it does not establish that credits were exhausted. Ask the instructor/Vocareum for access to a new course or lab if that is your intended hosting environment.
- **GitHub:** existing account `Kapilkannaa`, email `kapilkannaa@gmail.com`. The project repository is `FLASH2332/carpool-india`.

## Check or create Builder ID yourself

1. Open https://profile.aws.amazon.com/ or https://builder.aws.com/.
2. Try signing in with `kapilkannaa@gmail.com`, using the original method (email, Google, GitHub or Amazon).
3. If you already have a profile, reuse it. If email sign-in cannot be recovered, use the recovery flow rather than guessing passwords.
4. If there is no account, choose Create AWS Builder ID, use that email and your name, verify the emailed code, choose a new unique password and finish creation. Add MFA and a recovery email.

No screenshots prove that a Builder ID exists. Browser account inspection was unavailable, so its status is unverified. Do not reuse the password exposed in the supplied screenshots.

## CLI authentication

AWS CLI **2.37.12** and `uv` **0.13.0** are now installed. The original system CLI was **2.34.12**, without Agent Toolkit commands, and may still resolve first in an existing terminal. The existing `greencommute` profile remains configured for Mumbai; `kapil-aws` is configured for Sydney and JSON output. Credentials must be verified before deployment.

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\Amazon\AWSCLIV2;$env:USERPROFILE\.local\bin;$env:Path"
aws --version
aws configure set region ap-southeast-2 --profile kapil-aws
aws login --profile kapil-aws --region ap-southeast-2
aws sts get-caller-identity --profile kapil-aws --region ap-southeast-2
aws amplify list-apps --profile kapil-aws --region ap-southeast-2
```

Complete sign-in and any verification in the browser yourself. `aws login` uses temporary credentials and requires an AWS Management Console identity. An IAM user/role needs `SignInLocalDevelopmentAccess` for that login flow, plus separate permissions for the services you use. If your account uses IAM Identity Center, use `aws configure sso --profile greencommute` and `aws sso login --profile greencommute` instead. Builder ID alone cannot authenticate deployment access. Do not paste passwords, keys or OTPs into chat or source control.

For an active Academy lab, use its provided temporary access key, secret and session token in a distinct lab profile, renew when the session expires, and follow its region/service restrictions. Do not assume this ended course supports Mumbai hosting.

The backend belongs to Flash's sandbox. Keeping it requires Flash to leave it running. Your personal account/credits cannot be verified or used to manage Flash's resources without an authorised identity in that AWS account.

## Amplify Hosting: existing backend, frontend only

1. Sign in to the intended AWS cloud account. Check Billing/Credits and remaining eligibility there; a new Builder ID does not produce cloud credits. Set a budget alert before billable hosting.
2. For Kapil's new project, open Amplify in Sydney: https://ap-southeast-2.console.aws.amazon.com/amplify/home?region=ap-southeast-2. Confirm its assigned region in AWS Settings → View all projects → Overview → Additional info. Only manage regional resources in that assigned region. Deploying into Flash's Mumbai project instead requires an authorized identity there; do not recreate his backend in Sydney.
3. Check for an existing app connected to this repo. Reuse it if present. Otherwise create a frontend Hosting app and connect `FLASH2332/carpool-india` using the GitHub account with repository access. Accept any outstanding collaborator invitation first. The owner's GitHub app installation must allow access to this repo.
4. Select the frontend branch. The repo includes `amplify.yml`: `npm ci`, `npm run build`, artifact directory `dist`. This config intentionally has no backend deployment phase, preserving Flash's existing sandbox.
5. Add environment variable `AMPLIFY_OUTPUTS_JSON` containing the entire current `amplify_outputs.json` supplied by Flash, as one JSON string. `prebuild` writes it into the build workspace and validates Mumbai Auth/Data. These are frontend connection details, not AWS CLI credentials. Never put IAM secrets in this variable or any Vite variable.
6. Build/deploy; open the returned `amplifyapp.com` URL. Test the labelled demo immediately, then real Cognito sign-in/profile against the sandbox. The full cloud ride flow still needs the backend/map handoff.

The Hosting build selects Node **22.20.0**, as used locally; the installed Vite version requires a recent Node runtime. All navigation currently stays at `/` (no deep-link rewrite is required).

## Agent Toolkit for AWS

Follow the [official setup instructions](https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/setup-instructions/setup.md). Install the latest AWS CLI and `uv`, complete `aws login` above, and verify STS first. Then run:

```powershell
aws configure agent-toolkit --yes --region us-east-1 --profile kapil-aws
aws agent-toolkit list-available-skills --region us-east-1 --profile kapil-aws
```

Finish the browser/interactive wizard yourself. Toolkit uses **us-east-1**; this does not change the project's Sydney region. Preserve generated MCP settings and add `AWS_MCP_PROXY_PROFILES=kapil-aws` to the AWS MCP environment. Apply the new AWS experience starter rules after setup. Builder ID and cloud deployment authentication remain separate.

Check `aws freetier get-account-plan-state --profile kapil-aws --region ap-southeast-2` and AWS Settings/Billing before creating services. This setup does not establish credit eligibility or authorize a paid-plan upgrade.

## Local frontend

```powershell
cd D:\others\cloud_project\carpool-india
npm ci
# Copy the supplied amplify_outputs.json to this repo root if absent.
npm run dev -- --host 127.0.0.1
```

Use `npm run build` for a `dist/` artifact. Keep generated outputs ignored, and regenerate from Flash's backend when its schema changes. Do not run `npm run sandbox` merely to host the frontend: that command deploys a separate backend using your account and incurs resources.

The committed `.npmrc` uses `legacy-peer-deps=true` consistently for install and CI: the existing Amplify dependency tree otherwise produces a bundled-peer lockfile error. The lockfile was regenerated with this setting and a clean `npm ci` succeeded. Stop the dev server before reinstalling on Windows so Vite's native bindings are not locked.

## Official documentation

- https://docs.aws.amazon.com/signin/latest/userguide/differences-builder-id.html
- https://docs.aws.amazon.com/signin/latest/userguide/create-builder-id.html
- https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html
- https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html
- https://docs.aws.amazon.com/amplify/latest/userguide/edit-build-settings.html
