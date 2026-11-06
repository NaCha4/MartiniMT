import { test, expect } from '@playwright/test';

test('one, two and three entrants can finish the full liar game with empty teams', async ({ browser }) => {
  test.setTimeout(90000);
  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext()));
  const [host, remote, audience] = await Promise.all(contexts.map(context => context.newPage()));
  for (const context of contexts.slice(1)) await context.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }));
  try {
    await host.goto('/');
    await expect(host.locator('#manager-name')).toBeEnabled();
    await host.locator('#manager-name').fill('진행자');
    for (const id of ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'D1']) await host.locator(`#name-${id}`).fill(`${id[0]}선수${id[1]}`);
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    const invite = await host.locator('#invite-url').inputValue();
    for (const [page, name] of [[remote, '진행자'], [audience, 'D선수1']]) {
      await page.goto(invite);
      await page.locator('#real-name').fill(name);
      await page.getByRole('button', { name: '입장', exact: true }).click();
    }
    await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      const { STAGES } = await import('/src/event-model.js');
      await api.setPresentationSlide(localStorage.getItem('martini.host-room'), STAGES.findIndex(stage => stage.id === 'zoom-score'));
    });
    const next = () => remote.getByRole('button', { name: '다음 화면', exact: true }).click();
    await next();
    await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeEnabled();
    const entries = [['A1'], ['A2', 'B1'], ['A3', 'B2', 'C1']];
    for (const [index, ids] of entries.entries()) {
      await next();
      await expect(host.locator('.presentation-screen-code')).toHaveText(String(39 + index * 3));
      await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
      await expect(host.locator('[data-action="liar-auto-entry"]')).toHaveCount(0);
      await host.evaluate(async ({ index, ids }) => {
        const api = await import('/src/event-data.js'); await api.connect();
        const room = localStorage.getItem('martini.host-room'), game = await api.read(room, 'liarGame');
        for (const id of ids) await api.claimLiarEntry(room, id, index, game.control.roundId);
      }, { index, ids });
      await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeEnabled();
      await next();
      await remote.getByRole('button', { name: '단어 전달', exact: true }).click();
      const cards = await host.evaluate(async index => {
        const api = await import('/src/event-data.js'); await api.connect();
        const round = await api.read(localStorage.getItem('martini.host-room'), `liarGame/rounds/${index}`);
        return { ids: Object.keys(round.cards), blankWords: Object.values(round.cards).filter(card => !card.word).length, liarId: round.secret.liarId };
      }, index);
      expect(cards.ids.sort()).toEqual([...ids].sort());
      expect(cards.blankWords).toBe(1);
      expect(ids).toContain(cards.liarId);
      await remote.getByRole('button', { name: '투표', exact: true }).click();
      await expect(remote.locator('.remote-game-controls')).toContainText(`0 / ${7 - ids.length}명 투표`);
      await expect(audience.locator('[data-liar-vote]')).toHaveCount(ids.length);
      await audience.locator('[data-liar-vote]').first().click();
      await expect(audience.getByRole('heading', { name: '투표 완료', exact: true })).toBeVisible();
      await remote.getByRole('button', { name: '투표 종료', exact: true }).click();
      await expect(host.locator('.liar-vote-results .is-empty')).toHaveCount(4 - ids.length);
      await expect(host.locator('.liar-vote-count')).toHaveCount(ids.length);
      await remote.getByRole('button', { name: '정답 공개', exact: true }).click();
      await expect(host.locator('.liar-badge')).toHaveCount(1);
      await expect(host.locator('.presentation-screen-code')).toHaveText(String(41 + index * 3));
    }
    await host.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(host.locator('.presentation-screen-code')).toHaveText('1');
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('three liar rounds confirm unique entrants, deliver private words, exclude players from voting and award each result once', async ({ browser }) => {
  test.setTimeout(180000);
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const host = await desktop.newPage();
  const contexts = new Set([desktop]);
  const errors = [];
  host.on('pageerror', error => errors.push(error.message));
  async function phone(invite, name) {
    const context = await browser.newContext({ viewport: { width: 1040, height: 480 }, isMobile: true, hasTouch: true });
    contexts.add(context);
    await context.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(invite);
    await page.locator('#real-name').fill(name);
    await page.getByRole('button', { name: '입장', exact: true }).click();
    return page;
  }
  const totals = { A: 0, B: 0, C: 0, D: 0 };
  try {
    await host.goto('/');
    await expect(host.locator('#manager-name')).toBeEnabled();
    await host.locator('#manager-name').fill('진행자');
    for (const team of ['A', 'B', 'C', 'D']) for (let index = 1; index <= 3; index++) await host.locator(`#name-${team}${index}`).fill(`${team}선수${index}`);
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    const invite = await host.locator('#invite-url').inputValue();
    const remote = await phone(invite, '진행자');
    await expect(remote.locator('.manager-controller')).toBeVisible();
    await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      const { STAGES } = await import('/src/event-model.js');
      await api.setPresentationSlide(localStorage.getItem('martini.host-room'), STAGES.findIndex(stage => stage.id === 'zoom-score'));
    });
    const next = () => remote.getByRole('button', { name: '다음 화면', exact: true }).click();
    await next();
    await expect(host.getByRole('heading', { name: '라이어게임', exact: true })).toBeVisible();
    await expect(host.locator('.presentation-screen-code')).toHaveText('38');
    let players = [], spectators = [];
    for (let index = 0; index < 3; index++) {
      await next();
      await expect(host.locator('.presentation-screen-code')).toHaveText(String(39 + index * 3));
      if (players.length) {
        await expect(players[0].getByRole('heading', { name: '이미 출전했습니다', exact: true })).toBeVisible();
        for (const page of [...players, ...spectators]) { contexts.delete(page.context()); await page.context().close(); }
        await host.evaluate(async () => {
          const api = await import('/src/event-data.js'); await api.connect();
          const room = localStorage.getItem('martini.host-room');
          const bindings = await api.read(room, 'bindings');
          await Promise.all(Object.entries(bindings ?? {}).map(([id, binding]) => api.releaseParticipant(room, id, binding.uid)));
        });
      }
      players = await Promise.all(['A', 'B', 'C', 'D'].map(team => phone(invite, `${team}선수${index + 1}`)));
      spectators = await Promise.all(['A', 'B'].map(team => phone(invite, `${team}선수${index === 2 ? 1 : 3}`)));
      await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
      for (const [position, page] of players.entries()) {
        await page.getByRole('button', { name: /출전하기/ }).click();
        await expect(page.getByRole('heading', { name: '정말 출전하시겠습니까?', exact: true })).toBeVisible();
        if (position === 0 && index === 0) {
          await page.getByRole('button', { name: '아니오', exact: true }).click();
          await expect(host.locator('.liar-contestant[data-team="A"] strong')).toHaveText('출전 대기');
          await page.getByRole('button', { name: /출전하기/ }).click();
        }
        await page.getByRole('button', { name: '예', exact: true }).click();
        await expect(page.getByRole('heading', { name: '출전 확정', exact: true })).toBeVisible();
      }
      await expect(host.locator('.liar-contestant strong')).toHaveText(['A', 'B', 'C', 'D'].map(team => `${team}선수${index + 1}`));
      if (index === 0) await host.screenshot({ path: '.cache/screenshots/liar-selection.png' });
      await next();
      await expect(host.locator('.liar-screen h1')).toHaveText(['술', '디저트', '직업'][index]);
      await remote.getByRole('button', { name: '단어 전달', exact: true }).click();
      for (const page of players) await expect(page.locator('.liar-word')).toBeVisible();
      const words = await Promise.all(players.map(page => page.locator('.liar-word h1').textContent()));
      expect(words.filter(word => word === '')).toHaveLength(1);
      expect(words.filter(Boolean)).toEqual(Array(3).fill(['막걸리', '한정선 과일모찌', '대통령'][index]));
      const liar = words.indexOf('');
      const liarId = `${['A', 'B', 'C', 'D'][liar]}${index + 1}`;
      await remote.getByRole('button', { name: '투표', exact: true }).click();
      for (const page of players) await expect(page.locator('[data-liar-vote]')).toHaveCount(0);
      await expect(spectators[0].locator('[data-liar-vote]')).toHaveCount(4);
      const target = index === 1 ? `${['A', 'B', 'C', 'D'][(liar + 1) % 4]}${index + 1}` : liarId;
      await spectators[0].locator(`[data-liar-vote="${target}"]`).click();
      if (index === 2) await spectators[1].locator(`[data-liar-vote="${['A', 'B', 'C', 'D'][(liar + 1) % 4]}3"]`).click();
      await expect(spectators[0].getByRole('heading', { name: '투표 완료', exact: true })).toBeVisible();
      await remote.getByRole('button', { name: '투표 종료', exact: true }).click();
      await expect(host.locator('.presentation-screen-code')).toHaveText(String(40 + index * 3));
      await expect(host.locator('.liar-vote-results')).toBeVisible();
      await expect(host.locator('.liar-vote-count')).toHaveCount(4);
      await expect(host.locator('.liar-badge')).toHaveCount(0);
      await expect(remote.getByRole('button', { name: '다음 화면', exact: true })).toBeDisabled();
      const beforeReveal = await host.evaluate(async index => {
        const api = await import('/src/event-data.js'); await api.connect();
        const room = localStorage.getItem('martini.host-room');
        return { result: await api.read(room, `liarGame/rounds/${index}/result`), scores: await api.read(room, 'teamScores') };
      }, index);
      expect(beforeReveal.result).toBeNull();
      expect(beforeReveal.scores?.totals ?? { A: 0, B: 0, C: 0, D: 0 }).toEqual(totals);
      if (index === 0) {
        await host.reload();
        await expect(host.locator('.liar-vote-results')).toBeVisible();
        await expect(host.locator('.liar-badge')).toHaveCount(0);
        await host.screenshot({ path: '.cache/screenshots/liar-vote-results.png' });
      }
      await remote.getByRole('button', { name: '정답 공개', exact: true }).click();
      await expect(host.locator(`[data-liar-candidate="${liarId}"]`)).toHaveClass(/is-liar/);
      await expect(host.locator('.liar-badge')).toHaveText('라이어');
      await expect(host.locator('.is-liar')).toHaveCSS('animation-name', 'liar-card-reveal');
      const immediatelyAfter = await host.evaluate(async () => {
        const api = await import('/src/event-data.js'); await api.connect();
        return api.read(localStorage.getItem('martini.host-room'), 'teamScores');
      });
      expect(immediatelyAfter?.totals ?? { A: 0, B: 0, C: 0, D: 0 }).toEqual(totals);
      await expect(host.locator('.presentation-screen-code')).toHaveText(String(41 + index * 3));
      await expect(host.locator('.liar-result h1')).toHaveText(index === 1 ? '라이어 생존' : '라이어 적발 성공');
      for (const team of ['A', 'B', 'C', 'D']) {
        totals[team] += index === 1 ? (team === liarId[0] ? 150 : 0) : (team === liarId[0] ? 0 : 50);
        await expect(host.locator(`[data-score-team="${team}"]`)).toHaveText(String(totals[team]));
      }
      if (index === 0) {
        await remote.getByRole('button', { name: '이전 화면', exact: true }).click();
        await next();
        await host.reload();
        for (const team of ['A', 'B', 'C', 'D']) await expect(host.locator(`[data-score-team="${team}"]`)).toHaveText(String(totals[team]));
        await host.screenshot({ path: '.cache/screenshots/liar-score.png' });
      }
    }
    await expect(host.locator('.presentation-screen-code')).toHaveText('47');
    await host.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(host.locator('.presentation-screen-code')).toHaveText('1');
    expect(await host.evaluate(async () => { const api = await import('/src/event-data.js'); await api.connect(); return api.read(localStorage.getItem('martini.host-room'), 'liarGame'); })).toBeNull();
    expect(errors).toEqual([]);
  } finally { await Promise.all([...contexts].map(context => context.close())); }
});
