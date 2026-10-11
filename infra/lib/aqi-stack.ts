import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { CfnSchedule } from 'aws-cdk-lib/aws-scheduler';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
import type { AwsConfig } from '../../config/load';

/** Daily AQI fetch: Lambda + an EventBridge Scheduler rule at 07:00 IST. */
export class AqiStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { config: AwsConfig },
  ) {
    super(scope, id, props);
    const { aqi, accounts, region } = props.config;
    const targetAccount = accounts[aqi.target.account];
    const crossAccount = !!targetAccount?.roleArn;

    const fn = new NodejsFunction(this, 'Fn', {
      entry: fileURLToPath(new URL('../lambda/aqi/handler.ts', import.meta.url)),
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(60),
      environment: {
        CITIES: JSON.stringify(aqi.cities),
        SEED: JSON.stringify(aqi.seed),
        AQI_TABLE: aqi.target.tableName,
        TARGET_REGION: region,
        API_KEY_PARAMETER: aqi.apiKeyParameter,
        ...(crossAccount
          ? {
              TARGET_ROLE_ARN: targetAccount.roleArn!,
              ...(targetAccount.externalId
                ? { TARGET_EXTERNAL_ID: targetAccount.externalId }
                : {}),
            }
          : {}),
      },
    });

    fn.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          this.formatArn({
            service: 'ssm',
            resource: 'parameter',
            resourceName: aqi.apiKeyParameter.replace(/^\//, ''),
          }),
        ],
      }),
    );
    fn.addToRolePolicy(
      crossAccount
        ? new PolicyStatement({
            actions: ['sts:AssumeRole'],
            resources: [targetAccount.roleArn!],
          })
        : new PolicyStatement({
            actions: ['dynamodb:PutItem'],
            resources: [
              this.formatArn({
                service: 'dynamodb',
                resource: 'table',
                resourceName: aqi.target.tableName,
              }),
            ],
          }),
    );

    const schedulerRole = new Role(this, 'SchedulerRole', {
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
    });
    schedulerRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [fn.functionArn],
      }),
    );
    new CfnSchedule(this, 'Daily', {
      name: 'greencommute-aqi-0700-ist',
      scheduleExpression: 'cron(0 7 * * ? *)',
      scheduleExpressionTimezone: 'Asia/Kolkata',
      flexibleTimeWindow: { mode: 'OFF' },
      target: { arn: fn.functionArn, roleArn: schedulerRole.roleArn },
    });
  }
}
