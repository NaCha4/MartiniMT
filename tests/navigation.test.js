import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { STAGES, stageIndex } from '../src/event-model.js';
import { OX_REVEAL_DURATION, oxQuestionsReady, oxSurvivorRevealEnd } from '../src/ox-model.js';
import { TASTE_ROUNDS, revealFinished } from '../src/taste-model.js';

const source = readFileSync(new URL('../src/event-app.js', import.meta.url), 'utf8');

function presentation(slideIndex = 3) {
  const state = {
    role: 'host', presenting: true, online: true, busy: false, controlsLocked: false,
    room: 'test-room', slideIndex, presentation: { resetAt: 123 },
    participants: {}, tasteGames: {}, tasteVotes: {}, oxGame: {}, serverOffset: 0,
  };
  const calls = [], errors = [], listeners = new Map();
  let selection = '';
  class Element {
    constructor(control = false) { this.control = control; }
    closest() { return this.control ? this : null; }
  }
  const document = { hidden: false, addEventListener: (name, callback) => listeners.set(name, callback) };
  const context = vm.createContext({
    state, STAGES, stageIndex, OX_REVEAL_DURATION, oxQuestionsReady, oxSurvivorRevealEnd, revealFinished,
    document, Element, window: { getSelection: () => selection },
    schedule() {}, chooseWinner() {}, showError: error => errors.push(error),
    action: name => calls.push(['action', name]),
    lockControls() { state.controlsLocked = true; },
    api: {
      async setPresentationSlide(...args) { calls.push(['slide', ...args]); },
      async ensureTasteGame(...args) { calls.push(['prepare-taste', ...args]); return { control: { phase: 'ready' } }; },
      async prepareOxQuestion() { throw new Error('OX question preparation requires game state'); },
      async prepareYutGame(...args) { calls.push(['prepare-yut', ...args]); return { control: { phase: 'playing' } }; },
      async awardTastePoints() { throw new Error('Taste scoring requires results'); },
      async awardOxPoints() { throw new Error('OX scoring requires results'); },
      startTouchRound() { throw new Error('Touch round preparation was not expected'); },
    },
  });
  vm.runInContext(
    source.slice(source.indexOf('function tasteContext('), source.indexOf('function tasteControls('))
    + source.slice(source.indexOf('async function moveTo('), source.indexOf('async function tap('))
    + source.slice(source.indexOf("document.addEventListener('contextmenu'"), source.indexOf('async function start()')),
    context,
  );
  return {
    state, calls, errors, document,
    async click(overrides = {}) {
      listeners.get('click')?.({ target: new Element(), button: 0, detail: 1, ...overrides });
      await new Promise(resolve => setImmediate(resolve));
    },
    advance: (options) => context.advance(1, options),
    async keydown(key) {
      listeners.get('keydown')({ key, repeat: false, target: new Element(), preventDefault() {} });
      await new Promise(resolve => setImmediate(resolve));
    },
    async rightClick() {
      listeners.get('contextmenu')({ target: new Element(), preventDefault() {} });
      await new Promise(resolve => setImmediate(resolve));
    },
    control: new Element(true),
    select(text) { selection = text; },
  };
}

test('all presentation screens ignore host clicks, right-clicks, keys and direct navigation', async () => {
  for (const [index, stage] of STAGES.entries()) {
    const screen = presentation(index);
    await screen.click();
    await screen.rightClick();
    for (const key of ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', ' ', 'Escape']) await screen.keydown(key);
    await screen.advance();
    assert.equal(screen.state.slideIndex, index, stage.id);
    assert.deepEqual(screen.calls, [], stage.id);
  }
});

test('yut ignores host clicks, context menus, keys and direct advances while its remote still advances', async () => {
  for (const [index, stage] of STAGES.entries()) {
    if (stage.game !== 'yut') continue;
    const screen = presentation(index);
    await screen.click();
    await screen.rightClick();
    for (const key of ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', ' ', 'Escape']) await screen.keydown(key);
    await screen.advance({ skipGame: true });
    assert.equal(screen.state.slideIndex, index, stage.id);
    assert.deepEqual(screen.calls, [], stage.id);
  }
  const index = STAGES.findIndex(stage => stage.id === 'yut-intro');
  const remote = presentation(index);
  remote.state.role = 'manager';
  await remote.advance();
  assert.equal(STAGES[remote.state.slideIndex].id, 'yut-board');
  assert.deepEqual(remote.calls.map(([method]) => method), ['prepare-yut', 'slide']);
});

test('remote navigation still waits for votes and prepares the next game screen', async () => {
  const blocked = presentation();
  blocked.state.role = 'manager';
  await blocked.advance();
  await blocked.advance({ skipGame: true });
  assert.equal(blocked.state.slideIndex, 3);
  assert.deepEqual(blocked.calls, []);
  const ready = presentation(2);
  ready.state.role = 'manager';
  await ready.advance();
  assert.equal(ready.state.slideIndex, 3);
  assert.deepEqual(ready.calls.map(([method]) => method), ['prepare-taste', 'slide']);
});

test('presentation controls, double clicks, hidden tabs and busy states do not advance directly', async () => {
  const control = presentation();
  await control.click({ target: control.control });
  await control.click({ detail: 2 });
  await control.click({ button: 2 });
  control.select('selected text');
  await control.click();
  assert.deepEqual(control.calls, []);
  for (const field of ['busy', 'controlsLocked']) {
    const screen = presentation();
    screen.state[field] = true;
    await screen.click();
    assert.deepEqual(screen.calls, [], field);
  }
  const hidden = presentation();
  hidden.document.hidden = true;
  await hidden.click();
  assert.deepEqual(hidden.calls, []);
  const participant = presentation();
  participant.state.role = 'participant';
  await participant.click();
  assert.deepEqual(participant.calls, []);
});

test('unstarted taste screens still display their configured voting options', () => {
  for (const key of ['whisky', 'soju', 'military']) {
    const slideIndex = STAGES.findIndex(slide => slide.game === key && slide.view === 'vote');
    const context = vm.createContext({
      state: { slideIndex, serverOffset: 0 }, TASTE_ROUNDS,
      tasteContext: () => ({ game: {} }), escape: value => String(value ?? ''),
      WHISKY_VISUALS: {}, SOJU_VISUALS: {}, MILITARY_VISUALS: {},
    });
    vm.runInContext(source.slice(source.indexOf('function tastePresentation('), source.indexOf('function scorePresentation(')), context);
    const html = context.tastePresentation(STAGES[slideIndex]);
    for (const id of Object.keys(TASTE_ROUNDS[key].options)) assert.ok(html.includes(`data-option="${id}"`));
  }
});

test('unstarted OX screens show saved questions and prefer the active round snapshot', () => {
  const state = { oxGame: {}, oxQuestions: { 0: { text: '저장한 문제' } } };
  const context = vm.createContext({ state, escape: value => String(value ?? '') });
  vm.runInContext(source.slice(source.indexOf('function oxPresentation('), source.indexOf('function oxSurvivorsPresentation(')), context);
  const slide = { view: 'question', questionIndex: 0 };
  assert.match(context.oxPresentation(slide), /저장한 문제/);
  state.oxGame.rounds = { 0: { prompt: '진행 중인 문제' } };
  assert.match(context.oxPresentation(slide), /진행 중인 문제/);
  assert.doesNotMatch(context.oxPresentation(slide), /저장한 문제/);
});
