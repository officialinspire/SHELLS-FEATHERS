// Fog of War in the real page (docs/fog-rules.md): the page shows each player
// exactly their view, from both sides, and nothing more: no hidden piece in
// the DOM, in accessible names, in marks or in announcements. Also the
// two-player handoff, blocked tries, the Spirit moving unseen, restarts,
// the fog lifting at the end, phone layout, and Classic left as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devices } from 'playwright';
import { startHarness, openGame } from '../helpers/game-page.mjs';
import { createInitialState, applyMove, analyze, rowsFromBoard, squareAt, isDarkSquare } from '../../src/games/acorns-leaves/engine.js';
import { FOG, observe, startFogTurn, chooseFog, observation, view as fogView } from '../../src/games/acorns-leaves/fog.js';
import { chooseFogStep } from '../../src/games/acorns-leaves/fog-ai.js';
import { DELAYS } from '../../src/games/acorns-leaves/session.js';

const sq = (row, col) => squareAt(row, col);
const DARK = Array.from({ length: 64 }, (_, s) => s).filter(isDarkSquare);
const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const key = (piece) => (piece ? `${piece.side}${piece.king ? '-king' : ''}` : null);

// Every dark square as the page has it: piece attribute, drawn piece, fog,
// found mark and accessible name.
const domSquares = (game) => game.page.evaluate(() => {
  const squares = {};
  for (const el of document.querySelectorAll('#al-board button[data-square]')) {
    squares[el.dataset.square] = {
      piece: el.dataset.piece ?? null,
      drawn: el.querySelector('use')?.getAttribute('href') ?? null,
      fog: el.classList.contains('is-fog'),
      found: el.classList.contains('is-found'),
      label: el.getAttribute('aria-label'),
      marks: ['is-selected', 'is-trail', 'is-jumped', 'is-last'].filter((c) => el.classList.contains(c)),
    };
  }
  return squares;
});

// The page shows exactly `seen` (a fog.js view): pieces where it has pieces,
// fog where it has fog, and nothing in fogged squares.
async function assertShows(game, seen, context) {
  const dom = await domSquares(game);
  for (const square of DARK) {
    const cell = seen[square];
    const at = dom[square];
    const where = `${context}, square ${square}`;
    if (cell === FOG) {
      assert.deepEqual([at.piece, at.drawn, at.fog], [null, null, true], `${where}: fogged`);
      assert.match(at.label, /^[a-h][1-8]: hidden/, where);
    } else {
      assert.equal(at.piece, key(cell), where);
      assert.equal(at.fog, false, where);
      assert.equal(at.drawn, cell ? `#al-${key(cell)}` : null, where);
    }
  }
}

// Checks needing no knowledge of the real board: fogged squares are empty
// and named "hidden", and every opponent piece shown is next to one of the
// viewer's pieces, is being jumped (V6), or was found by a blocked try (V7).
async function assertConsistent(game, viewer) {
  const dom = await domSquares(game);
  const own = DARK.filter((s) => dom[s].piece?.startsWith(viewer));
  const near = (a, b) => Math.abs(Math.floor(a / 8) - Math.floor(b / 8)) === 1 && Math.abs((a % 8) - (b % 8)) === 1;
  for (const square of DARK) {
    const at = dom[square];
    if (at.fog) {
      assert.deepEqual([at.piece, at.drawn], [null, null]);
      assert.match(at.label, /: hidden/);
      assert.ok(!own.some((o) => near(o, square)), 'fog never next to the viewer\'s pieces');
    } else if (at.piece && !at.piece.startsWith(viewer)) {
      assert.ok(at.found || at.marks.includes('is-jumped') || own.some((o) => near(o, square)), `opponent piece on ${square} is out of range`);
    }
  }
  const leavesDrawn = await game.page.locator(`#al-board use[href^="#al-${viewer === 'acorn' ? 'leaf' : 'acorn'}"]`).count();
  assert.equal(leavesDrawn, DARK.filter((s) => dom[s].piece && !dom[s].piece.startsWith(viewer)).length, 'no hidden piece drawn');
}

// The side panel's last move, rule note and hint.
const panelText = (game) => game.page.evaluate(() => ({
  last: document.getElementById('al-last').textContent,
  note: document.getElementById('al-note').textContent,
  hint: document.getElementById('al-hint').textContent,
}));

const records = (game) => game.page.evaluate(() => JSON.parse(localStorage.getItem('spiritOfTheWoods:v2')).acornsLeaves);

test('Acorns & Leaves: Fog of War', { timeout: 900_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('setup: Fog of War is chosen on its own, remembered, and leads to the Fog routes; Classic stays the default', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.openAcornsLeaves();
    const links = () => page.evaluate(() => ['al-play-single', 'al-play-two'].map((id) => document.getElementById(id).getAttribute('href')));
    assert.equal(await page.getByRole('radio', { name: 'Classic', exact: true }).isChecked(), true);
    assert.deepEqual(await links(), ['#/acorns-leaves/play/single', '#/acorns-leaves/play/two']);
    await game.chooseCheckersOptions({ variant: 'Fog of War' });
    assert.deepEqual(await links(), ['#/acorns-leaves/fog/single', '#/acorns-leaves/fog/two']);
    assert.match(await page.locator('#al-variant-hint').textContent(), /only the enemy pieces next to them/);
    assert.equal((await records(game)).settings.variant, 'fog');
    await page.reload();
    await game.waitForScreen('al-setup-screen');
    assert.equal(await page.getByRole('radio', { name: 'Fog of War', exact: true }).isChecked(), true);
    await game.startCheckers('single');
    assert.equal(await page.title(), 'Acorns & Leaves: Fog of War vs the Spirit · Spirit of the Woods');
    assert.equal(await page.locator('#al-match-info').textContent(), 'Fog of War · Gentle Spirit · You: Acorns');
    await assertShows(game, observe(createInitialState().board, 'acorn'), 'start');
    assert.equal(await page.locator('#al-board .is-fog').count(), 16);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('two players, a whole game: each side is shown exactly its own view, a handoff hides the board between turns, the fog lifts at the end', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.goTo('#/acorns-leaves/fog/two', 'al-game-screen');
    const rng = seeded(6);
    let state = createInitialState();
    const tally = { turns: 0, bumps: 0, handoffs: 0 };

    const checkHandoff = async (side) => {
      const name = side === 'acorn' ? 'Acorns' : 'Leaves';
      const handoff = page.locator('#al-handoff');
      assert.equal(await handoff.isVisible(), true);
      assert.equal(await page.locator('#al-handoff-title').textContent(), `${name}' turn`);
      const cover = await handoff.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { full: r.width >= innerWidth && r.height >= innerHeight, bg: getComputedStyle(el).backgroundImage !== 'none' };
      });
      assert.deepEqual(cover, { full: true, bg: true }, 'covers the whole screen, opaque');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'al-handoff-button');
      assert.equal(await page.locator('#al-game-screen').evaluate((el) => el.inert), true, 'nothing behind it can be reached');
      const dom = await domSquares(game);
      assert.ok(DARK.every((s) => dom[s].piece === null && dom[s].drawn === null && dom[s].fog), 'no piece of either side behind it');
      assert.ok(DARK.every((s) => /: hidden$/.test(dom[s].label)));
      assert.ok(DARK.every((s) => dom[s].marks.length === 0), 'no last-move marks either');
      // Nothing left in the page about the last move: the board's keyboard
      // stop is back on a3, and the announcement says only that a move was made.
      assert.deepEqual(await page.locator('#al-board [tabindex="0"]').evaluateAll((els) => els.map((el) => el.dataset.square)), [String(sq(5, 0))]);
      assert.match(await game.checkersStatus(), /^(New game|Move made)\. (Acorns|Leaves)' turn: pass the device\.$/);
      // The side panel says nothing about the board either.
      assert.deepEqual(await panelText(game), { last: 'None yet.', note: '', hint: '' });
      tally.handoffs++;
      await game.press(`Show the ${name}' board`);
      assert.equal(await handoff.isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.square), String(sq(5, 0)), 'focus starts on a3');
    };

    for (let ply = 0; !analyze(state).result; ply++) {
      assert.ok(ply < 400, 'the game ends');
      await checkHandoff(state.turn);
      let turn = startFogTurn(state);
      await assertShows(game, fogView(turn), `ply ${ply}, ${state.turn} to move`);
      let move = null;
      while (!move) {
        const step = chooseFogStep(observation(turn), { difficulty: 'medium', rng, maxNodes: 400, now: () => 0 });
        if (!turn.path.length) {
          await game.tapSquare(step.from);
          turn = chooseFog(turn, step.from).turn;
        }
        await game.tapSquare(step.to);
        const result = chooseFog(turn, step.to);
        if (result.outcome === 'bumped') {
          tally.bumps++;
          // A block that ends the move is followed at once by the handoff,
          // which says only "Move made".
          assert.match(await game.checkersStatus(), result.move ? /^Move made\./ : /^Blocked: a hidden (leaf|acorn)( king)? is on [a-h][1-8]\./);
          if (!result.move) {
            const dom = await domSquares(game);
            assert.equal(dom[result.found].found, true);
            assert.equal(dom[result.found].piece, key(state.board[result.found]), 'only the blocker is revealed');
            await assertShows(game, fogView(result.turn), `ply ${ply}, after a block`);
          }
        }
        move = result.move;
        turn = result.turn;
      }
      state = applyMove(state, move);
      tally.turns++;
    }

    // Game over: the fog lifts and the whole board is shown.
    await game.waitForResult();
    assert.deepEqual(await game.checkersRows(), rowsFromBoard(state.board));
    assert.equal(await page.locator('#al-board .is-fog').count(), 0);
    assert.match(await game.checkersStatus(), /The fog lifts\./);
    const stats = (await records(game)).stats;
    const fogTotal = stats.fog.twoPlayer.acornWins + stats.fog.twoPlayer.leafWins + stats.fog.twoPlayer.draws;
    assert.equal(fogTotal, 1, 'recorded once, as a Fog game');
    assert.deepEqual(stats.twoPlayer, { acornWins: 0, leafWins: 0, draws: 0 }, 'not as a Classic game');
    assert.equal(tally.handoffs, tally.turns);
    assert.ok(tally.bumps > 0, `${tally.bumps} blocked tries in ${tally.turns} moves`);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('against the Spirit: it moves unseen, and nothing hidden reaches the page, the names or the announcements', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, fakeClock: true });
    const { page } = game;
    await game.goTo('#/acorns-leaves/fog/single', 'al-game-screen');
    const rng = seeded(12);
    let checks = 0;
    for (let turns = 0; (await game.checkersView()).state !== 'over'; turns++) {
      assert.ok(turns < 400, 'the game ends');
      await assertConsistent(game, 'acorn');
      const view = await game.checkersView();
      if (view.state === 'waiting') {
        const dom = await domSquares(game);
        assert.ok(DARK.every((s) => !dom[s].marks.some((m) => m !== 'is-last')), 'no selection or route shown for the Spirit');
        await page.clock.runFor(DELAYS.spiritThink + DELAYS.spiritStep);
        const said = await game.checkersStatus();
        if ((await game.checkersView()).state !== 'over') {
          assert.match(said, /^The Spirit moved[,.]/);
          assert.doesNotMatch(said, /from [a-h][1-8]/, 'its route is never described');
          // The panel's last move is exactly what was said, and its rule
          // note names no square.
          const panel = await panelText(game);
          assert.ok(said.startsWith(panel.last), `"${panel.last}" is what was said`);
          assert.doesNotMatch(panel.note, /\b[a-h][1-8]\b/);
        }
        continue;
      }
      // The player: the first piece offered, then a random offered square.
      const offered = view.selected.length ? view.destinations : (view.mustJump.length ? view.mustJump : await page.evaluate(() => [...document.querySelectorAll('#al-board .can-move')].map((el) => Number(el.dataset.square))));
      await game.tapSquare(offered[Math.floor(rng() * offered.length)]);
      checks++;
    }
    await page.clock.runFor(DELAYS.resultModal);
    await game.waitForResult();
    assert.equal(await page.locator('#al-board .is-fog').count(), 0, 'the fog lifts');
    const stats = (await records(game)).stats;
    assert.equal(Object.values(stats.fog.single).reduce((n, r) => n + r.wins + r.losses + r.draws, 0), 1);
    assert.ok(checks > 20, `${checks} player picks checked`);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('a blocked try: the blocker is shown, named and announced, and only it', async () => {
    // Two players make random offered moves until a try is blocked.
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    await game.goTo('#/acorns-leaves/fog/two', 'al-game-screen');
    let state = createInitialState();
    const rng = seeded(31);
    let blocked = null;
    for (let ply = 0; !blocked && ply < 200 && !analyze(state).result; ply++) {
      await game.press(`Show the ${state.turn === 'acorn' ? 'Acorns' : 'Leaves'}' board`);
      let turn = startFogTurn(state);
      let move = null;
      while (!move) {
        const steps = observation(turn).steps;
        const step = steps[Math.floor(rng() * steps.length)];
        if (!turn.path.length) {
          await game.tapSquare(step.from);
          turn = chooseFog(turn, step.from).turn;
        }
        await game.tapSquare(step.to);
        const result = chooseFog(turn, step.to);
        if (result.outcome === 'bumped' && !result.move && !blocked) {
          blocked = { square: result.found, piece: state.board[result.found], before: fogView(turn), after: fogView(result.turn) };
          const dom = await domSquares(game);
          assert.match(dom[blocked.square].label, /: (leaf|acorn)( king)?, (selected, )?found blocking a jump/);
          assert.equal(dom[blocked.square].piece, key(blocked.piece));
          const changed = DARK.filter((s) => blocked.before[s] !== blocked.after[s]);
          assert.deepEqual(changed, [blocked.square], 'exactly one square was revealed');
          assert.match(await game.page.locator('#al-hint').textContent(), /^Blocked: a hidden/);
          assert.equal((await game.checkersView()).toMove, state.turn, 'the turn goes on');
        }
        move = result.move;
        turn = result.turn;
      }
      state = applyMove(state, move);
    }
    assert.ok(blocked, 'a blocked try happened');
  });

  await t.test('restarting during the Spirit\'s turn cancels it; switching to Classic shows the whole board again', async () => {
    const game = await openGame(harness, { fakeClock: true });
    await game.goTo('#/acorns-leaves/fog/single', 'al-game-screen');
    await game.playPath([sq(5, 2), sq(4, 3)]);
    await game.waitForBoardState('waiting');
    await game.fromMenu('Restart');
    await game.page.clock.runFor(10_000);
    await assertShows(game, observe(createInitialState().board, 'acorn'), 'after Restart');
    assert.equal((await game.checkersView()).state, 'ready');
    const stats = (await records(game)).stats;
    assert.ok(Object.values(stats.fog.single).every((r) => r.wins + r.losses + r.draws === 0));

    await game.goTo('#/acorns-leaves/play/single', 'al-game-screen');
    assert.equal(await game.page.locator('#al-board .is-fog').count(), 0, 'Classic: no fog');
    assert.deepEqual(await game.checkersRows(), rowsFromBoard(createInitialState().board), 'Classic: the whole board');
    assert.equal(await game.page.locator('#al-match-info').textContent(), 'Against the Spirit · Gentle · You: Acorns');

    // Two players: leaving with Back keeps the match. Back leads to another
    // kind of match (Classic against the Spirit), so the setup screen offers
    // the unfinished one instead; Forward resumes it behind the handoff, for
    // the Leaves, with no piece drawn.
    await game.goTo('#/acorns-leaves/fog/two', 'al-game-screen');
    await game.press("Show the Acorns' board");
    await game.playPath([sq(5, 2), sq(4, 3)]);
    assert.equal(await game.page.locator('#al-handoff-title').textContent(), "Leaves' turn");
    await game.page.goBack();
    await game.waitForScreen('al-setup-screen');
    assert.match(await game.page.locator('#al-resume-text').textContent(), /^Fog of War, two players · Single game · 1 move played this round$/);
    await game.page.goForward();
    await game.page.locator('#al-handoff').waitFor();
    assert.equal(await game.page.locator('#al-handoff-title').textContent(), "Leaves' turn", 'resumed, for the player to move');
    assert.equal(await game.page.locator('#al-board [data-piece]').count(), 0);
    assert.deepEqual(game.pageErrors, []);
  });

  for (const [label, options] of [
    ['narrow phone (320×568, touch)', { device: devices['iPhone SE'] }],
    ['landscape phone (750×340)', { viewport: { width: 750, height: 340 } }],
  ]) {
    await t.test(`${label}: the Fog match and the handoff fit the screen`, async () => {
      const game = await openGame(harness, options);
      const { page } = game;
      await game.goTo('#/acorns-leaves/fog/two', 'al-game-screen');
      const fits = () => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth);
      const button = await page.locator('#al-handoff-button').boundingBox();
      assert.ok(button.y + button.height <= (page.viewportSize().height), 'the handoff button is on screen');
      await game.press("Show the Acorns' board");
      await game.settle();
      assert.equal(await fits(), true);
      await game.playPath([sq(5, 2), sq(4, 3)]);
      await game.press("Show the Leaves' board");
      await game.playPath([sq(2, 5), sq(3, 4)]);
      await game.press("Show the Acorns' board");
      assert.match(await page.locator('#al-hint').textContent(), /may be possible/);
      assert.equal(await fits(), true);
      assert.deepEqual(game.pageErrors, []);
    });
  }
});
