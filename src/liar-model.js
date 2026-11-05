import { TEAM_IDS } from './event-model.js';
import { emptyScores } from './taste-model.js';

export const LIAR_ROUND_COUNT = 3;

export function liarRosterReady(roster) {
  return TEAM_IDS.every(team => Object.values(roster ?? {}).filter(person => person.team === team).length >= LIAR_ROUND_COUNT);
}

export function liarUsedIds(game) {
  return new Set(Object.values(game.rounds ?? {}).flatMap(round => Object.values(round.contestants ?? {}).map(person => person.participantId)));
}

export function liarOutcome(round, liarId) {
  const contestants = Object.values(round.contestants ?? {});
  const counts = Object.fromEntries(contestants.map(person => [person.participantId, 0]));
  for (const [id, vote] of Object.entries(round.votes ?? {})) {
    if (!Object.hasOwn(counts, id) && Object.hasOwn(counts, vote.participantId)) counts[vote.participantId]++;
  }
  const maximum = Math.max(0, ...Object.values(counts));
  const topIds = Object.fromEntries(Object.keys(counts).filter(id => maximum > 0 && counts[id] === maximum).map(id => [id, true]));
  const caught = Boolean(topIds[liarId]);
  const liar = contestants.find(person => person.participantId === liarId);
  const points = emptyScores();
  if (liar) for (const team of TEAM_IDS) points[team] = caught ? (team === liar.team ? 0 : 50) : (team === liar.team ? 150 : 0);
  return { liarId, caught, counts, topIds, points };
}
