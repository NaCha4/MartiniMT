import { emptyScores } from './taste-model.js';
import { memoryExcludedIds } from './memory-model.js';

export function reactionExcludedIds(liar, stopwatch, numbers, memory) {
  return new Set([...memoryExcludedIds(liar, stopwatch, numbers), ...Object.values(memory?.contestants ?? {}).map(person => person.participantId)]);
}

export function reactionOutcome(game) {
  const winner = game.winner;
  if (!winner || winner.roundId !== game.control?.roundId || game.contestants?.[winner.team]?.participantId !== winner.participantId) {
    throw { userMessage: '첫 터치 결과를 먼저 확인해주세요.' };
  }
  const points = emptyScores();
  points[winner.team] = 100;
  return points;
}
