import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './event-style.css';
import QRCode from 'qrcode';
import * as api from './event-data.js';
import { TEAM_IDS, STAGES, stageIndex, touchRoundIsActive, firstTouch, rosterFromInputs, onlineParticipants, friendlyError } from './event-model.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const local = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Private browsing may restrict storage. */ } },
};
const queryRoom = new URLSearchParams(location.search).get('room');
const state = {
  role: queryRoom ? 'participant' : 'host', room: queryRoom, uid: null, online: false, ready: false,
  error: '', presenting: false, slideIndex: 0, busy: false, dirty: false,
  meta: null, stage: { step: 'setup' }, participants: {}, bindings: {}, presence: {}, responses: {},
  rows: Object.fromEntries(TEAM_IDS.map(team => [team, Array(6).fill('')])),
  teamNames: Object.fromEntries(TEAM_IDS.map(team => [team, `${team}조`])), title: '마티니 MT',
  participantId: null, participant: null, instruction: null, response: null, choices: null, name: '',
  raceRoundId: null, winner: null, tapping: false, submittedRoundId: null,
  screenStarting: false, fullscreenFallback: false,
};
let participantStops = [], presenceClose, presenceEpoch = 0, frame, composing = false;

function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = null; if (!composing) render(); }); }
function showError(error) { state.error = typeof error === 'string' ? error : friendlyError(error); schedule(); }
function connectedIds() { return onlineParticipants(state.presence); }
function count() { return Object.values(state.rows).flat().filter(name => name.trim()).length; }
function teamName(team) { return Object.values(state.participants).find(person => person.team === team)?.teamName ?? state.teamNames[team]; }
function inviteUrl() { const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('room', state.room); return url.href; }
function isFullscreen() { return Boolean(document.fullscreenElement) || (innerWidth >= screen.width - 8 && innerHeight >= screen.height - 8); }
function fullscreenControl() { return isFullscreen() ? '' : '<button class="button outline fullscreen-button" data-action="fullscreen" data-no-slide>전체화면</button>'; }
function controllerFullscreen() { return Boolean(document.fullscreenElement) || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true; }
function controllerCanFullscreen() { return Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen); }
async function startController() {
  if (state.screenStarting) return;
  state.screenStarting = true;
  try {
    if (!controllerFullscreen() && controllerCanFullscreen()) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    if (screen.orientation?.lock) await screen.orientation.lock('landscape').catch(() => {});
  } catch { state.fullscreenFallback = true; }
  finally { state.screenStarting = false; schedule(); }
}
function connectionBadge() { return `<span class="connection ${state.online ? 'online' : ''}">${api.emulator ? '로컬 테스트 · ' : ''}${state.online ? '실시간 연결됨' : '연결 중'}</span>`; }
function topbar() { return `<header class="topbar"><a class="brand" href="./">마티니 MT</a>${connectionBadge()}</header>`; }
function button(text, action, type = 'soft', disabled = false) { return `<button class="button ${type}" data-action="${action}" ${disabled ? 'disabled' : ''}>${escape(text)}</button>`; }
function errorBanner() { return state.error ? `<div class="error-banner" role="alert">${escape(state.error)}<button data-action="dismiss">닫기</button></div>` : ''; }

function rosterCard(team) {
  const online = connectedIds();
  return `<section class="team-card"><div class="team-heading"><input aria-label="${team}조 이름" id="team-${team}" data-team-name="${team}" maxlength="20" value="${escape(state.teamNames[team])}"/><span id="count-${team}" class="small-count">${state.rows[team].filter(name => name.trim()).length} / 6</span></div><div class="roster">${state.rows[team].map((name, index) => {
    const id = `${team}${index + 1}`, binding = state.bindings[id];
    return `<div class="roster-row"><span class="row-number">${String(index + 1).padStart(2, '0')}</span><input id="name-${id}" data-person="${id}" aria-label="${team}조 ${index + 1}번 이름" maxlength="24" placeholder="참가자 실명" value="${escape(name)}"/><span class="person-state ${online.has(id) ? 'active' : ''}" title="${online.has(id) ? '현재 접속 중' : '미접속'}"></span>${binding ? `<button class="unlink" data-release="${id}" aria-label="${escape(name)} 기기 연결 해제">해제</button>` : ''}</div>`;
  }).join('')}</div></section>`;
}

function hostView() {
  if (state.presenting) return presentationView();
  return `${topbar()}<main class="dashboard"><section class="intro"><div><h1>행사 관리</h1><p>명단 입력 후 발표 시작 · 좌클릭 다음 · 우클릭 이전 · Esc 종료</p></div><div class="intro-actions">${button(state.busy ? '저장 중…' : '명단 저장', 'save', 'white', !state.ready || state.busy)}${button('발표 시작', 'present', 'dark', !state.ready || state.busy)}</div></section>${errorBanner()}<section class="event-strip"><div><label for="event-title">행사 이름</label><input id="event-title" maxlength="60" value="${escape(state.title)}"/></div><div class="event-stat"><strong id="total-count">${count()}</strong><span>등록 인원</span></div><div class="event-stat"><strong>${connectedIds().size}</strong><span>현재 접속</span></div><div class="event-status">${state.dirty ? '저장하지 않은 변경사항' : Object.keys(state.participants).length ? '명단 저장됨' : '명단 입력 대기'}</div></section><section class="section-title"><h2>참가자 명단</h2><span>4개 조 · 조별 최대 6명</span></section><div class="team-grid">${TEAM_IDS.map(rosterCard).join('')}</div></main>`;
}

function presentationView() {
  const slide = STAGES[state.slideIndex], online = connectedIds(), total = Object.keys(state.participants).length;
  let content;
  if (slide.id === 'join') {
    content = `<div class="presentation-body join-slide"><section class="arrival-board"><div class="arrival-heading" role="status"><span>접속 <strong>${online.size}</strong> / ${total}명</span></div><div class="arrival-grid">${TEAM_IDS.map(team => `<section class="stage-team"><h2 class="stage-team-name">${escape(teamName(team))}</h2>${Object.entries(state.participants).filter(([, person]) => person.team === team).map(([id, person]) => `<div class="stage-person ${online.has(id) ? 'joined' : ''}"><span>${escape(person.name)}</span><span>${online.has(id) ? '입장 완료' : '미접속'}</span></div>`).join('')}</section>`).join('')}</div></section><aside class="qr-card"><div class="qr-paper"><canvas class="invite-qr" aria-label="참가자 입장 QR 코드"></canvas></div><p>휴대폰 카메라로 스캔하세요.</p><input id="invite-url" readonly value="${escape(inviteUrl())}" aria-label="참가자 접속 주소" tabindex="-1"/></aside></div>`;
  } else if (state.winner) {
    content = `<section class="winner-slide" aria-live="polite"><p>가장 먼저 터치한 사람</p><h2 id="winner-name">${escape(state.winner.name)}</h2><span>${escape(state.winner.teamName)}</span></section>`;
  } else {
    content = `<section class="race-slide"><p>${state.busy ? '휴대폰에 화면을 전달하고 있습니다.' : '휴대폰에 나타난 버튼을 가장 먼저 터치하세요.'}</p><div class="race-waiting">${state.busy ? '준비 중' : '터치 대기 중'}</div></section>`;
  }
  return `<div class="presentation" data-slide="${slide.id}" aria-label="발표 화면. 좌클릭 다음, 우클릭 이전" tabindex="-1"><main class="presentation-main"><section class="presentation-title"><h1>${state.winner && slide.id === 'touch' ? '선착순 결과' : escape(slide.title)}</h1><p>${state.winner && slide.id === 'touch' ? '서버에 가장 먼저 접수된 터치입니다.' : escape(slide.description)}</p></section>${errorBanner()}${content}</main>${fullscreenControl()}</div>`;
}

function participantView() {
  const portrait = matchMedia('(orientation: portrait)').matches;
  const needsFullscreen = !controllerFullscreen() && controllerCanFullscreen() && !state.fullscreenFallback;
  if (portrait || needsFullscreen) return `<main class="controller-gate"><h1>${portrait ? '휴대폰을 가로로<br/>돌려주세요.' : '전체화면으로 시작하세요.'}</h1><p>${portrait ? '가로 화면으로 진행합니다.' : '화면을 터치하며 참여합니다.'}</p>${needsFullscreen ? `<button class="button dark" data-action="controller-start" ${state.screenStarting ? 'disabled' : ''}>${state.screenStarting ? '전환 중…' : '전체화면으로 시작'}</button>` : ''}</main>`;
  if (!state.participant) return `<main class="mobile-join"><div class="join-copy"><h1>참가자 입장</h1><p>등록된 이름을 입력하세요.</p></div><div class="join-fields">${errorBanner()}<form id="name-form"><label for="real-name">이름</label><input id="real-name" maxlength="24" placeholder="실명 입력" autocomplete="name" value="${escape(state.name)}" required/>${state.choices ? `<label for="person-choice">동명이인이 있습니다. 조를 선택하세요.</label><select id="person-choice">${Object.entries(state.choices).map(([id, person]) => `<option value="${id}">${escape(person.teamName)} · ${escape(person.name)}</option>`).join('')}</select>` : ''}<button class="button dark" type="submit" ${state.busy || !state.ready ? 'disabled' : ''}>${state.busy ? '연결 중…' : '입장'}</button></form></div></main>`;
  const active = touchRoundIsActive(state.instruction, state.stage);
  const submitted = Boolean(state.instruction?.id) && (state.submittedRoundId === state.instruction.id || state.response?.instructionId === state.instruction.id);
  const showTarget = active && !submitted;
  const identity = `<span class="controller-identity">${escape(state.participant.teamName)} · ${escape(state.participant.name)}</span>`;
  const ended = state.stage.step === 'closed';
  const statusTitle = ended ? '끝났습니다' : state.tapping ? '전송 중…' : active && submitted ? '입력 완료' : '대기 중';
  const statusDescription = ended ? '선착순 입력이 마감되었습니다.' : !state.online ? '연결을 복구하고 있습니다.' : '진행자의 안내를 기다려 주세요.';
  return `<main class="controller-main">${errorBanner()}${showTarget ? `<button id="tap-target" class="tap-target" ${state.tapping || !state.online ? 'disabled' : ''}>${identity}<strong>${state.tapping ? '전송 중…' : state.online ? '터치하세요!' : '재연결 중…'}</strong><span>화면 어디든 누르세요</span></button>` : `<section class="waiting-card">${identity}<h2>${statusTitle}</h2><p>${statusDescription}</p></section>`}</main>`;
}

function render() {
  const focused = document.activeElement, focusId = focused?.id;
  const selection = focused && 'selectionStart' in focused ? [focused.selectionStart, focused.selectionEnd] : null;
  document.body.classList.toggle('is-presenting', state.presenting);
  document.body.classList.toggle('is-participant', state.role === 'participant');
  document.body.classList.toggle('is-host', state.role === 'host');
  $('#app').innerHTML = state.role === 'host' ? hostView() : participantView();
  bindEvents();
  for (const canvas of document.querySelectorAll('.invite-qr')) QRCode.toCanvas(canvas, inviteUrl(), { width: 420, margin: 2, color: { dark: '#201B13', light: '#ffffff' } }).catch(() => {});
  if (focusId) { const input = document.getElementById(focusId); if (input) { input.focus({ preventScroll: true }); if (selection && input.setSelectionRange) input.setSelectionRange(...selection); } }
}

function chooseWinner() {
  if (state.role !== 'host' || !state.presenting || state.slideIndex !== 1 || state.winner || !state.raceRoundId) return;
  const winner = firstTouch(state.responses, state.participants, state.raceRoundId);
  if (!winner) return;
  state.winner = winner;
  schedule();
  // Freeze the visible result before closing the input window; later taps cannot replace it.
  void api.setStage(state.room, 'closed').catch(showError);
}

async function moveTo(index) {
  if (index === 0) {
    state.raceRoundId = null; state.winner = null;
    await api.setStage(state.room, 'join');
    state.slideIndex = 0;
  } else {
    state.winner = null; state.raceRoundId = null;
    const round = api.startTouchRound(state.room, Object.keys(state.participants));
    state.raceRoundId = round.id; state.slideIndex = 1;
    schedule();
    await round.confirmed;
    chooseWinner();
  }
  schedule();
}
async function advance(direction) {
  if (!state.presenting || state.busy) return;
  const next = stageIndex(state.slideIndex, direction);
  if (next === state.slideIndex) return;
  state.busy = true;
  try { await moveTo(next); } catch (error) { showError(error); }
  finally { state.busy = false; schedule(); }
}

async function tap() {
  const instruction = state.instruction;
  if (!state.participantId || !state.online || state.tapping || !touchRoundIsActive(instruction, state.stage) || state.response?.instructionId === instruction.id) return;
  state.tapping = true; schedule();
  try { await api.acknowledge(state.room, state.participantId, instruction.id); state.submittedRoundId = instruction.id; }
  catch (error) {
    // Another participant may have closed this round while this tap was in transit.
    const stage = await api.read(state.room, 'stage').catch(() => state.stage);
    if (state.instruction?.id === instruction.id && touchRoundIsActive(instruction, stage)) showError(error);
  }
  finally { state.tapping = false; schedule(); }
}

async function save() {
  const roster = rosterFromInputs(state.rows, state.teamNames), title = state.title.trim();
  if (!title || title.length > 60) throw { userMessage: '행사 이름을 1~60자로 입력해주세요.' };
  for (const id of Object.keys(state.bindings)) if (!roster.participants[id]) throw { userMessage: '연결된 참가자를 삭제하려면 먼저 기기 연결을 해제해주세요.' };
  await api.saveRoster(state.room, roster, title); state.dirty = false;
}
async function action(name) {
  state.error = '';
  if (name === 'dismiss') { schedule(); return; }
  if (name === 'controller-start') { await startController(); return; }
  if (name === 'fullscreen') {
    try { if (!document.documentElement.requestFullscreen) throw new Error(); await document.documentElement.requestFullscreen(); }
    catch { showError('전체화면으로 전환할 수 없습니다. 컴퓨터에서는 F11을 사용하세요.'); }
    return;
  }
  if (name === 'exit') { state.presenting = false; state.raceRoundId = null; state.winner = null; schedule(); await api.setStage(state.room, 'join').catch(showError); return; }
  if (state.busy) return;
  state.busy = true; schedule();
  try {
    if (name === 'save') await save();
    if (name === 'present') { if (state.dirty || !Object.keys(state.participants).length) await save(); await moveTo(0); state.presenting = true; window.scrollTo(0, 0); }
  } catch (error) { showError(error); }
  finally { state.busy = false; schedule(); }
}

function bindEvents() {
  document.querySelectorAll('[data-action]').forEach(control => control.addEventListener('click', () => { void action(control.dataset.action); }));
  document.querySelectorAll('[data-person]').forEach(input => input.addEventListener('input', () => { const [team, number] = input.dataset.person; state.rows[team][Number(number) - 1] = input.value; state.dirty = true; $(`#count-${team}`).textContent = `${state.rows[team].filter(name => name.trim()).length} / 6`; $('#total-count').textContent = count(); }));
  document.querySelectorAll('[data-team-name]').forEach(input => input.addEventListener('input', () => { state.teamNames[input.dataset.teamName] = input.value; state.dirty = true; }));
  $('#event-title')?.addEventListener('input', event => { state.title = event.target.value; state.dirty = true; });
  $('#real-name')?.addEventListener('input', event => { state.name = event.target.value; state.choices = null; });
  $('#name-form')?.addEventListener('submit', join);
  document.querySelectorAll('[data-release]').forEach(control => control.addEventListener('click', async () => {
    const id = control.dataset.release;
    if (confirm(`${state.participants[id].name} 님의 기기 연결을 해제할까요?`)) { try { await api.releaseParticipant(state.room, id, state.bindings[id].uid); } catch (error) { showError(error); } }
  }));
  $('#tap-target')?.addEventListener('pointerdown', event => { if (event.isPrimary && event.button === 0) { event.preventDefault(); void tap(); } });
  $('#tap-target')?.addEventListener('click', event => { if (event.detail === 0) void tap(); });
}

async function join(event) {
  event.preventDefault(); if (state.busy) return;
  state.error = ''; state.busy = true;
  const chosen = $('#person-choice')?.value; schedule();
  try {
    if (chosen && state.choices?.[chosen]) await api.claimParticipant(state.room, chosen, state.uid);
    else {
      if (!state.name.trim()) throw { userMessage: '본인의 실명을 입력해주세요.' };
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
  participantStops.forEach(stop => stop()); participantStops = []; state.participantId = id;
  if (!id) { presenceEpoch++; presenceClose?.().catch(() => {}); presenceClose = null; state.participant = null; state.instruction = null; state.response = null; schedule(); return; }
  participantStops.push(api.watch(state.room, `participants/${id}`, person => { state.participant = person; void syncPresence(); schedule(); }, showError));
  participantStops.push(api.watch(state.room, `instructions/${id}`, instruction => { state.instruction = instruction; schedule(); }, showError));
  participantStops.push(api.watch(state.room, `responses/${id}`, response => { state.response = response; schedule(); }, showError));
}

document.addEventListener('compositionstart', () => { composing = true; });
document.addEventListener('compositionend', () => { composing = false; schedule(); });
document.addEventListener('fullscreenchange', schedule);
window.addEventListener('resize', schedule);
screen.orientation?.addEventListener('change', schedule);
const controlTarget = target => target instanceof Element && target.closest('button, a, input, textarea, select, dialog, [data-no-slide]');
document.addEventListener('click', event => { if (state.presenting && event.button === 0 && !controlTarget(event.target) && !window.getSelection()?.toString()) void advance(1); });
document.addEventListener('contextmenu', event => { if (state.presenting) { event.preventDefault(); if (!controlTarget(event.target)) void advance(-1); } });
document.addEventListener('keydown', event => {
  if (!state.presenting) return;
  if (event.key === 'Escape' && !document.fullscreenElement) { event.preventDefault(); void action('exit'); }
  else if (!controlTarget(event.target) && ['ArrowRight', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); void advance(1); }
  else if (!controlTarget(event.target) && ['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); void advance(-1); }
});

async function start() {
  render();
  try {
    state.uid = await api.connect();
    api.watchConnection(online => { state.online = online; if (!online) { presenceEpoch++; presenceClose = null; } else void syncPresence(); schedule(); });
    if (state.role === 'host') {
      state.room = local.get('martini.host-room');
      if (state.room) { const meta = await api.read(state.room, 'meta'); if (!meta || meta.ownerUid !== state.uid) state.room = null; }
      if (!state.room) { state.room = await api.createRoom(state.uid); local.set('martini.host-room', state.room); }
    }
    const meta = await api.read(state.room, 'meta');
    if (!meta) throw { userMessage: '행사를 찾을 수 없습니다. QR을 다시 스캔해주세요.' };
    state.meta = meta; state.title = meta.title; state.ready = true;
    api.watch(state.room, 'meta', value => { state.meta = value; schedule(); }, showError);
    api.watch(state.room, 'stage', value => { state.stage = value ?? { step: 'setup' }; schedule(); }, showError);
    if (state.role === 'host') {
      api.watch(state.room, 'participants', value => {
        state.participants = value ?? {};
        if (!state.dirty) { for (const team of TEAM_IDS) state.rows[team] = Array.from({ length: 6 }, (_, i) => state.participants[`${team}${i + 1}`]?.name ?? ''); for (const person of Object.values(state.participants)) state.teamNames[person.team] = person.teamName; }
        schedule();
      }, showError);
      for (const key of ['bindings', 'presence']) api.watch(state.room, key, value => { state[key] = value ?? {}; schedule(); }, showError);
      api.watch(state.room, 'responses', value => { state.responses = value ?? {}; chooseWinner(); schedule(); }, showError);
    } else api.watch(state.room, `devices/${state.uid}`, value => { if ((value?.participantId ?? null) !== state.participantId) attachParticipant(value?.participantId ?? null); }, showError);
    schedule();
  } catch (error) { showError(error); }
}
void start();
