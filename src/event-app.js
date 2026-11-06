import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './event-style.css';
import QRCode from 'qrcode';
import * as api from './event-data.js';
import { TEAM_IDS, TEAM_NAMES, STAGES, stageIndex, touchRoundIsActive, touchRoundResult, firstTouch, rosterFromInputs, rowsFromParticipants, readRosterDraft, onlineParticipants, participantUrl, friendlyError, escapeHtml as escape } from './event-model.js';
import { TASTE_ROUNDS, REVEAL_INTERVAL, rankedTeams, revealFinished } from './taste-model.js';
import { OX_QUESTION_COUNT, OX_REVEAL_DURATION, emptyOxQuestions, oxQuestionsReady, oxEliminatedIds, oxSurvivorRevealEnd } from './ox-model.js';
import { createInputController } from './input-controller.js';
import { createSubscriptionGroup } from './subscription-group.js';
import { ZOOM_FEEDBACK_DURATION, ZOOM_QUESTION_COUNT, ZOOM_NOTICE_DURATION } from './zoom-model.js';
import { zoomEditor, zoomPresentation, zoomControls, zoomParticipant } from './zoom-view.js';
import { bindZoomEditor } from './zoom-editor.js';
import { LIAR_REVEAL_DURATION, liarRosterReady, liarUsedIds, liarRevealFinished } from './liar-model.js';
import { liarControls, liarPresentation, liarParticipant, liarResultCaption } from './liar-view.js';
import { createStopwatchClock, formatStopwatchTime, stopwatchRevealFinished, stopwatchRevealProgress, STOPWATCH_MIN_MS, STOPWATCH_REVEAL_DURATION } from './stopwatch-model.js';
import { stopwatchControls, stopwatchPresentation, stopwatchParticipant } from './stopwatch-view.js';
import { NUMBER_VALUES, NUMBER_REVEAL_DURATION, numberRevealFinished } from './number-model.js';
import { numberControls, numberPresentation, numberParticipant, numberResultCaption } from './number-view.js';
import { MEMORY_PREVIEW_MS, memoryPlayer, memoryCanFlip, memoryStandings, memoryFinished, memoryLayouts } from './memory-model.js';
import { memoryControls, memoryPresentation, memoryParticipant } from './memory-view.js';
import { reactionControls, reactionPresentation, reactionParticipant } from './reaction-view.js';
import { createReactionClock, reactionSubmitted } from './reaction-model.js';
import { yutControls, yutPresentation, yutAward } from './yut-view.js';
import { bindYutBoard } from './yut-board.js';
import { moveYutPiece, splitYutStack } from './yut-model.js';
import peatImage from './assets/whisky/peat.jpg';
import sherryImage from './assets/whisky/sherry.jpg';
import bourbonImage from './assets/whisky/bourbon.jpg';
import chamisulImage from './assets/soju/chamisul.jpg';
import chumchurumImage from './assets/soju/chumchurum.png';
import jinroImage from './assets/soju/jinro.jpg';
import saeroImage from './assets/soju/saero.png';
import armyImage from './assets/military/army.webp';
import airforceImage from './assets/military/airforce.jpg';
import marinesImage from './assets/military/marines.webp';

const WHISKY_VISUALS = {
  peat: { image: peatImage, alt: '피트 연기와 황금빛 위스키' },
  sherry: { image: sherryImage, alt: '건포도와 무화과, 짙은 호박색 위스키' },
  bourbon: { image: bourbonImage, alt: '오크통과 바닐라, 캐러멜을 곁들인 위스키' },
};
const SOJU_VISUALS = {
  chamisul: { image: chamisulImage, alt: '참이슬 프레시 실제 제품 사진' },
  chumchurum: { image: chumchurumImage, alt: '처음처럼 실제 제품 사진' },
  jinro: { image: jinroImage, alt: '진로 실제 제품 사진' },
  saero: { image: saeroImage, alt: '새로 실제 제품 사진' },
};
const MILITARY_VISUALS = {
  army: { image: armyImage, alt: '육군 캐릭터' },
  airforce: { image: airforceImage, alt: '공군 캐릭터' },
  marines: { image: marinesImage, alt: '해병대 캐릭터' },
};
const DEFAULT_ZOOM_QUESTIONS = Object.fromEntries([
  [peatImage, '피트 위스키'], [sherryImage, '셰리 위스키'], [bourbonImage, '버번 위스키'],
  [chamisulImage, '참이슬'], [jinroImage, '진로'],
].map(([image, answer], index) => [index, { image: new URL(image, location.href).pathname, answer, focusX: 50, focusY: 50 }]));

const $ = selector => document.querySelector(selector);
const local = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
};
const queryRoom = new URLSearchParams(location.search).get('room');
const managementEntry = !queryRoom;
const storageScope = api.fixedRoom ? `.${api.fixedRoom}${api.emulator ? '.emulator' : ''}` : api.emulator ? '.emulator' : '';
const rosterStorageKey = `martini.host-roster${storageScope}`;
const managerStorageKey = `martini.manager-name${storageScope}`;
let cachedRoster = queryRoom ? null : readRosterDraft(local.get(rosterStorageKey));
const localRoster = !queryRoom && !api.emulator && !api.fixedRoom && !cachedRoster
  ? readRosterDraft(local.get('martini.host-roster.emulator')) : null;
const state = {
  role: queryRoom || api.fixedRoom ? 'participant' : 'host', room: api.fixedRoom ?? queryRoom, uid: null, online: false, ready: false,
  error: '', presenting: false, slideIndex: 0, busy: false, controlsLocked: false, dirty: cachedRoster?.pending ?? false, draftSaved: Boolean(cachedRoster),
  savingRoster: false, rosterError: '',
  managerName: queryRoom ? '' : local.get(managerStorageKey) ?? '', managerDirty: !queryRoom && local.get(`${managerStorageKey}.pending`) === 'true', managerSaving: false, managerError: '',
  managerBinding: null, managerDevices: {}, presentation: null, finalizingWinner: false, operatorError: null,
  meta: null, stage: { step: 'setup' }, participants: {}, bindings: {}, presence: {}, responses: {},
  rows: cachedRoster?.rows ?? localRoster?.rows ?? rowsFromParticipants(),
  participantId: null, participant: null, instruction: null, response: null, responseReady: false, choices: null, name: '',
  raceRoundId: null, winner: null, winnerRevealedAt: 0, tapping: false, submittedRoundId: null,
  screenStarting: false, fullscreenFallback: false,
  tasteGames: {}, tasteVotes: {}, gameError: '', teamScores: null,
  voting: false, serverOffset: 0, scoreEntryAt: 0,
  oxGame: {}, oxRound: {}, oxReady: false, oxQuestions: null, oxDraft: null,
  zoomGame: {}, zoomRound: {}, zoomReady: false, zoomQuestions: null, zoomDraft: null,
  liarGame: {}, liarRound: {}, liarReady: false, liarConfirm: false,
  stopwatchGame: {}, stopwatchReady: false, stopwatchConfirm: false,
  numberGame: {}, numberReady: false, numberConfirm: false, numberChoice: null,
  memoryGame: {}, memoryReady: false, memoryConfirm: false,
  reactionGame: {}, reactionReady: false, reactionConfirm: false,
  yutGame: {}, yutMoving: false,
};
let stopwatchStorage;
try { stopwatchStorage = window.sessionStorage; } catch { /* Timing can continue in memory. */ }
const stopwatchClock = createStopwatchClock({ storage: stopwatchStorage });
const reactionClock = createReactionClock({ storage: stopwatchStorage });
const reactionKey = () => `martini.reaction.${state.room}.${state.participantId}.${state.reactionGame.control?.roundId}`;
let reactionFinalizing = false, reactionRetryAt = 0, reactionRetryTimer;
let stopwatchTimer, stopwatchFrame;
const stopwatchKey = () => `martini.stopwatch.${state.room}.${state.participantId}.${state.stopwatchGame.control?.roundId}`;
let presenceClose, presenceEpoch = 0, frame, composing = false;
let rosterSaveTimer, rosterSavePromise;
let managerSaveTimer, managerSavePromise;
let controlsUnlockTimer, scriptPosition;
let revealTimer, scoreFrame;
let zoomTimer, zoomAdvancing = false, zoomRetryAt = 0;
let liarTimer, liarAdvancing = false, liarPendingId, liarRetryAt = 0;
let memoryTimer, memoryAdvancing = false, memoryRetryAt = 0;
let zoomEditing = false;
let yutDragging = false, yutTimer, yutAdvancing = false, yutRetryAt = 0;
window.addEventListener('blur', () => { zoomEditing = false; schedule(); });
let gameWatchKey;
const watchRoom = (path, onValue, onError) => api.watch(state.room, path, onValue, onError);
const participantSubscriptions = createSubscriptionGroup(watchRoom);
const managementSubscriptions = createSubscriptionGroup(watchRoom);
const gameSubscriptions = createSubscriptionGroup(watchRoom);
const input = createInputController({
  document, window,
  getContext: () => ({ interactive: interactionLocked(), participant: state.role === 'participant', voteKey: currentVoteKey() }),
  submitVote: (kind, value) => {
    if (kind === 'reaction-action') void reactionAction(value);
    else if (kind === 'memory-action') void memoryAction(value);
    else if (kind === 'memory-card') void memoryAction('memory-flip', Number(value));
    else if (kind === 'number-action') void numberAction(value);
    else if (kind === 'number-choice') { state.numberChoice = Number(value); schedule(); }
    else if (kind === 'stopwatch-action') void stopwatchAction(value);
    else if (kind === 'liar-action') void action(value);
    else if (kind === 'zoom') void requestZoomAnswer();
    else if (kind === 'liar') void voteLiar(value);
    else if (kind === 'ox') void voteOx(value);
    else void voteTaste(value);
  },
  onChange: schedule,
});

function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = null; if (!composing && !input.active && !zoomEditing && !yutDragging) render(); }); }
function relayOperatorError(message) {
  if (state.role === 'host' && state.presenting && state.room) {
    // Keep the original local error if its delivery also fails.
    void api.reportOperatorError(state.room, message).catch(() => {});
  }
}
function showError(error) {
  state.error = typeof error === 'string' ? error : friendlyError(error);
  relayOperatorError(state.error);
  schedule();
}
function showGameError(error) {
  state.gameError = friendlyError(error);
  relayOperatorError(state.gameError);
  schedule();
}
function connectedIds() { return onlineParticipants(state.presence); }
function count() { return Object.values(state.rows).flat().filter(name => name.trim()).length; }
function interactionLocked() {
  return state.role === 'host' ? state.presenting : Boolean(state.participantId || state.role === 'manager');
}
function lockControls() {
  state.controlsLocked = true;
  clearTimeout(controlsUnlockTimer);
  controlsUnlockTimer = setTimeout(() => { state.controlsLocked = false; schedule(); }, 400);
  schedule();
}
function rememberRoster() {
  cachedRoster = { rows: state.rows, pending: state.dirty };
  state.draftSaved = local.set(rosterStorageKey, JSON.stringify(cachedRoster));
}
function rosterStatus() {
  if (state.rosterError) return state.rosterError;
  if (state.savingRoster) return '자동 저장 중…';
  if (state.dirty) return state.draftSaved ? '기기에 저장됨 · 동기화 대기 중' : '동기화 대기 중';
  return Object.keys(state.participants).length ? '자동 저장됨' : '명단 입력 대기';
}
function queueRosterSave() {
  clearTimeout(rosterSaveTimer);
  if (state.role !== 'host' || !state.ready || !state.online || !state.dirty || state.presenting || composing) return;
  rosterSaveTimer = setTimeout(() => { void flushRoster().catch(() => {}); }, 350);
}
function flushRoster() {
  clearTimeout(rosterSaveTimer);
  if (rosterSavePromise) return rosterSavePromise.then(flushRoster);
  if (!state.dirty) return Promise.resolve();
  state.savingRoster = true;
  state.rosterError = '';
  schedule();
  rosterSavePromise = save().catch(error => {
    state.rosterError = friendlyError(error);
    throw error;
  }).finally(() => {
    rosterSavePromise = null;
    state.savingRoster = false;
    schedule();
  });
  return rosterSavePromise.then(flushRoster);
}
function managerStatus() {
  if (state.managerError) return state.managerError;
  if (state.managerSaving || state.managerDirty) return '관리자 이름 저장 중…';
  if (api.fixedRoom) return `다른 기기에서도 이 이름으로 로그인 · 관리자 기기 ${Object.keys(state.managerDevices).length}대`;
  return state.managerBinding ? '관리자 휴대폰 등록됨' : 'QR로 접속해 관리자 이름을 입력하세요.';
}
function queueManagerSave() {
  clearTimeout(managerSaveTimer);
  if (state.role !== 'host' || !state.ready || !state.online || !state.managerDirty || composing) return;
  managerSaveTimer = setTimeout(() => { void flushManager().catch(() => {}); }, 350);
}
function flushManager() {
  clearTimeout(managerSaveTimer);
  if (managerSavePromise) return managerSavePromise.then(flushManager);
  if (!state.managerDirty) return Promise.resolve();
  const name = state.managerName.trim().replace(/\s+/gu, ' ');
  state.managerSaving = true;
  state.managerError = '';
  schedule();
  managerSavePromise = api.saveManagerName(state.room, name).then(() => {
    if (state.managerName.trim().replace(/\s+/gu, ' ') === name) {
      state.managerName = name;
      state.managerDirty = false;
      local.set(managerStorageKey, name);
      local.set(`${managerStorageKey}.pending`, 'false');
    }
  }).catch(error => {
    state.managerError = String(error?.code).toLowerCase().includes('permission')
      ? '관리자 기능은 Firebase 권한 규칙 반영 후 사용할 수 있습니다.' : friendlyError(error);
    throw error;
  }).finally(() => { managerSavePromise = null; state.managerSaving = false; schedule(); });
  return managerSavePromise.then(flushManager);
}
function inviteUrl() {
  const networkUrl = api.emulator ? null : $('meta[name="dev-network-url"]')?.content;
  return participantUrl(location.href, state.room, networkUrl);
}
function isFullscreen() { return Boolean(document.fullscreenElement) || (innerWidth >= screen.width - 8 && innerHeight >= screen.height - 8); }
function fullscreenControl() { return isFullscreen() ? '' : `<button class="button outline fullscreen-button" data-action="fullscreen" data-no-slide ${state.screenStarting ? 'disabled' : ''}>전체화면</button>`; }
function controllerFullscreen() { return Boolean(document.fullscreenElement) || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true; }
function controllerCanFullscreen() {
  // Device emulation keeps Chrome's runtime and the underlying desktop platform.
  const desktopChrome = Boolean(window.chrome)
    && /^(?:Win|Mac|Linux (?:x86_64|i[3-6]86))/.test(navigator.platform);
  return !desktopChrome && Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
}
async function startController() {
  if (state.screenStarting) return;
  state.screenStarting = true;
  schedule();
  try {
    if (!controllerFullscreen() && controllerCanFullscreen()) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    if (screen.orientation?.lock) await screen.orientation.lock('landscape-primary').catch(() => {});
  } catch (error) {
    state.fullscreenFallback = error?.name === 'NotSupportedError';
    if (!state.fullscreenFallback) state.error = '전체화면 전환을 완료하지 못했어요. 시작 버튼을 다시 눌러주세요.';
  }
  finally { state.screenStarting = false; lockControls(); schedule(); }
}
function connectionBadge() { return `<span class="connection ${state.online ? 'online' : ''}">${api.emulator ? '로컬 테스트 · ' : ''}${state.online ? '실시간 연결됨' : '연결 중'}</span>`; }
function topbar() { return `<header class="topbar"><a class="brand" href="./">마티니 MT</a>${connectionBadge()}</header>`; }
function button(text, action, type = 'soft', disabled = false) { return `<button class="button ${type}" data-action="${action}" ${disabled ? 'disabled' : ''}>${escape(text)}</button>`; }
function errorBanner() {
  const message = state.error || (state.role === 'manager' ? state.gameError || state.operatorError?.message : '');
  const errorId = state.role === 'manager' && state.operatorError && state.operatorError.message === message ? state.operatorError.id : '';
  return message ? `<div class="error-banner" role="alert">${escape(message)}<button data-action="dismiss" data-error-id="${escape(errorId)}">닫기</button></div>` : '';
}
function tasteContext(index = state.presentation?.slideIndex ?? state.slideIndex) {
  const slide = STAGES[index];
  const key = slide?.game ?? 'whisky';
  return { key, slide, game: key === 'ox' ? state.oxGame : key === 'zoom' ? state.zoomGame : key === 'liar' ? state.liarGame : key === 'stopwatch' ? state.stopwatchGame : key === 'number' ? state.numberGame : key === 'memory' ? state.memoryGame : key === 'reaction' ? state.reactionGame : key === 'yut' ? state.yutGame : state.tasteGames[key] ?? {}, votes: state.tasteVotes[key] ?? {} };
}
function nextBlocked() {
  const { slide, game } = tasteContext(state.slideIndex);
  if (slide.game === 'yut') return slide.view === 'play' ? !game?.result : stageIndex(state.slideIndex, 1) === state.slideIndex;
  if (slide.game === 'reaction') {
    if (slide.view === 'select') return !Object.keys(game.contestants ?? {}).length;
    if (slide.view === 'play') return game.control?.localTiming ? !game.result : !game.winner;
    return stageIndex(state.slideIndex, 1) === state.slideIndex;
  }
  if (slide.game === 'memory') {
    if (slide.view === 'select') return !Object.keys(game.contestants ?? {}).length;
    if (slide.view === 'play') return !memoryFinished(game, Date.now() + state.serverOffset);
    return stageIndex(state.slideIndex, 1) === state.slideIndex;
  }
  if (slide.game === 'number') {
    if (slide.view === 'select') return !Object.keys(game.contestants ?? {}).length;
    if (slide.view === 'play') return !numberRevealFinished(game.rounds?.[slide.questionIndex], Date.now() + state.serverOffset);
    return stageIndex(state.slideIndex, 1) === state.slideIndex;
  }
  if (slide.game === 'stopwatch') {
    if (slide.view === 'select') return !Object.keys(game.contestants ?? {}).length;
    if (slide.view === 'play') return !stopwatchRevealFinished(game, Date.now() + state.serverOffset);
    return stageIndex(state.slideIndex, 1) === state.slideIndex;
  }
  if (slide.game === 'liar') {
    const round = game.rounds?.[slide.questionIndex];
    if (slide.view === 'intro') return !liarRosterReady(game.roster ?? state.participants);
    if (slide.view === 'select') return slide.questionIndex === 0 && !Object.keys(round?.contestants ?? {}).length;
    if (slide.view === 'play') return !liarRevealFinished(round, Date.now() + state.serverOffset);
    return stageIndex(state.slideIndex, 1) === state.slideIndex;
  }
  if (slide.game === 'zoom') {
    if (slide.view === 'question') return !game.control || (game.control.questionIndex <= slide.questionIndex && game.control.phase !== 'complete');
    return stageIndex(state.slideIndex, 1) === state.slideIndex;
  }
  if (slide.game === 'ox') {
    const round = game.rounds?.[slide.questionIndex];
    if (slide.view === 'intro') return !game.control && !oxQuestionsReady(state.oxQuestions);
    if (['question', 'reveal'].includes(slide.view)) return !round?.result || Date.now() + state.serverOffset < round.result.revealedAt + OX_REVEAL_DURATION;
    if (slide.view === 'survivors') return Date.now() + state.serverOffset < oxSurvivorRevealEnd(round);
  }
  if (slide.view === 'vote' && !game.result) return true;
  if (slide.view === 'vote') return !['prediction-closed', 'revealed'].includes(game.control?.phase);
  if (slide.view === 'reveal') return game.control?.phase !== 'revealed' || !revealFinished(game.result, Date.now() + state.serverOffset);
  return stageIndex(state.slideIndex, 1) === state.slideIndex;
}

function tasteControls(disabled) {
  const { slide, game } = tasteContext(state.slideIndex);
  if (slide.game === 'yut') return yutControls(game, slide, disabled);
  if (slide.game === 'reaction') return reactionControls(game, slide, disabled);
  if (slide.game === 'memory') return memoryControls(game, slide, disabled);
  if (slide.game === 'number') return numberControls(game, slide, disabled);
  if (slide.game === 'stopwatch') return stopwatchControls(game, slide, disabled);
  if (slide.game === 'liar') return liarControls(game, slide, disabled, state.participants);
  if (slide.game === 'zoom') return zoomControls(game, slide, disabled);
  if (slide.game === 'ox') return oxControls(slide, disabled);
  const phase = game.control?.phase;
  let control = '';
  if (slide.view === 'vote') {
    const actions = {
      ready: ['투표 시작', 'start-preference'],
      'preference-open': ['투표 종료', 'stop-preference'],
      'preference-closed': ['최다 득표 예상 투표 시작', 'start-prediction'],
      'prediction-open': ['예상 투표 종료', 'stop-prediction'],
      'prediction-closed': !game.result ? ['정답 공개', 'reveal-answer'] : null,
    };
    const action = actions[phase];
    if (action) control = button(action[0], action[1], 'dark', disabled);
    const votes = phase === 'prediction-open' ? game.predictionVotes : game.preferenceVotes;
    if (action && phase !== 'prediction-closed') control += `<p class="remote-vote-count">${Object.keys(votes ?? {}).length} / ${Object.keys(game.roster ?? {}).length}명 투표</p>`;
  }
  if (slide.view === 'reveal' && phase === 'prediction-closed') control = button('결과 공개', 'reveal-taste', 'dark', disabled);
  return control ? `<section class="remote-game-controls" aria-label="투표 진행">${control}</section>` : '';
}

function oxQuestionEditor() {
  const questions = state.oxDraft ?? state.oxQuestions ?? emptyOxQuestions();
  const disabled = state.busy || !state.online;
  return `<section class="ox-editor" data-no-slide><h2>OX 문제 설정</h2><p>문제와 정답 5개를 저장하면 시작할 수 있습니다. 진행 중인 게임에는 시작할 때 저장한 문제가 적용됩니다.</p>
    <div class="ox-question-fields">${Array.from({ length: OX_QUESTION_COUNT }, (_, index) => `<div class="ox-question-field"><label for="ox-text-${index}">${index + 1}번 문제</label><textarea id="ox-text-${index}" data-ox-question="${index}" maxlength="300" placeholder="문제를 입력해주세요" ${disabled ? 'disabled' : ''}>${escape(questions[index]?.text)}</textarea><label for="ox-answer-${index}">정답</label><select id="ox-answer-${index}" data-ox-answer="${index}" ${disabled ? 'disabled' : ''}><option value="">선택</option>${['O', 'X'].map(answer => `<option value="${answer}" ${questions[index]?.answer === answer ? 'selected' : ''}>${answer}</option>`).join('')}</select></div>`).join('')}</div>
    ${button('OX 문제 저장', 'ox-save', 'dark', disabled || !state.oxDraft)}<span role="status">${state.oxDraft ? '저장 전 변경사항' : oxQuestionsReady(state.oxQuestions) ? '5개 문제 저장됨' : '문제 입력 대기'}</span></section>`;
}

function oxControls(slide, disabled) {
  if (slide.view === 'intro') return `<section class="remote-game-controls"><p class="remote-vote-count">${state.oxGame.control || oxQuestionsReady(state.oxQuestions) ? '5문제 · 최종 생존자 1명당 50점' : '행사 관리 화면에서 OX 문제 5개와 정답을 등록해주세요.'}</p></section>`;
  const game = state.oxGame;
  const round = game.rounds?.[slide.questionIndex];
  const current = game.control?.questionIndex === slide.questionIndex;
  let control = '';
  if (['question', 'reveal'].includes(slide.view) && current) {
    if (game.control.phase === 'ready') control = button('응답 시작', 'ox-start', 'dark', disabled);
    if (game.control.phase === 'open') control = button('응답 마감', 'ox-close', 'dark', disabled);
    if (game.control.phase === 'closed') control = button('정답 공개', 'ox-reveal', 'dark', disabled);
  }
  if (slide.view === 'survivors' && round?.result && round.result.survivorsRevealedAt == null) control = button('결과 공개', 'ox-survivors', 'dark', disabled);
  return `<section class="remote-game-controls" aria-label="OX 진행">${control}${round ? `<p class="remote-vote-count">${Object.keys(round.votes ?? {}).length} / ${Object.keys(round.eligible ?? {}).length}명 응답</p>` : ''}</section>`;
}

function rosterCard(team) {
  const online = connectedIds();
  return `<section class="team-card"><div class="team-heading"><h3>${TEAM_NAMES[team]}</h3><span id="count-${team}" class="small-count">${state.rows[team].filter(name => name.trim()).length} / 6</span></div><div class="roster">${state.rows[team].map((name, index) => {
    const id = `${team}${index + 1}`, binding = state.bindings[id];
    return `<div class="roster-row"><span class="row-number">${String(index + 1).padStart(2, '0')}</span><input id="name-${id}" data-person="${id}" aria-label="${TEAM_NAMES[team]} ${index + 1}번 이름" maxlength="24" placeholder="참가자 실명" value="${escape(name)}" ${!state.ready || state.busy ? 'disabled' : ''}/><span class="person-state ${online.has(id) ? 'active' : ''}" title="${online.has(id) ? '현재 접속 중' : '미접속'}"></span>${binding ? `<button class="unlink" data-release="${id}" aria-label="${escape(name)} 기기 연결 해제">해제</button>` : ''}</div>`;
  }).join('')}</div></section>`;
}

function hostView() {
  if (state.presenting) return presentationView();
  const managerConnections = api.fixedRoom
    ? Object.keys(state.managerDevices).map((uid, index) => `<button class="button soft" data-release-manager="${escape(uid)}" ${state.busy ? 'disabled' : ''}>${uid === state.uid ? '이 기기 로그아웃' : `관리자 기기 ${index + 1} 연결 해제`}</button>`).join('')
    : state.managerBinding ? button('관리자 휴대폰 연결 해제', 'release-manager') : '';
  return `${topbar()}<main class="dashboard"><section class="intro"><div><h1>행사 관리</h1><p>${api.fixedRoom ? '공용 행사 · ' : ''}명단 자동 저장 · 화면 이동은 리모컨으로 진행</p></div><div class="intro-actions">${button('초기화', 'reset', 'soft', !state.ready || !state.online || state.busy || state.controlsLocked)}${button(state.busy ? '준비 중…' : '발표 시작', 'present', 'dark', !state.ready || !state.online || state.busy || state.controlsLocked)}</div></section>${errorBanner()}<section class="manager-setup"><label for="manager-name">관리자 이름</label><input id="manager-name" maxlength="24" placeholder="리모컨을 사용할 사람의 이름" value="${escape(state.managerName)}" ${!state.ready || state.busy ? 'disabled' : ''}/><span id="manager-status" role="status">${escape(managerStatus())}</span>${managerConnections}</section><section class="event-strip"><div class="event-stat"><strong id="total-count">${count()}</strong><span>등록 인원</span></div><div class="event-stat"><strong>${connectedIds().size}</strong><span>현재 접속</span></div><div id="roster-status" class="event-status" role="status">${escape(rosterStatus())}</div></section><section class="section-title"><h2>참가자 명단</h2><span>4개 조 · 조별 최대 6명</span></section><div class="team-grid">${TEAM_IDS.map(rosterCard).join('')}</div>${oxQuestionEditor()}${zoomEditor(state.zoomDraft ?? state.zoomQuestions ?? DEFAULT_ZOOM_QUESTIONS, state.busy || !state.online, Boolean(state.zoomDraft))}</main>`;
}

function managerView() {
  const disabled = !state.online || state.busy || state.controlsLocked;
  const clockwise = screen.orientation?.angle === 270 || screen.orientation?.angle === -90;
  const slide = state.presenting ? STAGES[state.slideIndex] : null;
  return `<main class="manager-controller" data-rotation="${clockwise ? 'clockwise' : 'counterclockwise'}" aria-busy="${state.busy || state.controlsLocked}">
    <section id="manager-script" class="remote-script" data-script-id="${slide?.id ?? 'setup'}" role="region" aria-label="진행 대본" tabindex="0"><p>${escape(slide?.script ?? '')}</p></section>
    ${errorBanner()}
    ${state.presenting ? tasteControls(disabled) : ''}
    <nav class="remote-navigation" aria-label="발표 화면 이동">
      ${button('이전 화면', 'previous', 'soft', disabled || !state.presenting)}
      ${button('다음 화면', 'next', 'dark', disabled || !state.presenting || nextBlocked())}
      ${button('설정', 'exit', 'soft', disabled || !state.presenting)}
    </nav>
  </main>`;
}

function tastePresentation(slide) {
  const { game } = tasteContext(state.slideIndex);
  const phase = game.control?.phase;
  if (slide.id === 'taste-intro') return `<section class="taste-intro taste-screen">
    <span class="taste-eyebrow">RECREATION 01</span><h1>취향을<br/><em>읽어라</em></h1>
    <div class="taste-rules"><p><b>01</b> 나의 취향에 투표</p><p><b>02</b> 가장 많은 선택을 예상</p><p><b>03</b> 정답자 한 명당 <strong>+10점</strong></p></div>
  </section>`;
  if (slide.view === 'vote') {
    const open = phase === 'preference-open' || phase === 'prediction-open';
    const answerRevealed = Boolean(game.result);
    const answerElapsed = answerRevealed ? Math.max(0, Date.now() + state.serverOffset - (game.result.revealedAt ?? 0)) : 0;
    const topIds = game.result?.topIds ?? {};
    const tied = Object.keys(topIds).length > 1;
    return `<section class="taste-screen taste-ballot-screen" data-game="${escape(slide.game)}" style="--answer-delay:-${answerElapsed}ms">
      <div class="whisky-options">${Object.entries(game.options ?? TASTE_ROUNDS[slide.game].options).sort(([, a], [, b]) => a.order - b.order).map(([id, option]) => {
        const visual = Object.hasOwn(WHISKY_VISUALS, id) ? WHISKY_VISUALS[id] : null;
        const sojuVisual = Object.hasOwn(SOJU_VISUALS, id) ? SOJU_VISUALS[id] : null;
        const militaryVisual = Object.hasOwn(MILITARY_VISUALS, id) ? MILITARY_VISUALS[id] : null;
        const illustration = visual ? `<img class="whisky-image" src="${visual.image}" alt="${escape(visual.alt)}" draggable="false"/>`
          : sojuVisual ? `<div class="soju-product-visual"><img class="soju-product-image" src="${sojuVisual.image}" alt="${escape(sojuVisual.alt)}" draggable="false"/></div>`
          : militaryVisual ? `<div class="military-visual"><img class="military-image" src="${militaryVisual.image}" alt="${escape(militaryVisual.alt)}" draggable="false"/></div>` : '';
        const winner = answerRevealed && topIds[id];
        const answerClass = answerRevealed ? (winner ? 'is-answer' : 'is-dimmed') : '';
        return `<article class="whisky-option ${answerClass}" data-option="${escape(id)}">${illustration}${winner ? `<span class="whisky-answer-label">${tied ? '공동 정답' : '정답'}</span>` : ''}<h2>${escape(option.label)}</h2>${winner ? `<p class="whisky-vote-count"><strong>${game.outcome?.counts?.[id] ?? 0}</strong>표</p>` : ''}</article>`;
      }).join('')}</div>
      <div class="taste-ballot-footer" aria-live="polite">${phase === 'prediction-closed' && !answerRevealed
        ? button('정답 공개', 'reveal-answer', 'dark', !state.online || state.busy || state.controlsLocked)
        : `<p class="taste-phase" data-phase="${escape(phase)}">${answerRevealed ? '정답이 공개되었습니다' : open ? '휴대폰에서 투표해주세요' : phase === 'ready' ? '투표를 준비하고 있습니다' : '투표가 마감되었습니다'}</p>`}</div>
    </section>`;
  }
  if (slide.view === 'reveal') {
    const result = game.result;
    const elapsed = Math.max(0, Date.now() + state.serverOffset - (result?.revealedAt ?? 0));
    return `<section class="taste-screen taste-reveal">
      <div class="reveal-teams">${TEAM_IDS.map(team => `<section class="reveal-team" data-team="${team}"><h2>${TEAM_NAMES[team]}</h2><div>${Object.entries(game.roster ?? {}).filter(([, person]) => person.team === team).map(([id, person]) => {
        const correct = Boolean(result?.correctIds?.[id]);
        const delay = correct ? result.order[id] * REVEAL_INTERVAL - elapsed : 0;
        return `<div class="reveal-person ${correct ? 'is-correct' : ''}" data-person="${id}" style="--reveal-delay:${delay}ms"><i aria-hidden="true"></i><span>${escape(person.name)}</span></div>`;
      }).join('')}</div></section>`).join('')}</div>
    </section>`;
  }
  return scorePresentation(game.control?.roundId);
}

function scorePresentation(roundId, caption = '') {
  const award = state.teamScores?.awards?.[roundId];
  const before = rankedTeams(award?.before), after = rankedTeams(award?.after ?? state.teamScores?.totals);
  return `<section class="taste-screen taste-score">${caption}<div class="scoreboard" style="--score-elapsed:-${Math.max(0, performance.now() - state.scoreEntryAt)}ms">
    ${after.map(entry => `<article class="score-row" data-team="${entry.team}" style="--from-rank:${before.find(item => item.team === entry.team).index};--to-rank:${entry.index}">
      <span class="score-rank">${entry.rank}<small>위</small></span><h2>${TEAM_NAMES[entry.team]}</h2><span class="score-earned">+${award?.points[entry.team] ?? 0}</span><strong data-score-team="${entry.team}">${entry.score}</strong><span class="score-unit">점</span>
    </article>`).join('')}</div></section>`;
}

function oxPresentation(slide) {
  if (slide.view === 'intro') return `<section class="taste-screen ox-intro"><span class="taste-eyebrow">RECREATION 02</span><h1>OX 퀴즈</h1><div class="ox-rules"><p><b>5</b> 문제 연속 도전</p><p>정답자만 다음 문제로</p><p>최종 생존자 1명당 <strong>+50점</strong></p></div></section>`;
  if (slide.view === 'score') return scorePresentation(state.oxGame.control?.roundId);
  const round = state.oxGame.rounds?.[slide.questionIndex];
  if (slide.view === 'survivors') return oxSurvivorsPresentation(round);
  const prompt = round?.prompt ?? state.oxGame.questions?.[slide.questionIndex]?.text ?? state.oxQuestions?.[slide.questionIndex]?.text ?? '';
  const result = round?.result;
  const elapsed = result ? Math.max(0, Date.now() + state.serverOffset - result.revealedAt) : 0;
  const current = state.oxGame.control?.questionIndex === slide.questionIndex;
  return `<section class="taste-screen ox-screen ${result ? 'is-revealed' : ''}" style="--ox-delay:-${elapsed}ms">
    <header class="ox-heading"><span>OX QUIZ</span><span>${String(slide.questionIndex + 1).padStart(2, '0')} / 05</span></header>
    <h1 class="ox-prompt ${prompt.length > 100 ? 'is-long' : ''}">${escape(prompt)}</h1>
    <div class="ox-symbols" aria-label="${result ? `정답 ${result.answer}` : 'O 또는 X'}">${['O', 'X'].map(answer => `<div class="ox-symbol ${result ? result.answer === answer ? 'is-correct' : 'is-wrong' : ''}" data-answer="${answer}">${answer}</div>`).join('')}</div>
    <p class="ox-status">${result ? '' : current && state.oxGame.control?.phase === 'open' ? '휴대폰에서 O 또는 X를 선택해주세요' : current && state.oxGame.control?.phase === 'ready' ? '응답을 준비하고 있습니다' : '응답이 마감되었습니다'}</p>
  </section>`;
}

function oxSurvivorsPresentation(round) {
  const revealed = round?.result?.survivorsRevealedAt != null;
  const elapsed = revealed ? Math.max(0, Date.now() + state.serverOffset - round.result.survivorsRevealedAt) : 0;
  const eliminated = oxEliminatedIds(round);
  return `<section class="taste-screen taste-reveal ox-survivor-screen">
    <div class="reveal-teams">${TEAM_IDS.map(team => `<section class="reveal-team" data-team="${team}"><h2>${TEAM_NAMES[team]}</h2><div>${Object.entries(state.oxGame.roster ?? {}).filter(([, person]) => person.team === team).map(([id, person]) => {
      const wasAlive = Boolean(round?.eligible?.[id]);
      const fading = revealed && wasAlive && !round.result.survivors?.[id];
      const alive = wasAlive && !fading;
      const delay = fading ? eliminated.indexOf(id) * REVEAL_INTERVAL - elapsed : 0;
      return `<div class="reveal-person ${alive ? 'is-alive' : ''} ${fading ? 'is-eliminated-now' : ''}" data-person="${id}" style="--elimination-delay:${delay}ms"><i aria-hidden="true"></i><span>${escape(person.name)}</span></div>`;
    }).join('')}</div></section>`).join('')}</div>
  </section>`;
}

function joinNetworkView() {
  const online = connectedIds();
  const layout = {
    A: { hub: [32, 25], nodes: [[8, 14], [21, 10], [9, 27], [22, 23], [8, 40], [22, 36]] },
    B: { hub: [68, 25], nodes: [[92, 14], [79, 10], [91, 27], [78, 23], [92, 40], [78, 36]] },
    C: { hub: [32, 75], nodes: [[8, 60], [22, 64], [9, 73], [22, 77], [8, 86], [21, 90]] },
    D: { hub: [68, 75], nodes: [[92, 60], [78, 64], [91, 73], [78, 77], [92, 86], [79, 90]] },
  };
  const links = [];
  const teams = TEAM_IDS.map(team => {
    const { hub, nodes } = layout[team];
    const [hubX, hubY] = [hub[0] * 10, hub[1] * 7];
    const originX = hub[0] < 50 ? 405 : 595;
    const originY = hub[1] < 50 ? 270 : 430;
    const trunk = `M ${originX} ${originY} C ${hubX} ${originY}, ${originX} ${hubY}, ${hubX} ${hubY}`;
    links.push(`<g data-team="${team}"><path class="synapse-trunk" d="${trunk}"/><circle class="synapse-pulse" r="3"><animateMotion dur="4s" repeatCount="indefinite" path="${trunk}"/></circle></g>`);
    const people = Object.entries(state.participants).filter(([, person]) => person.team === team);
    const members = people.map(([id, person], index) => {
      const [x, y] = nodes[index];
      const active = online.has(id);
      const path = `M ${hubX} ${hubY} C ${hubX} ${y * 7}, ${x * 10} ${hubY}, ${x * 10} ${y * 7}`;
      links.push(`<g data-team="${team}" class="${active ? 'signal-active' : ''}"><path class="synapse-link" d="${path}"/>${active ? `<circle class="synapse-pulse" r="2.5"><animateMotion dur="3s" repeatCount="indefinite" path="${path}"/></circle>` : ''}</g>`);
      return `<div class="stage-person ${active ? 'joined' : ''}" data-participant="${escape(id)}" style="left:${x}%;top:${y}%" title="${escape(person.name)}">
        <span>${escape(person.name)}</span><span class="node-status"><i aria-hidden="true"></i>${active ? '접속 중' : '미접속'}</span>
      </div>`;
    }).join('');
    return `<section class="synapse-team" data-team="${team}">
      <div class="team-hub" style="left:${hub[0]}%;top:${hub[1]}%"><h2 class="stage-team-name">${TEAM_NAMES[team]}</h2><span>${people.filter(([id]) => online.has(id)).length} / ${people.length}</span></div>
      ${members}
    </section>`;
  }).join('');
  return `<div class="synapse-stage">
    <div class="synapse-field" aria-hidden="true"></div>
    <svg class="synapse-connections" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">${links.join('')}</svg>
    ${teams}
    <aside class="qr-card synapse-core">
      <div class="core-brackets" aria-hidden="true"></div>
      <div class="qr-paper"><canvas class="invite-qr" aria-label="참가자 입장 QR 코드"></canvas></div>
      <div class="arrival-heading" role="status"><span>접속 <strong>${online.size}</strong><span> / ${Object.keys(state.participants).length}</span></span></div>
      <input id="invite-url" type="hidden" value="${escape(inviteUrl())}"/>
    </aside>
  </div>`;
}

function presentationView() {
  const slide = STAGES[state.slideIndex];
  const screenCode = state.winner ? slide.resultScreenCode ?? slide.screenCode : slide.screenCode;
  const screenLabel = import.meta.env.DEV ? `<span class="presentation-screen-code" aria-hidden="true">${screenCode}</span>` : '';
  const winnerElapsed = state.winner ? Math.max(0, performance.now() - state.winnerRevealedAt) : 0;
  let content;
  if (slide.id === 'join') {
    content = joinNetworkView();
  } else if (state.slideIndex >= 2) {
    if (slide.game === 'yut') {
      if (slide.view === 'score') content = scorePresentation(state.yutGame.control?.roundId, `<header class="liar-result"><h1>최종 순위</h1><p>${state.yutGame.result ? `${TEAM_NAMES[state.yutGame.result.winnerTeam]} 윷놀이 우승 · +300점` : '오늘의 최종 점수'}</p></header>`);
      else if (slide.view === 'award') content = yutAward(state.teamScores, slide.awardIndex, Date.now() + state.serverOffset - (state.presentation?.updatedAt ?? Date.now()));
      else content = yutPresentation(state.yutGame, slide, state.busy || state.yutMoving || !state.online);
    }
    else if (slide.game === 'reaction') content = slide.view === 'score' ? scorePresentation(state.reactionGame.control?.roundId, '<header class="liar-result"><h1>순발력 측정 점수</h1><p>가장 빠른 팀 +100점</p></header>') : reactionPresentation(state.reactionGame, slide);
    else if (slide.game === 'memory') content = slide.view === 'score' ? scorePresentation(state.memoryGame.control?.roundId, '<header class="liar-result"><h1>카드 뒤집기 최종 점수</h1><p>완주 순서대로 150점 · 100점 · 50점</p></header>') : memoryPresentation(state.memoryGame, slide, Date.now() + state.serverOffset);
    else if (slide.game === 'number') content = slide.view === 'score' ? scorePresentation(state.numberGame.rounds?.[slide.questionIndex]?.roundId, numberResultCaption(state.numberGame, slide.questionIndex)) : numberPresentation(state.numberGame, slide, Date.now() + state.serverOffset);
    else if (slide.game === 'stopwatch') content = slide.view === 'score' ? scorePresentation(state.stopwatchGame.control?.roundId, '<header class="liar-result"><h1>인간스톱워치 점수</h1><p>10초에 가장 가까운 팀 +100점 · 동률 모두 +100점</p></header>') : stopwatchPresentation(state.stopwatchGame, slide, Date.now() + state.serverOffset);
    else if (slide.game === 'liar') content = slide.view === 'score' ? scorePresentation(state.liarGame.rounds?.[slide.questionIndex]?.roundId, liarResultCaption(state.liarGame, slide.questionIndex)) : liarPresentation(state.liarGame, slide, Date.now() + state.serverOffset);
    else if (slide.game === 'zoom') content = slide.view === 'score' ? scorePresentation(state.zoomGame.control?.roundId) : zoomPresentation(state.zoomGame, state.zoomQuestions ?? DEFAULT_ZOOM_QUESTIONS, slide, Date.now() + state.serverOffset);
    else content = slide.game === 'ox' ? oxPresentation(slide) : tastePresentation(slide);
  } else {
    const message = state.winner
      ? `<h2 id="winner-name">${escape(state.winner.name)}</h2><p class="winner-team">${TEAM_NAMES[state.winner.team]}</p>`
      : `<h1 class="race-waiting">${state.busy ? '준비 중' : '가장 먼저<br/><span>터치하세요!</span>'}</h1>`;
    content = `<section class="signal-screen ${state.winner ? 'winner-slide' : 'race-slide'}" aria-live="polite">
      ${state.winner ? '<div class="winner-backdrop" aria-hidden="true"></div>' : ''}
      <div class="race-copy">${message}</div>
    </section>`;
  }
  return `<div class="presentation" data-slide="${slide.id}" data-team="${state.winner?.team ?? ''}" style="--winner-delay: -${winnerElapsed}ms" aria-busy="${state.busy || state.controlsLocked}" aria-label="발표 화면. 화면 이동은 리모컨을 사용하세요." tabindex="-1"><main class="presentation-main">${content}</main>${errorBanner()}${state.winner ? '' : fullscreenControl()}${screenLabel}</div>`;
}

function participantTasteView() {
  const { slide, game, votes } = tasteContext();
  const phase = game.control?.phase;
  const prediction = phase === 'prediction-open';
  const open = slide.view === 'vote' && (prediction || phase === 'preference-open');
  const vote = prediction ? votes.prediction : votes.preference;
  const ready = prediction ? votes.predictionReady : votes.preferenceReady;
  if (open && ready && !vote) return `<main class="controller-main taste-mobile is-voting" data-team="${state.participant.team}">${errorBanner()}
    <div class="mobile-vote-options" role="group" aria-label="${prediction ? '최다 득표 예상 투표' : '취향 투표'}" style="--vote-option-count:${Object.keys(game.options ?? {}).length}">${Object.entries(game.options ?? {}).sort(([, a], [, b]) => a.order - b.order).map(([id, option]) => `<button data-vote="${escape(id)}" ${!ready || state.voting || !state.online || state.controlsLocked ? 'disabled' : ''}>${escape(option.label)}</button>`).join('')}</div>
  </main>`;
  return `<main class="controller-main taste-mobile" data-team="${state.participant.team}">${errorBanner()}
    <h1>대기 중</h1>
  </main>`;
}

function participantOxView() {
  const slide = STAGES[state.presentation?.slideIndex];
  const round = state.oxRound;
  const current = state.oxGame.control?.questionIndex === slide.questionIndex;
  const open = slide.view === 'question' && current && state.oxGame.control?.phase === 'open';
  if (open && state.oxReady && round.eligible && !round.vote) return `<main class="controller-main taste-mobile ox-mobile is-voting" data-team="${state.participant.team}">${errorBanner()}<div class="mobile-vote-options" role="group" aria-label="OX 응답" style="--vote-option-count:2">${['O', 'X'].map(answer => `<button data-ox-vote="${answer}" ${state.voting || !state.online || state.controlsLocked ? 'disabled' : ''}>${answer}</button>`).join('')}</div></main>`;
  const eliminated = state.oxReady && slide.view !== 'intro' && (!round.eligible || (round.result && !round.result.survivors?.[state.participantId]));
  const message = eliminated ? '탈락' : round.result?.survivors?.[state.participantId] ? slide.view === 'score' ? '최종 생존' : '정답입니다' : '대기 중';
  return `<main class="controller-main taste-mobile ox-mobile" data-team="${state.participant.team}">${errorBanner()}<h1>${message}</h1></main>`;
}

function participantView() {
  const portrait = matchMedia('(orientation: portrait)').matches;
  const enteringName = state.role === 'participant' && !state.participant;
  const needsFullscreen = !controllerFullscreen() && controllerCanFullscreen() && !state.fullscreenFallback;
  if (!enteringName && (portrait || needsFullscreen)) return `<main class="controller-gate"><h1>${needsFullscreen ? '전체화면 버튼을<br/>눌러주세요.' : '가로 화면으로 진행합니다.'}</h1><p>${needsFullscreen ? '버튼을 누르면 가로 전체화면으로 시작합니다.' : '기기를 가로로 돌려 참여해주세요.'}</p>${errorBanner()}${needsFullscreen ? `<button class="button dark" data-action="controller-start" ${state.screenStarting ? 'disabled' : ''}>${state.screenStarting ? '전환 중…' : '전체화면으로 시작'}</button>` : ''}</main>`;
  if (state.role === 'manager') return managerView();
  if (!state.participant) return `<main class="mobile-join"><div class="join-copy"><h1>${managementEntry ? '행사 관리자 입장' : '참가자 입장'}</h1><p>${managementEntry ? '등록된 관리자 이름으로 같은 행사에 접속합니다.' : '등록된 이름을 입력하세요.'}</p></div><div class="join-fields">${errorBanner()}<form id="name-form"><label for="real-name">${managementEntry ? '관리자 이름' : '이름'}</label><input id="real-name" maxlength="24" placeholder="${managementEntry ? '등록된 관리자 이름' : '실명 입력'}" autocomplete="name" value="${escape(state.name)}" required/>${state.choices ? `<label for="person-choice">동명이인이 있습니다. 조를 선택하세요.</label><select id="person-choice">${Object.entries(state.choices).map(([id, person]) => `<option value="${id}">${TEAM_NAMES[id[0]]} · ${escape(person.name)}</option>`).join('')}</select>` : ''}<button class="button dark" type="submit" ${state.busy || !state.ready ? 'disabled' : ''}>${state.busy ? '연결 중…' : '입장'}</button></form></div></main>`;
  if (state.presentation?.active && state.presentation.slideIndex >= 2) {
    const slide = STAGES[state.presentation.slideIndex];
    if (slide.game === 'yut') return `<main class="controller-main" data-team="${state.participant.team}">${errorBanner()}<section class="waiting-card"><span class="controller-identity">${TEAM_NAMES[state.participant.team]} · ${escape(state.participant.name)}</span><h1>${slide.view === 'play' ? '윷놀이 진행 중' : ['score', 'award'].includes(slide.view) ? '최종 시상' : '윷놀이'}</h1><p>발표 화면을 확인해주세요.</p></section></main>`;
    if (slide.game === 'reaction') return reactionParticipant({ game: state.reactionGame, slide, participant: state.participant, participantId: state.participantId, ready: state.reactionReady, disabled: state.busy || state.voting || (!state.online && (slide.view !== 'play' || !['selecting', 'open'].includes(state.reactionGame.control?.phase))) || state.controlsLocked, confirming: state.reactionConfirm, attempt: reactionClock.read(reactionKey()), error: errorBanner() });
    if (slide.game === 'memory') return memoryParticipant({ game: state.memoryGame, slide, participant: state.participant, participantId: state.participantId, ready: state.memoryReady, disabled: state.voting || !state.online || state.controlsLocked, confirming: state.memoryConfirm, error: errorBanner(), now: Date.now() + state.serverOffset });
    if (slide.game === 'number') return numberParticipant({ game: state.numberGame, slide, participant: state.participant, participantId: state.participantId, ready: state.numberReady, disabled: state.busy || state.voting || !state.online || state.controlsLocked, confirming: state.numberConfirm, choice: state.numberChoice, error: errorBanner(), now: Date.now() + state.serverOffset });
    if (slide.game === 'stopwatch') {
      const attempt = stopwatchClock.read(stopwatchKey());
      const remaining = STOPWATCH_MIN_MS - stopwatchClock.elapsed(stopwatchKey());
      clearTimeout(stopwatchTimer);
      if (attempt && attempt.elapsedMs === null && remaining > 0) stopwatchTimer = setTimeout(schedule, Math.ceil(remaining) + 1);
      return stopwatchParticipant({ game: state.stopwatchGame, slide, participant: state.participant, participantId: state.participantId, ready: state.stopwatchReady, disabled: state.busy || state.voting || (!state.online && !attempt) || state.controlsLocked, confirming: state.stopwatchConfirm, attempt, canStop: remaining <= 0, error: errorBanner(), now: Date.now() + state.serverOffset });
    }
    if (slide.game === 'liar') return liarParticipant({ game: state.liarGame, round: state.liarRound, slide, participant: state.participant, participantId: state.participantId, ready: state.liarReady, disabled: state.busy || state.voting || !state.online || state.controlsLocked, confirming: state.liarConfirm, error: errorBanner() });
    if (slide.game === 'zoom') return zoomParticipant({ game: state.zoomGame, round: state.zoomRound, ready: state.zoomReady, participant: state.participant, participantId: state.participantId, questionIndex: slide.questionIndex, disabled: state.voting || !state.online || state.controlsLocked, error: errorBanner() });
    return slide.game === 'ox' ? participantOxView() : participantTasteView();
  }
  const result = touchRoundResult(state.instruction, state.stage, state.presentation, state.participantId);
  const active = touchRoundIsActive(state.instruction, state.stage) && !result;
  const submitted = Boolean(state.instruction?.id) && (state.submittedRoundId === state.instruction.id || state.response?.instructionId === state.instruction.id);
  const showTarget = active && state.responseReady && !submitted;
  const identity = `<span class="controller-identity">${TEAM_NAMES[state.participant.team]} · ${escape(state.participant.name)}</span>`;
  const ended = state.stage.step === 'closed' || Boolean(result);
  const statusTitle = result === 'winner' ? '가장 먼저 터치했습니다!'
    : ended ? '마감되었습니다' : state.tapping ? '전송 중…' : active && submitted ? '입력 완료' : '대기 중';
  const statusDescription = !ended && !state.online ? '연결을 복구하고 있습니다.' : '';
  return `<main class="controller-main" data-team="${state.participant.team}">${errorBanner()}${showTarget ? `<button id="tap-target" class="tap-target" ${state.tapping || !state.online || state.controlsLocked || state.screenStarting ? 'disabled' : ''}>${identity}<strong>${state.tapping ? '전송 중…' : state.online ? '터치하세요!' : '재연결 중…'}</strong><span>화면 어디든 누르세요</span></button>` : `<section class="waiting-card" data-result="${result ?? (ended ? 'closed' : 'waiting')}">${identity}<h2>${statusTitle}</h2>${statusDescription ? `<p>${statusDescription}</p>` : ''}</section>`}</main>`;
}

function render() {
  const previousPhoto = $('.zoom-photo');
  const previousYutBoard = $('[data-yut-board]');
  const previousQr = $('.invite-qr');
  const previousQuestion = previousPhoto?.closest('[data-question]')?.dataset.question;
  const focused = document.activeElement, focusId = focused?.id;
  const selection = Number.isInteger(focused?.selectionStart) ? [focused.selectionStart, focused.selectionEnd] : null;
  const script = $('#manager-script');
  if (script) scriptPosition = { id: script.dataset.scriptId, scroll: script.scrollTop };
  document.body.classList.toggle('is-presenting', state.role === 'host' && state.presenting);
  document.body.classList.toggle('is-participant', state.role !== 'host');
  document.body.classList.toggle('is-manager', state.role === 'manager');
  document.body.classList.toggle('is-host', state.role === 'host');
  document.body.classList.toggle('is-controller', state.role !== 'host' && interactionLocked());
  document.documentElement.classList.toggle('is-interacting', interactionLocked());
  $('#app').innerHTML = state.role === 'host' ? hostView() : participantView();
  const nextYutBoard = $('[data-yut-board]');
  if (previousYutBoard && nextYutBoard && previousYutBoard.dataset.yutRound === nextYutBoard.dataset.yutRound) nextYutBoard.replaceWith(previousYutBoard);
  const nextPhoto = $('.zoom-photo');
  if (previousPhoto && nextPhoto && previousPhoto.src === nextPhoto.src && previousQuestion === nextPhoto.closest('[data-question]')?.dataset.question) {
    const style = nextPhoto.style.cssText;
    nextPhoto.replaceWith(previousPhoto);
    previousPhoto.getBoundingClientRect();
    previousPhoto.style.cssText = style;
  }
  bindEvents();
  bindYutBoard(document, {
    getGame: () => state.yutGame,
    disabled: state.busy || state.yutMoving || !state.online,
    onDrag: active => { yutDragging = active; if (!active) schedule(); },
    onMove: (id, position) => moveYut(id, position),
    onSplit: id => moveYut(id, null, true),
  });
  const currentScript = $('#manager-script');
  if (currentScript && currentScript.dataset.scriptId === scriptPosition?.id) currentScript.scrollTop = scriptPosition.scroll;
  for (const canvas of document.querySelectorAll('.invite-qr')) {
    const url = inviteUrl();
    if (previousQr?.dataset.inviteUrl === url) canvas.replaceWith(previousQr);
    else {
      QRCode.toCanvas(canvas, url, { width: 420, margin: 4, color: { dark: '#08121C', light: '#ffffff' } })
        .then(() => { canvas.dataset.inviteUrl = url; }).catch(() => {});
    }
  }
  if (focusId) { const input = document.getElementById(focusId); if (input) { input.focus({ preventScroll: true }); if (selection && input.setSelectionRange) input.setSelectionRange(...selection); } }
  clearTimeout(revealTimer);
  const { slide, game } = tasteContext(state.slideIndex);
  const result = slide.game === 'ox' ? game.rounds?.[slide.questionIndex]?.result : game.result;
  if (state.presenting && result && (slide.view === 'reveal' || (slide.game === 'ox' && slide.view === 'question'))) {
    const duration = slide.game === 'ox' ? OX_REVEAL_DURATION : Object.keys(result.order ?? {}).length * REVEAL_INTERVAL + 450;
    const remaining = result.revealedAt + duration - Date.now() - state.serverOffset;
    if (remaining > 0) revealTimer = setTimeout(schedule, remaining + 20);
  }
  if (state.presenting && slide.view === 'survivors') {
    const remaining = oxSurvivorRevealEnd(game.rounds?.[slide.questionIndex]) - Date.now() - state.serverOffset;
    if (Number.isFinite(remaining) && remaining > 0) revealTimer = setTimeout(schedule, remaining + 20);
  }
  if (state.presenting && slide.game === 'zoom' && slide.view === 'question') {
    const round = game.rounds?.[slide.questionIndex];
    const noticeAt = round?.verdict?.judgedAt ?? round?.request?.submittedAt;
    const remaining = noticeAt + ZOOM_NOTICE_DURATION - Date.now() - state.serverOffset;
    if (remaining > 0) revealTimer = setTimeout(schedule, remaining + 20);
  }
  const activeStopwatchSlide = STAGES[state.presentation?.slideIndex];
  if (state.presentation?.active && activeStopwatchSlide?.game === 'number' && activeStopwatchSlide.view === 'play') {
    const round = state.numberGame.rounds?.[activeStopwatchSlide.questionIndex];
    const remaining = round?.result?.revealedAt + NUMBER_REVEAL_DURATION - Date.now() - state.serverOffset;
    if (remaining > 0) revealTimer = setTimeout(schedule, remaining + 20);
  }
  if (state.presentation?.active && activeStopwatchSlide?.game === 'stopwatch' && activeStopwatchSlide.view === 'play' && state.stopwatchGame?.result) {
    const remaining = state.stopwatchGame.result.revealedAt + STOPWATCH_REVEAL_DURATION - Date.now() - state.serverOffset;
    if (remaining > 0) revealTimer = setTimeout(schedule, remaining + 20);
  }
  animateScoreNumbers();
  animateStopwatchRecords();
  scheduleZoomProgress();
  scheduleLiarProgress();
  scheduleMemoryProgress();
  scheduleYutCeremony();
  // render runs in requestAnimationFrame. Start beside the newly drawn cue,
  // before this frame is painted, using only this device's monotonic clock.
  if (!document.hidden && state.role === 'participant' && $('.reaction-tap:not(:disabled)')) reactionClock.start(reactionKey());
  void finishReaction();
}

async function finishReaction() {
  clearTimeout(reactionRetryTimer);
  const game = state.reactionGame, slide = STAGES[state.slideIndex], resetAt = state.presentation?.resetAt;
  if (state.role === 'participant' || !state.presenting || slide?.game !== 'reaction' || slide.view !== 'play'
    || !state.online || !game.control?.localTiming || state.teamScores?.awards?.[game.control.roundId] || !reactionSubmitted(game) || reactionFinalizing) return;
  if (Date.now() < reactionRetryAt) { reactionRetryTimer = setTimeout(schedule, reactionRetryAt - Date.now()); return; }
  reactionFinalizing = true;
  try {
    const scores = await api.awardReactionPoints(state.room);
    if (state.presentation?.resetAt === resetAt) state.teamScores = scores;
    reactionRetryAt = 0;
  } catch (error) { reactionRetryAt = Date.now() + 1500; showGameError(error); }
  finally { reactionFinalizing = false; schedule(); }
}

function animateScoreNumbers() {
  cancelAnimationFrame(scoreFrame);
  const { slide, game } = tasteContext(state.slideIndex);
  if (state.role !== 'host' || !state.presenting || slide.view !== 'score') return;
  const award = state.teamScores?.awards?.[['liar', 'number'].includes(slide.game) ? game.rounds?.[slide.questionIndex]?.roundId : game.control?.roundId];
  if (!award) return;
  const tick = () => {
    const progress = Math.min(1, Math.max(0, (performance.now() - state.scoreEntryAt - 250) / 1400));
    for (const node of document.querySelectorAll('[data-score-team]')) {
      const team = node.dataset.scoreTeam;
      node.textContent = Math.round(award.before[team] + (award.after[team] - award.before[team]) * progress);
    }
    if (progress < 1) scoreFrame = requestAnimationFrame(tick);
  };
  tick();
}

function animateStopwatchRecords() {
  cancelAnimationFrame(stopwatchFrame);
  const nodes = [...document.querySelectorAll('[data-stopwatch-time]')];
  if (!nodes.length) return;
  const game = state.stopwatchGame;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick = () => {
    const progress = reducedMotion ? 1 : stopwatchRevealProgress(game, Date.now() + state.serverOffset);
    for (const node of nodes) node.textContent = formatStopwatchTime(Number(node.dataset.stopwatchTime) * progress);
    if (progress < 1) stopwatchFrame = requestAnimationFrame(tick);
  };
  tick();
}

function chooseWinner() {
  if (state.role !== 'host' || !state.presenting || state.slideIndex !== 1 || state.winner || state.finalizingWinner || !state.raceRoundId) return;
  const winner = firstTouch(state.responses, state.participants, state.raceRoundId);
  if (!winner) return;
  const roundId = state.raceRoundId;
  const resetAt = state.presentation?.resetAt;
  state.finalizingWinner = true;
  void api.completeTouchRound(state.room, state.raceRoundId, winner.id).then(result => {
    state.finalizingWinner = false;
    if (state.raceRoundId === roundId && state.presentation?.resetAt === resetAt) syncPresentation(result.snapshot.val());
  }).catch(error => { state.finalizingWinner = false; showError(error); });
}

async function moveTo(index) {
  const resetAt = state.presentation?.resetAt ?? null;
  if (index === 0) {
    state.raceRoundId = null; state.winner = null;
    await api.setPresentation(state.room, true, resetAt);
    state.slideIndex = 0;
  } else if (index === 1) {
    state.winner = null; state.raceRoundId = null;
    const round = api.startTouchRound(state.room, Object.keys(state.participants), true, resetAt);
    state.raceRoundId = round.id; state.slideIndex = 1;
    schedule();
    await round.confirmed;
    chooseWinner();
  } else {
    const { key, slide } = tasteContext(index);
    if (key === 'yut') {
      state.yutGame = await api.prepareYutGame(state.room, resetAt);
      if (slide.view === 'score' && state.yutGame.result) {
        const result = await api.finishYutGame(state.room, state.yutGame.control.roundId, state.yutGame.result.winnerTeam);
        state.teamScores = result.scores;
      }
    } else if (key === 'reaction') {
      if (slide.view === 'select') state.reactionGame = await api.prepareReactionGame(state.room, state.participants, resetAt);
      if (slide.view === 'score') state.teamScores = await api.awardReactionPoints(state.room);
    } else if (key === 'memory') {
      if (slide.view === 'select' || slide.view === 'play') state.memoryGame = await api.prepareMemoryGame(state.room, state.participants, resetAt);
      if (slide.view === 'score') state.teamScores = await api.awardMemoryPoints(state.room, Date.now() + state.serverOffset);
    } else if (key === 'number') {
      if (slide.view === 'select' || slide.view === 'play') state.numberGame = await api.prepareNumberRound(state.room, state.participants, slide.questionIndex, resetAt, Date.now() + state.serverOffset);
      if (slide.view === 'score') state.teamScores = await api.awardNumberPoints(state.room, slide.questionIndex, Date.now() + state.serverOffset);
    } else if (key === 'stopwatch') {
      if (slide.view === 'select') state.stopwatchGame = await api.prepareStopwatch(state.room, state.participants, resetAt);
      if (slide.view === 'score') state.teamScores = await api.awardStopwatchPoints(state.room, Date.now() + state.serverOffset);
    } else if (key === 'liar') {
      if (slide.view === 'select' || slide.view === 'play') state.liarGame = await api.prepareLiarRound(state.room, state.participants, slide.questionIndex, resetAt);
      if (slide.view === 'score') state.teamScores = await api.awardLiarPoints(state.room, slide.questionIndex, Date.now() + state.serverOffset);
    } else if (key === 'zoom') {
      if (slide.view === 'question') state.zoomGame = await api.prepareZoomQuestion(state.room, state.participants, state.zoomQuestions ?? DEFAULT_ZOOM_QUESTIONS, slide.questionIndex, resetAt);
      if (slide.view === 'score') state.teamScores = await api.awardZoomPoints(state.room);
    } else if (key === 'ox') {
      if (slide.view === 'question') state.oxGame = await api.prepareOxQuestion(state.room, state.participants, slide.questionIndex, resetAt);
      if (slide.view === 'score') state.teamScores = await api.awardOxPoints(state.room);
    } else {
      state.tasteGames[key] = await api.ensureTasteGame(state.room, state.participants, key, resetAt);
      if (slide.view === 'score') state.teamScores = await api.awardTastePoints(state.room, key);
    }
    await api.setPresentationSlide(state.room, index, resetAt);
    state.slideIndex = index;
    state.winner = null; state.raceRoundId = null;
  }
  schedule();
}
async function advance(direction) {
  if (state.role !== 'manager' || !state.presenting || state.busy || state.controlsLocked || !state.online || document.hidden) return;
  const next = stageIndex(state.slideIndex, direction);
  if (next === state.slideIndex) return;
  if (direction > 0 && nextBlocked()) return;
  lockControls();
  state.busy = true;
  try { await moveTo(next); } catch (error) { showError(error); }
  finally { state.busy = false; schedule(); }
}

async function tap() {
  const instruction = state.instruction, participantId = state.participantId;
  if (!participantId || !state.responseReady || !state.online || state.tapping || state.screenStarting || state.controlsLocked || document.hidden || !touchRoundIsActive(instruction, state.stage)
    || state.response?.instructionId === instruction.id || state.submittedRoundId === instruction.id
    || touchRoundResult(instruction, state.stage, state.presentation, state.participantId)) return;
  state.tapping = true; schedule();
  try {
    await api.acknowledge(state.room, participantId, instruction.id);
    if (state.participantId === participantId && state.instruction?.id === instruction.id) state.submittedRoundId = instruction.id;
  }
  catch (error) {
    // Another participant may have closed this round while this tap was in transit.
    const [stage, presentation] = await Promise.all([
      api.read(state.room, 'stage').catch(() => state.stage),
      api.read(state.room, 'presentation').catch(() => state.presentation),
    ]);
    if (state.instruction?.id === instruction.id && touchRoundIsActive(instruction, stage) && !presentation?.winnerId) showError(error);
  }
  finally { state.tapping = false; schedule(); }
}

async function voteTaste(optionId) {
  const { key, slide, game, votes } = tasteContext();
  const phase = game.control?.phase;
  const prediction = phase === 'prediction-open';
  if (!state.online || state.voting || state.controlsLocked || document.hidden || !state.participantId
    || slide.view !== 'vote' || !['preference-open', 'prediction-open'].includes(phase)
    || !(prediction ? votes.predictionReady : votes.preferenceReady) || (prediction ? votes.prediction : votes.preference)) return;
  state.voting = true; state.error = ''; schedule();
  try {
    await api.submitTasteVote(state.room, state.participantId, prediction ? 'prediction' : 'preference', optionId, key);
    if (state.tasteVotes[key] === votes) votes[prediction ? 'prediction' : 'preference'] = { optionId };
  } catch { showError('투표를 제출하지 못했어요. 투표가 마감되었는지 또는 연결 상태를 확인해주세요.'); }
  finally { state.voting = false; schedule(); }
}

async function voteOx(answer) {
  const { slide, game } = tasteContext();
  const round = state.oxRound;
  if (!state.online || state.voting || state.controlsLocked || document.hidden || !state.participantId
    || slide.game !== 'ox' || slide.view !== 'question' || game.control?.questionIndex !== slide.questionIndex
    || game.control.phase !== 'open' || !state.oxReady || !round.eligible || round.vote) return;
  state.voting = true; state.error = ''; schedule();
  try {
    await api.submitOxVote(state.room, state.participantId, slide.questionIndex, answer, game.control.roundId);
    if (state.oxRound === round) round.vote = { answer };
  } catch { showError('응답을 제출하지 못했어요. 마감 여부와 연결 상태를 확인해주세요.'); }
  finally { state.voting = false; schedule(); }
}

async function voteLiar(participantId) {
  const { slide, game } = tasteContext();
  const round = state.liarRound;
  if (!state.online || state.voting || state.controlsLocked || document.hidden || !state.liarReady || !state.participantId
    || slide.game !== 'liar' || slide.view !== 'play' || game.control?.phase !== 'voting'
    || round.vote || Object.values(round.contestants ?? {}).some(person => person.participantId === state.participantId)) return;
  state.voting = true; state.error = ''; schedule();
  try { await api.submitLiarVote(state.room, state.participantId, slide.questionIndex, participantId, game.control.roundId); }
  catch (error) { showError(error); }
  finally { state.voting = false; schedule(); }
}

async function requestZoomAnswer() {
  const slide = STAGES[state.presentation?.slideIndex];
  const control = state.zoomGame.control;
  if (!state.online || state.voting || state.controlsLocked || document.hidden || !state.participantId || !state.zoomReady
    || slide?.game !== 'zoom' || slide.view !== 'question' || control?.questionIndex !== slide.questionIndex
    || control.phase !== 'open' || state.zoomRound.request || state.zoomRound.blocked) return;
  state.voting = true; state.error = ''; schedule();
  try { await api.submitZoomRequest(state.room, state.participantId, slide.questionIndex, control.roundId, control.attemptId); }
  catch { showError('다른 조가 먼저 요청했거나 우리 조의 답변 기회를 이미 사용했습니다. 화면을 확인해주세요.'); }
  finally { state.voting = false; schedule(); }
}

async function actOnZoom(name, token) {
  const control = state.zoomGame.control;
  const slide = STAGES[state.slideIndex];
  if (!['host', 'manager'].includes(state.role) || !state.online || state.busy || state.controlsLocked || document.hidden
    || slide?.game !== 'zoom' || slide.view !== 'question' || slide.questionIndex !== token.questionIndex
    || control?.roundId !== token.roundId || control.questionIndex !== token.questionIndex) return;
  lockControls(); state.busy = true;
  try {
    if (name === 'in' || name === 'out') await api.changeZoom(state.room, token.roundId, token.questionIndex, name === 'out' ? 1 : -1);
    else if (name === 'skip') await api.skipZoomQuestion(state.room, token.roundId, token.questionIndex);
    else if (name === 'correct' || name === 'wrong') await api.judgeZoom(state.room, token.roundId, token.questionIndex, token.requestId, name === 'correct');
  } catch (error) { showGameError(error); }
  finally { state.busy = false; schedule(); }
}

function scheduleZoomProgress() {
  clearTimeout(zoomTimer);
  const slide = STAGES[state.slideIndex], game = state.zoomGame, control = game.control;
  const catchingUp = control?.questionIndex > slide?.questionIndex;
  if (state.role === 'participant' || !state.online || !state.presenting || zoomAdvancing
    || slide?.game !== 'zoom' || slide.view !== 'question' || !control || control.questionIndex < slide.questionIndex
    || (!catchingUp && !['correct', 'wrong', 'skipped', 'complete'].includes(control.phase))) return;
  const verdict = game.rounds?.[control.questionIndex]?.verdict;
  const wait = catchingUp || control.phase === 'complete' ? 0 : (verdict?.judgedAt ?? 0) + ZOOM_FEEDBACK_DURATION - Date.now() - state.serverOffset;
  zoomTimer = setTimeout(async () => {
    zoomAdvancing = true;
    const expectedIndex = state.slideIndex, resetAt = control.resetAt ?? null;
    try {
      const next = catchingUp || control.phase === 'complete' ? game : await api.finishZoomRound(state.room, control.roundId, control.questionIndex, verdict.requestId, Date.now() + state.serverOffset);
      if (state.zoomGame.control?.roundId !== control.roundId || state.slideIndex !== expectedIndex || (state.presentation?.resetAt ?? null) !== resetAt) return;
      if (next.control.questionIndex !== slide.questionIndex || next.control.phase === 'complete') {
        const nextIndex = STAGES.findIndex(stage => stage.game === 'zoom' && (next.control.phase === 'complete' ? stage.view === 'score' : stage.view === 'question' && stage.questionIndex === next.control.questionIndex));
        if (next.control.phase === 'complete') state.teamScores = await api.awardZoomPoints(state.room);
        const result = await api.followZoomSlide(state.room, expectedIndex, nextIndex, resetAt);
        if (result.committed) syncPresentation(result.snapshot.val());
      }
      zoomRetryAt = 0;
    } catch (error) { zoomRetryAt = Date.now() + 2000; showGameError(error); }
    finally { zoomAdvancing = false; schedule(); }
  }, Math.max(10, wait, zoomRetryAt - Date.now()));
}

function scheduleLiarProgress() {
  clearTimeout(liarTimer);
  if (liarAdvancing) return;
  const slide = STAGES[state.slideIndex], game = state.liarGame;
  const round = game.rounds?.[slide?.questionIndex];
  if (state.role === 'participant' || !state.presenting || slide?.game !== 'liar' || slide.view !== 'play' || !round?.result) {
    liarPendingId = null;
    return;
  }
  if (!state.online || state.busy || (state.teamScores?.awards?.[round.roundId] && liarPendingId !== round.roundId)) return;
  const expectedIndex = state.slideIndex, resetAt = game.control.resetAt ?? null;
  const stillCurrent = () => state.slideIndex === expectedIndex && (state.presentation?.resetAt ?? null) === resetAt && state.liarGame.rounds?.[slide.questionIndex]?.roundId === round.roundId;
  liarTimer = setTimeout(async () => {
    if (!stillCurrent()) return;
    if (!liarRevealFinished(round, Date.now() + state.serverOffset)) { schedule(); return; }
    liarAdvancing = true; liarPendingId = round.roundId;
    state.busy = true; schedule();
    try {
      const scores = await api.awardLiarPoints(state.room, slide.questionIndex, Date.now() + state.serverOffset);
      if (!stillCurrent()) return;
      state.teamScores = scores;
      const result = await api.followPresentationSlide(state.room, expectedIndex, stageIndex(expectedIndex, 1), resetAt);
      if (result.committed) syncPresentation(result.snapshot.val());
      liarPendingId = null; liarRetryAt = 0;
    } catch (error) {
      const pending = error.code === 'liar/reveal-pending';
      liarRetryAt = Date.now() + (pending ? 50 : 1500);
      if (stillCurrent() && !pending) showGameError(error);
    } finally { liarAdvancing = false; state.busy = false; schedule(); }
  }, Math.max(10, round.result.revealedAt + LIAR_REVEAL_DURATION - Date.now() - state.serverOffset, liarRetryAt - Date.now()));
}

function scheduleMemoryProgress() {
  clearTimeout(memoryTimer);
  const { slide, game } = tasteContext();
  if (!state.presentation?.active || slide?.game !== 'memory' || slide.view !== 'play' || !game.control?.startedAt) return;
  const now = Date.now() + state.serverOffset;
  const players = memoryStandings(game, now);
  const deadlines = players.filter(player => player.finishedAt === null).map(player =>
    now < player.roundStartedAt + MEMORY_PREVIEW_MS ? Math.min(player.roundStartedAt + MEMORY_PREVIEW_MS, now + 250) : player.readyAt);
  const next = Math.min(...deadlines.filter(at => at > now));
  if (Number.isFinite(next)) memoryTimer = setTimeout(schedule, Math.max(20, next - now + 10));
  if (state.role === 'participant' || !memoryFinished(game, now) || memoryAdvancing || !state.online || state.busy) return;
  const index = state.presentation.slideIndex, roundId = game.control.roundId, resetAt = game.control.resetAt ?? null;
  memoryTimer = setTimeout(async () => {
    if (state.memoryGame.control?.roundId !== roundId || state.presentation?.slideIndex !== index) return;
    memoryAdvancing = true;
    try {
      await api.awardMemoryPoints(state.room, Date.now() + state.serverOffset);
      const result = await api.followPresentationSlide(state.room, index, stageIndex(index, 1), resetAt);
      if (result.committed) syncPresentation(result.snapshot.val());
      memoryRetryAt = 0;
    } catch (error) { memoryRetryAt = Date.now() + 1500; showGameError(error); }
    finally { memoryAdvancing = false; schedule(); }
  }, Math.max(10, memoryRetryAt - Date.now()));
}

function editableZoomQuestions() {
  state.zoomDraft ??= Object.fromEntries(Object.entries(state.zoomQuestions ?? DEFAULT_ZOOM_QUESTIONS).map(([index, question]) => [index, { ...question }]));
  return state.zoomDraft;
}

async function readZoomImage(file) {
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw { userMessage: '20MB 이하의 사진 파일을 선택해주세요.' };
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.85);
    if (data.length > 1500000) throw { userMessage: '사진 용량이 큽니다. 더 작은 사진을 선택해주세요.' };
    return data;
  } finally { URL.revokeObjectURL(url); }
}

async function moveYut(id, position, split = false) {
  if (state.role !== 'host' || state.yutMoving || !state.online || state.yutGame.control?.phase !== 'playing') return;
  const roundId = state.yutGame.control.roundId;
  const previous = state.yutGame;
  state.yutMoving = true;
  try {
    state.yutGame = { ...previous, pieces: split ? splitYutStack(previous.pieces, id) : moveYutPiece(previous.pieces, id, position).pieces };
    schedule();
    const game = await api.moveYutToken(state.room, roundId, id, position, split);
    if (state.yutGame.control?.roundId === roundId) state.yutGame = game;
  } catch (error) {
    if (state.yutGame.control?.roundId === roundId) state.yutGame = await api.read(state.room, 'yutGame').catch(() => previous) ?? previous;
    showError(error);
  }
  finally { state.yutMoving = false; schedule(); }
}

function scheduleYutCeremony() {
  clearTimeout(yutTimer);
  const slide = STAGES[state.slideIndex];
  const roundId = state.yutGame.control?.roundId;
  if (state.role !== 'host' || !state.presenting || !state.online || yutAdvancing || slide.game !== 'yut'
    || !['score', 'award'].includes(slide.view) || !state.teamScores?.awards?.[roundId]
    || state.slideIndex === STAGES.length - 1) return;
  const expectedIndex = state.slideIndex, resetAt = state.presentation?.resetAt ?? null;
  const delay = (state.presentation?.updatedAt ?? Date.now()) + slide.duration - Date.now() - state.serverOffset;
  yutTimer = setTimeout(async () => {
    yutAdvancing = true;
    try {
      await api.followPresentationSlide(state.room, expectedIndex, expectedIndex + 1, resetAt);
      yutRetryAt = 0;
    } catch (error) { yutRetryAt = Date.now() + 2000; showError(error); }
    finally { yutAdvancing = false; schedule(); }
  }, Math.max(50, delay, yutRetryAt - Date.now()));
}

async function save() {
  const submittedRows = JSON.stringify(state.rows);
  let roster;
  try { roster = count() ? rosterFromInputs(state.rows) : { participants: {}, nameIndex: {} }; }
  catch (error) { throw { userMessage: error.message }; }
  for (const id of Object.keys(state.bindings)) if (!roster.participants[id]) throw { userMessage: '연결된 참가자를 삭제하려면 먼저 기기 연결을 해제해주세요.' };
  await api.saveRoster(state.room, roster, '마티니 MT');
  if (JSON.stringify(state.rows) === submittedRows) {
    state.rows = rowsFromParticipants(roster.participants);
    state.dirty = false;
    rememberRoster();
  }
}
async function action(name, errorId) {
  state.error = '';
  if (name === 'previous' && state.presenting && state.slideIndex === 0) name = 'exit';
  if (name === 'dismiss') {
    state.gameError = '';
    if (state.role === 'manager' && errorId) {
      await api.clearOperatorError(state.room, errorId).catch(showError);
    }
    schedule();
    return;
  }
  if (name === 'controller-start') { await startController(); return; }
  if (name === 'liar-cancel') { state.liarConfirm = false; schedule(); return; }
  if (name === 'liar-volunteer') { state.liarConfirm = true; schedule(); return; }
  if (name === 'previous' || name === 'next') { await advance(name === 'next' ? 1 : -1); return; }
  if (name === 'fullscreen') {
    if (state.screenStarting) return;
    state.screenStarting = true;
    schedule();
    try { if (!document.documentElement.requestFullscreen) throw new Error(); await document.documentElement.requestFullscreen(); }
    catch { showError('전체화면으로 전환할 수 없습니다. 컴퓨터에서는 F11을 사용하세요.'); }
    finally { state.screenStarting = false; lockControls(); schedule(); }
    return;
  }
  if (state.busy || (state.controlsLocked && name !== 'exit') || !state.online || document.hidden) return;
  lockControls();
  state.busy = true; schedule();
  try {
    if (name === 'reaction-signal' && STAGES[state.slideIndex].game === 'reaction' && STAGES[state.slideIndex].view === 'play') await api.signalReactionGame(state.room, state.reactionGame.control?.roundId);
    if (name.startsWith('yut-win-') && STAGES[state.slideIndex].id === 'yut-board') {
      const result = await api.finishYutGame(state.room, state.yutGame.control?.roundId, name.slice(-1));
      state.yutGame = result.game; state.teamScores = result.scores;
      await api.followPresentationSlide(state.room, state.slideIndex, STAGES.findIndex(slide => slide.id === 'final-ranking'), state.presentation?.resetAt ?? null);
    }
    if (name === 'reset' && state.role === 'host' && !state.presenting) {
      await api.resetPresentation(state.room, false);
      state.gameError = '';
    }
    if (name === 'memory-start' && state.role !== 'participant' && STAGES[state.slideIndex]?.game === 'memory') await api.startMemoryGame(state.room, state.memoryGame.control?.roundId);
    if (name === 'present') {
      if (state.role === 'host') { await flushRoster(); await flushManager(); }
      if (!count()) throw { userMessage: '참가자를 한 명 이상 입력해주세요.' };
      await moveTo(0);
      state.presenting = true;
      window.scrollTo(0, 0);
    }
    if (name === 'exit') {
      await api.setPresentation(state.room, false, state.presentation?.resetAt ?? null);
      state.presenting = false; state.raceRoundId = null; state.winner = null;
    }
    if (name === 'ox-save') {
      const questions = state.oxDraft;
      if (questions) {
        await api.saveOxQuestions(state.room, questions);
        if (state.oxDraft === questions) state.oxDraft = null;
      }
    }
    if (name === 'zoom-save' && state.zoomDraft) {
      const questions = state.zoomDraft;
      await api.saveZoomQuestions(state.room, questions);
      if (state.zoomDraft === questions) state.zoomDraft = null;
    }
    if (name === 'liar-confirm' && state.participantId && state.liarReady) {
      const { slide, game } = tasteContext();
      if (liarUsedIds(game).has(state.participantId)) throw { userMessage: '이미 출전한 사람은 다시 출전할 수 없습니다.' };
      await api.claimLiarEntry(state.room, state.participantId, slide.questionIndex, game.control.roundId);
      state.liarConfirm = false;
    }
    if (['number-start', 'number-open', 'number-reveal'].includes(name)) {
      const { slide } = tasteContext();
      if (state.role === 'participant' || slide.game !== 'number' || slide.view !== 'play') return;
      state.numberGame = await api.changeNumberPhase(state.room, slide.questionIndex, state.numberGame.control?.roundId, name);
    }
    if (['stopwatch-start', 'stopwatch-reveal'].includes(name)) {
      const resetAt = state.presentation?.resetAt;
      const game = await api.changeStopwatchPhase(state.room, state.stopwatchGame.control?.roundId, name);
      if (state.presentation?.resetAt !== resetAt) return;
      state.stopwatchGame = game;
    }
    if (['liar-deal', 'liar-vote', 'liar-finish', 'liar-reveal'].includes(name)) {
      const slide = STAGES[state.slideIndex];
      const resetAt = state.presentation?.resetAt;
      const game = await api.changeLiarPhase(state.room, slide.questionIndex, state.liarGame.control?.roundId, name);
      if (state.presentation?.resetAt !== resetAt) return;
      state.liarGame = game;
    }
    if (['ox-start', 'ox-close', 'ox-reveal'].includes(name)) {
      const slide = STAGES[state.slideIndex];
      state.oxGame = await api.changeOxPhase(state.room, slide.questionIndex, name, state.oxGame.control?.roundId);
    }
    if (name === 'ox-survivors') {
      state.oxGame = await api.revealOxSurvivors(state.room, STAGES[state.slideIndex].questionIndex, state.oxGame.control?.roundId);
    }
    if (['start-preference', 'stop-preference', 'start-prediction', 'stop-prediction', 'reveal-answer', 'reveal-taste'].includes(name)) {
      const { key } = tasteContext();
      state.tasteGames[key] = await api.changeTastePhase(state.room, name, key);
    }
    if (name === 'release-manager' && state.managerBinding) await api.releaseManager(state.room, state.managerBinding.uid);
  } catch (error) { showError(error); }
  finally { state.busy = false; schedule(); }
}

async function memoryAction(name, cardIndex) {
  const { slide, game } = tasteContext();
  if (slide?.game !== 'memory' || !state.memoryReady || !state.participant || state.voting || !state.online || state.controlsLocked || document.hidden) return;
  if (name === 'memory-cancel') { state.memoryConfirm = false; schedule(); return; }
  if (name === 'memory-volunteer') { state.memoryConfirm = true; schedule(); return; }
  const now = Date.now() + state.serverOffset;
  const player = memoryPlayer(game.events?.[state.participant.team], game.control?.startedAt, now, memoryLayouts(game));
  if (name === 'memory-flip' && (slide.view !== 'play' || game.control?.phase !== 'running'
    || game.contestants?.[state.participant.team]?.participantId !== state.participantId || !memoryCanFlip(player, cardIndex, now))) return;
  state.voting = true; state.error = ''; schedule();
  // Lock the current DOM before the next animation frame can redraw it.
  for (const card of document.querySelectorAll('[data-memory-card]')) card.disabled = true;
  try {
    if (name === 'memory-confirm' && slide.view === 'select' && game.control?.phase === 'selecting') {
      await api.claimMemoryEntry(state.room, state.participantId, game.control.roundId);
      state.memoryConfirm = false;
    }
    if (name === 'memory-flip') await api.submitMemoryFlip(state.room, state.participant.team, game.control.roundId, player.roundIndex, cardIndex, player.sequence);
  } catch (error) { showError(error); }
  finally { state.voting = false; schedule(); }
}

async function numberAction(name) {
  const { slide, game } = tasteContext();
  if (slide?.game !== 'number' || !state.numberReady || !state.participant || state.busy || state.voting || state.controlsLocked || !state.online || document.hidden) return;
  if (name === 'number-cancel') { state.numberConfirm = false; schedule(); return; }
  if (name === 'number-volunteer') { state.numberConfirm = true; schedule(); return; }
  state.voting = true; state.error = ''; schedule();
  try {
    if (name === 'number-confirm' && slide.view === 'select' && game.control?.phase === 'selecting') {
      await api.claimNumberEntry(state.room, state.participantId, game.control.roundId);
      state.numberConfirm = false;
    }
    if (name === 'number-submit' && slide.view === 'play' && game.control?.phase === 'open' && game.control.questionIndex === slide.questionIndex && NUMBER_VALUES.includes(state.numberChoice)) {
      await api.submitNumber(state.room, state.participantId, state.participant.team, slide.questionIndex, game.control.roundId, state.numberChoice);
    }
  } catch (error) { showError(error); }
  finally { state.voting = false; schedule(); }
}

async function stopwatchAction(name) {
  const { slide, game } = tasteContext();
  if (slide?.game !== 'stopwatch' || !state.stopwatchReady || !state.participant || state.busy || state.voting || state.controlsLocked || document.hidden) return;
  if (name === 'stopwatch-cancel') { state.stopwatchConfirm = false; schedule(); return; }
  if (name === 'stopwatch-volunteer') { state.stopwatchConfirm = true; schedule(); return; }
  const key = stopwatchKey();
  const ownEntry = game.contestants?.[state.participant.team]?.participantId === state.participantId;
  if (name === 'stopwatch-count-start' && slide.view === 'play' && ownEntry && game.control?.phase === 'running' && !game.submissions?.[state.participant.team]) {
    stopwatchClock.start(key);
    schedule();
    return;
  }
  let elapsedMs;
  try {
    if (['stopwatch-count-stop', 'stopwatch-submit'].includes(name)) {
      if (slide.view !== 'play' || !ownEntry || game.control?.phase !== 'running' || game.submissions?.[state.participant.team]) return;
      // Capture the local duration synchronously, before any network request or redraw.
      elapsedMs = stopwatchClock.stop(key);
    }
    state.voting = true;
    schedule();
    if (name === 'stopwatch-confirm' && slide.view === 'select' && game.control?.phase === 'selecting') {
      if (game.excluded?.[state.participantId]) throw { userMessage: '라이어게임 출전자는 참여할 수 없습니다.' };
      await api.claimStopwatchEntry(state.room, state.participantId, game.control.roundId);
      state.stopwatchConfirm = false;
    }
    if (elapsedMs !== undefined) await api.submitStopwatch(state.room, state.participantId, state.participant.team, game.control.roundId, elapsedMs);
  } catch (error) { showError(error); }
  finally { state.voting = false; schedule(); }
}

async function reactionAction(name) {
  const { slide, game } = tasteContext();
  if (slide?.game !== 'reaction' || !state.reactionReady || !state.participant || state.voting || state.busy || state.controlsLocked || document.hidden) return;
  if (name === 'reaction-volunteer') { state.reactionConfirm = true; schedule(); return; }
  if (name === 'reaction-cancel') { state.reactionConfirm = false; schedule(); return; }
  state.voting = true;
  schedule();
  try {
    if (name === 'reaction-confirm' && slide.view === 'select' && game.control?.phase === 'selecting') {
      await api.claimReactionEntry(state.room, state.participantId, game.control.roundId);
      state.reactionConfirm = false;
    }
    if (['reaction-false-start', 'reaction-tap', 'reaction-retry'].includes(name) && slide.view === 'play' && ['selecting', 'open'].includes(game.control?.phase) && !game.winner && !game.submissions?.[state.participant.team]
      && game.contestants?.[state.participant.team]?.participantId === state.participantId) {
      if (name === 'reaction-false-start') reactionClock.disqualify(reactionKey());
      const disqualified = reactionClock.read(reactionKey())?.disqualified === true;
      if (!disqualified && game.control.phase !== 'open') return;
      const elapsedMs = disqualified ? 0 : game.control.localTiming ? reactionClock.stop(reactionKey()) : undefined;
      await api.submitReactionTap(state.room, state.participantId, state.participant.team, game.control.roundId, elapsedMs, disqualified);
    }
  } catch (error) { showError(error); }
  finally { state.voting = false; schedule(); }
}

function bindEvents() {
  document.querySelectorAll('[data-action]').forEach(control => control.addEventListener('click', () => { void action(control.dataset.action, control.dataset.errorId); }));
  for (const control of document.querySelectorAll('[data-vote], [data-ox-vote], [data-zoom-request], [data-liar-vote], [data-liar-action], [data-stopwatch-action], [data-number-action], [data-number-choice], [data-memory-action], [data-memory-card], [data-reaction-action]')) {
    input.bindVote(control);
  }
  document.querySelectorAll('[data-zoom-action]').forEach(control => {
    const token = { roundId: control.dataset.roundId, questionIndex: Number(control.dataset.questionIndex), requestId: control.dataset.requestId };
    control.addEventListener('click', () => { void actOnZoom(control.dataset.zoomAction, token); });
  });
  document.querySelectorAll('[data-zoom-image]').forEach(input => input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || state.busy) return;
    state.busy = true; schedule();
    try {
      const image = await readZoomImage(file);
      Object.assign(editableZoomQuestions()[input.dataset.zoomImage], { image, focusX: 50, focusY: 50 });
    }
    catch (error) { showError(error); }
    finally { state.busy = false; schedule(); }
  }));
  bindZoomEditor(document, {
    getQuestion: index => (state.zoomDraft ?? state.zoomQuestions ?? DEFAULT_ZOOM_QUESTIONS)[index],
    editQuestion: (index, changes) => {
      Object.assign(editableZoomQuestions()[index], changes);
      $('[data-action="zoom-save"]').disabled = false;
      $('#zoom-save-status').textContent = '저장 전 변경사항';
    },
    onDragging: active => { zoomEditing = active; if (!active) schedule(); },
  });
  document.querySelectorAll('[data-ox-question], [data-ox-answer]').forEach(control => control.addEventListener('input', () => {
    const index = control.dataset.oxQuestion ?? control.dataset.oxAnswer;
    const questions = state.oxDraft ?? state.oxQuestions ?? emptyOxQuestions();
    state.oxDraft = { ...questions, [index]: { ...questions[index], [control.dataset.oxQuestion === undefined ? 'answer' : 'text']: control.value } };
    schedule();
  }));
  const script = $('#manager-script');
  if (script) {
    let startX, startScroll;
    const direction = script.closest('.manager-controller').dataset.rotation === 'clockwise' ? -1 : 1;
    script.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      startX = event.clientX;
      startScroll = script.scrollTop;
      script.setPointerCapture(event.pointerId);
    });
    // The rotated panel's vertical axis follows the landscape viewport's horizontal axis.
    script.addEventListener('pointermove', event => {
      if (!script.hasPointerCapture(event.pointerId)) return;
      script.scrollTop = startScroll + (startX - event.clientX) * direction;
    });
  }
  $('#manager-name')?.addEventListener('input', event => {
    state.managerName = event.target.value;
    state.managerDirty = true;
    state.managerError = '';
    local.set(managerStorageKey, state.managerName);
    local.set(`${managerStorageKey}.pending`, 'true');
    queueManagerSave();
    $('#manager-status').textContent = managerStatus();
  });
  document.querySelectorAll('[data-person]').forEach(input => input.addEventListener('input', () => {
    const [team, number] = input.dataset.person;
    state.rows[team][Number(number) - 1] = input.value;
    state.dirty = true;
    state.rosterError = '';
    rememberRoster();
    queueRosterSave();
    $(`#count-${team}`).textContent = `${state.rows[team].filter(name => name.trim()).length} / 6`;
    $('#total-count').textContent = count();
    $('#roster-status').textContent = rosterStatus();
  }));
  $('#real-name')?.addEventListener('input', event => { state.name = event.target.value; state.choices = null; });
  $('#name-form')?.addEventListener('submit', join);
  document.querySelectorAll('[data-release-manager]').forEach(control => control.addEventListener('click', async () => {
    if (confirm('이 관리자 기기의 연결을 해제할까요?')) {
      try { await api.releaseManager(state.room, control.dataset.releaseManager); } catch (error) { showError(error); }
    }
  }));
  document.querySelectorAll('[data-release]').forEach(control => control.addEventListener('click', async () => {
    const id = control.dataset.release;
    if (confirm(`${state.participants[id].name} 님의 기기 연결을 해제할까요?`)) { try { await api.releaseParticipant(state.room, id, state.bindings[id].uid); queueRosterSave(); } catch (error) { showError(error); } }
  }));
  $('#tap-target')?.addEventListener('pointerdown', event => { if (event.isPrimary && event.button === 0) { event.preventDefault(); void tap(); } });
  $('#tap-target')?.addEventListener('click', event => { if (event.detail === 0) void tap(); });
}

async function join(event) {
  event.preventDefault(); if (state.busy) return;
  $('#real-name')?.blur();
  state.error = ''; state.busy = true;
  const chosen = $('#person-choice')?.value; schedule();
  try {
    if (chosen && state.choices?.[chosen]) await api.claimParticipant(state.room, chosen, state.uid);
    else {
      if (!state.name.trim()) throw { userMessage: '본인의 실명을 입력해주세요.' };
      const manager = await api.lookupManager(state.room, state.name).catch(() => null);
      if (manager) { await api.claimManager(state.room, state.name, state.uid); return; }
      if (managementEntry) throw { userMessage: '등록된 관리자 이름을 확인해주세요.' };
      const choices = await api.lookupName(state.room, state.name);
      if (!choices || !Object.keys(choices).length) throw { userMessage: '등록된 이름을 찾지 못했어요. 진행자에게 알려주세요.' };
      if (Object.keys(choices).length > 1) { state.choices = choices; return; }
      await api.claimParticipant(state.room, Object.keys(choices)[0], state.uid);
    }
    state.choices = null;
  } catch (error) { showError(error); }
  finally { state.busy = false; schedule(); }
}

async function syncPresence() {
  if (!state.participantId || !state.online || presenceClose) return;
  const epoch = ++presenceEpoch;
  try { const close = await api.registerPresence(state.room, state.uid, state.participantId); if (epoch !== presenceEpoch) await close().catch(() => {}); else presenceClose = close; }
  catch (error) { if (epoch === presenceEpoch) showError(error); }
}
function attachParticipant(id) {
  participantSubscriptions.clear(); state.participantId = id;
  state.participant = null; state.instruction = null; state.response = null; state.responseReady = false; state.submittedRoundId = null;
  state.tasteGames = {}; state.tasteVotes = {};
  state.oxGame = {}; state.oxRound = {}; state.oxReady = false;
  state.zoomGame = {}; state.zoomRound = {}; state.zoomReady = false;
  state.liarGame = {}; state.liarRound = {}; state.liarReady = false; state.liarConfirm = false;
  state.stopwatchGame = {}; state.stopwatchReady = false; state.stopwatchConfirm = false;
  state.numberGame = {}; state.numberReady = false; state.numberConfirm = false; state.numberChoice = null;
  state.memoryGame = {}; state.memoryReady = false; state.memoryConfirm = false;
  state.reactionGame = {}; state.reactionReady = false; state.reactionConfirm = false;
  state.yutGame = {};
  if (!id) { watchActiveGame(); presenceEpoch++; presenceClose?.().catch(() => {}); presenceClose = null; state.participant = null; state.instruction = null; state.response = null; schedule(); return; }
  participantSubscriptions.watch(`participants/${id}`, person => { state.participant = person; void syncPresence(); schedule(); }, showError);
  participantSubscriptions.watch(`instructions/${id}`, instruction => { state.instruction = instruction; schedule(); }, showError);
  participantSubscriptions.watch(`responses/${id}`, response => { state.response = response; state.responseReady = true; schedule(); }, showError);
  watchActiveGame();
}

function watchActiveGame() {
  const { key, slide } = tasteContext();
  const questionIndex = slide?.questionIndex ?? (slide?.view === 'score' ? (key === 'zoom' ? ZOOM_QUESTION_COUNT : OX_QUESTION_COUNT) - 1 : 0);
  const watchKey = `${state.role}:${state.participantId ?? ''}:${key}:${['ox', 'zoom', 'liar', 'number'].includes(key) ? questionIndex : ''}`;
  if (watchKey === gameWatchKey) return;
  gameSubscriptions.clear(); gameWatchKey = null;
  if (!state.uid || !state.room || (state.role === 'participant' && !state.participantId)) return;
  gameWatchKey = watchKey;
  if (key === 'yut') {
    if (state.role !== 'participant') gameSubscriptions.watch('yutGame', value => { state.yutGame = value ?? {}; schedule(); }, showGameError);
    return;
  }
  if (key === 'reaction') {
    if (state.role === 'participant') {
      const game = {};
      state.reactionGame = game; state.reactionReady = false;
      const ready = new Set();
      let watchingSubmission = false;
      const received = field => { ready.add(field); state.reactionReady = ready.size === 6; schedule(); };
      for (const field of ['control', 'winner', 'result']) gameSubscriptions.watch(`reactionGame/${field}`, value => { game[field] = value; received(field); }, showError);
      gameSubscriptions.watch('reactionGame/contestants', value => {
        game.contestants = value;
        const team = state.participantId[0];
        if (value?.[team]?.participantId === state.participantId && !watchingSubmission) {
          watchingSubmission = true;
          ready.delete('submission');
          state.reactionReady = false;
          gameSubscriptions.watch(`reactionGame/submissions/${team}`, submission => { game.submissions = { [team]: submission }; received('submission'); }, showError);
        } else if (!watchingSubmission) {
          game.submissions = {};
          received('submission');
        }
        received('contestants');
      }, showError);
      gameSubscriptions.watch(`reactionGame/excluded/${state.participantId}`, value => { game.excluded = { [state.participantId]: value }; received('excluded'); }, showError);
    } else gameSubscriptions.watch('reactionGame', value => { state.reactionGame = value ?? {}; schedule(); }, showGameError);
    return;
  }
  if (key === 'memory') {
    if (state.role === 'participant') {
      const game = { events: {} };
      state.memoryGame = game; state.memoryReady = false;
      const ready = new Set();
      const received = field => { ready.add(field); state.memoryReady = ready.size === 4; schedule(); };
      for (const field of ['control', 'contestants']) gameSubscriptions.watch(`memoryGame/${field}`, value => { game[field] = value; received(field); }, showError);
      gameSubscriptions.watch(`memoryGame/excluded/${state.participantId}`, value => { game.excluded = { [state.participantId]: value }; received('excluded'); }, showError);
      gameSubscriptions.watch('memoryGame/events', value => { game.events = value ?? {}; received('events'); }, showError);
    } else gameSubscriptions.watch('memoryGame', value => { state.memoryGame = value ?? {}; schedule(); }, showGameError);
    return;
  }
  if (key === 'number') {
    if (state.role === 'participant') {
      const round = {}, game = { rounds: { [questionIndex]: round } };
      state.numberGame = game; state.numberReady = false; state.numberChoice = null;
      const ready = new Set();
      const received = field => { ready.add(field); state.numberReady = ready.size === 5; schedule(); };
      for (const field of ['control', 'contestants']) gameSubscriptions.watch(`numberGame/${field}`, value => { game[field] = value; received(field); }, showError);
      gameSubscriptions.watch(`numberGame/excluded/${state.participantId}`, value => { game.excluded = { [state.participantId]: value }; received('excluded'); }, showError);
      gameSubscriptions.watch(`numberGame/rounds/${questionIndex}/result`, value => { round.result = value; received('result'); }, showError);
      gameSubscriptions.watch(`numberGame/rounds/${questionIndex}/submissions/${state.participantId[0]}/submittedAt`, value => { round.submitted = Boolean(value); received('submission'); }, showError);
    } else gameSubscriptions.watch('numberGame', value => { state.numberGame = value ?? {}; schedule(); }, showGameError);
    return;
  }
  if (key === 'stopwatch') {
    if (state.role === 'participant') {
      const game = { submissions: {} };
      state.stopwatchGame = game; state.stopwatchReady = false;
      const ready = new Set();
      const received = field => { ready.add(field); state.stopwatchReady = ready.size === 5; schedule(); };
      for (const field of ['control', 'contestants', 'result']) gameSubscriptions.watch(`stopwatchGame/${field}`, value => { game[field] = value; received(field); }, showError);
      gameSubscriptions.watch(`stopwatchGame/excluded/${state.participantId}`, value => { game.excluded = { [state.participantId]: value }; received('excluded'); }, showError);
      const team = state.participantId[0];
      gameSubscriptions.watch(`stopwatchGame/submissions/${team}/submittedAt`, value => { game.submissions[team] = value ? { submittedAt: value } : null; received('submission'); }, showError);
    } else gameSubscriptions.watch('stopwatchGame', value => { state.stopwatchGame = value ?? {}; schedule(); }, showGameError);
    return;
  }
  if (key === 'liar') {
    if (state.role === 'participant') {
      const game = { rounds: {} }, round = {};
      state.liarGame = game; state.liarRound = round; state.liarReady = false;
      const ready = new Set();
      const received = field => { ready.add(field); state.liarReady = ready.size === 6; schedule(); };
      gameSubscriptions.watch('liarGame/control', value => { game.control = value; schedule(); }, showError);
      for (let index = 0; index < 3; index++) gameSubscriptions.watch(`liarGame/rounds/${index}/contestants`, value => {
        game.rounds[index] = { contestants: value ?? {} };
        if (index === questionIndex) round.contestants = value ?? {};
        received(`entries-${index}`);
      }, showError);
      for (const [field, path] of Object.entries({ card: `cards/${state.participantId}`, vote: `votes/${state.participantId}`, result: 'result' })) {
        gameSubscriptions.watch(`liarGame/rounds/${questionIndex}/${path}`, value => { round[field] = value; received(field); }, showError);
      }
    } else gameSubscriptions.watch('liarGame', value => { state.liarGame = value ?? {}; schedule(); }, showGameError);
    return;
  }
  if (key === 'zoom') {
    if (state.role === 'participant') {
      const round = {};
      state.zoomRound = round; state.zoomReady = false;
      const ready = new Set();
      gameSubscriptions.watch('zoomGame/control', value => { state.zoomGame.control = value; schedule(); }, showError);
      for (const [field, path] of Object.entries({ request: 'request', verdict: 'verdict', blocked: `blocked/${state.participantId}` })) {
        gameSubscriptions.watch(`zoomGame/rounds/${questionIndex}/${path}`, value => {
          round[field] = value; ready.add(field); state.zoomReady = ready.size === 3; schedule();
        }, showError);
      }
    } else gameSubscriptions.watch('zoomGame', value => { state.zoomGame = value ?? {}; schedule(); }, showGameError);
    return;
  }
  if (key === 'ox') {
    if (state.role === 'participant') {
      const round = {};
      state.oxRound = round; state.oxReady = false;
      const ready = new Set();
      gameSubscriptions.watch('oxGame/control', value => { state.oxGame.control = value; schedule(); }, showError);
      for (const [field, path] of Object.entries({ eligible: `eligible/${state.participantId}`, vote: `votes/${state.participantId}`, result: 'result' })) {
        gameSubscriptions.watch(`oxGame/rounds/${questionIndex}/${path}`, value => {
          round[field] = value; ready.add(field); state.oxReady = ready.size === 3; schedule();
        }, showError);
      }
    } else gameSubscriptions.watch('oxGame', value => { state.oxGame = value ?? {}; schedule(); }, showGameError);
    return;
  }
  const { path } = TASTE_ROUNDS[key];
  if (state.role === 'participant') {
    const game = {}, votes = {};
    state.tasteGames[key] = game; state.tasteVotes[key] = votes;
    for (const field of ['control', 'options']) gameSubscriptions.watch(`${path}/${field}`, value => { game[field] = value; schedule(); }, showError);
    for (const kind of ['preference', 'prediction']) gameSubscriptions.watch(`${path}/${kind}Votes/${state.participantId}`, value => { votes[kind] = value; votes[`${kind}Ready`] = true; schedule(); }, showError);
  } else {
    gameSubscriptions.watch(path, value => { state.tasteGames[key] = value ?? {}; state.gameError = ''; schedule(); }, showGameError);
  }
}

function syncPresentation(presentation) {
  if (presentation?.resetAt !== state.presentation?.resetAt) {
    state.submittedRoundId = null;
    state.instruction = null;
    state.response = null;
    state.tasteGames = {};
    state.tasteVotes = {};
    state.oxGame = {}; state.oxRound = {}; state.oxReady = false;
    state.zoomGame = {}; state.zoomRound = {}; state.zoomReady = false; zoomRetryAt = 0;
    state.liarGame = {}; state.liarRound = {}; state.liarReady = false; state.liarConfirm = false;
    state.stopwatchGame = {}; state.stopwatchReady = false; state.stopwatchConfirm = false;
    state.numberGame = {}; state.numberReady = false; state.numberConfirm = false; state.numberChoice = null;
    state.memoryGame = {}; state.memoryReady = false; state.memoryConfirm = false;
    state.reactionGame = {}; state.reactionReady = false; state.reactionConfirm = false;
    state.yutGame = {};
    state.teamScores = null;
    gameWatchKey = null;
    state.operatorError = null;
    state.error = '';
    state.gameError = '';
    scriptPosition = null;
  }
  if (presentation?.slideIndex !== state.presentation?.slideIndex) { state.liarConfirm = false; state.stopwatchConfirm = false; state.numberConfirm = false; state.numberChoice = null; state.memoryConfirm = false; state.reactionConfirm = false; }
  state.presentation = presentation;
  if (presentation && state.role !== 'participant') {
    if (STAGES[presentation.slideIndex]?.view === 'score' && state.slideIndex !== presentation.slideIndex) state.scoreEntryAt = performance.now();
    state.presenting = presentation.active;
    state.slideIndex = presentation.slideIndex;
    const person = state.participants[presentation.winnerId];
    if (person && (state.raceRoundId !== presentation.roundId || state.winner?.id !== presentation.winnerId)) state.winnerRevealedAt = performance.now();
    state.raceRoundId = presentation.roundId ?? null;
    state.winner = person ? { id: presentation.winnerId, ...person } : null;
    chooseWinner();
  }
  watchActiveGame();
  schedule();
}

function watchManagement() {
  managementSubscriptions.clear();
  managementSubscriptions.watch('participants', value => {
    state.participants = value ?? {};
    if (state.role === 'manager') state.rows = rowsFromParticipants(state.participants);
    else if (!state.dirty) {
      if (!Object.keys(state.participants).length && (cachedRoster || localRoster)) {
        state.rows = (cachedRoster ?? localRoster).rows;
        state.dirty = count() > 0;
      } else state.rows = rowsFromParticipants(state.participants);
      rememberRoster();
    }
    if (!state.ready) { state.ready = true; queueRosterSave(); queueManagerSave(); }
    syncPresentation(state.presentation);
  }, showError);
  for (const key of ['bindings', 'presence']) managementSubscriptions.watch(key, value => { state[key] = value ?? {}; schedule(); }, showError);
  watchActiveGame();
  managementSubscriptions.watch('teamScores', value => { state.teamScores = value; schedule(); }, showGameError);
  managementSubscriptions.watch('operatorError', value => { state.operatorError = value; schedule(); }, showError);
  managementSubscriptions.watch('oxQuestions', value => { state.oxQuestions = value; schedule(); }, showGameError);
  managementSubscriptions.watch('zoomQuestions', value => { state.zoomQuestions = value; schedule(); }, showGameError);
  if (state.role === 'host') {
    managementSubscriptions.watch('responses', value => { state.responses = value ?? {}; chooseWinner(); schedule(); }, showError);
    managementSubscriptions.watch('managerLookup', value => {
      const savedName = Object.values(value ?? {})[0]?.name ?? '';
      if (!state.managerDirty) {
        if (!savedName && state.managerName) state.managerDirty = true;
        else state.managerName = savedName;
        local.set(managerStorageKey, state.managerName);
      }
      state.managerError = '';
      queueManagerSave();
      schedule();
    }, () => { state.managerError = '관리자 기능은 Firebase 권한 규칙 반영 후 사용할 수 있습니다.'; schedule(); });
    if (api.fixedRoom) managementSubscriptions.watch('managerDevices', value => { state.managerDevices = value ?? {}; schedule(); }, showError);
    else managementSubscriptions.watch('managerBinding', value => { state.managerBinding = value; schedule(); }, () => {});
  }
}

function attachManager(device) {
  if (device) {
    state.role = managementEntry ? 'host' : 'manager';
    state.ready = !managementEntry;
    state.error = '';
    void api.read(state.room, `managerLookup/${device.nameKey}`).then(value => { state.managerName = value?.name ?? state.name; schedule(); }).catch(showError);
    watchManagement();
    syncPresentation(state.presentation);
  } else if (state.role === 'manager' || (managementEntry && state.role === 'host')) {
    managementSubscriptions.clear();
    state.role = 'participant'; state.participants = {}; state.bindings = {}; state.presence = {};
    state.rows = rowsFromParticipants(); state.dirty = false; state.managerDirty = false; state.managerDevices = {};
    state.oxQuestions = null; state.oxDraft = null; state.zoomQuestions = null; state.zoomDraft = null;
    state.presenting = false; state.winner = null; state.error = ''; state.gameError = ''; state.operatorError = null; state.name = '';
    watchActiveGame();
    schedule();
  }
}

function currentVoteKey() {
  const { key, slide, game } = tasteContext();
  return JSON.stringify([state.participantId, key, game.control?.roundId, game.control?.phase, game.control?.attemptId, slide?.questionIndex, state.presentation?.resetAt]);
}

function preventViewportGesture(event) {
  if (interactionLocked() && event.cancelable) event.preventDefault();
}
for (const name of ['gesturestart', 'gesturechange', 'gestureend', 'touchmove', 'dblclick', 'dragstart', 'selectstart']) {
  document.addEventListener(name, preventViewportGesture, { passive: false });
}
document.addEventListener('touchstart', event => {
  if (event.touches.length > 1) preventViewportGesture(event);
}, { passive: false });
document.addEventListener('wheel', event => {
  if (event.ctrlKey || event.metaKey) preventViewportGesture(event);
}, { passive: false });

document.addEventListener('compositionstart', () => { composing = true; });
document.addEventListener('compositionend', () => { composing = false; queueRosterSave(); queueManagerSave(); schedule(); });
function controllerViewportChanged() {
  if (document.activeElement?.id === 'real-name') return;
  schedule();
}
document.addEventListener('fullscreenchange', controllerViewportChanged);
document.addEventListener('visibilitychange', schedule);
window.addEventListener('resize', controllerViewportChanged);
screen.orientation?.addEventListener('change', controllerViewportChanged);
document.addEventListener('contextmenu', event => {
  if (state.presenting || interactionLocked() || state.controlsLocked) event.preventDefault();
});
document.addEventListener('keydown', event => {
  if (state.role !== 'host' || !state.presenting) return;
  if (event.key === 'Home' && event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey) {
    event.preventDefault();
    if (!event.repeat) void action('exit');
    return;
  }
  if (['Escape', 'ArrowRight', 'ArrowLeft', 'PageUp', 'PageDown', ' '].includes(event.key)) event.preventDefault();
});

async function start() {
  render();
  try {
    state.uid = await api.connect();
    api.watchServerOffset(offset => { state.serverOffset = offset; schedule(); });
    api.watchConnection(online => {
      state.online = online;
      if (!online) { presenceEpoch++; presenceClose = null; }
      else { void syncPresence(); queueRosterSave(); queueManagerSave(); }
      schedule();
    });
    if (!api.fixedRoom && state.role === 'host') {
      state.room = local.get('martini.host-room');
      if (state.room) { const meta = await api.read(state.room, 'meta'); if (!meta || meta.ownerUid !== state.uid) state.room = null; }
      if (!state.room) { state.room = await api.createRoom(state.uid); local.set('martini.host-room', state.room); }
    }
    const meta = await api.read(state.room, 'meta');
    if (!meta) throw { userMessage: '행사를 찾을 수 없습니다. QR을 다시 스캔해주세요.' };
    if (managementEntry && meta.ownerUid === state.uid) state.role = 'host';
    state.meta = meta;
    state.ready = state.role === 'participant';
    api.watch(state.room, 'meta', value => { state.meta = value; schedule(); }, showError);
    api.watch(state.room, 'stage', value => { state.stage = value ?? { step: 'setup' }; schedule(); }, showError);
    api.watch(state.room, 'presentation', syncPresentation, showError);
    if (state.role === 'host') {
      state.bindings = await api.read(state.room, 'bindings') ?? {};
      watchManagement();
    } else {
      api.watch(state.room, `managerDevices/${state.uid}`, attachManager, () => {});
      if (!managementEntry) api.watch(state.room, `devices/${state.uid}`, value => { if ((value?.participantId ?? null) !== state.participantId) attachParticipant(value?.participantId ?? null); }, showError);
    }
    schedule();
  } catch (error) { showError(error); }
}
void start();
