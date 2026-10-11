/**
 * Sets up access to the AWS accounts listed in config/aws.config.json.
 *
 *   npm run aws:access            print the ~/.aws/config profiles that would be added
 *   npm run aws:access -- write   add/refresh them (only touches the managed block)
 *   npm run aws:access -- check   run sts get-caller-identity for every account
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  loadConfig,
  profileFor,
  roleAccounts,
  usingExampleConfig,
  type AwsConfig,
} from '../config/load';

const START = '# >>> greencommute (managed by scripts/aws-access.ts) >>>';
const END = '# <<< greencommute <<<';

function managedBlock(config: AwsConfig) {
  const lines = [START];
  for (const [key, account] of roleAccounts(config)) {
    if (!account.sourceProfile) {
      throw new Error(`Account "${key}" has a roleArn but no sourceProfile`);
    }
    lines.push(
      '',
      `[profile ${profileFor(config, key)}]`,
      `role_arn = ${account.roleArn}`,
      `source_profile = ${account.sourceProfile}`,
      `region = ${config.region}`,
    );
    if (account.externalId) lines.push(`external_id = ${account.externalId}`);
    if (account.sessionName) {
      lines.push(`role_session_name = ${account.sessionName}`);
    }
  }
  lines.push(END, '');
  return lines.join('\n');
}

function write(config: AwsConfig) {
  const file = join(homedir(), '.aws', 'config');
  const block = managedBlock(config);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const start = current.indexOf(START);
  const end = current.indexOf(END);
  const next =
    start !== -1 && end > start
      ? current.slice(0, start) + block + current.slice(end + END.length + 1)
      : current + (current && !current.endsWith('\n') ? '\n' : '') + block;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, next);
  console.log(`Updated ${file}`);
}

function check(config: AwsConfig) {
  let failed = false;
  for (const key of Object.keys(config.accounts)) {
    const profile = profileFor(config, key);
    try {
      const out = execFileSync(
        'aws',
        ['sts', 'get-caller-identity', '--profile', profile, '--output', 'json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true },
      );
      const id = JSON.parse(out) as { Account: string; Arn: string };
      console.log(`ok    ${key} (${profile}) -> ${id.Account} ${id.Arn}`);
    } catch (e) {
      failed = true;
      const msg = (e as { stderr?: string }).stderr?.trim() ?? String(e);
      console.log(`FAIL  ${key} (${profile}): ${msg.split('\n').pop()}`);
    }
  }
  if (failed) process.exitCode = 1;
}

const config = loadConfig();
if (usingExampleConfig()) {
  console.warn(
    'Using config/aws.config.example.json. Copy it to config/aws.config.json and edit it first.\n',
  );
}
const command = process.argv[2] ?? 'print';
if (command === 'print') console.log(managedBlock(config));
else if (command === 'write') write(config);
else if (command === 'check') check(config);
else {
  console.error(`Unknown command "${command}" (use print, write or check)`);
  process.exitCode = 1;
}
