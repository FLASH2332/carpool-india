/**
 * Writes .env.local with the Location Service names and API key of the deployed geo stack,
 * so `npm run dev` can draw maps. Run after `npm run infra -- deploy geo`.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEO_NAMES, loadConfig, profileFor } from '../config/load';

const config = loadConfig();
const profile = profileFor(config, config.deploy.geo);
const out = execFileSync(
  'aws',
  [
    'location', 'describe-key',
    '--key-name', GEO_NAMES.apiKey,
    '--region', config.region,
    '--profile', profile,
    '--output', 'json',
  ],
  { encoding: 'utf8', shell: true },
);
const { Key } = JSON.parse(out) as { Key: string };

const env = [
  `VITE_LOCATION_REGION=${config.region}`,
  `VITE_LOCATION_API_KEY=${Key}`,
  `VITE_LOCATION_MAP=${GEO_NAMES.map}`,
  `VITE_LOCATION_PLACE_INDEX=${GEO_NAMES.placeIndex}`,
  `VITE_LOCATION_ROUTE_CALCULATOR=${GEO_NAMES.routeCalculator}`,
  '',
].join('\n');
writeFileSync(join(process.cwd(), '.env.local'), env);
console.log('Wrote .env.local');
