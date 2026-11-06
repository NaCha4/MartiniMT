import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, stageIndex } from '../src/event-model.js';
import { reactionExcludedIds, reactionOutcome } from '../src/reaction-model.js';
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

test('reaction waits on black, only enables entrants after signal, and reveals the winner', () => {
  const game = { control: { phase: 'selecting', roundId: 'round' }, contestants: { A: { participantId: 'A5', name: '선수' } } };
  const slide = { view: 'play' };
  const props = { game, slide, participant: { team: 'A' }, participantId: 'A5', ready: true };
  assert.doesNotMatch(reactionPresentation(game, slide), /<h1>/);
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
