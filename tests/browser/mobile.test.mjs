// Phone play in the real page, both games: the board gets the room on small
// and large phones in portrait and landscape; short screens scroll instead
// of clipping; browser toolbars and rotation mid-match keep the game; the
// match menu pauses it; tap-to-pick and tap-to-move with rapid, double,
// cancelled and two-finger taps; hit areas that never reach a neighbour; and
// Fog of War kept private through rotation, the menu and the handoff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devices } from 'playwright';
import { startHarness, openGame } from '../helpers/game-page.mjs';
import { createInitialState, rowsFromBoard, squareAt } from '../../src/games/acorns-leaves/engine.js';
import { DELAYS as SF_DELAYS } from '../../src/games/shells-feathers/session.js';
import { TAPS } from '../../src/shared/board-taps.js';

const sq = (row, col) => squareAt(row, col);
const START = rowsFromBoard(createInitialState().board);
const phone = (width, height) => ({ ...devices['iPhone SE'], viewport: { width, height } });

// Raw touch input (CDP), so taps can come as fast as a finger's.
async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const centre = async (locator) => {
    const box = await locator.boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  return {
    async tap(locator) {
      const point = await centre(locator);
      await send('touchStart', [point]);
      await send('touchEnd', []);
    },
    // Several taps with no pause between them.
    async rapid(...locators) {
      const points = [];
      for (const locator of locators) points.push(await centre(locator));
      for (const point of points) {
        await send('touchStart', [point]);
        await send('touchEnd', []);
      }
    },
    async slide(locator, dx, dy) {
      const { x, y } = await centre(locator);
      await send('touchStart', [{ x, y }]);
      for (let i = 1; i <= 4; i++) await send('touchMove', [{ x: x + (dx * i) / 4, y: y + (dy * i) / 4 }]);
      await send('touchEnd', []);
    },
    async twoFingers(a, b) {
      const [pa, pb] = [await centre(a), await centre(b)];
      await send('touchStart', [{ ...pa, id: 0 }, { ...pb, id: 1 }]);
      await send('touchEnd', []);
    },
    async drag(x, fromY, toY) {
      await send('touchStart', [{ x, y: fromY }]);
      const step = fromY > toY ? -20 : 20;
      for (let y = fromY + step; step < 0 ? y >= toY : y <= toY; y += step) await send('touchMove', [{ x, y }]);
      await send('touchEnd', []);
    },
  };
}

// Where the parts of the active match screen are, at the current scroll.
const layout = (page) => page.evaluate(() => {
  const screen = document.querySelector('.screen.active');
  const box = (selector) => {
    const el = screen.querySelector(selector);
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
    square: box('.cell, #al-board button'),
    menu: box('.menu-btn'),
    chips: box('.side-chips'),
    turn: box('.turn-indicator'),
    hint: box('.al-hint'),
  };
});
const inView = (r, { width, height }) => r && r.left >= -0.5 && r.top >= -0.5 && r.right <= width + 0.5 && r.bottom <= height + 0.5;

test('phone play', { timeout: 600_000 }, async (t) => {
  const harness = await startHarness(t);

  const SIZES = [
    ['small phone', 320, 568], ['small Android, toolbars shown', 360, 560], ['iPhone, Safari toolbars shown', 390, 664],
    ['iPhone', 390, 844], ['large phone, toolbars shown', 430, 740],
    ['small phone landscape', 568, 320], ['Android landscape', 640, 360], ['iPhone landscape, toolbars shown', 844, 340], ['large phone landscape', 932, 430],
  ];
  await t.test('the board gets the room; turn, sides and Menu stay on screen; nothing scrolls sideways', async () => {
    for (const [label, width, height] of SIZES) {
      const game = await openGame(harness, { device: phone(width, height) });
      for (const hash of ['#/shells-feathers/play/two', '#/acorns-leaves/play/two']) {
        await game.goTo(hash, hash.includes('acorns') ? 'al-game-screen' : 'game-screen');
        await game.settle();
        const l = await layout(game.page);
        const where = `${label} (${width}×${height}) ${hash}`;
        assert.ok(l.scrollWidth <= width, `${where}: no sideways scroll`);
        assert.ok(l.scrollHeight <= height + 1, `${where}: the match fits (${l.scrollHeight}px of ${height}px)`);
        for (const part of ['board', 'menu', 'chips', 'turn']) assert.ok(inView(l[part], l), `${where}: ${part} on screen`);
        if (l.hint) assert.ok(inView(l.hint, l), `${where}: guidance on screen`);
        if (height > width) {
          assert.ok(l.board.width >= 0.85 * width, `${where}: the board takes ${Math.round(l.board.width)}px of ${width}px`);
        } else {
          assert.ok(l.board.height >= 0.85 * height, `${where}: the board takes ${Math.round(l.board.height)}px of ${height}px`);
          assert.ok(l.board.right <= l.chips.left, `${where}: the header sits beside the board`);
        }
        assert.ok(l.square.width >= (hash.includes('acorns') ? 36 : 60), `${where}: squares are ${Math.round(l.square.width)}px`);
      }
      assert.deepEqual(game.pageErrors, []);
      await game.page.context().close();
    }
  });

  await t.test('a very short screen scrolls instead of clipping, and a drag on the board scrolls the page', async () => {
    const game = await openGame(harness, { device: phone(320, 460) });
    const { page } = game;
    await game.goTo('#/acorns-leaves/play/two', 'al-game-screen');
    await game.settle();
    let l = await layout(page);
    assert.ok(l.scrollHeight > l.height, 'the page is taller than the screen');
    assert.ok(l.menu.top >= 0 && l.turn.top >= 0, 'the top of the match is on screen, not cut off');
    assert.ok(l.square.width >= 36, `squares stay ${Math.round(l.square.width)}px`);
    const fingers = await touch(page);
    await fingers.drag(160, 400, 200);
    await game.wait(400);
    assert.ok(await page.evaluate(() => scrollY) > 0, 'the drag scrolled the page');
    assert.deepEqual(await game.checkersRows(), START, 'and moved nothing');
    assert.deepEqual((await game.checkersView()).selected, []);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    l = await layout(page);
    assert.ok(inView(l.hint, l) && inView(l.board, l), 'scrolled down, the board and guidance are whole');
    // The game plays at the scrolled position.
    await game.playPath([sq(5, 2), sq(4, 3)]);
    assert.equal((await game.checkersView()).toMove, 'leaf');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('toolbars showing and hiding, and turning the phone mid-match, keep the game and its selection', async () => {
    const game = await openGame(harness, { device: phone(390, 664) });
    const { page } = game;
    await game.goTo('#/acorns-leaves/play/two', 'al-game-screen');
    await game.playPath([sq(5, 2), sq(4, 3)]);
    await game.tapSquare(sq(2, 1)); // pick up a leaf
    const before = { rows: await game.checkersRows(), view: await game.checkersView() };
    assert.deepEqual(before.view.selected, [sq(2, 1)]);
    const small = (await layout(page)).board.width;

    const check = async (width, height, what) => {
      await page.setViewportSize({ width, height });
      await game.wait(150);
      await game.settle();
      const l = await layout(page);
      assert.deepEqual(await game.checkersRows(), before.rows, `${what}: same board`);
      assert.deepEqual((await game.checkersView()).selected, before.view.selected, `${what}: the piece is still picked up`);
      assert.ok(l.scrollHeight <= height + 1 && l.scrollWidth <= width, `${what}: fits`);
      for (const part of ['board', 'menu', 'turn', 'hint']) assert.ok(inView(l[part], l), `${what}: ${part} on screen`);
      return l;
    };
    const tall = await check(390, 844, 'toolbars hidden (taller viewport)');
    assert.ok(tall.board.width >= small, 'the board keeps its size or grows');
    const land = await check(844, 390, 'turned to landscape');
    assert.ok(land.board.right <= land.chips.left, 'landscape: header beside the board');

    // The menu across a turn: open in landscape, turn back, still open and whole.
    await game.press('Menu', { exact: true });
    await page.setViewportSize({ width: 390, height: 664 });
    await game.wait(150);
    const menu = await page.evaluate(() => {
      const r = document.querySelector('#al-menu .modal-content').getBoundingClientRect();
      return { open: document.getElementById('al-menu').classList.contains('active'), top: r.top, bottom: r.bottom };
    });
    assert.equal(menu.open, true);
    assert.ok(menu.top >= 0 && menu.bottom <= 664, 'the menu fits after turning');
    await game.press('Resume');
    await check(390, 664, 'back to portrait');
    // The picked-up piece still moves.
    await game.tapSquare(sq(3, 0));
    assert.equal((await game.checkersView()).toMove, 'acorn');

    // Shells & Feathers: pieces survive the turn too.
    await game.goTo('#/shells-feathers/play/two', 'game-screen');
    for (const i of [4, 0]) await game.tap(i);
    await page.setViewportSize({ width: 664, height: 390 });
    await game.wait(150);
    assert.deepEqual(await game.cells(), ['🪶', '', '', '', '🐚', '', '', '', '']);
    const l = await layout(page);
    assert.ok(l.scrollHeight <= 391 && inView(l.board, l) && inView(l.turn, l));
    await game.tap(8);
    assert.equal((await game.cells())[8], '🐚');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('the menu pauses the match: the Spirit waits, then moves once it closes', async () => {
    const game = await openGame(harness, { viewport: { width: 390, height: 844 } });
    const { page } = game;
    await game.newMatch('single');
    await game.tap(4);
    await game.press('Menu', { exact: true });
    const open = await page.evaluate(() => ({
      inert: document.getElementById('game-screen').inert,
      expanded: document.getElementById('sf-menu-button').getAttribute('aria-expanded'),
      focus: document.activeElement.textContent.trim(),
      info: document.getElementById('sf-menu-info').textContent,
      note: !document.getElementById('sf-menu-note').hidden,
    }));
    assert.deepEqual(open, {
      inert: true, expanded: 'true', focus: 'Resume', info: 'Against the Spirit · Gentle · You play Shell', note: true,
    });
    await game.wait(SF_DELAYS.spiritMove * 2);
    assert.equal((await game.cells()).filter(Boolean).length, 1, 'the Spirit does not move behind the menu');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'sf-menu-button', 'Escape closes it; focus returns to Menu');
    await game.waitForPieces(2);

    // A tap on the dimmed backdrop closes it too.
    await game.press('Menu', { exact: true });
    await game.settle();
    await page.mouse.click(5, 5);
    assert.equal(await page.locator('#sf-menu').evaluate((el) => el.classList.contains('active')), false);

    // Acorns & Leaves against the Spirit: same.
    await game.goTo('#/acorns-leaves/play/single', 'al-game-screen');
    await game.playPath([sq(5, 2), sq(4, 3)]);
    await game.press('Menu', { exact: true });
    await game.wait(2500);
    assert.equal((await game.checkersView()).state, 'waiting', 'still the Spirit to move');
    const rowsWhilePaused = await game.checkersRows();
    await game.press('Resume');
    await game.waitForBoardState('ready');
    assert.notDeepEqual(await game.checkersRows(), rowsWhilePaused, 'the Spirit moved after Resume');

    // Browser Back with the menu open leaves the match and closes the menu.
    await game.press('Menu', { exact: true });
    await page.goBack();
    await game.page.waitForFunction(() => document.querySelector('.screen.active')?.id !== 'al-game-screen');
    assert.equal(await page.locator('.match-menu.active').count(), 0);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('after the game: Play Again under the board, and the menu no longer says the game is unrecorded', async () => {
    const game = await openGame(harness, { viewport: { width: 390, height: 844 } });
    await game.newMatch('two');
    assert.equal(await game.page.locator('#game-screen .game-controls').isHidden(), true, 'no Play Again during play');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.waitForResult();
    await game.press('View Board');
    assert.equal(await game.page.evaluate(() => document.activeElement.textContent.trim()), 'Play Again');
    await game.press('Menu', { exact: true });
    assert.equal(await game.page.locator('#sf-menu-note').isHidden(), true);
    await game.press('Resume');
    await game.press('Play Again');
    await game.waitForTurn("Player 1's Turn");
    assert.deepEqual(await game.cells(), Array(9).fill(''));
    assert.equal(await game.page.locator('#game-screen .game-controls').isHidden(), true);
  });

  await t.test('taps: rapid second taps after a move, finger bounces, slides and two fingers are not moves', async () => {
    const game = await openGame(harness, { device: devices['iPhone SE'] });
    const { page } = game;
    const fingers = await touch(page);
    const cell = (i) => page.locator(`.cell[data-index="${i}"]`);

    // Shells & Feathers, two players: a stray second tap right after a move
    // would place the other player's piece.
    await game.newMatch('two');
    await fingers.rapid(cell(0), cell(1));
    await game.wait(50);
    assert.deepEqual(await game.cells(), ['🐚', '', '', '', '', '', '', '', ''], 'only the first tap counts');
    await game.waitForSettled('board-overlay');
    await fingers.tap(cell(1));
    await game.waitForPieces(2);
    assert.equal((await game.cells())[1], '🪶', 'once the board settles, the next player taps as usual');

    // Acorns & Leaves.
    await game.goTo('#/acorns-leaves/play/two', 'al-game-screen');
    const c3 = game.square(sq(5, 2));
    // A bounce (two taps on the same piece) leaves it picked up.
    await fingers.rapid(c3, c3);
    await game.wait(50);
    assert.deepEqual((await game.checkersView()).selected, [sq(5, 2)], 'a double tap does not put it straight back');
    // A deliberate second tap puts it back.
    await game.wait(TAPS.doubleTap + 50);
    await fingers.tap(c3);
    assert.deepEqual((await game.checkersView()).selected, [], 'tap again to put it back');
    assert.equal(await game.checkersStatus(), 'Piece put back.');
    // Another of your pieces takes over the pick.
    await fingers.tap(c3);
    await fingers.tap(game.square(sq(5, 4)));
    assert.deepEqual((await game.checkersView()).selected, [sq(5, 4)]);
    // A slide (a scroll that started on the board) is not a pick.
    await fingers.slide(game.square(sq(5, 0)), 0, -60);
    await game.wait(100);
    assert.deepEqual((await game.checkersView()).selected, [sq(5, 4)]);
    // Neither are two fingers (a pinch).
    await fingers.twoFingers(game.square(sq(5, 0)), game.square(sq(4, 3)));
    await game.wait(100);
    assert.deepEqual((await game.checkersView()).selected, [sq(5, 4)]);
    assert.deepEqual(await game.checkersRows(), START);
    // Moving, then an instant tap on a Leaves piece: only the move counts.
    await fingers.rapid(game.square(sq(4, 3)), game.square(sq(2, 1)));
    await game.wait(50);
    const after = await game.checkersView();
    assert.equal(after.toMove, 'leaf');
    assert.deepEqual(after.selected, [], 'the stray tap picked nothing up');
    await game.waitForSettled('al-board');
    await fingers.tap(game.square(sq(2, 1)));
    assert.deepEqual((await game.checkersView()).selected, [sq(2, 1)]);

    // A mouse press dragged to another square and released there is not a move.
    await page.mouse.move(0, 0);
    const from = await game.square(sq(2, 1)).boundingBox();
    const to = await game.square(sq(3, 0)).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
    await page.mouse.up();
    assert.equal((await game.checkersView()).toMove, 'leaf', 'no move from a drag');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('the keyboard is never slowed: Enter right after a move is taken', async () => {
    const game = await openGame(harness, { viewport: { width: 390, height: 844 } });
    await game.newMatch('two');
    await game.page.locator('.cell[data-index="0"]').focus();
    for (const key of ['Enter', 'ArrowRight', 'Enter', 'ArrowRight', 'Space']) await game.page.keyboard.press(key);
    assert.deepEqual(await game.cells(), ['🐚', '🪶', '🐚', '', '', '', '', '', '']);
  });

  await t.test('hit areas: each square answers only inside its own edges, marks included', async () => {
    const game = await openGame(harness, { device: devices['iPhone SE'] });
    const { page } = game;
    const strays = (selector) => page.evaluate((sel) => {
      const problems = [];
      for (const el of document.querySelectorAll(sel)) {
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        // Just inside each edge (the rounded corners are, rightly, not the
        // square's), and the middle.
        const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
        for (const [x, y] of [[r.left + 1, cy], [r.right - 1, cy], [cx, r.top + 1], [cx, r.bottom - 1], [cx, cy]]) {
          const hit = document.elementFromPoint(x, y)?.closest(sel);
          if (hit !== el) problems.push(`${el.dataset.square ?? el.dataset.index} at ${Math.round(x)},${Math.round(y)} hits ${hit?.dataset.square ?? hit?.dataset.index ?? 'nothing'}`);
        }
        // Nothing inside a square that takes taps reaches past its edges.
        for (const child of el.querySelectorAll('*')) {
          if (getComputedStyle(child).pointerEvents === 'none') continue;
          const c = child.getBoundingClientRect();
          if (c.width && (c.left < r.left - 0.5 || c.right > r.right + 0.5 || c.top < r.top - 0.5 || c.bottom > r.bottom + 0.5)) problems.push(`${child.className.baseVal ?? child.className} sticks out`);
        }
      }
      return problems;
    }, selector);

    await game.goTo('#/shells-feathers/play/two', 'game-screen');
    for (const i of [4, 0]) await game.tap(i);
    await game.settle();
    assert.deepEqual(await strays('.cell'), []);
    // The gaps between squares belong to no square.
    const gap = await page.evaluate(() => {
      const a = document.querySelector('.cell[data-index="0"]').getBoundingClientRect();
      const b = document.querySelector('.cell[data-index="1"]').getBoundingClientRect();
      return document.elementFromPoint((a.right + b.left) / 2, a.top + a.height / 2)?.closest('.cell') ?? null;
    });
    assert.equal(gap, null);

    await game.goTo('#/acorns-leaves/play/two', 'al-game-screen');
    await game.playPath([sq(5, 2), sq(4, 3)]);
    await game.playPath([sq(2, 5), sq(3, 4)]); // the Acorns must now capture: rings
    await game.tapSquare(sq(4, 3)); // picked up, with its landing ring
    assert.ok((await game.checkersView()).destinations.length > 0);
    assert.deepEqual(await strays('#al-board button[data-square]'), []);
  });

  await t.test('Fog of War on a phone: turning it and the menu reveal nothing; the handoff still covers the board', async () => {
    const game = await openGame(harness, { device: devices['iPhone SE'] });
    const { page } = game;
    const hidden = () => page.evaluate(() => [...document.querySelectorAll('#al-board button.is-fog')].map((el) => ({
      piece: el.dataset.piece ?? null, drawn: el.querySelector('.al-piece') !== null, label: el.getAttribute('aria-label'),
    })));
    await game.goTo('#/acorns-leaves/fog/two', 'al-game-screen');
    // The handoff: turning the phone keeps the board covered, and the board holds no pieces.
    for (const [width, height] of [[568, 320], [320, 568]]) {
      await page.setViewportSize({ width, height });
      await game.wait(150);
      const cover = await page.evaluate(() => {
        const r = document.getElementById('al-handoff').getBoundingClientRect();
        return { covers: r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight, pieces: document.querySelectorAll('#al-board [data-piece]').length, inert: document.getElementById('al-game-screen').inert };
      });
      assert.deepEqual(cover, { covers: true, pieces: 0, inert: true }, `${width}×${height}`);
    }
    await game.press("Show the Acorns' board");
    const fogged = await hidden();
    assert.ok(fogged.length > 0);
    assert.ok(fogged.every((s) => !s.piece && !s.drawn && /: hidden$/.test(s.label)), 'fogged squares hold and name nothing');
    // The menu shows only the match line; the board under it is unchanged.
    await game.press('Menu', { exact: true });
    assert.equal(await page.locator('#al-menu-info').textContent(), 'Fog of War · Two players');
    await page.setViewportSize({ width: 568, height: 320 });
    await game.wait(150);
    await game.press('Resume');
    assert.deepEqual(await hidden(), fogged, 'rotation and the menu leave the fog as it was');
    // Restart from the menu: the handoff again, before any piece is drawn.
    await game.fromMenu('Restart');
    await page.locator('#al-handoff:not([hidden])').waitFor();
    assert.equal(await page.locator('#al-board [data-piece]').count(), 0);
    assert.deepEqual(game.pageErrors, []);
  });
});
