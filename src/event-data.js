import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, push, onValue, onChildAdded, onChildChanged, onChildRemoved, query, orderByChild, limitToLast, onDisconnect, serverTimestamp, runTransaction } from 'firebase/database';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { firebaseConfig, appCheckSiteKey } from '../firebase-config.js';
import { ROOT, nameKey, TOUCH_TITLE, TOUCH_BODY } from './event-model.js';
import { TASTE_ROUNDS, tasteOutcome, revealOrder, scoreAward } from './taste-model.js';
import { OX_QUESTION_COUNT, oxQuestionsReady, oxSurvivors, oxPoints } from './ox-model.js';

export const emulator = import.meta.env.MODE === 'emulator' || import.meta.env.VITE_USE_EMULATORS === 'true';
let db, auth;
export async function connect() {
  if (!db) {
    const config = emulator ? { apiKey: 'demo-key', projectId: 'demo-martini-mt', databaseURL: 'http://127.0.0.1:9000?ns=demo-martini-mt-default-rtdb' } : firebaseConfig;
    const app = initializeApp(config);
    auth = getAuth(app); db = getDatabase(app);
    if (emulator) { connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true }); connectDatabaseEmulator(db, location.hostname, 9000); }
    else if (appCheckSiteKey) initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  }
  await setPersistence(auth, browserLocalPersistence);
  await auth.authStateReady();
  return (auth.currentUser ?? (await signInAnonymously(auth)).user).uid;
}
const locationRef = (room, path = '') => ref(db, `${ROOT}/${room}${path ? `/${path}` : ''}`);
export const watch = (room, path, callback, error) => onValue(locationRef(room, path), snapshot => callback(snapshot.val()), error);
export const watchConnection = callback => onValue(ref(db, '.info/connected'), snapshot => callback(snapshot.val() === true));
export const watchServerOffset = callback => onValue(ref(db, '.info/serverTimeOffset'), snapshot => callback(Number(snapshot.val()) || 0));
export const read = async (room, path) => (await get(locationRef(room, path))).val();
export async function createRoom(uid) {
  const room = push(ref(db, ROOT)).key;
  await set(locationRef(room), { meta: { title: 'Martini MT', ownerUid: uid, createdAt: serverTimestamp() }, stage: { step: 'setup', updatedAt: serverTimestamp() } });
  return room;
}
export async function saveRoster(room, roster, title) {
  await update(locationRef(room), { participants: roster.participants, nameIndex: roster.nameIndex, 'meta/title': title });
}
export const setStage = (room, step) => set(locationRef(room, 'stage'), { step, updatedAt: serverTimestamp() });
export async function lookupName(room, name) { return read(room, `nameIndex/${nameKey(name)}`); }
export async function lookupManager(room, name) { return read(room, `managerLookup/${nameKey(name)}`); }
export async function saveManagerName(room, name) {
  await update(locationRef(room), {
    managerLookup: name ? { [nameKey(name)]: { name } } : null,
    managerBinding: null,
    managerDevices: null,
  });
}
export async function claimManager(room, name, uid) {
  const key = nameKey(name);
  await update(locationRef(room), {
    managerBinding: { uid, nameKey: key, claimedAt: serverTimestamp() },
    [`managerDevices/${uid}`]: { nameKey: key },
  });
}
export async function releaseManager(room, uid) {
  await update(locationRef(room), { managerBinding: null, [`managerDevices/${uid}`]: null });
}
export function reportOperatorError(room, message) {
  const location = locationRef(room, 'operatorError');
  return set(location, { id: push(location).key, message: message.slice(0, 500), createdAt: serverTimestamp() });
}
export function clearOperatorError(room, id) {
  return runTransaction(locationRef(room, 'operatorError'), current => current?.id === id ? null : undefined, { applyLocally: false });
}
export function resetPresentation(room) {
  const changes = {
    stage: { step: 'join', updatedAt: serverTimestamp() },
    presentation: { active: true, slideIndex: 0, resetAt: serverTimestamp(), updatedAt: serverTimestamp() },
    instructions: null,
    responses: null,
    teamScores: null,
    operatorError: null,
    oxGame: null,
  };
  for (const { path } of Object.values(TASTE_ROUNDS)) changes[path] = null;
  return update(locationRef(room), changes);
}
export function setPresentation(room, active, resetAt = null) {
  return update(locationRef(room), {
    stage: { step: 'join', updatedAt: serverTimestamp() },
    presentation: { active, slideIndex: 0, resetAt, updatedAt: serverTimestamp() },
  });
}
export function setPresentationSlide(room, slideIndex, resetAt = null) {
  return update(locationRef(room), {
    stage: { step: 'join', updatedAt: serverTimestamp() },
    presentation: { active: true, slideIndex, resetAt, updatedAt: serverTimestamp() },
  });
}

export async function ensureTasteGame(room, roster, gameKey = 'whisky', resetAt = null) {
  const { path, options } = TASTE_ROUNDS[gameKey];
  const id = push(locationRef(room, path)).key;
  await get(locationRef(room, path));
  const result = await runTransaction(locationRef(room, path), current => current ? undefined : {
    control: { roundId: id, phase: 'ready', resetAt, updatedAt: serverTimestamp() },
    options,
    roster,
  }, { applyLocally: false });
  return result.snapshot.val();
}

export async function changeTastePhase(room, action, gameKey = 'whisky') {
  const { path } = TASTE_ROUNDS[gameKey];
  const phases = {
    'start-preference': ['ready', 'preference-open'],
    'stop-preference': ['preference-open', 'preference-closed'],
    'start-prediction': ['preference-closed', 'prediction-open'],
    'stop-prediction': ['prediction-open', 'prediction-closed'],
    'reveal-answer': ['prediction-closed', 'prediction-closed'],
    'reveal-taste': ['prediction-closed', 'revealed'],
  };
  const [expected, next] = phases[action];
  await get(locationRef(room, path));
  const result = await runTransaction(locationRef(room, path), current => {
    if (!current || current.control.phase !== expected) return;
    if (action === 'reveal-answer' && current.result) return;
    if (action === 'stop-preference' && !Object.keys(current.preferenceVotes ?? {}).length) {
      throw { userMessage: '취향 투표가 한 표 이상 있어야 종료할 수 있습니다.' };
    }
    const updated = { ...current, control: { ...current.control, phase: next, updatedAt: serverTimestamp() } };
    if (action === 'stop-prediction') updated.outcome = tasteOutcome(current);
    if (action === 'reveal-answer') updated.result = {
      topIds: current.outcome.topIds ?? {}, points: current.outcome.points, revealedAt: serverTimestamp(),
    };
    if (action === 'reveal-taste') updated.result = {
      topIds: current.outcome.topIds ?? {}, correctIds: current.outcome.correctIds ?? {}, points: current.outcome.points,
      order: revealOrder(current.outcome.correctIds), revealedAt: serverTimestamp(),
    };
    return updated;
  }, { applyLocally: false });
  if (!result.committed) throw { userMessage: '투표 단계가 변경되었습니다. 현재 화면을 확인해주세요.' };
  return result.snapshot.val();
}

export const submitTasteVote = (room, participantId, kind, optionId, gameKey = 'whisky') => set(locationRef(room, `${TASTE_ROUNDS[gameKey].path}/${kind}Votes/${participantId}`), { optionId, submittedAt: serverTimestamp() });

export async function awardTastePoints(room, gameKey = 'whisky') {
  const game = await read(room, TASTE_ROUNDS[gameKey].path);
  if (!game?.result || game.control?.phase !== 'revealed') throw { userMessage: '정답자를 먼저 공개해주세요.' };
  await get(locationRef(room, 'teamScores'));
  const result = await runTransaction(locationRef(room, 'teamScores'), current => {
    if (current?.awards?.[game.control.roundId]) return;
    return { ...scoreAward(current, game.control.roundId, game.result.points, serverTimestamp()), resetAt: game.control.resetAt ?? null };
  }, { applyLocally: false });
  return result.snapshot.val();
}

export const saveOxQuestions = (room, questions) => set(locationRef(room, 'oxQuestions'), questions);

export async function prepareOxQuestion(room, roster, questionIndex, resetAt = null) {
  const questions = await read(room, 'oxQuestions');
  const roundId = push(locationRef(room, 'oxGame')).key;
  await get(locationRef(room, 'oxGame'));
  const result = await runTransaction(locationRef(room, 'oxGame'), current => {
    if (!current) {
      if (questionIndex !== 0 || !oxQuestionsReady(questions)) throw { userMessage: 'OX 문제 5개와 정답을 먼저 등록해주세요.' };
      return {
        control: { roundId, questionIndex: 0, phase: 'ready', resetAt, updatedAt: serverTimestamp() },
        questions, roster,
        rounds: { 0: { prompt: questions[0].text, eligible: Object.fromEntries(Object.keys(roster).map(id => [id, true])) } },
      };
    }
    if ((current.control.resetAt ?? null) !== resetAt) return;
    if (questionIndex <= current.control.questionIndex) return;
    const previous = current.rounds?.[questionIndex - 1];
    if (questionIndex !== current.control.questionIndex + 1 || !previous?.result) throw { userMessage: '이전 문제의 정답을 먼저 공개해주세요.' };
    return {
      ...current,
      control: { ...current.control, questionIndex, phase: 'ready', updatedAt: serverTimestamp() },
      rounds: { ...current.rounds, [questionIndex]: { prompt: current.questions[questionIndex].text, eligible: previous.result.survivors ?? {} } },
    };
  }, { applyLocally: false });
  const game = result.snapshot.val();
  if (!game || (game.control.resetAt ?? null) !== resetAt) throw { userMessage: '진행이 초기화되었습니다. 현재 화면을 확인해주세요.' };
  return game;
}

export async function changeOxPhase(room, questionIndex, action, roundId) {
  const phases = { 'ox-start': ['ready', 'open'], 'ox-close': ['open', 'closed'], 'ox-reveal': ['closed', 'revealed'] };
  const [expected, phase] = phases[action];
  await get(locationRef(room, 'oxGame'));
  const result = await runTransaction(locationRef(room, 'oxGame'), current => {
    if (!current || current.control.roundId !== roundId || current.control.questionIndex !== questionIndex || current.control.phase !== expected) return;
    const updated = { ...current, control: { ...current.control, phase, updatedAt: serverTimestamp() } };
    if (action === 'ox-reveal') {
      const answer = current.questions[questionIndex].answer;
      const round = current.rounds[questionIndex];
      updated.rounds = { ...current.rounds, [questionIndex]: { ...round, result: { answer, survivors: oxSurvivors(round, answer), revealedAt: serverTimestamp() } } };
    }
    return updated;
  }, { applyLocally: false });
  if (!result.committed) throw { userMessage: 'OX 진행 단계가 변경되었습니다. 현재 화면을 확인해주세요.' };
  return result.snapshot.val();
}

export const submitOxVote = (room, participantId, questionIndex, answer, roundId) => set(locationRef(room, `oxGame/rounds/${questionIndex}/votes/${participantId}`), { answer, roundId, submittedAt: serverTimestamp() });

export async function awardOxPoints(room) {
  const game = await read(room, 'oxGame');
  if (game?.control?.questionIndex !== OX_QUESTION_COUNT - 1 || game.control.phase !== 'revealed'
    || !Array.from({ length: OX_QUESTION_COUNT }, (_, index) => game.rounds?.[index]?.result).every(Boolean)) throw { userMessage: '다섯 문제의 정답을 모두 공개해주세요.' };
  await get(locationRef(room, 'teamScores'));
  const result = await runTransaction(locationRef(room, 'teamScores'), current => {
    if (current?.awards?.[game.control.roundId]) return;
    return { ...scoreAward(current, game.control.roundId, oxPoints(game), serverTimestamp()), resetAt: game.control.resetAt ?? null };
  }, { applyLocally: false });
  return result.snapshot.val();
}
export function completeTouchRound(room, roundId, winnerId) {
  return runTransaction(locationRef(room, 'presentation'), current => {
    if (!current?.active || current.roundId !== roundId || current.winnerId) return;
    return { ...current, winnerId, updatedAt: serverTimestamp() };
  }, { applyLocally: false });
}
export async function claimParticipant(room, id, uid) {
  await update(locationRef(room), { [`bindings/${id}`]: { uid, claimedAt: serverTimestamp() }, [`devices/${uid}`]: { participantId: id } });
}
export async function releaseParticipant(room, id, uid) {
  await update(locationRef(room), { [`bindings/${id}`]: null, [`devices/${uid}`]: null, [`presence/${uid}`]: null });
}
export async function registerPresence(room, uid, participantId) {
  const presence = push(locationRef(room, `presence/${uid}`));
  const disconnect = onDisconnect(presence);
  await disconnect.remove();
  await set(presence, { participantId, connectedAt: serverTimestamp() });
  return async () => { await set(presence, null); await disconnect.cancel(); };
}
export async function sendInstruction(room, participantId, title, body) {
  const id = push(locationRef(room, 'instructions')).key;
  await set(locationRef(room, `instructions/${participantId}`), { id, title, body, createdAt: serverTimestamp() });
}
export function startTouchRound(room, participantIds, remote = false, resetAt = null) {
  const id = push(locationRef(room, 'instructions')).key;
  const changes = { stage: { step: 'join', updatedAt: serverTimestamp() } };
  if (remote) changes.presentation = { active: true, slideIndex: 1, roundId: id, resetAt, updatedAt: serverTimestamp() };
  for (const participantId of participantIds) changes[`instructions/${participantId}`] = {
    id, title: TOUCH_TITLE, body: TOUCH_BODY, createdAt: serverTimestamp(),
  };
  return { id, confirmed: update(locationRef(room), changes) };
}
export const acknowledge = (room, id, instructionId) => set(locationRef(room, `responses/${id}`), { instructionId, acknowledgedAt: serverTimestamp() });
export function watchChat(room, channel, callbacks) {
  const list = query(locationRef(room, `messages/${channel}`), orderByChild('sentAt'), limitToLast(100));
  const upsert = snapshot => callbacks.upsert({ id: snapshot.key, ...snapshot.val() });
  const stops = [onChildAdded(list, upsert, callbacks.error), onChildChanged(list, upsert, callbacks.error), onChildRemoved(list, snapshot => callbacks.remove(snapshot.key), callbacks.error)];
  return () => stops.forEach(stop => stop());
}
export function sendChat(room, channel, uid, participant, text) {
  const id = push(locationRef(room, `messages/${channel}`)).key;
  const confirmed = update(locationRef(room), {
    [`messages/${channel}/${id}`]: { uid, participantId: participant.id, name: participant.name, team: participant.team, teamName: participant.teamName, text, sentAt: serverTimestamp() },
    [`sendState/${uid}`]: { lastSentAt: serverTimestamp(), lastMessageId: id },
  });
  return { id, confirmed };
}
