import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orgForEmail } from './org';

test('known domains map to their organisation', () => {
  assert.equal(orgForEmail('asha@example-corp.com')?.orgId, 'org-example-corp');
  assert.equal(orgForEmail('Ravi@Example-College.AC.IN')?.orgId, 'org-example-college');
});

test('sub-domains belong to the organisation, look-alikes do not', () => {
  assert.equal(orgForEmail('a@cs.example-college.ac.in')?.orgId, 'org-example-college');
  assert.equal(orgForEmail('a@notexample-corp.com'), null);
  assert.equal(orgForEmail('a@example-corp.com.evil.io'), null);
});

test('other or malformed addresses have no organisation', () => {
  assert.equal(orgForEmail('someone@gmail.com'), null);
  assert.equal(orgForEmail('no-at-sign'), null);
  assert.equal(orgForEmail(''), null);
  assert.equal(orgForEmail(undefined), null);
});
