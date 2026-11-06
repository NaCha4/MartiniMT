import { TEAM_IDS, TEAM_NAMES, escapeHtml as escape } from './event-model.js';
import { MEMORY_PREVIEW_MS, MEMORY_FLIP_MS, MEMORY_MATCH_MS, MEMORY_MISS_MS, MEMORY_SYMBOLS, memoryPlayer, memoryCanFlip, memoryStandings, memoryLayouts } from './memory-model.js';

export function memoryControls(game, slide, disabled) {
  const count = Object.keys(game.contestants ?? {}).length;
  const control = slide.view === 'play' && game.control?.phase === 'selecting'
    ? `<button class="button dark" data-action="memory-start" ${disabled || !count ? 'disabled' : ''}>게임 시작</button>` : '';
  return `<section class="remote-game-controls">${control}<p>${slide.view === 'select' ? `${count} / 4개 조 출전 확정` : '12장 → 14장 → 16장 · 먼저 완주한 순서대로 150 / 100 / 50점'}</p></section>`;
}

function memoryBoard(player, { playing = false, disabled = true, now }) {
  const layout = player.layout;
  const started = Number.isFinite(player.roundStartedAt);
  const preview = started && now < player.roundStartedAt + MEMORY_PREVIEW_MS;
  return `<div class="memory-board" style="--memory-columns:${layout.length === 14 ? 7 : layout.length === 20 ? 5 : 4}">${layout.map((symbol, index) => {
    const flip = player.flips[index];
    const up = preview || player.faceUp.includes(index);
    const removed = player.matched.includes(index) || player.finishedAt !== null;
    const matching = player.pairMatches && player.faceUp.includes(index);
    const missing = player.faceUp.length === 2 && !player.pairMatches && player.faceUp.includes(index);
    const flipAt = up ? flip?.upAt : flip?.downAt ?? player.roundStartedAt + MEMORY_PREVIEW_MS;
    const duration = up ? MEMORY_FLIP_MS : 200;
    const flipping = started && !preview && now >= flipAt && now < flipAt + duration;
    const flipClass = flipping ? up ? 'is-up' : 'is-down' : '';
    const pairDelay = player.resolveAt - (matching ? MEMORY_MATCH_MS : MEMORY_MISS_MS) - now;
    return `<button class="memory-card ${up ? 'is-front' : ''} ${flipClass} ${removed ? 'is-removed' : ''} ${matching ? 'is-matching' : ''} ${missing ? 'is-missing' : ''}" ${playing ? `data-memory-card="${index}"` : 'tabindex="-1"'} aria-label="카드 ${index + 1}${up ? ` ${MEMORY_SYMBOLS[symbol]}` : ''}" ${disabled || !playing || !memoryCanFlip(player, index, now) ? 'disabled' : ''} style="--memory-flip-delay:${flipping ? flipAt - now : 0}ms;--memory-flip-duration:${duration}ms;--memory-pair-delay:${pairDelay}ms"><span class="memory-card-rotor"><span class="memory-card-front">${MEMORY_SYMBOLS[symbol]}</span><span class="memory-card-back">M<span>MEMORY</span></span></span></button>`;
  }).join('')}</div>`;
}

function playerStatus(player, now) {
  if (player.finishedAt !== null) return `완주 · ${((player.finishedAt - player.startedAt) / 1000).toFixed(2)}초`;
  if (!Number.isFinite(player.roundStartedAt)) return '게임 시작 대기';
  if (now < player.roundStartedAt + MEMORY_PREVIEW_MS) return `기억하세요! ${Math.ceil((player.roundStartedAt + MEMORY_PREVIEW_MS - now) / 1000)}`;
  return `${player.matched.length / 2} / ${player.layout.length / 2}쌍 · ${player.moves}번 도전`;
}

export function memoryPresentation(game, slide, now = Date.now()) {
  if (slide.view === 'intro') return `<section class="taste-screen memory-intro"><span class="taste-eyebrow">RECREATION 07</span><h1>기억의 한 수<br/><em>카드 뒤집기</em></h1><div class="memory-intro-cards" aria-hidden="true"><span>🍋</span><span>?</span><span>🍋</span></div><div class="liar-rules"><p><b>3초</b> 동안 기억하고, 같은 카드 두 장을 찾으세요.</p><p><b>12장 → 14장 → 16장</b> · 모두 맞추면 다음 라운드로!</p><p>모두 같은 고정 배치 · 각 조 1명 · 이전 출전자 제외</p><p>완주 순서대로 <b>150점 · 100점 · 50점</b></p></div></section>`;
  if (slide.view === 'select') return `<section class="taste-screen memory-select"><span class="taste-eyebrow">MEMORY MATCH</span><h1>새로운 기억력 고수를 찾습니다</h1><div class="liar-contestants">${TEAM_IDS.map(team => `<article class="liar-contestant" data-team="${team}"><span>${TEAM_NAMES[team]}</span><strong>${escape(game.contestants?.[team]?.name ?? '출전 대기')}</strong></article>`).join('')}</div><p class="liar-status">라이어·인간스톱워치·눈치 게임 출전자는 참여할 수 없습니다</p></section>`;
  const standings = memoryStandings(game, now);
  return `<section class="taste-screen memory-screen"><div class="memory-arena">${TEAM_IDS.map(team => {
    const person = game.contestants?.[team];
    const player = standings.find(entry => entry.team === team);
    if (!person) return `<article class="memory-lane is-empty" data-team="${team}"><h2>${TEAM_NAMES[team]}</h2><p>미출전</p></article>`;
    const rank = player.finishedAt !== null ? standings.indexOf(player) + 1 : null;
    return `<article class="memory-lane ${rank ? 'is-finished' : ''}" data-team="${team}"><header><h2>${TEAM_NAMES[team]} <strong>${escape(person.name)}</strong></h2><b>${rank ? `${rank}위` : `${player.roundIndex + 1} / 3`}</b></header>${memoryBoard(player, { now })}<footer>${rank ? `<b>${rank <= 3 ? `+${[150, 100, 50][rank - 1]}점` : '완주!'}</b>` : ''}<span>${now < player.roundStartedAt + MEMORY_PREVIEW_MS ? `${Math.ceil((player.roundStartedAt + MEMORY_PREVIEW_MS - now) / 1000)}초` : `${player.matched.length / 2} / ${player.layout.length / 2}`}</span></footer>${rank ? `<div class="memory-finish-ribbon">${rank}위 FINISH</div>` : ''}</article>`;
  }).join('')}</div></section>`;
}

export function memoryParticipant({ game, slide, participant, participantId, ready, disabled, confirming, error = '', now = Date.now() }) {
  const shell = content => `<main class="controller-main taste-mobile memory-mobile" data-team="${escape(participant.team)}">${error}${content}</main>`;
  if (!ready) return shell('<h1>연결 중</h1>');
  const ownEntry = game.contestants?.[participant.team]?.participantId === participantId;
  if (slide.view === 'select' && game.control?.phase === 'selecting' && !game.excluded?.[participantId] && !game.contestants?.[participant.team]) {
    if (confirming) return shell(`<section class="liar-confirm" role="dialog" aria-modal="true" aria-labelledby="memory-confirm-title"><h1 id="memory-confirm-title">세 라운드 모두 출전할까요?</h1><div><button class="button dark" data-memory-action="memory-confirm" ${disabled ? 'disabled' : ''}>예</button><button class="button soft" data-memory-action="memory-cancel" ${disabled ? 'disabled' : ''}>아니오</button></div></section>`);
    return shell(`<button class="liar-enter" data-memory-action="memory-volunteer" ${disabled ? 'disabled' : ''}><strong>출전하기</strong><span>이전 게임 미출전자만 참여</span></button>`);
  }
  if (ownEntry && slide.view === 'play' && game.control?.phase === 'running') {
    const player = memoryPlayer(game.events?.[participant.team], game.control.startedAt, now, memoryLayouts(game));
    if (player.finishedAt === null) return shell(`<section class="memory-personal-board"><header><h1>ROUND ${player.roundIndex + 1} <small>/ 3</small></h1><p aria-live="polite">${playerStatus({ ...player, startedAt: game.control.startedAt }, now)}</p></header>${memoryBoard(player, { playing: true, disabled, now })}<p class="memory-hint">같은 카드 두 장을 찾아주세요</p></section>`);
  }
  if (ownEntry && game.control?.startedAt) {
    const standings = memoryStandings(game, now), index = standings.findIndex(player => player.team === participant.team);
    const player = standings[index];
    if (player?.finishedAt !== null) return shell(`<section class="memory-personal-finish"><span>ALL CLEAR</span><h1>${index + 1}위 완주!</h1><strong>${index < 3 ? `+${[150, 100, 50][index]}점` : '수고하셨습니다'}</strong><p>${playerStatus({ ...player, startedAt: game.control.startedAt }, now)}</p></section>`);
  }
  const message = game.excluded?.[participantId] && slide.view === 'select' ? '이전 게임 출전자는 참여할 수 없습니다' : ownEntry ? '출전 확정 · 게임 시작 대기' : '카드 뒤집기 관전 중';
  return shell(`<h1>${message}</h1>`);
}
