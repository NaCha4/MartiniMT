import { TEAM_IDS } from './event-model.js';

export const YUT_WIDTH = 1000;
export const YUT_HEIGHT = 680;
export const YUT_WIN_POINTS = 300;
export const YUT_DISPLAY_BOARD = { left: 45, right: 955, top: 45, bottom: 535 };
export const YUT_PIECE_IDS = TEAM_IDS.flatMap(team => [1, 2, 3, 4].map(number => `${team}${number}`));
export const YUT_NODES = [
  ...Array.from({ length: 5 }, (_, index) => [240 + index * 104, 80]),
  ...Array.from({ length: 5 }, (_, index) => [760, 80 + index * 104]),
  ...Array.from({ length: 5 }, (_, index) => [760 - index * 104, 600]),
  ...Array.from({ length: 5 }, (_, index) => [240, 600 - index * 104]),
  ...[1, 2, 3, 4, 5].map(index => [240 + index * 520 / 6, 80 + index * 520 / 6]),
  ...[1, 2, 4, 5].map(index => [760 - index * 520 / 6, 80 + index * 520 / 6]),
];

export function yutHome(id) {
  const team = TEAM_IDS.indexOf(id[0]), number = Number(id[1]) - 1;
  return { x: (team < 2 ? 60 : 875) + (number % 2) * 65, y: (team % 2 ? 460 : 170) + Math.floor(number / 2) * 65, stack: id };
}

export function createYutPieces() {
  return Object.fromEntries(YUT_PIECE_IDS.map(id => [id, yutHome(id)]));
}

export function isYutBoardPosition(position) {
  return position?.x >= 240 && position.x <= 760 && position.y >= 80 && position.y <= 600;
}

function nearestYutNode(position) {
  const node = [...YUT_NODES].sort((a, b) => Math.hypot(a[0] - position.x, a[1] - position.y) - Math.hypot(b[0] - position.x, b[1] - position.y))[0];
  return { x: Math.round(node[0]), y: Math.round(node[1]) };
}

export function normalizeYutPieces(pieces) {
  if (!pieces) return {};
  return Object.fromEntries(YUT_PIECE_IDS.map(id => [id, isYutBoardPosition(pieces[id])
    ? { ...pieces[id], ...nearestYutNode(pieces[id]) }
    : yutHome(id)]));
}

export function yutDisplayPosition(position, id) {
  if (!isYutBoardPosition(position)) return { x: 70 + TEAM_IDS.indexOf(id[0]) * 240 + (Number(id[1]) - 1) * 50, y: 626 };
  return {
    x: YUT_DISPLAY_BOARD.left + (position.x - 240) / 520 * (YUT_DISPLAY_BOARD.right - YUT_DISPLAY_BOARD.left),
    y: YUT_DISPLAY_BOARD.top + (position.y - 80) / 520 * (YUT_DISPLAY_BOARD.bottom - YUT_DISPLAY_BOARD.top),
  };
}

export function yutBoardPosition(position) {
  return {
    x: Math.round(240 + (position.x - YUT_DISPLAY_BOARD.left) / (YUT_DISPLAY_BOARD.right - YUT_DISPLAY_BOARD.left) * 520),
    y: Math.round(80 + (position.y - YUT_DISPLAY_BOARD.top) / (YUT_DISPLAY_BOARD.bottom - YUT_DISPLAY_BOARD.top) * 520),
  };
}

export function yutStacks(pieces) {
  const stacks = new Map();
  for (const [id, piece] of Object.entries(normalizeYutPieces(pieces))) {
    if (!stacks.has(piece.stack)) stacks.set(piece.stack, { id: piece.stack, team: id[0], x: piece.x, y: piece.y, ids: [] });
    stacks.get(piece.stack).ids.push(id);
  }
  return [...stacks.values()];
}

export function moveYutPiece(pieces, id, position) {
  if (!pieces?.[id] || !Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error('말의 위치를 확인해주세요.');
  pieces = normalizeYutPieces(pieces);
  const moving = yutStacks(pieces).find(stack => stack.ids.includes(id));
  if (!isYutBoardPosition(position)) return { pieces, captured: 0, stackSize: moving.ids.length };
  const { x, y } = nearestYutNode(position);
  const stationary = yutStacks(pieces).filter(stack => stack.id !== moving.id && isYutBoardPosition(stack));
  const next = Object.fromEntries(Object.entries(pieces).map(([key, piece]) => [key, { ...piece }]));
  const stacked = [...moving.ids];
  let captured = 0;
  for (const stack of stationary.filter(point => point.x === x && point.y === y)) {
    if (stack.team === moving.team) stacked.push(...stack.ids);
    else for (const key of stack.ids) { next[key] = yutHome(key); captured++; }
  }
  const leader = [...stacked].sort()[0];
  for (const key of stacked) next[key] = { x, y, stack: leader };
  return { pieces: next, captured, stackSize: stacked.length };
}

export function splitYutStack(pieces, id) {
  pieces = normalizeYutPieces(pieces);
  const stack = yutStacks(pieces).find(stack => stack.ids.includes(id));
  if (!stack || stack.ids.length < 2) return pieces;
  const released = [...stack.ids].sort().at(-1);
  return { ...pieces, [released]: yutHome(released) };
}

export function yutPoints(team) {
  if (!TEAM_IDS.includes(team)) throw new Error('승리 팀을 선택해주세요.');
  return Object.fromEntries(TEAM_IDS.map(id => [id, id === team ? YUT_WIN_POINTS : 0]));
}
