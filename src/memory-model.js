import { TEAM_IDS } from './event-model.js';
import { emptyScores } from './taste-model.js';
import { numberExcludedIds } from './number-model.js';

export const MEMORY_PREVIEW_MS = 3000;
export const MEMORY_FLIP_MS = 180;
export const MEMORY_MATCH_MS = 450;
export const MEMORY_MISS_MS = 850;
export const MEMORY_SYMBOLS = ['🍋', '🍒', '🍇', '🍸', '🍊', '🥝', '🍓', '🍍', '🍉', '🥥'];
export const MEMORY_LAYOUTS = [
  [2, 5, 1, 4, 0, 3, 4, 1, 5, 0, 3, 2],
  [6, 2, 0, 3, 5, 1, 4, 2, 6, 4, 1, 5, 3, 0],
  [6, 2, 7, 0, 3, 5, 1, 4, 2, 6, 4, 1, 5, 3, 0, 7],
];
const LEGACY_MEMORY_LAYOUTS = [
  MEMORY_LAYOUTS[0],
  [6, 2, 7, 0, 3, 5, 1, 4, 2, 6, 4, 1, 5, 3, 0, 7],
  [3, 8, 1, 6, 9, 4, 0, 7, 2, 5, 6, 2, 4, 9, 1, 7, 5, 3, 8, 0],
];
export const memoryLayouts = game => game.control?.layoutVersion === 2 ? MEMORY_LAYOUTS : LEGACY_MEMORY_LAYOUTS;

export function memoryExcludedIds(liar, stopwatch, numbers) {
  return new Set([...numberExcludedIds(liar, stopwatch), ...Object.values(numbers?.contestants ?? {}).map(person => person.participantId)]);
}

export function memoryPlayer(events, startedAt, now = Date.now(), layouts = MEMORY_LAYOUTS) {
  const player = {
    roundIndex: 0, layout: layouts[0], roundStartedAt: startedAt, matched: [], faceUp: [], moves: 0,
    readyAt: startedAt + MEMORY_PREVIEW_MS, resolveAt: null, pairMatches: false,
    flips: {}, finishedAt: null, sequence: Object.keys(events ?? {}).length,
  };
  if (!Number.isFinite(startedAt)) return player;
  function settle(at) {
    if (player.resolveAt === null || at < player.resolveAt) return;
    if (player.pairMatches) player.matched.push(...player.faceUp);
    else for (const index of player.faceUp) player.flips[index].downAt = player.resolveAt;
    player.faceUp = [];
    if (player.matched.length === player.layout.length) {
      if (player.roundIndex === layouts.length - 1) player.finishedAt = player.resolveAt;
      else {
        player.roundIndex++;
        player.layout = layouts[player.roundIndex];
        player.roundStartedAt = player.resolveAt;
        player.matched = [];
        player.flips = {};
        player.readyAt = player.roundStartedAt + MEMORY_PREVIEW_MS;
      }
    }
    player.resolveAt = null;
    player.pairMatches = false;
  }
  for (const event of Object.values(events ?? {}).sort((a, b) => a.sequence - b.sequence)) {
    if (!Number.isFinite(event.at) || event.at > now) continue;
    settle(event.at);
    const layout = player.layout;
    if (player.finishedAt !== null || event.roundIndex !== player.roundIndex || event.at < player.readyAt
      || !Number.isInteger(event.cardIndex) || event.cardIndex < 0 || event.cardIndex >= layout.length
      || player.faceUp.includes(event.cardIndex) || player.matched.includes(event.cardIndex)) continue;
    player.faceUp.push(event.cardIndex);
    player.flips[event.cardIndex] = { upAt: event.at };
    player.readyAt = event.at + MEMORY_FLIP_MS;
    if (player.faceUp.length === 2) {
      player.moves++;
      player.pairMatches = layout[player.faceUp[0]] === layout[player.faceUp[1]];
      player.resolveAt = event.at + (player.pairMatches ? MEMORY_MATCH_MS : MEMORY_MISS_MS);
      player.readyAt = player.resolveAt;
    }
  }
  settle(now);
  return player;
}

export function memoryCanFlip(player, cardIndex, now) {
  return Number.isFinite(player.roundStartedAt) && player.finishedAt === null && now >= player.readyAt
    && Number.isInteger(cardIndex) && cardIndex >= 0 && cardIndex < player.layout.length
    && !player.matched.includes(cardIndex) && !player.faceUp.includes(cardIndex);
}

export function memoryStandings(game, now = Date.now()) {
  return Object.entries(game.contestants ?? {}).map(([team, person]) => ({
    team, ...person, ...memoryPlayer(game.events?.[team], game.control?.startedAt, now, memoryLayouts(game)),
  })).sort((a, b) => (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity) || TEAM_IDS.indexOf(a.team) - TEAM_IDS.indexOf(b.team));
}

export function memoryFinished(game, now = Date.now()) {
  const players = memoryStandings(game, now);
  return players.length > 0 && players.every(player => player.finishedAt !== null);
}

export function memoryOutcome(game, now = Date.now()) {
  if (!memoryFinished(game, now)) throw { userMessage: '모든 출전자가 세 라운드를 마친 뒤 점수를 반영합니다.' };
  const points = emptyScores();
  const results = {};
  memoryStandings(game, now).forEach((player, index) => {
    points[player.team] = [200, 100, 50, 0][index];
    results[player.team] = { rank: index + 1, finishedAt: player.finishedAt, moves: player.moves };
  });
  return { points, results };
}
