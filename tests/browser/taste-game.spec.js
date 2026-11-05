import { test, expect } from '@playwright/test';

test('whisky, soju and military votes, reveals and cumulative scores survive revisiting and reload', async ({ browser }) => {
  test.setTimeout(120000);
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const phoneContexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext({ viewport: { width: 1040, height: 480 }, isMobile: true, hasTouch: true })));
  for (const context of phoneContexts) await context.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }));
  const host = await desktop.newPage();
  const [remote, alice, anna, bob, carol] = await Promise.all(phoneContexts.map(context => context.newPage()));
  const players = [alice, anna, bob, carol];
  const errors = [];
  for (const page of [host, remote, ...players]) page.on('pageerror', error => errors.push(error.message));
  const next = () => remote.getByRole('button', { name: '다음 화면' }).click();
  try {
    await host.goto('/');
    await expect(host.locator('.connection')).toContainText('로컬 테스트');
    await expect(host.locator('#manager-name')).toBeEnabled();
    await host.locator('#manager-name').fill('진행자');
    for (const team of ['A', 'B', 'C', 'D']) for (let number = 1; number <= 6; number++) await host.locator(`#name-${team}${number}`).fill(`${team}참가자${number}`);
    for (const [id, name] of Object.entries({ A1: '김지민', A2: '이서연', B1: '박민수', C1: '정하늘' })) await host.locator(`#name-${id}`).fill(name);
    await host.getByRole('button', { name: '발표 시작' }).click();
    const invite = await host.locator('#invite-url').inputValue();
    for (const [page, name] of [[remote, '진행자'], [alice, '김지민'], [anna, '이서연'], [bob, '박민수'], [carol, '정하늘']]) {
      await page.goto(invite);
      await expect(page.getByRole('button', { name: '입장', exact: true })).toBeEnabled();
      await page.locator('#real-name').fill(name);
      await page.getByRole('button', { name: '입장', exact: true }).click();
    }
    await expect(remote.locator('.manager-controller')).toBeVisible();
    await next();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'touch');
    await next();
    await expect(host.locator('.presentation-screen-code')).toHaveText('4');
    await expect(host.getByRole('heading', { name: '취향을 읽어라' })).toBeVisible();
    await host.screenshot({ path: '.cache/screenshots/taste-04-intro.png' });
    await next();
    await expect(host.locator('.presentation-screen-code')).toHaveText('5');
    await expect(host.locator('.taste-eyebrow, .taste-screen h1')).toHaveCount(0);
    await expect(host.locator('.whisky-option h2')).toHaveText(['피트', '셰리', '버번']);
    await expect(host.locator('.whisky-image')).toHaveCount(3);
    await expect.poll(() => host.locator('.whisky-image').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    await expect(host.locator('.whisky-glass')).toHaveCount(0);
    await expect(remote.getByRole('button', { name: '다음 화면' })).toBeDisabled();
    const startButton = remote.getByRole('button', { name: '투표 시작', exact: true });
    await expect(startButton).toBeEnabled();
    const startBox = await startButton.boundingBox();
    const touch = await remote.context().newCDPSession(remote);
    const touchPoint = { x: startBox.x + startBox.width / 2, y: startBox.y + startBox.height / 2 };
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchPoint.x + 2, y: touchPoint.y + 1 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(remote.getByRole('button', { name: '투표 종료', exact: true })).toBeVisible();
    await expect(alice.locator('.taste-mobile h1, .controller-identity')).toHaveCount(0);
    await expect(alice.getByRole('button')).toHaveText(['피트', '셰리', '버번']);
    const voteButtonsFillScreen = await alice.locator('[data-vote]').evaluateAll(buttons => buttons.every(button => {
      const box = button.getBoundingClientRect();
      return box.height >= innerHeight * .85 && box.left >= 0 && box.right <= innerWidth;
    }));
    expect(voteButtonsFillScreen).toBe(true);
    await alice.screenshot({ path: '.cache/screenshots/taste-mobile-vote.png' });
    for (const [page, label] of [[alice, '피트'], [anna, '셰리'], [bob, '피트'], [carol, '버번']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: '대기 중', exact: true })).toBeVisible();
    }
    await expect(remote.locator('.remote-vote-count')).toHaveText('4 / 24명 투표');
    await alice.reload();
    await expect(alice.getByRole('heading', { name: '대기 중', exact: true })).toBeVisible();
    await remote.getByRole('button', { name: '투표 종료', exact: true }).click();
    await expect(alice.getByRole('heading', { name: '대기 중', exact: true })).toBeVisible();
    await remote.getByRole('button', { name: '최다 득표 예상 투표 시작' }).click();
    await expect(alice.locator('.taste-mobile h1, .controller-identity')).toHaveCount(0);
    await expect(alice.getByRole('button')).toHaveText(['피트', '셰리', '버번']);
    for (const [page, label] of [[alice, '피트'], [anna, '피트'], [bob, '셰리'], [carol, '피트']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: '대기 중', exact: true })).toBeVisible();
    }
    await remote.getByRole('button', { name: '예상 투표 종료', exact: true }).click();
    await expect(remote.getByRole('button', { name: '다음 화면' })).toBeDisabled();
    await expect(host.locator('.whisky-option.is-answer, .whisky-option.is-dimmed, .whisky-vote-count')).toHaveCount(0);
    await expect(host.getByRole('button', { name: '정답 공개', exact: true })).toBeEnabled();
    await remote.getByRole('button', { name: '정답 공개', exact: true }).click();
    await expect(host.locator('.presentation-screen-code')).toHaveText('5');
    await expect(host.locator('.whisky-option.is-answer')).toHaveCount(1);
    await expect(host.locator('.whisky-option.is-answer h2')).toHaveText('피트');
    await expect(host.locator('.whisky-vote-count')).toHaveText('2표');
    await expect(host.locator('.whisky-option.is-dimmed')).toHaveCount(2);
    await expect(host.locator('.whisky-option.is-answer')).toHaveCSS('animation-name', 'answer-focus');
    await expect(host.locator('.whisky-vote-count')).toHaveCSS('animation-name', 'answer-count');
    const answerDelay = await host.locator('.taste-ballot-screen').evaluate(element => parseFloat(element.style.getPropertyValue('--answer-delay')));
    await host.evaluate(() => window.dispatchEvent(new Event('resize')));
    await expect.poll(() => host.locator('.taste-ballot-screen').evaluate(element => parseFloat(element.style.getPropertyValue('--answer-delay')))).toBeLessThan(answerDelay);
    await expect(host.locator('.whisky-vote-count')).toHaveCSS('opacity', '1');
    await expect(remote.getByRole('button', { name: '다음 화면' })).toBeEnabled();
    await host.reload();
    await expect(host.locator('.whisky-option.is-answer h2')).toHaveText('피트');
    await expect(host.locator('.whisky-vote-count')).toHaveText('2표');
    expect(await host.locator('.whisky-vote-count').evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    await host.screenshot({ path: '.cache/screenshots/taste-05-vote.png' });
    await next();
    await expect(host.locator('.presentation-screen-code')).toHaveText('6');
    await expect(host.locator('.taste-eyebrow, .taste-screen h1')).toHaveCount(0);
    await expect(host.locator('.reveal-person')).toHaveCount(24);
    await expect(host.locator('.reveal-person.is-correct')).toHaveCount(0);
    await expect(remote.getByRole('button', { name: '다음 화면' })).toBeDisabled();
    await host.screenshot({ path: '.cache/screenshots/taste-06-hidden.png' });
    await remote.getByRole('button', { name: '결과 공개', exact: true }).click();
    await expect(host.locator('.reveal-person.is-correct')).toHaveCount(3);
    await expect(host.locator('[data-person="B1"]')).not.toHaveClass(/is-correct/);
    for (const player of players) await expect(player.locator('.taste-mobile')).toHaveText('대기 중');
    await expect(remote.getByRole('button', { name: '다음 화면' })).toBeEnabled();
    await host.screenshot({ path: '.cache/screenshots/taste-06-revealed.png' });
    const originalOrder = await host.locator('.reveal-person.is-correct').evaluateAll(nodes => nodes.map(node => [node.dataset.person, node.style.getPropertyValue('--reveal-delay')]));
    expect(new Set(originalOrder.map(([, delay]) => delay)).size).toBe(3);
    await Promise.all([next(), host.locator('.presentation').click({ position: { x: 16, y: 16 } })]);
    await expect(host.locator('.presentation-screen-code')).toHaveText('7');
    await expect(host.locator('.taste-eyebrow, .taste-screen h1')).toHaveCount(0);
    await expect(host.locator('[data-score-team="A"]')).toHaveText('20');
    await expect(host.locator('[data-score-team="C"]')).toHaveText('10');
    for (const player of players) await expect(player.locator('.taste-mobile')).toHaveText('대기 중');
    await expect(host.locator('.score-row h2')).toHaveText(['1조', '3조', '2조', '4조']);
    await expect.poll(() => host.locator('.score-row').evaluateAll(nodes => nodes.every((node, index) => index === 0 || node.getBoundingClientRect().top > nodes[index - 1].getBoundingClientRect().top))).toBe(true);
    const scoreLayout = await host.locator('.scoreboard').evaluate(board => {
      const box = board.getBoundingClientRect(), parent = board.parentElement.getBoundingClientRect();
      const style = getComputedStyle(board.parentElement);
      const contentWidth = parent.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return { widthRatio: box.width / contentWidth, centerDifference: Math.abs(box.left + box.width / 2 - parent.left - parent.width / 2) };
    });
    expect(scoreLayout.widthRatio).toBeCloseTo(.8, 2);
    expect(scoreLayout.centerDifference).toBeLessThan(1);
    await host.screenshot({ path: '.cache/screenshots/taste-07-score.png' });
    await remote.getByRole('button', { name: '이전 화면' }).click();
    await expect(host.locator('.presentation-screen-code')).toHaveText('6');
    await expect(host.locator('.reveal-person.is-correct')).toHaveCount(3);
    await next();
    await expect(host.locator('[data-score-team="A"]')).toHaveText('20');
    await host.reload();
    await expect(host.locator('[data-score-team="A"]')).toHaveText('20');
    await expect(host.locator('[data-score-team="C"]')).toHaveText('10');
    await next();
    await expect(host.locator('.presentation-screen-code')).toHaveText('8');
    await expect(host.locator('.whisky-option h2')).toHaveText(['참이슬', '처음처럼', '진로', '새로']);
    await expect(host.locator('.taste-eyebrow, .taste-screen h1')).toHaveCount(0);
    await expect(alice.locator('.taste-mobile')).toHaveText('대기 중');
    await remote.getByRole('button', { name: '투표 시작', exact: true }).click();
    await expect(alice.getByRole('button')).toHaveText(['참이슬', '처음처럼', '진로', '새로']);
    await alice.screenshot({ path: '.cache/screenshots/soju-mobile-vote.png' });
    await host.screenshot({ path: '.cache/screenshots/soju-08-vote.png' });
    for (const [page, label] of [[alice, '참이슬'], [anna, '처음처럼'], [bob, '진로'], [carol, '참이슬']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: '대기 중', exact: true })).toBeVisible();
    }
    await expect(remote.locator('.remote-vote-count')).toHaveText('4 / 24명 투표');
    await remote.getByRole('button', { name: '투표 종료', exact: true }).click();
    await remote.getByRole('button', { name: '최다 득표 예상 투표 시작' }).click();
    for (const [page, label] of [[alice, '처음처럼'], [anna, '참이슬'], [bob, '참이슬'], [carol, '처음처럼']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: '대기 중', exact: true })).toBeVisible();
    }
    await remote.getByRole('button', { name: '예상 투표 종료', exact: true }).click();
    await expect(remote.getByRole('button', { name: '다음 화면' })).toBeDisabled();
    await host.emulateMedia({ reducedMotion: 'reduce' });
    await remote.getByRole('button', { name: '정답 공개', exact: true }).click();
    await expect(host.locator('.whisky-option.is-answer h2')).toHaveText('참이슬');
    await expect(host.locator('.whisky-vote-count')).toHaveText('2표');
    await expect(host.locator('.whisky-option.is-answer')).toHaveCSS('animation-name', 'none');
    await expect(host.locator('.whisky-vote-count')).toHaveCSS('opacity', '1');
    await host.emulateMedia({ reducedMotion: 'no-preference' });
    await next();
    await expect(host.locator('.presentation-screen-code')).toHaveText('9');
    await expect(host.locator('.reveal-person.is-correct')).toHaveCount(0);
    await remote.getByRole('button', { name: '결과 공개', exact: true }).click();
    await expect(host.locator('.reveal-person.is-correct')).toHaveCount(2);
    await expect(host.locator('[data-person="A1"]')).not.toHaveClass(/is-correct/);
    await expect(host.locator('[data-person="A2"]')).toHaveClass(/is-correct/);
    await expect(host.locator('[data-person="B1"]')).toHaveClass(/is-correct/);
    await next();
    await expect(host.locator('.presentation-screen-code')).toHaveText('10');
    await expect(host.locator('[data-score-team="A"]')).toHaveText('30');
    await expect(host.locator('[data-score-team="B"]')).toHaveText('10');
    await expect(host.locator('[data-score-team="C"]')).toHaveText('10');
    await expect(host.locator('.score-row h2')).toHaveText(['1조', '2조', '3조', '4조']);
    await host.screenshot({ path: '.cache/screenshots/soju-10-score.png' });
    for (const screen of ['9', '8', '7']) {
      await remote.getByRole('button', { name: '이전 화면' }).click();
      await expect(host.locator('.presentation-screen-code')).toHaveText(screen);
    }
    await expect(host.locator('[data-score-team="A"]')).toHaveText('20');
    for (const screen of ['8', '9', '10']) {
      await next();
      await expect(host.locator('.presentation-screen-code')).toHaveText(screen);
    }
    await host.reload();
    await expect(host.locator('[data-score-team="A"]')).toHaveText('30');
    await expect(host.locator('[data-score-team="B"]')).toHaveText('10');
    await next();
    await expect(host.locator('.presentation-screen-code')).toHaveText('11');
    await expect(host.locator('.whisky-option h2')).toHaveText(['육군', '공군', '해병대']);
    await expect(host.locator('.soju-bottle, .whisky-image')).toHaveCount(0);
    await expect(remote.getByRole('button', { name: '다음 화면' })).toBeDisabled();
    await remote.getByRole('button', { name: '투표 시작', exact: true }).click();
    await expect(alice.getByRole('button')).toHaveText(['육군', '공군', '해병대']);
    for (const [page, label] of [[alice, '육군'], [anna, '공군'], [bob, '육군'], [carol, '해병대']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: '대기 중', exact: true })).toBeVisible();
    }
    await remote.getByRole('button', { name: '투표 종료', exact: true }).click();
    await remote.getByRole('button', { name: '최다 득표 예상 투표 시작' }).click();
    for (const [page, label] of [[alice, '공군'], [anna, '육군'], [bob, '해병대'], [carol, '육군']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: '대기 중', exact: true })).toBeVisible();
    }
    await remote.getByRole('button', { name: '예상 투표 종료', exact: true }).click();
    await expect(remote.getByRole('button', { name: '다음 화면' })).toBeDisabled();
    await host.getByRole('button', { name: '정답 공개', exact: true }).click();
    await expect(host.locator('.whisky-option.is-answer h2')).toHaveText('육군');
    await expect(host.locator('.whisky-vote-count')).toHaveText('2표');
    await expect(host.locator('.whisky-option.is-dimmed')).toHaveCount(2);
    await host.reload();
    await expect(host.locator('.whisky-option.is-answer h2')).toHaveText('육군');
    await expect(host.locator('.whisky-vote-count')).toHaveText('2표');
    await next();
    await expect(host.locator('.presentation-screen-code')).toHaveText('12');
    await expect(host.locator('.reveal-person.is-correct')).toHaveCount(0);
    await remote.getByRole('button', { name: '결과 공개', exact: true }).click();
    await expect(host.locator('.reveal-person.is-correct')).toHaveCount(2);
    await expect(host.locator('[data-person="A2"]')).toHaveClass(/is-correct/);
    await expect(host.locator('[data-person="C1"]')).toHaveClass(/is-correct/);
    await next();
    await expect(host.locator('.presentation-screen-code')).toHaveText('13');
    await expect(host.locator('[data-score-team="A"]')).toHaveText('40');
    await expect(host.locator('[data-score-team="B"]')).toHaveText('10');
    await expect(host.locator('[data-score-team="C"]')).toHaveText('20');
    await expect(remote.getByRole('button', { name: '다음 화면' })).toBeDisabled();
    for (const screen of ['12', '11']) {
      await remote.getByRole('button', { name: '이전 화면' }).click();
      await expect(host.locator('.presentation-screen-code')).toHaveText(screen);
    }
    await expect(host.locator('.whisky-option.is-answer h2')).toHaveText('육군');
    await next(); await next();
    await host.reload();
    await expect(host.locator('[data-score-team="A"]')).toHaveText('40');
    await expect(host.locator('[data-score-team="C"]')).toHaveText('20');
    const rosterBeforeReset = await host.evaluate(async () => {
      const source = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/event-data.js');
      const api = await import(source.name);
      return api.read(localStorage.getItem('martini.host-room'), 'participants');
    });
    const resetButton = host.getByRole('button', { name: '초기화', exact: true });
    await expect(resetButton).toBeEnabled();
    const resetBounds = await resetButton.boundingBox();
    expect(resetBounds.x).toBeLessThan(50);
    expect(resetBounds.y).toBeLessThan(50);
    await resetButton.click();
    await expect(host.locator('.presentation-screen-code')).toHaveText('1');
    await host.screenshot({ path: '.cache/screenshots/reset-to-qr.png' });
    await expect(remote.getByRole('region', { name: '진행 대본' })).toContainText('레크레이션은 모바일기기와 웹을 이용해서 진행합니다.');
    for (const player of players) await expect(player.getByRole('heading', { name: '대기 중', exact: true })).toBeVisible();
    const resetState = await host.evaluate(async () => {
      const source = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/event-data.js');
      const api = await import(source.name);
      const room = localStorage.getItem('martini.host-room');
      const keys = ['participants', 'bindings', 'managerBinding', 'presentation', 'tasteGame', 'sojuGame', 'militaryGame', 'teamScores', 'instructions', 'responses'];
      return Object.fromEntries(await Promise.all(keys.map(async key => [key, await api.read(room, key)])));
    });
    expect(resetState.participants).toEqual(rosterBeforeReset);
    expect(Object.keys(resetState.bindings)).toHaveLength(4);
    expect(resetState.managerBinding).toBeTruthy();
    expect(resetState.presentation.resetAt).toBeGreaterThan(0);
    for (const key of ['tasteGame', 'sojuGame', 'militaryGame', 'teamScores', 'instructions', 'responses']) expect(resetState[key]).toBeNull();
    await next();
    await expect(alice.locator('#tap-target')).toBeEnabled();
    await alice.locator('#tap-target').tap();
    await expect(host.locator('.presentation-screen-code')).toHaveText('3');
    await next(); await next();
    await expect(host.locator('.presentation-screen-code')).toHaveText('5');
    await remote.getByRole('button', { name: '투표 시작', exact: true }).click();
    await expect(remote.locator('.remote-vote-count')).toHaveText('0 / 24명 투표');
    await expect(alice.getByRole('button', { name: '피트', exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([desktop.close(), ...phoneContexts.map(context => context.close())]);
  }
});
