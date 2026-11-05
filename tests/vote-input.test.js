import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/event-app.js', import.meta.url), 'utf8');

function votingScreen(kind = 'taste') {
  const listeners = new Map(), windowListeners = new Map(), frames = [], votes = [];
  let renders = 0;
  class Button {
    constructor() {
      this.dataset = kind === 'ox' ? { oxVote: 'O' } : { vote: 'peat' };
      this.disabled = false;
      this.isConnected = true;
      this.listeners = new Map();
    }
    closest() { return this; }
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 100 }; }
  }
  const button = new Button();
  const state = { role: 'participant', participantId: 'A1', presentation: { resetAt: 1 }, questionIndex: 0, control: { roundId: 'round-one', phase: 'open' } };
  const context = vm.createContext({
    state, Element: Button, performance: { now: () => 1000 },
    document: {
      querySelectorAll(selector) { return selector === (kind === 'ox' ? '[data-ox-vote]' : '[data-vote]') ? [button] : []; },
      addEventListener(name, handler) { listeners.set(name, handler); },
    },
    window: { addEventListener(name, handler) { windowListeners.set(name, handler); } },
    $: () => null, interactionLocked: () => true,
    tasteContext: () => ({ key: kind, slide: { questionIndex: state.questionIndex }, game: { control: state.control } }),
    requestAnimationFrame(handler) { frames.push(handler); return frames.length; },
    render() { renders++; button.isConnected = false; },
    voteTaste(value) { votes.push(['taste', value]); },
    voteOx(value) { votes.push(['ox', value]); },
  });
  const gestureStart = source.includes('function currentVoteKey()') ? source.indexOf('function currentVoteKey()') : source.indexOf("document.addEventListener('pointerdown'");
  vm.runInContext(
    'let frame, pointerGesture, suppressClickUntil = 0, composing = false;\n'
    + source.slice(source.indexOf('function schedule()'), source.indexOf('function relayOperatorError'))
    + source.slice(source.indexOf('function bindEvents()'), source.indexOf('async function join('))
    + source.slice(gestureStart, source.indexOf('function preventViewportGesture'))
    + '\nbindEvents();', context,
  );
  return {
    button, state, votes,
    pointer(type, overrides = {}) {
      const event = { target: button, pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0, clientX: 50, clientY: 50, cancelable: true, preventDefault() {}, ...overrides };
      listeners.get(type)(event);
    },
    click(detail = 1) { button.listeners.get('click')({ detail }); },
    update() { context.schedule(); },
    flush() { frames.splice(0).forEach(handler => handler()); },
    blur() { windowListeners.get('blur')(); },
    get renders() { return renders; },
  };
}

for (const kind of ['taste', 'ox']) {
  test(`${kind} accepts one slightly moving tap despite a queued realtime redraw and a missing click`, () => {
    const screen = votingScreen(kind);
    screen.pointer('pointerdown');
    screen.update();
    screen.flush();
    assert.equal(screen.renders, 0, 'Keep the touched button mounted until release');
    screen.pointer('pointermove', { clientX: 52, clientY: 51 });
    assert.equal(screen.votes.length, 0, 'Wait for a completed tap');
    screen.pointer('pointerup', { clientX: 52, clientY: 51 });
    assert.deepEqual(screen.votes, [[kind, kind === 'ox' ? 'O' : 'peat']]);
    screen.flush();
    assert.equal(screen.renders, 1);
    screen.click(1);
    assert.equal(screen.votes.length, 1, 'Ignore the delayed compatibility click');
  });

  test(`${kind} still supports keyboard and assistive click activation`, () => {
    const screen = votingScreen(kind);
    screen.click(0);
    assert.equal(screen.votes.length, 1);
  });
}

test('cancelled, dragged, multi-touch, disabled and detached voting controls do not submit', () => {
  const cancel = votingScreen();
  cancel.pointer('pointerdown');
  cancel.pointer('pointercancel');
  cancel.pointer('pointerup');
  assert.equal(cancel.votes.length, 0);
  const drag = votingScreen();
  drag.pointer('pointerdown');
  drag.pointer('pointermove', { clientX: 80 });
  drag.pointer('pointerup', { clientX: 50 });
  assert.equal(drag.votes.length, 0);
  const multi = votingScreen();
  multi.pointer('pointerdown');
  multi.pointer('pointerdown', { pointerId: 2, isPrimary: false, target: null });
  multi.pointer('pointerup');
  assert.equal(multi.votes.length, 0);
  const disabled = votingScreen();
  disabled.button.disabled = true;
  disabled.pointer('pointerdown');
  disabled.pointer('pointerup');
  assert.equal(disabled.votes.length, 0);
  const detached = votingScreen();
  detached.pointer('pointerdown');
  detached.button.isConnected = false;
  detached.pointer('pointerup');
  assert.equal(detached.votes.length, 0);
});

test('a release outside the button or after losing focus does not submit', () => {
  const outside = votingScreen();
  outside.pointer('pointerdown', { clientX: 1 });
  outside.pointer('pointerup', { clientX: -1 });
  assert.equal(outside.votes.length, 0);
  const blurred = votingScreen();
  blurred.pointer('pointerdown');
  blurred.blur();
  blurred.pointer('pointerup');
  assert.equal(blurred.votes.length, 0);
});

test('a held tap cannot cross a question, round, phase, reset or participant change', () => {
  for (const change of [
    state => { state.questionIndex++; },
    state => { state.control.roundId = 'round-two'; },
    state => { state.control.phase = 'closed'; },
    state => { state.presentation.resetAt++; },
    state => { state.participantId = 'B1'; },
  ]) {
    const screen = votingScreen('ox');
    screen.pointer('pointerdown');
    change(screen.state);
    screen.pointer('pointerup');
    assert.equal(screen.votes.length, 0);
  }
});
