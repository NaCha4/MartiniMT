import { test, expect } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, set } from 'firebase/database';
import { yutDisplayPosition, yutHome } from '../../src/yut-model.js';

test('yut dragging, stacking, capture, reload, one-time scoring and all four awards', async ({ browser }) => {
  test.setTimeout(120000);
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const phone = await browser.newContext({ viewport: { width: 920, height: 440 }, isMobile: true, hasTouch: true });
  await phone.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }));
  const host = await desktop.newPage(), remote = await phone.newPage();
  const errors = [];
  for (const page of [host, remote]) page.on('pageerror', error => errors.push(error.message));
  const environment = await initializeTestEnvironment({ projectId: 'demo-martini-mt-default-rtdb', database: { host: '127.0.0.1', port: 9000 } });
  try {
    await host.goto('/');
    await host.locator('#manager-name').fill('윷진행자');
    await host.locator('#name-A1').fill('테스트참가자');
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    const invite = await host.locator('#invite-url').inputValue();
    const room = new URL(invite).searchParams.get('room');
    await remote.goto(invite);
    await remote.locator('#real-name').fill('윷진행자');
    await remote.getByRole('button', { name: '입장', exact: true }).click();
    await expect(remote.locator('.manager-controller')).toBeVisible();
    const index = await host.evaluate(async () => (await import('/src/event-model.js')).STAGES.findIndex(stage => stage.id === 'yut-intro'));
    await host.locator('#debug-game-jump').selectOption(String(index));
    await expect(host.locator('.yut-intro')).toBeVisible();
    await expect(host.locator('#debug-game-jump')).toBeDisabled();
    await host.locator('.yut-intro h1').click();
    await host.locator('.yut-intro h1').click({ button: 'right' });
    for (const key of ['ArrowRight', 'PageDown', ' ', 'ArrowLeft', 'PageUp', 'Escape']) await host.keyboard.press(key);
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'yut-intro');
    await remote.getByRole('button', { name: '다음 화면', exact: true }).click();
    await expect(host.locator('[data-yut-piece]')).toHaveCount(16);
    await host.locator('.presentation').click({ position: { x: 4, y: 80 } });
    await host.keyboard.press('ArrowRight');
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'yut-board');
    for (const viewport of [{ width: 1440, height: 960 }, { width: 1280, height: 720 }]) {
      await host.setViewportSize(viewport);
      await expect.poll(() => host.locator('.yut-surface').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return Math.abs(rect.width / rect.height - 1);
      })).toBeLessThan(.001);
      await expect.poll(() => host.locator('.yut-surface').evaluate(element => element.getBoundingClientRect().height / innerHeight)).toBeGreaterThan(.75);
    }
    await host.setViewportSize({ width: 1440, height: 960 });

    async function expectPosition(id, expected) {
      await expect.poll(() => host.evaluate(async id => {
        const api = await import('/src/event-data.js');
        return (await api.read(localStorage.getItem('martini.host-room'), 'yutGame')).pieces[id];
      }, id)).toMatchObject(expected);
      await expect(host.locator('[data-yut-piece]:disabled')).toHaveCount(0);
    }
    async function drag(id, x, y, expected = { x, y }) {
      const piece = host.locator(`[data-yut-piece="${id}"]`);
      await expect(piece).toBeEnabled();
      const token = await piece.boundingBox(), board = await host.locator('[data-yut-board]').boundingBox();
      await host.mouse.move(token.x + token.width / 2, token.y + token.height / 2);
      await host.mouse.down();
      const target = y >= 80 && y <= 600 && x >= 240 && x <= 760 ? yutDisplayPosition({ x, y }, id) : { x, y };
      await host.mouse.move(board.x + target.x / 1000 * board.width, board.y + target.y / 680 * board.height, { steps: 8 });
      await host.mouse.up();
      await expectPosition(id, expected);
    }
    await drag('A1', 500, 650, yutHome('A1'));
    await host.locator('[data-yut-piece="A1"]').click();
    await expect(host.locator('[data-yut-piece="A1"]')).toHaveAttribute('aria-pressed', 'true');
    await host.locator('.yut-node.is-center').click();
    await expectPosition('A1', { x: 500, y: 340 });
    await drag('A1', 500, 650, yutHome('A1'));
    await drag('A1', 500, 340);
    await drag('A1', 5, 30, { x: 500, y: 340 });
    await host.locator('[data-yut-piece="A2"]').click();
    await host.locator('[data-yut-piece="A1"]').click();
    await expectPosition('A2', { x: 500, y: 340 });
    await expect(host.locator('[data-yut-piece="A1"]')).toContainText('×2');
    await expect(host.locator('[data-yut-piece]')).toHaveCount(15);
    await host.locator('[data-yut-piece="A1"]').click({ button: 'right' });
    await expect(host.locator('[data-yut-piece]')).toHaveCount(16);
    await drag('B1', 240, 80);
    await drag('B2', 240, 80);
    await expect(host.locator('[data-yut-piece="B1"]')).toContainText('×2');
    await drag('A1', 240, 80);
    await expect(host.locator('[data-yut-piece]')).toHaveCount(16);
    await expect.poll(() => host.locator('[data-yut-piece="B1"]').evaluate(element => element.style.left)).toBe('6%');
    await host.screenshot({ path: '.cache/screenshots/yut-board.png' });
    await host.reload();
    await expect(host.locator('[data-yut-piece="A1"]')).toHaveCSS('left', /px$/);
    await expect.poll(() => host.locator('[data-yut-piece="A1"]').evaluate(element => element.style.left)).toBe('22%');

    await environment.withSecurityRulesDisabled(async context => {
      const totals = { A: 350, B: 200, C: 100, D: 50 };
      await set(ref(context.database(), `mtChatV1/sessions/${room}/teamScores`), { totals, awards: { ['s'.repeat(20)]: { before: { A: 0, B: 0, C: 0, D: 0 }, after: totals, points: totals, awardedAt: 1 } } });
    });
    await remote.getByRole('button', { name: '3조 우승 +300', exact: true }).click();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'final-ranking');
    await expect(host.locator('[data-score-team="C"]')).toHaveText('400');
    await host.screenshot({ path: '.cache/screenshots/yut-final-ranking.png' });
    await host.evaluate(async () => {
      const api = await import('/src/event-data.js');
      const room = localStorage.getItem('martini.host-room');
      const game = await api.read(room, 'yutGame');
      await Promise.all([api.finishYutGame(room, game.control.roundId, 'A'), api.finishYutGame(room, game.control.roundId, 'C')]);
    });
    for (const [index, team] of ['C', 'A', 'B', 'D'].entries()) {
      await expect(host.locator('.final-award')).toHaveAttribute('data-award-index', String(index), { timeout: 15000 });
      await expect(host.locator('.final-award')).toHaveAttribute('data-award-team', team);
      if (index === 0) {
        await host.waitForTimeout(1800);
        await host.screenshot({ path: '.cache/screenshots/yut-first-award.png' });
        await host.reload();
      }
    }
    const totals = await host.evaluate(async () => (await import('/src/event-data.js')).read(localStorage.getItem('martini.host-room'), 'teamScores'));
    expect(totals.totals).toEqual({ A: 350, B: 200, C: 400, D: 50 });
    expect(Object.keys(totals.awards)).toHaveLength(2);
    await host.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    expect(await host.evaluate(async () => (await import('/src/event-data.js')).read(localStorage.getItem('martini.host-room'), 'yutGame'))).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([desktop.close(), phone.close()]);
    await environment.cleanup();
  }
});
