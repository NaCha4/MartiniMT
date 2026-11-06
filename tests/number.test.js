import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, stageIndex } from '../src/event-model.js';
import { numberExcludedIds, numberOutcome, numberSubmitted, numberStatus, numberRevealFinished, NUMBER_REVEAL_DURATION } from '../src/number-model.js';
import { numberPresentation, numberParticipant, numberControls } from '../src/number-view.js';

function fixture(values) {
  const contestants = Object.fromEntries(Object.keys(values).map(team => [team, { participantId: `${team}3`, name: `${team}<선수>` }]));
  const round = { roundId: 'round', submissions: Object.fromEntries(Object.entries(values).map(([team, value]) => [team, { participantId: `${team}3`, roundId: 'round', value }])) };
  return { game: { contestants, control: { questionIndex: 0, phase: 'open' }, rounds: { 0: round } }, round };
}

test('number game follows stopwatch and preserves all existing stage indices', () => {
  const previous = STAGES.findIndex(stage => stage.id === 'stopwatch-score');
  assert.equal(STAGES[stageIndex(previous, 1)].id, 'number-intro');
  assert.deepEqual(STAGES.filter(stage => stage.game === 'number').map(stage => stage.screenCode), [52, 53, 54, 55, 56, 57, 58, 59]);
  assert.deepEqual(STAGES.filter(stage => stage.game === 'number' && stage.view === 'play').map(stage => stage.questionIndex), [0, 1, 2]);
});

test('number game excludes everyone who played any liar round or stopwatch', () => {
  const liar = { rounds: { 0: { contestants: { A: { participantId: 'A1' } } }, 1: { contestants: { A: { participantId: 'A2' } } } } };
  assert.deepEqual([...numberExcludedIds(liar, { contestants: { A: { participantId: 'A3' }, B: { participantId: 'B1' } } })].sort(), ['A1', 'A2', 'A3', 'B1']);
  assert.equal(numberExcludedIds(null, null).size, 0);
});

test('only the highest unique number scores while every duplicate loses', () => {
  for (const [values, points] of [
    [{ A: 10, B: 10, C: 8, D: 5 }, { A: 0, B: 0, C: 160, D: 0 }],
    [{ A: 10, B: 9, C: 8, D: 7 }, { A: 200, B: 0, C: 0, D: 0 }],
    [{ A: 10, B: 10, C: 7, D: 7 }, { A: 0, B: 0, C: 0, D: 0 }],
    [{ A: 1 }, { A: 20, B: 0, C: 0, D: 0 }],
  ]) {
    const { game, round } = fixture(values);
    assert.deepEqual(numberOutcome(game, round), { values, points });
  }
  const { game, round } = fixture({ A: 10, B: 10, C: 8, D: 5 });
  const result = numberOutcome(game, round);
  assert.equal(numberStatus(result, 'A'), 'duplicate');
  assert.equal(numberStatus(result, 'C'), 'winner');
  assert.equal(numberStatus(result, 'D'), 'safe');
});

test('all valid current entrants must submit an integer in range', () => {
  for (const value of [0, 11, 1.1, '8', null, undefined]) {
    const { game, round } = fixture({ A: value });
    assert.equal(numberSubmitted(game, round), false);
    assert.throws(() => numberOutcome(game, round));
  }
  assert.equal(numberSubmitted({}, {}), false);
  for (const field of ['roundId', 'participantId']) {
    const { game, round } = fixture({ A: 1 });
    round.submissions.A[field] = 'stale';
    assert.equal(numberSubmitted(game, round), false);
  }
  const { game, round } = fixture({ A: 1, B: 2 });
  delete round.submissions.B;
  assert.equal(numberSubmitted(game, round), false);
});

test('reveal uses saved timestamps, safely renders names, and keeps next-round players', () => {
  const { game, round } = fixture({ A: 10, B: 10, C: 8, D: 5 });
  round.result = { ...numberOutcome(game, round), revealedAt: 1000 };
  assert.equal(numberRevealFinished(round, 999 + NUMBER_REVEAL_DURATION), false);
  assert.equal(numberRevealFinished(round, 1000 + NUMBER_REVEAL_DURATION), true);
  assert.equal(numberRevealFinished({}, 10000), false);
  const slide = { view: 'play', questionIndex: 0 };
  assert.match(numberPresentation(game, slide, 1100), /is-revealing/);
  assert.match(numberPresentation(game, slide, 6000), /is-settled/);
  assert.match(numberPresentation(game, slide), /A&lt;선수&gt;/);
  assert.match(numberPresentation(game, slide), /최고 단독 숫자 · \+160점/);
  const html = numberParticipant({ game, slide, participant: { team: 'A' }, participantId: 'A3', ready: true, now: 6000 });
  assert.match(html, /이번 라운드 탈락/);
  assert.match(html, /다음 라운드에 다시 도전/);
});

test('input is available only after remote input-start and submission stays locked', () => {
  assert.doesNotThrow(() => numberControls({}, { view: 'intro' }, false));
  const { game } = fixture({ A: 8 });
  const args = { game, slide: { view: 'play', questionIndex: 0 }, participant: { team: 'A' }, participantId: 'A3', ready: true, choice: 8, error: '' };
  assert.equal((numberParticipant(args).match(/data-number-choice=/g) ?? []).length, 10);
  assert.match(numberParticipant(args), /8 선택 확정/);
  game.control.phase = 'ready';
  assert.doesNotMatch(numberParticipant(args), /data-number-choice/);
  assert.match(numberControls(game, args.slide, false), /입력 시작/);
  game.control.phase = 'open';
  game.rounds[0].submitted = true;
  assert.doesNotMatch(numberParticipant(args), /data-number-choice/);
  assert.match(numberParticipant(args), /선택 잠금 완료/);
});
