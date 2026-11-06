import { test, expect } from '@playwright/test';

test('reaction compares local durations despite delayed signals and keeps scores idempotent', async ({ browser }) => {
  test.setTimeout(90000);
  const contexts = [];
  async function newPage() {
    const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
    contexts.push(context);
    await context.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }));
    return context.newPage();
  }
  const host = await newPage();
  try {
    await host.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(host.locator('#manager-name')).toBeEnabled();
    await host.locator('#manager-name').fill('순발력진행자');
    for (const [id, name] of [['A1', '첫선수'], ['B1', '둘째선수'], ['A2', '관전자']]) await host.locator(`#name-${id}`).fill(name);
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    const invite = await host.locator('#invite-url').inputValue();
    const [remote, first, second, spectator] = await Promise.all(Array.from({ length: 4 }, newPage));
    for (const [page, name] of [[remote, '순발력진행자'], [first, '첫선수'], [second, '둘째선수'], [spectator, '관전자']]) {
      await page.goto(invite, { waitUntil: 'domcontentloaded' });
      await page.locator('#real-name').fill(name);
      await page.getByRole('button', { name: '입장', exact: true }).click();
    }
    await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      const { STAGES } = await import('/src/event-model.js');
      await api.setPresentationSlide(localStorage.getItem('martini.host-room'), STAGES.findIndex(stage => stage.id === 'memory-score'));
    });
    const next = () => remote.getByRole('button', { name: '다음 화면', exact: true }).click();
    await next();
    await expect(host.getByRole('heading', { name: '순발력 측정', exact: true })).toBeVisible();
    for (const phone of [first, second, spectator]) {
      await expect(phone.getByRole('heading', { name: '대기 중', exact: true })).toBeVisible();
      await expect(phone.getByRole('alert')).toHaveCount(0);
    }
    await next();
    await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
    for (const player of [first, second]) {
      await player.getByRole('button', { name: /출전하기/ }).click();
      await player.getByRole('button', { name: '예', exact: true }).click();
      await expect(player.getByRole('heading', { name: '출전 확정', exact: true })).toBeVisible();
    }
    await expect(spectator.getByRole('button', { name: /출전하기/ })).toHaveCount(0);
    await expect(spectator.getByRole('alert')).toHaveCount(0);
    await next();
    await expect(host.locator('.reaction-screen')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(host.locator('.reaction-screen')).toHaveText('터치를 기다리세요');
    await expect(first.locator('.reaction-tap')).toHaveCount(0);
    await expect(first.getByRole('button', { name: /터치를 기다리세요/ })).toBeVisible();
    await expect(host.locator('.reaction-winner')).toHaveCount(0);
    await second.context().setOffline(true);
    await first.waitForTimeout(200);
    await remote.getByRole('button', { name: '터치 신호 보내기', exact: true }).click();
    await expect(host.locator('.reaction-screen h1')).toHaveText('지금 터치하세요!');
    await expect(first.locator('.reaction-tap')).toBeEnabled();
    await expect(spectator.locator('.reaction-tap')).toHaveCount(0);
    await first.waitForTimeout(500);
    const target = await first.locator('.reaction-tap').boundingBox();
    await first.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await first.mouse.down();
    await expect(first.getByRole('heading', { name: '제출 완료', exact: true })).toBeVisible();
    await first.mouse.up();
    await expect(host.locator('.reaction-results')).toHaveCount(0);
    await expect(remote.locator('.remote-game-controls')).toContainText('1 / 2명 측정 완료');
    await second.context().setOffline(false);
    await expect(second.locator('.reaction-tap')).toBeEnabled();
    await second.locator('.reaction-tap').click();
    await expect(host.locator('.reaction-results')).toBeVisible();
    for (const phone of [first, second, spectator]) await expect(phone.getByRole('alert')).toHaveCount(0);
    const result = await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      return api.read(localStorage.getItem('martini.host-room'), 'reactionGame');
    });
    expect(result.submissions.A.submittedAt).toBeLessThanOrEqual(result.submissions.B.submittedAt);
    expect(result.result.elapsedMs.B).toBeLessThan(result.result.elapsedMs.A);
    expect(result.result.points).toEqual({ A: 0, B: 100, C: 0, D: 0 });
    await host.screenshot({ path: '.cache/reaction-local-result.png' });
    await next();
    await expect(host.getByRole('heading', { name: '순발력 측정 점수', exact: true })).toBeVisible();
    const scores = await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      const room = localStorage.getItem('martini.host-room');
      await api.awardReactionPoints(room); await api.awardReactionPoints(room);
      return api.read(room, 'teamScores/totals');
    });
    expect(scores).toEqual({ A: 0, B: 100, C: 0, D: 0 });
    await remote.getByRole('button', { name: '설정', exact: true }).click();
    await expect(host.locator('.dashboard')).toBeVisible();
    await host.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(host.locator('.dashboard')).toBeVisible();
    await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      const { STAGES } = await import('/src/event-model.js');
      const room = localStorage.getItem('martini.host-room');
      if (await api.read(room, 'reactionGame')) throw new Error('Reaction game was not reset');
      const presentation = await api.read(room, 'presentation');
      await api.setPresentationSlide(room, STAGES.findIndex(stage => stage.id === 'reaction-intro'), presentation.resetAt);
    });
    await next();
    await first.getByRole('button', { name: /출전하기/ }).click();
    await first.getByRole('button', { name: '예', exact: true }).click();
    await next();
    await remote.getByRole('button', { name: '터치 신호 보내기', exact: true }).click();
    await first.getByRole('button', { name: '지금 터치하세요!', exact: true }).click();
    await expect(host.locator('.reaction-results [data-team="A"]')).toContainText('+100점');
    await next();
    await expect(host.locator('[data-score-team="A"]')).toHaveText('100');
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('early touches remain disqualified after a delayed upload and all false starts award zero', async ({ browser }) => {
  test.setTimeout(90000);
  const contexts = [];
  async function newPage() {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 } });
    contexts.push(context);
    await context.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }));
    return context.newPage();
  }
  const host = await newPage();
  try {
    await host.setViewportSize({ width: 1440, height: 960 });
    await host.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(host.locator('#manager-name')).toBeEnabled();
    await host.locator('#manager-name').fill('실격검증진행자');
    await host.locator('#name-A1').fill('먼저누른선수');
    await host.locator('#name-B1').fill('기다린선수');
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    const invite = await host.locator('#invite-url').inputValue();
    const [remote, first, second] = await Promise.all(Array.from({ length: 3 }, newPage));
    for (const [page, name] of [[remote, '실격검증진행자'], [first, '먼저누른선수'], [second, '기다린선수']]) {
      await page.goto(invite, { waitUntil: 'domcontentloaded' });
      await page.locator('#real-name').fill(name);
      await page.getByRole('button', { name: '입장', exact: true }).click();
    }
    const next = () => remote.getByRole('button', { name: '다음 화면', exact: true }).click();
    async function recruit() {
      await host.evaluate(async () => {
        const api = await import('/src/event-data.js'); await api.connect();
        const { STAGES } = await import('/src/event-model.js');
        const room = localStorage.getItem('martini.host-room');
        const presentation = await api.read(room, 'presentation');
        await api.setPresentationSlide(room, STAGES.findIndex(stage => stage.id === 'reaction-intro'), presentation.resetAt);
      });
      await expect(host.getByRole('heading', { name: '순발력 측정', exact: true })).toBeVisible();
      await next();
      for (const page of [first, second]) {
        await page.getByRole('button', { name: /출전하기/ }).click();
        await page.getByRole('button', { name: '예', exact: true }).click();
        await expect(page.getByRole('heading', { name: '출전 확정', exact: true })).toBeVisible();
      }
      await next();
      await expect(host.locator('.reaction-screen h1')).toHaveText('터치를 기다리세요');
      for (const page of [first, second]) await expect(page.getByRole('button', { name: /터치를 기다리세요/ })).toBeEnabled();
    }
    await recruit();
    await first.screenshot({ path: '.cache/reaction-waiting-mobile.png' });
    await first.context().setOffline(true);
    const target = await first.locator('.reaction-black').boundingBox();
    await first.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await first.mouse.down();
    await expect(first.getByRole('heading', { name: '실격', exact: true })).toBeVisible();
    await remote.getByRole('button', { name: '터치 신호 보내기', exact: true }).click();
    await first.mouse.up();
    await second.getByRole('button', { name: '지금 터치하세요!', exact: true }).click();
    await expect(host.locator('.reaction-results')).toHaveCount(0);
    await first.context().setOffline(false);
    await expect(host.locator('.reaction-results [data-team="A"]')).toContainText('실격');
    await expect(host.locator('.reaction-results [data-team="A"]')).not.toContainText('+100점');
    await expect(host.locator('.reaction-results [data-team="B"]')).toContainText('+100점');
    await first.reload();
    await expect(first.getByRole('heading', { name: '실격', exact: true })).toBeVisible();
    await expect(first.locator('.reaction-tap')).toHaveCount(0);
    await expect(first.getByRole('alert')).toHaveCount(0);
    await next();
    await expect(host.locator('[data-score-team="A"]')).toHaveText('0');
    await expect(host.locator('[data-score-team="B"]')).toHaveText('100');
    await remote.getByRole('button', { name: '설정', exact: true }).click();
    await expect(host.locator('.dashboard')).toBeVisible();
    await host.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(host.locator('.dashboard')).toBeVisible();
    await recruit();
    for (const page of [first, second]) await page.getByRole('button', { name: /터치를 기다리세요/ }).click();
    await expect(host.locator('.reaction-results [data-team="A"]')).toContainText('실격');
    await expect(host.locator('.reaction-results [data-team="B"]')).toContainText('실격');
    await expect(remote.locator('.remote-game-controls')).toContainText('전원 실격');
    await host.screenshot({ path: '.cache/reaction-disqualified-result.png' });
    await next();
    for (const team of ['A', 'B']) await expect(host.locator(`[data-score-team="${team}"]`)).toHaveText('0');
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
