import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createYutPieces, moveYutPiece, splitYutStack, yutPoints, yutStacks, yutHome, YUT_NODES, YUT_DISPLAY_BOARD, normalizeYutPieces, yutDisplayPosition, yutBoardPosition } from '../src/yut-model.js';
import { STAGES, stageIndex } from '../src/event-model.js';
import { scoreAward } from '../src/taste-model.js';
import { yutAward, yutPresentation } from '../src/yut-view.js';

test('yut appends a free board and four award screens without changing earlier stages', () => {
  const index = STAGES.findIndex(stage => stage.id === 'reaction-score');
  assert.equal(STAGES[stageIndex(index, 1)].id, 'yut-intro');
  assert.equal(YUT_NODES.length, 29);
  assert.equal(YUT_DISPLAY_BOARD.right - YUT_DISPLAY_BOARD.left, YUT_DISPLAY_BOARD.bottom - YUT_DISPLAY_BOARD.top);
  assert.equal(Object.keys(createYutPieces()).length, 16);
  assert.deepEqual(STAGES.filter(stage => stage.game === 'yut').map(stage => stage.screenCode), [68, 69, 70, 71, 72, 73, 74]);
  assert.match(yutPresentation({}, { view: 'intro' }), /300점/);
});

test('pieces snap to board spaces, stack together, split, and capture an entire opposing stack', () => {
  let pieces = moveYutPiece(createYutPieces(), 'A1', { x: 500, y: 339 }).pieces;
  assert.deepEqual(pieces.A1, { x: 500, y: 340, stack: 'A1' });
  pieces = moveYutPiece(pieces, 'A2', { x: 500, y: 340 }).pieces;
  assert.equal(yutStacks(pieces).find(stack => stack.id === 'A1').ids.length, 2);
  pieces = moveYutPiece(pieces, 'A1', { x: 500, y: 340 }).pieces;
  assert.deepEqual(pieces.A1, pieces.A2);
  pieces = splitYutStack(pieces, 'A1');
  assert.notEqual(pieces.A1.stack, pieces.A2.stack);
  assert.deepEqual(pieces.A2, yutHome('A2'));
  pieces = moveYutPiece(pieces, 'B1', { x: 240, y: 80 }).pieces;
  pieces = moveYutPiece(pieces, 'B2', { x: 240, y: 80 }).pieces;
  const move = moveYutPiece(pieces, 'A1', { x: 240, y: 80 });
  assert.equal(move.captured, 2);
  assert.deepEqual(move.pieces.B1, yutHome('B1'));
  assert.deepEqual(move.pieces.B2, yutHome('B2'));
  assert.throws(() => moveYutPiece(pieces, 'A1', { x: NaN, y: 20 }));
});

test('off-board drops cannot place, stack, or capture pieces, including in the reserve', () => {
  const initial = createYutPieces();
  assert.deepEqual(moveYutPiece(initial, 'A1', yutHome('A2')).pieces, initial);
  assert.deepEqual(moveYutPiece(initial, 'A1', yutHome('B1')).pieces, initial);
  const onBoard = moveYutPiece(initial, 'A1', { x: 500, y: 340 }).pieces;
  for (const position of [{ x: 207, y: 340 }, { x: 793, y: 340 }, { x: 500, y: 47 }]) {
    assert.deepEqual(moveYutPiece(onBoard, 'A1', position).pieces, onBoard);
  }
  assert.deepEqual(moveYutPiece(onBoard, 'A1', { x: 220, y: 80 }).pieces.A1, { x: 240, y: 80, stack: 'A1' });
  const stacked = moveYutPiece(onBoard, 'A2', { x: 500, y: 340 }).pieces;
  const returned = moveYutPiece(stacked, 'A1', { x: 500, y: 650 }).pieces;
  assert.deepEqual(returned.A1, yutHome('A1'));
  assert.deepEqual(returned.A2, yutHome('A2'));
  assert.deepEqual(yutBoardPosition(yutDisplayPosition({ x: 240, y: 80 }, 'A1')), { x: 240, y: 80 });
  const legacy = { ...initial, A2: { ...initial.A1, stack: 'A1' } };
  assert.deepEqual(normalizeYutPieces(legacy), initial);
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
