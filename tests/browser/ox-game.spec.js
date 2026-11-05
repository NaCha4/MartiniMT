import { test, expect } from '@playwright/test';

test('OX runs five elimination rounds, awards survivors once, and resets progress while keeping questions', async ({ browser }) => {
  test.setTimeout(150000);
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const phones = await Promise.all(Array.from({ length: 5 }, () => browser.newContext({ viewport: { width: 1040, height: 480 }, isMobile: true, hasTouch: true })));
  for (const context of phones) await context.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }));
  const host = await desktop.newPage();
  const [remote, alice, anna, bob, carol] = await Promise.all(phones.map(context => context.newPage()));
  const errors = [];
  for (const page of [host, remote, alice, anna, bob, carol]) page.on('pageerror', error => errors.push(error.message));
  const next = () => remote.getByRole('button', { name: '다음 화면', exact: true }).click();
  try {
    await host.goto('/');
    await expect(host.locator('#manager-name')).toBeEnabled();
    await host.locator('#manager-name').fill('진행자');
    for (const [id, name] of Object.entries({ A1: '가람', A2: '나래', B1: '다온', C1: '라온' })) await host.locator(`#name-${id}`).fill(name);
    await expect(host.locator('[data-ox-question]')).toHaveCount(5);
    for (let index = 0; index < 5; index++) {
      await expect(host.locator(`#ox-text-${index}`)).toHaveValue('');
      await expect(host.locator(`#ox-answer-${index}`)).toHaveValue('');
    }
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    const invite = await host.locator('#invite-url').inputValue();
    for (const [page, name] of [[remote, '진행자'], [alice, '가람'], [anna, '나래'], [bob, '다온'], [carol, '라온']]) {
      await page.goto(invite);
      await expect(page.getByRole('button', { name: '입장', exact: true })).toBeEnabled();
      await page.locator('#real-name').fill(name);
      await page.getByRole('button', { name: '입장', exact: true }).click();
    }
    await expect(remote.locator('.manager-controller')).toBeVisible();
    // Seed only local prior-game progress, then enter OX through the normal Next action.
    await host.evaluate(async () => {
      const api = await import('/src/event-data.js');
      await api.connect();
      await api.setPresentationSlide(localStorage.getItem('martini.host-room'), 11);
    });
    await next();
    await expect(host.locator('.presentation-screen-code')).toHaveText('14');
    await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
    await host.keyboard.press('Escape');
    await expect(host.locator('.ox-editor')).toBeVisible();
    for (let index = 0; index < 5; index++) {
      await host.locator(`#ox-text-${index}`).fill(`로컬 검증용 ${index + 1}번 문제`);
      await host.locator(`#ox-answer-${index}`).selectOption(index % 2 ? 'X' : 'O');
    }
    await host.getByRole('button', { name: 'OX 문제 저장', exact: true }).click();
    await expect(host.locator('.ox-editor [role="status"]')).toHaveText('5개 문제 저장됨');
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    await host.evaluate(async () => {
      const api = await import('/src/event-data.js');
      await api.connect();
      await api.setPresentationSlide(localStorage.getItem('martini.host-room'), 11);
    });
    await next();
    await next();
    for (let index = 0; index < 5; index++) {
      const answer = index % 2 ? 'X' : 'O';
      await expect(host.locator('.presentation-screen-code')).toHaveText(String(15 + index * 2));
      await expect(host.locator('.ox-prompt')).toHaveText(`로컬 검증용 ${index + 1}번 문제`);
      await expect(host.locator('.ox-symbol.is-correct')).toHaveCount(0);
      await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
      await remote.getByRole('button', { name: '응답 시작', exact: true }).click();
      await expect(alice.locator('[data-ox-vote]')).toHaveCount(2);
      await alice.getByRole('button', { name: answer, exact: true }).click();
      await expect(alice.locator('.ox-mobile h1')).toHaveText('대기 중');
      if (index === 0) await anna.getByRole('button', { name: answer === 'O' ? 'X' : 'O', exact: true }).click();
      if (index < 3) await bob.getByRole('button', { name: index === 2 ? 'X' : answer, exact: true }).click();
      if (index > 0) {
        await expect(anna.locator('.ox-mobile h1')).toHaveText('탈락');
        await expect(carol.locator('.ox-mobile h1')).toHaveText('탈락');
      }
      if (index === 0) {
        await alice.reload();
        await expect(alice.locator('.ox-mobile h1')).toHaveText('대기 중');
        await expect(alice.locator('[data-ox-vote]')).toHaveCount(0);
        await host.screenshot({ path: '.cache/screenshots/ox-question.png' });
      }
      await remote.getByRole('button', { name: '응답 마감', exact: true }).click();
      await next();
      await expect(host.locator('.presentation-screen-code')).toHaveText(String(16 + index * 2));
      await remote.getByRole('button', { name: '정답 공개', exact: true }).click();
      await expect(host.locator('.ox-symbol.is-correct')).toHaveText(answer);
      await expect(host.locator('.ox-symbol.is-correct')).toHaveCSS('animation-name', 'ox-answer');
      await expect(alice.locator('.ox-mobile h1')).toHaveText('정답입니다');
      if (index === 0) {
        await expect(anna.locator('.ox-mobile h1')).toHaveText('탈락');
        await expect(carol.locator('.ox-mobile h1')).toHaveText('탈락');
        await host.reload();
        await expect(host.locator('.ox-symbol.is-correct')).toHaveText(answer);
        await host.screenshot({ path: '.cache/screenshots/ox-reveal.png' });
      }
      await next();
      await expect(host.locator('.presentation-screen-code')).toHaveText(String(26 + index));
      await expect(host.locator('.ox-survivor-screen .reveal-person')).toHaveCount(4);
      await expect(host.locator('.ox-survivor-screen .is-alive')).toHaveCount(index === 0 ? 4 : index <= 2 ? 2 : 1);
      await expect(host.locator('.ox-survivor-screen .is-eliminated-now')).toHaveCount(0);
      await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
      if (index > 0) await expect(host.locator('[data-person="A2"]')).not.toHaveClass(/is-alive|is-eliminated-now/);
      if (index === 0) await host.screenshot({ path: '.cache/screenshots/ox-survivors-before.png' });
      await remote.getByRole('button', { name: '결과 공개', exact: true }).click();
      await expect(host.locator('.ox-survivor-screen .is-alive')).toHaveCount(index < 2 ? 2 : 1);
      await expect(host.locator('.ox-survivor-screen .is-eliminated-now')).toHaveCount(index === 0 ? 2 : index === 2 ? 1 : 0);
      if (index === 0) {
        await expect(host.locator('[data-person="A2"]')).toHaveCSS('animation-name', 'ox-person-dim');
        await expect(host.locator('[data-person="A1"]')).toHaveCSS('animation-name', 'none');
        await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeEnabled();
        await expect(host.locator('[data-person="A2"]')).toHaveCSS('color', 'rgb(98, 94, 101)');
        await host.reload();
        await expect(host.locator('.ox-survivor-screen .is-alive')).toHaveCount(2);
        await expect(host.locator('[data-person="A2"]')).toHaveCSS('color', 'rgb(98, 94, 101)');
        await host.screenshot({ path: '.cache/screenshots/ox-survivors-after.png' });
      }
      await next();
    }
    await expect(host.locator('.presentation-screen-code')).toHaveText('25');
    await expect(host.locator('[data-score-team="A"]')).toHaveText('50');
    await expect(host.locator('[data-score-team="B"]')).toHaveText('0');
    await expect(alice.locator('.ox-mobile h1')).toHaveText('최종 생존');
    await expect(bob.locator('.ox-mobile h1')).toHaveText('탈락');
    await remote.getByRole('button', { name: '이전 화면', exact: true }).click();
    await next();
    await host.reload();
    await expect(host.locator('[data-score-team="A"]')).toHaveText('50');
    await host.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(host.locator('.presentation-screen-code')).toHaveText('1');
    const reset = await host.evaluate(async () => {
      const api = await import('/src/event-data.js');
      await api.connect();
      const room = localStorage.getItem('martini.host-room');
      return { game: await api.read(room, 'oxGame'), scores: await api.read(room, 'teamScores'), questions: await api.read(room, 'oxQuestions') };
    });
    expect(reset.game).toBeNull();
    expect(reset.scores).toBeNull();
    expect(reset.questions[0].text).toBe('로컬 검증용 1번 문제');
    await host.evaluate(async () => {
      const api = await import('/src/event-data.js');
      await api.connect();
      const room = localStorage.getItem('martini.host-room');
      const presentation = await api.read(room, 'presentation');
      await api.setPresentationSlide(room, 12, presentation.resetAt);
    });
    await next();
    for (let index = 0; index < 5; index++) {
      await remote.getByRole('button', { name: '응답 시작', exact: true }).click();
      await remote.getByRole('button', { name: '응답 마감', exact: true }).click();
      await next();
      await remote.getByRole('button', { name: '정답 공개', exact: true }).click();
      await next();
      await expect(host.locator('.presentation-screen-code')).toHaveText(String(26 + index));
      await remote.getByRole('button', { name: '결과 공개', exact: true }).click();
      await expect(host.locator('.ox-survivor-screen .is-alive')).toHaveCount(0);
      await next();
    }
    const noSurvivors = await host.evaluate(async () => {
      const api = await import('/src/event-data.js');
      await api.connect();
      const room = localStorage.getItem('martini.host-room');
      await Promise.all([api.awardOxPoints(room), api.awardOxPoints(room)]);
      return { game: await api.read(room, 'oxGame'), scores: await api.read(room, 'teamScores') };
    });
    expect(noSurvivors.scores.totals).toEqual({ A: 0, B: 0, C: 0, D: 0 });
    expect(Object.keys(noSurvivors.scores.awards)).toHaveLength(1);
    expect(noSurvivors.game.rounds[4].result.survivors).toBeUndefined();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([desktop, ...phones].map(context => context.close()));
  }
});
