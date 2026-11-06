import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('four-digit and larger cumulative scores stay on one line within their rows', async ({ page }) => {
  const styles = await readFile(new URL('../../src/event-style.css', import.meta.url), 'utf8');
  const tokens = await readFile(new URL('../../src/design-tokens.css', import.meta.url), 'utf8');
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 960 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.setContent(`<style>${tokens}\n${styles.replace(/^@import[^;]+;/, '')}</style><div class="presentation"><main class="presentation-main"><section class="taste-screen taste-score"><div class="scoreboard" style="--score-elapsed:-5s">${['1080', '9900', '10500', '100000'].map((score, index) => `<article class="score-row" style="--from-rank:${index};--to-rank:${index}"><span class="score-rank">${index + 1}<small>위</small></span><h2>${index + 1}조</h2><span class="score-earned">+200</span><strong>${score}</strong><span class="score-unit">점</span></article>`).join('')}</div></section></main></div>`);
    const fits = await page.locator('.score-row strong').evaluateAll(scores => scores.every(score => {
      const range = document.createRange();
      range.selectNodeContents(score);
      const text = range.getBoundingClientRect();
      const row = score.closest('.score-row').getBoundingClientRect();
      return range.getClientRects().length === 1 && text.left >= row.left && text.right <= row.right
        && text.top >= row.top && text.bottom <= row.bottom;
    }));
    expect(fits).toBe(true);
  }
  await page.screenshot({ path: '.cache/audit-large-score-layout.png' });
});

test('local presentation errors stay dismissible and remote dismissal preserves newer errors', async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 768 }, screen: { width: 1920, height: 1080 } });
  const mobile = await browser.newContext({ viewport: { width: 900, height: 420 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }));
  const host = await desktop.newPage(), remote = await mobile.newPage();
  const errors = [];
  for (const page of [host, remote]) page.on('pageerror', error => errors.push(error.message));
  try {
    await host.goto('/');
    await expect(host.locator('.connection')).toContainText('로컬 테스트');
    await host.locator('#name-A1').fill('오류확인참가자');
    await host.locator('#manager-name').fill('오류확인진행자');
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    await remote.goto(await host.locator('#invite-url').inputValue());
    await remote.locator('#real-name').fill('오류확인진행자');
    await remote.getByRole('button', { name: '입장', exact: true }).click();
    await expect(remote.locator('.manager-controller')).toBeVisible();

    await host.evaluate(() => {
      document.documentElement.requestFullscreen = async () => { throw new Error('test fullscreen failure'); };
    });
    await host.getByRole('button', { name: '전체화면', exact: true }).click();
    await expect(remote.getByRole('alert')).toContainText('전체화면으로 전환할 수 없습니다.');
    await expect(host.getByRole('alert')).toContainText('전체화면으로 전환할 수 없습니다.');
    await expect(host.locator('.presentation-screen-code')).toHaveText('1');
    await remote.screenshot({ path: '.cache/screenshots/remote-operator-error.png' });
    await remote.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(remote.getByRole('alert')).toHaveCount(0);
    await host.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(host.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);

    await host.evaluate(async () => {
      const source = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/event-data.js');
      const api = await import(source.name);
      const room = localStorage.getItem('martini.host-room');
      await api.reportOperatorError(room, '처리하지 못했어요. 잠시 뒤 다시 시도해주세요.');
      const previous = await api.read(room, 'operatorError');
      await api.reportOperatorError(room, '새로운 오류를 확인해주세요.');
      await api.clearOperatorError(room, previous.id);
    });
    await expect(remote.getByRole('alert')).toContainText('새로운 오류를 확인해주세요.');
    await expect(host.getByRole('alert')).toHaveCount(0);
    await remote.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(remote.getByRole('alert')).toHaveCount(0);
  } finally {
    await Promise.all([desktop.close(), mobile.close()]);
  }
});

async function advanceSlide(remote, direction = 'next') {
  await remote.getByRole('button', { name: direction === 'previous' ? '이전 화면' : '다음 화면', exact: true }).click();
}

test('Chrome mobile emulation keeps participants and the manager in windowed mode', async ({ browser }) => {
  const desktop = await browser.newContext();
  const phones = await Promise.all([
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  ].map(userAgent => browser.newContext({
    viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true,
    userAgent,
  })));
  for (const context of phones) await context.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
  });
  const host = await desktop.newPage();
  const [participant, remote] = await Promise.all(phones.map(context => context.newPage()));
  try {
    await host.goto('/');
    await expect(host.locator('#manager-name')).toBeEnabled();
    await host.locator('#manager-name').fill('진행자');
    await host.locator('#name-A1').fill('참가자');
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    const invite = await host.locator('#invite-url').inputValue();
    for (const [page, name] of [[participant, '참가자'], [remote, '진행자']]) {
      await page.goto(invite);
      expect(await page.evaluate(() => document.fullscreenEnabled)).toBe(true);
      await page.locator('#real-name').fill(name);
      await page.getByRole('button', { name: '입장', exact: true }).click();
      await expect(page.locator('.controller-gate')).toHaveCount(0);
      expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    }
    await expect(participant.getByRole('heading', { name: '대기 중' })).toBeVisible();
    await expect(remote.locator('.manager-controller')).toBeVisible();
    await participant.screenshot({ path: '.cache/screenshots/windowed-participant.png' });
    await remote.screenshot({ path: '.cache/screenshots/windowed-manager.png' });
    await remote.getByRole('button', { name: '다음 화면', exact: true }).click();
    await expect(participant.locator('#tap-target')).toBeEnabled();
    await participant.locator('#tap-target').click();
    await expect(host.locator('#winner-name')).toHaveText('참가자');
    await participant.reload();
    await expect(participant.getByRole('heading', { name: '가장 먼저 터치했습니다!' })).toBeVisible();
    await expect(participant.locator('.controller-gate')).toHaveCount(0);
    await remote.setViewportSize({ width: 390, height: 844 });
    await expect(remote.getByRole('heading', { name: '가로 화면으로 진행합니다.' })).toBeVisible();
    await remote.setViewportSize({ width: 844, height: 390 });
    await expect(remote.locator('.manager-controller')).toBeVisible();
  } finally {
    await Promise.all([desktop, ...phones].map(context => context.close()));
  }
});

test('presentation navigation, live check-in, fullscreen and first-touch race', async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 768 }, screen: { width: 1920, height: 1080 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const second = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });
  const controller = await browser.newContext({ viewport: { width: 900, height: 420 }, isMobile: true, hasTouch: true });
  await controller.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }));
  const remote = await controller.newPage();
  const host = await desktop.newPage(), alice = await mobile.newPage(), bob = await second.newPage();
  await mobile.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'Linux armv8l' });
    window.orientationRequests = [];
    Object.defineProperty(screen.orientation, 'lock', { value: async mode => { window.orientationRequests.push(mode); } });
  });
  await second.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { get: () => false });
  });
  const errors = [];
  for (const page of [host, alice, bob, remote]) page.on('pageerror', error => errors.push(error.message));
  try {
    await host.goto('/');
    await expect(host.locator('.connection')).toContainText('로컬 테스트');
    await expect(host.getByRole('button', { name: '발표 시작' })).toBeEnabled();
    await expect(host.getByRole('button', { name: '명단 저장' })).toHaveCount(0);
    await expect(host.locator('#event-title, [data-team-name]')).toHaveCount(0);
    await expect(host.locator('.team-heading h3')).toHaveText(['1조', '2조', '3조', '4조']);
    for (const team of ['A', 'B', 'C', 'D']) for (let number = 1; number <= 6; number++) await host.locator(`#name-${team}${number}`).fill(`${team}참가자${number}`);
    await host.locator('#name-A1').fill('김지민'); await host.locator('#name-A2').fill('이서연');
    await host.locator('#manager-name').fill('이동진행자');
    await host.getByRole('button', { name: '발표 시작' }).click();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await expect(host.locator('.presentation-screen-code')).toHaveText('1');
    await expect(host.locator('.presentation-screen-code')).toBeVisible();
    await expect(host.locator('header, footer')).toHaveCount(0);
    await expect(host.locator('.stage-person')).toHaveCount(24);
    await expect(host.locator('.presentation-title')).toHaveCount(0);
    await expect(host.getByText('휴대폰 카메라로 스캔하세요.')).toHaveCount(0);
    await expect(host.locator('.synapse-trunk')).toHaveCount(4);
    await expect(host.locator('.synapse-link')).toHaveCount(24);
    await expect(host.locator('.stage-team-name')).toHaveText(['1조', '2조', '3조', '4조']);
    const invite = await host.locator('#invite-url').inputValue();
    await remote.goto(invite);
    await remote.locator('#real-name').fill('이동진행자');
    await remote.getByRole('button', { name: '입장', exact: true }).click();
    await expect(remote.locator('.manager-controller')).toBeVisible();
    expect(await host.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const qr = await host.locator('.qr-paper').boundingBox();
    expect(qr.y + qr.height).toBeLessThanOrEqual(768);
    expect(Math.abs(qr.x + qr.width / 2 - 1366 / 2)).toBeLessThan(2);
    expect(Math.abs(qr.y + qr.height / 2 - 768 / 2)).toBeLessThan(2);
    const overlaps = await host.locator('.stage-person').evaluateAll(nodes => {
      const rectangles = nodes.map(node => node.getBoundingClientRect());
      const center = document.querySelector('.synapse-core').getBoundingClientRect();
      const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return rectangles.some((rectangle, index) => intersects(rectangle, center) || rectangles.slice(index + 1).some(other => intersects(rectangle, other)));
    });
    expect(overlaps).toBe(false);
    await host.getByRole('button', { name: '전체화면' }).click();
    await expect.poll(() => host.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await expect(host.getByRole('button', { name: '전체화면' })).toHaveCount(0);
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await host.evaluate(() => document.exitFullscreen());
    await expect(host.getByRole('button', { name: '전체화면' })).toBeVisible();
    for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      await host.setViewportSize(viewport);
      const fits = await host.locator('.stage-person').evaluateAll(nodes => {
        const rectangles = nodes.map(node => node.getBoundingClientRect());
        const fixed = [...document.querySelectorAll('.synapse-core, .team-hub')].map(node => node.getBoundingClientRect());
        const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return rectangles.every((rectangle, index) => rectangle.left >= 0 && rectangle.top >= 0
          && rectangle.right <= innerWidth && rectangle.bottom <= innerHeight
          && !fixed.some(other => intersects(rectangle, other))
          && !rectangles.slice(index + 1).some(other => intersects(rectangle, other)));
      });
      expect(fits).toBe(true);
    }
    await host.setViewportSize({ width: 1366, height: 768 });

    async function join(page, name) {
      await page.goto(invite);
      await expect(page.locator('header, footer')).toHaveCount(0);
      await expect(page.locator('#real-name')).toBeVisible();
      await expect(page.getByRole('button', { name: '전체화면으로 시작' })).toHaveCount(0);
      await page.locator('#real-name').fill(name);
      await expect(page.getByRole('button', { name: '입장', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: '입장', exact: true }).click();
      await expect(page.getByRole('heading', { name: name === '김지민' ? '전체화면 버튼을 눌러주세요.' : '가로 화면으로 진행합니다.' })).toBeVisible();
      await page.setViewportSize(name === '김지민' ? { width: 844, height: 390 } : { width: 740, height: 320 });
      if (name === '김지민') {
        await page.getByRole('button', { name: '전체화면으로 시작' }).click();
        await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
        expect(await page.evaluate(() => window.orientationRequests)).toEqual(['landscape-primary']);
      }
      await expect(page.getByRole('heading', { name: '대기 중' })).toBeVisible();
      await expect(page.locator('.controller-identity')).toHaveText(`1조 · ${name}`);
      await expect(page.locator('header, footer, #message-input')).toHaveCount(0);
    }
    await join(alice, '김지민'); await join(bob, '이서연');
    await alice.evaluate(() => document.exitFullscreen());
    await expect(alice.getByRole('button', { name: '전체화면으로 시작' })).toBeVisible();
    await alice.getByRole('button', { name: '전체화면으로 시작' }).click();
    await expect(alice.getByRole('heading', { name: '대기 중' })).toBeVisible();
    await bob.setViewportSize({ width: 320, height: 740 });
    await expect(bob.getByRole('heading', { name: '가로 화면으로 진행합니다.' })).toBeVisible();
    await bob.setViewportSize({ width: 740, height: 320 });
    await expect(bob.getByRole('heading', { name: '대기 중' })).toBeVisible();
    await expect(host.locator('.arrival-heading strong')).toHaveText('2');
    await host.screenshot({ path: '.cache/screenshots/presentation-qr.png', fullPage: true });
    await alice.screenshot({ path: '.cache/screenshots/mobile-wait.png', fullPage: true });
    await host.locator('.presentation').click({ position: { x: 16, y: 16 } });
    await host.locator('.presentation').click({ button: 'right', position: { x: 16, y: 16 } });
    for (const key of ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', ' ', 'Escape']) await host.keyboard.press(key);
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await expect(host.locator('#debug-game-jump, [data-action="reset"]')).toHaveCount(0);
    await advanceSlide(remote);
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'touch');
    await expect(host.locator('.presentation-screen-code')).toHaveText('2');
    await expect(alice.locator('.presentation-screen-code')).toHaveCount(0);
    await expect(alice.locator('#tap-target')).toBeEnabled();
    await expect(bob.locator('#tap-target')).toBeEnabled();
    await expect(host.locator('.presentation-title')).toHaveCount(0);
    await expect(host.locator('.race-waiting')).toContainText('터치하세요!');
    await host.screenshot({ path: '.cache/screenshots/presentation-race.png', fullPage: true });
    expect(await bob.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const tapArea = await alice.locator('#tap-target').boundingBox();
    expect(tapArea).toMatchObject({ x: 0, y: 0, width: 844, height: 390 });
    await alice.screenshot({ path: '.cache/screenshots/mobile-tap.png', fullPage: true });
    await alice.evaluate(() => document.exitFullscreen());
    await alice.getByRole('button', { name: '전체화면으로 시작' }).click();
    await expect(alice.locator('#tap-target')).toBeDisabled();
    await alice.locator('#tap-target').evaluate(target => {
      target.dispatchEvent(new PointerEvent('pointerdown', { isPrimary: true, button: 0 }));
    });
    await expect(host.locator('#winner-name')).toHaveCount(0);
    await expect(alice.locator('#tap-target')).toBeEnabled();
    await alice.locator('#tap-target').tap();
    await expect(host.locator('#winner-name')).toHaveText('김지민');
    await expect(bob.locator('#tap-target')).toHaveCount(0);
    await expect(alice.getByRole('heading', { name: '가장 먼저 터치했습니다!' })).toBeVisible();
    await expect(bob.getByRole('heading', { name: '마감되었습니다' })).toBeVisible();
    await expect(host.locator('.winner-slide .race-copy')).toHaveText(/^\s*김지민\s*1조\s*$/);
    await expect(host.locator('.presentation-screen-code')).toHaveText('3');
    await expect(host.locator('.presentation button')).toHaveCount(0);
    await alice.screenshot({ path: '.cache/screenshots/mobile-winner.png', fullPage: true });
    await bob.screenshot({ path: '.cache/screenshots/mobile-closed.png', fullPage: true });
    await host.screenshot({ path: '.cache/screenshots/presentation-winner.png', fullPage: true });
    await alice.reload();
    await alice.getByRole('button', { name: '전체화면으로 시작' }).click();
    await expect(alice.getByRole('heading', { name: '가장 먼저 터치했습니다!' })).toBeVisible();
    await expect(alice.locator('#tap-target')).toHaveCount(0);

    await advanceSlide(remote, 'previous');
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await expect(alice.getByRole('heading', { name: '대기 중' })).toBeVisible();
    await expect(host.locator('.arrival-heading strong')).toHaveText('2');
    await advanceSlide(remote);
    await expect(bob.locator('#tap-target')).toBeEnabled();
    await expect(host.locator('#winner-name')).toHaveCount(0);
    await bob.locator('#tap-target').tap();
    await expect(host.locator('#winner-name')).toHaveText('이서연');
    await expect(alice.locator('#tap-target')).toHaveCount(0);
    await expect(bob.getByRole('heading', { name: '가장 먼저 터치했습니다!' })).toBeVisible();
    await expect(alice.getByRole('heading', { name: '마감되었습니다' })).toBeVisible();
    await advanceSlide(remote, 'previous');
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await advanceSlide(remote);
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
    const outcomes = await Promise.all([alice, bob].map(page => page.locator('.waiting-card').getAttribute('data-result')));
    expect(outcomes.sort()).toEqual(['closed', 'winner']);
    await expect(alice.locator('[role="alert"]')).toHaveCount(0);
    await expect(bob.locator('[role="alert"]')).toHaveCount(0);
    await advanceSlide(remote, 'previous');
    await host.locator('.presentation').click({ button: 'right', position: { x: 16, y: 16 } });
    await expect(host.locator('.presentation')).toHaveAttribute('aria-busy', 'false');
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await expect(host.locator('.presentation')).toHaveAttribute('aria-busy', 'false');
    await host.locator('.invite-qr').click({ button: 'right' });
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await remote.getByRole('button', { name: '설정', exact: true }).click();
    await expect(host.getByRole('button', { name: '발표 시작' })).toBeVisible();
    await expect(host.locator('#name-A1')).toHaveValue('김지민');
    await expect(host.locator('#total-count')).toHaveText('24');
    await host.getByRole('button', { name: '발표 시작' }).click();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await expect(host.locator('.presentation')).toHaveAttribute('aria-busy', 'false');
    await host.keyboard.press('Escape');
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await remote.getByRole('button', { name: '설정', exact: true }).click();
    await expect(host.getByRole('button', { name: '발표 시작' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await Promise.all([desktop.close(), mobile.close(), second.close(), controller.close()]); }
});

test('rosters auto-save to Firebase and restore drafts when the local room is missing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.connection')).toContainText('로컬 테스트');
  await expect(page.getByRole('button', { name: '발표 시작' })).toBeEnabled();
  await page.locator('#name-A1').fill('김지민');
  await page.locator('#name-D6').fill('박하늘');

  await page.reload();
  await expect(page.getByRole('button', { name: '발표 시작' })).toBeEnabled();
  await expect(page.locator('#name-A1')).toHaveValue('김지민');
  await expect(page.locator('#name-A2')).toHaveValue('');
  await expect(page.locator('#name-D6')).toHaveValue('박하늘');
  await expect(page.locator('#total-count')).toHaveText('2');
  await expect(page.locator('#roster-status')).toHaveText('자동 저장됨');
  await page.screenshot({ path: '.cache/screenshots/host-roster.png', fullPage: true });

  await page.evaluate(() => localStorage.removeItem('martini.host-roster.emulator'));
  await page.reload();
  await expect(page.getByRole('button', { name: '발표 시작' })).toBeEnabled();
  await expect(page.locator('#name-A1')).toHaveValue('김지민');
  await expect(page.locator('#name-D6')).toHaveValue('박하늘');

  await page.evaluate(() => localStorage.setItem('martini.host-room', 'missing-room-00000000'));
  await page.reload();
  await expect(page.getByRole('button', { name: '발표 시작' })).toBeEnabled();
  await expect(page.locator('#name-A1')).toHaveValue('김지민');
  await expect(page.locator('#name-D6')).toHaveValue('박하늘');
  await expect(page.locator('#roster-status')).toHaveText('자동 저장됨');
  await page.getByRole('button', { name: '발표 시작' }).click();
  await expect(page.locator('.stage-person')).toHaveCount(2);
  await expect(page.locator('.stage-team-name')).toHaveText(['1조', '2조', '3조', '4조']);

  await expect(page.locator('.presentation')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(async () => {
    const api = await import('/src/event-data.js');
    const room = localStorage.getItem('martini.host-room');
    const presentation = await api.read(room, 'presentation');
    await api.setPresentation(room, false, presentation.resetAt ?? null);
  });
  await page.locator('#name-A1').fill('');
  await page.reload();
  await expect(page.getByRole('button', { name: '발표 시작' })).toBeEnabled();
  await expect(page.locator('#name-A1')).toHaveValue('');
  await expect(page.locator('#name-D6')).toHaveValue('박하늘');
  await expect(page.locator('#total-count')).toHaveText('1');
  await page.locator('#name-D6').fill('');
  await expect(page.locator('#roster-status')).toHaveText('명단 입력 대기');
  await page.evaluate(() => localStorage.removeItem('martini.host-roster.emulator'));
  await page.reload();
  await expect(page.getByRole('button', { name: '발표 시작' })).toBeEnabled();
  await expect(page.locator('#total-count')).toHaveText('0');
});

test('invalid names can be corrected and presentation flushes the latest edit', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.connection')).toContainText('로컬 테스트');
  await expect(page.getByRole('button', { name: '발표 시작' })).toBeEnabled();
  await page.locator('#name-A1').fill('김지민');
  await page.locator('#name-A2').fill('김지민');
  await expect(page.locator('#roster-status')).toContainText('같은 이름');
  await page.locator('#name-A2').fill('이서연');
  await expect(page.locator('#roster-status')).toHaveText('자동 저장됨');
  await page.locator('#name-D6').fill('박하늘');
  await page.getByRole('button', { name: '발표 시작' }).click();
  await expect(page.locator('.stage-person')).toHaveCount(3);
  await expect(page.locator('.stage-person')).toContainText(['김지민', '이서연', '박하늘']);
});

test('manager controls fit one rotated portrait panel in landscape fullscreen', async ({ browser }) => {
  const touchScript = '이렇게 화면과 기기가 실시간으로 소통하면서 진행됩니다.\n바로 레크레이션 시작하겠습니다';
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const remoteContext = await browser.newContext({ viewport: { width: 1040, height: 480 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const participantContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await participantContext.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { get: () => false });
  });
  await remoteContext.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'Linux armv8l' });
    window.managerRotation = 90;
    Object.defineProperty(screen.orientation, 'angle', { get: () => window.managerRotation });
    Object.defineProperty(screen.orientation, 'lock', { value: async () => {} });
  });
  const host = await desktop.newPage(), remote = await remoteContext.newPage(), participant = await participantContext.newPage();
  try {
    await host.goto('/');
    await expect(host.locator('.connection')).toContainText('로컬 테스트');
    await expect(host.locator('#manager-name')).toBeEnabled();
    await host.locator('#manager-name').fill('진행자');
    await host.locator('#name-A1').fill('김지민');
    await expect(host.locator('#manager-status')).toHaveText('QR로 접속해 관리자 이름을 입력하세요.');
    await host.getByRole('button', { name: '발표 시작' }).click();
    const invite = await host.locator('#invite-url').inputValue();
    for (const [page, name] of [[remote, '진행자'], [participant, '김지민']]) {
      await page.goto(invite);
      await page.locator('#real-name').fill(name);
      await page.getByRole('button', { name: '입장', exact: true }).click();
      if (page === remote) await page.getByRole('button', { name: '전체화면으로 시작' }).click();
    }
    await expect(remote.locator('.manager-controller')).toBeVisible();
    await expect(remote.getByRole('button')).toHaveText(['이전 화면', '다음 화면', '설정']);
    await expect(remote.locator('.manager-header, .remote-actions')).toHaveCount(0);
    await expect(remote.locator('.remote-status, .remote-attendance')).toHaveCount(0);
    await expect.poll(() => remote.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await remote.reload();
    await remote.getByRole('button', { name: '전체화면으로 시작' }).click();
    await expect(remote.locator('.manager-controller')).toBeVisible();
    await expect(remote.getByRole('button')).toHaveText(['이전 화면', '다음 화면', '설정']);
    await expect(remote.getByRole('region', { name: '진행 대본' })).toHaveText('레크레이션은 모바일기기와 웹을 이용해서 진행합니다. QR코드를 통해 휴대폰을 웹과 동기화하면 모든걸 실시간으로 처리할 수 있습니다. 특히 선착순 게임에서 매우 공정하게 처리할 수 있는데요, 저요저요 하면서 손 들면 레크 진행자가 무작위로 뽑는 방식이 아닌, 정말로 가장 빠르게 누른 사람을 골라낼 수 있습니다. 이렇게 말이죠');
    const scriptSize = await remote.locator('#manager-script').evaluate(element => ({
      ratio: element.offsetHeight / element.parentElement.clientHeight,
      scrollable: element.scrollHeight > element.clientHeight,
    }));
    expect(scriptSize.ratio).toBeGreaterThan(0.32);
    expect(scriptSize.ratio).toBeLessThan(0.34);
    expect(scriptSize.scrollable).toBe(true);
    const remoteLayout = () => remote.locator('.manager-controller').evaluate(panel => {
      const script = panel.querySelector('#manager-script');
      const navigation = panel.querySelector('.remote-navigation');
      return { scriptTop: script.offsetTop, scriptHeight: script.offsetHeight, navigationTop: navigation.offsetTop };
    });
    const qrLayout = await remoteLayout();
    await remote.screenshot({ path: '.cache/screenshots/manager-qr-remote.png', fullPage: true });
    const touch = await remoteContext.newCDPSession(remote);
    async function swipeScript() {
      const box = await remote.locator('#manager-script').boundingBox();
      const clockwise = await remote.locator('.manager-controller').getAttribute('data-rotation') === 'clockwise';
      const y = box.y + box.height / 2;
      const start = clockwise ? box.x + 25 : box.x + box.width - 25;
      const end = clockwise ? box.x + box.width - 25 : box.x + 25;
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
      for (let step = 1; step <= 8; step++) {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: start + (end - start) * step / 8, y }],
        });
        await remote.waitForTimeout(25);
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await swipeScript();
    await expect.poll(() => remote.locator('#manager-script').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    const scrollPosition = await remote.locator('#manager-script').evaluate(element => {
      element.scrollTop = element.scrollHeight;
      const position = element.scrollTop;
      window.dispatchEvent(new Event('resize'));
      return position;
    });
    await expect.poll(() => remote.locator('#manager-script').evaluate(element => element.scrollTop)).toBe(scrollPosition);
    await remote.evaluate(() => { window.managerRotation = 270; screen.orientation.dispatchEvent(new Event('change')); });
    await expect(remote.locator('.manager-controller')).toHaveAttribute('data-rotation', 'clockwise');
    await remote.locator('#manager-script').evaluate(element => { element.scrollTop = 0; });
    await swipeScript();
    await expect.poll(() => remote.locator('#manager-script').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await remote.evaluate(() => { window.managerRotation = 90; screen.orientation.dispatchEvent(new Event('change')); });
    await expect(remote.locator('.manager-controller')).toHaveAttribute('data-rotation', 'counterclockwise');
    const beforeFullscreenExit = await remote.locator('#manager-script').evaluate(element => element.scrollTop);
    await remote.evaluate(() => document.exitFullscreen());
    await expect(remote.getByRole('button', { name: '전체화면으로 시작' })).toBeVisible();
    await remote.evaluate(() => {
      const original = document.documentElement.requestFullscreen.bind(document.documentElement);
      let rejected = false;
      document.documentElement.requestFullscreen = options => {
        if (!rejected) { rejected = true; return Promise.reject(new DOMException('Test refusal', 'NotAllowedError')); }
        return original(options);
      };
    });
    await remote.getByRole('button', { name: '전체화면으로 시작' }).click();
    await expect(remote.getByRole('alert')).toContainText('시작 버튼을 다시 눌러주세요');
    await remote.getByRole('button', { name: '전체화면으로 시작' }).click();
    await expect(remote.locator('.manager-controller')).toBeVisible();
    await expect.poll(() => remote.locator('#manager-script').evaluate(element => element.scrollTop)).toBe(beforeFullscreenExit);
    const startingScale = await remote.evaluate(() => window.visualViewport.scale);
    await remote.touchscreen.tap(520, 240);
    await remote.touchscreen.tap(520, 240);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ id: 1, x: 460, y: 220 }, { id: 2, x: 580, y: 260 }],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ id: 1, x: 360, y: 200 }, { id: 2, x: 680, y: 280 }],
    });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await remote.evaluate(() => window.visualViewport.scale)).toBe(startingScale);
    const gesturesBlocked = await remote.evaluate(() => {
      const gesture = new Event('gesturestart', { bubbles: true, cancelable: true });
      const zoom = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 });
      document.dispatchEvent(gesture);
      document.dispatchEvent(zoom);
      return gesture.defaultPrevented && zoom.defaultPrevented;
    });
    expect(gesturesBlocked).toBe(true);
    await expect(remote.getByRole('button', { name: '다음 화면' })).toBeEnabled();
    const draggedClickAccepted = await remote.getByRole('button', { name: '다음 화면' }).evaluate(button => {
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerId: 91, clientX: 400, clientY: 200 }));
      document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, isPrimary: true, pointerId: 91, clientX: 500, clientY: 200 }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true, pointerId: 91, clientX: 500, clientY: 200 }));
      return button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    });
    expect(draggedClickAccepted).toBe(false);
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await expect(participant.getByRole('heading', { name: '대기 중' })).toBeVisible();
    await remote.getByRole('button', { name: '이전 화면' }).click();
    await expect(host.locator('#manager-name')).toHaveValue('진행자');
    await expect(remote.getByRole('button')).toHaveText(['이전 화면', '다음 화면', '설정']);
    await expect(remote.getByRole('button', { name: '이전 화면' })).toBeDisabled();
    await expect(remote.getByRole('button', { name: '다음 화면' })).toBeDisabled();
    await expect(remote.getByRole('region', { name: '진행 대본' })).toHaveText('');
    expect(await remoteLayout()).toEqual(qrLayout);
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await remote.getByRole('button', { name: '다음 화면' }).click();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'touch');
    await expect(host.locator('.presentation-screen-code')).toHaveText('2');
    await expect(remote.getByRole('region', { name: '진행 대본' })).toHaveText(touchScript);
    await expect(remote.locator('#manager-script')).toHaveAttribute('data-script-id', 'touch');
    await expect(remote.locator('#manager-script p')).toHaveJSProperty('textContent', touchScript);
    await expect(remote.locator('#manager-script p')).toHaveCSS('white-space', 'pre-line');
    await expect(remote.locator('.manager-header, .remote-actions')).toHaveCount(0);
    await expect(remote.getByRole('button')).toHaveText(['이전 화면', '다음 화면', '설정']);
    expect(await remoteLayout()).toEqual(qrLayout);
    await expect(participant.locator('#tap-target')).toBeEnabled();
    await participant.locator('#tap-target').tap();
    await expect(host.locator('#winner-name')).toHaveText('김지민');
    await expect(host.locator('.presentation-screen-code')).toHaveText('3');
    await expect(remote.getByRole('region', { name: '진행 대본' })).toHaveText(touchScript);
    await expect(remote.locator('#manager-script')).toHaveAttribute('data-script-id', 'touch');
    await expect(remote.getByText('김지민', { exact: true })).toHaveCount(0);
    await expect(remote.getByRole('button')).toHaveText(['이전 화면', '다음 화면', '설정']);
    expect(await remoteLayout()).toEqual(qrLayout);
    await remote.getByRole('button', { name: '이전 화면' }).click();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await remote.getByRole('button', { name: '다음 화면' }).click();
    await expect(participant.locator('#tap-target')).toBeEnabled();
    await participant.locator('#tap-target').tap();
    await expect(host.locator('#winner-name')).toHaveText('김지민');
    await remote.getByRole('button', { name: '이전 화면' }).dblclick();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await expect(remote.locator('.manager-controller')).toHaveAttribute('aria-busy', 'false');
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await expect(remote.getByRole('button')).toHaveText(['이전 화면', '다음 화면', '설정']);
    await remote.getByRole('button', { name: '다음 화면' }).click();
    await expect(participant.locator('#tap-target')).toBeEnabled();
    await participant.locator('#tap-target').tap();
    await expect(host.locator('#winner-name')).toHaveText('김지민');
    for (const viewport of [{ width: 1040, height: 480 }, { width: 936, height: 432 }, { width: 780, height: 360 }]) {
      await remote.setViewportSize(viewport);
      await expect(async () => {
        const geometry = await remote.locator('.manager-controller').evaluate(panel => {
          const nav = panel.querySelector('.remote-navigation');
          const buttons = [...panel.querySelectorAll('button')];
          return {
            width: panel.clientWidth, height: panel.clientHeight,
            scrolls: panel.scrollHeight > panel.clientHeight || panel.scrollWidth > panel.clientWidth
              || document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
            footerGap: panel.clientHeight - nav.offsetTop - nav.offsetHeight,
            scriptRatio: panel.querySelector('#manager-script').offsetHeight / panel.clientHeight,
            buttonsFit: buttons.every(button => {
              const box = button.getBoundingClientRect();
              return box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
            }),
          };
        });
        expect(geometry.width).toBe(viewport.height);
        expect(geometry.height).toBe(viewport.width);
        expect(geometry.scrolls).toBe(false);
        expect(geometry.buttonsFit).toBe(true);
        expect(geometry.scriptRatio).toBeGreaterThan(0.32);
        expect(geometry.scriptRatio).toBeLessThan(0.34);
        expect(geometry.footerGap).toBeGreaterThanOrEqual(18);
        expect(geometry.footerGap).toBeLessThanOrEqual(27);
      }).toPass({ timeout: 3000 });
    }
    await remote.setViewportSize({ width: 1040, height: 480 });
    await expect(remote.locator('.manager-controller')).toHaveAttribute('data-rotation', 'counterclockwise');
    await remote.screenshot({ path: '.cache/screenshots/manager-remote.png', fullPage: true });
    await remote.evaluate(() => { window.managerRotation = 270; screen.orientation.dispatchEvent(new Event('change')); });
    await expect(remote.locator('.manager-controller')).toHaveAttribute('data-rotation', 'clockwise');
    await remote.evaluate(() => document.exitFullscreen());
    await expect(remote.getByRole('button', { name: '전체화면으로 시작' })).toBeVisible();
    await remote.getByRole('button', { name: '전체화면으로 시작' }).click();
    await remote.getByRole('button', { name: '이전 화면' }).click();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await remote.getByRole('button', { name: '이전 화면' }).click();
    await expect(host.locator('#manager-name')).toBeVisible();
    host.once('dialog', dialog => dialog.accept());
    await host.getByRole('button', { name: '김지민 기기 연결 해제' }).click();
    await expect(participant.locator('#real-name')).toBeVisible();
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await expect(remote.getByRole('button')).toHaveText(['이전 화면', '다음 화면', '설정']);
    await remote.getByRole('button', { name: '이전 화면' }).click();
    await expect(host.getByRole('button', { name: '발표 시작', exact: true })).toBeEnabled();
    await host.getByRole('button', { name: '관리자 휴대폰 연결 해제' }).click();
    await expect(remote.locator('.manager-controller')).toHaveCount(0);
    await expect(remote.locator('#real-name')).toBeVisible();
  } finally { await Promise.all([desktop.close(), remoteContext.close(), participantContext.close()]); }
});

test('name entry stays intact through keyboard viewport changes before fullscreen', async ({ browser }) => {
  const desktop = await browser.newContext();
  const tablet = await browser.newContext({
    viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  });
  await tablet.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'iPad' });
  });
  const host = await desktop.newPage(), ipad = await tablet.newPage();
  try {
    await host.goto('/');
    await expect(host.locator('.connection')).toContainText('로컬 테스트');
    await expect(host.locator('#name-A1')).toBeEnabled();
    await host.locator('#name-A1').fill('김지민');
    await host.getByRole('button', { name: '발표 시작' }).click();
    await ipad.goto(await host.locator('#invite-url').inputValue());
    await expect(ipad.locator('#real-name')).toBeVisible();
    await expect(ipad.getByRole('button', { name: '입장', exact: true })).toBeEnabled();
    await expect(ipad.getByRole('button', { name: '전체화면으로 시작' })).toHaveCount(0);
    await ipad.locator('#real-name').fill('김지민');
    await ipad.evaluate(() => { window.nameInputBeforeKeyboard = document.querySelector('#real-name'); });
    await ipad.setViewportSize({ width: 820, height: 680 });
    const intact = await ipad.evaluate(async () => {
      document.dispatchEvent(new Event('fullscreenchange'));
      window.dispatchEvent(new Event('resize'));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return window.nameInputBeforeKeyboard === document.querySelector('#real-name')
        && document.activeElement === document.querySelector('#real-name');
    });
    expect(intact).toBe(true);
    await expect(ipad.locator('#real-name')).toHaveValue('김지민');
    await expect(ipad.getByRole('button', { name: '입장', exact: true })).toBeEnabled();
    await ipad.getByRole('button', { name: '입장', exact: true }).click();
    await expect(ipad.getByRole('button', { name: '전체화면으로 시작' })).toBeVisible();
    await ipad.setViewportSize({ width: 1180, height: 820 });
    await ipad.getByRole('button', { name: '전체화면으로 시작' }).click();
    await expect.poll(() => ipad.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await expect(ipad.getByRole('heading', { name: '대기 중' })).toBeVisible();
  } finally { await Promise.all([desktop.close(), tablet.close()]); }
});
