import { emptyScores } from './taste-model.js';

export const OX_QUESTION_COUNT = 5;
export const OX_REVEAL_DURATION = 1000;
export const emptyOxQuestions = () => Object.fromEntries(Array.from({ length: OX_QUESTION_COUNT }, (_, index) => [index, { text: '', answer: '' }]));

export function oxQuestionsReady(questions) {
  return Array.from({ length: OX_QUESTION_COUNT }, (_, index) => questions?.[index])
    .every(question => typeof question?.text === 'string' && question.text.trim().length > 0
      && question.text.length <= 300 && ['O', 'X'].includes(question.answer));
}

export function oxSurvivors(round, answer) {
  return Object.fromEntries(Object.keys(round.eligible ?? {})
    .filter(id => round.eligible[id] === true && round.votes?.[id]?.answer === answer)
    .map(id => [id, true]));
}

export function oxPoints(game) {
  const points = emptyScores();
  for (const id of Object.keys(game.rounds?.[OX_QUESTION_COUNT - 1]?.result?.survivors ?? {})) {
    const team = game.roster?.[id]?.team;
    if (Object.hasOwn(points, team)) points[team] += 50;
  }
  return points;
}
