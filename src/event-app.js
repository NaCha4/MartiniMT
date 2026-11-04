import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './event-style.css';
import QRCode from 'qrcode';
import * as api from './event-data.js';
import { TEAM_IDS, STAGES, rosterFromInputs, onlineParticipants, friendlyError, messageText } from './event-model.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const local = { get(key) { try { return localStorage.getItem(key); } catch { return null; } }, set(key, value) { try { localStorage.setItem(key, value); } catch { /* Storage can be unavailable in private browsing. */ } } };
const queryRoom = new URLSearchParams(location.search).get('room');
const state = { role: queryRoom ? 'participant' : 'host', room: queryRoom, uid: null, online: false, error: '', ready: false, presenting: false, meta: null, stage: { step: 'setup' }, participants: {}, bindings: {}, presence: {}, instructions: {}, responses: {}, rows: Object.fromEntries(TEAM_IDS.map(team => [team, Array(6).fill('')])), teamNames: Object.fromEntries(TEAM_IDS.map(team => [team, `${team}조`])), title: 'Martini MT', dirty: false, participant: null, participantId: null, instruction: null, response: null, choices: null, name: '', draft: '', channel: 'all', messages: new Map(), pending: new Set(), sending: false, cooldown: false, busy: false, linking: false };
let stops = [], participantStops = [], chatStop, presenceClose, presenceEpoch = 0, frame, composing = false;

function showError(error) { state.error = typeof error === 'string' ? error : friendlyError(error); schedule(); }
function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = null; if (!composing) render(); }); }
function inviteUrl() { const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('room', state.room); return url.href; }
function connectedIds() { return onlineParticipants(state.presence); }
function connectionBadge() { return `<span class="connection ${state.online ? 'online' : ''}">${api.emulator ? '로컬 테스트 · ' : ''}${state.online ? '실시간 연결됨' : '연결 중'}</span>`; }
function logo() { return '<a class="brand" href="./">마티니 MT</a>'; }
function teamName(team) { return state.participants[`${team}1`]?.teamName ?? state.teamNames[team] ?? `${team}조`; }
function count() { return Object.values(state.rows).flat().filter(name => name.trim()).length; }
function topbar(extra = '') { return `<header class="topbar">${logo()}<div class="top-actions">${connectionBadge()}${extra}</div></header>`; }
function errorBanner() { return state.error ? `<div class="error-banner" role="alert">${escape(state.error)}<button data-action="dismiss" aria-label="알림 닫기">닫기</button></div>` : ''; }
function button(text, action, type = 'soft', disabled = false) {
  return `<button class="button ${type}" data-action="${action}" ${disabled ? 'disabled' : ''}>${escape(text)}</button>`;
}

function rosterCard(team) {
  const online = connectedIds();
  return `<section class="team-card team-${team}"><div class="team-heading"><input aria-label="${team}조 이름" id="team-${team}" data-team-name="${team}" maxlength="20" value="${escape(state.teamNames[team])}"/><span id="count-${team}" class="small-count">${state.rows[team].filter(name => name.trim()).length} / 6</span></div><div class="roster">${state.rows[team].map((name, index) => {
    const id = `${team}${index + 1}`, binding = state.bindings[id], instruction = state.instructions[id], response = state.responses[id];
    const acknowledged = instruction && response?.instructionId === instruction.id;
    return `<div class="roster-row"><span class="row-number">${String(index + 1).padStart(2, '0')}</span><input id="name-${id}" data-person="${id}" aria-label="${team}조 ${index + 1}번 이름" maxlength="24" placeholder="참가자 실명" value="${escape(name)}"/><span class="person-state ${online.has(id) ? 'active' : ''}" title="${online.has(id) ? '현재 접속 중' : binding ? '기기 연결됨 · 오프라인' : '미접속'}"></span>${state.participants[id] ? `<button class="row-action" data-notice="${id}" title="개별 안내 보내기" aria-label="${escape(name)}에게 안내">${acknowledged ? '확인됨' : instruction ? '대기' : '안내'}</button>` : ''}${binding ? `<button class="unlink" data-release="${id}" aria-label="${escape(name)} 기기 연결 해제" title="기기 연결 해제">해제</button>` : ''}</div>`;
  }).join('')}</div></section>`;
}

function hostView() {
  if (state.presenting) return presentationView();
  return `${topbar()}<main class="dashboard">
    <section class="intro"><div><h1>행사 관리</h1><p>명단을 입력한 뒤 발표를 시작하세요.</p></div>
      <div class="intro-actions">${button(state.busy ? '저장 중…' : '명단 저장', 'save', 'white', !state.ready || state.busy)}${button('발표 시작', 'present', 'dark', !state.ready || state.busy)}</div>
    </section>${errorBanner()}
    <section class="event-strip"><div><label for="event-title">행사 이름</label><input id="event-title" maxlength="60" value="${escape(state.title)}"/></div>
      <div class="event-stat"><strong id="total-count">${count()}</strong><span>등록 인원</span></div>
      <div class="event-stat"><strong>${connectedIds().size}</strong><span>현재 접속</span></div>
      <div class="event-status">${state.dirty ? '저장하지 않은 변경사항' : Object.keys(state.participants).length ? '명단 저장됨' : '명단 입력 대기'}</div>
    </section>
    <section class="section-title"><h2>참가자 명단</h2><span>4개 조 · 조별 최대 6명</span></section>
    <div class="team-grid">${TEAM_IDS.map(rosterCard).join('')}</div>
  </main>`;
}

function qrCard(small = false) { return `<aside class="qr-card ${small ? 'small' : ''}"><h2>모바일 접속</h2><div class="qr-paper"><canvas class="invite-qr" aria-label="참가자 입장 QR 코드"></canvas></div><p>QR을 스캔하고 등록된 이름을 입력하세요.</p><input id="invite-url" readonly value="${escape(inviteUrl())}" aria-label="참가자 접속 주소"/>${button('접속 링크 복사', 'copy', 'white')}</aside>`; }

function presentationView() {
  const current = state.stage.step === 'chat' ? STAGES[1] : STAGES[0];
  const online = connectedIds(), total = Object.keys(state.participants).length;
  const participants = TEAM_IDS.map(team => `<section class="stage-team team-${team}"><div class="stage-team-name"><strong>${escape(teamName(team))}</strong></div>${Object.entries(state.participants).filter(([, person]) => person.team === team).map(([id, person]) => `<div class="stage-person ${online.has(id) ? 'joined' : ''}"><span>${escape(person.name)}</span><span>${online.has(id) ? '입장 완료' : state.bindings[id] ? '재접속 대기' : '미접속'}</span></div>`).join('')}</section>`).join('');
  return `<div class="presentation">${topbar(button('관리 화면', 'manage', 'outline'))}<main class="presentation-main"><section class="presentation-title"><h1>${escape(current.title)}</h1><p>${escape(current.description)}</p></section>${errorBanner()}<div class="presentation-body">${state.stage.step === 'chat' ? `<section class="stage-chat"><div class="chat-heading"><h2>${escape(state.meta?.title ?? state.title)}</h2>${channelTabs(true)}</div>${chatList()}</section>` : `<section class="arrival-board"><div class="arrival-heading"><span><strong>${online.size}</strong> / ${total}명 접속</span></div><div class="arrival-grid">${participants}</div></section>`}${qrCard(state.stage.step === 'chat')}</div></main><footer class="slide-controls"><span>${escape(state.meta?.title ?? state.title)}</span><div>${button('입장 안내', 'previous', 'outline', state.stage.step !== 'chat')}<span class="slide-page">${state.stage.step === 'chat' ? '02' : '01'} <i>/ 02</i></span>${button('채팅 시작', 'next', 'lime', state.stage.step === 'chat' || state.busy)}</div><span>F11 · 전체화면</span></footer></div>`;
}

function channelTabs(host = false) {
  const channels = host ? ['all', ...TEAM_IDS] : ['all', state.participant?.team].filter(Boolean);
  return `<div class="channel-tabs">${channels.map(id => `<button data-channel="${id}" class="${state.channel === id ? 'selected' : ''}">${id === 'all' ? '전체' : escape(host ? teamName(id) : state.participant.teamName)}</button>`).join('')}</div>`;
}
function chatList() {
  const messages = [...state.messages.values()].sort((a, b) => (a.sentAt ?? 0) - (b.sentAt ?? 0) || a.id.localeCompare(b.id));
  return `<div id="chat-messages" class="chat-messages" role="log" aria-live="polite">${messages.length ? messages.map(message => `<article class="message ${message.uid === state.uid ? 'own' : ''}"><div><div class="message-meta"><strong>${escape(message.name)}</strong><span>${escape(message.teamName)}</span></div><p>${escape(message.text)}</p><time>${state.pending.has(message.id) ? '전달 중…' : new Date(message.sentAt || Date.now()).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}</time></div></article>`).join('') : '<div class="empty-chat"><p>아직 메시지가 없습니다.</p></div>'}</div>`;
}

function participantView() {
  if (!state.participant) return `${topbar()}<main class="mobile-join">
    <h1>참가자 입장</h1><p>${escape(state.meta?.title ?? '마티니 MT')}<br/>등록된 이름을 입력하세요.</p>${errorBanner()}
    <form id="name-form"><label for="real-name">이름</label><input id="real-name" name="realName" placeholder="실명 입력" maxlength="24" autocomplete="name" value="${escape(state.name)}" required/>
      ${state.choices ? `<label for="person-choice">동명이인이 있습니다. 조를 선택하세요.</label><select id="person-choice">${Object.entries(state.choices).map(([id, person]) => `<option value="${id}">${escape(person.teamName)} · ${escape(person.name)}</option>`).join('')}</select>` : ''}
      <button class="button dark" type="submit" ${state.busy || !state.ready ? 'disabled' : ''}>${state.busy ? '연결 중…' : '입장'}</button>
    </form><p class="join-tip">명단에 이름이 없으면 진행자에게 알려 주세요.</p>
  </main>`;
  const instruction = state.instruction, acknowledged = instruction && state.response?.instructionId === instruction.id;
  const activeChat = state.stage.step === 'chat';
  return `<div class="mobile-app">${topbar()}<main class="participant-main">
    <div class="my-identity"><div><span>${escape(state.participant.teamName)}</span><h1>${escape(state.participant.name)}<small>님</small></h1></div><span class="linked-badge">기기 연결 완료</span></div>${errorBanner()}
    ${instruction ? `<section class="instruction-card"><h2>${escape(instruction.title)}</h2><p>${escape(instruction.body)}</p><button id="acknowledge" class="button dark" ${acknowledged || !state.online ? 'disabled' : ''}>${acknowledged ? '확인 완료' : '확인'}</button></section>` : ''}
    ${activeChat ? `<section class="mobile-chat"><div class="chat-heading"><h2>채팅</h2>${channelTabs()}</div>${chatList()}
      <form id="message-form"><textarea id="message-input" aria-label="메시지" rows="1" maxlength="1000" placeholder="메시지 입력">${escape(state.draft)}</textarea><button id="send-button" aria-label="메시지 보내기" ${state.sending || !state.online || state.cooldown || !state.draft.trim() ? 'disabled' : ''}>전송</button></form>
      <div class="message-hint">${state.sending ? '전송 중…' : !state.online ? '재연결 중입니다. 작성한 내용은 유지됩니다.' : '최대 1,000자'}</div>
    </section>` : '<section class="waiting-card"><h2>입장 완료</h2><p>진행자가 시작할 때까지 기다려 주세요.</p></section>'}
  </main></div>`;
}

function render() {
  const focused = document.activeElement, focusId = focused?.id;
  const selection = focused && 'selectionStart' in focused ? [focused.selectionStart, focused.selectionEnd] : null;
  const messages = $('#chat-messages');
  const keepScroll = messages && messages.scrollHeight - messages.scrollTop - messages.clientHeight > 100 ? messages.scrollTop : null;
  document.body.classList.toggle('is-presenting', state.presenting);
  document.body.classList.toggle('is-participant', state.role === 'participant');
  document.body.classList.toggle('is-host', state.role === 'host');
  $('#app').innerHTML = state.role === 'host' ? hostView() : participantView();
  bindEvents();
  for (const canvas of document.querySelectorAll('.invite-qr')) QRCode.toCanvas(canvas, inviteUrl(), { width: state.stage.step === 'chat' ? 195 : 280, margin: 2, color: { dark: '#201B13', light: '#ffffff' } }).catch(() => {});
  const chat = $('#chat-messages');
  if (chat) chat.scrollTop = keepScroll ?? chat.scrollHeight;
  if (focusId) { const input = document.getElementById(focusId); if (input) { input.focus({ preventScroll: true }); if (selection && input.setSelectionRange && input.type !== 'number') input.setSelectionRange(...selection); } }
}

function bindEvents() {
  document.querySelectorAll('[data-action]').forEach(control => control.addEventListener('click', () => action(control.dataset.action)));
  document.querySelectorAll('[data-person]').forEach(input => input.addEventListener('input', () => { const [team, number] = input.dataset.person; state.rows[team][Number(number) - 1] = input.value; state.dirty = true; $(`#count-${team}`).textContent = `${state.rows[team].filter(name => name.trim()).length} / 6`; $('#total-count').textContent = count(); }));
  document.querySelectorAll('[data-team-name]').forEach(input => input.addEventListener('input', () => { state.teamNames[input.dataset.teamName] = input.value; state.dirty = true; }));
  $('#event-title')?.addEventListener('input', event => { state.title = event.target.value; state.dirty = true; });
  $('#real-name')?.addEventListener('input', event => { state.name = event.target.value; state.choices = null; });
  $('#name-form')?.addEventListener('submit', join);
  document.querySelectorAll('[data-channel]').forEach(control => control.addEventListener('click', () => { state.channel = control.dataset.channel; state.messages.clear(); subscribeChat(); schedule(); }));
  document.querySelectorAll('[data-notice]').forEach(control => control.addEventListener('click', () => openInstruction(control.dataset.notice)));
  document.querySelectorAll('[data-release]').forEach(control => control.addEventListener('click', async () => {
    const id = control.dataset.release, name = state.participants[id].name;
    if (confirm(`${name} 님의 기기 연결을 해제할까요? 해당 기기에서 이름을 다시 입력해야 합니다.`)) { try { await api.releaseParticipant(state.room, id, state.bindings[id].uid); } catch (error) { showError(error); } }
  }));
  $('#acknowledge')?.addEventListener('click', async () => { try { await api.acknowledge(state.room, state.participantId, state.instruction.id); } catch (error) { showError(error); } });
  $('#message-input')?.addEventListener('input', event => { state.draft = event.target.value; local.set(`martini.draft.${state.room}.${state.channel}`, state.draft); $('#send-button').disabled = state.sending || !state.online || state.cooldown || !state.draft.trim(); });
  $('#message-input')?.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!$('#send-button').disabled) $('#message-form').requestSubmit(); } });
  $('#message-form')?.addEventListener('submit', send);
}

async function save() {
  const roster = rosterFromInputs(state.rows, state.teamNames);
  const title = state.title.trim();
  if (!title || title.length > 60) throw { userMessage: '행사 이름을 1~60자로 입력해주세요.' };
  for (const id of Object.keys(state.bindings)) if (!roster.participants[id]) throw { userMessage: '연결된 참가자를 삭제하려면 먼저 해당 기기 연결을 해제해주세요.' };
  await api.saveRoster(state.room, roster, title);
  state.dirty = false;
}
async function action(name) {
  state.error = '';
  try {
    if (name === 'dismiss') { schedule(); return; }
    if (name === 'manage') { state.presenting = false; schedule(); return; }
    if (name === 'copy') { await navigator.clipboard.writeText(inviteUrl()); state.error = '초대 링크를 복사했어요.'; schedule(); return; }
    state.busy = true; schedule();
    if (name === 'save') await save();
    if (name === 'present') { if (state.dirty || !Object.keys(state.participants).length) await save(); await api.setStage(state.room, 'join'); state.presenting = true; subscribeChat(); }
    if (name === 'next') { await api.setStage(state.room, 'chat'); subscribeChat(); }
    if (name === 'previous') await api.setStage(state.room, 'join');
  } catch (error) { showError(error); }
  finally { state.busy = false; schedule(); }
}

async function join(event) {
  event.preventDefault(); if (state.busy) return;
  state.error = ''; state.busy = true;
  const chosen = $('#person-choice')?.value;
  schedule();
  try {
    if (chosen && state.choices?.[chosen]) await api.claimParticipant(state.room, chosen, state.uid);
    else {
      if (!state.name.trim()) throw { userMessage: '본인의 실명을 입력해주세요.' };
      const choices = await api.lookupName(state.room, state.name);
      if (!choices || !Object.keys(choices).length) throw { userMessage: '등록된 이름을 찾지 못했어요. 이름을 확인하거나 진행자에게 알려주세요.' };
      if (Object.keys(choices).length > 1) { state.choices = choices; return; }
      await api.claimParticipant(state.room, Object.keys(choices)[0], state.uid);
    }
    state.choices = null;
  } catch (error) { showError(error); }
  finally { state.busy = false; schedule(); }
}

async function send(event) {
  event.preventDefault(); if (!state.participant || state.sending || !state.online || state.cooldown) return;
  state.error = '';
  try {
    const text = messageText(state.draft); state.sending = true;
    const { id, confirmed } = api.sendChat(state.room, state.channel, state.uid, { id: state.participantId, ...state.participant }, text);
    state.pending.add(id); schedule();
    try { await confirmed; if (state.draft.trim() === text) { state.draft = ''; local.set(`martini.draft.${state.room}.${state.channel}`, ''); } }
    finally { state.pending.delete(id); }
    state.cooldown = true; setTimeout(() => { state.cooldown = false; schedule(); }, 1100);
  } catch (error) { showError(error); }
  finally { state.sending = false; schedule(); }
}

function subscribeChat() {
  chatStop?.(); chatStop = null;
  state.messages.clear();
  if (state.stage.step !== 'chat' || (state.role !== 'host' && !state.participant)) return;
  chatStop = api.watchChat(state.room, state.channel, { upsert: message => { state.messages.set(message.id, message); schedule(); }, remove: id => { state.messages.delete(id); schedule(); }, error: showError });
}
async function syncPresence() {
  if (!state.participantId || !state.online || presenceClose) return;
  const epoch = ++presenceEpoch;
  try { const close = await api.registerPresence(state.room, state.uid, state.participantId); if (epoch !== presenceEpoch) await close().catch(() => {}); else presenceClose = close; }
  catch (error) { if (epoch === presenceEpoch) showError(error); }
}
function attachParticipant(id) {
  participantStops.forEach(stop => stop()); participantStops = [];
  state.participantId = id;
  if (!id) { presenceEpoch++; presenceClose?.().catch(() => {}); presenceClose = null; state.participant = null; state.instruction = null; state.response = null; chatStop?.(); schedule(); return; }
  participantStops.push(api.watch(state.room, `participants/${id}`, person => { state.participant = person; if (!person) showError('등록 정보가 없어요. 진행자에게 알려주세요.'); subscribeChat(); void syncPresence(); schedule(); }, showError));
  participantStops.push(api.watch(state.room, `instructions/${id}`, instruction => { state.instruction = instruction; schedule(); }, showError));
  participantStops.push(api.watch(state.room, `responses/${id}`, response => { state.response = response; schedule(); }, showError));
}

document.addEventListener('compositionstart', () => { composing = true; });
document.addEventListener('compositionend', () => { composing = false; schedule(); });
window.addEventListener('beforeunload', event => { if (state.sending) { event.preventDefault(); event.returnValue = ''; } });

document.body.insertAdjacentHTML('beforeend', '<dialog id="instruction-dialog"><form id="instruction-form"><h2 id="instruction-person"></h2><label for="instruction-title">안내 제목</label><input id="instruction-title" maxlength="80" required placeholder="예: 다음 차례를 준비하세요"/><label for="instruction-body">안내 내용</label><textarea id="instruction-body" maxlength="500" rows="4" required placeholder="이 참가자에게 보낼 내용"></textarea><p id="instruction-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button soft" id="instruction-cancel">취소</button><button class="button dark">휴대폰으로 보내기</button></div></form></dialog>');
let targetParticipant;
function openInstruction(id) { targetParticipant = id; $('#instruction-person').textContent = `${state.participants[id].name} 님에게 안내`; $('#instruction-error').textContent = ''; $('#instruction-dialog').showModal(); }
$('#instruction-cancel').onclick = () => $('#instruction-dialog').close();
$('#instruction-form').onsubmit = async event => {
  event.preventDefault(); const title = $('#instruction-title').value.trim(), body = $('#instruction-body').value.trim();
  if (!title || !body) return;
  try { await api.sendInstruction(state.room, targetParticipant, title, body); $('#instruction-dialog').close(); $('#instruction-form').reset(); }
  catch (error) { $('#instruction-error').textContent = friendlyError(error); }
};

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
    if (!meta) throw { userMessage: '행사 주소를 찾을 수 없어요. 진행자의 QR을 다시 스캔해주세요.' };
    state.meta = meta; state.title = meta.title; state.ready = true;
    stops.push(api.watch(state.room, 'meta', value => { state.meta = value; schedule(); }, showError));
    stops.push(api.watch(state.room, 'stage', value => { const old = state.stage.step; state.stage = value ?? { step: 'setup' }; if (old !== state.stage.step) subscribeChat(); schedule(); }, showError));
    if (state.role === 'host') {
      stops.push(api.watch(state.room, 'participants', value => {
        state.participants = value ?? {};
        if (!state.dirty) { for (const team of TEAM_IDS) state.rows[team] = Array.from({ length: 6 }, (_, i) => state.participants[`${team}${i + 1}`]?.name ?? ''); for (const person of Object.values(state.participants)) state.teamNames[person.team] = person.teamName; }
        schedule();
      }, showError));
      for (const key of ['bindings', 'presence', 'instructions', 'responses']) stops.push(api.watch(state.room, key, value => { state[key] = value ?? {}; schedule(); }, showError));
    } else stops.push(api.watch(state.room, `devices/${state.uid}`, value => { if ((value?.participantId ?? null) !== state.participantId) attachParticipant(value?.participantId ?? null); }, showError));
    schedule();
  } catch (error) { showError(error); }
}
void start();
