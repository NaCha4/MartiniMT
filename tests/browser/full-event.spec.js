import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, set } from 'firebase/database';
import { MEMORY_LAYOUTS } from '../../src/memory-model.js';
import { ROOT, SINGLE_EVENT_ROOM, nameKey } from '../../src/event-model.js';

test('26 independent sessions complete the full event with simultaneous votes, reconnects and exact cumulative scores', async ({ browser }) => {
  test.setTimeout(900000);
  const teams = ['A', 'B', 'C', 'D'];
  const ids = teams.flatMap(team => Array.from({ length: 6 }, (_, index) => `${team}${index + 1}`));
  const contexts = [], errors = [], checkpoints = [], traffic = [];
  const totals = Object.fromEntries(teams.map(team => [team, 0]));
  const players = {};
  const startedAt = Date.now();
  const fixedEvent = process.env.VITE_FIXED_EVENT_ROOM === SINGLE_EVENT_ROOM;
  const environment = await initializeTestEnvironment({
    projectId: `${process.env.MARTINI_TEST_PROJECT ?? 'demo-martini-mt'}-default-rtdb`,
    database: { host: '127.0.0.1', port: 9000, rules: await readFile('database.rules.json', 'utf8') },
  });
  let room;
  async function pageFor(mobile = true) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 844, height: 390 } : { width: 1440, height: 960 },
      isMobile: mobile, hasTouch: mobile,
    });
    contexts.push(context);
    await context.addInitScript(() => {
      Object.defineProperty(document, 'fullscreenEnabled', { get: () => false });
      window.auditMetrics = { qrCanvases: 0, longTasks: 0, longTaskMs: 0, longestTaskMs: 0 };
      const seenCanvases = new WeakSet();
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        if (this.classList.contains('invite-qr') && !seenCanvases.has(this)) {
          seenCanvases.add(this);
          window.auditMetrics.qrCanvases++;
        }
        return getContext.apply(this, args);
      };
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.auditMetrics.longTasks++;
          window.auditMetrics.longTaskMs += entry.duration;
          window.auditMetrics.longestTaskMs = Math.max(window.auditMetrics.longestTaskMs, entry.duration);
        }
      }).observe({ type: 'longtask', buffered: true });
    });
    const page = await context.newPage();
    const connection = { session: contexts.length, sentBytes: 0, receivedBytes: 0 };
    traffic.push(connection);
    page.on('websocket', socket => {
      if (new URL(socket.url()).port !== '9000') return;
      socket.on('framesent', frame => { connection.sentBytes += Buffer.byteLength(frame.payload); });
      socket.on('framereceived', frame => { connection.receivedBytes += Buffer.byteLength(frame.payload); });
    });
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    return page;
  }
  const host = await pageFor(false);
  let remote;
  async function read(path) {
    let value;
    await environment.withSecurityRulesDisabled(async context => {
      value = (await get(ref(context.database(), `mtChatV1/sessions/${room}/${path}`))).val();
    });
    return value;
  }
  const next = () => remote.getByRole('button', { name: '다음 화면', exact: true }).click();
  async function checkpoint(stage) {
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', stage, { timeout: 20000 });
    await Promise.all([host, remote, ...Object.values(players)].map(page => expect(page.getByRole('alert')).toHaveCount(0)));
    expect(errors).toEqual([]);
    checkpoints.push({
      stage, seconds: Math.round((Date.now() - startedAt) / 1000),
      host: await host.evaluate(() => window.auditMetrics),
      remote: await remote.evaluate(() => window.auditMetrics),
    });
    console.log(`[26 sessions] ${stage}`);
  }
  async function score(stage, points) {
    for (const team of teams) totals[team] += points[team] ?? 0;
    await checkpoint(stage);
    await Promise.all(teams.map(team => expect(host.locator(`[data-score-team="${team}"]`)).toHaveText(String(totals[team]))));
    expect((await read('teamScores')).totals).toEqual(totals);
  }
  async function recruit(number) {
    await Promise.all(teams.map(async team => {
      const page = players[`${team}${number}`];
      await page.getByRole('button', { name: /출전하기/ }).click();
      await page.getByRole('button', { name: '예', exact: true }).click();
      await expect(page.getByRole('heading', { name: /^출전 확정/ })).toBeVisible();
    }));
    for (let previous = 1; previous < number; previous++) {
      await Promise.all(teams.map(team => expect(players[`${team}${previous}`].getByRole('button', { name: /출전하기/ })).toHaveCount(0)));
    }
  }
  try {
    if (fixedEvent) await environment.withSecurityRulesDisabled(context => set(ref(context.database(), `${ROOT}/${SINGLE_EVENT_ROOM}`), {
      meta: { ownerUid: 'original-desktop', title: '마티니 MT', createdAt: 1 },
      stage: { step: 'setup', updatedAt: 1 },
      managerLookup: { [nameKey('전체검증진행자')]: { name: '전체검증진행자' } },
    }));
    await test.step('Register 24 participants and connect all 26 sessions', async () => {
      await host.goto('/', { waitUntil: 'domcontentloaded' });
      if (fixedEvent) {
        await host.locator('#real-name').fill('전체검증진행자');
        await host.getByRole('button', { name: '입장', exact: true }).click();
      }
      await expect(host.locator('#manager-name')).toBeEnabled();
      await host.locator('#manager-name').fill('전체검증진행자');
      for (const id of ids) await host.locator(`#name-${id}`).fill(`${id}검증참가자`);
      for (let index = 0; index < 5; index++) {
        await host.locator(`#ox-text-${index}`).fill(`전체 검증 ${index + 1}번 문제`);
        await host.locator(`#ox-answer-${index}`).selectOption(index % 2 ? 'X' : 'O');
      }
      await host.getByRole('button', { name: 'OX 문제 저장', exact: true }).click();
      await expect(host.locator('.ox-editor [role="status"]')).toHaveText('5개 문제 저장됨');
      await host.getByRole('button', { name: '발표 시작', exact: true }).click();
      const invite = await host.locator('#invite-url').inputValue();
      room = new URL(invite).searchParams.get('room');
      const joinStartedAt = Date.now();
      await Promise.all(['manager', ...ids].map(async id => {
        const page = await pageFor();
        if (id === 'manager') remote = page;
        else players[id] = page;
        await page.goto(invite, { waitUntil: 'domcontentloaded' });
        await page.locator('#real-name').fill(id === 'manager' ? '전체검증진행자' : `${id}검증참가자`);
        await page.getByRole('button', { name: '입장', exact: true }).click();
        await expect(page.locator(id === 'manager' ? '.manager-controller' : '.waiting-card')).toBeVisible({ timeout: 30000 });
      }));
      await expect(host.locator('.arrival-heading strong')).toHaveText('24', { timeout: 30000 });
      expect(Object.keys(await read('bindings'))).toHaveLength(24);
      if (fixedEvent) expect(Object.keys(await read('managerDevices'))).toHaveLength(2);
      else expect(await read('managerBinding')).toBeTruthy();
      checkpoints.push({ stage: '26 sessions connected', milliseconds: Date.now() - joinStartedAt });
      await checkpoint('join');
      await host.screenshot({ path: '.cache/audit-26-connected.png' });
    });

    await test.step('Simultaneous first-touch race', async () => {
      await next();
      await Promise.all(Object.values(players).map(page => expect(page.locator('#tap-target')).toBeEnabled()));
      const fireAt = Date.now() + 600;
      await Promise.all(Object.values(players).map(page => page.evaluate(at => new Promise(resolve => {
        setTimeout(() => {
          document.querySelector('#tap-target')?.dispatchEvent(new PointerEvent('pointerdown', { isPrimary: true, button: 0, bubbles: true }));
          resolve();
        }, Math.max(0, at - Date.now()));
      }), fireAt)));
      await expect(host.locator('#winner-name')).toHaveText(/검증참가자/);
      await Promise.all(Object.values(players).map(page => expect(page.locator('#tap-target')).toHaveCount(0)));
      const outcomes = await Promise.all(Object.values(players).map(page => page.locator('.waiting-card').getAttribute('data-result')));
      expect(outcomes.filter(value => value === 'winner')).toHaveLength(1);
      await checkpoint('touch');
      await next();
    });

    for (const [key, option, voteStage, scoreStage] of [
      ['whisky', 'peat', 'taste-vote', 'taste-score'],
      ['soju', 'chamisul', 'soju-vote', 'soju-score'],
      ['military', 'army', 'military-vote', 'military-score'],
    ]) await test.step(`24 simultaneous ${key} votes and predictions`, async () => {
      if (key === 'whisky') { await checkpoint('taste-intro'); await next(); }
      await checkpoint(voteStage);
      await remote.getByRole('button', { name: '투표 시작', exact: true }).click();
      await Promise.all(Object.values(players).map(page => page.locator(`[data-vote="${option}"]`).tap()));
      await expect(remote.locator('.remote-vote-count')).toHaveText('24 / 24명 투표');
      await remote.getByRole('button', { name: '투표 종료', exact: true }).click();
      await remote.getByRole('button', { name: '최다 득표 예상 투표 시작', exact: true }).click();
      await Promise.all(Object.values(players).map(page => page.locator(`[data-vote="${option}"]`).tap()));
      await expect(remote.locator('.remote-vote-count')).toHaveText('24 / 24명 투표');
      await remote.getByRole('button', { name: '예상 투표 종료', exact: true }).click();
      await remote.getByRole('button', { name: '정답 공개', exact: true }).click();
      await next();
      await remote.getByRole('button', { name: '결과 공개', exact: true }).click();
      await next();
      await score(scoreStage, { A: 60, B: 60, C: 60, D: 60 });
      if (key === 'soju') {
        await Promise.all([remote, ...Object.values(players)].map(page => page.reload({ waitUntil: 'domcontentloaded' })));
        await checkpoint(scoreStage);
      }
      await next();
    });

    await test.step('Five OX rounds with elimination and survival scores', async () => {
      await checkpoint('ox-intro');
      await next();
      for (let index = 0; index < 5; index++) {
        const answer = index % 2 ? 'X' : 'O';
        await checkpoint(`ox-question-${index + 1}`);
        await remote.getByRole('button', { name: '응답 시작', exact: true }).click();
        const eligible = index ? ids.filter(id => id !== 'A6') : ids;
        await Promise.all(eligible.map(id => players[id].locator(`[data-ox-vote="${id === 'A6' ? 'X' : answer}"]`).tap()));
        await expect(remote.locator('.remote-vote-count')).toHaveText(`${eligible.length} / ${eligible.length}명 응답`);
        await remote.getByRole('button', { name: '응답 마감', exact: true }).click();
        await remote.getByRole('button', { name: '정답 공개', exact: true }).click();
        await next();
        await remote.getByRole('button', { name: '결과 공개', exact: true }).click();
        await next();
      }
      await score('ox-score', { A: 250, B: 300, C: 300, D: 300 });
      await next();
    });

    await test.step('Five photo questions and automatic continuation', async () => {
      await checkpoint('zoom-intro');
      await next();
      for (let index = 0; index < 5; index++) {
        await checkpoint(`zoom-question-${index + 1}`);
        await expect.poll(() => host.locator('.zoom-photo').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
        const team = teams[index % teams.length];
        await players[`${team}6`].locator('[data-zoom-request]').tap();
        await remote.getByRole('button', { name: '정답', exact: true }).click();
        totals[team] += 50;
      }
      await score('zoom-score', {});
      await next();
    });

    await test.step('Three liar rounds keep four entrants and collect 20 votes', async () => {
      await checkpoint('liar-intro');
      await next();
      await recruit(1);
      await next();
      for (let index = 0; index < 3; index++) {
        await checkpoint(`liar-play-${index + 1}`);
        await expect(host.locator('.liar-topic-label')).toHaveText('주제');
        await remote.getByRole('button', { name: '단어 전달', exact: true }).click();
        const words = await Promise.all(teams.map(team => players[`${team}1`].locator('.liar-word h1').textContent()));
        const liarTeam = teams[words.indexOf('라이어')];
        expect(liarTeam).toBeTruthy();
        expect(words.filter(word => word === '라이어')).toHaveLength(1);
        await remote.getByRole('button', { name: '투표', exact: true }).click();
        await Promise.all(ids.filter(id => !id.endsWith('1')).map(id => players[id].locator(`[data-liar-vote="${liarTeam}1"]`).tap()));
        await expect(remote.locator('.remote-game-controls')).toContainText('20 / 20명 투표');
        await remote.getByRole('button', { name: '투표 종료', exact: true }).click();
        await remote.getByRole('button', { name: '정답 공개', exact: true }).click();
        await score(`liar-score-${index + 1}`, Object.fromEntries(teams.map(team => [team, team === liarTeam ? 0 : 50])));
        expect(Object.keys((await read(`liarGame/rounds/${index}`)).contestants).sort()).toEqual(teams);
        await next();
      }
    });

    await test.step('Four local stopwatches reveal together and score once', async () => {
      await checkpoint('stopwatch-intro');
      await next();
      await recruit(2);
      await next();
      await remote.getByRole('button', { name: '게임 시작', exact: true }).click();
      await Promise.all(teams.map(team => players[`${team}2`].getByRole('button', { name: /카운트 시작/ }).tap()));
      await players.A2.waitForTimeout(10000);
      await Promise.all(teams.map(team => players[`${team}2`].getByRole('button', { name: /카운트 종료/ }).tap()));
      await expect(remote.locator('.remote-game-controls')).toContainText('4 / 4명 제출 완료');
      await expect(host.locator('.stopwatch-time')).toHaveCount(0);
      const submissions = await read('stopwatchGame/submissions');
      for (const value of Object.values(submissions)) expect(value.elapsedMs).toBeGreaterThanOrEqual(10000);
      const distance = Math.min(...Object.values(submissions).map(value => Math.abs(value.elapsedMs - 10000)));
      const points = Object.fromEntries(teams.map(team => [team, Math.abs(submissions[team].elapsedMs - 10000) === distance ? 100 : 0]));
      await remote.getByRole('button', { name: '결과 공개', exact: true }).click();
      await next();
      await score('stopwatch-score', points);
      await next();
    });

    await test.step('Three number rounds retain four new players', async () => {
      await checkpoint('number-intro');
      await next();
      await recruit(3);
      await next();
      await remote.getByRole('button', { name: '게임 시작', exact: true }).click();
      for (let index = 0; index < 3; index++) {
        await checkpoint(`number-play-${index + 1}`);
        await remote.getByRole('button', { name: '입력 시작', exact: true }).click();
        await Promise.all(teams.map(async (team, position) => {
          const page = players[`${team}3`];
          await page.locator(`[data-number-choice="${position + 1}"]`).tap();
          await page.locator('[data-number-action="number-submit"]').tap();
        }));
        await remote.getByRole('button', { name: '결과 공개', exact: true }).click();
        await next();
        await score(`number-score-${index + 1}`, { D: 40 });
        await next();
      }
    });

    await test.step('Four memory players finish all 42 flips and three rounds', async () => {
      await checkpoint('memory-intro');
      await next();
      await recruit(4);
      await next();
      await remote.getByRole('button', { name: '게임 시작', exact: true }).click();
      for (const [roundIndex, layout] of MEMORY_LAYOUTS.entries()) {
        const pairs = [...new Set(layout)].map(symbol => layout.flatMap((value, index) => value === symbol ? [index] : []));
        await Promise.all(teams.map(team => expect(players[`${team}4`].locator('[data-memory-card]')).toHaveCount(layout.length)));
        for (const [pairIndex, pair] of pairs.entries()) {
          await Promise.all(teams.map(async team => {
            const card = players[`${team}4`].locator(`[data-memory-card="${pair[0]}"]`);
            await expect(card).toBeEnabled(); await card.tap();
          }));
          const finish = async team => {
            const card = players[`${team}4`].locator(`[data-memory-card="${pair[1]}"]`);
            await expect(card).toBeEnabled(); await card.tap();
          };
          if (roundIndex === 2 && pairIndex === pairs.length - 1) {
            for (const team of teams) {
              await finish(team);
              await expect(players[`${team}4`].getByRole('heading', { name: /위 완주!/ })).toBeVisible();
            }
          } else await Promise.all(teams.map(finish));
        }
      }
      await score('memory-score', { A: 150, B: 100, C: 50 });
      await next();
    });

    await test.step('Reaction false start, local timing and final score', async () => {
      await checkpoint('reaction-intro');
      await next();
      await recruit(5);
      await next();
      await checkpoint('reaction-play');
      await players.A5.getByRole('button', { name: /터치를 기다리세요/ }).tap();
      await expect(players.A5.getByRole('heading', { name: '실격', exact: true })).toBeVisible();
      await remote.getByRole('button', { name: '터치 신호 보내기', exact: true }).click();
      await Promise.all(['B', 'C', 'D'].map(team => expect(players[`${team}5`].locator('.reaction-tap')).toBeEnabled()));
      for (const team of ['B', 'C', 'D']) await players[`${team}5`].locator('.reaction-tap').tap();
      await expect(host.locator('.reaction-results')).toBeVisible();
      const game = await read('reactionGame');
      const minimum = Math.min(...['B', 'C', 'D'].map(team => game.submissions[team].elapsedMs));
      const points = Object.fromEntries(teams.map(team => [team, team !== 'A' && game.submissions[team].elapsedMs === minimum ? 100 : 0]));
      expect(game.result.points).toEqual(points);
      await next();
      await score('reaction-score', points);
      await host.screenshot({ path: '.cache/audit-final-score.png' });
      const scores = await read('teamScores');
      expect(Object.keys(scores.awards)).toHaveLength(14);
      await Promise.all([host, remote, ...Object.values(players)].map(page => page.reload({ waitUntil: 'domcontentloaded' })));
      await checkpoint('reaction-score');
      expect((await read('teamScores')).totals).toEqual(totals);
    });

    await test.step('Yut board, one-time winning score and all four awards with 26 sessions', async () => {
      await next();
      await checkpoint('yut-intro');
      await next();
      await checkpoint('yut-board');
      await expect(host.locator('[data-yut-piece]')).toHaveCount(16);
      await host.locator('[data-yut-piece="A1"]').click();
      await host.locator('.yut-node.is-center').click();
      await expect.poll(async () => (await read('yutGame')).pieces.A1).toMatchObject({ x: 500, y: 340 });
      await remote.getByRole('button', { name: '1조 우승 +300', exact: true }).click();
      await score('final-ranking', { A: 300 });
      const scores = await read('teamScores');
      expect(Object.keys(scores.awards)).toHaveLength(15);
      const order = [...teams].sort((a, b) => totals[b] - totals[a] || a.localeCompare(b));
      for (const [index, team] of order.entries()) {
        await expect(host.locator('.final-award')).toHaveAttribute('data-award-index', String(index), { timeout: 15000 });
        await expect(host.locator('.final-award')).toHaveAttribute('data-award-team', team);
      }
      expect((await read('teamScores')).totals).toEqual(totals);
      await host.screenshot({ path: '.cache/audit-26-final-award.png' });
    });

    await test.step('Reset all games with all 26 sessions still connected', async () => {
      await remote.getByRole('button', { name: '설정', exact: true }).click();
      await expect(host.locator('.dashboard')).toBeVisible();
      await host.getByRole('button', { name: '초기화', exact: true }).click();
      await expect(host.locator('.dashboard')).toBeVisible();
      await host.getByRole('button', { name: '발표 시작', exact: true }).click();
      await checkpoint('join');
      await expect(host.locator('.arrival-heading strong')).toHaveText('24');
      for (const path of ['tasteGame', 'sojuGame', 'militaryGame', 'oxGame', 'zoomGame', 'liarGame', 'stopwatchGame', 'numberGame', 'memoryGame', 'reactionGame', 'yutGame', 'teamScores']) expect(await read(path)).toBeNull();
      expect(Object.keys(await read('bindings'))).toHaveLength(24);
      await next();
      await Promise.all(Object.values(players).map(page => expect(page.locator('#tap-target')).toBeEnabled()));
      await players.A1.locator('#tap-target').tap();
      await expect(host.locator('#winner-name')).toHaveText('A1검증참가자');
    });
    expect(errors).toEqual([]);
  } finally {
    await writeFile('.cache/audit-26-summary.json', JSON.stringify({ fixedEvent, sessions: contexts.length, totals, checkpoints, traffic, errors }, null, 2));
    await Promise.all(contexts.map(context => context.close()));
    await environment.cleanup();
  }
});
