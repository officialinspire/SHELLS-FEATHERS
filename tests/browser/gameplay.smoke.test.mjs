// Baseline gameplay smoke check (added before the refactor; assertions kept
// unchanged so it guards v1 behavior).
//
// Serves the repo as static files, drives the real page in headless Chromium
// and checks the core loop end to end: menu -> two-player win -> result modal
// -> stats survive a reload -> new game -> single-player AI reply.
//
// Run: npm ci && npx playwright install chromium && npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';

test('v1 core loop: two-player win, saved stats, restart, single-player AI reply', { timeout: 60_000 }, async (t) => {
  const harness = await startHarness(t);
  const game = await openGame(harness);
  const { page } = game;

  assert.equal(await game.activeScreen(), 'start-screen');

  // --- Two players: Player 1 (shell, the default) takes the top row. ---
  await game.press('Begin Journey');
  await game.press('Two Players');
  await game.waitForTurn("Player 1's Turn");
  assert.equal(await game.activeScreen(), 'game-screen');
  assert.deepEqual(await game.cells(), Array(9).fill(''));

  for (const [index, nextTurn] of [[0, 'Player 2'], [3, 'Player 1'], [1, 'Player 2'], [4, 'Player 1']]) {
    await game.tap(index);
    await game.waitForTurn(`${nextTurn}'s Turn`);
  }
  // A click on an occupied cell must not change the board or the turn.
  await game.tap(4);
  assert.deepEqual(await game.cells(), ['🐚', '🐚', '', '🪶', '🪶', '', '', '', '']);
  assert.match(await game.turnText(), /^Player 1's Turn/);

  await game.tap(2);
  assert.deepEqual(await game.waitForResult(), { title: 'Player 1 Wins!', message: 'The shell spirit prevails' });
  assert.deepEqual(
    await page.locator('.cell.winner').evaluateAll((els) => els.map((el) => el.dataset.index)),
    ['0', '1', '2'],
  );
  assert.deepEqual(await game.scores(), ['1', '0']);

  // --- "New Game" from the result modal clears the board, keeps the session score. ---
  await game.press('New Game');
  await game.waitForTurn("Player 1's Turn");
  assert.equal(await game.modalOpen(), false);
  assert.deepEqual(await game.cells(), Array(9).fill(''));
  assert.equal(await page.locator('.cell.winner').count(), 0);
  assert.deepEqual(await game.scores(), ['1', '0']);

  // --- Lifetime stats survive a reload. ---
  await game.press('Return Home');
  assert.equal(await game.activeScreen(), 'start-screen');
  await page.reload();
  assert.deepEqual(await game.lifetimeStats(), { victories: '1', balance: '0', lessons: '0', total: '1' });

  // --- Single player (default "Gentle" spirit): the AI answers the player's move. ---
  await game.press('Begin Journey');
  await game.press('Single Player');
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
