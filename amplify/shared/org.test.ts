import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailBelongsToDomain, isListedAdmin, orgForEmail, withAdmin } from './org';

test('only listed emails are organisation admins', () => {
  assert.equal(isListedAdmin('boss@acme.com', ['Boss@acme.com']), true);
  assert.equal(isListedAdmin(' BOSS@ACME.COM ', ['boss@acme.com']), true);
  assert.equal(isListedAdmin('staff@acme.com', ['boss@acme.com']), false);
  assert.equal(isListedAdmin('boss@acme.com', null), false);
  assert.equal(isListedAdmin(undefined, ['boss@acme.com']), false);
});

test('an admin email must be on the organisation domain or a sub-domain', () => {
  assert.equal(emailBelongsToDomain('a@acme.com', 'acme.com'), true);
  assert.equal(emailBelongsToDomain('A@HR.Acme.com', 'acme.com'), true);
  assert.equal(emailBelongsToDomain('a@notacme.com', 'acme.com'), false);
  assert.equal(emailBelongsToDomain('a@acme.com.evil.io', 'acme.com'), false);
  assert.equal(emailBelongsToDomain('no-at-sign', 'acme.com'), false);
});

test('adding and removing admins keeps the list lower-cased and unique', () => {
  assert.deepEqual(withAdmin(null, 'Boss@acme.com', true), ['boss@acme.com']);
  assert.deepEqual(withAdmin(['boss@acme.com'], 'BOSS@acme.com', true), ['boss@acme.com']);
  assert.deepEqual(withAdmin(['a@acme.com', 'b@acme.com'], 'a@acme.com', false), ['b@acme.com']);
  assert.deepEqual(withAdmin(['a@acme.com'], 'missing@acme.com', false), ['a@acme.com']);
});

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
