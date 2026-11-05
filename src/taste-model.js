import { TEAM_IDS } from './event-model.js';

export const WHISKY_OPTIONS = {
  peat: { label: '피트', order: 0 },
  sherry: { label: '셰리', order: 1 },
  bourbon: { label: '버번', order: 2 },
};
export const SOJU_OPTIONS = {
  chamisul: { label: '참이슬', order: 0 },
  chumchurum: { label: '처음처럼', order: 1 },
  jinro: { label: '진로', order: 2 },
  saero: { label: '새로', order: 3 },
};
export const MILITARY_OPTIONS = {
  army: { label: '육군', order: 0 },
  airforce: { label: '공군', order: 1 },
  marines: { label: '해병대', order: 2 },
};
export const TASTE_ROUNDS = {
  whisky: { path: 'tasteGame', options: WHISKY_OPTIONS },
  soju: { path: 'sojuGame', options: SOJU_OPTIONS },
  military: { path: 'militaryGame', options: MILITARY_OPTIONS },
};
export const REVEAL_INTERVAL = 140;
export const emptyScores = () => Object.fromEntries(TEAM_IDS.map(team => [team, 0]));

export function tasteOutcome(game) {
  const counts = Object.fromEntries(Object.keys(game.options).map(id => [id, 0]));
  for (const [id, vote] of Object.entries(game.preferenceVotes ?? {})) {
    if (game.roster[id] && Object.hasOwn(counts, vote.optionId)) counts[vote.optionId]++;
  }
  const maximum = Math.max(0, ...Object.values(counts));
  const topIds = Object.fromEntries(Object.keys(counts).filter(id => maximum > 0 && counts[id] === maximum).map(id => [id, true]));
  const correctIds = {}, points = emptyScores();
  for (const [id, vote] of Object.entries(game.predictionVotes ?? {})) {
    const person = game.roster[id];
    if (person && topIds[vote.optionId]) {
      correctIds[id] = true;
      points[person.team] += 10;
    }
  }
  return { counts, topIds, correctIds, points };
}

export function revealOrder(correctIds, random = Math.random) {
  const ids = Object.keys(correctIds ?? {});
  for (let index = ids.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [ids[index], ids[other]] = [ids[other], ids[index]];
  }
  return Object.fromEntries(ids.map((id, index) => [id, index]));
}

export function scoreAward(scores, roundId, points, awardedAt) {
  if (scores?.awards?.[roundId]) return scores;
  const before = { ...emptyScores(), ...scores?.totals };
  const after = Object.fromEntries(TEAM_IDS.map(team => [team, before[team] + (points[team] ?? 0)]));
  return {
    totals: after,
    awards: { ...scores?.awards, [roundId]: { before, after, points, awardedAt } },
  };
}

export function rankedTeams(scores = {}) {
  return TEAM_IDS.map(team => ({ team, score: scores[team] ?? 0 }))
    .sort((a, b) => b.score - a.score || TEAM_IDS.indexOf(a.team) - TEAM_IDS.indexOf(b.team))
    .map((entry, index, entries) => ({ ...entry, rank: 1 + entries.filter(other => other.score > entry.score).length, index }));
}

export function revealFinished(result, now) {
  return Boolean(result) && now >= result.revealedAt + Object.keys(result.order ?? {}).length * REVEAL_INTERVAL + 450;
}
