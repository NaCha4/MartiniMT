import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { STAGES, stageIndex } from '../src/event-model.js';
import { ZOOM_LEVELS, zoomLevels, zoomQuestionsReady, zoomPoints, judgeZoomRequest, finishZoomFeedback } from '../src/zoom-model.js';
import { zoomPresentation, zoomControls, zoomParticipant, zoomEditor } from '../src/zoom-view.js';

const questions = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [index, { image: `/photos/${index}.jpg`, answer: `정답 ${index}`, focusX: 50, focusY: 50 }]));
const game = () => ({
  control: { roundId: 'round', questionIndex: 0, phase: 'open', zoomStep: 1, attemptId: 'attempt' },
  questions, roster: { A1: { name: '<민수>', team: 'A' }, A2: { name: '지수', team: 'A' }, B1: { name: '영희', team: 'B' } },
  rounds: { 0: { openedAt: 0, request: { id: 'request', participantId: 'A1', submittedAt: 1000 } } },
});

test('zoom adds five questions after the existing OX screens with three zoom-outs', () => {
  assert.deepEqual(ZOOM_LEVELS, [40, 12, 4, 1]);
  assert.equal(STAGES[23].id, 'ox-score');
  const zoom = STAGES.filter(stage => stage.game === 'zoom');
  assert.deepEqual(zoom.map(stage => stage.screenCode), [31, 32, 33, 34, 35, 36, 37]);
  assert.equal(STAGES[stageIndex(23, 1)].id, 'zoom-intro');
  assert.equal(zoom.filter(stage => stage.view === 'question').length, 5);
});

test('photo configuration requires five bounded images and valid crop coordinates', () => {
  assert.equal(zoomQuestionsReady(questions), true);
  assert.equal(zoomQuestionsReady({ ...questions, 4: undefined }), false);
  assert.equal(zoomQuestionsReady({ ...questions, 0: { ...questions[0], image: '' } }), false);
  assert.equal(zoomQuestionsReady({ ...questions, 0: { ...questions[0], focusX: 101 } }), false);
  assert.equal(zoomQuestionsReady({ ...questions, 0: { ...questions[0], image: 'x'.repeat(1500001) } }), false);
  assert.equal(zoomQuestionsReady({ ...questions, 0: { ...questions[0], zoom: 8 } }), true);
  for (const zoom of [0, 81, NaN, '8']) assert.equal(zoomQuestionsReady({ ...questions, 0: { ...questions[0], zoom } }), false);
  assert.deepEqual(zoomLevels(questions[0]), ZOOM_LEVELS);
  assert.deepEqual(zoomLevels({ ...questions[0], zoom: 14 }), [14, 4.67, 2, 1]);
});

test('the zoom introduction omits the magnification sequence below the title', () => {
  const html = zoomPresentation({}, questions, { view: 'intro' }, 0);
  assert.match(html, /무엇일까요/);
  assert.doesNotMatch(html, /zoom-intro-steps|40×|12×|4×|1×/);
  assert.match(html, /총 5문제/);
  assert.match(html, /50점/);
});

test('judgment binds to the active request and blocks the requesting team for this photo', () => {
  const current = game();
  assert.equal(judgeZoomRequest(current, 'old-request', true, 2000), undefined);
  const judged = judgeZoomRequest(current, 'request', false, 2000);
  assert.equal(judged.control.phase, 'wrong');
  assert.equal(judged.rounds[0].blocked.A1, true);
  assert.equal(judged.rounds[0].blocked.A2, true);
  assert.equal(judged.rounds[0].blocked.B1, undefined);
  assert.equal(judgeZoomRequest(judged, 'request', true, 2001), undefined);
  assert.equal(finishZoomFeedback(judged, 'round', 0, 'request', 3999, 'next', 4000), undefined);
  const reopened = finishZoomFeedback(judged, 'round', 0, 'request', 4000, 'next', 4000);
  assert.equal(reopened.control.phase, 'open');
  assert.equal(reopened.control.zoomStep, 1);
  assert.equal(reopened.control.attemptId, 'next');
  assert.equal(reopened.rounds[0].request, undefined);
  assert.equal(reopened.rounds[0].blocked.A1, true);
  assert.equal(reopened.rounds[0].blocked.A2, true);
  assert.equal(current.rounds[0].blocked, undefined);
});

test('correct judgments advance one photo, reset zoom, and total fifty points per correct answer', () => {
  let current = game();
  for (let index = 0; index < 5; index++) {
    current.rounds[index].request = { id: `request-${index}`, participantId: index % 2 ? 'B1' : 'A1' };
    current = judgeZoomRequest(current, `request-${index}`, true, index * 3000);
    assert.equal(finishZoomFeedback(current, 'stale', index, `request-${index}`, index * 3000 + 2000, 'next', 0), undefined);
    current = finishZoomFeedback(current, 'round', index, `request-${index}`, index * 3000 + 2000, 'next', 1000);
    assert.equal(current.control.phase, index === 4 ? 'complete' : 'open');
    assert.equal(current.control.zoomStep, index === 4 ? current.control.zoomStep : 0);
  }
  assert.deepEqual(zoomPoints(current), { A: 150, B: 100, C: 0, D: 0 });
  assert.equal(finishZoomFeedback(current, 'round', 4, 'request-4', 20000, 'next', 20000), undefined);
});

test('request and verdict overlays retain the photo and escape participant names', () => {
  const current = game();
  const slide = { view: 'question', questionIndex: 0 };
  const requested = zoomPresentation(current, questions, slide, 1500);
  assert.match(requested, /zoom-photo/);
  assert.match(requested, /&lt;민수&gt; 님/);
  assert.match(requested, /정답요청!/);
  assert.match(requested, /zoom-notice-band/);
  assert.doesNotMatch(requested, /정답 0/);
  const judged = judgeZoomRequest(current, 'request', true, 2000);
  const correct = zoomPresentation(judged, questions, slide, 2200);
  assert.match(correct, /정답!/);
  assert.match(correct, /--zoom:1;/);
  assert.match(correct, /\+50점/);
  assert.doesNotMatch(zoomPresentation(current, questions, slide, 2800), /zoom-notice/);
  assert.doesNotMatch(zoomPresentation(judged, questions, slide, 3800), /zoom-notice/);
  const remote = zoomControls(current, slide, false);
  assert.match(remote, /data-zoom-action="correct"/);
  assert.match(remote, /data-request-id="request"/);
  assert.match(remote, /정답 0/);
});

test('teammates wait after a request and remain blocked after an incorrect answer until the next photo', () => {
  const current = game();
  const args = { game: current, round: current.rounds[0], ready: true, participant: current.roster.A2, participantId: 'A2', questionIndex: 0, disabled: false, error: '' };
  assert.match(zoomParticipant(args), /우리 조가 답변/);
  assert.doesNotMatch(zoomParticipant(args), /data-zoom-request/);
  const judged = judgeZoomRequest(current, 'request', false, 1000);
  const reopened = finishZoomFeedback(judged, 'round', 0, 'request', 3000, 'next', 3000);
  assert.match(zoomParticipant({ ...args, game: reopened, round: { blocked: reopened.rounds[0].blocked.A2 } }), /다음 사진부터/);
  assert.doesNotMatch(zoomParticipant({ ...args, game: reopened, round: { blocked: true } }), /data-zoom-request/);
  reopened.control.questionIndex = 1;
  assert.match(zoomParticipant({ ...args, game: reopened, round: {}, questionIndex: 1 }), /data-zoom-request/);
});

test('correct and wrong banners leave the viewport while the photo remains', () => {
  for (const correct of [true, false]) {
    const judged = judgeZoomRequest(game(), 'request', correct, 1000);
    const slide = { view: 'question', questionIndex: 0 };
    const active = zoomPresentation(judged, questions, slide, 1500);
    assert.match(active, /zoom-notice-band/);
    assert.ok(active.includes(correct ? '정답!' : '오답!'));
    const finished = zoomPresentation(judged, questions, slide, 3000);
    assert.doesNotMatch(finished, /zoom-notice/);
    assert.match(finished, /class="zoom-photo"/);
  }
});

test('only eligible, fully loaded participants receive an enabled answer-request button', () => {
  const args = { game: game(), round: {}, ready: true, participant: { team: 'A' }, participantId: 'A1', questionIndex: 0, disabled: false, error: '' };
  assert.match(zoomParticipant(args), /data-zoom-request/);
  assert.doesNotMatch(zoomParticipant({ ...args, ready: false }), /data-zoom-request/);
  assert.doesNotMatch(zoomParticipant({ ...args, round: { blocked: true } }), /data-zoom-request/);
  assert.doesNotMatch(zoomParticipant({ ...args, round: { request: { participantId: 'B1' } } }), /data-zoom-request/);
  assert.doesNotMatch(zoomParticipant({ ...args, questionIndex: 1 }), /data-zoom-request/);
  assert.match(zoomParticipant({ ...args, disabled: true }), /data-zoom-request disabled/);
  assert.match(zoomEditor(questions, false, true), /data-zoom-image="4"/);
});

test('a skipped photo advances without points and preserves previous correct answers', () => {
  const current = game();
  current.control.phase = 'skipped';
  current.rounds[0].verdict = { requestId: 'skip', skipped: true, correct: false, judgedAt: 0 };
  const next = finishZoomFeedback(current, 'round', 0, 'skip', 2000, 'next', 2000);
  assert.equal(next.control.questionIndex, 1);
  assert.deepEqual(zoomPoints(next), { A: 0, B: 0, C: 0, D: 0 });
});

function transitionScreen(current, questionIndex = 0) {
  const calls = [], timers = [], errors = [];
  const slideIndex = STAGES.findIndex(stage => stage.id === `zoom-question-${questionIndex + 1}`);
  const state = { role: 'host', presenting: true, online: true, slideIndex, zoomGame: current, presentation: {}, serverOffset: 0 };
  const api = {
    async finishZoomRound() { calls.push('finish'); return finishZoomFeedback(current, 'round', 0, 'request', 5000, 'next', 5000); },
    async awardZoomPoints() { calls.push('award'); return { totals: zoomPoints(current) }; },
    async followZoomSlide(room, previous, next) { calls.push(['follow', previous, next]); return { committed: true, snapshot: { val: () => ({ slideIndex: next }) } }; },
  };
  const context = vm.createContext({
    state, STAGES, api, ZOOM_FEEDBACK_DURATION: 2000, Date: { now: () => 1000 },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return 1; }, clearTimeout() {}, schedule() {},
    syncPresentation(value) { state.slideIndex = value.slideIndex; }, showGameError: error => errors.push(error),
  });
  const source = readFileSync(new URL('../src/event-app.js', import.meta.url), 'utf8');
  vm.runInContext('let zoomTimer, zoomAdvancing = false, zoomRetryAt = 0;\n' + source.slice(source.indexOf('function scheduleZoomProgress()'), source.indexOf('function editableZoomQuestions()')), context);
  context.scheduleZoomProgress();
  return { state, api, calls, timers, errors };
}

test('correct feedback schedules automatic progression after the animation', async () => {
  const current = judgeZoomRequest(game(), 'request', true, 1000);
  const screen = transitionScreen(current);
  assert.equal(screen.timers[0].delay, 2000);
  await screen.timers[0].callback();
  assert.equal(screen.calls[0], 'finish');
  assert.equal(STAGES[screen.state.slideIndex].id, 'zoom-question-2');
  assert.deepEqual(screen.errors, []);
});

test('reconnected controllers catch up when the game advanced before the screen update', async () => {
  const current = game();
  current.control.questionIndex = 1;
  const screen = transitionScreen(current);
  await screen.timers[0].callback();
  assert.equal(screen.calls.length, 1);
  assert.equal(screen.calls[0][0], 'follow');
  assert.equal(STAGES[screen.state.slideIndex].id, 'zoom-question-2');
});

test('the final completed photo awards points and opens the final scoreboard', async () => {
  const current = game();
  current.control.questionIndex = 4; current.control.phase = 'complete';
  const screen = transitionScreen(current, 4);
  await screen.timers[0].callback();
  assert.equal(screen.calls[0], 'award');
  assert.equal(STAGES[screen.state.slideIndex].id, 'zoom-score');
});

test('reset or manual test navigation prevents a pending animation from moving the new screen', async () => {
  const current = judgeZoomRequest(game(), 'request', true, 1000);
  const screen = transitionScreen(current);
  screen.state.zoomGame = {};
  await screen.timers[0].callback();
  assert.deepEqual(screen.calls, ['finish']);
  assert.equal(STAGES[screen.state.slideIndex].id, 'zoom-question-1');
  assert.equal(transitionScreen(game(), 2).timers.length, 0);
});
