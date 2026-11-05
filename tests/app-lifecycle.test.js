import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createSubscriptionGroup } from '../src/subscription-group.js';
import { STAGES } from '../src/event-model.js';
import { TASTE_ROUNDS } from '../src/taste-model.js';
import { OX_QUESTION_COUNT } from '../src/ox-model.js';

const source = readFileSync(new URL('../src/event-app.js', import.meta.url), 'utf8');

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
