import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, stageIndex } from '../src/event-model.js';
import { createReactionClock, reactionExcludedIds, reactionOutcome, reactionSubmitted } from '../src/reaction-model.js';
import { createStopwatchClock } from '../src/stopwatch-model.js';
import { reactionPresentation, reactionParticipant, reactionControls } from '../src/reaction-view.js';

test('reaction follows memory with explanation, recruitment, signal and score screens', () => {
  const memory = STAGES.findIndex(stage => stage.id === 'memory-score');
  assert.equal(STAGES[stageIndex(memory, 1)].id, 'reaction-intro');
  assert.deepEqual(STAGES.filter(stage => stage.game === 'reaction').map(stage => [stage.view, stage.screenCode]), [['intro', 64], ['select', 65], ['play', 66], ['score', 67]]);
});

test('reaction excludes all prior game entrants and awards exactly the winning team', () => {
  assert.deepEqual([...reactionExcludedIds(
    { rounds: { 0: { contestants: { A: { participantId: 'A1' } } } } },
    { contestants: { A: { participantId: 'A2' } } },
    { contestants: { A: { participantId: 'A3' } } },
    { contestants: { A: { participantId: 'A4' } } },
  )], ['A1', 'A2', 'A3', 'A4']);
  const game = { control: { roundId: 'round' }, contestants: { A: { participantId: 'A5' } }, winner: { participantId: 'A5', team: 'A', roundId: 'round' } };
  assert.deepEqual(reactionOutcome(game), { A: 100, B: 0, C: 0, D: 0 });
  assert.throws(() => reactionOutcome({ ...game, winner: null }));
  assert.throws(() => reactionOutcome({ ...game, winner: { ...game.winner, roundId: 'old' } }));
});

test('reaction labels the waiting screen, catches early taps and enables entrants after signal', () => {
  const game = { control: { phase: 'selecting', roundId: 'round' }, contestants: { A: { participantId: 'A5', name: '선수' } } };
  const slide = { view: 'play' };
  const props = { game, slide, participant: { team: 'A' }, participantId: 'A5', ready: true };
  assert.match(reactionPresentation(game, slide), /<h1>터치를 기다리세요<\/h1>/);
  assert.match(reactionParticipant(props), /data-reaction-action="reaction-false-start"/);
  assert.doesNotMatch(reactionParticipant({ ...props, participantId: 'A6' }), /data-reaction-action/);
  assert.doesNotMatch(reactionParticipant(props), /reaction-tap/);
  assert.match(reactionControls(game, slide, false), /터치 신호 보내기/);
  game.control.phase = 'open';
  assert.match(reactionPresentation(game, slide), /지금 터치하세요!/);
  assert.match(reactionParticipant(props), /reaction-tap/);
  assert.doesNotMatch(reactionParticipant({ ...props, participantId: 'A6' }), /reaction-tap/);
  game.winner = { team: 'A', participantId: 'A5', roundId: 'round' };
  assert.match(reactionPresentation(game, slide), /\+100점/);
  assert.doesNotMatch(reactionParticipant(props), /reaction-tap/);
});

test('false starts are final, excluded from scoring and displayed without a reaction time', () => {
  const game = {
    control: { roundId: 'round', localTiming: true, phase: 'open' },
    contestants: { A: { participantId: 'A1', name: '성급한 선수' }, B: { participantId: 'B1' } },
    submissions: {
      A: { participantId: 'A1', roundId: 'round', elapsedMs: 0, disqualified: true },
      B: { participantId: 'B1', roundId: 'round', elapsedMs: 250 },
    },
  };
  const props = { game, slide: { view: 'play' }, participant: { team: 'A' }, participantId: 'A1', ready: true };
  assert.equal(reactionSubmitted(game), true);
  assert.deepEqual(reactionOutcome(game), { A: 0, B: 100, C: 0, D: 0 });
  assert.match(reactionParticipant(props), /<h1>실격<\/h1>/);
  assert.doesNotMatch(reactionParticipant(props), /reaction-tap/);
  assert.match(reactionControls(game, props.slide, false), /실격 1명/);
  game.result = { points: reactionOutcome(game), elapsedMs: { A: 0, B: 250 }, disqualified: { A: true } };
  assert.match(reactionPresentation(game, props.slide), /<b>실격<\/b>/);
  assert.doesNotMatch(reactionParticipant(props), /0\.000초/);
  game.submissions.B = { ...game.submissions.B, disqualified: true, elapsedMs: 0 };
  assert.deepEqual(reactionOutcome(game), { A: 0, B: 0, C: 0, D: 0 });
});

test('local false starts survive a delayed signal, reload and storage failure', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const clock = createReactionClock({ storage });
  clock.disqualify('round');
  assert.equal(clock.start('round').disqualified, true);
  const restored = createReactionClock({ storage });
  assert.equal(restored.read('round').disqualified, true);
  assert.equal(restored.start('round').disqualified, true);
  assert.equal(restored.read('next-round'), undefined);
  const unavailable = createReactionClock({ storage: { getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); } } });
  unavailable.disqualify('round');
  assert.equal(unavailable.read('round').disqualified, true);
});

test('local reaction results compare elapsed time regardless of arrival order and reward exact ties', () => {
  const game = { control: { roundId: 'round', localTiming: true }, contestants: { A: { participantId: 'A1' }, B: { participantId: 'B1' } }, submissions: {} };
  assert.equal(reactionSubmitted(game), false);
  assert.throws(() => reactionOutcome(game));
  game.submissions.A = { participantId: 'A1', roundId: 'round', elapsedMs: 410, submittedAt: 1000 };
  assert.throws(() => reactionOutcome(game));
  game.submissions.B = { participantId: 'B1', roundId: 'round', elapsedMs: 180, submittedAt: 9000 };
  assert.deepEqual(reactionOutcome(game), { A: 0, B: 100, C: 0, D: 0 });
  game.submissions.A.elapsedMs = 180;
  assert.deepEqual(reactionOutcome(game), { A: 100, B: 100, C: 0, D: 0 });
  game.submissions.B.roundId = 'old';
  assert.equal(reactionSubmitted(game), false);
});

test('reaction clock starts when shown, permits sub-second input and freezes before upload', () => {
  let now = 50000;
  const entries = new Map();
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
  const clock = createStopwatchClock({ now: () => now, storage, minimumMs: 0, round: Math.round });
  assert.equal(clock.read('round'), undefined);
  now += 3000; // The network delay before the cue is not timed.
  clock.start('round');
  now += 247;
  assert.equal(clock.stop('round'), 247);
  now += 7000; // Upload and retries keep the frozen measurement.
  assert.equal(clock.stop('round'), 247);
  const restored = createStopwatchClock({ now: () => now, storage, minimumMs: 0, round: Math.round });
  assert.equal(restored.stop('round'), 247);
});
