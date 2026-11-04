// Every screen and dialog fits the window, on a small phone held either way
// (320×568, 568×320) and on a desktop (1280×800): no page scrolling, no
// scrolling box inside a page, nothing sideways, and every control and line
// of text inside the window. Long screens page through with Previous and
// Next (src/app/pager.js): each of their items is on exactly one page, the
// first page has no Previous and the last no Next, and Back and the primary
// actions are on every page. Checked with a full journal (every achievement
// unlocked), long text, every tutorial step, the match menu, results and
// the confirm dialogs; and a rotation keeps the focused control and its
// page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';
import { ACHIEVEMENTS } from '../../src/shared/achievements.js';
import {
  createInitialState, applyMove, analyze, squareAt,
} from '../../src/games/acorns-leaves/engine.js';
import { chooseMove } from '../../src/games/acorns-leaves/ai.js';
import { snapshotOf } from '../../src/games/acorns-leaves/resume.js';
import { RESUME_KEY, RESUME_VERSION } from '../../src/shared/resume.js';

const SIZES = [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 1280, height: 800 }];
const sq = (row, col) => squareAt(row, col);

// A save with every achievement unlocked, and records in every table.
const unlockedAll = (book) => Object.fromEntries(ACHIEVEMENTS[book].map((a, i) => [a.id, { at: i % 3 ? Date.UTC(2026, 0, 1 + i) : null }]));
const counts = (wins, losses, draws) => ({ wins, losses, draws });
const FULL = {
  'spiritOfTheWoods:v2': JSON.stringify({
    version: 2,
    achievementSet: 3,
    settings: {
      motion: 'reduce', sfx: false, music: false, haptics: false,
    },
    shellsFeathers: {
      achievements: unlockedAll('shellsFeathers'),
      stats: {
        single: { easy: counts(5, 2, 1), medium: counts(3, 4, 2), hard: counts(0, 3, 6) },
        twoPlayer: { player1Wins: 3, player2Wins: 2, draws: 1 },
        sets: { single: { bestOf3: counts(1, 1, 0), bestOf5: counts(1, 0, 0) }, twoPlayer: {} },
      },
    },
    acornsLeaves: {
      achievements: unlockedAll('acornsLeaves'),
      stats: {
        single: { easy: counts(4, 1, 0), medium: counts(2, 2, 1), hard: counts(1, 3, 0) },
        twoPlayer: { acornWins: 2, leafWins: 1, draws: 0 },
        sets: { single: { bestOf3: counts(1, 0, 0) }, twoPlayer: {} },
        fog: {
          single: { easy: counts(2, 0, 0), medium: counts(1, 1, 0), hard: counts(1, 0, 0) },
          twoPlayer: { acornWins: 1, leafWins: 0, draws: 0 },
        },
      },
    },
    collection: { achievements: unlockedAll('collection') },
  }),
};

// An unfinished Acorns & Leaves match one move from its end (two players),
// worked out with the game's own engine: the last move is played in the test.
function nearlyOver() {
  let seed = 4;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let state = createInitialState();
  const moves = [];
  while (!analyze(state).result) {
    const move = chooseMove(state, {
      difficulty: state.turn === 'acorn' ? 'medium' : 'easy', rng, maxNodes: 800, now: () => 0,
    });
    moves.push(move);
    state = applyMove(state, move);
  }
  const last = moves.pop();
  const snapshot = snapshotOf({
    mode: 'two', variant: 'classic', difficulty: 'easy', side: 'acorn', set: { length: 1, rounds: [] }, moves: moves.map((m) => m.path),
  });
  return { storage: { [RESUME_KEY]: JSON.stringify({ version: RESUME_VERSION, shellsFeathers: null, acornsLeaves: snapshot }) }, last };
}

// What the window shows now: page scroll, sideways overflow, any box that
// scrolls, and every visible control or line of text outside the window.
function measure(page) {
  return page.evaluate(() => {
    // On screen: laid out, visible, and not inside a closed <details>.
    const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
      && !(el.closest('details:not([open])') && !el.closest('summary'));
    const top = document.querySelector('.modal.active, .handoff:not([hidden])') ?? document.querySelector('.screen.active');
    const scrolling = [...document.querySelectorAll('body *')].filter((el) => {
      if (!shown(el)) return false;
      const style = getComputedStyle(el);
      return /auto|scroll/.test(style.overflowY + style.overflowX) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    }).map((el) => el.id || el.className);
    const outside = [...top.querySelectorAll('a, button, input, label, h2, h3, h4, p, li, td, th, legend')]
      .filter((el) => shown(el) && !el.closest('.visually-hidden') && el.getBoundingClientRect().height > 2)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1;
      })
      .map((el) => `${el.tagName} ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}`);
    return {
      scroll: document.documentElement.scrollHeight - innerHeight,
      sideways: document.documentElement.scrollWidth - innerWidth,
      scrolling,
      outside,
    };
  });
}

const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// The pager on top: the open dialog's (its showing view's), else the screen's.
async function pagerRoot(page) {
  if (await page.locator('.modal.active').count()) return page.locator('.modal.active [data-pager]:not([hidden])').first();
  return page.locator('.screen.active[data-pager]');
}

// Checks every page of what is on top; returns the items seen, page by page.
async function everyPage(game, where) {
  const { page } = game;
  await frames(page);
  const root = await pagerRoot(page);
  const fits = async (label) => {
    const m = await measure(page);
    assert.deepEqual(m, {
      scroll: 0, sideways: 0, scrolling: [], outside: [],
    }, `${where} ${label}`);
  };
  if (!(await root.count())) {
    await fits('');
    return [];
  }
  const total = Number(await root.getAttribute('data-pages'));
  const prev = root.locator('[data-pager-prev]');
  const next = root.locator('[data-pager-next]');
  const seen = [];
  for (let i = 1; i <= total; i++) {
    assert.equal(Number(await root.getAttribute('data-page')), i, `${where}: page ${i}`);
    await fits(`page ${i} of ${total}`);
    // The pager's items on this page (each tagged once), and their text.
    seen.push(await root.evaluate((el) => {
      const body = el.querySelector('[data-pager-body]');
      const items = [];
      const walk = (parent) => {
        for (const child of parent.children) {
          if (child.hasAttribute('data-page-split')) walk(child);
          else items.push(child);
        }
      };
      walk(body);
      window.__fitItem ??= 0;
      return items.filter((item) => !item.hidden && !item.classList.contains('pager-off')).map((item) => {
        item.dataset.fitItem ??= String(window.__fitItem++);
        return { id: item.dataset.fitItem, text: item.textContent.trim() };
      });
    }));
    if (total > 1) {
      assert.equal(await root.locator('[data-pager-status]').textContent(), `Page ${i} of ${total}`);
      assert.equal(await prev.isDisabled(), i === 1, `${where}: Previous on page ${i}`);
      assert.equal(await next.isDisabled(), i === total, `${where}: Next on page ${i}`);
    } else {
      assert.equal(await root.locator('[data-pager-nav]').isVisible(), false, `${where}: one page, no Previous/Next`);
    }
    if (i < total) await next.click();
  }
  // And back to the first page.
  for (let i = total; i > 1; i--) await prev.click();
  if (total > 1) assert.equal(await root.getAttribute('data-page'), '1');
  return seen;
}

// Pages to a control and returns it.
async function reveal(game, selector) {
  await frames(game.page);
  const root = await pagerRoot(game.page);
  const target = game.page.locator(selector).first();
  for (let i = 0; i < 60 && !(await target.isVisible()); i++) await root.locator('[data-pager-next]').click();
  return target;
}

test('every screen and dialog fits the window', { timeout: 900_000 }, async (t) => {
  const harness = await startHarness(t);

  for (const viewport of SIZES) {
    const size = `${viewport.width}×${viewport.height}`;

    await t.test(`${size}: hub, setup, How to Play, Settings, Your Path and every journal tab, page by page`, async () => {
      const game = await openGame(harness, { viewport, storage: FULL });
      await everyPage(game, `${size} hub`);
      for (const [hash, screen] of [
        ['#/shells-feathers', 'sf-setup-screen'], ['#/acorns-leaves', 'al-setup-screen'],
        ['#/shells-feathers/how-to-play', 'sf-howto-screen'], ['#/acorns-leaves/how-to-play', 'al-howto-screen'],
        ['#/settings', 'settings-screen'], ['#/your-path', 'path-screen'],
      ]) {
        await game.goTo(hash, screen);
        const pages = await everyPage(game, `${size} ${screen}`);
        // Each item on exactly one page, and every item on some page.
        const items = pages.flat().map((item) => item.id);
        assert.equal(new Set(items).size, items.length, `${size} ${screen}: an item on two pages`);
        const all = await game.page.locator(`#${screen} [data-fit-item]`).count();
        assert.equal(items.length, all, `${size} ${screen}: every item shown once`);
        // Back on every page, and the setup screens' Play buttons too.
        const always = screen.includes('setup') ? ['.back-link', '.mode-btn'] : ['.back-link'];
        for (const selector of always) assert.ok(await game.page.locator(`#${screen} ${selector}`).first().isVisible(), `${screen}: ${selector}`);
      }
      // The journal, every achievement unlocked: each tab's entries, all reachable.
      for (const [hash, book] of [['#/journal', null], ['#/journal/shells-feathers', 'shellsFeathers'], ['#/journal/acorns-leaves', 'acornsLeaves'], ['#/journal/collection', 'collection']]) {
        await game.goTo(hash, 'journal-screen');
        const pages = await everyPage(game, `${size} ${hash}`);
        const entries = await game.page.locator('#journal-panel .journal-entry').count();
        const expected = book ? ACHIEVEMENTS[book].length : Object.values(ACHIEVEMENTS).flat().length;
        assert.equal(entries, expected);
        const titles = pages.flat().filter(({ text }) => Object.values(ACHIEVEMENTS).flat().some((a) => text.startsWith(a.title)));
        assert.ok(titles.length >= expected, `${size} ${hash}: every entry on some page (${titles.length} of ${expected})`);
      }
      assert.deepEqual(game.pageErrors, []);
    });

    await t.test(`${size}: dialogs: the confirm dialogs, the match menu and its settings, results`, async () => {
      const game = await openGame(harness, { viewport, storage: FULL });
      const { page } = game;
      await game.goTo('#/your-path', 'path-screen');
      await (await reveal(game, '#path-screen [data-action="reset-al-stats"]')).click();
      await page.locator('#confirm-dialog.active').waitFor();
      await everyPage(game, `${size} clear progress`);
      for (const selector of ['#confirm-cancel', '#confirm-accept', '.confirm-warning']) assert.ok(await page.locator(selector).isVisible(), selector);
      await page.keyboard.press('Escape');
      await game.goTo('#/settings', 'settings-screen');
      await (await reveal(game, '#settings-screen [data-action="delete-all-data"]')).click();
      await page.locator('#confirm-dialog.active').waitFor();
      await everyPage(game, `${size} delete all`);
      await page.keyboard.press('Escape');

      await game.startNew('#/shells-feathers/play/two', 'game-screen');
      await everyPage(game, `${size} match`);
      await game.press('Menu', { exact: true });
      await everyPage(game, `${size} pause`);
      await game.press('Settings', { exact: true });
      await everyPage(game, `${size} menu settings`);
      await game.press('Done', { exact: true });
      await game.press('Resume', { exact: true });
      for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
      await game.waitForResult();
      await everyPage(game, `${size} result`);
      await game.press('View Board');
      await everyPage(game, `${size} finished match`);

      // Acorns & Leaves: its last move, the result and the finished board.
      const { storage, last } = nearlyOver();
      const al = await openGame(harness, { viewport, storage: { ...FULL, ...storage } });
      await al.goTo('#/acorns-leaves/resume', 'al-game-screen');
      await everyPage(al, `${size} A&L match`);
      await al.playPath(last.path);
      await al.waitForResult();
      await everyPage(al, `${size} A&L result`);
      await al.press('View Board');
      await everyPage(al, `${size} A&L finished match`);
      // Fog with two players: the handoff screen.
      await al.startNew('#/acorns-leaves/fog/two', 'al-game-screen');
      await everyPage(al, `${size} handoff`);
      assert.deepEqual([...game.pageErrors, ...al.pageErrors], []);
    });

    await t.test(`${size}: every tutorial step, with its hint and its Next or Play`, async () => {
      const game = await openGame(harness, { viewport, storage: FULL });
      const cell = (i) => game.page.locator(`#practice-board [data-practice="${i}"]`);
      const step = async (label, taps) => {
        for (const i of taps) await cell(i).click();
        await everyPage(game, `${size} ${label}`);
      };
      const next = () => game.page.locator('#tutorial-next').click();
      await game.goTo('#/shells-feathers/tutorial', 'tutorial-screen');
      await step('S&F 1', []);
      await step('S&F 1 done', [4]);
      await next();
      await step('S&F 2 hint', [5]);
      await step('S&F 2 done', [2]);
      await next();
      await step('S&F 3 hint', [5]);
      await step('S&F 3 done', [8]);
      assert.ok(await game.page.locator('#tutorial-play').isVisible());

      await game.goTo('#/acorns-leaves/tutorial', 'tutorial-screen');
      await step('A&L 1', []);
      await step('A&L 1 done', [sq(5, 2), sq(4, 1)]);
      await next();
      await step('A&L 2', [sq(6, 5)]); // a piece that may not move: a hint
      await step('A&L 2 done', [sq(5, 2), sq(3, 4)]);
      await next();
      await step('A&L 3 done', [sq(1, 2), sq(0, 1)]);
      await next();
      await step('A&L 4 done', [sq(6, 1), sq(5, 2)]);
      assert.ok(await game.page.locator('#tutorial-play').isVisible());
      // Squares stay a size a finger can hit.
      const square = await cell(sq(0, 1)).evaluate((el) => el.getBoundingClientRect().width);
      assert.ok(square >= 30, `${size}: practice squares ${square}px`);
      assert.deepEqual(game.pageErrors, []);
    });
  }

  await t.test('long text pages through too (nothing cut off or hidden)', async () => {
    const game = await openGame(harness, { viewport: { width: 320, height: 568 }, storage: FULL });
    await game.goTo('#/settings', 'settings-screen');
    const before = Number(await game.page.locator('#settings-screen').getAttribute('data-pages'));
    // A long translation of a hint, as a language with longer words might give.
    const long = await game.page.evaluate(() => {
      const hint = document.getElementById('haptics-hint');
      hint.textContent = `${hint.textContent} `.repeat(4).trim();
      return hint.textContent;
    });
    const pages = await everyPage(game, 'long Settings');
    assert.ok(pages.length > before, `more pages for more text (${before} → ${pages.length})`);
    // Too long for one page, it pages by its sentences: all of them, in order.
    const shown = pages.flat().filter(({ text }) => text && long.includes(text)).map(({ text }) => text).join(' ');
    assert.equal(shown.replace(/\s+/g, ' '), long.replace(/\s+/g, ' '));
    assert.equal(await game.page.locator('#haptics-hint').evaluate((el) => el.textContent), long, 'the text itself unchanged');
  });

  await t.test('a rotation keeps the focused control and its page; reading stays readable', async () => {
    const game = await openGame(harness, { viewport: { width: 320, height: 568 }, storage: FULL });
    const { page } = game;
    await game.goTo('#/settings', 'settings-screen');
    const target = await reveal(game, '#settings-screen [data-action="delete-all-data"]');
    await target.focus();
    for (const viewport of [{ width: 568, height: 320 }, { width: 1280, height: 800 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      await frames(page);
      await frames(page);
      const state = await page.evaluate(() => {
        const el = document.activeElement;
        const r = el.getBoundingClientRect();
        return {
          focused: el.dataset.action, visible: el.getClientRects().length > 0 && r.top >= 0 && r.bottom <= innerHeight,
        };
      });
      assert.deepEqual(state, { focused: 'delete-all-data', visible: true }, `${viewport.width}×${viewport.height}`);
      assert.deepEqual(await measure(page), {
        scroll: 0, sideways: 0, scrolling: [], outside: [],
      });
      // Text never shrinks below a readable size.
      const smallest = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.screen.active p, .screen.active li, .screen.active button, .screen.active a')]
        .filter((el) => el.getClientRects().length && !el.closest('.visually-hidden, .pager-off'))
        .map((el) => parseFloat(getComputedStyle(el).fontSize))));
      assert.ok(smallest >= 12, `smallest text ${smallest}px`);
    }
    // Paging by keyboard: Next keeps focus until the last page, then focus
    // moves to Previous.
    await game.goTo('#/journal', 'journal-screen');
    await frames(page);
    const next = page.locator('#journal-screen [data-pager-next]');
    await next.focus();
    const total = Number(await page.locator('#journal-screen').getAttribute('data-pages'));
    for (let i = 1; i < total; i++) await page.keyboard.press('Enter');
    assert.equal(await page.locator('#journal-screen').getAttribute('data-page'), String(total));
    assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-pager-prev')), true);
  });
});
