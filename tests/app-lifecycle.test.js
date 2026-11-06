import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createSubscriptionGroup } from '../src/subscription-group.js';
import { STAGES } from '../src/event-model.js';
import { TASTE_ROUNDS } from '../src/taste-model.js';
import { OX_QUESTION_COUNT } from '../src/ox-model.js';

const source = readFileSync(new URL('../src/event-app.js', import.meta.url), 'utf8');

test('desktop Chrome device emulation allows windowed controllers while mobile browsers retain fullscreen', () => {
  const context = vm.createContext({
    navigator: { userAgent: 'Mozilla/5.0 Chrome/142.0.0.0', platform: 'Win32' },
    window: { chrome: {} },
    document: { fullscreenEnabled: true, documentElement: { requestFullscreen() {} } },
  });
  vm.runInContext(source.slice(source.indexOf('function controllerCanFullscreen()'), source.indexOf('async function startController()')), context);
  for (const platform of ['Win32', 'MacIntel', 'Linux x86_64', 'Linux i686']) {
    context.navigator.platform = platform;
    assert.equal(context.controllerCanFullscreen(), false, platform);
  }
  context.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/142.0.0.0 Mobile Safari/537.36';
  context.navigator.platform = 'Win32';
  assert.equal(context.controllerCanFullscreen(), false, 'Android emulation on Windows');
  context.navigator.platform = 'Linux armv8l';
  assert.equal(context.controllerCanFullscreen(), true, 'physical Android phone');
  context.navigator.platform = 'MacIntel';
  context.navigator.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
  assert.equal(context.controllerCanFullscreen(), false, 'iPad emulation on desktop Chrome');
  context.window.chrome = undefined;
  assert.equal(context.controllerCanFullscreen(), true, 'iPad desktop-style platform');
  context.document.fullscreenEnabled = false;
  assert.equal(context.controllerCanFullscreen(), false, 'unsupported fullscreen');
});

function gameScreen(key = 'ox') {
  const listeners = [], errors = [];
  const state = {
    uid: 'device', room: 'local-room', role: 'participant', participantId: 'A1',
    key, questionIndex: 0, presentation: { resetAt: 1 }, oxGame: {}, oxRound: {}, tasteGames: {}, tasteVotes: {},
  };
  const group = createSubscriptionGroup((path, onValue, onError) => {
    const listener = { path, onValue, onError, stopped: false };
    listeners.push(listener);
    return () => { listener.stopped = true; };
  });
  const context = vm.createContext({
    state, TASTE_ROUNDS, OX_QUESTION_COUNT, gameSubscriptions: group,
    tasteContext: () => ({ key: state.key, slide: { questionIndex: state.questionIndex } }),
    schedule() {}, showError: error => errors.push(error), showGameError: error => errors.push(error),
  });
  vm.runInContext('let gameWatchKey, scriptPosition;\n' + source.slice(source.indexOf('function watchActiveGame()'), source.indexOf('function watchManagement(')), context);
  context.watchActiveGame();
  return { state, listeners, errors, watch: () => context.watchActiveGame(), reset: () => context.syncPresentation({ resetAt: 2 }) };
}

test('reaction reads private submissions only after this participant is confirmed', () => {
  const screen = gameScreen('reaction');
  assert.ok(screen.listeners.every(listener => !listener.path.includes('/submissions/')));
  const initial = [...screen.listeners];
  initial.forEach(listener => listener.onValue(null));
  assert.equal(screen.state.reactionReady, true, 'Unselected participants finish connecting without a private read');
  const contestants = initial.find(listener => listener.path === 'reactionGame/contestants');
  contestants.onValue({ B: { participantId: 'B1' } });
  assert.ok(screen.listeners.every(listener => !listener.path.includes('/submissions/')));
  contestants.onValue({ A: { participantId: 'A1' }, B: { participantId: 'B1' } });
  const submission = screen.listeners.find(listener => listener.path === 'reactionGame/submissions/A');
  assert.ok(submission);
  assert.equal(screen.state.reactionReady, false);
  submission.onValue(null);
  assert.equal(screen.state.reactionReady, true);
  contestants.onValue({ A: { participantId: 'A1' } });
  assert.equal(screen.listeners.filter(listener => listener.path.includes('/submissions/')).length, 1);
  assert.deepEqual(screen.errors, []);
});

test('changing OX questions rejects delayed eligibility, ballot, result and error callbacks', () => {
  const screen = gameScreen();
  const previous = [...screen.listeners];
  screen.state.questionIndex++;
  screen.watch();
  previous.forEach(listener => { listener.onValue({ stale: true }); listener.onError('stale'); });
  assert.deepEqual(Object.keys(screen.state.oxRound), []);
  assert.equal(screen.state.oxReady, false);
  assert.deepEqual(screen.errors, []);
  assert.ok(previous.every(listener => listener.stopped));
  for (const listener of screen.listeners.slice(previous.length)) listener.onValue(null);
  assert.equal(screen.state.oxReady, true, 'Readiness waits for all three current subscriptions, including null results');
});

test('number rounds replace all private subscriptions and ignore late results and submissions', () => {
  const screen = gameScreen('number');
  const previous = [...screen.listeners];
  screen.state.numberChoice = 10;
  previous.forEach(listener => listener.onValue(null));
  assert.equal(screen.state.numberReady, true);
  screen.state.questionIndex = 1;
  screen.watch();
  assert.equal(screen.state.numberChoice, null);
  assert.equal(screen.state.numberReady, false);
  previous.forEach(listener => { listener.onValue({ stale: true }); listener.onError('stale'); });
  assert.equal(screen.state.numberGame.rounds[1].result, undefined);
  assert.equal(screen.state.numberGame.rounds[1].submitted, undefined);
  assert.deepEqual(screen.errors, []);
  const current = screen.listeners.slice(previous.length);
  assert.equal(current.length, 5);
  current.forEach(listener => listener.onValue(null));
  assert.equal(screen.state.numberReady, true);
  assert.equal(screen.state.numberGame.rounds[1].submitted, false);
});

test('switching taste participants clears readiness and ignores the previous participant’s vote', () => {
  const screen = gameScreen('whisky');
  const previous = [...screen.listeners];
  previous.find(listener => listener.path.includes('preferenceVotes')).onValue({ optionId: 'peat' });
  screen.state.participantId = 'B1';
  screen.watch();
  assert.equal(screen.state.tasteVotes.whisky.preferenceReady, undefined);
  previous.forEach(listener => listener.onValue({ stale: true }));
  assert.deepEqual(Object.keys(screen.state.tasteVotes.whisky), []);
  const currentVote = screen.listeners.find(listener => listener.path.endsWith('preferenceVotes/B1'));
  currentVote.onValue(null);
  assert.equal(screen.state.tasteVotes.whisky.preferenceReady, true);
  assert.equal(screen.state.tasteVotes.whisky.preference, null);
});

test('leaving and returning to a game starts fresh subscriptions without reviving old listeners', () => {
  const screen = gameScreen();
  const previous = [...screen.listeners];
  screen.state.key = 'whisky';
  screen.watch();
  screen.state.key = 'ox';
  screen.watch();
  previous.forEach(listener => listener.onValue({ stale: true }));
  assert.deepEqual(Object.keys(screen.state.oxRound), []);
  assert.equal(screen.state.oxReady, false);
  assert.equal(screen.listeners.length, 12);
  screen.watch();
  assert.equal(screen.listeners.length, 12, 'Watching the same game keeps the current subscriptions');
});

test('resetting on the same game replaces subscriptions and ignores pre-reset values', () => {
  const screen = gameScreen();
  const previous = [...screen.listeners];
  screen.reset();
  previous.forEach(listener => listener.onValue({ stale: true }));
  assert.equal(screen.state.presentation.resetAt, 2);
  assert.deepEqual(Object.keys(screen.state.oxRound), []);
  assert.equal(screen.state.oxReady, false);
  assert.equal(screen.listeners.length, 8);
  assert.ok(previous.every(listener => listener.stopped));
});

test('an OX round arriving before its prompt does not break presentation rendering', () => {
  const state = { oxGame: { control: { questionIndex: 0, phase: 'open' }, rounds: { 0: { eligible: { A1: true } } } } };
  const context = vm.createContext({ state, escape: value => String(value ?? '') });
  vm.runInContext(source.slice(source.indexOf('function oxPresentation('), source.indexOf('function oxSurvivorsPresentation(')), context);
  assert.match(context.oxPresentation({ view: 'question', questionIndex: 0 }), /ox-prompt/);
});

test('the host presentation includes its error banner', () => {
  const context = vm.createContext({
    state: { slideIndex: 0, online: true }, STAGES,
    joinNetworkView: () => '', fullscreenControl: () => '',
    errorBanner: () => '<div role="alert">연결 오류</div>',
  });
  const view = source.slice(source.indexOf('function presentationView()'), source.indexOf('function participantTasteView()'));
  vm.runInContext(view.replaceAll('import.meta.env.DEV', 'false'), context);
  assert.match(context.presentationView(), /<div role="alert">연결 오류<\/div>/);
});

test('memory locks every visible card synchronously while a flip is being sent', async () => {
  const cards = [{ disabled: false }, { disabled: false }];
  let complete, submissions = 0;
  const state = { memoryReady: true, participant: { team: 'A' }, participantId: 'A4', online: true, serverOffset: 0 };
  const game = { control: { phase: 'running', roundId: 'round' }, contestants: { A: { participantId: 'A4' } } };
  const context = vm.createContext({
    state,
    document: { hidden: false, querySelectorAll: () => cards },
    tasteContext: () => ({ game, slide: { game: 'memory', view: 'play' } }),
    memoryLayouts: () => [], memoryPlayer: () => ({ roundIndex: 0, sequence: 0 }), memoryCanFlip: () => true,
    schedule() {}, showError: error => { throw error; },
    api: { submitMemoryFlip() { submissions++; return new Promise(resolve => { complete = resolve; }); } },
  });
  vm.runInContext(source.slice(source.indexOf('async function memoryAction('), source.indexOf('async function numberAction(')), context);
  const pending = context.memoryAction('memory-flip', 0);
  assert.equal(state.voting, true);
  assert.ok(cards.every(card => card.disabled));
  await context.memoryAction('memory-flip', 1);
  assert.equal(submissions, 1);
  complete();
  await pending;
  assert.equal(state.voting, false);
});
