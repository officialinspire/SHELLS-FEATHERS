// The achievement journal and unlock notices in the real page (Stage 14):
// the tabs (mouse, keyboard, their own URLs, a reload), locked and unlocked
// entries with dates and progress, no emoji, phone sizes without tiny cards;
// a Stage 8 save migrated as it loads; and a real crowning against the
// Spirit: its notice in the match line's place (never over the board or a
// control), held by the menu, dropped on leaving, and never again after a
// reload.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';
import { createInitialState, legalMoves, applyMove } from '../../src/games/acorns-leaves/engine.js';
import { chooseMove } from '../../src/games/acorns-leaves/ai.js';
import { NOTICE } from '../../src/app/toast.js';

const V2_KEY = 'spiritOfTheWoods:v2';
const DAY = Date.UTC(2026, 9, 20);

// The page's Spirit, made predictable: with Math.random fixed at 0.5 its
// Gentle choice is the one this test can work out here. Plays seeded random
// moves for the player until `want(move)`; returns the player's paths.
const FIXED_RANDOM = 'Math.random = () => 0.5;';
function lineUntil(want) {
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let state = createInitialState();
  const paths = [];
  for (let turn = 0; turn < 40; turn++) {
    const moves = legalMoves(state);
    const move = moves[Math.floor(rand() * moves.length)];
    paths.push(move.path);
    state = applyMove(state, move);
    if (want(move)) return paths;
    state = applyMove(state, chooseMove(state, { difficulty: 'easy', rng: () => 0.5 }));
  }
  throw new Error('no such line');
}

async function playLine(game, paths) {
  for (const path of paths) {
    await game.waitForBoardState('ready', 15_000);
    await game.playPath(path);
  }
}

const rect = (page, selector) => page.locator(selector).evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
});
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const seeded = {
  version: 2,
  achievementSet: 2,
  settings: { sfx: false, music: false },
  shellsFeathers: {
    stats: { single: { easy: { wins: 3, losses: 1, draws: 0 } } },
    achievements: { 'first-game': { at: DAY }, 'first-win': { at: DAY }, 'gentle-win': { at: DAY }, 'shell-win': { at: DAY + 864e5 } },
  },
  acornsLeaves: { stats: { single: { easy: { wins: 0, losses: 1, draws: 0 } } }, achievements: { 'first-game': { at: null } } },
};

test('achievement journal', { timeout: 600_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('tabs: from the hub, each with its own URL; arrow keys, Home and End; a reload keeps the tab', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, storage: { [V2_KEY]: JSON.stringify(seeded) } });
    const { page } = game;
    await game.press('Journal');
    await game.waitForScreen('journal-screen');
    assert.equal(await page.evaluate(() => window.location.hash), '#/journal');
    assert.equal(await page.locator('#journal-summary').textContent(), '6 of 22 achievements unlocked', 'Two Paths from both First Games');
    const tabs = page.getByRole('tab');
    assert.deepEqual(await tabs.allTextContents(), ['All 6 of 22', 'Shells & Feathers 4 of 9', 'Acorns & Leaves 1 of 10', 'Collection 1 of 3']);
    // All: three books, each in its parts.
    assert.deepEqual(await page.locator('#journal-panel .journal-book').allTextContents(),
      ['Shells & Feathers (4 of 9)', 'Acorns & Leaves (1 of 10)', 'Collection (1 of 3)']);
    assert.equal(await page.locator('#journal-panel .journal-entry').count(), 22);

    await page.getByRole('tab', { name: /Collection/ }).click();
    assert.equal(await page.evaluate(() => window.location.hash), '#/journal/collection');
    assert.equal(await page.title(), 'Achievement Journal: Collection · Spirit of the Woods');
    assert.equal(await page.locator('#journal-panel').getAttribute('aria-labelledby'), 'journal-tab-collection');
    assert.deepEqual(await page.locator('#journal-panel .journal-entry').evaluateAll((els) => els.map((e) => e.dataset.id)), ['both-games', 'both-wins', 'all-sides']);
    // Keyboard: the selected tab is the one stop; arrows wrap; Home and End.
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'journal-tab-all', 'wraps to the first');
    assert.equal(await page.evaluate(() => window.location.hash), '#/journal');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-selected')), 'true');
    assert.equal(await page.evaluate(() => window.location.hash), '#/journal/shells-feathers');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'journal-tab-collection');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => window.location.hash), '#/journal/acorns-leaves');
    assert.deepEqual(await page.locator('[role="tab"][tabindex="0"]').evaluateAll((els) => els.map((e) => e.id)), ['journal-tab-acornsLeaves']);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'journal-panel', 'Tab goes on to the page');

    await page.reload();
    await game.waitForScreen('journal-screen');
    assert.equal(await page.locator('#journal-tab-acornsLeaves').getAttribute('aria-selected'), 'true', 'the tab after a reload');
    // Changing tabs added no history: Back leaves the journal.
    await page.goBack();
    await game.waitForScreen('hub-screen');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('entries: locked and unlocked look and say so, with dates, progress, the sides note and no emoji', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, storage: { [V2_KEY]: JSON.stringify(seeded) } });
    const { page } = game;
    await game.goTo('#/journal/shells-feathers', 'journal-screen');
    const entry = (id) => page.locator(`#journal-panel .journal-entry[data-id="${id}"]`);
    const look = (id) => entry(id).evaluate((el) => {
      const medal = getComputedStyle(el.querySelector('.medal'));
      return {
        unlocked: el.classList.contains('is-unlocked'),
        state: el.querySelector('.entry-state').textContent,
        medal: medal.backgroundImage !== 'none' ? 'gold' : medal.borderStyle,
        icon: el.querySelector('use').getAttribute('href'),
      };
    });
    const firstWin = await look('first-win');
    assert.equal(firstWin.unlocked, true);
    assert.match(firstWin.state, /^Unlocked Oct 20, 2026$|^Unlocked 20 Oct 2026$/);
    assert.equal(firstWin.medal, 'gold');
    assert.equal(firstWin.icon, '#ach-laurel');
    const feather = await look('feather-win');
    assert.deepEqual([feather.unlocked, feather.state, feather.medal], [false, 'Locked', 'dashed']);
    assert.equal(await entry('feather-win').locator('.entry-note').textContent(), 'Counts wins since the journal began noting sides.');
    assert.equal(await entry('ten-games').locator('.progress-text').textContent(), '4 of 10 games');
    assert.equal(await entry('ten-games').locator('.progress-fill').evaluate((el) => el.style.width), '40%');
    assert.equal(await entry('first-win').locator('.entry-progress').count(), 0, 'no progress once unlocked');
    await page.getByRole('tab', { name: /Acorns/ }).click();
    assert.equal(await entry('first-game').locator('.entry-state').textContent(), 'Unlocked before dates were kept');
    await page.getByRole('tab', { name: /Collection/ }).click();
    assert.deepEqual(await entry('all-sides').locator('.entry-part').allTextContents(), [
      'Shells & Feathers: Win with Shells (done)', 'Shells & Feathers: Win with Feathers',
      'Acorns & Leaves: Win with Acorns', 'Acorns & Leaves: Win with Leaves',
    ]);
    // Every icon is drawn from the sprite; no emoji anywhere in the journal.
    await page.getByRole('tab', { name: /All/ }).click();
    const text = await page.locator('#journal-screen').textContent();
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
    const missing = await page.locator('#journal-panel use').evaluateAll((uses) => uses.map((u) => u.getAttribute('href')).filter((h) => !document.querySelector(h)));
    assert.deepEqual(missing, []);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('phones: tabs two by two and easy to hit, readable entries, nothing wider than the screen', async () => {
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
      const game = await openGame(harness, { viewport, storage: { [V2_KEY]: JSON.stringify(seeded) } });
      const { page } = game;
      await game.goTo('#/journal', 'journal-screen');
      const sizes = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        tabs: [...document.querySelectorAll('.journal-tab')].map((el) => {
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height, top: Math.round(r.top) };
        }),
        entries: [...document.querySelectorAll('.journal-entry')].map((el) => el.getBoundingClientRect().width),
        desc: parseFloat(getComputedStyle(document.querySelector('.entry-desc')).fontSize),
        medal: document.querySelector('.medal').getBoundingClientRect().width,
      }));
      assert.ok(sizes.overflow <= 0, `${viewport.width}: no sideways scrolling`);
      assert.equal(new Set(sizes.tabs.map((r) => r.top)).size, 2, 'two rows of two');
      assert.ok(sizes.tabs.every((r) => r.h >= 44 && r.w >= 120), JSON.stringify(sizes.tabs));
      assert.ok(Math.min(...sizes.entries) >= viewport.width - 80, 'one full-width column of entries');
      assert.ok(sizes.desc >= 14, `descriptions at ${sizes.desc}px`);
      assert.ok(sizes.medal >= 40);
      assert.deepEqual(game.pageErrors, []);
    }
  });

  await t.test('a Stage 8 save: migrated as it loads, with nothing guessed and nothing announced', async () => {
    const stage8 = {
      version: 2,
      settings: { sfx: false, music: false },
      shellsFeathers: { stats: { single: { easy: { wins: 3 } } }, achievements: { 'first-game': { at: DAY }, 'first-win': { at: DAY }, 'gentle-win': { at: DAY } } },
      acornsLeaves: { stats: { fog: { twoPlayer: { acornWins: 1 } } }, achievements: { 'shared-board': { at: DAY } } },
    };
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, storage: { [V2_KEY]: JSON.stringify(stage8) } });
    const { page } = game;
    const stored = JSON.parse(await game.storageItem(V2_KEY));
    assert.equal(stored.achievementSet, 2);
    assert.deepEqual(stored.shellsFeathers.achievements, stage8.shellsFeathers.achievements, 'ids and dates kept');
    assert.deepEqual(stored.acornsLeaves.achievements, { 'shared-board': { at: DAY }, 'first-game': { at: null }, 'shared-fog': { at: null } });
    assert.deepEqual(stored.shellsFeathers.stats.single.easy, { wins: 3, losses: 0, draws: 0 }, 'records kept');
    assert.ok(!('shell-win' in stored.shellsFeathers.achievements), 'which side won those games was never recorded');
    await page.reload();
    assert.deepEqual(JSON.parse(await game.storageItem(V2_KEY)), stored, 'loading again changes nothing');
    await game.goTo('#/journal/acorns-leaves', 'journal-screen');
    assert.equal(await page.locator('.journal-entry[data-id="shared-fog"] .entry-state').textContent(), 'Unlocked before dates were kept');
    assert.equal(await page.locator('#notice-status').textContent(), '');
  });

  await t.test('a crowning against the Spirit: a notice in the match line\'s place, held by the menu, gone on leaving, never twice', async () => {
    const line = lineUntil((move) => move.crowned);
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
      const game = await openGame(harness, { viewport, initScript: FIXED_RANDOM, storage: { [V2_KEY]: JSON.stringify({ version: 2, settings: { sfx: false, music: false } }) } });
      const { page } = game;
      await game.goTo('#/acorns-leaves/play/single', 'al-game-screen');
      await playLine(game, line);
      const notice = page.locator('#al-notice');
      await notice.waitFor({ state: 'visible' });
      assert.equal(await page.locator('#al-notice-text').textContent(), 'Unlocked: Crowned');
      assert.match(await page.locator('#notice-status').textContent(), /^Achievement unlocked: Crowned\. Crown one of your own pieces/);
      assert.equal(await page.locator('#al-match-info').evaluate((el) => getComputedStyle(el).visibility), 'hidden', 'in the match line\'s place');
      const box = await rect(page, '#al-notice');
      for (const control of ['#al-menu-button', '#al-board', '#al-side-acorn', '#al-side-leaf', '#al-turn', '#al-hint']) {
        assert.ok(!overlaps(box, await rect(page, control)), `${viewport.width}×${viewport.height}: clear of ${control}`);
      }
      assert.equal(await notice.evaluate((el) => getComputedStyle(el).pointerEvents), 'none');

      // The menu holds it: still there long after its time.
      await game.press('Menu', { exact: true });
      await page.waitForTimeout(NOTICE.SHOW_MS + 500);
      assert.equal(await notice.isVisible(), true, 'held while the menu is open');
      await page.keyboard.press('Escape');
      await notice.waitFor({ state: 'hidden', timeout: NOTICE.SHOW_MS + 2000 });
      assert.equal(await page.locator('#al-match-info').evaluate((el) => getComputedStyle(el).visibility), 'visible');
      if (viewport.width !== 1280) continue;

      // The journal has it, dated; a reload and the same crowning again: no notice.
      await game.goTo('#/journal/acorns-leaves', 'journal-screen');
      assert.match(await page.locator('.journal-entry[data-id="crowned"] .entry-state').textContent(), /^Unlocked \S/);
      await page.reload();
      await game.goTo('#/acorns-leaves/play/single', 'al-game-screen');
      await playLine(game, line);
      await page.waitForTimeout(600);
      assert.equal(await notice.isVisible(), false, 'unlocked once');
      assert.deepEqual(Object.keys(JSON.parse(await game.storageItem(V2_KEY)).acornsLeaves.achievements), ['crowned']);
      assert.deepEqual(game.pageErrors, []);
    }
  });

  await t.test('leaving the match drops a notice that is showing', async () => {
    const line = lineUntil((move) => move.crowned);
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, initScript: FIXED_RANDOM });
    const { page } = game;
    await game.goTo('#/acorns-leaves/play/single', 'al-game-screen');
    await playLine(game, line);
    await page.locator('#al-notice').waitFor({ state: 'visible' });
    await game.fromMenu('Change Mode');
    await game.waitForScreen('al-setup-screen');
    assert.equal(await page.locator('#al-notice').isHidden(), true);
    await game.goTo('#/acorns-leaves/play/single', 'al-game-screen');
    assert.equal(await page.locator('#al-notice').isHidden(), true, 'nothing carried into the next match');
    assert.equal(await page.locator('#al-match-info').evaluate((el) => getComputedStyle(el).visibility), 'visible');
    assert.deepEqual(game.pageErrors, []);
  });
});
