import { TEAM_IDS } from './event-model.js';

export const ZOOM_QUESTION_COUNT = 5;
export const ZOOM_LEVELS = [40, 12, 4, 1];
export const ZOOM_FEEDBACK_DURATION = 2000;

export function zoomQuestionsReady(questions) {
  return Array.from({ length: ZOOM_QUESTION_COUNT }, (_, index) => questions?.[index]).every(question =>
    typeof question?.image === 'string' && question.image.length > 0 && question.image.length <= 1500000
    && typeof question.answer === 'string' && question.answer.length <= 100
    && Number.isFinite(question.focusX) && question.focusX >= 0 && question.focusX <= 100
    && Number.isFinite(question.focusY) && question.focusY >= 0 && question.focusY <= 100);
}

export function zoomPoints(game) {
  const points = Object.fromEntries(TEAM_IDS.map(team => [team, 0]));
  for (const round of Object.values(game.rounds ?? {})) {
    const verdict = round.verdict;
    const person = game.roster?.[verdict?.participantId];
    if (verdict?.correct && person && Object.hasOwn(points, person.team)) points[person.team] += 50;
  }
  return points;
}

export function judgeZoomRequest(game, requestId, correct, judgedAt) {
  const control = game?.control;
  const round = game?.rounds?.[control?.questionIndex];
  if (control?.phase !== 'open' || round?.request?.id !== requestId) return;
  const participantId = round.request.participantId;
  const verdict = { requestId, participantId, correct, judgedAt };
  const updatedRound = { ...round, verdict };
  if (!correct) updatedRound.blocked = { ...round.blocked, [participantId]: true };
  return {
    ...game,
    control: { ...control, phase: correct ? 'correct' : 'wrong', updatedAt: judgedAt },
    rounds: { ...game.rounds, [control.questionIndex]: updatedRound },
  };
}

export function finishZoomFeedback(game, roundId, questionIndex, requestId, now, attemptId, updatedAt) {
  const control = game?.control;
  const round = game?.rounds?.[questionIndex];
  const verdict = round?.verdict;
  if (control?.roundId !== roundId || control.questionIndex !== questionIndex
    || !['correct', 'wrong', 'skipped'].includes(control.phase) || verdict?.requestId !== requestId
    || now < verdict.judgedAt + ZOOM_FEEDBACK_DURATION) return;
  if (control.phase === 'wrong') {
    const { request, verdict, ...reopened } = round;
    return { ...game, control: { ...control, phase: 'open', attemptId, updatedAt }, rounds: { ...game.rounds, [questionIndex]: reopened } };
  }
  if (questionIndex === ZOOM_QUESTION_COUNT - 1) return { ...game, control: { ...control, phase: 'complete', updatedAt } };
  return {
    ...game,
    control: { ...control, questionIndex: questionIndex + 1, zoomStep: 0, phase: 'open', attemptId, updatedAt },
    rounds: { ...game.rounds, [questionIndex + 1]: { openedAt: updatedAt } },
  };
}
