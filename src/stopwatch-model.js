import { TEAM_IDS } from './event-model.js';
import { emptyScores } from './taste-model.js';

export const STOPWATCH_TARGET_MS = 10000;
export const STOPWATCH_MIN_MS = 1000;
export const STOPWATCH_MAX_MS = 86400000;
export const STOPWATCH_COUNTDOWN_DURATION = 1500;
export const STOPWATCH_RECORD_DURATION = 1200;
export const STOPWATCH_REVEAL_DURATION = 3300;

export const roundStopwatchMs = elapsedMs => Math.round(elapsedMs / 10) * 10;
export const formatStopwatchTime = elapsedMs => (roundStopwatchMs(elapsedMs) / 1000).toFixed(2);

export function stopwatchRevealProgress(game, now) {
  return Math.min(1, Math.max(0, (now - game.result.revealedAt - STOPWATCH_COUNTDOWN_DURATION) / STOPWATCH_RECORD_DURATION));
}

export function stopwatchRevealFinished(game, now) {
  return Number.isFinite(game.result?.revealedAt) && now >= game.result.revealedAt + STOPWATCH_REVEAL_DURATION;
}

export function stopwatchSubmitted(game) {
  const entries = Object.entries(game.contestants ?? {});
  return entries.length > 0 && entries.every(([team, person]) => {
    const submission = game.submissions?.[team];
    return submission?.participantId === person.participantId && submission.roundId === game.control?.roundId
      && Number.isInteger(submission.elapsedMs) && submission.elapsedMs >= STOPWATCH_MIN_MS && submission.elapsedMs <= STOPWATCH_MAX_MS;
  });
}

export function stopwatchOutcome(game) {
  if (!stopwatchSubmitted(game)) throw { userMessage: '출전자 모두가 제출한 뒤 결과를 공개해주세요.' };
  const elapsedMs = Object.fromEntries(Object.keys(game.contestants).map(team => [team, game.submissions[team].elapsedMs]));
  const closest = Math.min(...Object.values(elapsedMs).map(value => Math.abs(roundStopwatchMs(value) - STOPWATCH_TARGET_MS)));
  const points = emptyScores();
  for (const team of TEAM_IDS) if (Math.abs(roundStopwatchMs(elapsedMs[team]) - STOPWATCH_TARGET_MS) === closest) points[team] = 200;
  return { elapsedMs, points };
}

// The monotonic local clock includes its time origin so a same-tab reload can resume.
// A completed measurement is saved before upload and reused unchanged on retries.
export function createStopwatchClock({ now = () => performance.timeOrigin + performance.now(), storage, minimumMs = STOPWATCH_MIN_MS, round = roundStopwatchMs } = {}) {
  const attempts = new Map();
  function read(key) {
    if (attempts.has(key)) return attempts.get(key);
    try {
      const value = JSON.parse(storage?.getItem(key) ?? 'null');
      if (Number.isFinite(value?.startedAt) && (value.elapsedMs === null || Number.isInteger(value.elapsedMs))) attempts.set(key, value);
    } catch { /* In-memory timing remains available when storage is restricted. */ }
    return attempts.get(key);
  }
  function save(key, value) {
    attempts.set(key, value);
    try { storage?.setItem(key, JSON.stringify(value)); } catch { /* Keep the local measurement. */ }
    return value;
  }
  return {
    read,
    start(key) { return read(key) ?? save(key, { startedAt: now(), elapsedMs: null }); },
    elapsed(key) { const attempt = read(key); return attempt ? attempt.elapsedMs ?? now() - attempt.startedAt : 0; },
    stop(key) {
      const attempt = read(key);
      if (!attempt) throw { userMessage: '카운트를 먼저 시작해주세요.' };
      if (attempt.elapsedMs !== null) return attempt.elapsedMs;
      const duration = now() - attempt.startedAt;
      if (duration < minimumMs) throw { userMessage: '카운트 시작 1초 후 종료할 수 있습니다.' };
      const elapsedMs = round(duration);
      if (elapsedMs > STOPWATCH_MAX_MS) throw { userMessage: '측정 가능 시간 24시간을 초과했습니다.' };
      save(key, { ...attempt, elapsedMs });
      return elapsedMs;
    },
  };
}
