export const ROOT = 'mtChatV1/sessions';
export const TEAM_IDS = ['A', 'B', 'C', 'D'];
export const TEAM_NAMES = { A: '1조', B: '2조', C: '3조', D: '4조' };
export const MAX_MESSAGE = 1000;
export const TOUCH_TITLE = '터치하세요!';
export const TOUCH_BODY = '선착순 터치';
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
];
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
export function stageIndex(index, direction) { return Math.max(0, Math.min(STAGES.length - 1, index + direction)); }
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
