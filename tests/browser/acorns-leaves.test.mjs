// Acorns & Leaves in the real page: the board and pieces, picking moves,
// mandatory captures, a chain of jumps step by step, whole games in both
// modes checked move by move against the rules engine, the Spirit's turn
// (stray input ignored, every move legal, cancelled on Restart and on
// leaving), keyboard play, the turned board, records, and phone and desktop
// layouts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devices } from 'playwright';
import { startHarness, openGame } from '../helpers/game-page.mjs';
import {
  createInitialState, legalMoves, applyMove, rowsFromBoard, analyze, squareAt,
} from '../../src/games/acorns-leaves/engine.js';
import { chooseMove } from '../../src/games/acorns-leaves/ai.js';
import { DELAYS } from '../../src/games/acorns-leaves/session.js';

const sq = (row, col) => squareAt(row, col);
const START = rowsFromBoard(createInitialState().board);
const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
// Six quiet moves (e3-f4, b6-a5, d2-e3, c7-b6, e1-d2, a5-b4) after which the
// Acorns must capture: c3 can jump twice (c3-a5-c7), a3 once (a3-c5).
const TO_DOUBLE_JUMP = [[44, 37], [17, 24], [51, 44], [10, 17], [60, 51], [24, 33]];
const DOUBLE_JUMP = [sq(5, 2), sq(3, 0), sq(1, 2)];

// The Acorns & Leaves records as saved.
const records = (game) => game.page.evaluate(() => JSON.parse(localStorage.getItem('spiritOfTheWoods:v2')).acornsLeaves.stats);

// The legal move from `state` that leads to the board now drawn, or null.
async function moveShown(game, state) {
  const rows = await game.checkersRows();
  return legalMoves(state).find((m) => String(rowsFromBoard(applyMove(state, m).board)) === String(rows)) ?? null;
}

test('Acorns & Leaves', { timeout: 600_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('hub to a two-player game: the board, the pieces, picking a piece and moving it', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.newCheckersMatch('two');
    assert.equal(await page.title(), 'Acorns & Leaves: Two Players · Spirit of the Woods');
    assert.deepEqual(await game.checkersRows(), START, 'the engine\'s starting position, as drawn');
    assert.equal(await page.locator('#al-board button').count(), 32, 'the 32 dark squares are buttons');
    assert.equal(await page.locator('#al-board span.al-square[aria-hidden="true"]').count(), 32);

    // Each side has its own drawing (shape and rim, not just color).
    const symbols = await page.evaluate(() => [...new Set([...document.querySelectorAll('#al-board use')].map((u) => u.getAttribute('href')))].sort());
    assert.deepEqual(symbols, ['#al-acorn', '#al-leaf']);
    const art = await page.evaluate(() => ['al-acorn', 'al-leaf', 'al-acorn-king', 'al-leaf-king'].map((id) => {
      const symbol = document.getElementById(id);
      return { id, uses: [...symbol.querySelectorAll('use')].map((u) => u.getAttribute('href')), rim: symbol.querySelector('circle').getAttribute('fill') };
    }));
    assert.deepEqual(art.map((a) => a.uses), [['#al-acorn-emblem'], ['#al-leaf-emblem'], ['#al-acorn-emblem', '#al-crown'], ['#al-leaf-emblem', '#al-crown']]);
    assert.notEqual(art[0].rim, art[1].rim, 'a dark rim for acorns, a cream rim for leaves');

    let view = await game.checkersView();
    assert.deepEqual([view.state, view.turn, view.toMove, view.hint], ['ready', "Acorns' Turn", 'acorn', 'Choose a piece to move.']);
    assert.equal(await game.label(sq(5, 2)), 'c3: acorn, can move');
    assert.equal(await game.label(sq(6, 1)), 'b2: acorn');
    assert.equal(await page.locator('#al-match-info').textContent(), 'Two players · Acorns move first');

    await game.tapSquare(sq(5, 2));
    view = await game.checkersView();
    assert.deepEqual(view.selected, [sq(5, 2)]);
    assert.deepEqual(view.destinations, [sq(4, 1), sq(4, 3)]);
    assert.equal(await game.label(sq(4, 3)), 'd4: empty, move here');
    assert.match(await game.checkersStatus(), /^Acorn on c3 picked up\. It can move to/);

    await game.tapSquare(sq(4, 3));
    view = await game.checkersView();
    assert.deepEqual(await game.checkersRows(), rowsFromBoard(applyMove(createInitialState(), [sq(5, 2), sq(4, 3)]).board));
    assert.deepEqual([view.turn, view.toMove, view.selected, view.destinations], ["Leaves' Turn", 'leaf', [], []]);
    assert.deepEqual(view.lastMove, [sq(4, 3), sq(5, 2)]);
    assert.equal(await game.checkersStatus(), "Acorns moved from c3 to d4. Leaves' turn.");
    assert.equal(await game.label(sq(4, 3)), 'd4: acorn, last move');

    // A leaf that can't move, then the other side's piece: nothing happens.
    await game.tapSquare(sq(0, 1));
    assert.equal((await game.checkersView()).hint, 'That piece has no move right now.');
    await game.tapSquare(sq(4, 3));
    assert.equal((await game.checkersView()).toMove, 'leaf');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('a capture sequence: compulsory capture, free choice, a double jump square by square, captured counts', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    await game.newCheckersMatch('two');
    let state = createInitialState();
    for (const path of TO_DOUBLE_JUMP) {
      await game.playPath(path);
      state = applyMove(state, path);
    }
    assert.deepEqual(await game.checkersRows(), rowsFromBoard(state.board));

    let view = await game.checkersView();
    assert.deepEqual(view.mustJump, [sq(5, 0), sq(5, 2)], 'both pieces that can capture are ringed');
    assert.equal(view.hint, 'You must capture: choose a ringed piece.');
    assert.equal(await game.checkersStatus(), "Leaves moved from a5 to b4. Acorns' turn. Acorns must capture.");
    assert.equal(await game.label(sq(5, 2)), 'c3: acorn, must capture');

    await game.tapSquare(sq(5, 6)); // g3 can't capture
    assert.equal((await game.checkersView()).hint, 'You must capture: choose a ringed piece instead.');
    await game.tapSquare(sq(5, 2));
    view = await game.checkersView();
    assert.deepEqual(view.destinations, [sq(3, 0)]);
    assert.equal(await game.label(sq(3, 0)), 'a5: empty, jump here, last move');
    assert.equal(await game.square(sq(3, 0)).evaluate((el) => el.classList.contains('is-jump-target')), true, 'a ring, not a dot');

    // First jump: the acorn stands on a5, the jumped leaf waits on b4.
    await game.tapSquare(sq(3, 0));
    view = await game.checkersView();
    assert.deepEqual(view.selected, [sq(3, 0)]);
    assert.deepEqual(view.jumped, [sq(4, 1)]);
    assert.deepEqual(view.trail, [sq(5, 2)]);
    assert.deepEqual(view.destinations, [sq(1, 2)]);
    assert.deepEqual([view.toMove, view.hint], ['acorn', 'Keep jumping: choose the next ring.']);
    assert.equal(await game.checkersStatus(), 'Jumped to a5. Keep jumping: c7.');
    assert.equal(await game.label(sq(4, 1)), 'b4: leaf, being captured, last move');
    assert.equal(await game.label(sq(5, 2)), 'c3: empty');
    const rows = await game.checkersRows();
    assert.equal(rows[3][0], 'a', 'drawn on its landing square');
    assert.equal(rows[4][1], 'l', 'the jumped leaf is still there');

    // Mid-chain nothing else can be picked, and Escape can't take the jump back.
    await game.tapSquare(sq(5, 0));
    assert.match((await game.checkersView()).hint, /^Keep jumping with the same piece/);
    await game.square(sq(3, 0)).focus();
    await game.page.keyboard.press('Escape');
    assert.deepEqual((await game.checkersView()).selected, [sq(3, 0)]);

    await game.tapSquare(sq(1, 2));
    state = applyMove(state, DOUBLE_JUMP);
    view = await game.checkersView();
    assert.deepEqual(await game.checkersRows(), rowsFromBoard(state.board));
    assert.deepEqual(view.captured, { acorn: 2, leaf: 0 });
    assert.deepEqual(view.wasCaptured, [sq(2, 1), sq(4, 1)], 'faint crosses where the leaves were taken');
    assert.deepEqual(view.lastMove, [sq(1, 2), sq(3, 0), sq(5, 2)]);
    assert.equal(await game.checkersStatus(), "Acorns jumped from c3 to a5 to c7, capturing 2 leaves. Leaves' turn. Leaves must capture.");

    // The Leaves must take back: d8 jumps c7.
    assert.deepEqual(view.mustJump, [sq(0, 3)]);
    await game.playPath([sq(0, 3), sq(2, 1)]);
    assert.deepEqual((await game.checkersView()).captured, { acorn: 2, leaf: 1 });
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('two players, a whole game: every move checked against the engine, then rematch and records', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    await game.newCheckersMatch('two');
    const rng = seeded(4);
    let state = createInitialState();
    for (let ply = 0; !analyze(state).result; ply++) {
      assert.ok(ply < 300, 'the game ends');
      // Acorns play well, Leaves loosely, so the game is short.
      const move = chooseMove(state, { difficulty: state.turn === 'acorn' ? 'medium' : 'easy', rng, maxNodes: 800, now: () => 0 });
      await game.playPath(move.path);
      state = applyMove(state, move);
      assert.deepEqual(await game.checkersRows(), rowsFromBoard(state.board), `after ply ${ply + 1}`);
    }
    const { result } = analyze(state);
    const titles = { acorn: 'Acorns Win!', leaf: 'Leaves Win!', null: 'Balance Achieved' };
    const shown = await game.waitForResult();
    assert.equal(shown.title, titles[result.winner]);
    assert.ok(shown.message.length > 0);
    // The result panel: the winner's piece (both for a draw) and the captured counts.
    const panel = await game.page.evaluate(() => ({
      emblem: [...document.querySelectorAll('#al-modal-emblem use')].map((u) => u.getAttribute('href')),
      summary: document.getElementById('al-modal-summary').textContent,
      describedBy: document.getElementById('al-modal').getAttribute('aria-describedby'),
    }));
    assert.deepEqual(panel.emblem, result.winner ? [`#al-${result.winner}`] : ['#al-acorn', '#al-leaf']);
    const captured = (await game.checkersView()).captured;
    assert.equal(panel.summary, `Captured · Acorns ${captured.acorn} · Leaves ${captured.leaf}`);
    assert.equal(panel.describedBy, 'al-modal-message al-modal-summary al-modal-achievements');
    assert.equal((await game.checkersView()).turn, shown.title, 'the turn line shows the result');
    assert.equal((await game.checkersView()).state, 'over');

    await game.press('View Board');
    assert.equal(await game.modalOpen(), false);
    // The board is locked: squares are aria-disabled, and a click does nothing.
    const finalRows = await game.checkersRows();
    for (const index of [sq(7, 0), sq(5, 2), sq(2, 1)]) {
      assert.equal(await game.square(index).getAttribute('aria-disabled'), 'true');
      await game.square(index).dispatchEvent('click');
    }
    assert.deepEqual(await game.checkersRows(), finalRows);
    assert.deepEqual((await game.checkersView()).selected, []);
    await game.press('Restart');
    assert.deepEqual(await game.checkersRows(), START);

    const expected = { acornWins: 0, leafWins: 0, draws: 0 };
    expected[{ acorn: 'acornWins', leaf: 'leafWins', null: 'draws' }[result.winner]] = 1;
    assert.deepEqual((await records(game)).twoPlayer, expected, 'recorded once');

    await game.goTo('#/your-path', 'path-screen');
    assert.equal(
      await game.page.locator('#al-two-player-record').textContent(),
      `Acorns wins: ${expected.acornWins} · Leaves wins: ${expected.leafWins} · Draws: ${expected.draws}`,
    );
    assert.equal(await game.page.locator('#sf-games').textContent(), '0', 'Shells & Feathers totals untouched');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('against the Spirit: it waits, ignores stray input, plays only legal moves, and the game is recorded once', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, fakeClock: true });
    const { page } = game;
    await game.newCheckersMatch('single', { side: 'Acorns', difficulty: 'Gentle' });
    assert.equal(await page.locator('#al-match-info').textContent(), 'Against the Spirit · Gentle · You: Acorns');
    assert.deepEqual(
      await page.locator('.al-side-text').evaluateAll((els) => els.map((el) => el.textContent)),
      ['You (Acorns)Captured 0', 'Spirit (Leaves)Captured 0'],
      'the side is spoken with the name; the piece beside it shows it',
    );
    assert.deepEqual((await game.checkersView()).turn, 'Your Turn');
    const rng = seeded(8);
    let state = createInitialState();
    let spiritMoves = 0;
    let checkedStray = false;
    for (let ply = 0; !analyze(state).result; ply++) {
      assert.ok(ply < 300, 'the game ends');
      const move = chooseMove(state, { difficulty: 'hard', rng, maxNodes: 1500, now: () => 0 });
      await game.playPath(move.path);
      state = applyMove(state, move);
      if (analyze(state).result) break;

      // The Spirit's turn: the board waits and refuses every pick.
      const waiting = await game.checkersView();
      assert.deepEqual([waiting.state, waiting.busy, waiting.turn, waiting.hint], ['waiting', 'true', "Spirit's Turn", 'The Spirit is thinking…']);
      if (!checkedStray) {
        checkedStray = true;
        assert.equal(await game.square(sq(5, 0)).getAttribute('aria-disabled'), 'true');
        const before = await game.checkersRows();
        for (const index of [sq(5, 0), sq(4, 1), sq(2, 1), sq(3, 0)]) await game.square(index).dispatchEvent('click');
        await page.keyboard.press('Escape');
        assert.deepEqual(await game.checkersRows(), before, 'nothing moved');
        assert.deepEqual((await game.checkersView()).selected, []);
      }
      await page.clock.runFor(DELAYS.spiritThink + DELAYS.spiritStep * 12);
      const played = await moveShown(game, state);
      assert.ok(played, `the Spirit's move after ply ${ply + 1} is one of the legal moves`);
      state = applyMove(state, played);
      spiritMoves++;
    }
    await page.clock.runFor(DELAYS.resultModal);
    const { result } = analyze(state);
    const shown = await game.waitForResult();
    assert.equal(shown.title, result.winner === 'acorn' ? 'Victory!' : result.winner === 'leaf' ? 'Wisdom Gained' : 'Balance Achieved');
    assert.ok(spiritMoves >= 5, `${spiritMoves} Spirit moves`);
    const single = (await records(game)).single;
    assert.equal(single.easy.wins + single.easy.losses + single.easy.draws, 1);

    // Rematch: a fresh board; nothing more is recorded.
    await game.press('Rematch');
    assert.equal(await game.modalOpen(), false);
    assert.deepEqual(await game.checkersRows(), START);
    await page.clock.runFor(5_000);
    assert.deepEqual((await records(game)).single, single);
    assert.deepEqual(game.pageErrors, []);
  });

  for (const [how, act, screen] of [
    ['Restart', (game) => game.press('Restart'), 'al-game-screen'],
    ['Change Mode', (game) => game.press('Change Mode'), 'al-setup-screen'],
    ['the browser Back button', (game) => game.page.goBack(), 'al-setup-screen'],
    ['going home', (game) => game.goTo('#/'), 'hub-screen'],
    ['switching to Shells & Feathers', (game) => game.goTo('#/shells-feathers/play/two'), 'game-screen'],
  ]) {
    await t.test(`${how} during the Spirit's turn cancels its move`, async () => {
      const game = await openGame(harness, { fakeClock: true });
      await game.newCheckersMatch('single', { side: 'Acorns' });
      await game.playPath([sq(5, 2), sq(4, 3)]);
      await game.waitForBoardState('waiting');
      await game.page.clock.runFor(DELAYS.spiritThink - 100);
      await act(game);
      await game.waitForScreen(screen);
      const left = { rows: await game.checkersRows(), said: await game.checkersStatus() };
      await game.page.clock.runFor(10_000);
      // Nothing moves on the board left behind, and nothing more is announced.
      assert.deepEqual({ rows: await game.checkersRows(), said: await game.checkersStatus() }, left, 'no Spirit move after leaving');
      if (screen === 'al-game-screen') {
        assert.deepEqual(await game.checkersRows(), START, 'no Spirit move on the new board');
        assert.equal((await game.checkersView()).state, 'ready');
      } else {
        await game.goTo('#/acorns-leaves/play/single', 'al-game-screen');
        assert.deepEqual(await game.checkersRows(), START, 'coming back starts a clean game');
      }
      const { single } = await records(game);
      assert.ok(Object.values(single).every((r) => r.wins + r.losses + r.draws === 0), 'nothing recorded');
      assert.equal(await game.modalOpen(), false);
      assert.deepEqual(game.pageErrors, []);
    });
  }

  await t.test('playing the Leaves: the board is turned round and the Spirit opens', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    await game.newCheckersMatch('single', { side: 'Leaves', difficulty: 'Balanced' });
    const { page } = game;
    assert.equal(await page.locator('#al-match-info').textContent(), 'Against the Spirit · Balanced · You: Leaves');
    const corners = await page.evaluate(() => {
      const squares = [...document.getElementById('al-board').children];
      const text = (el) => [...el.querySelectorAll('.al-rank, .al-file')].map((s) => s.textContent).join('');
      return { topLeft: squares[0].dataset.square ?? 'light', bottomLeft: squares[56].dataset.square, bottomLeftLabels: text(squares[56]) };
    });
    assert.deepEqual(corners, { topLeft: 'light', bottomLeft: String(sq(0, 7)), bottomLeftLabels: '8h' }, 'h8 sits bottom-left');
    const leafBox = await game.square(sq(2, 1)).boundingBox();
    const acornBox = await game.square(sq(5, 0)).boundingBox();
    assert.ok(leafBox.y > acornBox.y, 'the Leaves are drawn at the bottom');

    assert.equal((await game.checkersView()).turn, "Spirit's Turn");
    await game.waitForBoardState('ready');
    const opened = await moveShown(game, createInitialState());
    assert.ok(opened, 'the Spirit opened with a legal Acorn move');
    assert.equal((await game.checkersView()).turn, 'Your Turn');
    // Keyboard on the turned board: Up goes toward the Acorns (up the screen).
    await game.square(sq(2, 1)).focus();
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.square), String(sq(3, 0)));
  });

  await t.test('keyboard only: arrows between dark squares, Enter and Space to pick and move, Escape to put back', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.openAcornsLeaves();
    // Tab to "Two Players" and open it with Enter.
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement.textContent.includes('Two Players'))) break;
    }
    await page.keyboard.press('Enter');
    await game.waitForScreen('al-game-screen');
    const focused = () => page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return { square: el.dataset.square, label: el.getAttribute('aria-label'), outline: style.outlineStyle, z: style.zIndex };
    });
    let at = await focused();
    assert.equal(at.label, 'a3: acorn, can move', 'focus lands on the front-left piece');
    assert.equal(at.outline, 'solid');

    await page.keyboard.press('ArrowRight'); // c3
    await page.keyboard.press('Enter');
    assert.deepEqual((await game.checkersView()).selected, [sq(5, 2)]);
    await page.keyboard.press('Escape');
    assert.deepEqual((await game.checkersView()).selected, [], 'Escape puts it back');
    assert.equal(await game.checkersStatus(), 'Piece put back.');

    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp'); // d4
    at = await focused();
    assert.equal(at.label, 'd4: empty, move here');
    assert.equal(at.z, '3', 'the focus ring is drawn above the neighbouring squares');
    await page.keyboard.press('Enter');
    assert.deepEqual((await game.checkersView()).toMove, 'leaf');
    assert.equal(await game.checkersStatus(), "Acorns moved from c3 to d4. Leaves' turn.");

    // Leaves: from d4 up to c5, d6, then right to f6; pick it and move to e5.
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowRight']) await page.keyboard.press(key);
    assert.equal((await focused()).label, 'f6: leaf, can move');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown'); // e5
    assert.equal((await focused()).label, 'e5: empty, move here');
    await page.keyboard.press('Space');
    assert.equal((await game.checkersView()).toMove, 'acorn');
    assert.deepEqual((await game.checkersView()).mustJump, [sq(4, 3)], 'd4 must take e5');
    assert.deepEqual(game.pageErrors, []);
  });

  for (const [label, options] of [
    ['narrow phone (320×568, touch)', { device: devices['iPhone SE'] }],
    ['short Android phone (360×560, touch)', { device: { ...devices['Galaxy S5'], viewport: { width: 360, height: 560 } } }],
    ['phone (390×844)', { viewport: { width: 390, height: 844 } }],
    ['Android landscape (640×360, touch)', { device: devices['Galaxy S5 landscape'] }],
    ['landscape phone (750×340)', { viewport: { width: 750, height: 340 } }],
    ['desktop (1280×800)', { viewport: { width: 1280, height: 800 } }],
  ]) {
    await t.test(`${label}: the whole match fits, squares are big enough, and the capture line plays by ${options.device ? 'touch' : 'click'}`, async () => {
      const game = await openGame(harness, options);
      const { page } = game;
      await game.newCheckersMatch('two');
      await game.settle();
      const layout = await page.evaluate(() => {
        const board = document.getElementById('al-board').getBoundingClientRect();
        const square = document.querySelector('#al-board button').getBoundingClientRect();
        const controls = [...document.querySelectorAll('#al-game-screen .control-btn')].map((el) => el.getBoundingClientRect());
        return {
          page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight, innerWidth, innerHeight],
          board: [board.left, board.top, board.right, board.bottom],
          square: Math.min(square.width, square.height),
          controlsBottom: Math.max(...controls.map((r) => r.bottom)),
        };
      });
      const [scrollWidth, scrollHeight, width, height] = layout.page;
      assert.ok(scrollWidth <= width, `no sideways scroll (${scrollWidth}px of ${width}px)`);
      assert.ok(scrollHeight <= height + 1, `the whole match fits on screen (${scrollHeight}px of ${height}px)`);
      assert.ok(layout.board[0] >= 0 && layout.board[2] <= width && layout.board[3] <= height, 'the whole board is visible');
      assert.ok(layout.controlsBottom <= height + 1, 'Restart and Change Mode are on screen');
      assert.ok(layout.square >= 36, `squares are ${layout.square}px`);

      let state = createInitialState();
      for (const path of [...TO_DOUBLE_JUMP, DOUBLE_JUMP]) {
        await game.playPath(path);
        state = applyMove(state, path);
      }
      assert.deepEqual(await game.checkersRows(), rowsFromBoard(state.board));
      assert.deepEqual((await game.checkersView()).captured, { acorn: 2, leaf: 0 });
      // The longest guidance (two lines on a phone) still leaves the controls on screen.
      await game.tapSquare(sq(0, 1)); // b8 can't capture, but the Leaves must
      assert.equal((await game.checkersView()).hint, 'You must capture: choose a ringed piece instead.');
      assert.ok(await page.evaluate(() => document.documentElement.scrollHeight) <= height + 1);
      assert.deepEqual(game.pageErrors, []);
    });
  }

  await t.test('phone: a swipe across the board is not a move, and no touch gesture is blocked', async () => {
    const game = await openGame(harness, { device: devices['iPhone SE'] });
    const { page } = game;
    await game.newCheckersMatch('two');
    const cdp = await page.context().newCDPSession(page);
    const box = await page.locator('#al-board').boundingBox();
    const x = box.x + box.width / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: box.y + box.height - 20 }] });
    for (let y = box.y + box.height - 40; y > box.y + 20; y -= 20) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await game.wait(300);
    assert.deepEqual(await game.checkersRows(), START);
    assert.deepEqual((await game.checkersView()).selected, []);
    const gestures = await page.evaluate(() => {
      const event = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [] });
      document.querySelector('#al-board button').dispatchEvent(event);
      return { prevented: event.defaultPrevented, touchAction: getComputedStyle(document.getElementById('al-board')).touchAction };
    });
    assert.deepEqual(gestures, { prevented: false, touchAction: 'manipulation' });
  });

  await t.test('Your Path lists Acorns & Leaves records, and clearing them leaves Shells & Feathers alone', async () => {
    const save = {
      version: 2,
      settings: { sfx: false, music: false },
      shellsFeathers: { settings: { difficulty: 'easy', player1Symbol: 'shell' }, stats: { single: { easy: { wins: 2, losses: 0, draws: 0 } } } },
      acornsLeaves: {
        settings: { difficulty: 'hard', side: 'leaf' },
        stats: { single: { hard: { wins: 1, losses: 3, draws: 2 } }, twoPlayer: { acornWins: 4, leafWins: 5, draws: 1 } },
      },
    };
    const game = await openGame(harness, { storage: { 'spiritOfTheWoods:v2': JSON.stringify(save) } });
    const { page } = game;
    await game.goTo('#/your-path', 'path-screen');
    const rows = await page.locator('#al-spirit-records tr').evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent)));
    assert.deepEqual(rows, [['Gentle', '0', '0', '0'], ['Balanced', '0', '0', '0'], ['Wise', '1', '2', '3']]);
    assert.equal(await page.locator('#al-two-player-record').textContent(), 'Acorns wins: 4 · Leaves wins: 5 · Draws: 1');

    // The saved side and difficulty are selected on the setup screen.
    await game.goTo('#/acorns-leaves', 'al-setup-screen');
    assert.equal(await page.getByRole('radio', { name: 'Leaves', exact: true }).isChecked(), true);
    assert.equal(await page.getByRole('radio', { name: 'Wise', exact: true }).isChecked(), true);

    await game.goTo('#/your-path', 'path-screen');
    // Your games (Classic and Fog together) apart from two-player ones.
    assert.deepEqual(await page.locator('#al-path .stat-value').allTextContents(), ['1', '2', '3', '6']);
    // Achievements already earned by these records, from before achievements were kept.
    assert.equal(await page.locator('#al-achievement-count').textContent(), '(3 of 6)');
    // Clearing asks first, listing exactly what goes and what stays; Cancel keeps everything.
    await game.press('Clear Acorns & Leaves progress');
    const dialog = page.locator('#confirm-dialog');
    assert.equal(await page.locator('#confirm-title').textContent(), 'Clear Acorns & Leaves progress?');
    assert.deepEqual(await dialog.locator('#confirm-deletes li').allTextContents(), [
      'Classic results: 6 games against the Spirit, 10 two-player games.',
      'Fog of War results: 0 games against the Spirit, 0 two-player games.',
      'Acorns & Leaves achievements: 3 unlocked, which lock again.',
    ]);
    assert.deepEqual(await dialog.locator('#confirm-keeps li').allTextContents(), [
      'Your side, rules and Spirit difficulty for Acorns & Leaves.',
      'All Shells & Feathers records and achievements.',
      'Sound and motion settings.',
    ]);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'confirm-cancel', 'Cancel is focused first');
    await game.press('Cancel');
    assert.equal(await page.locator('#al-two-player-record').textContent(), 'Acorns wins: 4 · Leaves wins: 5 · Draws: 1', 'nothing deleted');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'reset-al-stats', 'focus back on the button');
    await game.press('Clear Acorns & Leaves progress');
    await page.keyboard.press('Escape');
    assert.equal(await game.modalOpen(), false);
    assert.equal(await page.locator('#al-achievement-count').textContent(), '(3 of 6)', 'Escape keeps everything too');

    await game.press('Clear Acorns & Leaves progress');
    await game.press('Clear Acorns & Leaves progress');
    assert.equal(await page.locator('#al-two-player-record').textContent(), 'Acorns wins: 0 · Leaves wins: 0 · Draws: 0');
    assert.equal(await page.locator('#al-achievement-count').textContent(), '(0 of 6)');
    assert.equal(await page.locator('#sf-games').textContent(), '2', 'Shells & Feathers records kept');
    const stored = JSON.parse(await game.storageItem('spiritOfTheWoods:v2'));
    assert.deepEqual(stored.acornsLeaves.stats.twoPlayer, { acornWins: 0, leafWins: 0, draws: 0 });
    assert.equal(stored.shellsFeathers.stats.single.easy.wins, 2);
  });
});
