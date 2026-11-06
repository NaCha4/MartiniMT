import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, set, update, get, remove, serverTimestamp } from 'firebase/database';
import { STAGES, rosterFromInputs } from '../src/event-model.js';

if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9000') throw new Error('Only the local emulator is permitted.');
const path = `mtChatV1/sessions/${'r'.repeat(20)}`, roundId = 'r'.repeat(20);
const roster = rosterFromInputs({ A: ['라이어', '스톱워치', '눈치', '카드', '순발력', '후보'], B: ['관전자', '', '', '', '상대'], C: [], D: [] });
let env;
const db = uid => uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database();
const at = (uid, part = '') => ref(db(uid), `${path}/${part}`);
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-martini-reaction-rules', database: { host: '127.0.0.1', port: 9000, rules: await readFile('database.rules.json', 'utf8') } }); });
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async context => set(ref(context.database(), path), {
    meta: { ownerUid: 'host', title: '순발력 검증', createdAt: Date.now() }, stage: { step: 'join', updatedAt: Date.now() },
    participants: roster.participants,
    bindings: Object.fromEntries(Object.keys(roster.participants).map(id => [id, { uid: id, claimedAt: Date.now() }])),
    devices: Object.fromEntries(Object.keys(roster.participants).map(id => [id, { participantId: id }])),
    liarGame: { rounds: { 0: { contestants: { A: { participantId: 'A1' } } } } },
    stopwatchGame: { contestants: { A: { participantId: 'A2' } } },
    numberGame: { contestants: { A: { participantId: 'A3' } } },
    memoryGame: { contestants: { A: { participantId: 'A4' } } },
  }));
  await set(at('host', 'presentation'), { active: true, slideIndex: STAGES.findIndex(stage => stage.id === 'reaction-select'), updatedAt: serverTimestamp() });
  await set(at('host', 'reactionGame'), { control: { roundId, phase: 'selecting', updatedAt: serverTimestamp() }, roster: roster.participants });
});
const enter = id => set(at(id, `reactionGame/contestants/${id[0]}`), { participantId: id, ...roster.participants[id], roundId, selectedAt: serverTimestamp() });
const tap = (id, changes = {}) => set(at(id, 'reactionGame/winner'), { participantId: id, team: id[0], roundId, tappedAt: serverTimestamp(), ...changes });
async function signal() {
  await set(at('host', 'presentation'), { active: true, slideIndex: STAGES.findIndex(stage => stage.id === 'reaction-play'), updatedAt: serverTimestamp() });
  await update(at('host', 'reactionGame/control'), { phase: 'open', signaledAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

test('reaction admits one new entrant per team and keeps game controls private', async () => {
  await assertFails(get(at('A5', 'reactionGame/submissions/A')));
  for (const id of ['A1', 'A2', 'A3', 'A4']) await assertFails(enter(id));
  await assertSucceeds(enter('A5'));
  await assertSucceeds(get(at('A5', 'reactionGame/submissions/A')));
  await assertFails(get(at('A6', 'reactionGame/submissions/A')));
  await assertFails(enter('A6'));
  await assertFails(tap('A5'));
  await assertFails(update(at('A5', 'reactionGame/control'), { phase: 'open' }));
  await assertFails(get(at(null, 'reactionGame/contestants')));
  await assertFails(get(at('B5', 'reactionGame/roster/A5')));
  await assertSucceeds(get(at('B5', 'reactionGame/contestants')));
});

test('reaction accepts one atomic winner after the live signal and rejects spoofed and repeated touches', async () => {
  await enter('A5'); await enter('B5');
  await signal();
  await assertFails(tap('A6'));
  await assertFails(tap('A5', { participantId: 'B5', team: 'B' }));
  await assertFails(tap('A5', { roundId: 'o'.repeat(20) }));
  await assertFails(tap('A5', { tappedAt: 1 }));
  const attempts = await Promise.allSettled([tap('A5'), tap('B5')]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  const winner = (await get(at('host', 'reactionGame/winner'))).val();
  await assertFails(tap(winner.participantId));
  await assertFails(remove(at(winner.participantId, 'reactionGame/winner')));
  await assertSucceeds(get(at('B1', 'reactionGame/winner')));
  await assertFails(set(at('A5', 'reactionGame/result'), { points: { A: 100, B: 0, C: 0, D: 0 }, revealedAt: serverTimestamp() }));
  const old = (await get(at('host', 'reactionGame'))).val();
  await update(at('host'), { presentation: { active: true, slideIndex: 0, resetAt: serverTimestamp(), updatedAt: serverTimestamp() }, reactionGame: null });
  await assertFails(set(at('host', 'reactionGame'), old));
  await assertFails(tap('A5'));
});

test('local reaction accepts one elapsed duration per entrant and protects hidden records', async () => {
  await update(at('host', 'reactionGame/control'), { localTiming: true });
  await enter('A5'); await enter('B5');
  const submit = (id, elapsedMs, changes = {}) => set(at(id, `reactionGame/submissions/${id[0]}`), { participantId: id, roundId, elapsedMs, submittedAt: serverTimestamp(), ...changes });
  await assertFails(submit('A5', 250));
  await signal();
  await assertFails(tap('A5'));
  await assertFails(submit('A6', 250));
  for (const value of [-1, 2.5, 86400001, '100']) await assertFails(submit('A5', value));
  await assertFails(submit('A5', 250, { roundId: 'old' }));
  await assertSucceeds(submit('A5', 350));
  await assertFails(submit('A5', 200));
  await assertFails(remove(at('A5', 'reactionGame/submissions/A')));
  await assertFails(get(at('B5', 'reactionGame/submissions/A')));
  await assertSucceeds(get(at('A5', 'reactionGame/submissions/A')));
  await assertSucceeds(submit('B5', 180));
  await update(at('host', 'reactionGame'), { 'control/phase': 'finished', 'control/updatedAt': serverTimestamp(), result: { points: { A: 0, B: 100, C: 0, D: 0 }, elapsedMs: { A: 350, B: 180 }, revealedAt: serverTimestamp() } });
  await assertSucceeds(get(at('B1', 'reactionGame/result')));
});

test('false starts are restricted to entrants during play and cannot be replaced or scored', async () => {
  await update(at('host', 'reactionGame/control'), { localTiming: true });
  await enter('A5'); await enter('B5');
  const disqualify = (id, changes = {}) => set(at(id, `reactionGame/submissions/${id[0]}`), { participantId: id, roundId, elapsedMs: 0, disqualified: true, submittedAt: serverTimestamp(), ...changes });
  await assertFails(disqualify('A5'));
  await set(at('host', 'presentation'), { active: true, slideIndex: STAGES.findIndex(stage => stage.id === 'reaction-play'), updatedAt: serverTimestamp() });
  await assertFails(disqualify('A6'));
  await assertFails(disqualify('A5', { participantId: 'B5' }));
  await assertFails(disqualify('A5', { roundId: 'old' }));
  await assertFails(disqualify('A5', { disqualified: false }));
  await assertFails(disqualify('A5', { elapsedMs: 200 }));
  await assertSucceeds(disqualify('A5'));
  await assertFails(remove(at('A5', 'reactionGame/submissions/A')));
  await assertFails(get(at('B5', 'reactionGame/submissions/A')));
  await signal();
  await assertFails(set(at('A5', 'reactionGame/submissions/A'), { participantId: 'A5', roundId, elapsedMs: 100, submittedAt: serverTimestamp() }));
  await assertSucceeds(disqualify('B5'));
  const result = { points: { A: 0, B: 0, C: 0, D: 0 }, elapsedMs: { A: 0, B: 0 }, disqualified: { A: true, B: true }, revealedAt: serverTimestamp() };
  const finish = value => update(at('host', 'reactionGame'), { 'control/phase': 'finished', 'control/updatedAt': serverTimestamp(), result: value });
  await assertFails(finish({ ...result, points: { A: 100, B: 0, C: 0, D: 0 } }));
  await assertFails(finish({ ...result, disqualified: null }));
  await assertSucceeds(finish(result));
  await assertSucceeds(get(at('B1', 'reactionGame/result')));
});
