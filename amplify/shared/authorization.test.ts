import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, valueFromASTUntyped, type ObjectTypeDefinitionNode, type FieldDefinitionNode } from 'graphql';
import { schema } from '../data/resource';

// Compile the real Amplify schema, then check the access matrix rather than a mock.
const compiled = parse(schema.transform().schema);
function object(name: string) {
  const node = compiled.definitions.find(n => n.kind === 'ObjectTypeDefinition' && n.name.value === name);
  assert.ok(node && node.kind === 'ObjectTypeDefinition', name);
  return node as ObjectTypeDefinitionNode;
}
function rules(node: ObjectTypeDefinitionNode | FieldDefinitionNode): Record<string, unknown>[] {
  const auth = node.directives?.find(d => d.name.value === 'auth');
  const arg = auth?.arguments?.find(a => a.name.value === 'rules');
  assert.ok(arg, 'Explicit auth rules required');
  return valueFromASTUntyped(arg.value);
}
test('private data exposes only intended owner/participant reads and no raw trip/request writes', () => {
  for (const [model, owners] of [['UserProfile', ['userId']], ['Trip', ['driverId', 'riderIds']], ['RideRequest', ['riderId', 'driverId']], ['ImpactEntry', ['userId']]] as const) {
    const auth = rules(object(model));
    assert.deepEqual(auth.map(r => r.ownerField).sort(), [...owners].sort());
    for (const rule of auth) {
      assert.equal(rule.allow, 'owner');
      assert.equal(rule.identityClaim, 'sub');
      assert.deepEqual(rule.operations, model === 'UserProfile' ? ['read', 'update'] : ['read']);
    }
  }
});
test('membership and reward totals cannot be changed by profile owner', () => {
  for (const name of ['orgId', 'city', 'email', 'totalKm', 'totalKgCO2', 'totalRupees', 'points']) {
    const field = object('UserProfile').fields?.find(f => f.name.value === name);
    assert.ok(field);
    const auth = rules(field);
    assert.equal(auth[0].ownerField, 'userId');
    assert.deepEqual(auth[0].operations, ['read']);
  }
});
test('organisation and geohash models grant no direct Cognito operations', () => {
  for (const name of ['Organization', 'TripCell']) {
    const auth = rules(object(name));
    assert.deepEqual(auth[0].operations, []);
  }
});
test('discovery schema omits live positions/membership; scoped query accepts no org override', () => {
  const fields = object('MatchedTrip').fields?.map(f => f.name.value) ?? [];
  for (const field of ['lastLat', 'lastLng', 'lastAt', 'riderIds']) assert.ok(!fields.includes(field));
  const query = object('Query').fields?.find(f => f.name.value === 'communityLeaderboard');
  assert.ok(query);
  assert.deepEqual(query.arguments?.map(a => a.name.value), ['month']);
});
