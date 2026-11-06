import { TEAM_IDS } from './event-model.js';
import { emptyScores } from './taste-model.js';
import { liarUsedIds } from './liar-model.js';

export const NUMBER_ROUNDS = 3;
export const NUMBER_VALUES = Array.from({ length: 10 }, (_, index) => index + 1);
export const NUMBER_REVEAL_DURATION = 4200;

export function numberExcludedIds(liarGame, stopwatchGame) {
  return new Set([...liarUsedIds(liarGame ?? {}), ...Object.values(stopwatchGame?.contestants ?? {}).map(person => person.participantId)]);
}

export function numberSubmitted(game, round) {
  const entries = Object.entries(game.contestants ?? {});
  return entries.length > 0 && entries.every(([team, person]) => {
    const submission = round?.submissions?.[team];
    return submission?.participantId === person.participantId && submission.roundId === round.roundId && NUMBER_VALUES.includes(submission.value);
  });
}

export function numberOutcome(game, round) {
  if (!numberSubmitted(game, round)) throw { userMessage: '출전자 모두가 숫자를 제출한 뒤 공개해주세요.' };
  const values = Object.fromEntries(Object.keys(game.contestants).map(team => [team, round.submissions[team].value]));
  const counts = Object.values(values).reduce((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {});
  const highest = Math.max(0, ...Object.values(values).filter(value => counts[value] === 1));
  const points = emptyScores();
  for (const team of TEAM_IDS) if (values[team] === highest) points[team] = highest * 20;
  return { values, points };
}

export function numberRevealFinished(round, now = Date.now()) {
  return Number.isFinite(round?.result?.revealedAt) && now >= round.result.revealedAt + NUMBER_REVEAL_DURATION;
}

export function numberStatus(result, team) {
  const value = result.values[team];
  if (Object.values(result.values).filter(number => number === value).length > 1) return 'duplicate';
  return result.points[team] > 0 ? 'winner' : 'safe';
}
