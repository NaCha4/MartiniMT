import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, set, update, get, remove, serverTimestamp } from 'firebase/database';
import { STAGES, rosterFromInputs } from '../src/event-model.js';

if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9000') throw new Error('Only the local emulator is permitted.');
const path = `mtChatV1/sessions/${'m'.repeat(20)}`, roundId = 'r'.repeat(20);
const roster = rosterFromInputs({ A: ['라이어', '스톱워치', '눈치', '카드'], B: ['다른선수'], C: [], D: [] });
let env;
const db = uid => uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database();
const at = (uid, part = '') => ref(db(uid), `${path}/${part}`);
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-martini-memory-rules', database: { host: '127.0.0.1', port: 9000, rules: await readFile('database.rules.json', 'utf8') } }); });
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async context => set(ref(context.database(), path), {
    meta: { ownerUid: 'host', title: '카드 검증', createdAt: Date.now() }, stage: { step: 'join', updatedAt: Date.now() },
    participants: roster.participants,
    bindings: Object.fromEntries(['A1', 'A2', 'A3', 'A4', 'B1'].map(id => [id, { uid: id, claimedAt: Date.now() }])),
    devices: Object.fromEntries(['A1', 'A2', 'A3', 'A4', 'B1'].map(id => [id, { participantId: id }])),
    liarGame: { rounds: { 0: { contestants: { A: { participantId: 'A1' } } } } },
    stopwatchGame: { contestants: { A: { participantId: 'A2' } } },
    numberGame: { contestants: { A: { participantId: 'A3' } } },
  }));
  await set(at('host', 'presentation'), { active: true, slideIndex: STAGES.findIndex(stage => stage.id === 'memory-select'), updatedAt: serverTimestamp() });
  await set(at('host', 'memoryGame'), { control: { roundId, phase: 'selecting', updatedAt: serverTimestamp() }, roster: roster.participants });
});
const enter = id => set(at(id, `memoryGame/contestants/${id[0]}`), { participantId: id, ...roster.participants[id], roundId, selectedAt: serverTimestamp() });
const flip = (id, sequence, extra = {}) => set(at(id, `memoryGame/events/${id[0]}/${sequence}`), { sequence, cardIndex: 0, roundIndex: 0, roundId, at: serverTimestamp(), ...extra });
async function start() {
  await env.withSecurityRulesDisabled(async context => update(ref(context.database(), path), {
    'memoryGame/control/phase': 'running', 'memoryGame/control/startedAt': Date.now() - 4000,
    'presentation/slideIndex': STAGES.findIndex(stage => stage.id === 'memory-play'),
  }));
}

test('memory excludes all prior entrants even without the cached exclusion list', async () => {
  for (const id of ['A1', 'A2', 'A3']) await assertFails(enter(id));
  await assertSucceeds(enter('A4'));
  await assertFails(enter('A4'));
  await assertFails(set(at('A4', 'memoryGame/control/phase'), 'running'));
  await assertFails(get(at(null, 'memoryGame/events')));
});

test('memory accepts only sequential append-only flips from its current entrant', async () => {
  await enter('A4'); await enter('B1');
  await assertFails(flip('A4', 0));
  await start();
  await assertFails(flip('A3', 0));
  await assertFails(flip('A4', 1));
  await assertFails(flip('A4', 0, { at: 1 }));
  await assertFails(flip('A4', 0, { roundId: 'x'.repeat(20) }));
  await assertFails(flip('A4', 0, { cardIndex: 12 }));
  await assertSucceeds(flip('A4', 0));
  await assertSucceeds(flip('A4', 1, { cardIndex: 11 }));
  await assertFails(flip('A4', 0));
  await assertFails(remove(at('A4', 'memoryGame/events/A/0')));
  await assertFails(set(at('B1', 'memoryGame/events/A/2'), { sequence: 2, cardIndex: 1, roundIndex: 0, roundId, at: serverTimestamp() }));
  const events = (await assertSucceeds(get(at('B1', 'memoryGame/events/A')))).val();
  assert.equal(Object.keys(events).length, 2);
  await assertFails(set(at('A4', 'memoryGame/result'), { points: { A: 200, B: 0, C: 0, D: 0 } }));
});

test('memory requires the preview, live screen and current session generation', async () => {
  await enter('A4'); await start();
  await env.withSecurityRulesDisabled(async context => update(ref(context.database(), `${path}/memoryGame/control`), { startedAt: Date.now() }));
  await assertFails(flip('A4', 0));
  await start();
  await set(at('host', 'presentation/slideIndex'), STAGES.findIndex(stage => stage.id === 'memory-intro'));
  await assertFails(flip('A4', 0));
  await start();
  await assertSucceeds(flip('A4', 0));
  const game = (await get(at('host', 'memoryGame'))).val();
  await assertSucceeds(set(at('host', 'memoryGame'), { ...game, control: { ...game.control, phase: 'finished', updatedAt: serverTimestamp() }, result: { points: { A: 200, B: 0, C: 0, D: 0 }, results: { A: { rank: 1, finishedAt: Date.now() - 1, moves: 24 } }, revealedAt: serverTimestamp() } }));
  await assertFails(flip('A4', 1));
  await update(at('host'), { presentation: { active: true, slideIndex: 0, resetAt: serverTimestamp(), updatedAt: serverTimestamp() }, memoryGame: null });
  await assertFails(set(at('host', 'memoryGame'), game));
});
