import { TEAM_IDS, TEAM_NAMES, escapeHtml as escape } from './event-model.js';
import { rankedTeams } from './taste-model.js';
import { YUT_NODES, YUT_WIN_POINTS } from './yut-model.js';

export function yutControls(game, slide, disabled) {
  if (slide.view === 'intro') return '<section class="remote-game-controls"><p>실물 윷으로 진행 · 말은 컴퓨터에서 이동합니다</p></section>';
  if (slide.view !== 'play') return '<section class="remote-game-controls"><p>최종 순위와 시상을 진행하고 있습니다.</p></section>';
  const winner = game.result?.winnerTeam;
  return `<section class="remote-game-controls yut-remote"><h2>${winner ? `${TEAM_NAMES[winner]} 승리 확정` : '승리 팀을 선택하세요'}</h2><p>선택하면 ${YUT_WIN_POINTS}점을 더하고 시상을 시작합니다.</p><div class="yut-winner-options">${TEAM_IDS.map(team => `<button class="button dark" data-action="yut-win-${team}" data-team="${team}" ${disabled || !game.control || (winner && winner !== team) ? 'disabled' : ''}>${TEAM_NAMES[team]}${winner === team ? ' · 최종 순위 보기' : ` 우승 +${YUT_WIN_POINTS}`}</button>`).join('')}</div></section>`;
}

export function yutPresentation(game, slide, disabled) {
  if (slide.view === 'intro') return `<section class="taste-screen yut-intro"><span class="taste-eyebrow">마지막 승부</span><h1>윷놀이</h1><div class="yut-intro-mark" aria-hidden="true">윷</div><div class="liar-rules"><p>윷은 직접 던지고, 말은 마우스로 움직입니다.</p><p>같은 팀 위에 놓아 업기 · 상대 말 위에 놓아 잡기</p><p>업은 말은 오른쪽 클릭으로 하나씩 분리합니다.</p><p>진행자가 고른 승리 팀 <b>+${YUT_WIN_POINTS}점</b></p></div></section>`;
  return `<section class="yut-screen" data-no-slide><div class="yut-heading"><div><span>마지막 승부</span><h1>윷놀이</h1></div><p>드래그로 이동 · 같은 팀 업기 · 상대 말 잡기 · 오른쪽 클릭으로 분리</p></div><div class="yut-table" data-yut-board data-yut-round="${escape(game.control?.roundId ?? '')}" aria-label="마우스로 말을 옮기는 윷놀이 판">
    <svg viewBox="0 0 1000 680" aria-hidden="true"><defs><radialGradient id="yut-board-glow"><stop stop-color="#c69b51" stop-opacity=".08"/><stop offset="1" stop-color="#c69b51" stop-opacity="0"/></radialGradient></defs><circle cx="500" cy="340" r="325" fill="url(#yut-board-glow)"/><path class="yut-track" d="M240 80H760V600H240Z M240 80L760 600 M760 80L240 600"/>${YUT_NODES.map(([x, y]) => `<circle class="yut-node ${x === 500 && y === 340 ? 'is-center' : ''}" cx="${x}" cy="${y}" r="${x === 500 && y === 340 ? 21 : 15}"/>`).join('')}${TEAM_IDS.map((team, index) => `<g class="yut-home" data-team="${team}"><rect x="${index < 2 ? 12 : 827}" y="${index % 2 ? 384 : 94}" width="160" height="194" rx="20"/><text x="${index < 2 ? 92 : 907}" y="${index % 2 ? 421 : 131}">${TEAM_NAMES[team]}</text></g>`).join('')}<text class="yut-board-center" x="500" y="407">마티니 MT</text></svg>
    <div class="yut-pieces" data-yut-pieces></div></div><div class="yut-footer"><p role="status" id="yut-status">${game.result ? `${TEAM_NAMES[game.result.winnerTeam]} 승리 · 최종 순위를 준비합니다` : disabled ? '연결을 기다리고 있습니다' : '팀마다 말 4개 · 이동 방향과 칸 수는 진행자가 결정합니다'}</p><span>우승 +${YUT_WIN_POINTS}점</span></div></section>`;
}

export function yutAward(scores, awardIndex, elapsed) {
  const standings = rankedTeams(scores?.totals);
  const entry = standings[awardIndex];
  const shared = standings.filter(team => team.rank === entry.rank).length > 1;
  const rank = `${shared ? '공동 ' : ''}${entry.rank}위`;
  const palette = ['gold', 'silver', 'bronze', 'honor'][Math.min(entry.rank, 4) - 1];
  return `<section class="final-award is-${palette}" data-award-team="${entry.team}" data-award-index="${awardIndex}" style="--award-elapsed:-${Math.max(0, elapsed)}ms"><div class="award-rings" aria-hidden="true"></div><div class="award-confetti" aria-hidden="true">${Array.from({ length: 28 }, (_, index) => `<i style="--i:${index};--x:${(index * 37 + 11) % 100}%;--delay:${index * 73}ms"></i>`).join('')}</div><p class="award-eyebrow">마티니 MT · 최종 시상</p><div class="award-medal" aria-hidden="true"><svg viewBox="0 0 180 190"><path d="M52 15H128V75Q128 119 90 131Q52 119 52 75Z"/><path d="M52 29H22V52Q22 82 56 86M128 29H158V52Q158 82 124 86M90 130V160M61 174H119M69 159H111"/></svg><b>${entry.rank}</b></div><h1>${rank}</h1><h2>${TEAM_NAMES[entry.team]}</h2><p class="award-score"><strong>${entry.score}</strong>점</p><p class="award-message">${entry.rank === 1 ? '오늘의 챔피언, 축하합니다!' : '함께해서 더 즐거웠던 오늘, 수고하셨습니다!'}</p><div class="award-progress">${standings.map((team, index) => `<span class="${index === awardIndex ? 'is-current' : index < awardIndex ? 'is-complete' : ''}">${TEAM_NAMES[team.team]}</span>`).join('')}</div></section>`;
}
