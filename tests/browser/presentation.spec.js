import { test, expect } from '@playwright/test';

test('presentation navigation, live check-in, fullscreen and first-touch race', async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 768 }, screen: { width: 1920, height: 1080 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const second = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });
  const host = await desktop.newPage(), alice = await mobile.newPage(), bob = await second.newPage();
  await mobile.addInitScript(() => {
    window.orientationRequests = [];
    Object.defineProperty(screen.orientation, 'lock', { value: async mode => { window.orientationRequests.push(mode); } });
  });
  await second.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { get: () => false });
  });
  const errors = [];
  for (const page of [host, alice, bob]) page.on('pageerror', error => errors.push(error.message));
  try {
    await host.goto('/');
    await expect(host.getByRole('button', { name: '명단 저장' })).toBeEnabled();
    for (const team of ['A', 'B', 'C', 'D']) for (let number = 1; number <= 6; number++) await host.locator(`#name-${team}${number}`).fill(`${team}참가자${number}`);
    await host.locator('#name-A1').fill('김지민'); await host.locator('#name-A2').fill('이서연');
    await host.getByRole('button', { name: '발표 시작' }).click();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await expect(host.locator('header, footer')).toHaveCount(0);
    await expect(host.locator('.stage-person')).toHaveCount(24);
    const invite = await host.locator('#invite-url').inputValue();
    expect(await host.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const qr = await host.locator('.qr-paper').boundingBox();
    expect(qr.y + qr.height).toBeLessThanOrEqual(768);

    await host.getByRole('button', { name: '전체화면' }).click();
    await expect.poll(() => host.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await expect(host.getByRole('button', { name: '전체화면' })).toHaveCount(0);
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await host.evaluate(() => document.exitFullscreen());
    await expect(host.getByRole('button', { name: '전체화면' })).toBeVisible();

    async function join(page, name) {
      await page.goto(invite);
      await expect(page.getByRole('heading', { name: '휴대폰을 가로로 돌려주세요.' })).toBeVisible();
      await expect(page.locator('header, footer')).toHaveCount(0);
      await expect(page.locator('#real-name')).toHaveCount(0);
      await page.setViewportSize(name === '김지민' ? { width: 844, height: 390 } : { width: 740, height: 320 });
      if (name === '김지민') {
        await page.getByRole('button', { name: '전체화면으로 시작' }).click();
        await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
        expect(await page.evaluate(() => window.orientationRequests)).toEqual(['landscape']);
      }
      await page.locator('#real-name').fill(name);
      await expect(page.getByRole('button', { name: '입장', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: '입장', exact: true }).click();
      await expect(page.getByRole('heading', { name: '대기 중' })).toBeVisible();
      await expect(page.locator('header, footer, #message-input')).toHaveCount(0);
    }
    await join(alice, '김지민'); await join(bob, '이서연');
    await alice.evaluate(() => document.exitFullscreen());
    await expect(alice.getByRole('button', { name: '전체화면으로 시작' })).toBeVisible();
    await alice.getByRole('button', { name: '전체화면으로 시작' }).click();
    await expect(alice.getByRole('heading', { name: '대기 중' })).toBeVisible();
    await bob.setViewportSize({ width: 320, height: 740 });
    await expect(bob.getByRole('heading', { name: '휴대폰을 가로로 돌려주세요.' })).toBeVisible();
    await bob.setViewportSize({ width: 740, height: 320 });
    await expect(bob.getByRole('heading', { name: '대기 중' })).toBeVisible();
    await expect(host.locator('.arrival-heading strong')).toHaveText('2');
    await host.screenshot({ path: '.cache/screenshots/presentation-qr.png', fullPage: true });
    await alice.screenshot({ path: '.cache/screenshots/mobile-wait.png', fullPage: true });
    await host.locator('.presentation-title').click();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'touch');
    await expect(alice.locator('#tap-target')).toBeEnabled();
    await expect(bob.locator('#tap-target')).toBeEnabled();
    expect(await bob.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const tapArea = await alice.locator('#tap-target').boundingBox();
    expect(tapArea).toMatchObject({ x: 0, y: 0, width: 844, height: 390 });
    await alice.screenshot({ path: '.cache/screenshots/mobile-tap.png', fullPage: true });
    await alice.locator('#tap-target').tap();
    await expect(host.locator('#winner-name')).toHaveText('김지민');
    await expect(bob.locator('#tap-target')).toHaveCount(0);
    await expect(bob.getByRole('heading', { name: '끝났습니다' })).toBeVisible();
    await expect(bob.getByText('선착순 입력이 마감되었습니다.')).toBeVisible();
    await host.screenshot({ path: '.cache/screenshots/presentation-winner.png', fullPage: true });

    await host.locator('.presentation-title').click({ button: 'right' });
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await expect(alice.getByRole('heading', { name: '대기 중' })).toBeVisible();
    await expect(host.locator('.arrival-heading strong')).toHaveText('2');
    await host.locator('.presentation-title').click();
    await expect(bob.locator('#tap-target')).toBeEnabled();
    await expect(host.locator('#winner-name')).toHaveCount(0);
    await bob.locator('#tap-target').tap();
    await expect(host.locator('#winner-name')).toHaveText('이서연');
    await expect(alice.locator('#tap-target')).toHaveCount(0);
    await host.locator('.presentation-title').click({ button: 'right' });
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await host.locator('.presentation-title').click();
    await expect(alice.locator('#tap-target')).toBeEnabled();
    await expect(bob.locator('#tap-target')).toBeEnabled();
    const fireAt = Date.now() + 500;
    const dispatched = await Promise.all([alice, bob].map(page => page.evaluate(at => new Promise(resolve => {
      setTimeout(() => {
        const target = document.querySelector('#tap-target');
        target?.dispatchEvent(new PointerEvent('pointerdown', { isPrimary: true, button: 0 }));
        resolve(Boolean(target));
      }, Math.max(0, at - Date.now()));
    }), fireAt)));
    expect(dispatched.some(Boolean)).toBe(true);
    await expect(host.locator('#winner-name')).toHaveText(/김지민|이서연/);
    await expect(alice.locator('#tap-target')).toHaveCount(0);
    await expect(bob.locator('#tap-target')).toHaveCount(0);
    await expect(alice.getByRole('heading', { name: '끝났습니다' })).toBeVisible();
    await expect(bob.getByRole('heading', { name: '끝났습니다' })).toBeVisible();
    await expect(alice.locator('[role="alert"]')).toHaveCount(0);
    await expect(bob.locator('[role="alert"]')).toHaveCount(0);
    await host.keyboard.press('Escape');
    await expect(host.getByRole('button', { name: '발표 시작' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await Promise.all([desktop.close(), mobile.close(), second.close()]); }
});
