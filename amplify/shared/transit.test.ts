import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayEnd, duplicateText, needsReview, parseTicket, todayOnly, transitReward, userDayPartition } from './transit';
const ticket = () => parseTicket(['Delhi Metro', 'Date: 09-10-2026', 'From: Rajiv Chowk', 'To: Kashmere Gate', 'Ticket ID: A123', 'Time: 09:15'].map(text => ({ text, confidence: 99 })));
test('extracts only minimal dated journey metadata and canonical duplicates', () => {
  const row = ticket();
  assert.equal(row.date, '2026-10-09'); assert.equal(row.mode, 'METRO');
  assert.equal(duplicateText(row), duplicateText({ ...row, from: 'RAJIV   CHOWK', to: 'Kashmere-Gate', ticket: 'a123' }));
  assert.notEqual(duplicateText(row), duplicateText({ ...row, ticket: 'A124', time: '10:15' }));
  assert.notEqual(duplicateText(row), duplicateText({ ...row, mode: 'BUS' }));
  assert.equal(duplicateText(row), duplicateText({ ...row, from: 'Rajiv Chowk Station', time: '09:16' }));
  assert.deepEqual(Object.keys(row).sort(), ['confidence', 'date', 'from', 'mode', 'ticket', 'time', 'to']);
});
test('expiry is India midnight, past or future proof cannot bypass deleted metadata', () => {
  assert.equal(dayEnd('2026-10-09'), Date.parse('2026-10-09T18:30:00Z') / 1000);
  todayOnly('2026-10-09', new Date('2026-10-09T18:29:59Z'));
  assert.throws(() => todayOnly('2026-10-09', new Date('2026-10-09T18:30:00Z')));
  assert.throws(() => todayOnly('2026-10-10', new Date('2026-10-09T12:00:00Z')));
  assert.throws(() => dayEnd('2026-02-30'));
});
test('ambiguous dates/routes and existing carpool rewards cannot become transit claims', () => {
  const parse = (s: string) => parseTicket(s.split('\n').map(text => ({ text, confidence: 99 })));
  for (const text of ['Metro\nDate: 2026-10-09\nDate: 2026-10-10\nFrom: A\nTo: B', 'Metro pass', 'Carpool\nDate: 2026-10-09\nFrom: A\nTo: B', 'Metro bus\nDate: 2026-10-09\nFrom: A\nTo: B', 'Metro\nDate: 2026-10-09\nFrom: A\nTo: a']) assert.throws(() => parse(text));
});
test('first three confident claims can pass, fourth and uncertain claims need review', () => {
  const row = ticket();
  assert.equal(needsReview(row, 2, true, true), false);
  assert.equal(needsReview(row, 3, true, true), true);
  assert.equal(needsReview({ ...row, confidence: 94 }, 0, true, true), true);
  assert.equal(needsReview({ ...row, ticket: '' }, 0, true, true), true);
  assert.equal(needsReview(row, 0, false, true), true);
  assert.equal(needsReview(row, 0, true, false), true);
});
test('points and avoided emissions match petrol/CNG examples and bad-air multiplier', () => {
  assert.deepEqual(transitReward({ vehicleType: 'HATCHBACK', fuel: 'PETROL' }, 'METRO', 10, false), { points: 7, kgCO2: 1.1 });
  assert.deepEqual(transitReward({ vehicleType: 'HATCHBACK', fuel: 'CNG' }, 'METRO', 10, true), { points: 12, kgCO2: .38 });
  assert.throws(() => transitReward({ vehicleType: 'NONE' }, 'METRO', 10, false));
  assert.equal(transitReward({ vehicleType: 'MOTORCYCLE', fuel: 'PETROL' }, 'BUS', 10, false).kgCO2, 0);
  for (const km of [NaN, Infinity, 0, -1, 201]) assert.throws(() => transitReward({ vehicleType: 'SUV', fuel: 'PETROL' }, 'BUS', km, false));
});
test('same ticket metadata is compared only within its own user/day partition', () => {
  assert.notEqual(userDayPartition('priya', '2026-10-09'), userDayPartition('arjun', '2026-10-09'));
  assert.notEqual(userDayPartition('priya', '2026-10-09'), userDayPartition('priya', '2026-10-10'));
});
