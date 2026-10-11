import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { handler } from './handler';

const eventFor = (email: string) =>
  ({ request: { userAttributes: { email } }, response: {} }) as unknown as PreSignUpTriggerEvent;
const run = (email: string) =>
  handler(eventFor(email), {} as never, () => undefined) as Promise<PreSignUpTriggerEvent>;

test('a work email passes through unchanged', async () => {
  const event = eventFor('asha@example-corp.com');
  const result = (await handler(event, {} as never, () => undefined)) as PreSignUpTriggerEvent;
  assert.equal(result, event);
});

test('a Gmail sign-up is refused', async () => {
  await assert.rejects(run('someone@gmail.com'), /work or college email/);
});
