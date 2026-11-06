export const ROOT = 'mtChatV1/sessions';
export const SINGLE_EVENT_ROOM = '-P5fQkxsEi5lgI-MdoDV';
export const TEAM_IDS = ['A', 'B', 'C', 'D'];
export const TEAM_NAMES = { A: '1조', B: '2조', C: '3조', D: '4조' };
export const MAX_MESSAGE = 1000;
export const TOUCH_TITLE = '터치하세요!';
export const TOUCH_BODY = '선착순 터치';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
// Keep these development screen codes stable and use the next unused code for new screens.
export const STAGES = [
  {
    id: 'join', screenCode: 1, step: 'join', title: '참가자 입장', description: 'QR을 스캔한 뒤 등록된 이름을 입력하세요.',
    script: '레크레이션은 모바일기기와 웹을 이용해서 진행합니다. QR코드를 통해 휴대폰을 웹과 동기화하면 모든걸 실시간으로 처리할 수 있습니다. 특히 선착순 게임에서 매우 공정하게 처리할 수 있는데요, 저요저요 하면서 손 들면 레크 진행자가 무작위로 뽑는 방식이 아닌, 정말로 가장 빠르게 누른 사람을 골라낼 수 있습니다. 이렇게 말이죠',
  },
  {
    id: 'touch', screenCode: 2, resultScreenCode: 3, step: 'join', title: '가장 먼저 터치하세요!', description: '휴대폰 화면을 터치하세요.',
    script: '이렇게 화면과 기기가 실시간으로 소통하면서 진행됩니다.\n바로 레크레이션 시작하겠습니다',
  },
  { id: 'taste-intro', screenCode: 4, game: 'whisky', view: 'intro', title: '취향을 읽어라', script: '첫 번째 게임은 취향을 읽어라입니다. 먼저 자신의 취향에 투표하고, 다음에는 가장 많은 사람이 선택했을 취향을 예상해주세요. 최다 득표 항목을 맞힌 사람 한 명당 팀에 10점이 추가됩니다.' },
  { id: 'taste-vote', screenCode: 5, game: 'whisky', view: 'vote', title: '위스키 취향 투표', script: '먼저 가장 좋아하는 위스키 종류를 선택해주세요. 취향 투표를 마친 뒤에는 가장 많은 표를 받았을 위스키를 예상해 다시 투표합니다.' },
  { id: 'taste-reveal', screenCode: 6, game: 'whisky', view: 'reveal', title: '정답자 공개', script: '어느 팀이 사람들의 취향을 가장 잘 읽었을까요? 정답자를 공개하겠습니다.' },
  { id: 'taste-score', screenCode: 7, game: 'whisky', view: 'score', title: '팀 점수', script: '정답자 한 명당 10점입니다. 팀별 점수와 현재 순위를 확인하겠습니다.' },
  { id: 'soju-vote', screenCode: 8, game: 'soju', view: 'vote', title: '소주 취향 투표', script: '이번에는 소주입니다. 참이슬, 처음처럼, 진로, 새로 중에서 자신의 취향에 투표해주세요. 이어서 가장 많은 표를 받았을 소주를 예상해 다시 투표합니다.' },
  { id: 'soju-reveal', screenCode: 9, game: 'soju', view: 'reveal', title: '정답자 공개', script: '가장 많은 사람의 소주 취향을 맞힌 정답자를 공개하겠습니다.' },
  { id: 'soju-score', screenCode: 10, game: 'soju', view: 'score', title: '팀 점수', script: '정답자 한 명당 10점을 누적합니다. 위스키와 소주 점수를 합친 현재 순위를 확인하겠습니다.' },
  { id: 'military-vote', screenCode: 11, game: 'military', view: 'vote', title: '육군·공군·해병대 투표', script: '이번에는 육군, 공군, 해병대입니다. 셋 중에서 선택한다면 어느 곳을 고를지 투표해주세요. 이어서 가장 많은 표를 받았을 곳을 예상해 다시 투표합니다.' },
  { id: 'military-reveal', screenCode: 12, game: 'military', view: 'reveal', title: '정답자 공개', script: '육군, 공군, 해병대 중 가장 많은 선택을 받은 곳을 맞힌 정답자를 공개하겠습니다.' },
  { id: 'military-score', screenCode: 13, game: 'military', view: 'score', title: '팀 점수', script: '정답자 한 명당 10점을 누적합니다. 세 가지 주제의 점수를 합친 현재 순위를 확인하겠습니다.' },
  { id: 'ox-intro', screenCode: 14, game: 'ox', view: 'intro', title: 'OX 퀴즈', script: '다음 게임은 OX 퀴즈입니다. 총 다섯 문제이며, 정답을 맞힌 사람만 다음 문제에 도전할 수 있습니다. 응답하지 않으면 탈락입니다. 마지막까지 살아남은 사람 한 명당 팀에 50점을 드립니다.' },
  ...Array.from({ length: 5 }, (_, questionIndex) => [
    { id: `ox-question-${questionIndex + 1}`, screenCode: 15 + questionIndex * 2, game: 'ox', view: 'question', questionIndex, title: `OX ${questionIndex + 1}번 문제`, script: `${questionIndex + 1}번 문제입니다. 문제를 듣고 휴대폰에서 O 또는 X를 선택해주세요. 선택은 한 번만 가능합니다.` },
    { id: `ox-reveal-${questionIndex + 1}`, screenCode: 16 + questionIndex * 2, game: 'ox', view: 'reveal', questionIndex, title: `OX ${questionIndex + 1}번 정답`, script: '응답이 마감되었습니다. 정답을 공개하겠습니다.' },
  ]).flat(),
  { id: 'ox-score', screenCode: 25, game: 'ox', view: 'score', title: 'OX 최종 점수', script: '다섯 문제를 모두 맞힌 최종 생존자 한 명당 팀에 50점을 더합니다. 누적 점수를 확인하겠습니다.' },
  ...Array.from({ length: 5 }, (_, questionIndex) => ({
    id: `ox-survivors-${questionIndex + 1}`, screenCode: 26 + questionIndex, game: 'ox', view: 'survivors', questionIndex,
    title: `OX ${questionIndex + 1}번 생존자`, script: '이번 문제에 도전한 사람들의 불이 켜져 있습니다. 결과를 공개하면 이번에 탈락한 사람의 불이 꺼집니다. 살아남은 사람은 다음 문제에 도전합니다.',
  })),
  { id: 'zoom-intro', screenCode: 31, game: 'zoom', view: 'intro', title: '사진 확대 퀴즈', script: '확대된 사진을 보고 무엇인지 맞혀주세요. 사진은 세 번에 걸쳐 전체 모습까지 공개됩니다. 정답 요청을 가장 먼저 누른 한 명에게 답변 기회가 주어집니다. 정답 한 개당 팀에 50점이 추가됩니다.' },
  ...Array.from({ length: 5 }, (_, questionIndex) => ({
    id: `zoom-question-${questionIndex + 1}`, screenCode: 32 + questionIndex, game: 'zoom', view: 'question', questionIndex,
    title: `사진 ${questionIndex + 1}번`, script: '사진의 정체를 알겠다면 정답 제출 버튼을 눌러주세요. 먼저 요청한 한 명만 답변합니다. 각 조는 사진마다 한 번만 요청할 수 있으며, 요청한 조는 다음 사진부터 다시 참여합니다.',
  })),
  { id: 'zoom-score', screenCode: 37, game: 'zoom', view: 'score', title: '사진 퀴즈 최종 점수', script: '다섯 장의 사진이 모두 공개되었습니다. 정답 한 개당 50점을 팀 점수에 합산하겠습니다.' },
  { id: 'liar-intro', screenCode: 38, game: 'liar', view: 'intro', title: '라이어게임', script: '각 조에서 최대 한 명씩 출전합니다. 한 명 이상 출전하면 진행할 수 있습니다. 처음 확정한 출전자가 세 라운드 모두 참여하며, 라이어는 매 라운드 무작위로 선정합니다. 차례대로 단어를 묘사한 뒤, 출전자를 제외한 모두가 라이어에게 투표합니다. 라이어가 공동 1위를 포함해 가장 많은 표를 받으면 나머지 세 팀에 각각 50점, 아니라면 라이어 팀에 150점입니다.' },
  ...Array.from({ length: 3 }, (_, questionIndex) => [
    { id: `liar-select-${questionIndex + 1}`, screenCode: 39 + questionIndex * 3, game: 'liar', view: 'select', questionIndex, title: `라이어 ${questionIndex + 1}라운드 출전자`, script: '처음 확정한 출전자가 세 라운드 모두 참여합니다. 각 조에서 한 명이 휴대폰을 누른 뒤 예를 선택해주세요.' },
    { id: `liar-play-${questionIndex + 1}`, screenCode: 40 + questionIndex * 3, game: 'liar', view: 'play', questionIndex, title: `라이어 ${questionIndex + 1}라운드`, script: '단어 전달을 누르면 출전자 중 한 명이 무작위 라이어가 됩니다. 출전자들은 휴대폰을 확인해주세요. 진행자가 한 명씩 차례로 묘사를 시킨 뒤 투표를 시작합니다. 출전자는 투표에 참여하지 않습니다. 투표 종료 후 득표를 확인하고 정답 공개를 눌러주세요. 라이어 공개가 끝나면 점수로 이동합니다.' },
    { id: `liar-score-${questionIndex + 1}`, screenCode: 41 + questionIndex * 3, game: 'liar', view: 'score', questionIndex, title: `라이어 ${questionIndex + 1}라운드 점수`, script: '라이어 적발 여부에 따른 점수를 합산하고 현재 순위를 확인하겠습니다.' },
  ]).flat(),
  { id: 'stopwatch-intro', screenCode: 48, game: 'stopwatch', view: 'intro', title: '인간스톱워치', script: '다음 게임은 인간스톱워치입니다. 각 조 6명 중 라이어게임에 출전하지 않은 한 명이 출전합니다. 카운트 시작을 누르고 마음속으로 10초를 센 뒤 카운트 종료를 눌러주세요. 10초에 가장 가까운 팀에 200점, 동률이면 해당 팀 모두 200점입니다.' },
  { id: 'stopwatch-select', screenCode: 49, game: 'stopwatch', view: 'select', title: '인간스톱워치 출전자', script: '각 조에서 라이어게임에 출전하지 않은 한 명이 출전을 신청해주세요. 테스트할 때는 한 명만 출전해도 다음으로 진행할 수 있습니다.' },
  { id: 'stopwatch-play', screenCode: 50, game: 'stopwatch', view: 'play', title: '인간스톱워치 진행', script: '게임 시작을 누르면 출전자에게 카운트 시작 버튼이 나타납니다. 각자 시작한 순간부터 10초를 세어 종료해주세요. 모든 출전자가 제출하면 결과 공개를 눌러 기록을 한 번에 공개합니다.' },
  { id: 'stopwatch-score', screenCode: 51, game: 'stopwatch', view: 'score', title: '인간스톱워치 점수', script: '10초에 가장 가까운 팀에 200점을 더합니다. 동률이면 해당 팀 모두에게 200점을 더합니다.' },
  { id: 'number-intro', screenCode: 52, game: 'number', view: 'intro', title: '눈치보고 숫자 고르기', script: '다음 게임은 눈치보고 숫자 고르기입니다. 라이어와 인간스톱워치에 출전하지 않은 사람 중 각 조 한 명이 출전합니다. 1부터 10까지 숫자를 비밀리에 선택합니다. 중복 숫자는 탈락하고, 남은 숫자 중 가장 높은 숫자를 고른 팀이 숫자 곱하기 20점을 받습니다. 같은 출전자로 세 번 진행하며 매 라운드 모두 다시 참여합니다. 모두 중복이면 해당 라운드는 무득점입니다.' },
  { id: 'number-select', screenCode: 53, game: 'number', view: 'select', questionIndex: 0, title: '눈치 게임 출전자', script: '라이어와 인간스톱워치에 출전하지 않은 분 중 각 조 한 명이 출전해주세요. 이번 출전자로 세 라운드를 진행합니다.' },
  ...Array.from({ length: 3 }, (_, questionIndex) => [
    { id: `number-play-${questionIndex + 1}`, screenCode: 54 + questionIndex * 2, game: 'number', view: 'play', questionIndex, title: `눈치 게임 ${questionIndex + 1}라운드`, script: `${questionIndex + 1}라운드입니다. ${questionIndex === 0 ? '게임 시작을 누른 뒤 ' : ''}입력 시작을 누르면 출전자가 1부터 10까지 숫자를 고를 수 있습니다. 숫자를 고르고 선택 확정을 눌러주세요. 모두 제출하면 결과 공개를 누릅니다. 중복 숫자는 탈락하고 가장 높은 단독 숫자가 점수를 얻습니다.` },
    { id: `number-score-${questionIndex + 1}`, screenCode: 55 + questionIndex * 2, game: 'number', view: 'score', questionIndex, title: `눈치 게임 ${questionIndex + 1}라운드 점수`, script: questionIndex === 2 ? '세 라운드가 모두 끝났습니다. 마지막 라운드 점수를 합산한 최종 순위를 확인하겠습니다.' : '승리한 숫자 곱하기 20점을 합산합니다. 같은 출전자가 다음 라운드에 다시 도전합니다.' },
  ]).flat(),
  { id: 'memory-intro', screenCode: 60, game: 'memory', view: 'intro', title: '카드 뒤집기', script: '다음은 카드 뒤집기입니다. 라이어, 인간스톱워치, 눈치 게임에 출전하지 않은 분 중 각 조 한 명이 도전합니다. 3초 동안 카드를 기억한 뒤 같은 카드 두 장을 찾으세요. 12장, 14장, 16장의 세 라운드를 자동으로 이어갑니다. 모두 같은 배치이며 세 라운드를 먼저 끝낸 순서대로 200점, 100점, 50점입니다.' },
  { id: 'memory-select', screenCode: 61, game: 'memory', view: 'select', title: '카드 뒤집기 출전자', script: '각 조에서 새로운 출전자 한 명이 신청해주세요. 같은 출전자가 세 라운드 모두 도전합니다.' },
  { id: 'memory-play', screenCode: 62, game: 'memory', view: 'play', title: '카드 뒤집기 실시간 경기', script: '게임 시작을 누르면 모두 3초 동안 첫 배치를 확인합니다. 같은 카드를 찾으면 사라지고, 한 판을 끝내면 다음 라운드로 바로 넘어갑니다. 발표 화면에서 네 명의 플레이를 실시간으로 확인하세요.' },
  { id: 'memory-score', screenCode: 63, game: 'memory', view: 'score', title: '카드 뒤집기 최종 점수', script: '세 라운드를 완주한 순서대로 1위 200점, 2위 100점, 3위 50점입니다. 최종 누적 점수를 확인하겠습니다.' },
  { id: 'reaction-intro', screenCode: 64, game: 'reaction', view: 'intro', title: '순발력 측정', script: '다음은 순발력 측정입니다. 각 조에서 이전 게임에 출전하지 않은 한 명이 신청해주세요. 검은 화면에서 기다리다가 지금 터치하세요라는 신호가 나오면 즉시 터치합니다. 각 기기에 신호가 표시된 순간부터 터치까지의 반응 시간을 비교해 가장 빠른 팀에 100점을 드립니다. 밀리초 단위 동률은 모두 100점입니다.' },
  { id: 'reaction-select', screenCode: 65, game: 'reaction', view: 'select', title: '순발력 측정 출전자', script: '각 조에서 새로운 출전자 한 명이 신청해주세요. 한 명만 출전해도 테스트할 수 있습니다.' },
  { id: 'reaction-play', screenCode: 66, game: 'reaction', view: 'play', title: '순발력 측정 진행', script: '출전자는 검은 화면에서 기다려주세요. 원하는 순간 터치 신호 보내기를 누르면 참가자 화면에 지금 터치하세요가 나타납니다. 모두 터치하면 기기에서 측정한 반응 시간이 가장 짧은 팀이 100점을 얻습니다.' },
  { id: 'reaction-score', screenCode: 67, game: 'reaction', view: 'score', title: '순발력 측정 점수', script: '반응 시간이 가장 짧은 팀에 100점을 합산합니다. 동률인 팀은 모두 100점입니다.' },
];
// Append new stages so stored slide indices and existing screen codes stay valid.
const presentationOrder = STAGES.flatMap((stage, index) => {
  if (stage.game === 'liar' && stage.view === 'select' && stage.questionIndex > 0) return [];
  if (stage.view === 'survivors' || (stage.game === 'ox' && stage.view === 'reveal')) return [];
  if (stage.game === 'ox' && stage.view === 'question') return [index, STAGES.findIndex(candidate => candidate.view === 'survivors' && candidate.questionIndex === stage.questionIndex)];
  return [index];
});
export function participantUrl(href, room, networkUrl) {
  const url = new URL(href);
  if (networkUrl && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    const network = new URL(networkUrl);
    url.protocol = network.protocol;
    url.host = network.host;
  }
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', room);
  return url.href;
}
export function stageIndex(index, direction) {
  const stage = STAGES[index];
  // Saved sessions can still point at a later-round recruitment screen.
  if (stage?.game === 'liar' && stage.view === 'select' && stage.questionIndex > 0) {
    const play = STAGES.findIndex(candidate => candidate.game === 'liar' && candidate.view === 'play' && candidate.questionIndex === stage.questionIndex);
    return direction > 0 ? play : stageIndex(play, direction);
  }
  // Older sessions may still point at a separate OX answer stage.
  const current = stage?.game === 'ox' && stage.view === 'reveal'
    ? STAGES.findIndex(candidate => candidate.game === 'ox' && candidate.view === 'question' && candidate.questionIndex === stage.questionIndex)
    : index;
  const position = presentationOrder.indexOf(current);
  return presentationOrder[Math.max(0, Math.min(presentationOrder.length - 1, position + direction))];
}
export function instructionIsCurrent(instruction, stage) { return stage.step === 'join' && Number(instruction?.createdAt) >= Number(stage.updatedAt); }
export function touchRoundIsActive(instruction, stage) {
  return instructionIsCurrent(instruction, stage) && instruction?.title === TOUCH_TITLE && instruction?.body === TOUCH_BODY;
}
export function touchRoundResult(instruction, stage, presentation, participantId) {
  if (!touchRoundIsActive(instruction, stage) || presentation?.roundId !== instruction.id || !presentation.winnerId) return null;
  return presentation.winnerId === participantId ? 'winner' : 'closed';
}
export function firstTouch(responses, participants, roundId) {
  if (!roundId) return null;
  const entries = Object.entries(responses ?? {}).filter(([id, response]) => participants[id] && response.instructionId === roundId && Number.isFinite(response.acknowledgedAt));
  entries.sort((a, b) => a[1].acknowledgedAt - b[1].acknowledgedAt);
  if (!entries.length) return null;
  const [id, response] = entries[0];
  return { id, ...participants[id], receivedAt: response.acknowledgedAt };
}
export function normalizedName(name) { return String(name ?? '').normalize('NFKC').replace(/\s/gu, '').toLocaleLowerCase('ko-KR'); }
export function nameKey(name) { return [...new TextEncoder().encode(normalizedName(name))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
export function initials(name) { return Array.from(name ?? '?')[0]; }
export function rowsFromParticipants(participants = {}) {
  return Object.fromEntries(TEAM_IDS.map(team => [
    team,
    Array.from({ length: 6 }, (_, index) => participants[`${team}${index + 1}`]?.name ?? ''),
  ]));
}
export function readRosterDraft(serialized) {
  try {
    const draft = JSON.parse(serialized);
    const valid = TEAM_IDS.every(team => {
      const names = draft?.rows?.[team];
      return Array.isArray(names) && names.length === 6
        && names.every(name => typeof name === 'string' && name.length <= 24);
    });
    if (!valid) return null;
    return { rows: Object.fromEntries(TEAM_IDS.map(team => [team, draft.rows[team]])), pending: draft.pending === true };
  } catch { return null; }
}
export function rosterFromInputs(rows, teamNames = TEAM_NAMES) {
  const participants = {}, nameIndex = {}, seen = new Set();
  for (const [team, names] of Object.entries(rows)) {
    if (!TEAM_IDS.includes(team)) throw new Error('조를 확인해주세요.');
    const teamName = String(teamNames[team] ?? TEAM_NAMES[team]).trim();
    if (!teamName || teamName.length > 20) throw new Error('조 이름은 1~20자로 입력해주세요.');
    names.forEach((raw, index) => {
      const name = String(raw ?? '').trim().replace(/\s+/gu, ' ');
      if (!name) return;
      if (name.length > 24) throw new Error('참가자 이름은 24자 이내로 입력해주세요.');
      const key = nameKey(name);
      if (seen.has(`${team}:${key}`)) throw new Error(`${teamName}에 같은 이름이 있어요. 구분할 수 있는 이름으로 입력해주세요.`);
      seen.add(`${team}:${key}`);
      const id = `${team}${index + 1}`;
      participants[id] = { name, team, teamName };
      nameIndex[key] ??= {};
      nameIndex[key][id] = { name, teamName };
    });
  }
  if (!Object.keys(participants).length) throw new Error('참가자를 한 명 이상 등록해주세요.');
  return { participants, nameIndex };
}
export function messageText(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > MAX_MESSAGE) throw new Error('메시지는 1~1,000자로 입력해주세요.');
  return text;
}
export function onlineParticipants(presence) {
  return new Set(Object.values(presence ?? {}).flatMap(sessions => Object.values(sessions ?? {}).map(session => session.participantId)));
}
export function friendlyError(error) {
  const code = String(error?.code ?? '').toLowerCase();
  if (code.includes('operation-not-allowed') || code.includes('admin-restricted')) return 'Firebase 익명 로그인을 활성화해야 해요.';
  if (code.includes('permission') || code.includes('denied')) return '접근이 허용되지 않았어요. 이미 연결된 이름이거나 접근 설정을 확인해야 합니다.';
  if (code.includes('network')) return '네트워크 연결을 확인해주세요.';
  if (code.includes('configuration') || code.includes('invalid-api-key')) return 'Firebase 연결 설정을 확인해주세요.';
  return error?.userMessage ?? '처리하지 못했어요. 잠시 뒤 다시 시도해주세요.';
}
