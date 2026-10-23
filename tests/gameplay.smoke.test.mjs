// Baseline gameplay smoke check for the current (v1) build.
//
// Serves the repo as static files, drives the real page in headless Chromium
// and checks the core loop end to end: menu -> two-player win -> result modal
// -> stats survive a reload -> new game -> single-player AI reply.
//
// It only uses what a player can see (DOM text, classes, screens), never the
// internal `gameState` object, so it keeps guarding behavior while index.js is
// split into modules and storage is migrated.
//
// Run: npm ci && npx playwright install chromium && npm test
// Needs network access to cdn.jsdelivr.net: the game loads Phaser from there
// and cannot start a match without it (see docs/upgrade-plan.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { pipeline } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
};
// index.html lists "SHELLS & FEATHERS MINI GAME/<file>.mp3" before each real
// audio path. That folder has never existed in the repo, so those 404s are
// expected until the audio markup is cleaned up.
const LEGACY_AUDIO_DIR = '/SHELLS & FEATHERS MINI GAME/';

function serveRepo() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    let stat;
    try {
      stat = file.startsWith(ROOT + path.sep) ? statSync(file) : null;
    } catch {
      stat = null;
    }
    if (!stat?.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': stat.size,
    });
    pipeline(createReadStream(file), res, () => {});
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('v1 core loop: two-player win, saved stats, restart, single-player AI reply', { timeout: 60_000 }, async (t) => {
  const server = await serveRepo();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    server.closeAllConnections();
    server.close();
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  const missingAssets = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('response', (res) => {
    const url = new URL(res.url());
    const urlPath = decodeURIComponent(url.pathname);
    if (url.origin === base && res.status() >= 400 && !urlPath.startsWith(LEGACY_AUDIO_DIR)) {
      missingAssets.push(`${res.status()} ${urlPath}`);
    }
  });
  // Fonts are cosmetic; keep the check independent of Google Fonts.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());

  // Buttons are looked up on the visible screen (or open modal) only, so the
  // same label on a hidden screen can't match.
  const press = (name) =>
    page.locator('.screen.active, #game-modal.active').getByRole('button', { name }).click();
  const activeScreen = () => page.locator('.screen.active').getAttribute('id');
  const turnText = () => page.locator('#turn-indicator').textContent();
  const cells = () => page.locator('.cell').allTextContents();
  const statValues = async () => ({
    victories: await page.locator('#wins-count').textContent(),
    balance: await page.locator('#draws-count').textContent(),
    lessons: await page.locator('#losses-count').textContent(),
    total: await page.locator('#total-games').textContent(),
  });
  const waitForTurn = (prefix) =>
    page.waitForFunction(
      (p) => document.getElementById('turn-indicator').textContent.startsWith(p),
      prefix,
      { timeout: 5_000 },
    );

  await page.goto(`${base}/index.html`);
  assert.equal(
    await page.evaluate(() => typeof window.Phaser?.Game),
    'function',
    'Phaser did not load from cdn.jsdelivr.net; the board cannot start without it',
  );
  assert.equal(await activeScreen(), 'start-screen');

  // --- Two players: Player 1 (shell, the default) takes the top row. ---
  await press('Begin Journey');
  await press('Two Players');
  await waitForTurn("Player 1's Turn");
  assert.equal(await activeScreen(), 'game-screen');
  assert.deepEqual(await cells(), Array(9).fill(''));

  for (const [index, nextTurn] of [[0, 'Player 2'], [3, 'Player 1'], [1, 'Player 2'], [4, 'Player 1']]) {
    await page.locator(`.cell[data-index="${index}"]`).click();
    await waitForTurn(`${nextTurn}'s Turn`);
  }
  // A click on an occupied cell must not change the board or the turn.
  await page.locator('.cell[data-index="4"]').click();
  assert.deepEqual(await cells(), ['🐚', '🐚', '', '🪶', '🪶', '', '', '', '']);
  assert.match(await turnText(), /^Player 1's Turn/);

  await page.locator('.cell[data-index="2"]').click();
  await page.locator('#game-modal.active').waitFor({ timeout: 5_000 });
  assert.equal(await page.locator('#modal-title').textContent(), 'Player 1 Wins!');
  assert.equal(await page.locator('#modal-message').textContent(), 'The shell spirit prevails');
  assert.deepEqual(
    await page.locator('.cell.winner').evaluateAll((els) => els.map((el) => el.dataset.index)),
    ['0', '1', '2'],
  );
  assert.equal(await page.locator('#player1-score').textContent(), '1');
  assert.equal(await page.locator('#player2-score').textContent(), '0');

  // --- "New Game" from the result modal clears the board, keeps the session score. ---
  await press('New Game');
  await waitForTurn("Player 1's Turn");
  assert.equal(await page.locator('#game-modal.active').count(), 0);
  assert.deepEqual(await cells(), Array(9).fill(''));
  assert.equal(await page.locator('.cell.winner').count(), 0);
  assert.equal(await page.locator('#player1-score').textContent(), '1');

  // --- Lifetime stats survive a reload. ---
  await press('Return Home');
  assert.equal(await activeScreen(), 'start-screen');
  await page.reload();
  await press('Your Path');
  assert.equal(await activeScreen(), 'stats-screen');
  assert.deepEqual(await statValues(), { victories: '1', balance: '0', lessons: '0', total: '1' });
  await press('Return to Lodge');

  // --- Single player (default "Gentle" spirit): the AI answers the player's move. ---
  await press('Begin Journey');
  await press('Single Player');
  await waitForTurn('Your Turn');
  assert.equal(await page.locator('#player1-label').textContent(), 'You: ');
  assert.equal(await page.locator('#player2-label').textContent(), 'Spirit: ');
  assert.deepEqual(await cells(), Array(9).fill(''));

  await page.locator('.cell[data-index="4"]').click();
  assert.equal(await turnText(), "Spirit's Turn");
  await waitForTurn('Your Turn');
  const board = await cells();
  assert.equal(board[4], '🐚');
  assert.equal(board.filter((c) => c === '🐚').length, 1);
  assert.equal(board.filter((c) => c === '🪶').length, 1, `expected exactly one AI move, got ${JSON.stringify(board)}`);

  assert.deepEqual(pageErrors, [], 'uncaught page errors');
  assert.deepEqual(missingAssets, [], 'same-origin assets that failed to load');
});
