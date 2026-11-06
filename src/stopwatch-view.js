import { TEAM_IDS, TEAM_NAMES, escapeHtml as escape } from './event-model.js';
import { STOPWATCH_COUNTDOWN_DURATION, STOPWATCH_RECORD_DURATION, STOPWATCH_TARGET_MS, formatStopwatchTime, roundStopwatchMs, stopwatchRevealFinished, stopwatchRevealProgress, stopwatchSubmitted } from './stopwatch-model.js';

export function stopwatchControls(game, slide, disabled) {
  const entries = Object.keys(game.contestants ?? {});
  const submitted = entries.filter(team => game.submissions?.[team]).length;
  let control = '';
  if (slide.view === 'play' && game.control?.phase === 'selecting') control = `<button class="button dark" data-action="stopwatch-start" ${disabled || !entries.length ? 'disabled' : ''}>게임 시작</button>`;
  if (slide.view === 'play' && game.control?.phase === 'running') control = `<button class="button dark" data-action="stopwatch-reveal" ${disabled || !stopwatchSubmitted(game) ? 'disabled' : ''}>결과 공개</button>`;
  const status = slide.view === 'select' ? `${entries.length} / 4개 조 출전 확정 · 1명부터 진행 가능` : slide.view === 'play' ? `${submitted} / ${entries.length}명 제출 완료` : '팀당 1명 · 라이어게임 출전자 제외 · 10초에 가장 가까운 팀 +100점';
  return `<section class="remote-game-controls">${control}<p>${status}</p></section>`;
}

export function stopwatchPresentation(game, slide, now = Date.now()) {
  if (slide.view === 'intro') return `<section class="taste-screen liar-intro"><span class="taste-eyebrow">RECREATION 05</span><h1>인간스톱워치</h1><div class="liar-rules"><p>각 조 6명 중 <b>1명 출전</b> · 라이어게임 출전자 제외</p><p>마음속으로 <b>10초</b>를 세고 카운트 종료!</p><p>모두 제출한 뒤 기록을 한 번에 공개합니다.</p><p>10초에 가장 가까운 팀 <b>+100점</b> · 동률 모두 +100점</p></div></section>`;
  const result = slide.view === 'play' ? game.result : null;
  const elapsed = result ? Math.max(0, now - result.revealedAt) : 0;
  const progress = result ? stopwatchRevealProgress(game, now) : 0;
  const revealStyle = `--stopwatch-reveal-delay:-${elapsed}ms;--stopwatch-count-step:${STOPWATCH_COUNTDOWN_DURATION / 3}ms;--stopwatch-record-delay:${STOPWATCH_COUNTDOWN_DURATION - elapsed}ms;--stopwatch-winner-delay:${STOPWATCH_COUNTDOWN_DURATION + STOPWATCH_RECORD_DURATION - elapsed}ms`;
  const status = slide.view === 'select' ? '휴대폰에서 출전을 신청해주세요 · 1명부터 진행 가능' : result ? '10초에 가장 가까운 팀 +100점 · 동률 모두 +100점' : game.control?.phase === 'running' ? '각자 10초를 세어주세요 · 모든 출전자 제출 후 결과 공개' : '리모컨에서 게임 시작을 눌러주세요';
  return `<section class="taste-screen liar-screen stopwatch-screen ${result ? `stopwatch-results ${stopwatchRevealFinished(game, now) ? 'is-settled' : 'is-revealing'}` : ''}" style="${revealStyle}"><header class="liar-heading"><span>HUMAN STOPWATCH</span><span>목표 <b>10.00초</b></span></header><h1>${slide.view === 'select' ? '출전자를 기다립니다' : result ? '기록 공개' : '인간스톱워치'}</h1><div class="stopwatch-board"><div class="liar-contestants">${TEAM_IDS.map(team => {
    const person = game.contestants?.[team];
    const winner = result?.points[team] === 100;
    const time = result && person ? roundStopwatchMs(result.elapsedMs[team]) : 0;
    return `<article class="liar-contestant stopwatch-contestant ${!person ? 'is-empty' : result ? winner ? 'is-winner' : 'is-loser' : game.submissions?.[team] ? 'is-submitted' : ''}" data-team="${team}"><div class="stopwatch-person"><span>${TEAM_NAMES[team]}</span><strong>${person ? escape(person.name) : '미출전'}</strong></div>${result && person ? `<div class="stopwatch-record"><span class="stopwatch-record-label">측정 기록</span><b class="stopwatch-time ${time >= 1000000 ? 'is-long-record' : ''}" aria-label="${formatStopwatchTime(time)}초"><span data-stopwatch-time="${time}">${formatStopwatchTime(time * progress)}</span><small>초</small></b><p class="stopwatch-error">목표와 ${formatStopwatchTime(Math.abs(time - STOPWATCH_TARGET_MS))}초 차이</p></div><div class="stopwatch-outcome">${winner ? '<b class="stopwatch-award">+100점</b>' : '<span>기록 확인</span>'}</div>` : person && slide.view === 'play' ? `<div class="stopwatch-waiting"><span class="stopwatch-mask" aria-hidden="true">--.--</span><b class="stopwatch-status">${game.submissions?.[team] ? '제출 완료' : '제출 대기'}</b></div>` : ''}</article>`;
  }).join('')}</div>${result ? `<div class="stopwatch-countdown" aria-hidden="true"><p>기록 공개</p><div>${[3, 2, 1].map((number, index) => `<b style="--step:${index}">${number}</b>`).join('')}</div></div>` : ''}</div><p class="liar-status">${status}</p></section>`;
}

export function stopwatchParticipant({ game, slide, participant, participantId, ready, disabled, confirming, attempt, canStop, error, now = Date.now() }) {
  const shell = content => `<main class="controller-main taste-mobile liar-mobile stopwatch-mobile" data-team="${escape(participant.team)}">${error}${content}</main>`;
  if (!ready) return shell('<h1>연결 중</h1>');
  const ownEntry = game.contestants?.[participant.team]?.participantId === participantId;
  const excluded = game.excluded?.[participantId];
  if (slide.view === 'select' && game.control?.phase === 'selecting' && !excluded && !game.contestants?.[participant.team]) {
    if (confirming) return shell(`<section class="liar-confirm" role="dialog" aria-modal="true" aria-labelledby="stopwatch-confirm-title"><h1 id="stopwatch-confirm-title">정말 출전하시겠습니까?</h1><div><button class="button dark" data-stopwatch-action="stopwatch-confirm" ${disabled ? 'disabled' : ''}>예</button><button class="button soft" data-stopwatch-action="stopwatch-cancel" ${disabled ? 'disabled' : ''}>아니오</button></div></section>`);
    return shell(`<button class="liar-enter" data-stopwatch-action="stopwatch-volunteer" ${disabled ? 'disabled' : ''}><strong>출전하기</strong><span>라이어게임 미출전자만 참여</span></button>`);
  }
  if (slide.view === 'play' && ownEntry && game.control?.phase === 'running' && !game.submissions?.[participant.team]) {
    const action = !attempt ? 'stopwatch-count-start' : attempt.elapsedMs === null ? 'stopwatch-count-stop' : 'stopwatch-submit';
    const label = !attempt ? '카운트 시작' : attempt.elapsedMs === null ? '카운트 종료' : '제출 다시 시도';
    if (attempt && attempt.elapsedMs === null && !canStop) return shell('<h1>마음속으로 세어주세요</h1>');
    return shell(`<button class="liar-enter" data-stopwatch-action="${action}" ${disabled ? 'disabled' : ''}><strong>${label}</strong><span>${!attempt ? '누른 순간부터 시간을 측정합니다' : '10초라고 생각되는 순간 눌러주세요'}</span></button>`);
  }
  if (game.result && ownEntry) {
    if (!stopwatchRevealFinished(game, now)) return shell('<p>기록 공개 중</p><h1>발표 화면을 확인해주세요</h1>');
    const winner = game.result.points[participant.team] === 100;
    return shell(`<section class="stopwatch-personal-result ${winner ? 'is-winner' : 'is-loser'}"><p>나의 기록</p><h1>${formatStopwatchTime(game.result.elapsedMs[participant.team])}<small>초</small></h1><b>${winner ? '+100점' : '기록 확인'}</b></section>`);
  }
  const message = game.submissions?.[participant.team] && ownEntry ? '제출 완료' : slide.view === 'select' && excluded ? '라이어게임 출전자는 참여할 수 없습니다' : slide.view === 'select' && ownEntry ? '출전 확정' : slide.view === 'select' && game.contestants?.[participant.team] ? '우리 조 출전자가 정해졌습니다' : '대기 중';
  return shell(`<h1>${message}</h1>`);
}
