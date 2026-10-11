/**
 * Writes today's AqiDaily rows straight to the table from config `aqi.seed`.
 * Use it when the data.gov.in key hasn't arrived, or to flip a city to a bad-air value for the demo:
 *
 *   npm run seed:aqi                    seeded values from the config
 *   npm run seed:aqi -- Delhi=320       override one or more cities
 */
import { istDate } from '../amplify/shared/aqi';
import { dynamoClient, putAqiRow } from '../infra/lambda/aqi/store';
import { loadConfig, profileFor } from '../config/load';

const config = loadConfig();
const { target, seed } = config.aqi;
process.env.AWS_PROFILE = profileFor(config, target.account);

const values: Record<string, number> = { ...seed };
for (const arg of process.argv.slice(2)) {
  const [city, aqi] = arg.split('=');
  values[city] = Number(aqi);
}

const client = await dynamoClient(config.region);
const date = istDate();
for (const [city, aqi] of Object.entries(values)) {
  await putAqiRow(client, target.tableName, { city, date, aqi });
  console.log(`AqiDaily ${city} ${date} = ${aqi}`);
}
