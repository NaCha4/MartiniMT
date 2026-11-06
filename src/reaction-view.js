import { TEAM_IDS, TEAM_NAMES, escapeHtml as escape } from './event-model.js';

export function reactionControls(game, slide, disabled) {
  const count = Object.keys(game.contestants ?? {}).length;
  if (slide.view === 'select') return `<section class="remote-game-controls"><p>${count} / 4개 조 출전 확정 · 1명부터 진행 가능</p></section>`;
  if (slide.view !== 'play') return '';
  if (game.control?.localTiming && !game.result) return `<section class="remote-game-controls">${game.control.phase === 'selecting' ? `<button class="button dark" data-action="reaction-signal" ${disabled || !count ? 'disabled' : ''}>터치 신호 보내기</button>` : `<p>${Object.keys(game.submissions ?? {}).length} / ${count}명 측정 완료</p>`}</section>`;
  if (game.result) return '<section class="remote-game-controls"><p>반응 시간 비교 완료 · 가장 빠른 팀 +100점</p></section>';
  if (game.winner) return '<section class="remote-game-controls"><p>첫 터치 확정 · 다음 화면에서 100점을 집계합니다.</p></section>';
  return `<section class="remote-game-controls">${game.control?.phase === 'selecting' ? `<button class="button dark" data-action="reaction-signal" ${disabled || !count ? 'disabled' : ''}>터치 신호 보내기</button>` : '<p>지금 터치하세요!</p>'}</section>`;
}

export function reactionPresentation(game, slide) {
  if (slide.view === 'intro') return '<section class="taste-screen liar-intro"><span class="taste-eyebrow">RECREATION 08</span><h1>순발력 측정</h1><div class="liar-rules"><p>각 조 <b>1명 출전</b> · 이전 게임 출전자 제외</p><p>검은 화면에서 신호를 기다려주세요.</p><p><b>지금 터치하세요!</b>가 나타나면 즉시 터치!</p><p>가장 짧은 반응 시간 <b>+100점</b> · 동률 모두 +100점</p></div></section>';
  if (slide.view === 'select') return `<section class="taste-screen liar-screen"><h1>순발력 고수를 찾습니다</h1><div class="liar-contestants">${TEAM_IDS.map(team => `<article class="liar-contestant" data-team="${team}"><span>${TEAM_NAMES[team]}</span><strong>${escape(game.contestants?.[team]?.name ?? '출전 대기')}</strong></article>`).join('')}</div><p class="liar-status">팀당 1명 · 이전 게임 미출전자 · 1명부터 진행 가능</p></section>`;
  if (game.result?.elapsedMs) return `<section class="reaction-screen reaction-results"><h1>순발력 측정 결과</h1><div class="liar-contestants">${Object.entries(game.contestants ?? {}).map(([team, person]) => `<article class="liar-contestant ${game.result.points[team] ? 'is-reaction-winner' : ''}" data-team="${team}"><span>${TEAM_NAMES[team]}</span><strong>${escape(person.name)}</strong><b>${(game.result.elapsedMs[team] / 1000).toFixed(3)}초</b>${game.result.points[team] ? '<b>+100점</b>' : ''}</article>`).join('')}</div></section>`;
  if (game.winner) {
    const person = game.contestants?.[game.winner.team];
    return `<section class="reaction-screen reaction-winner"><p>가장 빠른 터치</p><h1>${escape(TEAM_NAMES[game.winner.team])}</h1><p>${escape(person?.name)}</p><strong>+100점</strong></section>`;
  }
  return `<section class="reaction-screen ${game.control?.phase === 'open' ? 'is-open' : 'is-waiting'}" aria-label="${game.control?.phase === 'open' ? '지금 터치하세요!' : '터치 신호 대기'}">${game.control?.phase === 'open' ? '<h1>지금 터치하세요!</h1>' : ''}</section>`;
}

export function reactionParticipant({ game, slide, participant, participantId, ready, disabled, confirming, attempt, error = '' }) {
  const shell = content => `<main class="controller-main taste-mobile reaction-mobile" data-team="${escape(participant.team)}">${error}${content}</main>`;
  if (!ready) return shell('<h1>연결 중</h1>');
  const ownEntry = game.contestants?.[participant.team]?.participantId === participantId;
  if (ownEntry && game.result?.elapsedMs) return shell(`<h1>${(game.result.elapsedMs[participant.team] / 1000).toFixed(3)}초</h1><p>${game.result.points[participant.team] ? '가장 빠른 반응! +100점' : '측정 완료'}</p>`);
  if (slide.view === 'select' && game.control?.phase === 'selecting' && !game.excluded?.[participantId] && !game.contestants?.[participant.team]) {
    if (confirming) return shell(`<section class="liar-confirm" role="dialog" aria-modal="true" aria-labelledby="reaction-confirm-title"><h1 id="reaction-confirm-title">순발력 측정에 출전할까요?</h1><div><button class="button dark" data-reaction-action="reaction-confirm" ${disabled ? 'disabled' : ''}>예</button><button class="button soft" data-reaction-action="reaction-cancel" ${disabled ? 'disabled' : ''}>아니오</button></div></section>`);
    return shell(`<button class="liar-enter" data-reaction-action="reaction-volunteer" ${disabled ? 'disabled' : ''}><strong>출전하기</strong><span>이전 게임 미출전자만 참여</span></button>`);
  }
  if (slide.view === 'play' && !game.winner) {
    if (ownEntry && game.submissions?.[participant.team]) return shell('<h1>제출 완료</h1><p>모든 출전자의 반응 시간을 비교하고 있습니다</p>');
    if (ownEntry && attempt?.elapsedMs != null) return shell(`<button class="reaction-retry button dark" data-reaction-action="reaction-retry" ${disabled ? 'disabled' : ''}>측정값 다시 전송</button>`);
    if (ownEntry && game.control?.phase === 'open') return shell(`<button class="reaction-tap" data-reaction-action="reaction-tap" ${disabled ? 'disabled' : ''}><strong>지금 터치하세요!</strong></button>`);
    return shell('<div class="reaction-black" aria-label="터치 신호 대기"></div>');
  }
  const message = game.winner ? game.winner.participantId === participantId ? '가장 빠른 터치! +100점' : `${TEAM_NAMES[game.winner.team]} 승리` : game.excluded?.[participantId] ? '이전 게임 출전자는 참여할 수 없습니다' : ownEntry ? '출전 확정' : game.contestants?.[participant.team] ? '우리 조 출전자가 정해졌습니다' : '대기 중';
  return shell(`<h1>${message}</h1>`);
}
