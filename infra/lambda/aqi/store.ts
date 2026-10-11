import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { aqiCategory, isBadAir } from '../../../amplify/shared/aqi';

/** Client for the table's account: assumes `roleArn` when the table is in another account. */
export async function dynamoClient(
  region: string,
  role?: { roleArn: string; externalId?: string },
) {
  if (!role) return new DynamoDBClient({ region });
  const sts = new STSClient({ region });
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: role.roleArn,
      RoleSessionName: 'greencommute-aqi',
      ExternalId: role.externalId,
    }),
  );
  if (!Credentials?.AccessKeyId || !Credentials.SecretAccessKey) {
    throw new Error(`AssumeRole on ${role.roleArn} returned no credentials`);
  }
  return new DynamoDBClient({
    region,
    credentials: {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
    },
  });
}

/** Writes one AqiDaily row in the item shape Amplify Gen 2 expects for the model. */
export async function putAqiRow(
  client: DynamoDBClient,
  tableName: string,
  row: { city: string; date: string; aqi: number },
) {
  const now = new Date().toISOString();
  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        city: { S: row.city },
        date: { S: row.date },
        aqi: { N: String(row.aqi) },
        category: { S: aqiCategory(row.aqi).category },
        badAir: { BOOL: isBadAir(row.aqi) },
        __typename: { S: 'AqiDaily' },
        createdAt: { S: now },
        updatedAt: { S: now },
      },
    }),
  );
}
