import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '$amplify/env/transit-cleanup';
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export async function handler() {
  const now = Math.floor(Date.now() / 1000);
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db.send(new QueryCommand({ TableName: env.TRANSIT_TABLE_NAME, IndexName: 'expiry', KeyConditionExpression: 'expiryBucket = :b AND expiresAt <= :n', ExpressionAttributeValues: { ':b': 'transit', ':n': now }, ExclusiveStartKey: cursor }));
    // Delete exact expired rows only; a retry cannot remove a renewed record.
    for (const row of page.Items ?? []) {
      try { await db.send(new DeleteCommand({ TableName: env.TRANSIT_TABLE_NAME, Key: { pk: row.pk, sk: row.sk }, ConditionExpression: 'expiresAt <= :n', ExpressionAttributeValues: { ':n': now } })); }
      catch (error) { if (!(error instanceof ConditionalCheckFailedException)) throw error; }
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);
}
