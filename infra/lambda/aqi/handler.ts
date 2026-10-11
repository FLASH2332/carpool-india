import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { fetchCityAqi } from './fetch';
import { istDate } from '../../../amplify/shared/aqi';
import { dynamoClient, putAqiRow } from './store';

const env = (name: string) => process.env[name];

async function loadApiKey(): Promise<string | null> {
  const name = env('API_KEY_PARAMETER');
  if (!name) return null;
  try {
    const { Parameter } = await new SSMClient({}).send(
      new GetParameterCommand({ Name: name, WithDecryption: true }),
    );
    return Parameter?.Value ?? null;
  } catch (e) {
    console.warn(`No data.gov.in key at ${name}; using seeded values`, e);
    return null;
  }
}

/** Runs at 07:00 IST: one AqiDaily row per demo city, seeded values where the feed has nothing. */
export const handler = async () => {
  const cities: string[] = JSON.parse(env('CITIES') ?? '[]');
  const seed: Record<string, number> = JSON.parse(env('SEED') ?? '{}');
  const roleArn = env('TARGET_ROLE_ARN');
  const client = await dynamoClient(
    env('TARGET_REGION') ?? env('AWS_REGION')!,
    roleArn ? { roleArn, externalId: env('TARGET_EXTERNAL_ID') } : undefined,
  );
  const table = env('AQI_TABLE')!;
  const apiKey = await loadApiKey();
  const date = istDate();

  for (const city of cities) {
    let aqi: number | null = null;
    let source = 'data.gov.in';
    if (apiKey) {
      try {
        aqi = await fetchCityAqi(city, apiKey);
      } catch (e) {
        console.error(`AQI fetch failed for ${city}`, e);
      }
    }
    if (aqi === null && seed[city] !== undefined) {
      aqi = seed[city];
      source = 'seed';
    }
    if (aqi === null) {
      console.warn(`No AQI for ${city} on ${date}; row not written`);
      continue;
    }
    await putAqiRow(client, table, { city, date, aqi });
    console.log(`AqiDaily ${city} ${date} = ${aqi} (${source})`);
  }
};
