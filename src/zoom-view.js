import { escapeHtml as escape, TEAM_NAMES } from './event-model.js';
import { ZOOM_LEVELS } from './zoom-model.js';

export function zoomEditor(questions, disabled, dirty) {
  return `<section class="zoom-editor" data-no-slide><h2>사진 확대 퀴즈</h2><p>사진 5장 · 40배 → 12배 → 4배 → 전체 사진 · 정답 한 개당 50점</p>
    <div class="zoom-editor-grid">${Object.entries(questions).map(([index, question]) => `<article class="zoom-editor-card">
      <h3>${Number(index) + 1}번 사진</h3><div class="zoom-editor-preview"><img src="${escape(question.image)}" alt="${Number(index) + 1}번 사진 미리보기"/><i data-zoom-marker="${index}" style="left:${question.focusX}%;top:${question.focusY}%"></i></div>
      <label>사진 교체<input type="file" data-zoom-image="${index}" accept="image/*" ${disabled ? 'disabled' : ''}/></label>
      <label>정답 메모<input data-zoom-answer="${index}" maxlength="100" value="${escape(question.answer)}" placeholder="진행자가 확인할 정답" ${disabled ? 'disabled' : ''}/></label>
      <label>확대 중심 가로<input type="range" data-zoom-focus-x="${index}" min="0" max="100" value="${question.focusX}" ${disabled ? 'disabled' : ''}/></label>
      <label>확대 중심 세로<input type="range" data-zoom-focus-y="${index}" min="0" max="100" value="${question.focusY}" ${disabled ? 'disabled' : ''}/></label>
    </article>`).join('')}</div><button class="button dark" data-action="zoom-save" ${disabled || !dirty ? 'disabled' : ''}>사진 설정 저장</button><span id="zoom-save-status" role="status">${dirty ? '저장 전 변경사항' : '설정된 사진으로 진행합니다'}</span>
    <p class="zoom-editor-note">오답자는 다음 사진부터 다시 참여합니다. 사진 설정은 다음 게임 시작 때 적용됩니다.</p></section>`;
}

export function zoomPresentation(game, questions, slide, now) {
  if (slide.view === 'intro') return `<section class="taste-screen zoom-intro"><span class="taste-eyebrow">RECREATION 03</span><h1>이 사진은<br/><em>무엇일까요?</em></h1><p>총 5문제 · 선착순 정답 요청 · 정답 한 개당 <b>50점</b></p></section>`;
  const question = game.questions?.[slide.questionIndex] ?? questions[slide.questionIndex];
  const round = game.rounds?.[slide.questionIndex] ?? {};
  const current = game.control?.questionIndex === slide.questionIndex;
  const phase = current ? game.control.phase : '';
  const verdict = round.verdict;
  const resolved = verdict?.correct || verdict?.skipped;
  const zoomStep = resolved ? ZOOM_LEVELS.length - 1 : current ? game.control.zoomStep : 0;
  const request = round.request;
  const person = game.roster?.[request?.participantId];
  const elapsed = Math.max(0, now - (verdict?.judgedAt ?? request?.submittedAt ?? now));
  const answering = current && phase === 'open' && request;
  const feedback = current && ['correct', 'wrong', 'skipped'].includes(phase);
  let notice = '';
  if (answering) notice = `<div class="zoom-notice is-request" role="status" style="--notice-delay:-${elapsed}ms"><span>정답 요청</span><strong>${escape(person?.name ?? '참가자')} 님</strong><p>${escape(TEAM_NAMES[person?.team] ?? '')} · 답을 말해주세요!</p></div>`;
  if (feedback) notice = `<div class="zoom-notice is-${phase}" role="status" style="--notice-delay:-${elapsed}ms"><strong>${phase === 'correct' ? '정답!' : phase === 'wrong' ? '오답!' : '다음 사진으로'}</strong><p>${phase === 'correct' ? `${escape(person?.name)} 님 · ${escape(TEAM_NAMES[person?.team])} +50점` : phase === 'wrong' ? '다른 참가자의 도전을 기다립니다' : '이번 사진은 정답자가 없습니다'}</p></div>`;
  return `<section class="zoom-screen" data-question="${slide.questionIndex}"><header><span>ZOOM QUIZ</span><strong>${String(slide.questionIndex + 1).padStart(2, '0')} / 05</strong><span>${ZOOM_LEVELS[zoomStep]}배 확대</span></header>
    <div class="zoom-photo-window"><img class="zoom-photo" src="${escape(question.image)}" alt="${slide.questionIndex + 1}번 확대 사진" draggable="false" style="--zoom:${ZOOM_LEVELS[zoomStep]};--focus-x:${question.focusX}%;--focus-y:${question.focusY}%"/>${notice}</div>
    <footer><div class="zoom-progress">${ZOOM_LEVELS.map((level, index) => `<i class="${index <= zoomStep ? 'is-shown' : ''}"></i>`).join('')}</div><p>${answering ? '선착순 답변 진행 중' : feedback ? '판정 결과' : '사진을 알겠다면 휴대폰에서 정답 제출을 눌러주세요'}</p></footer></section>`;
}

function zoomButton(label, action, game, disabled, tone = 'dark') {
  const control = game.control;
  const request = game.rounds?.[control.questionIndex]?.request;
  return `<button class="button ${tone}" data-zoom-action="${action}" data-round-id="${escape(control.roundId)}" data-question-index="${control.questionIndex}" data-request-id="${escape(request?.id)}" ${disabled ? 'disabled' : ''}>${label}</button>`;
}

export function zoomControls(game, slide, disabled) {
  if (slide.view === 'intro') return '<section class="remote-game-controls"><p>3번 줌아웃 · 5개 사진 · 정답마다 50점</p></section>';
  if (slide.view === 'score') return '';
  const control = game.control;
  if (!control || control.questionIndex !== slide.questionIndex) return '<section class="remote-game-controls"><p>다음 화면 버튼으로 현재 문제로 이동해주세요.</p></section>';
  const round = game.rounds?.[control.questionIndex] ?? {};
  const person = game.roster?.[round.request?.participantId];
  const answer = game.questions[control.questionIndex].answer;
  if (round.request && control.phase === 'open') return `<section class="remote-game-controls zoom-remote"><p class="zoom-answerer">${escape(person?.name)} 님이 정답 요청</p><p class="zoom-answer-hint">정답 메모 · ${escape(answer || '메모 없음')}</p><div class="zoom-judge-buttons">${zoomButton('정답', 'correct', game, disabled)}${zoomButton('오답', 'wrong', game, disabled, 'soft')}</div></section>`;
  if (control.phase !== 'open') return `<section class="remote-game-controls"><p>${control.phase === 'complete' ? '점수를 합산하고 있습니다' : '판정 애니메이션 후 자동으로 진행합니다'}</p></section>`;
  return `<section class="remote-game-controls zoom-remote"><p class="zoom-answer-hint">정답 메모 · ${escape(answer || '메모 없음')}</p><div class="zoom-control-buttons">${zoomButton('확대', 'in', game, disabled || control.zoomStep === 0, 'soft')}${zoomButton('줌아웃', 'out', game, disabled || control.zoomStep === ZOOM_LEVELS.length - 1)}</div><p>${ZOOM_LEVELS[control.zoomStep]}배 확대 · ${control.zoomStep} / 3 단계 공개</p>${zoomButton('정답자 없이 다음 사진', 'skip', game, disabled || control.zoomStep !== ZOOM_LEVELS.length - 1, 'soft')}</section>`;
}

export function zoomParticipant({ game, round, ready, participant, participantId, questionIndex, disabled, error }) {
  const control = game.control;
  const current = control?.questionIndex === questionIndex;
  const ownRequest = round.request?.participantId === participantId;
  let message = '사진 퀴즈를 준비하고 있습니다';
  if (current && round.request) message = ownRequest ? '정답 요청 완료! 답을 말해주세요' : '다른 참가자가 답변하고 있습니다';
  if (current && round.blocked) message = '다음 사진에서 다시 도전해주세요';
  if (current && control.phase === 'correct') message = ownRequest ? '정답! 우리 팀 +50점' : '정답이 나왔습니다';
  if (current && control.phase === 'wrong') message = ownRequest ? '아쉽지만 오답입니다' : '곧 다시 도전할 수 있습니다';
  if (current && ready && control.phase === 'open' && !round.request && !round.blocked) return `<main class="controller-main taste-mobile zoom-mobile is-voting" data-team="${escape(participant.team)}">${error}<button class="zoom-request-button" data-zoom-request ${disabled ? 'disabled' : ''}><small>${questionIndex + 1}번 사진</small><strong>정답 제출</strong><span>먼저 누른 한 명에게 답변 기회</span></button></main>`;
  return `<main class="controller-main taste-mobile zoom-mobile" data-team="${escape(participant.team)}">${error}<h1>${message}</h1></main>`;
}
