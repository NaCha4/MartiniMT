import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, TEAM_IDS, stageIndex } from '../src/event-model.js';
import { liarRosterReady, liarUsedIds, liarOutcome } from '../src/liar-model.js';
import { LIAR_PROMPTS } from '../src/liar-prompts.js';
import { liarPresentation, liarParticipant } from '../src/liar-view.js';
import { scoreAward } from '../src/taste-model.js';

const contestants = Object.fromEntries(TEAM_IDS.map(team => [team, { participantId: `${team}1`, team, teamName: `${team}조`, name: `${team}선수` }]));

test('liar follows the zoom quiz with three independent selection, play and score rounds', () => {
  const stages = STAGES.filter(stage => stage.game === 'liar');
  assert.deepEqual(stages.map(stage => stage.screenCode), Array.from({ length: 10 }, (_, i) => i + 38));
  assert.deepEqual(stages.map(stage => stage.view), ['intro', ...Array.from({ length: 3 }, () => ['select', 'play', 'score']).flat()]);
  const zoomScore = STAGES.findIndex(stage => stage.id === 'zoom-score');
  assert.equal(STAGES[stageIndex(zoomScore, 1)].id, 'liar-intro');
  assert.deepEqual(LIAR_PROMPTS, [{ topic: '술', word: '막걸리' }, { topic: '디저트', word: '한정선 과일모찌' }, { topic: '직업', word: '대통령' }]);
});

test('liar counts only audience votes and treats tied first place as caught', () => {
  const round = { contestants, votes: { A2: { participantId: 'A1' }, B2: { participantId: 'B1' }, A1: { participantId: 'B1' }, C2: { participantId: 'unknown' } } };
  const caught = liarOutcome(round, 'A1');
  assert.deepEqual(caught.counts, { A1: 1, B1: 1, C1: 0, D1: 0 });
  assert.equal(caught.caught, true);
  assert.deepEqual(caught.points, { A: 0, B: 50, C: 50, D: 50 });
  const escaped = liarOutcome(round, 'C1');
  assert.equal(escaped.caught, false);
  assert.deepEqual(escaped.points, { A: 0, B: 0, C: 150, D: 0 });
  const first = scoreAward(null, 'round1', caught.points, 1);
  const second = scoreAward(first, 'round2', escaped.points, 2);
  assert.deepEqual(second.totals, { A: 0, B: 50, C: 200, D: 50 });
  assert.equal(scoreAward(second, 'round2', escaped.points, 3), second);
});

test('liar keeps prior entrants ineligible and requires three members per team', () => {
  assert.deepEqual([...liarUsedIds({ rounds: { 0: { contestants } } })], ['A1', 'B1', 'C1', 'D1']);
  const roster = Object.fromEntries(TEAM_IDS.flatMap(team => Array.from({ length: 3 }, (_, i) => [`${team}${i + 1}`, { team }])));
  assert.equal(liarRosterReady(roster), true);
  delete roster.A3;
  assert.equal(liarRosterReady(roster), false);
});

test('presenter and spectators never receive the private word in rendered markup', () => {
  const game = { control: { phase: 'describing', questionIndex: 0 }, rounds: { 0: { topic: '술', contestants } }, prompts: LIAR_PROMPTS };
  const slide = { game: 'liar', view: 'play', questionIndex: 0 };
  assert.ok(!liarPresentation(game, slide).includes('막걸리'));
  const common = { game, slide, participant: { team: 'A' }, ready: true, disabled: false, error: '' };
  assert.ok(!liarParticipant({ ...common, participantId: 'A2', round: { contestants } }).includes('막걸리'));
  assert.ok(liarParticipant({ ...common, participantId: 'A1', round: { contestants, card: { word: '막걸리' } } }).includes('막걸리'));
  assert.ok(!liarParticipant({ ...common, participantId: 'A1', round: { contestants, card: { word: '' } } }).includes('막걸리'));
});
