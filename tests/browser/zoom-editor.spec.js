import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test('uploaded photos and selected zoom framing survive save and match the presentation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#name-A1')).toBeEnabled();
  await page.locator('#name-A1').fill('사진 참가자');
  const card = page.locator('[data-zoom-card="0"]');
  await card.locator('[data-zoom-image]').setInputFiles(fileURLToPath(new URL('../../src/assets/soju/chamisul.jpg', import.meta.url)));
  await expect(card.locator('[data-zoom-source] img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await expect(card.locator('[data-zoom-scale]')).toBeEnabled();
  await card.locator('[data-zoom-scale]').evaluate(input => {
    input.value = '14';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const source = card.locator('[data-zoom-source]');
  await source.scrollIntoViewIfNeeded();
  const bounds = await source.boundingBox();
  await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .95, bounds.y + bounds.height * .4, { steps: 5 });
  expect(Number(await card.locator('[data-zoom-focus-x]').inputValue())).toBeLessThan(60);
  await page.mouse.move(bounds.x + bounds.width * .52, bounds.y + bounds.height * .6, { steps: 5 });
  await page.mouse.up();
  await expect(card.locator('[data-zoom-scale-label]')).toHaveText('14배');
  const expectedFocus = await card.locator('[data-zoom-preview]').evaluate(image => [image.style.getPropertyValue('--focus-x'), image.style.getPropertyValue('--focus-y')]);
  expect(parseFloat(expectedFocus[0])).toBeGreaterThan(50);
  expect(parseFloat(expectedFocus[1])).toBeGreaterThan(60);
  await card.locator('[data-zoom-preview-step="1"]').click();
  await expect.poll(() => card.locator('[data-zoom-preview]').evaluate(image => image.style.getPropertyValue('--zoom'))).toBe('4.67');
  await card.locator('[data-zoom-preview-step="0"]').click();
  await page.screenshot({ path: '.cache/screenshots/zoom-editor-selection.png' });
  await page.getByRole('button', { name: '사진 설정 저장', exact: true }).click();
  await expect(page.locator('#zoom-save-status')).toHaveText('설정된 사진으로 진행합니다');
  await page.reload();
  await expect(card.locator('[data-zoom-scale]')).toHaveValue('14');
  await expect(card.locator('[data-zoom-source] img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await expect.poll(() => card.locator('[data-zoom-preview]').evaluate(image => [image.style.getPropertyValue('--focus-x'), image.style.getPropertyValue('--focus-y')])).toEqual(expectedFocus);

  await page.getByRole('button', { name: '발표 시작', exact: true }).click();
  await expect(page.locator('.presentation')).toBeVisible();
  await page.evaluate(async () => {
    const api = await import('/src/event-data.js');
    const { STAGES } = await import('/src/event-model.js');
    const room = localStorage.getItem('martini.host-room');
    const [questions, roster, presentation] = await Promise.all([api.read(room, 'zoomQuestions'), api.read(room, 'participants'), api.read(room, 'presentation')]);
    await api.prepareZoomQuestion(room, roster, questions, 0, presentation.resetAt ?? null);
    await api.setPresentationSlide(room, STAGES.findIndex(stage => stage.id === 'zoom-question-1'), presentation.resetAt ?? null);
  });
  await expect(page.locator('.zoom-photo')).toBeVisible();
  await expect.poll(() => page.locator('.zoom-photo').evaluate(image => image.style.getPropertyValue('--zoom'))).toBe('14');
  await expect.poll(() => page.locator('.zoom-photo').evaluate(image => [image.style.getPropertyValue('--focus-x'), image.style.getPropertyValue('--focus-y')])).toEqual(expectedFocus);
  const ratio = await page.locator('.zoom-photo-frame').evaluate(frame => frame.clientWidth / frame.clientHeight);
  expect(ratio).toBeCloseTo(16 / 9, 2);
  await page.screenshot({ path: '.cache/screenshots/zoom-editor-presentation.png' });
});
