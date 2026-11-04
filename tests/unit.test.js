import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rosterFromInputs, nameKey, messageText, onlineParticipants, friendlyError } from '../src/event-model.js';

test('roster uses stable IDs, ignores blank slots, and indexes duplicate names across teams', () => {
  const roster = rosterFromInputs({ A: [' 김 지민 ', '', '이서연'], B: ['김지민'], C: [], D: [] }, { A: '민트팀', B: '라임팀', C: 'C조', D: 'D조' });
  assert.equal(Object.keys(roster.participants).length, 3);
  assert.equal(roster.participants.A3.name, '이서연');
  assert.deepEqual(Object.keys(roster.nameIndex[nameKey('김지민')]), ['A1', 'B1']);
  assert.equal(nameKey('김 지민'), nameKey('김지민'));
  assert.throws(() => rosterFromInputs({ A: ['김지민', '김 지민'] }, { A: 'A조' }));
  assert.throws(() => rosterFromInputs({ A: [] }, { A: 'A조' }));
});
test('message validation and errors are safe', () => {
  assert.equal(messageText(' 안녕하세요\n반가워요 '), '안녕하세요\n반가워요');
  assert.throws(() => messageText('  '));
  assert.throws(() => messageText('가'.repeat(1001)));
  assert.match(friendlyError({ code: 'PERMISSION_DENIED' }), /이미 연결/);
  assert.doesNotMatch(friendlyError(new Error('private detail')), /private/);
});
test('presence deduplicates participants across reconnects', () => {
  assert.deepEqual([...onlineParticipants({ uid1: { one: { participantId: 'A1' }, two: { participantId: 'A1' } }, uid2: { one: { participantId: 'B1' } } })], ['A1', 'B1']);
});
