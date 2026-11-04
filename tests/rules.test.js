import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, set, update, push, get, remove, query, orderByChild, limitToLast, onChildAdded, serverTimestamp } from 'firebase/database';
import { rosterFromInputs, nameKey, TEAM_IDS } from '../src/event-model.js';

if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9000') throw new Error('Only local emulator tests are permitted.');
const room = 's'.repeat(20), path = `mtChatV1/sessions/${room}`;
let env;
const roster = rosterFromInputs({ A: ['김지민', '이서연'], B: ['김지민'], C: [], D: [] }, { A: '민트팀', B: '라임팀', C: 'C조', D: 'D조' });
const db = uid => uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database();
const location = (database, sub = '') => ref(database, `${path}${sub ? `/${sub}` : ''}`);
async function create(data = roster) { await set(location(db('host')), { meta: { ownerUid: 'host', title: '테스트 행사', createdAt: serverTimestamp() }, stage: { step: 'join', updatedAt: serverTimestamp() }, ...data }); }
const claim = (uid, id) => update(location(db(uid)), { [`bindings/${id}`]: { uid, claimedAt: serverTimestamp() }, [`devices/${uid}`]: { participantId: id } });
function send(uid, id, person, channel = 'all', extra = {}) {
  const database = db(uid), key = push(location(database, `messages/${channel}`)).key;
  const updates = { [`messages/${channel}/${key}`]: { uid, participantId: id, ...person, text: '반가워요', sentAt: serverTimestamp(), ...extra }, [`sendState/${uid}`]: { lastSentAt: serverTimestamp(), lastMessageId: key } };
  return { key, send: () => update(location(database), updates) };
}
const messages = (database, channel = 'all', limit = 100) => query(location(database, `messages/${channel}`), orderByChild('sentAt'), limitToLast(limit));
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-martini-mt', database: { host: '127.0.0.1', port: 9000, rules: await readFile('database.rules.json', 'utf8') } }); });
after(async () => env?.cleanup());
beforeEach(async () => env.clearDatabase());

test('only the event owner can manage roster, stage and instructions', async () => {
  await create();
  await assertSucceeds(get(location(db('host'), 'participants')));
  await assertFails(get(location(db(), 'meta')));
  await assertFails(get(location(db('visitor'), 'participants')));
  await assertFails(set(location(db('visitor'), 'stage'), { step: 'chat', updatedAt: serverTimestamp() }));
  await assertFails(update(location(db('visitor'), 'participants/A1'), { name: '위조' }));
  await assertFails(update(location(db('host'), 'meta'), { ownerUid: 'visitor' }));
  await assertFails(set(ref(db('host'), 'privateRecords/a'), true));
});
test('a registered name lookup works but the full roster and index remain private', async () => {
  await create();
  const result = await assertSucceeds(get(location(db('visitor'), `nameIndex/${nameKey('김지민')}`)));
  assert.deepEqual(Object.keys(result.val()), ['A1', 'B1']);
  await assertFails(get(location(db('visitor'), 'nameIndex')));
  await assertFails(get(location(db('visitor'), 'participants/A1')));
});
test('claim is atomic, one device per person, and one person per identity', async () => {
  await create();
  await assertFails(set(location(db('alice'), 'bindings/A1'), { uid: 'alice', claimedAt: serverTimestamp() }));
  await assertSucceeds(claim('alice', 'A1'));
  await assertFails(claim('bob', 'A1'));
  await assertFails(claim('alice', 'A2'));
  await assertSucceeds(get(location(db('alice'), 'participants/A1')));
  await assertFails(get(location(db('alice'), 'participants/A2')));
  const rejected = await assertSucceeds(get(location(db('bob'), 'devices/bob')));
  assert.equal(rejected.exists(), false);
});
test('two devices racing for one identity cannot both claim it', async () => {
  await create();
  const outcomes = await Promise.allSettled([claim('alice', 'A1'), claim('bob', 'A1')]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
});
test('only owner can release a binding, and a new device can claim after release', async () => {
  await create(); await claim('alice', 'A1');
  await assertFails(update(location(db('alice')), { 'bindings/A1': null, 'devices/alice': null }));
  await assertSucceeds(update(location(db('host')), { 'bindings/A1': null, 'devices/alice': null, 'presence/alice': null }));
  await assertSucceeds(claim('bob', 'A1'));
});
test('personal instructions and acknowledgements are restricted to their participant', async () => {
  await create(); await claim('alice', 'A1'); await claim('bob', 'A2');
  const instruction = { id: 'n'.repeat(20), title: '다음 차례', body: '준비해주세요', createdAt: serverTimestamp() };
  await assertSucceeds(set(location(db('host'), 'instructions/A1'), instruction));
  await assertSucceeds(get(location(db('alice'), 'instructions/A1')));
  await assertFails(get(location(db('bob'), 'instructions/A1')));
  await assertFails(set(location(db('bob'), 'responses/A1'), { instructionId: instruction.id, acknowledgedAt: serverTimestamp() }));
  await assertFails(set(location(db('alice'), 'responses/A1'), { instructionId: 'wrong', acknowledgedAt: serverTimestamp() }));
  await assertSucceeds(set(location(db('alice'), 'responses/A1'), { instructionId: instruction.id, acknowledgedAt: serverTimestamp() }));
});
test('chat begins with the host, checks identity and team, and rejects edit, delete, and rapid send', async () => {
  await create(); await claim('alice', 'A1');
  await assertFails(send('alice', 'A1', roster.participants.A1).send());
  await set(location(db('host'), 'stage'), { step: 'chat', updatedAt: serverTimestamp() });
  await assertFails(send('alice', 'A1', roster.participants.A1, 'all', { name: '가짜이름' }).send());
  await assertFails(send('alice', 'A1', roster.participants.A1, 'B').send());
  await assertFails(send('alice', 'A1', roster.participants.A1, 'all', { text: '가'.repeat(1001) }).send());
  const accepted = send('alice', 'A1', roster.participants.A1);
  await assertSucceeds(accepted.send());
  await assertFails(send('alice', 'A1', roster.participants.A1).send());
  await assertFails(update(location(db('alice'), `messages/all/${accepted.key}`), { text: 'changed' }));
  await assertFails(remove(location(db('alice'), `messages/all/${accepted.key}`)));
  await assertSucceeds(get(messages(db('alice'))));
  await assertFails(get(messages(db('alice'), 'B')));
  await assertFails(get(location(db('alice'), 'messages/all')));
  await assertFails(get(messages(db('alice'), 'all', 101)));
});
test('24 participants and 1 host receive concurrent messages without loss', { timeout: 15000 }, async () => {
  const many = rosterFromInputs(Object.fromEntries(TEAM_IDS.map(team => [team, Array.from({ length: 6 }, (_, i) => `${team}참가자${i + 1}`)])), Object.fromEntries(TEAM_IDS.map(team => [team, `${team}조`])));
  await create(many);
  await Promise.all(Object.keys(many.participants).map(id => claim(`user-${id}`, id)));
  await set(location(db('host'), 'stage'), { step: 'chat', updatedAt: serverTimestamp() });
  const received = new Set(); let timer, stop;
  const delivered = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Received ${received.size}/24`)), 12000);
    stop = onChildAdded(messages(db('host')), snapshot => { received.add(snapshot.key); if (received.size === 24) resolve(); }, reject);
  });
  try {
    const sends = Promise.all(Object.entries(many.participants).map(([id, person]) => assertSucceeds(send(`user-${id}`, id, person).send())));
    await Promise.all([sends, delivered]); assert.equal(received.size, 24);
  } finally { clearTimeout(timer); stop?.(); }
});
