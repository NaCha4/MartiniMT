import { writeFile } from 'node:fs/promises';

const s = "root.child('mtChatV1/sessions').child($session)";
const owner = `auth != null && ${s}.child('meta/ownerUid').val() === auth.uid`;
const pid = `${s}.child('devices').child(auth.uid).child('participantId').val()`;
const member = `auth != null && ${s}.child('devices').child(auth.uid).exists() && ${s}.child('bindings').child(${pid}).child('uid').val() === auth.uid`;
const active = `(${s}.child('stage/step').val() === 'join' || ${s}.child('stage/step').val() === 'chat')`;
const self = `${member} && ${pid} === $participant`;
const text = max => ({ '.validate': `newData.isString() && newData.val().length > 0 && newData.val().length <= ${max}` });
const timestamp = { '.validate': 'newData.isNumber() && newData.val() === now' };
const team = { '.validate': "newData.val() === 'A' || newData.val() === 'B' || newData.val() === 'C' || newData.val() === 'D'" };
const denyExtra = { '.validate': false };
const session = {
  '.read': owner,
  '.write': "auth != null && !data.exists() && newData.child('meta/ownerUid').val() === auth.uid && $session.matches(/^[A-Za-z0-9_-]{20}$/)",
  '.validate': "newData.hasChildren(['meta', 'stage'])",
  meta: {
    '.read': 'auth != null', '.write': owner, '.validate': "newData.hasChildren(['ownerUid', 'title', 'createdAt'])",
    ownerUid: { '.validate': 'newData.isString() && ((!data.exists() && newData.val() === auth.uid) || newData.val() === data.val())' },
    title: text(60), createdAt: { '.validate': 'newData.isNumber() && (newData.val() === data.val() || newData.val() === now)' }, '$other': denyExtra,
  },
  stage: {
    '.read': 'auth != null', '.write': owner, '.validate': "newData.hasChildren(['step', 'updatedAt'])",
    step: { '.validate': "newData.val() === 'setup' || newData.val() === 'join' || newData.val() === 'chat' || newData.val() === 'closed'" },
    updatedAt: timestamp, '$other': denyExtra,
  },
  participants: {
    '.write': owner,
    '$participant': {
      '.read': self,
      '.validate': "$participant.matches(/^[ABCD][1-6]$/) && newData.hasChildren(['name', 'team', 'teamName'])",
      name: text(24), team, teamName: text(20), '$other': denyExtra,
    },
  },
  nameIndex: {
    '.write': owner,
    '$nameKey': {
      '.read': `auth != null && ${active}`,
      '.validate': '$nameKey.length <= 192 && $nameKey.matches(/^[a-f0-9]+$/)',
      '$participant': { '.validate': "$participant.matches(/^[ABCD][1-6]$/) && newData.hasChildren(['name', 'teamName'])", name: text(24), teamName: text(20), '$other': denyExtra },
    },
  },
  bindings: {
    '$participant': {
      '.read': `${owner} || (auth != null && data.child('uid').val() === auth.uid)`,
      '.write': `${owner} || (auth != null && ${active} && !data.exists() && newData.exists() && newData.child('uid').val() === auth.uid && !${s}.child('devices').child(auth.uid).exists())`,
      '.validate': `newData.hasChildren(['uid','claimedAt']) && ${s}.child('participants').child($participant).exists() && newData.parent().parent().child('devices').child(newData.child('uid').val()).child('participantId').val() === $participant`,
      uid: text(128), claimedAt: timestamp, '$other': denyExtra,
    },
  },
  devices: {
    '$uid': {
      '.read': 'auth != null && auth.uid === $uid',
      '.write': `${owner} || (auth != null && auth.uid === $uid && ${active} && !data.exists() && newData.exists())`,
      '.validate': "newData.hasChildren(['participantId']) && newData.parent().parent().child('bindings').child(newData.child('participantId').val()).child('uid').val() === $uid",
      participantId: { '.validate': "newData.isString() && newData.val().matches(/^[ABCD][1-6]$/)" }, '$other': denyExtra,
    },
  },
  presence: {
    '$uid': {
      '.write': `${owner} && !newData.exists()`,
      '$connection': {
        '.write': `auth != null && auth.uid === $uid && (!newData.exists() || (${member} && newData.child('participantId').val() === ${pid}))`,
        '.validate': "newData.hasChildren(['participantId','connectedAt']) && $connection.matches(/^[A-Za-z0-9_-]{20}$/)",
        participantId: text(2), connectedAt: timestamp, '$other': denyExtra,
      },
    },
  },
  instructions: {
    '$participant': {
      '.read': self, '.write': owner, '.validate': "newData.hasChildren(['id','title','body','createdAt'])",
      id: text(20), title: text(80), body: text(500), createdAt: timestamp, '$other': denyExtra,
    },
  },
  responses: {
    '$participant': {
      '.read': self,
      '.write': `${self} && newData.exists() && newData.child('instructionId').val() === ${s}.child('instructions').child($participant).child('id').val()`,
      '.validate': "newData.hasChildren(['instructionId','acknowledgedAt'])",
      instructionId: text(20), acknowledgedAt: timestamp, '$other': denyExtra,
    },
  },
  sendState: {
    '$uid': {
      '.read': 'auth != null && auth.uid === $uid',
      '.write': `auth != null && auth.uid === $uid && ${member} && newData.exists() && (!data.exists() || data.child('lastSentAt').val() <= now - 1000)`,
      '.validate': "newData.hasChildren(['lastSentAt','lastMessageId'])",
      lastSentAt: timestamp, lastMessageId: text(20), '$other': denyExtra,
    },
  },
  messages: {
    '$channel': {
      '.read': `(${owner} || (${member} && ($channel === 'all' || ${s}.child('participants').child(${pid}).child('team').val() === $channel))) && query.orderByChild === 'sentAt' && query.limitToLast != null && query.limitToLast <= 100`,
      '.indexOn': ['sentAt'],
      '$messageId': {
        '.write': `${member} && ${s}.child('stage/step').val() === 'chat' && !data.exists() && newData.exists() && ($channel === 'all' || ${s}.child('participants').child(${pid}).child('team').val() === $channel)`,
        '.validate': `newData.hasChildren(['uid','participantId','name','team','teamName','text','sentAt']) && newData.child('uid').val() === auth.uid && newData.child('participantId').val() === ${pid} && newData.child('name').val() === ${s}.child('participants').child(${pid}).child('name').val() && newData.child('team').val() === ${s}.child('participants').child(${pid}).child('team').val() && newData.child('teamName').val() === ${s}.child('participants').child(${pid}).child('teamName').val() && (!${s}.child('sendState').child(auth.uid).exists() || ${s}.child('sendState').child(auth.uid).child('lastSentAt').val() <= now - 1000) && newData.parent().parent().parent().child('sendState').child(auth.uid).child('lastSentAt').val() === now && newData.parent().parent().parent().child('sendState').child(auth.uid).child('lastMessageId').val() === $messageId`,
        uid: text(128), participantId: text(2), name: text(24), team, teamName: text(20),
        text: { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 1000 && !newData.val().matches(/^[ ]*$/)' },
        sentAt: timestamp, '$other': denyExtra,
      },
    },
  },
  '$other': denyExtra,
};
await writeFile('database.rules.json', JSON.stringify({ rules: { '.read': false, '.write': false, mtChatV1: { sessions: { '$session': session } } } }, null, 2) + '\n');
