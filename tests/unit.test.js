import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rosterFromInputs, nameKey, messageText, onlineParticipants, friendlyError, firstTouch, touchRoundIsActive, stageIndex, TOUCH_TITLE, TOUCH_BODY } from '../src/event-model.js';

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

test('a race accepts only the current round and chooses the earliest server timestamp', () => {
  const people = { A1: { name: '가', teamName: 'A조' }, A2: { name: '나', teamName: 'A조' } };
  assert.equal(firstTouch({ A1: { instructionId: 'old', acknowledgedAt: 1 } }, people, 'new'), null);
  const winner = firstTouch({ A1: { instructionId: 'new', acknowledgedAt: 20 }, A2: { instructionId: 'new', acknowledgedAt: 10 }, outsider: { instructionId: 'new', acknowledgedAt: 1 } }, people, 'new');
  assert.equal(winner.id, 'A2');
  const instruction = { id: 'new', title: TOUCH_TITLE, body: TOUCH_BODY, createdAt: 100 };
  assert.equal(touchRoundIsActive(instruction, { step: 'join', updatedAt: 100 }), true);
  assert.equal(touchRoundIsActive(instruction, { step: 'join', updatedAt: 101 }), false);
  assert.equal(touchRoundIsActive(instruction, { step: 'closed', updatedAt: 100 }), false);
  assert.equal(stageIndex(0, -1), 0);
  assert.equal(stageIndex(1, 1), 1);
});
