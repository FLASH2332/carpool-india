import { App } from 'aws-cdk-lib';
import { loadConfig, type AwsConfig } from '../../config/load';
import { AqiStack } from '../lib/aqi-stack';
import { GeoStack } from '../lib/geo-stack';

const config = loadConfig();
const app = new App();

/** Account/region a stack deploys to; the account falls back to whatever the CLI profile resolves to. */
const env = (config: AwsConfig, key: string) => ({
  account:
    config.accounts[key]?.accountId ?? process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region,
});

new GeoStack(app, 'GreenCommuteGeo', {
  config,
  env: env(config, config.deploy.geo),
});
new AqiStack(app, 'GreenCommuteAqi', {
  config,
  env: env(config, config.deploy.aqi),
});
