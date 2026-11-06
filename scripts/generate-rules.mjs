import { writeFile } from 'node:fs/promises';
import { STAGES } from '../src/event-model.js';

const s = "root.child('mtChatV1/sessions').child($session)";
const owner = `auth != null && ${s}.child('meta/ownerUid').val() === auth.uid`;
const manager = `auth != null && !${s}.child('devices').child(auth.uid).exists() && ${s}.child('managerBinding/uid').val() === auth.uid && ${s}.child('managerDevices').child(auth.uid).child('nameKey').val() === ${s}.child('managerBinding/nameKey').val() && ${s}.child('managerLookup').child(${s}.child('managerBinding/nameKey').val()).exists()`;
const controller = `(${owner}) || (${manager})`;
const pid = `${s}.child('devices').child(auth.uid).child('participantId').val()`;
const member = `auth != null && ${s}.child('devices').child(auth.uid).exists() && ${s}.child('bindings').child(${pid}).child('uid').val() === auth.uid`;
const active = `(${s}.child('stage/step').val() === 'join' || ${s}.child('stage/step').val() === 'chat')`;
const self = `${member} && ${pid} === $participant`;
const text = max => ({ '.validate': `newData.isString() && newData.val().length > 0 && newData.val().length <= ${max}` });
const timestamp = { '.validate': 'newData.isNumber() && newData.val() === now' };
const team = { '.validate': "newData.val() === 'A' || newData.val() === 'B' || newData.val() === 'C' || newData.val() === 'D'" };
const denyExtra = { '.validate': false };
const gameReader = `(${controller}) || (${member})`;
const storedTimestamp = { '.validate': 'newData.isNumber() && (newData.val() === data.val() || newData.val() === now)' };
const scoreMap = {
  '.validate': "newData.hasChildren(['A','B','C','D'])",
  '$team': { '.validate': "($team === 'A' || $team === 'B' || $team === 'C' || $team === 'D') && newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000 && newData.val() % 10 === 0" },
};
function tasteGameRules(path, voteIndex) {
  const game = `${s}.child('${path}')`;
  const correctIds = { '$participant': { '.validate': `newData.val() === true && ${game}.child('roster').child($participant).exists()` } };
  const topIds = { '$option': { '.validate': `newData.val() === true && ${game}.child('options').child($option).exists()` } };
  const ballot = kind => ({
    '$participant': {
      '.read': self,
      '.write': `${self} && ${s}.child('presentation/active').val() === true && ${s}.child('presentation/slideIndex').val() === ${voteIndex} && ${game}.child('control/phase').val() === '${kind}-open' && ${game}.child('roster').child($participant).exists() && !data.exists() && newData.exists()`,
      '.validate': "newData.hasChildren(['optionId','submittedAt'])",
      optionId: { '.validate': `newData.isString() && ${game}.child('options').child(newData.val()).exists()` },
      submittedAt: storedTimestamp, '$other': denyExtra,
    },
  });
  return {
    '.read': controller, '.write': controller,
    '.validate': `newData.hasChildren(['control','options','roster']) && newData.child('control/resetAt').val() === ${s}.child('presentation/resetAt').val()`,
    control: {
      '.read': gameReader, '.validate': "newData.hasChildren(['roundId','phase','updatedAt'])",
      roundId: text(20), resetAt: { '.validate': 'newData.isNumber()' },
      phase: { '.validate': "newData.val() === 'ready' || newData.val() === 'preference-open' || newData.val() === 'preference-closed' || newData.val() === 'prediction-open' || newData.val() === 'prediction-closed' || newData.val() === 'revealed'" },
      updatedAt: storedTimestamp, '$other': denyExtra,
    },
    options: {
      '.read': gameReader,
      '$option': {
        '.validate': "$option.matches(/^[a-z0-9_-]{1,30}$/) && newData.hasChildren(['label','order'])",
        label: text(40), order: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() < 12' }, '$other': denyExtra,
      },
    },
    roster: {
      '$participant': {
        '.validate': "$participant.matches(/^[ABCD][1-6]$/) && newData.hasChildren(['name','team','teamName'])",
        name: text(24), team, teamName: text(20), '$other': denyExtra,
      },
    },
    preferenceVotes: ballot('preference'),
    predictionVotes: ballot('prediction'),
    outcome: {
      '.validate': "newData.hasChildren(['counts','topIds','points'])",
      counts: { '$option': { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 24' } },
      topIds, correctIds, points: scoreMap, '$other': denyExtra,
    },
    result: {
      '.read': gameReader, '.validate': "newData.hasChildren(['topIds','points','revealedAt'])",
      topIds, correctIds, points: scoreMap,
      order: { '$participant': { '.validate': `newData.isNumber() && newData.val() >= 0 && newData.val() < 24 && ${game}.child('roster').child($participant).exists()` } },
      revealedAt: storedTimestamp, '$other': denyExtra,
    },
    '$other': denyExtra,
  };
}
const ox = `${s}.child('oxGame')`;
const oxQuestions = {
  '.validate': "newData.hasChildren(['0','1','2','3','4'])",
  '$question': {
    '.validate': "$question.matches(/^[0-4]$/) && newData.hasChildren(['text','answer'])",
    text: { '.validate': 'newData.isString() && newData.val().length <= 300' },
    answer: { '.validate': "newData.val() === '' || newData.val() === 'O' || newData.val() === 'X'" },
    '$other': denyExtra,
  },
};
const oxQuestionScreens = STAGES.map((stage, index) => stage.game === 'ox' && stage.view === 'question'
  ? `($question === '${stage.questionIndex}' && ${s}.child('presentation/slideIndex').val() === ${index})` : null).filter(Boolean).join(' || ');
const oxGameRules = {
  '.read': controller, '.write': controller,
  '.validate': `newData.hasChildren(['control','questions','roster','rounds']) && newData.child('control/resetAt').val() === ${s}.child('presentation/resetAt').val()`,
  control: {
    '.read': gameReader, '.validate': "newData.hasChildren(['roundId','questionIndex','phase','updatedAt'])",
    roundId: text(20), resetAt: { '.validate': 'newData.isNumber()' },
    questionIndex: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() < 5 && newData.val() % 1 === 0' },
    phase: { '.validate': "newData.val() === 'ready' || newData.val() === 'open' || newData.val() === 'closed' || newData.val() === 'revealed'" },
    updatedAt: storedTimestamp, '$other': denyExtra,
  },
  questions: oxQuestions,
  roster: tasteGameRules('oxGame', 0).roster,
  rounds: {
    '$question': {
      '.validate': "$question.matches(/^[0-4]$/) && newData.hasChild('prompt')",
      prompt: { '.read': gameReader, ...text(300) },
      eligible: { '$participant': { '.read': self, '.validate': "newData.val() === true && newData.parent().parent().parent().parent().child('roster').child($participant).exists()" } },
      votes: {
        '$participant': {
          '.read': self,
          '.write': `${self} && ${s}.child('presentation/active').val() === true && (${oxQuestionScreens}) && ${ox}.child('control/phase').val() === 'open' && ${ox}.child('control/questionIndex').val() + '' === $question && ${ox}.child('rounds').child($question).child('eligible').child($participant).val() === true && !data.exists() && newData.exists()`,
          '.validate': `newData.hasChildren(['answer','roundId','submittedAt']) && newData.child('roundId').val() === ${ox}.child('control/roundId').val()`,
          answer: { '.validate': "newData.val() === 'O' || newData.val() === 'X'" },
          roundId: text(20), submittedAt: storedTimestamp, '$other': denyExtra,
        },
      },
      result: {
        '.read': gameReader, '.validate': "newData.hasChildren(['answer','revealedAt'])",
        answer: { '.validate': "newData.val() === 'O' || newData.val() === 'X'" },
        survivors: { '$participant': { '.validate': `newData.val() === true && ${ox}.child('roster').child($participant).exists()` } },
        revealedAt: storedTimestamp, survivorsRevealedAt: storedTimestamp, '$other': denyExtra,
      },
      '$other': denyExtra,
    },
  },
  '$other': denyExtra,
};
const zoom = `${s}.child('zoomGame')`;
const zoomTeam = `${zoom}.child('roster').child(${pid}).child('team').val()`;
const zoomTeamUnblocked = Array.from({ length: 6 }, (_, index) =>
  `!${zoom}.child('rounds').child($question).child('blocked').child(${zoomTeam} + '${index + 1}').exists()`).join(' && ');
const zoomScreens = STAGES.map((stage, index) => stage.game === 'zoom' && stage.view === 'question'
  ? `($question === '${stage.questionIndex}' && ${s}.child('presentation/slideIndex').val() === ${index})` : null).filter(Boolean).join(' || ');
const zoomQuestions = {
  '.validate': "newData.hasChildren(['0','1','2','3','4'])",
  '$question': {
    '.validate': "$question.matches(/^[0-4]$/) && newData.hasChildren(['image','answer','focusX','focusY'])",
    image: { '.validate': "newData.isString() && newData.val().length > 0 && newData.val().length <= 1500000 && newData.val().matches(/^(data:image\\/(jpeg|png|webp);base64,|https:\\/\\/|\\/).*/)" },
    answer: { '.validate': 'newData.isString() && newData.val().length <= 100' },
    focusX: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 100' },
    focusY: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 100' },
    zoom: { '.validate': 'newData.isNumber() && newData.val() >= 2 && newData.val() <= 80' },
    '$other': denyExtra,
  },
};
const zoomGameRules = {
  '.read': controller, '.write': controller,
  '.validate': `newData.hasChildren(['control','questions','roster','rounds']) && newData.child('control/resetAt').val() === ${s}.child('presentation/resetAt').val()`,
  control: {
    '.read': gameReader,
    '.validate': "newData.hasChildren(['roundId','questionIndex','zoomStep','phase','attemptId','updatedAt'])",
    roundId: text(20), attemptId: text(20), resetAt: { '.validate': 'newData.isNumber()' },
    questionIndex: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() < 5 && newData.val() % 1 === 0' },
    zoomStep: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 3 && newData.val() % 1 === 0' },
    phase: { '.validate': "newData.val() === 'open' || newData.val() === 'correct' || newData.val() === 'wrong' || newData.val() === 'skipped' || newData.val() === 'complete'" },
    updatedAt: storedTimestamp, '$other': denyExtra,
  },
  questions: zoomQuestions,
  roster: tasteGameRules('zoomGame', 0).roster,
  rounds: {
    '$question': {
      '.validate': "$question.matches(/^[0-4]$/) && newData.hasChild('openedAt')",
      openedAt: storedTimestamp,
      blocked: { '$participant': { '.read': self, '.validate': `newData.val() === true && ${zoom}.child('roster').child($participant).exists()` } },
      request: {
        '.read': gameReader,
        '.write': `${member} && !data.exists() && newData.exists() && newData.child('participantId').val() === ${pid} && ${zoom}.child('roster').child(${pid}).exists() && ${s}.child('presentation/active').val() === true && (${zoomScreens}) && ${zoom}.child('control/questionIndex').val() + '' === $question && ${zoom}.child('control/phase').val() === 'open' && !${zoom}.child('rounds').child($question).child('blocked').child(${pid}).exists() && ${zoomTeamUnblocked} && newData.child('roundId').val() === ${zoom}.child('control/roundId').val() && newData.child('attemptId').val() === ${zoom}.child('control/attemptId').val() && ${zoom}.child('control/resetAt').val() === ${s}.child('presentation/resetAt').val()`,
        '.validate': "newData.hasChildren(['id','participantId','roundId','attemptId','submittedAt'])",
        id: text(20), participantId: { '.validate': `newData.isString() && ${zoom}.child('roster').child(newData.val()).exists()` },
        roundId: text(20), attemptId: text(20), submittedAt: storedTimestamp, '$other': denyExtra,
      },
      verdict: {
        '.read': gameReader,
        '.validate': "newData.hasChildren(['requestId','correct','judgedAt']) && (newData.child('skipped').val() === true || newData.hasChild('participantId'))",
        requestId: text(20), correct: { '.validate': 'newData.isBoolean()' },
        participantId: { '.validate': `newData.isString() && ${zoom}.child('roster').child(newData.val()).exists()` },
        skipped: { '.validate': 'newData.val() === true && newData.parent().child(\'correct\').val() === false' },
        judgedAt: storedTimestamp, '$other': denyExtra,
      },
      '$other': denyExtra,
    },
  },
  '$other': denyExtra,
};
const liar = `${s}.child('liarGame')`;
const liarRound = `${liar}.child('rounds').child($round)`;
const liarContestants = `${liarRound}.child('contestants')`;
const liarScreen = view => STAGES.map((stage, index) => stage.game === 'liar' && stage.view === view
  ? `($round === '${stage.questionIndex}' && ${s}.child('presentation/slideIndex').val() === ${index})` : null).filter(Boolean).join(' || ');
const liarIsContestant = id => ['A', 'B', 'C', 'D'].map(team => `${liarContestants}.child('${team}/participantId').val() === ${id}`).join(' || ');
const liarNotUsed = Array.from({ length: 3 }, (_, index) => `${liar}.child('rounds/${index}/contestants').child($team).child('participantId').val() !== ${pid}`).join(' && ');
const liarGameRules = {
  '.read': controller, '.write': controller,
  '.validate': `newData.hasChildren(['control','prompts','roster','rounds']) && newData.child('control/resetAt').val() === ${s}.child('presentation/resetAt').val()`,
  control: {
    '.read': gameReader, '.validate': "newData.hasChildren(['roundId','questionIndex','phase','updatedAt'])",
    roundId: text(20), resetAt: { '.validate': 'newData.isNumber()' },
    questionIndex: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() < 3 && newData.val() % 1 === 0' },
    phase: { '.validate': "newData.val() === 'selecting' || newData.val() === 'describing' || newData.val() === 'voting' || newData.val() === 'closed' || newData.val() === 'finished'" },
    updatedAt: storedTimestamp, '$other': denyExtra,
  },
  prompts: {
    '.validate': "newData.hasChildren(['0','1','2'])",
    '$round': { '.validate': "$round.matches(/^[0-2]$/) && newData.hasChildren(['topic','word'])", topic: text(40), word: text(100), '$other': denyExtra },
  },
  roster: { '$participant': { ...tasteGameRules('liarGame', 0).roster.$participant, '.read': self } },
  rounds: {
    '$round': {
      '.validate': "$round.matches(/^[0-2]$/) && newData.hasChildren(['roundId','topic'])",
      roundId: text(20), topic: { '.read': gameReader, ...text(40) },
      contestants: {
        '.read': gameReader,
        '$team': {
          '.write': `(${member}) && ${liar}.child('roster').child(${pid}).child('team').val() === $team && ${s}.child('presentation/active').val() === true && (${liarScreen('select')}) && ${liar}.child('control/phase').val() === 'selecting' && ${liar}.child('control/questionIndex').val() + '' === $round && newData.child('participantId').val() === ${pid} && newData.child('roundId').val() === ${liar}.child('control/roundId').val() && (${liarNotUsed}) && !data.exists() && newData.exists()`,
          '.validate': `($team === 'A' || $team === 'B' || $team === 'C' || $team === 'D') && newData.hasChildren(['participantId','name','team','teamName','roundId','selectedAt']) && newData.child('roundId').val() === newData.parent().parent().child('roundId').val() && newData.child('team').val() === $team && newData.child('name').val() === ${liar}.child('roster').child(newData.child('participantId').val()).child('name').val() && newData.child('team').val() === ${liar}.child('roster').child(newData.child('participantId').val()).child('team').val() && newData.child('teamName').val() === ${liar}.child('roster').child(newData.child('participantId').val()).child('teamName').val()`,
          participantId: text(2), name: text(24), team, teamName: text(20), roundId: text(20), selectedAt: storedTimestamp, '$other': denyExtra,
        },
      },
      secret: { '.validate': "newData.hasChild('liarId')", liarId: text(2), '$other': denyExtra },
      cards: { '$participant': { '.read': self, '.validate': "newData.hasChildren(['word','deliveredAt'])", word: { '.validate': 'newData.isString() && newData.val().length <= 100' }, deliveredAt: storedTimestamp, '$other': denyExtra } },
      votes: {
        '$participant': {
          '.read': self,
          '.write': `${self} && ${s}.child('presentation/active').val() === true && (${liarScreen('play')}) && ${liar}.child('control/phase').val() === 'voting' && ${liar}.child('control/questionIndex').val() + '' === $round && !(${liarIsContestant(pid)}) && newData.child('roundId').val() === ${liar}.child('control/roundId').val() && !data.exists() && newData.exists()`,
          '.validate': `newData.hasChildren(['participantId','roundId','submittedAt']) && (${liarIsContestant("newData.child('participantId').val()")}) && newData.child('roundId').val() === newData.parent().parent().child('roundId').val()`,
          participantId: text(2), roundId: text(20), submittedAt: storedTimestamp, '$other': denyExtra,
        },
      },
      tally: {
        '.read': gameReader, '.validate': "newData.hasChildren(['counts','closedAt'])",
        counts: { '$participant': { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 24 && newData.val() % 1 === 0' } },
        topIds: { '$participant': { '.validate': 'newData.val() === true' } },
        closedAt: storedTimestamp, '$other': denyExtra,
      },
      result: {
        '.read': gameReader, '.validate': "newData.hasChildren(['liarId','caught','counts','points','revealedAt'])",
        liarId: text(2), caught: { '.validate': 'newData.isBoolean()' },
        counts: { '$participant': { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 24 && newData.val() % 1 === 0' } },
        topIds: { '$participant': { '.validate': 'newData.val() === true' } },
        points: scoreMap, revealedAt: storedTimestamp, '$other': denyExtra,
      },
      '$other': denyExtra,
    },
  },
  '$other': denyExtra,
};
const stopwatch = `${s}.child('stopwatchGame')`;
const stopwatchScreen = view => STAGES.findIndex(stage => stage.game === 'stopwatch' && stage.view === view);
const stopwatchNotUsed = Array.from({ length: 3 }, (_, index) => `${liar}.child('rounds/${index}/contestants').child($team).child('participantId').val() !== ${pid}`).join(' && ');
const stopwatchEntry = `${stopwatch}.child('contestants').child($team)`;
const stopwatchGameRules = {
  '.read': controller, '.write': controller,
  '.validate': `newData.hasChildren(['control','roster']) && newData.child('control/resetAt').val() === ${s}.child('presentation/resetAt').val()`,
  control: {
    '.read': gameReader, '.validate': "newData.hasChildren(['roundId','phase','updatedAt'])",
    roundId: text(20), resetAt: { '.validate': 'newData.isNumber()' }, updatedAt: storedTimestamp,
    phase: { '.validate': "newData.val() === 'selecting' || newData.val() === 'running' || newData.val() === 'revealed'" },
    '$other': denyExtra,
  },
  roster: { '$participant': { ...tasteGameRules('stopwatchGame', 0).roster.$participant, '.read': self } },
  excluded: { '$participant': { '.read': self, '.validate': 'newData.val() === true' } },
  contestants: {
    '.read': gameReader,
    '$team': {
      '.write': `${member} && !data.exists() && newData.exists() && ${s}.child('presentation/active').val() === true && ${s}.child('presentation/slideIndex').val() === ${stopwatchScreen('select')} && ${stopwatch}.child('control/phase').val() === 'selecting' && ${stopwatch}.child('roster').child(${pid}).child('team').val() === $team && newData.child('participantId').val() === ${pid} && !${stopwatch}.child('excluded').child(${pid}).exists() && (${stopwatchNotUsed})`,
      '.validate': `($team === 'A' || $team === 'B' || $team === 'C' || $team === 'D') && newData.hasChildren(['participantId','name','team','teamName','roundId','selectedAt']) && newData.child('roundId').val() === ${stopwatch}.child('control/roundId').val() && newData.child('team').val() === $team && newData.child('name').val() === ${stopwatch}.child('roster').child(newData.child('participantId').val()).child('name').val() && newData.child('team').val() === ${stopwatch}.child('roster').child(newData.child('participantId').val()).child('team').val() && newData.child('teamName').val() === ${stopwatch}.child('roster').child(newData.child('participantId').val()).child('teamName').val()`,
      participantId: text(2), name: text(24), team, teamName: text(20), roundId: text(20), selectedAt: storedTimestamp, '$other': denyExtra,
    },
  },
  submissions: {
    '$team': {
      '.read': `${member} && ${stopwatchEntry}.child('participantId').val() === ${pid}`,
      '.write': `${member} && !data.exists() && newData.exists() && ${s}.child('presentation/active').val() === true && ${s}.child('presentation/slideIndex').val() === ${stopwatchScreen('play')} && ${stopwatch}.child('control/phase').val() === 'running' && ${stopwatchEntry}.child('participantId').val() === ${pid} && newData.child('participantId').val() === ${pid}`,
      '.validate': `newData.hasChildren(['participantId','roundId','elapsedMs','submittedAt']) && newData.child('roundId').val() === ${stopwatch}.child('control/roundId').val()`,
      participantId: text(2), roundId: text(20),
      elapsedMs: { '.validate': 'newData.isNumber() && newData.val() >= 1000 && newData.val() <= 86400000 && newData.val() % 1 === 0' },
      submittedAt: { '.read': gameReader, ...storedTimestamp }, '$other': denyExtra,
    },
  },
  result: {
    '.read': gameReader, '.validate': `newData.hasChildren(['elapsedMs','points','revealedAt']) && newData.parent().child('control/phase').val() === 'revealed'`,
    elapsedMs: { '$team': { '.validate': `newData.isNumber() && newData.val() === newData.parent().parent().parent().child('submissions').child($team).child('elapsedMs').val()` } },
    points: scoreMap, revealedAt: storedTimestamp, '$other': denyExtra,
  },
  '$other': denyExtra,
};
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
    '.read': 'auth != null', '.write': controller, '.validate': "newData.hasChildren(['step', 'updatedAt'])",
    step: { '.validate': "newData.val() === 'setup' || newData.val() === 'join' || newData.val() === 'chat' || newData.val() === 'closed'" },
    updatedAt: timestamp, '$other': denyExtra,
  },
  participants: {
    '.read': manager,
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
    '.read': manager,
    '$participant': {
      '.read': `${owner} || (auth != null && data.child('uid').val() === auth.uid)`,
      '.write': `${owner} || ((${manager}) && !newData.exists()) || (auth != null && ${active} && !data.exists() && newData.exists() && newData.child('uid').val() === auth.uid && !${s}.child('devices').child(auth.uid).exists() && ${s}.child('managerBinding/uid').val() !== auth.uid)`,
      '.validate': `newData.hasChildren(['uid','claimedAt']) && ${s}.child('participants').child($participant).exists() && newData.parent().parent().child('devices').child(newData.child('uid').val()).child('participantId').val() === $participant`,
      uid: text(128), claimedAt: timestamp, '$other': denyExtra,
    },
  },
  devices: {
    '$uid': {
      '.read': 'auth != null && auth.uid === $uid',
      '.write': `${owner} || ((${manager}) && !newData.exists()) || (auth != null && auth.uid === $uid && ${active} && !data.exists() && newData.exists() && ${s}.child('managerBinding/uid').val() !== auth.uid)`,
      '.validate': "newData.hasChildren(['participantId']) && newData.parent().parent().child('bindings').child(newData.child('participantId').val()).child('uid').val() === $uid",
      participantId: { '.validate': "newData.isString() && newData.val().matches(/^[ABCD][1-6]$/)" }, '$other': denyExtra,
    },
  },
  presence: {
    '.read': manager,
    '$uid': {
      '.write': `(${controller}) && !newData.exists()`,
      '$connection': {
        '.write': `auth != null && auth.uid === $uid && (!newData.exists() || (${member} && newData.child('participantId').val() === ${pid}))`,
        '.validate': "newData.hasChildren(['participantId','connectedAt']) && $connection.matches(/^[A-Za-z0-9_-]{20}$/)",
        participantId: text(2), connectedAt: timestamp, '$other': denyExtra,
      },
    },
  },
  instructions: {
    '.write': `(${owner}) && !newData.exists()`,
    '$participant': {
      '.read': self, '.write': controller, '.validate': "newData.hasChildren(['id','title','body','createdAt'])",
      id: text(20), title: text(80), body: text(500), createdAt: timestamp, '$other': denyExtra,
    },
  },
  responses: {
    '.write': `(${owner}) && !newData.exists()`,
    '$participant': {
      '.read': self,
      '.write': `${self} && newData.exists() && newData.child('instructionId').val() === ${s}.child('instructions').child($participant).child('id').val() && (${s}.child('presentation/roundId').val() !== newData.child('instructionId').val() || !${s}.child('presentation/winnerId').exists())`,
      '.validate': "newData.hasChildren(['instructionId','acknowledgedAt'])",
      instructionId: text(20), acknowledgedAt: timestamp, '$other': denyExtra,
    },
  },
  managerLookup: {
    '.write': owner,
    '$nameKey': {
      '.read': 'auth != null',
      '.validate': "$nameKey.length <= 192 && $nameKey.matches(/^[a-f0-9]+$/) && newData.hasChildren(['name'])",
      name: text(24), '$other': denyExtra,
    },
  },
  managerBinding: {
    '.read': `(${owner}) || (auth != null && data.child('uid').val() === auth.uid)`,
    '.write': `(${owner}) || (auth != null && !data.exists() && newData.exists() && newData.child('uid').val() === auth.uid && !${s}.child('devices').child(auth.uid).exists() && ${s}.child('managerLookup').child(newData.child('nameKey').val()).exists())`,
    '.validate': "newData.hasChildren(['uid','nameKey','claimedAt']) && !newData.parent().child('devices').child(newData.child('uid').val()).exists() && newData.parent().child('managerDevices').child(newData.child('uid').val()).child('nameKey').val() === newData.child('nameKey').val()",
    uid: text(128), nameKey: text(192), claimedAt: timestamp, '$other': denyExtra,
  },
  managerDevices: {
    '.write': `(${owner}) && !newData.exists()`,
    '$uid': {
      '.read': 'auth != null && auth.uid === $uid',
      '.write': `(${owner}) || (auth != null && auth.uid === $uid && !data.exists() && newData.exists() && !${s}.child('devices').child(auth.uid).exists())`,
      '.validate': "newData.hasChildren(['nameKey']) && newData.parent().parent().child('managerBinding/uid').val() === $uid && newData.parent().parent().child('managerBinding/nameKey').val() === newData.child('nameKey').val()",
      nameKey: text(192), '$other': denyExtra,
    },
  },
  operatorError: {
    '.read': controller,
    '.write': `(${owner}) || ((${manager}) && !newData.exists())`,
    '.validate': "newData.hasChildren(['id','message','createdAt'])",
    id: text(20), message: text(500), createdAt: timestamp, '$other': denyExtra,
  },
  presentation: {
    '.read': 'auth != null', '.write': controller,
    '.validate': `newData.hasChildren(['active','slideIndex','updatedAt']) && (newData.child('resetAt').val() === data.child('resetAt').val() || ((${owner}) && newData.child('active').val() === true && newData.child('slideIndex').val() === 0 && newData.child('resetAt').val() === now && !newData.child('roundId').exists() && !newData.child('winnerId').exists()))`,
    active: { '.validate': 'newData.isBoolean()' },
    slideIndex: { '.validate': `newData.isNumber() && newData.val() >= 0 && newData.val() <= ${STAGES.length - 1} && newData.val() % 1 === 0` },
    roundId: text(20), resetAt: storedTimestamp,
    winnerId: { '.validate': `newData.isString() && ${s}.child('participants').child(newData.val()).exists()` },
    updatedAt: timestamp, '$other': denyExtra,
  },
  tasteGame: tasteGameRules('tasteGame', 3),
  sojuGame: tasteGameRules('sojuGame', 6),
  militaryGame: tasteGameRules('militaryGame', 9),
  liarGame: liarGameRules,
  stopwatchGame: stopwatchGameRules,
  oxQuestions: { '.read': controller, '.write': controller, ...oxQuestions },
  oxGame: oxGameRules,
  zoomQuestions: { '.read': controller, '.write': controller, ...zoomQuestions },
  zoomGame: zoomGameRules,
  teamScores: {
    '.read': gameReader, '.write': controller, '.validate': `newData.hasChildren(['totals','awards']) && newData.child('resetAt').val() === ${s}.child('presentation/resetAt').val()`,
    resetAt: { '.validate': 'newData.isNumber()' },
    totals: scoreMap,
    awards: {
      '$round': {
        '.validate': "$round.matches(/^[A-Za-z0-9_-]{20}$/) && newData.hasChildren(['before','after','points','awardedAt'])",
        before: scoreMap, after: scoreMap, points: scoreMap, awardedAt: storedTimestamp, '$other': denyExtra,
      },
    },
    '$other': denyExtra,
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
