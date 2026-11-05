import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, set, update, push, get, remove, query, orderByChild, limitToLast, onChildAdded, serverTimestamp } from 'firebase/database';
import { rosterFromInputs, nameKey, TEAM_IDS } from '../src/event-model.js';
import { WHISKY_OPTIONS, SOJU_OPTIONS, MILITARY_OPTIONS } from '../src/taste-model.js';
import { STAGES } from '../src/event-model.js';
import { emptyOxQuestions } from '../src/ox-model.js';

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

async function createOxGame() {
  await create(); await claim('alice', 'A1'); await claim('bob', 'A2');
  const questions = Object.fromEntries(Object.keys(emptyOxQuestions()).map(index => [index, { text: `테스트 문제 ${index}`, answer: 'O' }]));
  await set(location(db('host'), 'oxQuestions'), questions);
  await set(location(db('host'), 'oxGame'), {
    control: { roundId: 'o'.repeat(20), questionIndex: 0, phase: 'open', updatedAt: serverTimestamp() },
    questions, roster: roster.participants,
    rounds: { 0: { prompt: questions[0].text, eligible: { A1: true, A2: true } } },
  });
  await set(location(db('host'), 'presentation'), { active: true, slideIndex: STAGES.findIndex(stage => stage.id === 'ox-question-1'), updatedAt: serverTimestamp() });
}
const oxVote = (uid, id, index = 0, answer = 'O', roundId = 'o'.repeat(20)) => set(location(db(uid), `oxGame/rounds/${index}/votes/${id}`), { answer, roundId, submittedAt: serverTimestamp() });

test('OX questions and other ballots stay private while each eligible member answers once', async () => {
  await createOxGame(); await configureManager(); await claimManager('manager');
  await assertSucceeds(get(location(db('manager'), 'oxQuestions')));
  await assertSucceeds(get(location(db('alice'), 'oxGame/rounds/0/prompt')));
  await assertSucceeds(get(location(db('alice'), 'oxGame/rounds/0/eligible/A1')));
  await assertFails(get(location(db('alice'), 'oxQuestions')));
  await assertFails(get(location(db('alice'), 'oxGame/questions/0/answer')));
  await assertFails(get(location(db('alice'), 'oxGame')));
  await assertFails(get(location(db('alice'), 'oxGame/rounds/0/votes/A2')));
  await assertFails(get(location(db('visitor'), 'oxGame/control')));
  await assertFails(oxVote('alice', 'A2'));
  await assertFails(oxVote('alice', 'A1', 0, 'invalid'));
  await assertFails(oxVote('alice', 'A1', 0, 'O', 'stale'.padEnd(20, '_')));
  await assertSucceeds(oxVote('alice', 'A1'));
  await assertFails(oxVote('alice', 'A1', 0, 'X'));
  await assertFails(remove(location(db('alice'), 'oxGame/rounds/0/votes/A1')));
  await assertFails(update(location(db('alice'), 'oxGame/control'), { phase: 'revealed' }));
  await assertFails(set(location(db('alice'), 'oxGame/rounds/0/eligible/A2'), true));
  await update(location(db('manager'), 'oxGame/control'), { phase: 'closed', updatedAt: serverTimestamp() });
  await assertFails(oxVote('bob', 'A2'));
});

test('OX rejects eliminated members, wrong screens, future questions and pre-reset requests', async () => {
  await createOxGame();
  await set(location(db('host'), 'oxGame/rounds/0/result'), { answer: 'O', survivors: { A1: true }, revealedAt: serverTimestamp() });
  await assertSucceeds(get(location(db('alice'), 'oxGame/rounds/0/result')));
  await set(location(db('host'), 'oxGame/rounds/1'), { prompt: '다음 테스트', eligible: { A1: true } });
  await update(location(db('host'), 'oxGame/control'), { questionIndex: 1, updatedAt: serverTimestamp() });
  await assertFails(oxVote('alice', 'A1', 1));
  await set(location(db('host'), 'presentation'), { active: true, slideIndex: STAGES.findIndex(stage => stage.id === 'ox-question-2'), updatedAt: serverTimestamp() });
  await assertFails(oxVote('bob', 'A2', 1));
  await assertFails(oxVote('alice', 'A1', 2));
  await assertSucceeds(oxVote('alice', 'A1', 1));
  const oldGame = (await get(location(db('host'), 'oxGame'))).val();
  await assertSucceeds(update(location(db('host')), { presentation: { active: true, slideIndex: 0, resetAt: serverTimestamp(), updatedAt: serverTimestamp() }, oxGame: null }));
  await assertFails(set(location(db('host'), 'oxGame'), oldGame));
  await assertFails(oxVote('bob', 'A2'));
  assert.equal((await get(location(db('host'), 'oxQuestions/0/answer'))).val(), 'O');
});

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

test('a touch round starts atomically and rejects forged time or an old round response', async () => {
  await create(); await claim('alice', 'A1'); await claim('bob', 'A2');
  const round = 't'.repeat(20);
  await assertSucceeds(update(location(db('host')), {
    stage: { step: 'join', updatedAt: serverTimestamp() },
    'instructions/A1': { id: round, title: '터치하세요!', body: '선착순 터치', createdAt: serverTimestamp() },
    'instructions/A2': { id: round, title: '터치하세요!', body: '선착순 터치', createdAt: serverTimestamp() },
  }));
  await assertFails(set(location(db('alice'), 'responses/A1'), { instructionId: 'old', acknowledgedAt: serverTimestamp() }));
  await assertFails(set(location(db('alice'), 'responses/A1'), { instructionId: round, acknowledgedAt: 1 }));
  await assertSucceeds(set(location(db('alice'), 'responses/A1'), { instructionId: round, acknowledgedAt: serverTimestamp() }));
  await assertFails(set(location(db('bob'), 'responses/A1'), { instructionId: round, acknowledgedAt: serverTimestamp() }));
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

async function configureManager() {
  await set(location(db('host'), 'managerLookup'), { [nameKey('진행자')]: { name: '진행자' } });
}
const claimManager = (uid, name = '진행자') => update(location(db(uid)), {
  managerBinding: { uid, nameKey: nameKey(name), claimedAt: serverTimestamp() },
  [`managerDevices/${uid}`]: { nameKey: nameKey(name) },
});

test('manager lookup is exact and a single phone must claim both binding records atomically', async () => {
  await create(); await configureManager();
  await assertFails(get(location(db('visitor'), 'managerLookup')));
  await assertSucceeds(get(location(db('visitor'), `managerLookup/${nameKey('진행자')}`)));
  await assertFails(claimManager('visitor', '다른이름'));
  await assertFails(set(location(db('manager'), 'managerBinding'), { uid: 'manager', nameKey: nameKey('진행자'), claimedAt: serverTimestamp() }));
  const outcomes = await Promise.allSettled([claimManager('manager'), claimManager('other-manager')]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  const active = (await get(location(db('host'), 'managerBinding'))).val().uid;
  await assertFails(claim(active, 'A1'));
  await assertFails(set(location(db(active), 'managerLookup'), { [nameKey('위조')]: { name: '위조' } }));
});

test('one atomic update cannot give a device both manager and participant roles', async () => {
  await create(); await configureManager();
  const uid = 'dual-role', key = nameKey('진행자');
  await assertFails(update(location(db(uid)), {
    managerBinding: { uid, nameKey: key, claimedAt: serverTimestamp() },
    [`managerDevices/${uid}`]: { nameKey: key },
    'bindings/A1': { uid, claimedAt: serverTimestamp() },
    [`devices/${uid}`]: { participantId: 'A1' },
  }));
});

test('an existing dual-role device keeps only participant access', async () => {
  await create(); await configureManager(); await claim('dual-role', 'A1');
  const uid = 'dual-role', key = nameKey('진행자');
  await env.withSecurityRulesDisabled(async context => {
    await update(location(context.database()), {
      managerBinding: { uid, nameKey: key, claimedAt: serverTimestamp() },
      [`managerDevices/${uid}`]: { nameKey: key },
    });
  });
  await assertSucceeds(get(location(db(uid), 'participants/A1')));
  await assertFails(get(location(db(uid), 'participants')));
  await assertFails(get(location(db(uid), 'operatorError')));
  await assertFails(get(location(db(uid), 'tasteGame')));
  await assertFails(set(location(db(uid), 'stage'), { step: 'closed', updatedAt: serverTimestamp() }));
});

test('the manager can control presentation and release phones while roster ownership stays with the host', async () => {
  await create(); await configureManager(); await claimManager('manager'); await claim('alice', 'A1');
  await assertSucceeds(get(location(db('manager'), 'participants')));
  await assertSucceeds(get(location(db('manager'), 'bindings')));
  await assertSucceeds(get(location(db('manager'), 'presence')));
  await assertFails(get(location(db('manager'))));
  await assertFails(update(location(db('manager'), 'participants/A1'), { name: '변경' }));
  await assertFails(update(location(db('manager'), 'meta'), { ownerUid: 'manager' }));
  await assertSucceeds(update(location(db('manager')), {
    presentation: { active: true, slideIndex: 1, roundId: 'r'.repeat(20), updatedAt: serverTimestamp() },
    stage: { step: 'join', updatedAt: serverTimestamp() },
    'instructions/A1': { id: 'r'.repeat(20), title: '터치하세요!', body: '선착순 터치', createdAt: serverTimestamp() },
  }));
  await assertFails(set(location(db('alice'), 'presentation'), { active: false, slideIndex: 0, updatedAt: serverTimestamp() }));
  await assertSucceeds(update(location(db('manager')), { 'bindings/A1': null, 'devices/alice': null, 'presence/alice': null }));
  await assertSucceeds(update(location(db('host')), { managerBinding: null, 'managerDevices/manager': null }));
  await assertFails(get(location(db('manager'), 'participants')));
  await assertFails(set(location(db('manager'), 'stage'), { step: 'join', updatedAt: serverTimestamp() }));
});

test('completed shared rounds reject further responses and manager name changes revoke the old phone', async () => {
  await create(); await configureManager(); await claimManager('manager'); await claim('alice', 'A1');
  const round = 'r'.repeat(20);
  await update(location(db('host')), {
    presentation: { active: true, slideIndex: 1, roundId: round, winnerId: 'A1', updatedAt: serverTimestamp() },
    'instructions/A1': { id: round, title: '터치하세요!', body: '선착순 터치', createdAt: serverTimestamp() },
  });
  await assertFails(set(location(db('alice'), 'responses/A1'), { instructionId: round, acknowledgedAt: serverTimestamp() }));
  await set(location(db('host'), 'managerLookup'), { [nameKey('새진행자')]: { name: '새진행자' } });
  await assertFails(get(location(db('manager'), 'participants')));
});

test('operator errors stay private, only the host can publish, and the current manager can dismiss', async () => {
  await create(); await configureManager(); await claimManager('manager'); await claim('alice', 'A1');
  const notice = () => ({ id: 'e'.repeat(20), message: '처리하지 못했어요.', createdAt: serverTimestamp() });
  await assertSucceeds(set(location(db('host'), 'operatorError'), notice()));
  assert.equal((await assertSucceeds(get(location(db('manager'), 'operatorError')))).val().message, '처리하지 못했어요.');
  for (const uid of ['alice', 'visitor', null]) {
    await assertFails(get(location(db(uid), 'operatorError')));
    await assertFails(set(location(db(uid), 'operatorError'), notice()));
    await assertFails(remove(location(db(uid), 'operatorError')));
  }
  await assertFails(set(location(db('manager'), 'operatorError'), notice()));
  await assertFails(set(location(db('host'), 'operatorError'), { ...notice(), message: '' }));
  await assertFails(set(location(db('host'), 'operatorError'), { ...notice(), message: 'x'.repeat(501) }));
  await assertFails(set(location(db('host'), 'operatorError'), { ...notice(), createdAt: 1 }));
  await assertFails(set(location(db('host'), 'operatorError'), { ...notice(), extra: true }));
  await assertSucceeds(remove(location(db('manager'), 'operatorError')));
  await assertSucceeds(set(location(db('host'), 'operatorError'), notice()));
  await update(location(db('host')), { managerBinding: null, 'managerDevices/manager': null });
  await assertFails(get(location(db('manager'), 'operatorError')));
  await assertFails(remove(location(db('manager'), 'operatorError')));
});

async function createTasteGame() {
  await create();
  await claim('alice', 'A1'); await claim('bob', 'A2');
  await update(location(db('host')), {
    tasteGame: { control: { roundId: 'g'.repeat(20), phase: 'ready', updatedAt: serverTimestamp() }, options: WHISKY_OPTIONS, roster: roster.participants },
    presentation: { active: true, slideIndex: 3, updatedAt: serverTimestamp() },
  });
}
const gamePhase = phase => update(location(db('host'), 'tasteGame/control'), { phase, updatedAt: serverTimestamp() });
const ballot = (uid, id, kind = 'preference', optionId = 'peat', submittedAt = serverTimestamp()) => set(location(db(uid), `tasteGame/${kind}Votes/${id}`), { optionId, submittedAt });

test('only the owner can reset progress and pre-reset requests cannot restore it', async () => {
  await createTasteGame(); await configureManager(); await claimManager('manager');
  await gamePhase('preference-open'); await ballot('alice', 'A1');
  const zero = { A: 0, B: 0, C: 0, D: 0 };
  const score = () => ({ totals: zero, awards: { ['g'.repeat(20)]: { before: zero, after: zero, points: zero, awardedAt: serverTimestamp() } } });
  await set(location(db('host'), 'teamScores'), score());
  await set(location(db('host'), 'sojuGame'), {
    control: { roundId: 's'.repeat(20), phase: 'ready', updatedAt: serverTimestamp() },
    options: SOJU_OPTIONS, roster: roster.participants,
  });
  await set(location(db('host'), 'militaryGame'), {
    control: { roundId: 'm'.repeat(20), phase: 'ready', updatedAt: serverTimestamp() },
    options: MILITARY_OPTIONS, roster: roster.participants,
  });
  const rosterBefore = (await get(location(db('host'), 'participants'))).val();
  const reset = {
    stage: { step: 'join', updatedAt: serverTimestamp() },
    presentation: { active: true, slideIndex: 0, resetAt: serverTimestamp(), updatedAt: serverTimestamp() },
    tasteGame: null, sojuGame: null, militaryGame: null, teamScores: null, instructions: null, responses: null, operatorError: null,
  };
  await assertFails(update(location(db('manager')), reset));
  await assertFails(update(location(db('alice')), reset));
  await assertSucceeds(update(location(db('host')), reset));
  const resetAt = (await get(location(db('host'), 'presentation/resetAt'))).val();
  assert.deepEqual((await get(location(db('host'), 'participants'))).val(), rosterBefore);
  assert.equal((await get(location(db('host'), 'bindings/A1/uid'))).val(), 'alice');
  assert.equal((await get(location(db('host'), 'managerBinding/uid'))).val(), 'manager');
  for (const key of ['tasteGame', 'sojuGame', 'militaryGame', 'teamScores', 'instructions', 'responses', 'operatorError']) {
    assert.equal((await get(location(db('host'), key))).val(), null);
  }
  const staleGame = { control: { roundId: 'g'.repeat(20), phase: 'ready', updatedAt: serverTimestamp() }, options: WHISKY_OPTIONS, roster: roster.participants };
  await assertFails(set(location(db('host'), 'tasteGame'), staleGame));
  await assertFails(set(location(db('manager'), 'tasteGame'), staleGame));
  await assertFails(set(location(db('host'), 'militaryGame'), { ...staleGame, options: MILITARY_OPTIONS }));
  await assertFails(set(location(db('host'), 'teamScores'), score()));
  await assertFails(set(location(db('manager'), 'presentation'), { active: true, slideIndex: 3, updatedAt: serverTimestamp() }));
  await assertFails(set(location(db('host'), 'presentation'), { active: true, slideIndex: 3, updatedAt: serverTimestamp() }));
  await assertFails(set(location(db('host'), 'presentation'), { active: true, slideIndex: 0, resetAt: resetAt - 1, updatedAt: serverTimestamp() }));
  await assertFails(ballot('alice', 'A1'));
  await assertSucceeds(set(location(db('host'), 'tasteGame'), { ...staleGame, control: { ...staleGame.control, resetAt } }));
  await assertSucceeds(set(location(db('manager'), 'presentation'), { active: true, slideIndex: 3, resetAt, updatedAt: serverTimestamp() }));
  await gamePhase('preference-open');
  await assertSucceeds(ballot('alice', 'A1'));
});

test('taste ballots allow one valid vote per person only while the matching round is open', async () => {
  await createTasteGame();
  await assertFails(ballot('alice', 'A1'));
  await gamePhase('preference-open');
  await assertFails(ballot('alice', 'A2'));
  await assertFails(ballot('visitor', 'A1'));
  await assertFails(ballot('alice', 'A1', 'preference', 'invalid'));
  await assertFails(ballot('alice', 'A1', 'preference', 'peat', 1));
  await assertFails(ballot('alice', 'A1', 'prediction'));
  await assertSucceeds(ballot('alice', 'A1'));
  await assertFails(ballot('alice', 'A1', 'preference', 'sherry'));
  await assertFails(remove(location(db('alice'), 'tasteGame/preferenceVotes/A1')));
  await gamePhase('preference-closed');
  await assertFails(ballot('bob', 'A2'));
  await gamePhase('prediction-open');
  await assertSucceeds(ballot('alice', 'A1', 'prediction', 'sherry'));
  await gamePhase('prediction-closed');
  await assertFails(ballot('bob', 'A2', 'prediction'));
});

test('taste ballots and answers stay private and participants cannot edit game phases or points', async () => {
  await createTasteGame(); await configureManager(); await claimManager('manager');
  await gamePhase('preference-open'); await ballot('alice', 'A1');
  await assertSucceeds(get(location(db('alice'), 'tasteGame/control')));
  await assertSucceeds(get(location(db('alice'), 'tasteGame/options')));
  await assertSucceeds(get(location(db('alice'), 'tasteGame/preferenceVotes/A1')));
  await assertFails(get(location(db('alice'), 'tasteGame/preferenceVotes/A2')));
  await assertFails(get(location(db('alice'), 'tasteGame')));
  await assertFails(get(location(db('alice'), 'tasteGame/outcome')));
  await assertFails(get(location(db('visitor'), 'tasteGame/options')));
  await assertFails(update(location(db('alice'), 'tasteGame/control'), { phase: 'revealed' }));
  await assertFails(set(location(db('alice'), 'teamScores'), { totals: { A: 100 }, awards: {} }));
  await assertSucceeds(get(location(db('manager'), 'tasteGame')));
  await assertSucceeds(update(location(db('manager'), 'tasteGame/control'), { phase: 'preference-closed', updatedAt: serverTimestamp() }));
  await update(location(db('host')), { managerBinding: null, 'managerDevices/manager': null });
  await assertFails(get(location(db('manager'), 'tasteGame')));
});

test('soju ballots are independent and only accepted on the soju voting screen', async () => {
  await createTasteGame(); await gamePhase('preference-open');
  await ballot('alice', 'A1');
  await set(location(db('host'), 'sojuGame'), {
    control: { roundId: 's'.repeat(20), phase: 'preference-open', updatedAt: serverTimestamp() },
    options: SOJU_OPTIONS, roster: roster.participants,
  });
  const sojuVote = (uid, id, optionId) => set(location(db(uid), `sojuGame/preferenceVotes/${id}`), { optionId, submittedAt: serverTimestamp() });
  await assertFails(sojuVote('alice', 'A1', 'chamisul'));
  await set(location(db('host'), 'presentation'), { active: true, slideIndex: 6, updatedAt: serverTimestamp() });
  await assertFails(ballot('bob', 'A2'));
  await assertFails(sojuVote('alice', 'A1', 'peat'));
  await assertFails(sojuVote('alice', 'A2', 'chamisul'));
  await assertSucceeds(sojuVote('alice', 'A1', 'chamisul'));
  await assertFails(sojuVote('alice', 'A1', 'jinro'));
  await assertFails(get(location(db('bob'), 'sojuGame/preferenceVotes/A1')));
  assert.equal((await get(location(db('alice'), 'tasteGame/preferenceVotes/A1'))).val().optionId, 'peat');
  await assertSucceeds(set(location(db('host'), 'presentation'), { active: true, slideIndex: 8, updatedAt: serverTimestamp() }));
  await assertFails(sojuVote('bob', 'A2', 'jinro'));
  await assertFails(set(location(db('host'), 'presentation'), { active: true, slideIndex: 24, updatedAt: serverTimestamp() }));
});

test('military voting stays private and only accepts each vote on the military screen', async () => {
  await createTasteGame(); await configureManager(); await claimManager('manager');
  await set(location(db('host'), 'militaryGame'), {
    control: { roundId: 'm'.repeat(20), phase: 'preference-open', updatedAt: serverTimestamp() },
    options: MILITARY_OPTIONS, roster: roster.participants,
  });
  const vote = (uid, id, optionId, kind = 'preference') => set(location(db(uid), `militaryGame/${kind}Votes/${id}`), { optionId, submittedAt: serverTimestamp() });
  await assertFails(vote('alice', 'A1', 'army'));
  await assertSucceeds(set(location(db('manager'), 'presentation'), { active: true, slideIndex: 9, updatedAt: serverTimestamp() }));
  await assertFails(vote('alice', 'A1', 'navy'));
  await assertFails(vote('alice', 'A2', 'army'));
  await assertFails(vote('visitor', 'A1', 'army'));
  await assertFails(vote('alice', 'A1', 'army', 'prediction'));
  await assertSucceeds(vote('alice', 'A1', 'army'));
  await assertFails(vote('alice', 'A1', 'marines'));
  await assertFails(get(location(db('bob'), 'militaryGame/preferenceVotes/A1')));
  await assertFails(get(location(db('alice'), 'militaryGame/outcome')));
  await assertFails(get(location(db('visitor'), 'militaryGame/options')));
  await assertSucceeds(get(location(db('alice'), 'militaryGame/options')));
  await assertSucceeds(get(location(db('manager'), 'militaryGame')));
  await assertFails(update(location(db('alice'), 'militaryGame/control'), { phase: 'revealed' }));
  await assertSucceeds(update(location(db('manager'), 'militaryGame/control'), { phase: 'prediction-open', updatedAt: serverTimestamp() }));
  await assertFails(vote('bob', 'A2', 'airforce'));
  await assertSucceeds(vote('alice', 'A1', 'airforce', 'prediction'));
  await assertFails(vote('alice', 'A1', 'army', 'prediction'));
  await update(location(db('host'), 'militaryGame/control'), { phase: 'prediction-closed', updatedAt: serverTimestamp() });
  await assertFails(vote('bob', 'A2', 'marines', 'prediction'));
  await assertSucceeds(set(location(db('host'), 'presentation'), { active: true, slideIndex: 11, updatedAt: serverTimestamp() }));
  await assertFails(set(location(db('host'), 'presentation'), { active: true, slideIndex: 24, updatedAt: serverTimestamp() }));
});
