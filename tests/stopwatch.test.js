import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, stageIndex } from '../src/event-model.js';
import { createStopwatchClock, stopwatchOutcome, stopwatchSubmitted } from '../src/stopwatch-model.js';
import { stopwatchPresentation, stopwatchControls, stopwatchParticipant } from '../src/stopwatch-view.js';

const game = times => ({
  control: { roundId: 'round', phase: 'running' },
  contestants: Object.fromEntries(Object.keys(times).map(team => [team, { participantId: `${team}1`, name: `${team}선수` }])),
  submissions: Object.fromEntries(Object.entries(times).filter(([, value]) => value !== null).map(([team, elapsedMs]) => [team, { participantId: `${team}1`, roundId: 'round', elapsedMs }])),
});

test('stopwatch appends four stages after liar while retaining stored stage indices', () => {
  const previous = STAGES.findIndex(stage => stage.id === 'liar-score-3');
  assert.equal(STAGES[stageIndex(previous, 1)].id, 'stopwatch-intro');
  assert.deepEqual(STAGES.filter(stage => stage.game === 'stopwatch').map(stage => [stage.view, stage.screenCode]), [['intro', 48], ['select', 49], ['play', 50], ['score', 51]]);
});

test('stopwatch supports one to four entrants, exact ties, and rejects incomplete or stale submissions', () => {
  assert.deepEqual(stopwatchOutcome(game({ A: 12345 })).points, { A: 100, B: 0, C: 0, D: 0 });
  assert.deepEqual(stopwatchOutcome(game({ A: 9900, B: 10100, C: 11000, D: 9000 })).points, { A: 100, B: 100, C: 0, D: 0 });
  assert.deepEqual(stopwatchOutcome(game({ A: 10000, B: 10000 })).points, { A: 100, B: 100, C: 0, D: 0 });
  for (const value of [game({}), game({ A: null }), game({ A: 9900, B: null }), game({ A: 999 }), game({ A: 10000.5 })]) {
    assert.equal(stopwatchSubmitted(value), false);
    assert.throws(() => stopwatchOutcome(value));
  }
  const stale = game({ A: 10000 });
  stale.submissions.A.roundId = 'old';
  assert.equal(stopwatchSubmitted(stale), false);
});

test('local clock waits one second and freezes duration through upload delays and same-tab reloads', () => {
  let now = 50000;
  const entries = new Map();
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
  const clock = createStopwatchClock({ now: () => now, storage });
  clock.start('one'); now += 999.9;
  assert.throws(() => clock.stop('one'));
  now = 59999.6;
  assert.equal(clock.stop('one'), 10000);
  now += 6000;
  assert.equal(clock.stop('one'), 10000);
  const restored = createStopwatchClock({ now: () => now, storage });
  assert.equal(restored.stop('one'), 10000);
  assert.equal(restored.read('two'), undefined);
  restored.start('two'); now += 10000;
  const runningReload = createStopwatchClock({ now: () => now, storage });
  assert.equal(runningReload.stop('two'), 10000);
});

test('presentation and remote hide times until manual reveal and wait for actual entrants', () => {
  const active = game({ A: 9876, B: null });
  const slide = { view: 'play' };
  assert.doesNotMatch(stopwatchPresentation(active, slide), /9\.876|stopwatch-time/);
  assert.match(stopwatchPresentation(active, slide), /제출 완료/);
  assert.match(stopwatchControls(active, slide, false), /disabled/);
  delete active.contestants.B;
  assert.doesNotMatch(stopwatchControls(active, slide, false), /disabled/);
  active.result = stopwatchOutcome(active);
  assert.match(stopwatchPresentation(active, slide), /9\.876/);
  assert.match(stopwatchPresentation(active, slide), /\+100점/);
});

test('participant excludes liar players and only exposes a stop button after the local delay', () => {
  const props = { game: { control: { phase: 'selecting' }, excluded: { A1: true } }, slide: { view: 'select' }, participant: { team: 'A' }, participantId: 'A1', ready: true, error: '' };
  assert.doesNotMatch(stopwatchParticipant(props), /data-stopwatch-action/);
  assert.match(stopwatchParticipant(props), /라이어게임 출전자/);
  props.game = game({ A: null }); props.slide.view = 'play';
  assert.match(stopwatchParticipant(props), /카운트 시작/);
  props.attempt = { elapsedMs: null }; props.canStop = false;
  assert.doesNotMatch(stopwatchParticipant(props), /카운트 종료/);
  props.canStop = true;
  assert.match(stopwatchParticipant(props), /카운트 종료/);
});
