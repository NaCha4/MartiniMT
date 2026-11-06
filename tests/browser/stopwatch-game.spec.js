import { test, expect } from '@playwright/test';

async function setup(browser, playerIds) {
  const contexts = [];
  async function pageFor(name) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
    contexts.push(context);
    await context.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }));
    const page = await context.newPage();
    if (name) {
      await page.goto(await host.locator('#invite-url').inputValue(), { waitUntil: 'domcontentloaded' });
      await page.locator('#real-name').fill(name);
      await page.getByRole('button', { name: '입장', exact: true }).click();
    }
    return page;
  }
  const host = await pageFor();
  await host.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(host.locator('#manager-name')).toBeEnabled();
  await host.locator('#manager-name').fill('진행자');
  for (const team of ['A', 'B', 'C', 'D']) for (let n = 1; n <= 3; n++) await host.locator(`#name-${team}${n}`).fill(`${team}선수${n}`);
  await host.getByRole('button', { name: '발표 시작', exact: true }).click();
  const remote = await pageFor('진행자');
  const excluded = await pageFor('A선수1');
  const players = [];
  for (const id of playerIds) players.push(await pageFor(`${id[0]}선수${id[1]}`));
  await host.evaluate(async () => {
    const api = await import('/src/event-data.js'); await api.connect();
    const { STAGES } = await import('/src/event-model.js');
    const room = localStorage.getItem('martini.host-room');
    const roster = await api.read(room, 'participants');
    const liar = await api.prepareLiarRound(room, roster, 0);
    await api.claimLiarEntry(room, 'A1', 0, liar.control.roundId);
    await api.setPresentationSlide(room, STAGES.findIndex(stage => stage.id === 'stopwatch-intro'));
  });
  await expect(host.getByRole('heading', { name: '인간스톱워치', exact: true })).toBeVisible();
  const next = () => remote.getByRole('button', { name: '다음 화면', exact: true }).click();
  await next();
  await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
  await expect(excluded.getByRole('heading', { name: '라이어게임 출전자는 참여할 수 없습니다' })).toBeVisible();
  for (const player of players) {
    await player.getByRole('button', { name: /출전하기/ }).click();
    await player.getByRole('button', { name: '예', exact: true }).click();
    await expect(player.getByRole('heading', { name: '출전 확정', exact: true })).toBeVisible();
  }
  await next();
  for (const player of players) await expect(player.getByRole('button', { name: /카운트 시작/ })).toHaveCount(0);
  await remote.getByRole('button', { name: '게임 시작', exact: true }).click();
  for (const player of players) await expect(player.getByRole('button', { name: /카운트 시작/ })).toBeVisible();
  return { contexts, host, remote, players, next };
}

test('one entrant can locally count, reload, submit, reveal manually and score once', async ({ browser }) => {
  test.setTimeout(90000);
  const { contexts, host, remote, players: [player], next } = await setup(browser, ['A2']);
  try {
    await player.getByRole('button', { name: /카운트 시작/ }).click();
    await expect(player.getByRole('button', { name: /카운트 종료/ })).toHaveCount(0);
    await expect(player.getByRole('button', { name: /카운트 종료/ })).toBeVisible();
    await player.reload();
    const measured = await player.evaluate(() => performance.timeOrigin + performance.now());
    await player.getByRole('button', { name: /카운트 종료/ }).click();
    await expect(player.getByRole('heading', { name: '제출 완료', exact: true })).toBeVisible();
    await expect(host.locator('.stopwatch-status')).toHaveText('제출 완료');
    await expect(host.locator('.stopwatch-time')).toHaveCount(0);
    await expect(remote.getByRole('button', { name: '결과 공개', exact: true })).toBeEnabled();
    await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
    const submission = await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      return api.read(localStorage.getItem('martini.host-room'), 'stopwatchGame/submissions/A');
    });
    const attempt = await player.evaluate(() => JSON.parse(Object.keys(sessionStorage).filter(key => key.startsWith('martini.stopwatch.')).map(key => sessionStorage.getItem(key))[0]));
    expect(submission.elapsedMs).toBe(attempt.elapsedMs);
    expect(submission.elapsedMs).toBeGreaterThanOrEqual(1000);
    expect(attempt.startedAt).toBeLessThan(measured);
    await player.reload();
    await expect(player.getByRole('heading', { name: '제출 완료', exact: true })).toBeVisible();
    await remote.getByRole('button', { name: '결과 공개', exact: true }).click();
    await expect(host.locator('.stopwatch-countdown')).toBeVisible();
    await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
    await expect(host.locator('.stopwatch-screen')).toHaveClass(/is-settled/);
    await expect(host.locator('.stopwatch-time')).toContainText((Math.round(submission.elapsedMs / 10) / 100).toFixed(2));
    await expect(host.locator('.stopwatch-award')).toHaveText('+200점');
    await expect(player.locator('.stopwatch-personal-result h1')).toContainText((Math.round(submission.elapsedMs / 10) / 100).toFixed(2));
    await next();
    await expect(host.getByRole('heading', { name: '인간스톱워치 점수', exact: true })).toBeVisible();
    await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      const room = localStorage.getItem('martini.host-room');
      await api.awardStopwatchPoints(room); await api.awardStopwatchPoints(room);
    });
    const total = await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      return api.read(localStorage.getItem('martini.host-room'), 'teamScores/totals');
    });
    expect(total).toEqual({ A: 200, B: 0, C: 0, D: 0 });
    await host.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(host.locator('.presentation-screen-code')).toHaveText('1');
    const game = await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      return api.read(localStorage.getItem('martini.host-room'), 'stopwatchGame');
    });
    expect(game).toBeNull();
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('four entrants reveal together only after all submit and tied teams each get 200', async ({ browser }) => {
  test.setTimeout(90000);
  const { contexts, host, remote, players, next } = await setup(browser, ['A2', 'B1', 'C1', 'D1']);
  try {
    const times = [9987, 10011, 12004, 7001];
    for (const [index, player] of players.entries()) {
      await player.evaluate(async elapsedMs => {
        const api = await import('/src/event-data.js'); const uid = await api.connect();
        const room = new URL(location.href).searchParams.get('room');
        const device = await api.read(room, `devices/${uid}`);
        const control = await api.read(room, 'stopwatchGame/control');
        await api.submitStopwatch(room, device.participantId, device.participantId[0], control.roundId, elapsedMs);
      }, times[index]);
      await expect(player.getByRole('heading', { name: '제출 완료', exact: true })).toBeVisible();
      await expect(host.locator('.stopwatch-time')).toHaveCount(0);
      if (index < 3) await expect(remote.getByRole('button', { name: '결과 공개', exact: true })).toBeDisabled();
    }
    await remote.getByRole('button', { name: '결과 공개', exact: true }).click();
    await expect(host.locator('.stopwatch-countdown')).toBeVisible();
    await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
    await expect(host.locator('.stopwatch-screen')).toHaveClass(/is-settled/);
    await expect(host.locator('.stopwatch-time')).toHaveCount(4);
    await expect(host.locator('[data-stopwatch-time]')).toHaveText(['9.99', '10.01', '12.00', '7.00']);
    await expect(host.locator('.stopwatch-award')).toHaveCount(2);
    await expect(host.locator('.stopwatch-contestant.is-loser')).toHaveCount(2);
    await expect(host.locator('.stopwatch-contestant[data-team="C"]')).toHaveCSS('filter', 'grayscale(1)');
    await expect(host.locator('.stopwatch-contestant[data-team="C"]')).toHaveCSS('opacity', '0.32');
    await expect(host.locator('.stopwatch-contestant[data-team="A"]')).toHaveCSS('filter', 'none');
    await expect(host.locator('.stopwatch-screen')).toBeVisible();
    const fits = await host.evaluate(() => {
      const screen = document.querySelector('.stopwatch-screen');
      return screen.scrollHeight <= screen.clientHeight + 1 && document.documentElement.scrollWidth <= innerWidth;
    });
    expect(fits).toBe(true);
    await host.screenshot({ path: '.cache/stopwatch-results.png' });
    await host.reload();
    await expect(host.locator('.stopwatch-countdown')).toBeHidden();
    await expect(host.locator('[data-stopwatch-time]')).toHaveText(['9.99', '10.01', '12.00', '7.00']);
    await next();
    const total = await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      return api.read(localStorage.getItem('martini.host-room'), 'teamScores/totals');
    });
    expect(total).toEqual({ A: 200, B: 200, C: 0, D: 0 });
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
