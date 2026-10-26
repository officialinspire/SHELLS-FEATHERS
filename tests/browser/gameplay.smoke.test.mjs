// Baseline gameplay smoke check (added before the refactor). The game
// assertions are unchanged from v1; only the way it reaches the game follows
// the hub navigation (hub -> Shells & Feathers -> mode).
//
// Serves the repo as static files, drives the real page in headless Chromium
// and checks the core loop end to end: hub -> two-player win -> result dialog
// -> stats survive a reload -> play again -> single-player AI reply.
//
// Run: npm ci && npx playwright install chromium && npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';

test('v1 core loop: two-player win, saved stats, restart, single-player AI reply', { timeout: 60_000 }, async (t) => {
  const harness = await startHarness(t);
  const game = await openGame(harness);
  const { page } = game;

  assert.equal(await game.activeScreen(), 'hub-screen');

  // --- Two players: Player 1 (shell, the default) takes the top row. ---
  await game.openShellsFeathers();
  await game.press('Two Players');
  await game.waitForTurn("Player 1's Turn");
  assert.equal(await game.activeScreen(), 'game-screen');
  assert.deepEqual(await game.cells(), Array(9).fill(''));

  for (const [index, nextTurn] of [[0, 'Player 2'], [3, 'Player 1'], [1, 'Player 2'], [4, 'Player 1']]) {
    await game.tap(index);
    await game.waitForTurn(`${nextTurn}'s Turn`);
  }
  // A click on an occupied cell must not change the board or the turn. (Occupied
  // cells are aria-disabled, which Playwright won't click, so dispatch it.)
  await page.locator('.cell[data-index="4"]').dispatchEvent('click');
  assert.deepEqual(await game.cells(), ['🐚', '🐚', '', '🪶', '🪶', '', '', '', '']);
  assert.match(await game.turnText(), /^Player 1's Turn/);

  await game.tap(2);
  assert.deepEqual(await game.waitForResult(), { title: 'Player 1 Wins!', message: 'The shell spirit prevails' });
  assert.deepEqual(
    await page.locator('.cell.winner').evaluateAll((els) => els.map((el) => el.dataset.index)),
    ['0', '1', '2'],
  );
  assert.deepEqual(await game.scores(), ['1', '0']);

  // --- "Play Again" from the result dialog clears the board, keeps the session score. ---
  await game.press('Play Again');
  await game.waitForTurn("Player 1's Turn");
  assert.equal(await game.modalOpen(), false);
  assert.deepEqual(await game.cells(), Array(9).fill(''));
  assert.equal(await page.locator('.cell.winner').count(), 0);
  assert.deepEqual(await game.scores(), ['1', '0']);

  // --- Records survive a reload (a two-player win, kept apart from yours). ---
  await game.fromMenu('Change Mode');
  await game.waitForScreen('sf-setup-screen');
  await page.reload();
  assert.equal(await game.activeScreen(), 'sf-setup-screen', 'reload keeps the screen');
  assert.deepEqual(await game.pathRecords(), { wins: '0', draws: '0', losses: '0', games: '0', twoPlayer: 'Player 1 wins: 1 · Player 2 wins: 0 · Draws: 0', earlier: '' });

  // --- Single player (default "Gentle" spirit): the AI answers the player's move. ---
  await game.openShellsFeathers();
  await game.press('Play the Spirit');
  await game.waitForTurn('Your Turn');
  assert.equal(await page.locator('#player1-label').textContent(), 'You: ');
  assert.equal(await page.locator('#player2-label').textContent(), 'Spirit: ');
  assert.deepEqual(await game.cells(), Array(9).fill(''));

  await game.tap(4);
  assert.equal(await game.turnText(), "Spirit's Turn");
  await game.waitForTurn('Your Turn');
  const board = await game.cells();
  assert.equal(board[4], '🐚');
  assert.equal(board.filter((c) => c === '🐚').length, 1);
  assert.equal(board.filter((c) => c === '🪶').length, 1, `expected exactly one AI move, got ${JSON.stringify(board)}`);

  assert.deepEqual(game.pageErrors, [], 'uncaught page errors');
  assert.deepEqual(game.missingAssets, [], 'same-origin assets that failed to load');
  // Nothing the game needs comes from another site; only (cosmetic) web fonts are requested.
  assert.deepEqual(
    game.externalRequests.filter((url) => !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)),
    [],
    'off-site requests other than Google Fonts',
  );
});
