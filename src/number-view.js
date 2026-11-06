import { TEAM_IDS, TEAM_NAMES, escapeHtml as escape } from './event-model.js';
import { NUMBER_ROUNDS, NUMBER_VALUES, numberRevealFinished, numberStatus, numberSubmitted } from './number-model.js';

export function numberControls(game, slide, disabled) {
  const count = Object.keys(game.contestants ?? {}).length;
  const round = game.rounds?.[slide.questionIndex];
  const phase = game.control?.questionIndex === slide.questionIndex ? game.control?.phase : null;
  let control = '';
  if (slide.view === 'play' && phase === 'selecting') control = `<button class="button dark" data-action="number-start" ${disabled || !count ? 'disabled' : ''}>게임 시작</button>`;
  if (slide.view === 'play' && phase === 'ready') control = `<button class="button dark" data-action="number-open" ${disabled ? 'disabled' : ''}>입력 시작</button>`;
  if (slide.view === 'play' && phase === 'open') control = `<button class="button dark" data-action="number-reveal" ${disabled || !numberSubmitted(game, round) ? 'disabled' : ''}>결과 공개</button>`;
  const status = slide.view === 'select' ? `${count} / 4개 조 출전 확정 · 같은 출전자로 3라운드 진행` : slide.view === 'play' ? `${Object.keys(round?.submissions ?? {}).length} / ${count}명 제출 완료 · ${slide.questionIndex + 1} / 3라운드` : '중복 숫자 탈락 · 가장 높은 단독 숫자 × 20점';
  return `<section class="remote-game-controls">${control}<p>${status}</p></section>`;
}

export function numberResultCaption(game, questionIndex) {
  const result = game.rounds?.[questionIndex]?.result;
  const winner = TEAM_IDS.find(team => result?.points[team] > 0);
  return `<header class="liar-result"><h1>${questionIndex === NUMBER_ROUNDS - 1 ? '눈치 게임 최종 점수' : `눈치 게임 ${questionIndex + 1}라운드 점수`}</h1><p>${winner ? `${TEAM_NAMES[winner]} · ${result.values[winner]} × 20 = +${result.points[winner]}점` : '모든 숫자가 중복되어 이번 라운드는 무득점'}${questionIndex === NUMBER_ROUNDS - 1 ? ' · 3라운드 완료' : ''}</p></header>`;
}

export function numberPresentation(game, slide, now = Date.now()) {
  if (slide.view === 'intro') return `<section class="taste-screen number-intro"><span class="taste-eyebrow">RECREATION 06</span><h1>눈치보고<br/><em>숫자 고르기</em></h1><div class="number-intro-values" aria-hidden="true">${[7, 10, 10, 9].map(value => `<b class="${value === 10 ? 'is-duplicate' : value === 9 ? 'is-winner' : ''}">${value}</b>`).join('')}</div><div class="liar-rules"><p>각 조 <b>1명 출전</b> · 라이어·스톱워치 출전자 제외</p><p>1~10 중 하나 선택 · <b>중복 숫자는 탈락</b></p><p>남은 숫자 중 가장 높은 숫자 <b>× 20점</b></p><p>같은 출전자로 <b>3라운드</b> · 탈락해도 다음 라운드 재도전</p></div></section>`;
  const round = game.rounds?.[slide.questionIndex];
  const result = slide.view === 'play' ? round?.result : null;
  const finished = numberRevealFinished(round, now);
  const elapsed = result ? Math.max(0, now - result.revealedAt) : 0;
  const phase = game.control?.questionIndex === slide.questionIndex ? game.control.phase : null;
  const status = slide.view === 'select' ? '휴대폰에서 출전을 신청해주세요 · 팀당 1명' : result ? '중복은 탈락! 가장 높은 단독 숫자가 승리합니다' : phase === 'open' ? '상대의 선택을 읽고, 휴대폰에서 숫자를 제출하세요' : '리모컨에서 입력을 시작하면 숫자를 고를 수 있습니다';
  const winner = result && TEAM_IDS.find(team => result.points[team] > 0);
  return `<section class="taste-screen number-screen ${result ? `has-result ${finished ? 'is-settled' : 'is-revealing'}` : ''}" style="--number-elapsed:-${elapsed}ms"><header class="liar-heading"><span>READ THE ROOM</span><span>${slide.view === 'select' ? 'PLAYER SELECT' : `ROUND ${String(slide.questionIndex + 1).padStart(2, '0')} / 03`}</span></header><h1>${slide.view === 'select' ? '이번엔 누가 읽어낼까요?' : result ? '숫자를 공개합니다' : '크게 걸까, 안전하게 갈까?'}</h1><div class="number-track" aria-hidden="true">${NUMBER_VALUES.map(value => {
    const count = result ? Object.values(result.values).filter(number => number === value).length : 0;
    return `<div class="number-tile ${count > 1 ? 'is-duplicate' : winner && result.values[winner] === value ? 'is-winner' : count === 1 ? 'is-safe' : ''}" style="--number-delay:${1500 + value * 150 - elapsed}ms"><b>${value}</b><small>${result ? count > 1 ? `${count}명 중복` : count === 1 ? '단독 선택' : '선택 없음' : `${value * 20}점`}</small></div>`;
  }).join('')}</div><div class="number-contestants">${TEAM_IDS.map(team => {
    const person = game.contestants?.[team];
    const value = result?.values[team];
    const outcome = person && result ? numberStatus(result, team) : '';
    return `<article class="number-contestant ${!person ? 'is-empty' : outcome ? `is-${outcome}` : ''}" data-team="${team}" style="--number-delay:${1500 + (value ?? 0) * 150 - elapsed}ms"><span>${TEAM_NAMES[team]}</span><strong>${person ? escape(person.name) : '미출전'}</strong><div class="number-card"><b>${value ?? '?'}</b></div><p>${!person ? '출전자 대기' : result ? outcome === 'duplicate' ? '중복 · 이번 라운드 탈락' : outcome === 'winner' ? `최고 단독 숫자 · +${result.points[team]}점` : '단독 선택 · 아쉽게 통과' : round?.submissions?.[team] ? '선택 잠금 완료' : '비밀 숫자 선택 대기'}</p></article>`;
  }).join('')}</div>${result ? `<div class="number-countdown" aria-hidden="true">${[3, 2, 1].map((value, index) => `<b style="--count-delay:${index * 500 - elapsed}ms">${value}</b>`).join('')}</div><div class="number-verdict" role="status">${winner ? `${TEAM_NAMES[winner]} 승리! +${result.points[winner]}점` : '모두 겹쳤어요! 이번 라운드는 무득점'}</div>` : ''}<p class="liar-status">${status}</p></section>`;
}

export function numberParticipant({ game, slide, participant, participantId, ready, disabled, confirming, choice, error = '', now = Date.now() }) {
  const shell = content => `<main class="controller-main taste-mobile number-mobile" data-team="${escape(participant.team)}">${error}${content}</main>`;
  if (!ready) return shell('<h1>연결 중</h1>');
  const ownEntry = game.contestants?.[participant.team]?.participantId === participantId;
  const round = game.rounds?.[slide.questionIndex];
  if (slide.view === 'select' && game.control?.phase === 'selecting' && !game.excluded?.[participantId] && !game.contestants?.[participant.team]) {
    if (confirming) return shell(`<section class="liar-confirm" role="dialog" aria-modal="true" aria-labelledby="number-confirm-title"><h1 id="number-confirm-title">세 라운드 모두 출전할까요?</h1><div><button class="button dark" data-number-action="number-confirm" ${disabled ? 'disabled' : ''}>예</button><button class="button soft" data-number-action="number-cancel" ${disabled ? 'disabled' : ''}>아니오</button></div></section>`);
    return shell(`<button class="liar-enter" data-number-action="number-volunteer" ${disabled ? 'disabled' : ''}><strong>출전하기</strong><span>라이어·스톱워치 미출전자만 참여</span></button>`);
  }
  if (slide.view === 'play' && ownEntry && game.control?.questionIndex === slide.questionIndex && game.control.phase === 'open' && !round?.submitted && !round?.result) {
    return shell(`<section class="number-picker"><header><h1>나만의 숫자를 고르세요</h1><p>${slide.questionIndex + 1} / 3라운드 · 중복이면 탈락 · 최고 단독 숫자 × 20점</p></header><div class="number-options" role="group" aria-label="1부터 10까지 숫자 선택">${NUMBER_VALUES.map(value => `<button data-number-choice="${value}" aria-pressed="${choice === value}" ${disabled ? 'disabled' : ''}>${value}<small>${value * 20}점</small></button>`).join('')}</div><button class="button dark number-submit" data-number-action="number-submit" ${disabled || !NUMBER_VALUES.includes(choice) ? 'disabled' : ''}>${choice ? `${choice} 선택 확정` : '숫자를 선택해주세요'}</button><p>확정 후에는 바꿀 수 없습니다</p></section>`);
  }
  if (round?.result && ownEntry && slide.view !== 'select') {
    if (!numberRevealFinished(round, now)) return shell('<h1>두근두근, 숫자 공개 중</h1><p>발표 화면을 확인해주세요</p>');
    const outcome = numberStatus(round.result, participant.team);
    return shell(`<section class="number-personal-result is-${outcome}"><p>${slide.questionIndex + 1} / 3라운드 · 나의 숫자</p><h1>${round.result.values[participant.team]}</h1><b>${outcome === 'winner' ? `승리! +${round.result.points[participant.team]}점` : outcome === 'duplicate' ? '중복 숫자 · 이번 라운드 탈락' : '더 높은 단독 숫자가 있어요'}</b><p>${slide.questionIndex === NUMBER_ROUNDS - 1 ? '세 라운드를 모두 마쳤습니다' : '다음 라운드에 다시 도전하세요'}</p></section>`);
  }
  const message = slide.view === 'select' && game.excluded?.[participantId] ? '라이어·스톱워치 출전자는 참여할 수 없습니다' : slide.view === 'select' && ownEntry ? '출전 확정' : slide.view === 'select' && game.contestants?.[participant.team] ? '우리 조 출전자가 정해졌습니다' : ownEntry && round?.submitted ? '선택 잠금 완료' : ownEntry ? '입력 시작을 기다려주세요' : '눈치 게임 관전 중';
  return shell(`<h1>${message}</h1>${ownEntry && round?.submitted ? '<p>다른 사람의 숫자는 결과 공개 때 확인합니다</p>' : ''}`);
}
