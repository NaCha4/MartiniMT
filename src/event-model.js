export const ROOT = 'mtChatV1/sessions';
export const TEAM_IDS = ['A', 'B', 'C', 'D'];
export const MAX_MESSAGE = 1000;
export const STAGES = [
  { id: 'join', title: '참가자 입장', description: 'QR을 스캔한 뒤 등록된 이름을 입력하세요.' },
  { id: 'chat', title: '실시간 채팅', description: '휴대폰에서 보낸 메시지가 표시됩니다.' },
];
export function normalizedName(name) { return String(name ?? '').normalize('NFKC').replace(/\s/gu, '').toLocaleLowerCase('ko-KR'); }
export function nameKey(name) { return [...new TextEncoder().encode(normalizedName(name))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
export function initials(name) { return Array.from(name ?? '?')[0]; }
export function rosterFromInputs(rows, teamNames) {
  const participants = {}, nameIndex = {}, seen = new Set();
  for (const [team, names] of Object.entries(rows)) {
    if (!TEAM_IDS.includes(team)) throw new Error('조를 확인해주세요.');
    const teamName = String(teamNames[team] ?? `${team}조`).trim();
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
