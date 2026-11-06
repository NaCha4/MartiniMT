import { TEAM_IDS, TEAM_NAMES, escapeHtml as escape } from './event-model.js';
import { rankedTeams } from './taste-model.js';
import { YUT_NODES, YUT_WIN_POINTS, yutDisplayPosition } from './yut-model.js';

export function yutControls(game, slide, disabled) {
  if (slide.view === 'intro') return '<section class="remote-game-controls"><p>실물 윷으로 진행 · 말은 컴퓨터에서 이동합니다</p></section>';
  if (slide.view !== 'play') return '<section class="remote-game-controls"><p>최종 순위와 시상을 진행하고 있습니다.</p></section>';
  const winner = game.result?.winnerTeam;
  return `<section class="remote-game-controls yut-remote"><h2>${winner ? `${TEAM_NAMES[winner]} 승리 확정` : '승리 팀을 선택하세요'}</h2><p>선택하면 ${YUT_WIN_POINTS}점을 더하고 시상을 시작합니다.</p><div class="yut-winner-options">${TEAM_IDS.map(team => `<button class="button dark" data-action="yut-win-${team}" data-team="${team}" ${disabled || !game.control || (winner && winner !== team) ? 'disabled' : ''}>${TEAM_NAMES[team]}${winner === team ? ' · 최종 순위 보기' : ` 우승 +${YUT_WIN_POINTS}`}</button>`).join('')}</div></section>`;
}

export function yutPresentation(game, slide, disabled) {
  if (slide.view === 'intro') return `<section class="taste-screen yut-intro"><span class="taste-eyebrow">마지막 승부</span><h1>윷놀이</h1><div class="yut-intro-mark" aria-hidden="true">윷</div><div class="liar-rules"><p>윷은 직접 던지고, 말은 마우스로 움직입니다.</p><p>같은 칸의 같은 팀은 업기 · 상대 말은 잡기</p><p>판 밖에 놓으면 제자리로 돌아옵니다.</p><p>오른쪽 클릭하면 업은 말 하나가 대기석으로 돌아갑니다.</p><p>진행자가 고른 승리 팀 <b>+${YUT_WIN_POINTS}점</b></p></div></section>`;
  return `<section class="yut-screen" data-no-slide><div class="yut-heading"><h1>윷놀이</h1><p>판 위에 놓기 · 같은 칸에서 업기와 잡기 · 오른쪽 클릭으로 한 말 대기석 복귀</p><span>우승 +${YUT_WIN_POINTS}점</span></div><div class="yut-table" data-yut-board data-yut-round="${escape(game.control?.roundId ?? '')}" aria-label="마우스로 말을 옮기는 윷놀이 판">
    <svg viewBox="0 0 1000 680" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="yut-board-wood" x2="1" y2="1"><stop stop-color="#30291f"/><stop offset=".5" stop-color="#211e19"/><stop offset="1" stop-color="#352b20"/></linearGradient></defs><rect class="yut-surface" x="20" y="20" width="960" height="535" rx="18" fill="url(#yut-board-wood)"/><rect class="yut-inner-frame" x="30" y="30" width="940" height="515" rx="12"/><path class="yut-track" d="M45 45H955V535H45Z M45 45L955 535 M955 45L45 535"/>${YUT_NODES.map(([x, y]) => { const point = yutDisplayPosition({ x, y }); return `<circle class="yut-node ${x === 500 && y === 340 ? 'is-center' : ''}" cx="${point.x}" cy="${point.y}" r="${x === 500 && y === 340 ? 18 : 13}"/>`; }).join('')}${TEAM_IDS.map((team, index) => `<g class="yut-home" data-team="${team}"><rect x="${30 + index * 240}" y="565" width="220" height="103" rx="12"/><text x="${140 + index * 240}" y="588">${TEAM_NAMES[team]} 대기석</text></g>`).join('')}<text class="yut-board-center" x="500" y="350">마티니 MT</text></svg>
    <div class="yut-pieces" data-yut-pieces></div></div><div class="yut-footer"><p role="status" id="yut-status">${game.result ? `${TEAM_NAMES[game.result.winnerTeam]} 승리 · 최종 순위를 준비합니다` : disabled ? '연결을 기다리고 있습니다' : '판 밖에 놓은 말은 원래 자리로 돌아갑니다'}</p></div></section>`;
}

export function yutAward(scores, awardIndex, elapsed) {
  const standings = rankedTeams(scores?.totals);
  const entry = standings[awardIndex];
  const shared = standings.filter(team => team.rank === entry.rank).length > 1;
  const rank = `${shared ? '공동 ' : ''}${entry.rank}위`;
  const palette = ['gold', 'silver', 'bronze', 'honor'][Math.min(entry.rank, 4) - 1];
  return `<section class="final-award is-${palette}" data-award-team="${entry.team}" data-award-index="${awardIndex}" style="--award-elapsed:-${Math.max(0, elapsed)}ms"><div class="award-rings" aria-hidden="true"></div><div class="award-confetti" aria-hidden="true">${Array.from({ length: 28 }, (_, index) => `<i style="--i:${index};--x:${(index * 37 + 11) % 100}%;--delay:${index * 73}ms"></i>`).join('')}</div><p class="award-eyebrow">마티니 MT · 최종 시상</p><div class="award-medal" aria-hidden="true"><svg viewBox="0 0 180 190"><path d="M52 15H128V75Q128 119 90 131Q52 119 52 75Z"/><path d="M52 29H22V52Q22 82 56 86M128 29H158V52Q158 82 124 86M90 130V160M61 174H119M69 159H111"/></svg><b>${entry.rank}</b></div><h1>${rank}</h1><h2>${TEAM_NAMES[entry.team]}</h2><p class="award-score"><strong>${entry.score}</strong>점</p><p class="award-message">${entry.rank === 1 ? '오늘의 챔피언, 축하합니다!' : '함께해서 더 즐거웠던 오늘, 수고하셨습니다!'}</p><div class="award-progress">${standings.map((team, index) => `<span class="${index === awardIndex ? 'is-current' : index < awardIndex ? 'is-complete' : ''}">${TEAM_NAMES[team.team]}</span>`).join('')}</div></section>`;
}
