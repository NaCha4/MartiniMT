import { TEAM_IDS } from './event-model.js';

export const YUT_WIDTH = 1000;
export const YUT_HEIGHT = 680;
export const YUT_WIN_POINTS = 300;
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

export function yutStacks(pieces) {
  const stacks = new Map();
  for (const [id, piece] of Object.entries(pieces ?? {})) {
    if (!stacks.has(piece.stack)) stacks.set(piece.stack, { id: piece.stack, team: id[0], x: piece.x, y: piece.y, ids: [] });
    stacks.get(piece.stack).ids.push(id);
  }
  return [...stacks.values()];
}

export function moveYutPiece(pieces, id, position) {
  if (!pieces?.[id] || !Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error('말의 위치를 확인해주세요.');
  let x = Math.round(Math.max(24, Math.min(YUT_WIDTH - 24, position.x)));
  let y = Math.round(Math.max(24, Math.min(YUT_HEIGHT - 24, position.y)));
  const moving = yutStacks(pieces).find(stack => stack.ids.includes(id));
  const stationary = yutStacks(pieces).filter(stack => stack.id !== moving.id);
  const distance = point => Math.hypot(point.x - x, point.y - y);
  const nearby = stationary.filter(stack => distance(stack) <= 42).sort((a, b) => distance(a) - distance(b))[0];
  const node = YUT_NODES.map(([x, y]) => ({ x, y })).filter(point => distance(point) <= 32).sort((a, b) => distance(a) - distance(b))[0];
  if (nearby || node) ({ x, y } = nearby ?? node);
  x = Math.round(x); y = Math.round(y);
  const next = Object.fromEntries(Object.entries(pieces).map(([key, piece]) => [key, { ...piece }]));
  const stacked = [...moving.ids];
  let captured = 0;
  for (const stack of stationary.filter(point => distance(point) <= 42)) {
    if (stack.team === moving.team) stacked.push(...stack.ids);
    else for (const key of stack.ids) { next[key] = yutHome(key); captured++; }
  }
  const leader = [...stacked].sort()[0];
  for (const key of stacked) next[key] = { x, y, stack: leader };
  return { pieces: next, captured, stackSize: stacked.length };
}

export function splitYutStack(pieces, id) {
  const stack = yutStacks(pieces).find(stack => stack.ids.includes(id));
  if (!stack || stack.ids.length < 2) return pieces;
  const released = [...stack.ids].sort().at(-1);
  return { ...pieces, [released]: { x: stack.x > YUT_WIDTH - 80 ? stack.x - 56 : stack.x + 56, y: stack.y < 72 ? stack.y + 48 : stack.y - 48, stack: released } };
}

export function yutPoints(team) {
  if (!TEAM_IDS.includes(team)) throw new Error('승리 팀을 선택해주세요.');
  return Object.fromEntries(TEAM_IDS.map(id => [id, id === team ? YUT_WIN_POINTS : 0]));
}
