// Shells & Feathers inside the hub: every match flow (first move, the
// Spirit's turn, win, draw, rematch, leaving mid-turn, switching games),
// scoring each round once, the board's accessible states and announcements,
// keyboard play, and gestures on a phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devices } from 'playwright';
import { startHarness, openGame } from '../helpers/game-page.mjs';

const SPIRIT_DELAY = 800;

const status = (game) => game.page.locator('#sf-status').evaluate((el) => el.textContent.trim());
const boardState = (game) => game.page.evaluate(() => {
  const board = document.getElementById('board-overlay');
  const cells = [...board.querySelectorAll('.cell')];
  return {
    state: board.dataset.state,
    busy: board.getAttribute('aria-busy'),
    disabled: cells.map((c) => c.getAttribute('aria-disabled') === 'true'),
    labels: cells.map((c) => c.getAttribute('aria-label')),
  };
});
// A finger drag from (x, fromY) to (x, toY), as raw touch events.
async function touchDrag(cdp, x, fromY, toY) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: fromY }] });
  const step = fromY > toY ? -20 : 20;
  for (let y = fromY + step; step < 0 ? y >= toY : y <= toY; y += step) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const totalGames = (game) => game.page.evaluate(() => {
  const { single, twoPlayer } = JSON.parse(localStorage.getItem('spiritOfTheWoods:v2')).shellsFeathers.stats;
  return Object.values(single).reduce((n, r) => n + r.wins + r.losses + r.draws, 0)
    + twoPlayer.player1Wins + twoPlayer.player2Wins + twoPlayer.draws;
});

test('Shells & Feathers match flows', { timeout: 300_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('first move and the Spirit\'s turn: the board waits, taps are ignored, the move is announced', async () => {
    const game = await openGame(harness);
    await game.newMatch('single', { difficulty: 'Gentle' });
    assert.equal(await status(game), 'New round. Your turn.');
    assert.equal((await boardState(game)).state, 'ready');

    await game.tap(4);
    const waiting = await boardState(game);
    assert.equal(waiting.state, 'waiting');
    assert.equal(waiting.busy, 'true');
    assert.ok(waiting.disabled.every(Boolean), 'every square is unavailable while the Spirit thinks');
    assert.equal(await status(game), "You placed a shell on row 2, column 2. The Spirit's turn.");

    // A tap during the Spirit's turn does nothing.
    await game.page.locator('.cell[data-index="0"]').dispatchEvent('click');
    await game.waitForTurn('Your Turn');
    const board = await game.cells();
    assert.equal(board.filter((c) => c === '🐚').length, 1, 'the tap during the Spirit\'s turn placed nothing');
    assert.equal(board.filter((c) => c === '🪶').length, 1);
    assert.match(await status(game), /^The Spirit placed a feather on row \d, column \d\. Your turn\.$/);
    const ready = await boardState(game);
    assert.equal(ready.state, 'ready');
    assert.equal(ready.busy, 'false');
    assert.deepEqual(ready.disabled, board.map((c) => c !== ''), 'only occupied squares are unavailable');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('win and draw: the board locks, winning squares are named, the result is announced', async () => {
    const game = await openGame(harness);
    await game.newMatch('two');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    assert.equal(await status(game), 'Player 1 placed a shell on row 1, column 3. Player 1 Wins! Three shells in the top row.');
    const over = await boardState(game);
    assert.equal(over.state, 'over');
    assert.ok(over.disabled.every(Boolean), 'no square can be played after the end');
    assert.deepEqual(over.labels.slice(0, 3), [
      'Row 1, column 1: shell, winning line', 'Row 1, column 2: shell, winning line', 'Row 1, column 3: shell, winning line',
    ]);
    assert.equal(over.labels[5], 'Row 2, column 3: empty');
    // The winning squares are marked by more than color: a solid edge.
    assert.equal(await game.page.locator('.cell[data-index="0"]').evaluate((el) => getComputedStyle(el).borderTopWidth), '3px');
    await game.waitForResult();

    await game.press('Play Again');
    assert.equal(await status(game), "New round. Player 1's turn.");
    for (const i of [0, 1, 2, 4, 3, 5, 7, 6, 8]) await game.tap(i);
    assert.equal(
      await status(game),
      'Player 1 placed a shell on row 3, column 3. Balance Achieved: a draw. The board is full with no three in a row.',
    );
    assert.equal((await game.waitForResult()).title, 'Balance Achieved');
    assert.deepEqual(await game.scores(), ['1', '0'], 'a draw adds to neither side');
  });

  await t.test('a round scores once: repeated taps and keys on the last square, View Board, Play Again, Back/Forward, reload', async () => {
    const game = await openGame(harness);
    const { page } = game;
    await game.newMatch('two');
    for (const i of [0, 3, 1, 4]) await game.tap(i);
    // The winning square, pressed four times in a row (two clicks in one task, then Enter repeats).
    await page.evaluate(() => {
      const cell = document.querySelector('.cell[data-index="2"]');
      cell.click();
      cell.click();
    });
    await page.locator('.cell[data-index="2"]').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
    await game.waitForResult();
    await game.press('View Board');
    for (const i of [5, 6, 7, 8]) await page.locator(`.cell[data-index="${i}"]`).dispatchEvent('click');
    await game.fromMenu('Restart');
    await page.goBack();
    await game.waitForScreen('sf-setup-screen');
    await page.goForward();
    await game.waitForScreen('game-screen');
    await page.reload();
    await game.waitForScreen('game-screen');

    assert.equal(await totalGames(game), 1);
    assert.deepEqual(await game.pathRecords(), { wins: '0', draws: '0', losses: '0', games: '0', twoPlayer: 'Player 1 wins: 1 · Player 2 wins: 0 · Draws: 0', earlier: '' });
  });

  for (const [how, act, screen] of [
    ['Restart', (game) => game.fromMenu('Restart'), 'game-screen'],
    ['switching to Acorns & Leaves', (game) => game.goTo('#/acorns-leaves/play/two'), 'al-game-screen'],
    ['going home', (game) => game.goTo('#/'), 'hub-screen'],
  ]) {
    await t.test(`${how} during the Spirit's turn cancels its move and scores nothing`, async () => {
      const game = await openGame(harness);
      await game.newMatch('single', { difficulty: 'Wise' });
      await game.tap(0);
      await act(game);
      await game.waitForScreen(screen);
      await game.wait(SPIRIT_DELAY + 900);
      assert.equal(await totalGames(game), 0);
      if (screen === 'game-screen') {
        assert.deepEqual(await game.cells(), Array(9).fill(''), 'no Spirit move on the new board');
        assert.equal((await boardState(game)).state, 'ready');
      } else {
        // Coming back starts a clean round.
        await game.goHome();
        await game.newMatch('single');
        assert.deepEqual(await game.cells(), Array(9).fill(''));
      }
      assert.deepEqual(game.pageErrors, []);
    });
  }

  await t.test('keyboard: arrows, Home/End, Enter/Space; occupied squares refuse; focus is visible in every state', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.newMatch('two');
    await game.page.locator('.cell[data-index="0"]').focus();
    const focused = () => page.evaluate(() => {
      const el = document.activeElement;
      const s = getComputedStyle(el);
      return { index: el.dataset.index, outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, edge: s.borderTopColor };
    });
    const press = async (...keys) => { for (const key of keys) await page.keyboard.press(key); };

    await press('End');
    assert.equal((await focused()).index, '2');
    await press('Home', 'ArrowDown', 'ArrowDown', 'ArrowDown');
    assert.equal((await focused()).index, '6', 'stops at the edge');
    await press('ArrowUp', 'ArrowUp', 'Enter'); // P1 at 0
    await press('Space'); // occupied: refused
    assert.deepEqual(await game.cells(), ['🐚', '', '', '', '', '', '', '', '']);
    assert.match(await game.turnText(), /^Player 2's Turn/);
    await press('ArrowDown', 'Space', 'ArrowUp', 'ArrowRight', 'Enter', 'ArrowDown', 'Enter');
    const empty = await focused();
    await press('ArrowUp', 'ArrowRight', 'Enter'); // P1 completes the top row
    assert.equal((await game.waitForResult()).title, 'Player 1 Wins!');
    await press('Escape', 'Shift+Tab'); // from Restart back into the board (the winning square)
    const winner = await focused();
    await press('ArrowDown');
    const occupied = await focused();

    for (const [label, ring] of [['empty', empty], ['winning', winner], ['occupied', occupied]]) {
      assert.equal(ring.outline, 'solid 3px rgb(43, 27, 14)', `dark focus ring on a ${label} square`);
      assert.equal(ring.edge, 'rgb(255, 248, 220)', `cream inner edge on a ${label} square`);
    }
    assert.deepEqual([winner.index, occupied.index], ['2', '5']);
  });

  await t.test('phone: gestures are left to the browser except on the board, and touch targets are comfortable', async () => {
    const game = await openGame(harness, { device: devices['iPhone SE'] });
    const { page } = game;
    assert.doesNotMatch(await page.locator('meta[name="viewport"]').getAttribute('content'), /user-scalable=no|maximum-scale/);

    // A touch drag scrolls a screen that is taller than the phone.
    await game.openShellsFeathers();
    await game.settle();
    const cdp = await page.context().newCDPSession(page);
    await touchDrag(cdp, 160, 450, 150);
    await game.wait(300);
    assert.ok(await page.evaluate(() => scrollY) > 0, 'touch scrolling works on the setup screen');

    await game.startMatch('two');
    const gestures = await page.evaluate(() => {
      const prevented = (el) => {
        const event = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [] });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      };
      return {
        prevented: ['.game-header', '#game-board', '.cell', '.game-controls'].map((s) => prevented(document.querySelector(s))),
        overscroll: getComputedStyle(document.body).overscrollBehaviorY,
        boardTouchAction: getComputedStyle(document.getElementById('board-overlay')).touchAction,
        cellTouchAction: getComputedStyle(document.querySelector('.cell')).touchAction,
        cellSize: Math.round(document.querySelector('.cell').getBoundingClientRect().width),
      };
    });
    assert.deepEqual(gestures.prevented, [false, false, false, false], 'no touchmove is blocked anywhere');
    assert.equal(gestures.overscroll, 'auto', 'pull-to-refresh and overscroll are not disabled page-wide');
    assert.equal(gestures.boardTouchAction, 'manipulation', 'the board alone opts out of double-tap zoom');
    assert.equal(gestures.cellTouchAction, 'manipulation');
    assert.ok(gestures.cellSize >= 60, `squares are ${gestures.cellSize}px wide`);

    // A swipe across the board is not a move.
    const box = await page.locator('#board-overlay').boundingBox();
    await touchDrag(cdp, box.x + box.width / 2, box.y + box.height - 20, box.y + 20);
    await game.wait(300);
    assert.deepEqual(await game.cells(), Array(9).fill(''));

    // A touch game through to the result.
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    assert.equal((await game.waitForResult()).title, 'Player 1 Wins!');
    await game.press('Play Again');
    await game.waitForTurn("Player 1's Turn");
    assert.deepEqual(game.pageErrors, []);
  });
});
