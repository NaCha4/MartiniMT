import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, set, get } from 'firebase/database';
import { SINGLE_EVENT_ROOM, ROOT, nameKey, rosterFromInputs } from '../../src/event-model.js';

test('fixed event restores quizzes across managers and keeps participants out of management', async ({ browser }) => {
  test.skip(process.env.VITE_FIXED_EVENT_ROOM !== SINGLE_EVENT_ROOM, 'Requires the fixed-event emulator server.');
  test.setTimeout(90000);
  const environment = await initializeTestEnvironment({
    projectId: 'demo-martini-mt-default-rtdb',
    database: { host: '127.0.0.1', port: 9000 },
  });
  const otherRoom = 'z'.repeat(20);
  const image = `data:image/jpeg;base64,${(await readFile(new URL('../../src/assets/whisky/peat.jpg', import.meta.url))).toString('base64')}`;
  const oxQuestions = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [index, { text: `기존 OX ${index + 1}`, answer: 'O' }]));
  const zoomQuestions = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [index, { image, answer: `기존 사진 ${index + 1}`, focusX: 50, focusY: 50 }]));
  await environment.withSecurityRulesDisabled(async context => {
    await set(ref(context.database(), ROOT), {
      [SINGLE_EVENT_ROOM]: {
        meta: { ownerUid: 'original-desktop', title: '마티니 MT', createdAt: 1 },
        stage: { step: 'join', updatedAt: 1 },
        managerLookup: { [nameKey('공동진행')]: { name: '공동진행' } },
        ...rosterFromInputs({ A: ['공용참가자'], B: [], C: [], D: [] }),
        oxQuestions, zoomQuestions,
      },
      [otherRoom]: { meta: { ownerUid: 'other-desktop', title: '다른 행사', createdAt: 1 }, stage: { step: 'setup', updatedAt: 1 } },
    });
  });
  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext({ viewport: { width: 1440, height: 960 } })));
  const [first, second, participant] = await Promise.all(contexts.map(context => context.newPage()));
  const errors = [];
  for (const page of [first, second, participant]) page.on('pageerror', error => errors.push(error.message));
  try {
    await first.addInitScript(room => {
      localStorage.setItem('martini.host-room', room);
      localStorage.setItem('martini.host-roster', JSON.stringify({ rows: { A: ['이전기기입력'], B: [], C: [], D: [] }, pending: true }));
    }, otherRoom);
    for (const page of [first, second]) {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: '행사 관리자 입장' })).toBeVisible();
      await expect(page.locator('.ox-editor')).toHaveCount(0);
      await page.locator('#real-name').fill('공동진행');
      await page.getByRole('button', { name: '입장', exact: true }).click();
      await expect(page.locator('#ox-text-0')).toHaveValue('기존 OX 1');
      await expect(page.locator('[data-zoom-answer="0"]')).toHaveValue('기존 사진 1');
      await expect(page.locator('#name-A1')).toHaveValue('공용참가자');
    }
    await first.locator('#ox-text-0').fill('노트북에서 수정한 OX');
    await first.getByRole('button', { name: 'OX 문제 저장', exact: true }).click();
    await expect(second.locator('#ox-text-0')).toHaveValue('노트북에서 수정한 OX');
    await second.locator('#name-A1').fill('수정된공용참가자');
    await expect(first.locator('#name-A1')).toHaveValue('수정된공용참가자');
    await second.locator('[data-zoom-answer="0"]').fill('노트북 사진 메모');
    await second.getByRole('button', { name: '사진 설정 저장', exact: true }).click();
    await expect(first.locator('[data-zoom-answer="0"]')).toHaveValue('노트북 사진 메모');
    await first.reload();
    await expect(first.locator('#ox-text-0')).toHaveValue('노트북에서 수정한 OX');
    await expect(first.locator('[data-zoom-answer="0"]')).toHaveValue('노트북 사진 메모');
    await first.screenshot({ path: '.cache/screenshots/single-event-manager.png', fullPage: true });

    await participant.goto(`/?room=${otherRoom}`);
    await expect(participant.getByRole('heading', { name: '참가자 입장' })).toBeVisible();
    await expect(participant.locator('.ox-editor')).toHaveCount(0);
    await participant.locator('#real-name').fill('수정된공용참가자');
    await participant.getByRole('button', { name: '입장', exact: true }).click();
    await expect(participant.getByRole('heading', { name: '대기 중' })).toBeVisible();
    await first.getByRole('button', { name: '발표 시작', exact: true }).click();
    await expect(first.locator('#invite-url')).toHaveValue(new RegExp(SINGLE_EVENT_ROOM));
    await expect(second.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    await expect(first.locator('.presentation')).toHaveAttribute('aria-busy', 'false');
    await first.evaluate(async () => {
      const api = await import('/src/event-data.js');
      const room = api.fixedRoom ?? localStorage.getItem('martini.host-room');
      const presentation = await api.read(room, 'presentation');
      const participants = await api.read(room, 'participants');
      await api.startTouchRound(room, Object.keys(participants), true, presentation.resetAt ?? null).confirmed;
    });
    await expect(participant.locator('#tap-target')).toBeEnabled();
    await participant.locator('#tap-target').click();
    await expect(first.locator('#winner-name')).toHaveText('수정된공용참가자');
    await expect(second.locator('#winner-name')).toHaveText('수정된공용참가자');
    await expect(second.locator('.presentation')).toHaveAttribute('aria-busy', 'false');
    await second.evaluate(async () => {
      const api = await import('/src/event-data.js');
      const room = api.fixedRoom ?? localStorage.getItem('martini.host-room');
      const presentation = await api.read(room, 'presentation');
      await api.setPresentation(room, false, presentation.resetAt ?? null);
    });
    await expect(second.locator('.dashboard')).toBeVisible();
    second.once('dialog', dialog => dialog.accept());
    await second.getByRole('button', { name: /^관리자 기기 \d+ 연결 해제$/ }).click();
    await expect(first.getByRole('heading', { name: '행사 관리자 입장' })).toBeVisible();
    await expect(first.locator('.ox-editor')).toHaveCount(0);
    await environment.withSecurityRulesDisabled(async context => {
      const sessions = (await get(ref(context.database(), ROOT))).val();
      expect(Object.keys(sessions).sort()).toEqual([SINGLE_EVENT_ROOM, otherRoom].sort());
      expect(sessions[SINGLE_EVENT_ROOM].meta.ownerUid).toBe('original-desktop');
      expect(sessions[otherRoom].oxQuestions).toBeUndefined();
    });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    await environment.cleanup();
  }
});
