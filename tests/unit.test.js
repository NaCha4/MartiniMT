import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rosterFromInputs, rowsFromParticipants, readRosterDraft, TEAM_NAMES, STAGES, nameKey, messageText, onlineParticipants, participantUrl, friendlyError, firstTouch, touchRoundIsActive, touchRoundResult, stageIndex, TOUCH_TITLE, TOUCH_BODY } from '../src/event-model.js';
import { WHISKY_OPTIONS, SOJU_OPTIONS, MILITARY_OPTIONS, TASTE_ROUNDS, tasteOutcome, revealOrder, scoreAward, rankedTeams, revealFinished, REVEAL_INTERVAL } from '../src/taste-model.js';
import { emptyOxQuestions, oxQuestionsReady, oxSurvivors, oxPoints, oxEliminatedIds, oxSurvivorRevealEnd } from '../src/ox-model.js';

test('OX has five empty questions and alternating question/reveal screens', () => {
  const empty = emptyOxQuestions();
  assert.equal(Object.keys(empty).length, 5);
  assert.ok(Object.values(empty).every(question => question.text === '' && question.answer === ''));
  assert.equal(oxQuestionsReady(empty), false);
  const ready = Object.fromEntries(Object.keys(empty).map(index => [index, { text: `검증 ${index}`, answer: 'O' }]));
  assert.equal(oxQuestionsReady(ready), true);
  assert.equal(oxQuestionsReady({ ...ready, 0: { text: '   ', answer: 'O' } }), false);
  assert.equal(oxQuestionsReady({ ...ready, 0: { text: '문제', answer: '' } }), false);
  const stages = STAGES.filter(stage => stage.game === 'ox');
  assert.deepEqual(stages.map(stage => stage.screenCode), Array.from({ length: 17 }, (_, index) => index + 14));
  assert.deepEqual(stages.filter(stage => ['question', 'reveal'].includes(stage.view)).map(stage => stage.view), Array.from({ length: 5 }, () => ['question', 'reveal']).flat());
  const order = [];
  for (let index = 12; ; index = stageIndex(index, 1)) {
    order.push(STAGES[index].view);
    if (stageIndex(index, 1) === index) break;
  }
  assert.deepEqual(order, ['intro', ...Array.from({ length: 5 }, () => ['question', 'reveal', 'survivors']).flat(), 'score']);
  assert.equal(STAGES[23].id, 'ox-score');
  assert.equal(stageIndex(23, -1), 28);
  assert.equal(stageIndex(24, -1), 14);
});

test('OX survivor reveal dims only this question’s eliminations and persists its completion time', () => {
  const round = { eligible: { A1: true, A2: true, B1: true }, result: { survivors: { A1: true } } };
  assert.deepEqual(oxEliminatedIds(round), ['A2', 'B1']);
  assert.equal(oxSurvivorRevealEnd(round), Infinity);
  round.result.survivorsRevealedAt = 1000;
  assert.equal(oxSurvivorRevealEnd(round), 1000 + 2 * REVEAL_INTERVAL + 600);
  assert.equal(oxSurvivorRevealEnd({ result: { survivorsRevealedAt: 0 } }), 600);
});

test('OX eliminates wrong and missing answers permanently and awards fifty points per final survivor once', () => {
  const first = oxSurvivors({ eligible: { A1: true, A2: true, B1: true }, votes: { A1: { answer: 'O' }, A2: { answer: 'X' }, C1: { answer: 'O' } } }, 'O');
  assert.deepEqual(first, { A1: true });
  assert.deepEqual(oxSurvivors({ eligible: first, votes: { A1: { answer: 'X' }, A2: { answer: 'O' } } }, 'O'), {});
  const points = oxPoints({ roster: { A1: { team: 'A' }, A2: { team: 'A' }, B1: { team: 'B' } }, rounds: { 4: { result: { survivors: { A1: true, A2: true, B1: true } } } } });
  assert.deepEqual(points, { A: 100, B: 50, C: 0, D: 0 });
  const previous = scoreAward(null, 'taste', { A: 10, B: 20, C: 0, D: 0 }, 1);
  const final = scoreAward(previous, 'ox', points, 2);
  assert.deepEqual(final.totals, { A: 110, B: 70, C: 0, D: 0 });
  assert.equal(scoreAward(final, 'ox', points, 3), final);
  assert.deepEqual(oxPoints({ roster: {}, rounds: {} }), { A: 0, B: 0, C: 0, D: 0 });
});

test('roster uses stable IDs, ignores blank slots, and indexes duplicate names across teams', () => {
  const roster = rosterFromInputs({ A: [' 김 지민 ', '', '이서연'], B: ['김지민'], C: [], D: [] }, { A: '민트팀', B: '라임팀', C: 'C조', D: 'D조' });
  assert.equal(Object.keys(roster.participants).length, 3);
  assert.equal(roster.participants.A3.name, '이서연');
  assert.deepEqual(Object.keys(roster.nameIndex[nameKey('김지민')]), ['A1', 'B1']);
  assert.equal(nameKey('김 지민'), nameKey('김지민'));
  assert.throws(() => rosterFromInputs({ A: ['김지민', '김 지민'] }, { A: 'A조' }));
  assert.throws(() => rosterFromInputs({ A: [] }, { A: 'A조' }));
});
test('message validation and errors are safe', () => {
  assert.equal(messageText(' 안녕하세요\n반가워요 '), '안녕하세요\n반가워요');
  assert.throws(() => messageText('  '));
  assert.throws(() => messageText('가'.repeat(1001)));
  assert.match(friendlyError({ code: 'PERMISSION_DENIED' }), /이미 연결/);
  assert.doesNotMatch(friendlyError(new Error('private detail')), /private/);
});

test('rosters default to fixed numbered teams and retain empty slots when restored', () => {
  const rows = rowsFromParticipants({ A1: { name: '김지민' }, A3: { name: '이서연' }, D6: { name: '박하늘' } });
  assert.deepEqual(rows.A, ['김지민', '', '이서연', '', '', '']);
  assert.deepEqual(rows.B, ['', '', '', '', '', '']);
  assert.equal(rows.D[5], '박하늘');
  const roster = rosterFromInputs(rows);
  assert.equal(roster.participants.A1.teamName, '1조');
  assert.equal(roster.participants.D6.teamName, '4조');
  assert.deepEqual(Object.values(TEAM_NAMES), ['1조', '2조', '3조', '4조']);
});

test('local roster drafts preserve pending edits and reject malformed storage', () => {
  const rows = rowsFromParticipants({ A2: { name: '김지민' } });
  const draft = { rows, pending: true };
  assert.deepEqual(readRosterDraft(JSON.stringify(draft)), draft);
  assert.equal(readRosterDraft(JSON.stringify({ rows, pending: false })).pending, false);
  assert.equal(readRosterDraft(null), null);
  assert.equal(readRosterDraft('{broken'), null);
  assert.equal(readRosterDraft(JSON.stringify({ rows: { A: ['김지민'] } })), null);
  assert.equal(readRosterDraft(JSON.stringify({ rows: { ...rows, B: Array(6).fill(42) } })), null);
});
test('presence deduplicates participants across reconnects', () => {
  assert.deepEqual([...onlineParticipants({ uid1: { one: { participantId: 'A1' }, two: { participantId: 'A1' } }, uid2: { one: { participantId: 'B1' } } })], ['A1', 'B1']);
});

test('local QR links use the LAN address while hosted links preserve their origin and base path', () => {
  assert.equal(participantUrl('http://127.0.0.1:5173/?old=1#title', 'room-id', 'http://192.168.0.24:5173/'), 'http://192.168.0.24:5173/?room=room-id');
  assert.equal(participantUrl('https://example.com/MartiniMT/?old=1', 'room-id', 'http://192.168.0.24:5173/'), 'https://example.com/MartiniMT/?room=room-id');
  assert.equal(participantUrl('http://127.0.0.1:5174/', 'room-id'), 'http://127.0.0.1:5174/?room=room-id');
});

test('a race accepts only the current round and chooses the earliest server timestamp', () => {
  const people = { A1: { name: '가', teamName: 'A조' }, A2: { name: '나', teamName: 'A조' } };
  assert.equal(firstTouch({ A1: { instructionId: 'old', acknowledgedAt: 1 } }, people, 'new'), null);
  const winner = firstTouch({ A1: { instructionId: 'new', acknowledgedAt: 20 }, A2: { instructionId: 'new', acknowledgedAt: 10 }, outsider: { instructionId: 'new', acknowledgedAt: 1 } }, people, 'new');
  assert.equal(winner.id, 'A2');
  const instruction = { id: 'new', title: TOUCH_TITLE, body: TOUCH_BODY, createdAt: 100 };
  assert.equal(touchRoundIsActive(instruction, { step: 'join', updatedAt: 100 }), true);
  assert.equal(touchRoundIsActive(instruction, { step: 'join', updatedAt: 101 }), false);
  assert.equal(touchRoundIsActive(instruction, { step: 'closed', updatedAt: 100 }), false);
  assert.equal(stageIndex(0, -1), 0);
  const last = STAGES.findIndex(stage => stage.id === 'ox-score');
  assert.equal(stageIndex(last, 1), last);
});

test('taste game accepts all tied top choices and awards ten points per correct member', () => {
  const roster = { A1: { team: 'A' }, A2: { team: 'A' }, B1: { team: 'B' }, C1: { team: 'C' } };
  const outcome = tasteOutcome({ options: WHISKY_OPTIONS, roster,
    preferenceVotes: { A1: { optionId: 'peat' }, A2: { optionId: 'sherry' }, B1: { optionId: 'missing' }, outsider: { optionId: 'bourbon' } },
    predictionVotes: { A1: { optionId: 'peat' }, A2: { optionId: 'sherry' }, B1: { optionId: 'peat' }, C1: { optionId: 'bourbon' }, outsider: { optionId: 'peat' } },
  });
  assert.deepEqual(outcome.topIds, { peat: true, sherry: true });
  assert.deepEqual(outcome.correctIds, { A1: true, A2: true, B1: true });
  assert.deepEqual(outcome.points, { A: 20, B: 10, C: 0, D: 0 });
  assert.deepEqual(tasteOutcome({ options: WHISKY_OPTIONS, roster }).topIds, {});
});

test('soju repeats the voting cycle on screens eight to ten with independent storage', () => {
  const soju = STAGES.filter(stage => stage.game === 'soju');
  assert.deepEqual(soju.map(stage => [stage.screenCode, stage.view]), [[8, 'vote'], [9, 'reveal'], [10, 'score']]);
  assert.deepEqual(Object.values(SOJU_OPTIONS).map(option => option.label), ['참이슬', '처음처럼', '진로', '새로']);
  assert.equal(TASTE_ROUNDS.whisky.path, 'tasteGame');
  assert.equal(TASTE_ROUNDS.soju.path, 'sojuGame');
  assert.equal(new Set(STAGES.map(stage => stage.screenCode)).size, STAGES.length);
});

test('score awards are idempotent and team ranks share places on ties', () => {
  const points = { A: 10, B: 20, C: 20, D: 0 };
  const first = scoreAward(null, 'one', points, 100);
  assert.deepEqual(first.totals, points);
  assert.equal(scoreAward(first, 'one', points, 101), first);
  const next = scoreAward(first, 'two', { A: 30, B: 0, C: 0, D: 10 }, 200);
  assert.deepEqual(next.totals, { A: 40, B: 20, C: 20, D: 10 });
  assert.deepEqual(rankedTeams(points).map(({ team, rank }) => [team, rank]), [['B', 1], ['C', 1], ['A', 3], ['D', 4]]);
});

test('military repeats the cycle on screens eleven to thirteen and adds to existing scores', () => {
  const military = STAGES.filter(stage => stage.game === 'military');
  assert.deepEqual(military.map(stage => [stage.screenCode, stage.view]), [[11, 'vote'], [12, 'reveal'], [13, 'score']]);
  assert.equal(TASTE_ROUNDS.military.path, 'militaryGame');
  assert.equal(TASTE_ROUNDS.military.options, MILITARY_OPTIONS);
  assert.deepEqual(Object.values(MILITARY_OPTIONS).map(option => option.label), ['육군', '공군', '해병대']);
  const outcome = tasteOutcome({ options: MILITARY_OPTIONS, roster: { A1: { team: 'A' }, B1: { team: 'B' }, C1: { team: 'C' } },
    preferenceVotes: { A1: { optionId: 'army' }, B1: { optionId: 'airforce' }, C1: { optionId: 'army' } },
    predictionVotes: { A1: { optionId: 'marines' }, B1: { optionId: 'army' }, C1: { optionId: 'army' } },
  });
  assert.deepEqual(outcome.counts, { army: 2, airforce: 1, marines: 0 });
  assert.deepEqual(outcome.topIds, { army: true });
  assert.deepEqual(outcome.correctIds, { B1: true, C1: true });
  const previous = scoreAward(null, 'soju', { A: 30, B: 10, C: 10, D: 0 }, 100);
  const scores = scoreAward(previous, 'military', outcome.points, 200);
  assert.deepEqual(scores.totals, { A: 30, B: 20, C: 20, D: 0 });
  assert.equal(scoreAward(scores, 'military', outcome.points, 300), scores);
});

test('every round cleared by reset has database rules for its voting screen', () => {
  const rules = JSON.parse(readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8')).rules.mtChatV1.sessions.$session;
  for (const [key, { path }] of Object.entries(TASTE_ROUNDS)) {
    const voteIndex = STAGES.findIndex(stage => stage.game === key && stage.view === 'vote');
    assert.ok(rules[path], `Missing database rules for reset path ${path}`);
    for (const kind of ['preference', 'prediction']) {
      assert.ok(rules[path][`${kind}Votes`].$participant['.write'].includes(`slideIndex').val() === ${voteIndex}`), `Wrong voting screen for ${path}/${kind}Votes`);
    }
  }
});

test('reveal order contains every winner once and waits until the last light completes', () => {
  const order = revealOrder({ A1: true, B1: true, C1: true }, () => 0);
  assert.deepEqual(Object.values(order).sort(), [0, 1, 2]);
  assert.equal(Object.keys(order).length, 3);
  const result = { order, revealedAt: 1000 };
  assert.equal(revealFinished(result, 1000 + 3 * REVEAL_INTERVAL), false);
  assert.equal(revealFinished(result, 1000 + 3 * REVEAL_INTERVAL + 450), true);
});

test('participants see only their current round result and the winner is distinguished', () => {
  const instruction = { id: 'round', title: TOUCH_TITLE, body: TOUCH_BODY, createdAt: 100 };
  const stage = { step: 'join', updatedAt: 100 };
  const result = { roundId: 'round', winnerId: 'A1' };
  assert.equal(touchRoundResult(instruction, stage, result, 'A1'), 'winner');
  assert.equal(touchRoundResult(instruction, stage, result, 'A2'), 'closed');
  assert.equal(touchRoundResult(instruction, stage, { ...result, roundId: 'old' }, 'A1'), null);
  assert.equal(touchRoundResult(instruction, { ...stage, updatedAt: 101 }, result, 'A1'), null);
  assert.equal(touchRoundResult(instruction, stage, { roundId: 'round' }, 'A1'), null);
  assert.equal(touchRoundResult(null, stage, result, 'A1'), null);
});
