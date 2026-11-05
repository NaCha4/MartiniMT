import { TEAM_IDS, TEAM_NAMES, escapeHtml as escape } from './event-model.js';
import { liarUsedIds, liarRosterReady } from './liar-model.js';

export function liarControls(game, slide, disabled, roster) {
  if (slide.view === 'intro') return `<section class="remote-game-controls"><p>${liarRosterReady(roster) ? '각 조 1명 · 매 라운드 다른 팀원 출전 · 총 3라운드' : '중복 없이 3회 출전하려면 각 조에 3명 이상 필요합니다.'}</p></section>`;
  const round = game.rounds?.[slide.questionIndex];
  if (slide.view === 'select') return `<section class="remote-game-controls"><p>${Object.keys(round?.contestants ?? {}).length} / 4개 조 출전 확정</p><p>참가자가 휴대폰에서 출전을 확인하면 이름이 표시됩니다.</p></section>`;
  if (slide.view === 'score' || !round) return '';
  const phase = game.control?.questionIndex === slide.questionIndex ? game.control.phase : 'finished';
  const actions = { selecting: ['단어 전달', 'liar-deal'], describing: ['투표', 'liar-vote'], voting: ['투표 종료', 'liar-finish'] };
  const action = actions[phase];
  return `<section class="remote-game-controls">${action ? `<button class="button dark" data-action="${action[1]}" ${disabled ? 'disabled' : ''}>${action[0]}</button>` : ''}<p>${phase === 'voting' ? `${Object.keys(round.votes ?? {}).length} / ${Object.keys(game.roster ?? {}).length - 4}명 투표` : phase === 'describing' ? '단어 전달 완료 · 돌아가며 묘사를 진행해주세요.' : ''}</p></section>`;
}

export function liarPresentation(game, slide) {
  if (slide.view === 'intro') return `<section class="taste-screen liar-intro"><span class="taste-eyebrow">RECREATION 04</span><h1>라이어게임</h1><div class="liar-rules"><p>각 조에서 새로운 팀원 <b>1명씩 출전</b></p><p>4명 중 1명에게는 단어가 전달되지 않습니다.</p><p>비출전자 투표로 라이어를 찾아주세요.</p><p>적발 성공 <b>나머지 세 팀 +50점</b> · 라이어 생존 <b>라이어 팀 +150점</b></p></div></section>`;
  const round = game.rounds?.[slide.questionIndex];
  const phase = game.control?.questionIndex === slide.questionIndex ? game.control.phase : 'finished';
  return `<section class="taste-screen liar-screen"><header class="liar-heading"><span>LIAR GAME</span><span>${slide.questionIndex + 1} / 3</span></header>
    <h1>${slide.view === 'select' ? '출전자를 기다립니다' : escape(round?.topic ?? '')}</h1>
    <div class="liar-contestants">${TEAM_IDS.map(team => {
      const person = round?.contestants?.[team];
      return `<article class="liar-contestant" data-team="${team}"><span>${TEAM_NAMES[team]}</span><strong>${person ? escape(person.name) : '출전 대기'}</strong></article>`;
    }).join('')}</div><p class="liar-status">${slide.view === 'select' ? '휴대폰을 누르고 출전을 확인해주세요' : phase === 'selecting' ? '단어 전달을 기다려주세요' : phase === 'describing' ? '차례대로 주어진 단어를 묘사해주세요' : phase === 'voting' ? '출전자를 제외한 모두가 라이어에게 투표해주세요' : '투표가 종료되었습니다'}</p></section>`;
}

export function liarResultCaption(game, index) {
  const round = game.rounds?.[index];
  const result = round?.result;
  if (!result) return '<header class="liar-result"><h1>결과 대기</h1></header>';
  const liar = Object.values(round?.contestants ?? {}).find(person => person.participantId === result?.liarId);
  return `<header class="liar-result"><span>${index + 1} / 3 ROUND</span><h1>${result?.caught ? '라이어 적발 성공' : '라이어 생존'}</h1><p>라이어 · ${escape(liar?.teamName)} ${escape(liar?.name)}</p></header>`;
}

export function liarParticipant({ game, round, slide, participant, participantId, ready, disabled, confirming, error }) {
  const contestants = round.contestants ?? {};
  const ownEntry = Object.values(contestants).some(person => person.participantId === participantId);
  const used = liarUsedIds(game).has(participantId);
  const current = game.control?.questionIndex === slide.questionIndex;
  const phase = current ? game.control.phase : '';
  const shell = content => `<main class="controller-main taste-mobile liar-mobile" data-team="${escape(participant.team)}">${error}${content}</main>`;
  if (slide.view === 'select' && phase === 'selecting' && !contestants[participant.team] && !used) {
    if (confirming) return shell(`<section class="liar-confirm" role="dialog" aria-modal="true" aria-labelledby="liar-confirm-title"><h1 id="liar-confirm-title">정말 출전하시겠습니까?</h1><div><button class="button dark" data-liar-action="liar-confirm" ${disabled || !ready ? 'disabled' : ''}>예</button><button class="button soft" data-liar-action="liar-cancel" ${disabled ? 'disabled' : ''}>아니오</button></div></section>`);
    return shell(`<button class="liar-enter" data-liar-action="liar-volunteer" ${disabled || !ready ? 'disabled' : ''}><strong>출전하기</strong><span>화면을 눌러주세요</span></button>`);
  }
  if (slide.view === 'play' && phase === 'voting' && !ownEntry && !round.vote) return shell(`<h1>라이어는 누구일까요?</h1><div class="mobile-vote-options liar-vote-options" role="group" aria-label="라이어 투표">${TEAM_IDS.map(team => {
    const person = contestants[team];
    return person ? `<button data-liar-vote="${escape(person.participantId)}" data-team="${team}" ${disabled || !ready ? 'disabled' : ''}><small>${TEAM_NAMES[team]}</small><strong>${escape(person.name)}</strong></button>` : '';
  }).join('')}</div>`);
  if (slide.view === 'play' && ownEntry && ['describing', 'voting'].includes(phase)) return shell(`<section class="liar-word"><p>내 단어</p><h1>${escape(round.card?.word ?? '')}</h1></section>`);
  const message = ownEntry && slide.view === 'select' ? '출전 확정' : slide.view === 'select' && used ? '이미 출전했습니다' : slide.view === 'select' && contestants[participant.team] ? '우리 조 출전자가 정해졌습니다' : phase === 'voting' && round.vote ? '투표 완료' : '대기 중';
  return shell(`<h1>${message}</h1>`);
}
