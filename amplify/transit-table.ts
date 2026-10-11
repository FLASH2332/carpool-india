import { Table, AttributeType, BillingMode, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
export function createTransitMetadataTable(scope: Construct) {
  const table = new Table(scope, 'TransitDailyMetadata', {
    partitionKey: { name: 'pk', type: AttributeType.STRING }, sortKey: { name: 'sk', type: AttributeType.STRING },
    billingMode: BillingMode.PAY_PER_REQUEST, timeToLiveAttribute: 'expiresAt', removalPolicy: RemovalPolicy.DESTROY,
  });
  table.addGlobalSecondaryIndex({ indexName: 'expiry', partitionKey: { name: 'expiryBucket', type: AttributeType.STRING }, sortKey: { name: 'expiresAt', type: AttributeType.NUMBER }, projectionType: ProjectionType.KEYS_ONLY });
  table.addGlobalSecondaryIndex({ indexName: 'review', partitionKey: { name: 'reviewOrg', type: AttributeType.STRING }, sortKey: { name: 'expiresAt', type: AttributeType.NUMBER }, projectionType: ProjectionType.ALL });
  return table;
}
