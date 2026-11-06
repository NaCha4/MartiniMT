import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, stageIndex } from '../src/event-model.js';
import { MEMORY_LAYOUTS, MEMORY_PREVIEW_MS, MEMORY_FLIP_MS, MEMORY_MATCH_MS, MEMORY_MISS_MS, memoryPlayer, memoryCanFlip, memoryOutcome, memoryExcludedIds, memoryFinished } from '../src/memory-model.js';
import { memoryPresentation, memoryParticipant } from '../src/memory-view.js';

function completedEvents(startedAt, delay = 0) {
  const events = {};
  let now = startedAt, sequence = 0;
  MEMORY_LAYOUTS.forEach((layout, roundIndex) => {
    now += MEMORY_PREVIEW_MS + delay;
    for (const symbol of new Set(layout)) {
      for (const cardIndex of layout.flatMap((value, index) => value === symbol ? [index] : [])) {
        events[sequence] = { sequence, roundIndex, cardIndex, at: now };
        sequence++;
        now += MEMORY_FLIP_MS;
      }
      now += MEMORY_MATCH_MS;
    }
  });
  return { events, now };
}

test('memory uses identical fixed 12, 16 and 20 card layouts with exactly two copies each', () => {
  assert.deepEqual(MEMORY_LAYOUTS.map(layout => layout.length), [12, 16, 20]);
  for (const layout of MEMORY_LAYOUTS) for (const symbol of new Set(layout)) assert.equal(layout.filter(value => value === symbol).length, 2);
  const previous = STAGES.findIndex(stage => stage.id === 'number-score-3');
  assert.equal(STAGES[stageIndex(previous, 1)].id, 'memory-intro');
  assert.deepEqual(STAGES.filter(stage => stage.game === 'memory').map(stage => stage.screenCode), [60, 61, 62, 63]);
});

test('memory excludes all previous representative games', () => {
  assert.deepEqual([...memoryExcludedIds({ rounds: { 0: { contestants: { A: { participantId: 'A1' } } } } }, { contestants: { A: { participantId: 'A2' } } }, { contestants: { A: { participantId: 'A3' } } })], ['A1', 'A2', 'A3']);
});

test('memory preview, turn animation and mismatch lock reject premature or duplicate flips', () => {
  const startedAt = 1000, firstAt = startedAt + MEMORY_PREVIEW_MS;
  let player = memoryPlayer({}, startedAt, firstAt - 1);
  assert.equal(memoryCanFlip(player, 0, firstAt - 1), false);
  const events = { 0: { sequence: 0, roundIndex: 0, cardIndex: 0, at: firstAt } };
  player = memoryPlayer(events, startedAt, firstAt);
  assert.deepEqual(player.faceUp, [0]);
  assert.equal(memoryCanFlip(player, 1, firstAt), false);
  assert.equal(memoryCanFlip(player, 0, firstAt + MEMORY_FLIP_MS), false);
  events[1] = { sequence: 1, roundIndex: 0, cardIndex: 1, at: firstAt + MEMORY_FLIP_MS };
  player = memoryPlayer(events, startedAt, firstAt + MEMORY_FLIP_MS);
  assert.deepEqual(player.faceUp, [0, 1]);
  assert.equal(memoryCanFlip(player, 2, player.readyAt - 1), false);
  const hiddenAt = firstAt + MEMORY_FLIP_MS + MEMORY_MISS_MS;
  assert.deepEqual(memoryPlayer(events, startedAt, hiddenAt).faceUp, []);
  assert.equal(memoryPlayer(events, startedAt, hiddenAt).flips[0].downAt, hiddenAt);
  events[2] = { sequence: 2, roundIndex: 2, cardIndex: 0, at: hiddenAt };
  assert.deepEqual(memoryPlayer(events, startedAt, hiddenAt).faceUp, [], 'cannot skip directly to a later round');
});

test('memory replays logs, removes pairs, advances rounds and ranks the three fastest finishers', () => {
  const startedAt = 1000, game = { control: { startedAt }, contestants: {}, events: {} };
  for (const [index, team] of ['A', 'B', 'C', 'D'].entries()) {
    game.contestants[team] = { participantId: `${team}4`, name: `${team}선수` };
    game.events[team] = completedEvents(startedAt, index * 100).events;
  }
  assert.equal(memoryFinished(game, startedAt), false);
  assert.equal(memoryFinished(game, 100000), true);
  const final = memoryPlayer(game.events.A, startedAt, 100000);
  assert.equal(final.roundIndex, 2);
  assert.equal(final.moves, 24);
  assert.equal(final.matched.length, 20);
  assert.deepEqual(memoryOutcome(game, 100000).points, { A: 200, B: 100, C: 50, D: 0 });
  assert.equal(memoryOutcome(game, 100000).results.D.rank, 4);
  assert.throws(() => memoryOutcome(game, startedAt));
  const html = memoryPresentation(game, { view: 'play' }, 100000);
  assert.equal((html.match(/class="memory-lane is-finished"/g) ?? []).length, 4);
  assert.match(html, /4위 FINISH/);
  assert.match(memoryParticipant({ game, slide: { view: 'play' }, participant: { team: 'B' }, participantId: 'B4', ready: true, now: 100000 }), /2위 완주/);
});

test('only flips after the preview affect the board and no third card opens during a pair', () => {
  const events = {
    0: { sequence: 0, roundIndex: 0, cardIndex: 3, at: 1000 },
    1: { sequence: 1, roundIndex: 0, cardIndex: 0, at: 4000 },
    2: { sequence: 2, roundIndex: 0, cardIndex: 11, at: 4200 },
    3: { sequence: 3, roundIndex: 0, cardIndex: 4, at: 4300 },
  };
  const player = memoryPlayer(events, 1000, 5000);
  assert.deepEqual(player.matched, [0, 11]);
  assert.deepEqual(player.faceUp, []);
  assert.equal(memoryCanFlip(player, 0, 5000), false);
});
