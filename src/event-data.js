import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, push, onValue, onChildAdded, onChildChanged, onChildRemoved, query, orderByChild, limitToLast, onDisconnect, serverTimestamp } from 'firebase/database';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { firebaseConfig, appCheckSiteKey } from '../firebase-config.js';
import { ROOT, nameKey, TOUCH_TITLE, TOUCH_BODY } from './event-model.js';

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
export const read = async (room, path) => (await get(locationRef(room, path))).val();
export async function createRoom(uid) {
  const room = push(ref(db, ROOT)).key;
  await set(locationRef(room), { meta: { title: 'Martini MT', ownerUid: uid, createdAt: serverTimestamp() }, stage: { step: 'setup', updatedAt: serverTimestamp() } });
  return room;
}
export async function saveRoster(room, roster, title) {
  await update(locationRef(room), { participants: roster.participants, nameIndex: roster.nameIndex, 'meta/title': title, 'stage/step': 'setup', 'stage/updatedAt': serverTimestamp() });
}
export const setStage = (room, step) => set(locationRef(room, 'stage'), { step, updatedAt: serverTimestamp() });
export async function lookupName(room, name) { return read(room, `nameIndex/${nameKey(name)}`); }
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
export function startTouchRound(room, participantIds) {
  const id = push(locationRef(room, 'instructions')).key;
  const changes = { stage: { step: 'join', updatedAt: serverTimestamp() } };
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
