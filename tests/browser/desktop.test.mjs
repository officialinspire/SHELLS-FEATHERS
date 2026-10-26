// Desktop play in the real page, both games: the board beside a side panel
// at common window sizes; mouse play; keyboard-only play with visible focus
// distinct from the picked-up piece, and predictable focus after every
// action; resizing mid-match between desktop and phone layouts; the menu,
// its Settings and a hidden page each freezing the match; Restart and
// leaving cancelling the Spirit and animations; the hint, last move and rule
// note; and difficulty descriptions that match the Spirit's settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';
import { createInitialState, rowsFromBoard, squareAt } from '../../src/games/acorns-leaves/engine.js';
import { describeLevel } from '../../src/games/acorns-leaves/ai.js';
import { describeFogLevel } from '../../src/games/acorns-leaves/fog-ai.js';
import { RULE_NOTES } from '../../src/games/acorns-leaves/text.js';
import { LEVEL_WORDS } from '../../src/games/shells-feathers/ai.js';
import { DELAYS as AL_DELAYS } from '../../src/games/acorns-leaves/session.js';
import { DELAYS as SF_DELAYS } from '../../src/games/shells-feathers/session.js';

const sq = (row, col) => squareAt(row, col);
// Six quiet moves after which the Acorns must capture: c3 can jump twice.
const TO_DOUBLE_JUMP = [[44, 37], [17, 24], [51, 44], [10, 17], [60, 51], [24, 33]];
const DOUBLE_JUMP = [sq(5, 2), sq(3, 0), sq(1, 2)];

const panel = (page) => page.evaluate(() => {
  const s = document.querySelector('.screen.active');
  const box = (sel) => {
    const el = s.querySelector(sel);
    if (!el || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  return {
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    board: box('.game-board, .al-board-frame'),
    header: box('.game-header'),
    hint: box('.match-hint'),
    notes: box('.match-notes'),
    help: box('.match-help summary'),
    controls: [...s.querySelectorAll('.game-controls > *')].filter((el) => el.getClientRects().length).map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.textContent.trim(), height: r.height, bottom: r.bottom };
    }),
    smallestText: Math.min(...[...s.querySelectorAll('.game-header, .match-hint, .match-notes, .match-help summary')]
      .filter((el) => el.getClientRects().length)
      .map((el) => parseFloat(getComputedStyle(el).fontSize))),
  };
});

// What has focus: its label, square or index, and how its ring is drawn.
const focused = (page) => page.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  return {
    label: el.getAttribute('aria-label') || el.textContent.trim().replace(/\s+/g, ' '),
    square: el.dataset?.square ?? null,
    index: el.dataset?.index ?? null,
    id: el.id,
    outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
    outlineColor: cs.outlineColor,
    visible: el.getClientRects().length > 0,
  };
});

test('desktop play', { timeout: 600_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('the board beside a compact side panel at common window sizes, nothing scrolls, nothing tiny', async () => {
    for (const [width, height] of [[900, 600], [1024, 768], [1280, 720], [1280, 800], [1366, 768], [1440, 900], [1920, 1080]]) {
      const game = await openGame(harness, { viewport: { width, height } });
      for (const [hash, cap] of [['#/shells-feathers/play/single', 640], ['#/acorns-leaves/play/single', 860]]) {
        await game.goTo(hash, hash.includes('acorns') ? 'al-game-screen' : 'game-screen');
        await game.settle();
        const p = await panel(game.page);
        const where = `${width}×${height} ${hash}`;
        assert.ok(p.scrollWidth <= width && p.scrollHeight <= height + 1, `${where}: no scrolling (${p.scrollWidth}×${p.scrollHeight})`);
        assert.ok(Math.abs(p.board.width - p.board.height) < 1, `${where}: the board is square, not stretched`);
        assert.ok(p.board.width >= Math.min(cap, 0.85 * (height - 48)) - 1, `${where}: the board is ${Math.round(p.board.width)}px`);
        assert.ok(p.board.right <= p.header.left, `${where}: the panel is beside the board`);
        const [left, right] = [p.board.left, width - p.header.right];
        assert.ok(Math.abs(left - right) <= 2, `${where}: board and panel centered together (${Math.round(left)} / ${Math.round(right)})`);
        assert.ok(p.header.width >= 250 && p.header.width <= 460, `${where}: panel ${Math.round(p.header.width)}px wide`);
        for (const part of ['hint', 'notes', 'help']) assert.ok(p[part] && p[part].left >= p.header.left - 1, `${where}: ${part} in the panel`);
        assert.deepEqual(p.controls.map((c) => c.name), ['Restart', 'Change Mode'], `${where}: match controls in the panel`);
        assert.ok(p.controls.every((c) => c.height >= 44 && c.bottom <= height), `${where}: controls on screen and at least 44px`);
        assert.ok(p.smallestText >= 13.5, `${where}: panel text at least 13.5px (${p.smallestText})`);
      }
      assert.deepEqual(game.pageErrors, []);
      await game.page.context().close();
    }
  });

  await t.test('mouse: both games played by clicking, with every mark shown without hovering', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.newMatch('two');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    assert.equal((await game.waitForResult()).title, 'Player 1 Wins!');
    await game.press('View Board');
    assert.equal(await page.locator('#sf-hint').textContent(), 'Three shells in the top row.');

    await game.goTo('#/acorns-leaves/play/two', 'al-game-screen');
    for (const path of TO_DOUBLE_JUMP) await game.playPath(path);
    await page.mouse.move(0, 0); // nothing hovered
    await game.tapSquare(sq(5, 2));
    const marks = await page.evaluate(() => [...document.querySelectorAll('#al-board .is-destination, #al-board .is-selected, #al-board .must-jump')]
      .map((el) => getComputedStyle(el, '::before').content !== 'none'));
    assert.ok(marks.length >= 2 && marks.every(Boolean), 'the pick and where it can go are drawn without a hover');
    for (const s of DOUBLE_JUMP.slice(1)) await game.tapSquare(s);
    assert.deepEqual((await game.checkersView()).captured, { acorn: 2, leaf: 0 });
    assert.match(await page.locator('#al-last').textContent(), /^Acorns jumped from c3 to a5 to c7, capturing 2 leaves\./);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('keyboard only: arrows, Enter/Space, Escape; focus distinct from the pick; focus after every action', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.goTo('#/acorns-leaves/play/two', 'al-game-screen');
    await page.locator('#al-board [tabindex="0"]').focus();
    assert.equal((await focused(page)).square, String(sq(5, 0)), 'the board starts on a3');

    // Pick c3 with Enter: focus ring (square, cream) and pick (round, gold) both show.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    const both = await page.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      const ring = getComputedStyle(el, '::before');
      return {
        selected: el.classList.contains('is-selected'),
        focus: `${cs.outlineStyle} ${cs.outlineColor}`,
        ring: `${ring.borderTopStyle} ${ring.borderTopColor} ${ring.borderRadius}`,
      };
    });
    assert.deepEqual(both, { selected: true, focus: 'solid rgb(255, 248, 220)', ring: 'solid rgb(255, 224, 138) 50%' });
    // Escape puts it back; focus stays.
    await page.keyboard.press('Escape');
    assert.deepEqual((await game.checkersView()).selected, []);
    assert.equal(await game.checkersStatus(), 'Piece put back.');
    assert.equal((await focused(page)).square, String(sq(5, 2)));

    // The line into the double jump, by keyboard: move the focus with arrows to each square.
    const goTo = async (target) => {
      for (let i = 0; i < 20 && Number((await focused(page)).square) !== target; i++) {
        const at = Number((await focused(page)).square);
        const [r, c, tr, tc] = [Math.floor(at / 8), at % 8, Math.floor(target / 8), target % 8];
        let key;
        if (tr < r) key = 'ArrowUp';
        else if (tr > r) key = 'ArrowDown';
        else key = tc < c ? 'ArrowLeft' : 'ArrowRight';
        await page.keyboard.press(key);
      }
      assert.equal(Number((await focused(page)).square), target, `reached square ${target}`);
    };
    let i = 0;
    for (const [from, to] of TO_DOUBLE_JUMP) {
      await goTo(from);
      await page.keyboard.press(i % 2 ? 'Space' : 'Enter');
      await goTo(to);
      await page.keyboard.press(i % 2 ? 'Enter' : 'Space');
      i++;
    }
    assert.equal(await page.locator('#al-note').textContent(), RULE_NOTES.capture, 'the panel says why only ringed pieces may move');
    await goTo(sq(5, 2));
    await page.keyboard.press('Enter');
    await goTo(sq(3, 0));
    await page.keyboard.press('Enter');
    // Escape mid-chain is refused, and says why.
    await page.keyboard.press('Escape');
    assert.equal(await game.checkersStatus(), 'Keep jumping with the same piece: choose a ring.');
    assert.equal(await page.locator('#al-note').textContent(), RULE_NOTES.chain);
    await goTo(sq(1, 2));
    await page.keyboard.press('Enter');
    assert.deepEqual((await game.checkersView()).captured, { acorn: 2, leaf: 0 });

    // Menu by keyboard: Shift+Tab from the board reaches it; focus returns to it.
    await page.keyboard.press('Shift+Tab');
    assert.equal((await focused(page)).label, 'Menu');
    await page.keyboard.press('Enter');
    assert.equal((await focused(page)).label, 'Resume');
    await page.keyboard.press('Tab');
    assert.equal((await focused(page)).label, 'Settings');
    await page.keyboard.press('Enter');
    assert.equal((await focused(page)).id, 'al-menu-settings-title', 'the Settings view takes focus');
    await page.keyboard.press('Tab');
    assert.equal((await focused(page)).id, 'al-menu-music');
    await page.keyboard.press('Escape');
    assert.equal((await focused(page)).label, 'Settings', 'Escape steps back to the Paused view');
    await page.keyboard.press('Escape');
    assert.equal((await focused(page)).id, 'al-menu-button', 'and then closes the menu, back on Menu');

    // The panel's Restart: focus goes to the board's first square.
    await page.keyboard.press('Tab'); // board
    for (let k = 0; k < 6 && (await focused(page)).label !== 'Restart'; k++) await page.keyboard.press('Tab');
    assert.equal((await focused(page)).label, 'Restart');
    await page.keyboard.press('Enter');
    assert.equal((await focused(page)).square, String(sq(5, 0)), 'after Restart, focus is on the board');
    assert.deepEqual(await game.checkersRows(), rowsFromBoard(createInitialState().board));
    assert.match((await focused(page)).outline, /^solid/, 'with a visible ring');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('keyboard only in Shells & Feathers: View Board, Play Again from the panel, and Escape', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.goTo('#/shells-feathers/play/two', 'game-screen');
    await page.locator('.cell[data-index="0"]').focus();
    for (const keys of [['Enter'], ['ArrowDown', 'Enter'], ['ArrowUp', 'ArrowRight', 'Space'], ['ArrowDown', 'Enter'], ['ArrowUp', 'ArrowRight', 'Enter']]) {
      for (const key of keys) await page.keyboard.press(key);
    }
    await game.waitForResult();
    assert.equal((await focused(page)).label, 'Play Again');
    await page.keyboard.press('Escape');
    assert.equal(await game.modalOpen(), false);
    const after = await focused(page);
    assert.equal(after.label, 'Play Again', 'View Board leaves focus on the panel\'s Play Again');
    assert.equal(after.visible, true);
    await page.keyboard.press('Enter');
    await game.waitForTurn("Player 1's Turn");
    assert.equal((await focused(page)).index, '0', 'a new round starts with focus on the first square');
    assert.deepEqual(await game.cells(), Array(9).fill(''));
  });

  await t.test('resizing mid-match between desktop and phone keeps the game, the pick and focus', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.goTo('#/acorns-leaves/play/two', 'al-game-screen');
    await game.playPath([sq(5, 2), sq(4, 3)]);
    await game.tapSquare(sq(2, 1));
    const rows = await game.checkersRows();
    for (const [width, height, layout] of [[390, 844, 'phone'], [844, 390, 'landscape'], [1024, 768, 'desktop'], [1920, 1080, 'desktop']]) {
      await page.setViewportSize({ width, height });
      await game.wait(150);
      await game.settle();
      const p = await panel(page);
      assert.deepEqual(await game.checkersRows(), rows, `${width}×${height}: same board`);
      assert.deepEqual((await game.checkersView()).selected, [sq(2, 1)], `${width}×${height}: the pick is kept`);
      assert.ok(p.scrollWidth <= width && p.scrollHeight <= height + 1, `${width}×${height}: fits`);
      if (layout === 'phone') assert.ok(p.header.bottom <= p.board.top, 'phone: header above the board');
      else assert.ok(p.board.right <= p.header.left, `${layout}: header beside the board`);
      assert.equal(p.notes !== null, layout === 'desktop', `${layout}: panel notes only on wide screens`);
    }
    // Focus on the panel's Restart, then the window narrows to a phone:
    // the button goes, and focus moves to Menu instead of being lost.
    await page.locator('#al-game-screen .game-controls [data-action="al-restart"]').focus();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.activeElement?.id === 'al-menu-button');
    // The same when the browser has already dropped focus to the page.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('#al-game-screen .game-controls [data-action="al-restart"]').focus();
    await page.evaluate(() => document.activeElement.blur());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.activeElement?.id === 'al-menu-button');
    await game.tapSquare(sq(3, 0));
    assert.equal((await game.checkersView()).toMove, 'acorn', 'the picked-up piece still moves');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('pause: the menu, its Settings and a hidden page each freeze the match; Resume goes on', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    // Shells & Feathers: Settings inside the menu keeps the match paused.
    await game.newMatch('single');
    await game.tap(4);
    await game.press('Menu', { exact: true });
    await game.press('Settings', { exact: true });
    await page.locator('#sf-menu-music').uncheck();
    assert.equal(await game.storageItem('spiritOfTheWoods:v2').then((s) => JSON.parse(s).settings.music), false, 'saved at once');
    await game.wait(SF_DELAYS.spiritMove * 2);
    assert.equal((await game.cells()).filter(Boolean).length, 1, 'no Spirit move while Settings is open');
    const paused = await page.evaluate(() => document.getAnimations().every((a) => a.playState !== 'running'));
    assert.equal(paused, true, 'animations are held too');
    await game.press('Done');
    await game.press('Resume');
    await game.waitForPieces(2);
    // The Settings screen shows the change made in the match.
    await game.goTo('#/settings', 'settings-screen');
    assert.equal(await page.locator('#music-toggle').isChecked(), false);

    // Acorns & Leaves: a hidden page holds the Spirit.
    await game.goTo('#/acorns-leaves/play/single', 'al-game-screen');
    await game.playPath([sq(5, 2), sq(4, 3)]);
    const setHidden = (hidden) => page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await setHidden(true);
    const before = await game.checkersRows();
    await game.wait(AL_DELAYS.spiritThink + 6 * AL_DELAYS.spiritStep);
    assert.deepEqual(await game.checkersRows(), before, 'no Spirit move while the page is hidden');
    // The menu opened and closed while hidden doesn't let it go either.
    await game.press('Menu', { exact: true });
    await game.press('Resume');
    await game.wait(AL_DELAYS.spiritThink + 6 * AL_DELAYS.spiritStep);
    assert.deepEqual(await game.checkersRows(), before);
    await setHidden(false);
    await game.waitForBoardState('ready');
    assert.notDeepEqual(await game.checkersRows(), before, 'shown again, the Spirit moves');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('Restart and leaving cancel the Spirit and its animations', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.goTo('#/acorns-leaves/play/single', 'al-game-screen');
    await game.playPath([sq(5, 2), sq(4, 3)]);
    await game.waitForBoardState('waiting');
    await game.press('Restart', { exact: true });
    const fresh = rowsFromBoard(createInitialState().board);
    assert.deepEqual(await game.checkersRows(), fresh);
    await game.wait(AL_DELAYS.spiritThink + 6 * AL_DELAYS.spiritStep);
    assert.deepEqual(await game.checkersRows(), fresh, 'the old Spirit move never lands');
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('#al-board')).length);
    assert.equal(running, 0, 'no animation left from the old game');

    // Leaving by the panel's Change Mode during the Spirit's turn.
    await game.playPath([sq(5, 2), sq(4, 3)]);
    await game.press('Change Mode', { exact: true });
    await game.waitForScreen('al-setup-screen');
    const said = await game.checkersStatus();
    await game.wait(AL_DELAYS.spiritThink + 6 * AL_DELAYS.spiritStep);
    assert.equal(await game.checkersStatus(), said, 'nothing more happens after leaving');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('the panel explains: the Spirit thinking at its level, a taken square, the last move', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.newMatch('single', { difficulty: 'Balanced' });
    await game.tap(4);
    assert.equal(await page.locator('#sf-hint').textContent(), 'The Spirit is thinking…');
    assert.equal(await page.locator('#sf-note').textContent(), LEVEL_WORDS.medium);
    await game.waitForPieces(2);
    // A click on a taken square (aria-disabled, so forced) is answered.
    await page.locator('.cell[data-index="4"]').click({ force: true });
    assert.equal(await page.locator('#sf-hint').textContent(), 'That square is taken: choose an empty one.');
    assert.equal(await page.locator('#sf-hint').getAttribute('data-tone'), 'feedback');

    // Acorns & Leaves against the Spirit: how it thinks, then its move.
    await game.goTo('#/acorns-leaves/play/single', 'al-game-screen');
    assert.equal(await page.locator('#al-last').textContent(), 'None yet.');
    await game.playPath([sq(5, 2), sq(4, 3)]);
    assert.equal(await page.locator('#al-last').textContent(), 'You moved from c3 to d4.');
    assert.equal(await page.locator('#al-note').textContent(), describeLevel('easy'));
    await game.waitForBoardState('ready');
    assert.match(await page.locator('#al-last').textContent(), /^The Spirit moved from [a-h][1-8] to [a-h][1-8]\.$/);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('difficulty descriptions match how the Spirit plays, in Classic and in Fog', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.openShellsFeathers();
    for (const [name, level] of [['Gentle', 'easy'], ['Balanced', 'medium'], ['Wise', 'hard']]) {
      await game.chooseOptions({ difficulty: name });
      assert.equal(await page.locator('#sf-difficulty-hint').textContent(), LEVEL_WORDS[level]);
    }
    await game.goTo('#/acorns-leaves', 'al-setup-screen');
    for (const [variant, describe] of [['Classic', describeLevel], ['Fog of War', describeFogLevel]]) {
      await game.chooseCheckersOptions({ variant });
      for (const [name, level] of [['Gentle', 'easy'], ['Balanced', 'medium'], ['Wise', 'hard']]) {
        await game.chooseCheckersOptions({ difficulty: name });
        assert.equal(await page.locator('#al-difficulty-hint').textContent(), describe(level), `${variant} ${name}`);
      }
    }
    assert.match(describeLevel('hard'), /up to 12 moves ahead \(as far as 12,000 positions or 40 ms allow\)/);
    assert.match(describeFogLevel('medium'), /imagines 4 ways/);
  });
});
