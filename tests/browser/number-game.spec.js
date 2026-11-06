import { test, expect } from '@playwright/test';

for (const count of [1, 4]) test(`${count} number-game entrants finish three private rounds with fixed players and exact scores`, async ({ browser }) => {
  test.setTimeout(120000);
  const contexts = [], errors = [];
  async function newPage(mobile = false) {
    const context = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 960 } });
    contexts.push(context);
    await context.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }));
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    return page;
  }
  const host = await newPage();
  try {
    await host.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(host.locator('#manager-name')).toBeEnabled();
    await host.locator('#manager-name').fill('진행자');
    for (const id of ['A1', 'A2', 'A3', 'B1', 'C1', 'D1']) await host.locator(`#name-${id}`).fill(`${id[0]}선수${id[1]}`);
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    const invite = await host.locator('#invite-url').inputValue();
    async function join(name) {
      const page = await newPage(true);
      await page.goto(invite, { waitUntil: 'domcontentloaded' });
      await page.locator('#real-name').fill(name);
      await page.getByRole('button', { name: '입장', exact: true }).click();
      return page;
    }
    const remote = await join('진행자');
    const liar = await join('A선수1'), stopwatch = await join('A선수2');
    const ids = ['A3', 'B1', 'C1', 'D1'].slice(0, count);
    const players = [];
    for (const id of ids) players.push(await join(`${id[0]}선수${id[1]}`));
    await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      const { STAGES } = await import('/src/event-model.js');
      const room = localStorage.getItem('martini.host-room'), roster = await api.read(room, 'participants');
      const liar = await api.prepareLiarRound(room, roster, 0);
      await api.claimLiarEntry(room, 'A1', 0, liar.control.roundId);
      const stopwatch = await api.prepareStopwatch(room, roster);
      await api.claimStopwatchEntry(room, 'A2', stopwatch.control.roundId);
      await api.setPresentationSlide(room, STAGES.findIndex(stage => stage.id === 'stopwatch-score'));
    });
    const next = () => remote.getByRole('button', { name: '다음 화면', exact: true }).click();
    await next();
    await expect(host.locator('.number-intro')).toBeVisible();
    await next();
    await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
    for (const page of [liar, stopwatch]) await expect(page.getByRole('heading', { name: '라이어·스톱워치 출전자는 참여할 수 없습니다' })).toBeVisible();
    for (const player of players) {
      await player.getByRole('button', { name: /출전하기/ }).click();
      await player.getByRole('button', { name: '예', exact: true }).click();
      await expect(player.getByRole('heading', { name: '출전 확정', exact: true })).toBeVisible();
    }
    await next();
    await expect(players[0].locator('[data-number-choice]')).toHaveCount(0);
    await remote.getByRole('button', { name: '게임 시작', exact: true }).click();
    const choices = count === 1 ? [[1], [10], [6]] : [[10, 10, 8, 5], [9, 9, 4, 4], [1, 3, 5, 10]];
    for (let index = 0; index < 3; index++) {
      if (index > 0) await next();
      for (const player of players) await expect(player.locator('[data-number-choice]')).toHaveCount(0);
      await remote.getByRole('button', { name: '입력 시작', exact: true }).click();
      for (const [playerIndex, player] of players.entries()) {
        await expect(player.locator('[data-number-choice]')).toHaveCount(10);
        await expect(player.locator('[data-number-action="number-submit"]')).toBeDisabled();
        await player.locator('[data-number-choice="2"]').tap();
        await player.locator(`[data-number-choice="${choices[index][playerIndex]}"]`).tap();
        if (count === 4 && index === 0 && playerIndex === 0) {
          const fits = await player.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
          expect(fits).toBe(true);
          await player.screenshot({ path: '.cache/number-picker.png' });
        }
        await player.locator('[data-number-action="number-submit"]').tap();
        await expect(player.getByRole('heading', { name: '선택 잠금 완료', exact: true })).toBeVisible();
        if (index === 0 && playerIndex === 0) {
          await player.reload({ waitUntil: 'domcontentloaded' });
          await expect(player.getByRole('heading', { name: '선택 잠금 완료', exact: true })).toBeVisible();
        }
        if (playerIndex < count - 1) await expect(remote.getByRole('button', { name: '결과 공개', exact: true })).toBeDisabled();
      }
      await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
      await expect(host.locator('.number-card')).toHaveText(Array(4).fill('?'));
      await remote.getByRole('button', { name: '결과 공개', exact: true }).click();
      await expect(host.locator('.number-screen')).toHaveClass(/is-revealing/);
      await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
      await expect(host.locator('.number-screen')).toHaveClass(/is-settled/);
      if (count === 4 && index === 0) {
        await expect(host.locator('.number-contestant.is-duplicate')).toHaveCount(2);
        await expect(host.locator('.number-contestant.is-winner')).toHaveAttribute('data-team', 'C');
        await host.screenshot({ path: '.cache/number-results.png' });
        const fits = await host.locator('.number-screen').evaluate(element => element.scrollHeight <= element.clientHeight + 1);
        expect(fits).toBe(true);
        await host.reload({ waitUntil: 'domcontentloaded' });
        await expect(host.locator('.number-screen')).toHaveClass(/is-settled/);
      }
      if (count === 4 && index === 1) {
        await expect(host.locator('.number-verdict')).toContainText('무득점');
        for (const player of players) await expect(player.locator('.number-personal-result')).toHaveClass(/is-duplicate/);
      }
      await next();
      await expect(host.locator('.presentation')).toHaveAttribute('data-slide', `number-score-${index + 1}`);
      const snapshot = await host.evaluate(async index => {
        const api = await import('/src/event-data.js'); await api.connect();
        const room = localStorage.getItem('martini.host-room');
        await api.awardNumberPoints(room, index); await api.awardNumberPoints(room, index);
        const game = await api.read(room, 'numberGame');
        return { entrants: Object.values(game.contestants).map(person => person.participantId), scores: await api.read(room, 'teamScores') };
      }, index);
      expect(snapshot.entrants.sort()).toEqual([...ids].sort());
      expect(Object.keys(snapshot.scores.awards)).toHaveLength(index + 1);
      if (index === 2) expect(snapshot.scores.totals).toEqual(count === 1 ? { A: 170, B: 0, C: 0, D: 0 } : { A: 0, B: 0, C: 80, D: 100 });
    }
    await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
    await expect(host.getByRole('heading', { name: '눈치 게임 최종 점수', exact: true })).toBeVisible();
    await remote.getByRole('button', { name: '설정', exact: true }).click();
    await expect(host.locator('.dashboard')).toBeVisible();
    await host.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(host.locator('.dashboard')).toBeVisible();
    expect(await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      return api.read(localStorage.getItem('martini.host-room'), 'numberGame');
    })).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    if (errors.length) console.log('Page errors', errors);
    await Promise.all(contexts.map(context => context.close()));
  }
});
