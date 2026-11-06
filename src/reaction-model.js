import { emptyScores } from './taste-model.js';
import { memoryExcludedIds } from './memory-model.js';

export function reactionExcludedIds(liar, stopwatch, numbers, memory) {
  return new Set([...memoryExcludedIds(liar, stopwatch, numbers), ...Object.values(memory?.contestants ?? {}).map(person => person.participantId)]);
}

export function reactionOutcome(game) {
  if (game.control?.localTiming) {
    if (!reactionSubmitted(game)) throw { userMessage: '출전자 모두가 반응 시간을 제출한 뒤 결과를 확정합니다.' };
    const minimum = Math.min(...Object.keys(game.contestants).map(team => game.submissions[team].elapsedMs));
    const points = emptyScores();
    for (const team of Object.keys(game.contestants)) if (game.submissions[team].elapsedMs === minimum) points[team] = 100;
    return points;
  }
  const winner = game.winner;
  if (!winner || winner.roundId !== game.control?.roundId || game.contestants?.[winner.team]?.participantId !== winner.participantId) {
    throw { userMessage: '첫 터치 결과를 먼저 확인해주세요.' };
  }
  const points = emptyScores();
  points[winner.team] = 100;
  return points;
}

export function reactionSubmitted(game) {
  const entries = Object.entries(game.contestants ?? {});
  return entries.length > 0 && entries.every(([team, person]) => {
    const submission = game.submissions?.[team];
    return submission && submission.roundId === game.control?.roundId && submission.participantId === person.participantId
      && Number.isInteger(submission.elapsedMs) && submission.elapsedMs >= 0 && submission.elapsedMs <= 86400000;
  });
}
