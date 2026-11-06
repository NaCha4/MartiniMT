import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { STAGES, TEAM_IDS, stageIndex } from '../src/event-model.js';
import { LIAR_REVEAL_DURATION, liarRosterReady, liarUsedIds, liarOutcome, liarTally, liarRevealFinished } from '../src/liar-model.js';
import { LIAR_PROMPTS } from '../src/liar-prompts.js';
import { liarControls, liarPresentation, liarParticipant } from '../src/liar-view.js';
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

test('public vote totals contain no answer and the reveal must finish before scoring', () => {
  const round = { contestants, votes: { A2: { participantId: 'B1' }, B2: { participantId: 'B1' } } };
  assert.deepEqual(liarTally(round), { counts: { A1: 0, B1: 2, C1: 0, D1: 0 }, topIds: { B1: true } });
  assert.equal(liarRevealFinished(round, 10000), false);
  round.result = { revealedAt: 1000 };
  assert.equal(liarRevealFinished(round, 1000 + LIAR_REVEAL_DURATION - 1), false);
  assert.equal(liarRevealFinished(round, 1000 + LIAR_REVEAL_DURATION), true);
});

test('vote totals show before the liar identity and the animation resumes from its timestamp', () => {
  const round = { contestants, tally: { ...liarTally({ contestants, votes: { A2: { participantId: 'A1' } } }), closedAt: 100 } };
  const game = { control: { phase: 'closed', questionIndex: 0 }, rounds: { 0: round } };
  const slide = { view: 'play', questionIndex: 0 };
  const pending = liarPresentation(game, slide, 1000);
  assert.ok(pending.includes('liar-vote-count'));
  assert.ok(!pending.includes('liar-badge'));
  assert.ok(!pending.includes('is-liar'));
  round.result = { ...liarOutcome({ ...round, votes: { A2: { participantId: 'A1' } } }, 'A1'), revealedAt: 1000 };
  const revealed = liarPresentation(game, slide, 1500);
  assert.ok(revealed.includes('liar-badge'));
  assert.ok(revealed.includes('--liar-reveal-delay:-500ms'));
});

test('liar keeps prior entrants ineligible and accepts any nonempty roster', () => {
  assert.deepEqual([...liarUsedIds({ rounds: { 0: { contestants } } })], ['A1', 'B1', 'C1', 'D1']);
  const roster = Object.fromEntries(TEAM_IDS.flatMap(team => Array.from({ length: 3 }, (_, i) => [`${team}${i + 1}`, { team }])));
  assert.equal(liarRosterReady(roster), true);
  assert.equal(liarRosterReady({ A1: roster.A1 }), true);
  assert.equal(liarRosterReady({}), false);
});

test('one to three entrants have matching vote options, counts and safe reveal placeholders', () => {
  for (const count of [1, 2, 3]) {
    const partial = Object.fromEntries(Object.entries(contestants).slice(0, count));
    const round = { contestants: partial, votes: { D6: { participantId: 'A1' } } };
    const roster = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, {}]));
    const game = { roster, control: { phase: 'voting', questionIndex: 0 }, rounds: { 0: round } };
    const slide = { game: 'liar', view: 'play', questionIndex: 0 };
    assert.ok(liarControls(game, slide, false, roster).includes(`1 / ${8 - count}명 투표`));
    const participant = liarParticipant({ game, round, slide, participant: { team: 'D' }, participantId: 'D6', ready: true });
    assert.equal((participant.match(/data-liar-vote=/g) ?? []).length, count);
    round.result = liarOutcome(round, 'A1');
    round.result.revealedAt = 1000;
    assert.deepEqual(round.result.points, { A: 0, B: 50, C: 50, D: 50 });
    const presentation = liarPresentation(game, slide, 1000);
    assert.equal((presentation.match(/data-liar-candidate=/g) ?? []).length, count);
    assert.equal((presentation.match(/미출전/g) ?? []).length, 4 - count);
  }
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

function revealTransition({ scored = false, now = 1000 } = {}) {
  const slideIndex = STAGES.findIndex(stage => stage.id === 'liar-play-1');
  const round = { roundId: 'round', result: { revealedAt: 1000 } };
  const state = { role: 'host', room: 'local', presenting: true, online: true, busy: false, slideIndex, serverOffset: 0,
    presentation: { resetAt: 1 }, liarGame: { control: { resetAt: 1 }, rounds: { 0: round } }, teamScores: scored ? { awards: { round: {} } } : null };
  const calls = [], timers = [], errors = [];
  const context = vm.createContext({
    state, STAGES, stageIndex, LIAR_REVEAL_DURATION, Date: { now: () => now },
    clearTimeout() {}, setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; }, schedule() {},
    syncPresentation(value) { state.slideIndex = value.slideIndex; }, showGameError(error) { errors.push(error); },
    api: {
      async awardLiarPoints() { calls.push('award'); return { awards: { round: {} } }; },
      async followPresentationSlide(room, expected, next) { calls.push('follow'); return { committed: true, snapshot: { val: () => ({ slideIndex: next }) } }; },
    },
  });
  const source = readFileSync(new URL('../src/event-app.js', import.meta.url), 'utf8');
  vm.runInContext('let liarTimer, liarAdvancing = false, liarPendingId, liarRetryAt = 0;\n'
    + source.slice(source.indexOf('function scheduleLiarProgress()'), source.indexOf('function editableZoomQuestions()')), context);
  context.scheduleLiarProgress();
  return { state, context, timers, calls, errors, setNow(value) { now = value; } };
}

test('liar points and score navigation wait for the animation and resume after reloading', async () => {
  const transition = revealTransition({ now: 1500 });
  assert.equal(transition.timers[0].delay, 1500);
  assert.deepEqual(transition.calls, []);
  transition.setNow(3000);
  await transition.timers[0].callback();
  assert.deepEqual(transition.calls, ['award', 'follow']);
  assert.equal(STAGES[transition.state.slideIndex].id, 'liar-score-1');
  assert.equal(revealTransition({ scored: true }).timers.length, 0);
});

test('reset cancels a pending liar reveal transition', async () => {
  const transition = revealTransition();
  transition.state.presentation.resetAt = 2;
  await transition.timers[0].callback();
  assert.deepEqual(transition.calls, []);
});
