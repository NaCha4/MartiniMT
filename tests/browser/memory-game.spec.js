import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { MEMORY_LAYOUTS } from '../../src/memory-model.js';
import { memoryParticipant } from '../../src/memory-view.js';

test('card faces stay stable when boards redraw and flip without 3D layers', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const tokens = await readFile(new URL('../../src/design-tokens.css', import.meta.url), 'utf8');
  const styles = (await readFile(new URL('../../src/event-style.css', import.meta.url), 'utf8')).replace(/^@import[^;]+;/, '');
  const game = { control: { phase: 'running', startedAt: 1000, layoutVersion: 2 }, contestants: { A: { participantId: 'A4' } }, events: { A: {} } };
  async function draw(now) {
    const html = memoryParticipant({ game, slide: { view: 'play' }, participant: { team: 'A' }, participantId: 'A4', ready: true, now });
    await page.setContent(`<style>${tokens}\n${styles}</style><body class="is-participant is-controller"><div id="app">${html}</div></body>`);
  }
  const card = () => page.locator('[data-memory-card="0"]');
  async function animationTime(time) {
    await page.evaluate(time => {
      for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = time; }
    }, time);
  }
  try {
    await draw(2000);
    await expect(card().locator('.memory-card-front')).toHaveCSS('opacity', '1');
    await expect(card().locator('.memory-card-back')).toHaveCSS('opacity', '0');
    await expect(card().locator('.memory-card-rotor')).toHaveCSS('animation-name', 'none');
    await draw(4300);
    await expect(card().locator('.memory-card-front')).toHaveCSS('opacity', '0');
    await expect(card().locator('.memory-card-back')).toHaveCSS('opacity', '1');
    game.events.A[0] = { sequence: 0, roundIndex: 0, cardIndex: 0, at: 4400 };
    await draw(4420);
    await animationTime(0);
    await expect(card().locator('.memory-card-front')).toHaveCSS('opacity', '0');
    await expect(card().locator('.memory-card-back')).toHaveCSS('opacity', '1');
    await expect(card().locator('.memory-card-rotor')).toHaveCSS('animation-name', 'memory-turn');
    await animationTime(110);
    await expect(card().locator('.memory-card-front')).toHaveCSS('opacity', '1');
    await expect(card().locator('.memory-card-back')).toHaveCSS('opacity', '0');
    for (const now of [4700, 4800, 4900]) {
      await draw(now);
      await expect(card().locator('.memory-card-front')).toHaveCSS('opacity', '1');
      await expect(card().locator('.memory-card-rotor')).toHaveCSS('animation-name', 'none');
    }
    game.events.A[1] = { sequence: 1, roundIndex: 0, cardIndex: 1, at: 4600 };
    await draw(5460);
    await animationTime(0);
    await expect(card().locator('.memory-card-front')).toHaveCSS('opacity', '1');
    await animationTime(120);
    await expect(card().locator('.memory-card-front')).toHaveCSS('opacity', '0');
    await expect(card().locator('.memory-card-back')).toHaveCSS('opacity', '1');
    await draw(5700);
    await expect(card().locator('.memory-card-rotor')).toHaveCSS('transform', 'none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    game.events.A = { 0: { sequence: 0, roundIndex: 0, cardIndex: 0, at: 4400 } };
    await draw(4420);
    await expect(card().locator('.memory-card-front')).toHaveCSS('opacity', '1');
    await expect(card().locator('.memory-card-back')).toHaveCSS('opacity', '0');
  } finally { await context.close(); }
});

test('four players replay flip logs, progress through 12/14/16 cards and score in finish order', async ({ browser }) => {
  test.setTimeout(180000);
  const contexts = [], errors = [];
  async function pageFor(mobile = false) {
    const context = await browser.newContext({ viewport: mobile ? { width: 920, height: 440 } : { width: 1440, height: 960 }, isMobile: mobile, hasTouch: mobile });
    contexts.push(context);
    await context.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    return page;
  }
  const host = await pageFor();
  try {
    await host.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(host.locator('#manager-name')).toBeEnabled();
    await host.locator('#manager-name').fill('카드진행자');
    for (const team of ['A', 'B', 'C', 'D']) await host.locator(`#name-${team}4`).fill(`${team}카드선수`);
    await host.getByRole('button', { name: '발표 시작', exact: true }).click();
    const invite = await host.locator('#invite-url').inputValue();
    const remote = await pageFor(true);
    const entrants = await Promise.all(['A', 'B', 'C', 'D'].map(async team => [await pageFor(true), `${team}카드선수`]));
    const players = entrants.map(([page]) => page);
    for (const [page, name] of [[remote, '카드진행자'], ...entrants]) {
      await page.goto(invite, { waitUntil: 'domcontentloaded' });
      await page.locator('#real-name').fill(name);
      await page.getByRole('button', { name: '입장', exact: true }).click();
    }
    await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      const { STAGES } = await import('/src/event-model.js');
      await api.setPresentationSlide(localStorage.getItem('martini.host-room'), STAGES.findIndex(stage => stage.id === 'memory-intro'));
    });
    const next = () => remote.getByRole('button', { name: '다음 화면', exact: true }).click();
    await expect(host.locator('.memory-intro')).toBeVisible();
    await next();
    for (const player of players) {
      await player.getByRole('button', { name: /출전하기/ }).click();
      await player.getByRole('button', { name: '예', exact: true }).click();
    }
    await expect(host.locator('.memory-select .liar-contestant strong')).toHaveText(['A카드선수', 'B카드선수', 'C카드선수', 'D카드선수']);
    await next();
    await remote.getByRole('button', { name: '게임 시작', exact: true }).click();
    await expect(host.locator('.memory-lane')).toHaveCount(4);
    await expect.poll(() => host.locator('.memory-arena').evaluate(element => element.getBoundingClientRect().width / innerWidth)).toBeGreaterThan(.95);
    await expect.poll(() => host.locator('.memory-arena').evaluate(element => element.getBoundingClientRect().height / innerHeight)).toBeGreaterThan(.88);
    await expect(host.locator('.memory-screen .liar-heading')).toHaveCount(0);
    for (const player of players) await expect(player.locator('[data-memory-card]')).toHaveCount(12);
    await expect(players[0].locator('[data-memory-card="0"]')).toBeDisabled();
    for (const [roundIndex, layout] of MEMORY_LAYOUTS.entries()) {
      for (const player of players) await expect(player.locator('[data-memory-card]')).toHaveCount(layout.length);
      const pairs = [...new Set(layout)].map(symbol => layout.flatMap((value, index) => value === symbol ? [index] : []));
      for (const [pairIndex, pair] of pairs.entries()) {
        await Promise.all(players.map(async player => {
          const first = player.locator(`[data-memory-card="${pair[0]}"]`);
          await expect(first).toBeEnabled();
          await first.tap();
        }));
        if (roundIndex === 2 && pairIndex === pairs.length - 1) {
          for (const player of players) {
            const second = player.locator(`[data-memory-card="${pair[1]}"]`);
            await expect(second).toBeEnabled(); await second.tap();
            await expect(player.getByRole('heading', { name: /위 완주!/ })).toBeVisible();
          }
        } else await Promise.all(players.map(async player => {
          const second = player.locator(`[data-memory-card="${pair[1]}"]`);
          await expect(second).toBeEnabled(); await second.tap();
        }));
        if (roundIndex === 0 && pairIndex === 0) {
          await expect(host.locator('.memory-lane[data-team="A"] .is-removed')).toHaveCount(2);
          await players[0].reload({ waitUntil: 'domcontentloaded' });
          await expect(players[0].locator('.memory-card.is-removed')).toHaveCount(2);
        }
      }
      if (roundIndex === 1) {
        await expect(players[0].locator('[data-memory-card]')).toHaveCount(16);
        await host.screenshot({ path: '.cache/memory-live.png' });
        await players[0].screenshot({ path: '.cache/memory-phone.png' });
        expect(await players[0].evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
      }
    }
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'memory-score', { timeout: 15000 });
    const result = await host.evaluate(async () => {
      const api = await import('/src/event-data.js'); await api.connect();
      const room = localStorage.getItem('martini.host-room');
      await api.awardMemoryPoints(room);
      return { scores: await api.read(room, 'teamScores'), game: await api.read(room, 'memoryGame') };
    });
    expect(result.scores.totals).toEqual({ A: 150, B: 100, C: 50, D: 0 });
    expect(Object.keys(result.scores.awards)).toHaveLength(1);
    for (const team of ['A', 'B', 'C', 'D']) {
      expect(Object.values(result.game.events[team])).toHaveLength(42);
      expect(Object.keys(result.game.events[team][0]).sort()).toEqual(['at', 'cardIndex', 'roundId', 'roundIndex', 'sequence']);
    }
    await host.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(host.locator('.presentation')).toHaveAttribute('data-slide', 'join');
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
