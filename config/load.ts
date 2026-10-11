import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * An AWS account this project talks to. Give either an existing CLI `profile`, or an
 * assumable `roleArn` (plus the `sourceProfile` that holds your own credentials).
 * Secrets such as access keys never go in this file; they stay in ~/.aws/credentials.
 */
export type AccountConfig = {
  profile?: string;
  sourceProfile?: string;
  roleArn?: string;
  externalId?: string;
  sessionName?: string;
  /** Needed only when the account differs from the profile's default. */
  accountId?: string;
};

export type AwsConfig = {
  region: string;
  accounts: Record<string, AccountConfig>;
  /** Which account each stack is deployed to. */
  deploy: { geo: string; aqi: string };
  geo: {
    mapStyle: string;
    politicalView: string;
    dataSource: string;
    allowedReferrers: string[];
  };
  aqi: {
    cities: string[];
    apiKeyParameter: string;
    seed: Record<string, number>;
    /** The DynamoDB table behind `AqiDaily` (in JD's Amplify backend) and the account it lives in. */
    target: { tableName: string; account: string };
  };
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(): AwsConfig {
  const real = join(root, 'config', 'aws.config.json');
  const example = join(root, 'config', 'aws.config.example.json');
  const file = existsSync(real) ? real : example;
  return JSON.parse(readFileSync(file, 'utf8')) as AwsConfig;
}

export function usingExampleConfig() {
  return !existsSync(join(root, 'config', 'aws.config.json'));
}

/** CLI profile name for an account key: its own `profile`, or the generated `gc-<key>`. */
export function profileFor(config: AwsConfig, key: string): string {
  const account = config.accounts[key];
  if (!account) {
    throw new Error(`Account "${key}" is not defined in config/aws.config.json`);
  }
  return account.profile ?? `gc-${key}`;
}

export function roleAccounts(config: AwsConfig) {
  return Object.entries(config.accounts).filter(([, a]) => a.roleArn);
}

/** Fixed resource names, shared by the geo stack and the script that writes .env.local. */
export const GEO_NAMES = {
  map: 'greencommute-map',
  placeIndex: 'greencommute-places',
  routeCalculator: 'greencommute-routes',
  apiKey: 'greencommute-web',
} as const;
