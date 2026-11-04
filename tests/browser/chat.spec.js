import { test, expect } from '@playwright/test';
test('host roster → slide QR → name pairing → chat → targeted instruction → reconnect', async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const duplicate = await browser.newContext();
  const host = await desktop.newPage(), alice = await mobile.newPage(), bob = await second.newPage(), other = await duplicate.newPage();
  const errors = []; for (const page of [host, alice, bob, other]) page.on('pageerror', error => errors.push(error.message));
  try {
    await host.goto('/');
    await expect(host.getByRole('button', { name: '명단 저장' })).toBeEnabled();
    await expect(host.locator('img')).toHaveCount(0);
    await host.evaluate(() => document.fonts.ready);
    await host.locator('#team-A').fill('민트팀'); await host.locator('#team-B').fill('라임팀');
    await host.locator('#name-A1').fill('김지민'); await host.locator('#name-A2').fill('이서연'); await host.locator('#name-B1').fill('김지민');
    await host.getByRole('button', { name: /발표 시작/ }).click();
    await expect(host.locator('#invite-url')).toBeVisible();
    const invite = await host.locator('#invite-url').inputValue();
    await host.screenshot({ path: '.cache/screenshots/host-stage.png', fullPage: true });
    async function join(page, name, choice) {
      await page.goto(invite); await page.locator('#real-name').fill(name);
      await expect(page.getByRole('button', { name: /내 자리로 입장/ })).toBeEnabled();
      await page.getByRole('button', { name: /내 자리로 입장/ }).click();
      if (choice) { await expect(page.locator('#person-choice')).toBeVisible(); await page.locator('#person-choice').selectOption(choice); await page.getByRole('button', { name: /내 자리로 입장/ }).click(); }
    }
    await join(alice, '김지민', 'A1'); await expect(alice.getByText('기기 연결 완료')).toBeVisible();
    await join(bob, '이서연'); await expect(bob.getByText('기기 연결 완료')).toBeVisible();
    await expect(host.getByText('입장 완료', { exact: true })).toHaveCount(2);
    await join(other, '김지민', 'A1'); await expect(other.getByRole('alert')).toContainText('이미 연결');
    await host.getByRole('button', { name: '채팅 시작 →' }).click();
    await expect(alice.locator('#message-input')).toBeVisible();
    async function send(page, text) { await page.locator('#message-input').fill(text); await expect(page.locator('#send-button')).toBeEnabled(); await page.locator('#send-button').click(); await expect(page.locator('#message-input')).toHaveValue(''); }
    await send(alice, '다 같이 연결됐어요! 반가워요 👋');
    await expect(bob.getByText('다 같이 연결됐어요! 반가워요 👋', { exact: true })).toBeVisible();
    await expect(host.getByText('다 같이 연결됐어요! 반가워요 👋', { exact: true })).toBeVisible();
    await send(bob, '<img src=x onerror=alert(1)>');
    await expect(alice.getByText('<img src=x onerror=alert(1)>', { exact: true })).toBeVisible();
    await expect(alice.locator('.message img')).toHaveCount(0);
    expect(await alice.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await host.getByRole('button', { name: '관리 화면' }).click();
    await host.locator('[data-notice="A1"]').click();
    await host.locator('#instruction-title').fill('지민 님, 다음 차례예요!'); await host.locator('#instruction-body').fill('우리 조를 대표해서 인사 한마디 준비해주세요.');
    await host.getByRole('button', { name: '휴대폰으로 보내기' }).click();
    await expect(alice.getByText('지민 님, 다음 차례예요!', { exact: true })).toBeVisible();
    await expect(bob.getByText('지민 님, 다음 차례예요!', { exact: true })).toHaveCount(0);
    await alice.getByRole('button', { name: '확인했어요', exact: true }).click();
    await expect(host.locator('[data-notice="A1"]')).toContainText('확인');
    await host.screenshot({ path: '.cache/screenshots/host-admin.png', fullPage: true });
    await alice.screenshot({ path: '.cache/screenshots/participant.png', fullPage: true });
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await host.setViewportSize({ width: 390, height: 844 });
    await expect(host.locator('img')).toHaveCount(0);
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await host.screenshot({ path: '.cache/screenshots/admin-mobile.png', fullPage: true });
    await host.setViewportSize({ width: 1440, height: 1000 });
    await mobile.setOffline(true); await expect(alice.locator('.connection')).toContainText('연결 중', { timeout: 20000 });
    await alice.locator('#message-input').fill('작성 중에도 연결이 유지돼요'); await expect(alice.locator('#send-button')).toBeDisabled();
    await mobile.setOffline(false); await expect(alice.locator('.connection')).toContainText('실시간 연결됨', { timeout: 20000 });
    await send(alice, '재접속 확인 완료'); await expect(bob.getByText('재접속 확인 완료', { exact: true })).toBeVisible();
    host.once('dialog', dialog => dialog.accept()); await host.locator('[data-release="A1"]').click();
    await expect(alice.locator('#real-name')).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await Promise.all([desktop.close(), mobile.close(), second.close(), duplicate.close()]); }
});
