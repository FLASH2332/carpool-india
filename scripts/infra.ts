/**
 * Runs a CDK command for one stack using the AWS profile configured for it.
 *
 *   npm run infra -- deploy geo     (stacks: geo, aqi; commands: bootstrap, synth, diff, deploy, destroy)
 */
import { spawnSync } from 'node:child_process';
import { loadConfig, profileFor, usingExampleConfig } from '../config/load';

const STACKS = { geo: 'GreenCommuteGeo', aqi: 'GreenCommuteAqi' } as const;
const [command, target] = process.argv.slice(2);
const config = loadConfig();

if (!command || !(target in STACKS)) {
  console.error('Usage: npm run infra -- <bootstrap|synth|diff|deploy|destroy> <geo|aqi>');
  process.exit(1);
}
if (usingExampleConfig()) {
  console.error('Copy config/aws.config.example.json to config/aws.config.json and edit it first.');
  process.exit(1);
}

const stack = STACKS[target as keyof typeof STACKS];
const profile = profileFor(config, config.deploy[target as keyof typeof STACKS]);
const args =
  command === 'bootstrap'
    ? ['cdk', 'bootstrap', '--profile', profile]
    : ['cdk', command, stack, '--profile', profile, '--require-approval', 'never'];
console.log(`> npx ${args.join(' ')}`);
const result = spawnSync('npx', args, { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
