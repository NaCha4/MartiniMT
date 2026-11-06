import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createYutPieces, moveYutPiece, splitYutStack, yutPoints, yutStacks, yutHome, YUT_NODES } from '../src/yut-model.js';
import { STAGES, stageIndex } from '../src/event-model.js';
import { scoreAward } from '../src/taste-model.js';
import { yutAward, yutPresentation } from '../src/yut-view.js';

test('yut appends a free board and four award screens without changing earlier stages', () => {
  const index = STAGES.findIndex(stage => stage.id === 'reaction-score');
  assert.equal(STAGES[stageIndex(index, 1)].id, 'yut-intro');
  assert.equal(YUT_NODES.length, 29);
  assert.equal(Object.keys(createYutPieces()).length, 16);
  assert.deepEqual(STAGES.filter(stage => stage.game === 'yut').map(stage => stage.screenCode), [68, 69, 70, 71, 72, 73, 74]);
  assert.match(yutPresentation({}, { view: 'intro' }), /300점/);
});

test('pieces move freely, stack together, split, and capture an entire opposing stack', () => {
  let pieces = moveYutPiece(createYutPieces(), 'A1', { x: 410, y: 310 }).pieces;
  assert.deepEqual(pieces.A1, { x: 410, y: 310, stack: 'A1' });
  pieces = moveYutPiece(pieces, 'A2', { x: 410, y: 310 }).pieces;
  assert.equal(yutStacks(pieces).find(stack => stack.id === 'A1').ids.length, 2);
  pieces = moveYutPiece(pieces, 'A1', { x: 500, y: 340 }).pieces;
  assert.deepEqual(pieces.A1, pieces.A2);
  pieces = splitYutStack(pieces, 'A1');
  assert.notEqual(pieces.A1.stack, pieces.A2.stack);
  pieces = moveYutPiece(pieces, 'B1', { x: 240, y: 80 }).pieces;
  pieces = moveYutPiece(pieces, 'B2', { x: 240, y: 80 }).pieces;
  const move = moveYutPiece(pieces, 'A1', { x: 240, y: 80 });
  assert.equal(move.captured, 2);
  assert.deepEqual(move.pieces.B1, yutHome('B1'));
  assert.deepEqual(move.pieces.B2, yutHome('B2'));
  assert.throws(() => moveYutPiece(pieces, 'A1', { x: NaN, y: 20 }));
});

test('a yut victory awards exactly 300 once and the ceremony retains shared ranks', () => {
  const points = yutPoints('C');
  assert.deepEqual(points, { A: 0, B: 0, C: 300, D: 0 });
  const scores = scoreAward(null, 'round', points, 10);
  assert.deepEqual(scoreAward(scores, 'round', points, 11), scores);
  const html = yutAward({ totals: { A: 50, B: 50, C: 300, D: 0 } }, 1, 1000);
  assert.match(html, /공동 2위/);
  assert.match(html, /1조/);
  assert.throws(() => yutPoints('E'));
});
