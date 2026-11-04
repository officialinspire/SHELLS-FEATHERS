// An update, end to end, the way GitHub Pages serves the game: two builds of
// the site in turn at /SHELLS-FEATHERS/ on localhost (files kept ten minutes
// by the HTTP cache, as Pages does; range requests answered). Build B
// changes one app module only, restamped by tools/stamp-assets.mjs.
//
// Build A installs with no prompt and no refresh. Build B is then published
// mid-match: it installs in its own cache and waits, and the player is
// offered Reload or Later. Later: the match goes on, on build A. A relaunch
// meanwhile still runs build A, offers the waiting update at startup and
// resumes the match. Reload: the match is saved, build B takes over, the
// page refreshes exactly once and the match resumes on the same turn. Build
// A's cache is gone. Then the game launches and plays offline, with its short
// effects cached and the long music and the video streamed (not cached).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, createReadStream,
} from 'node:fs';
import { pipeline } from 'node:stream';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import process from 'node:process';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from '../helpers/static-server.mjs';
import { GamePage } from '../helpers/game-page.mjs';
import { shellFiles } from '../../tools/stamp-assets.mjs';
import { createInitialState, legalMoves } from '../../src/games/acorns-leaves/engine.js';

const SITE = ['index.html', 'sw.js', 'styles.css', 'src', 'manifest.webmanifest', 'assets', 'gameplay.mp3', 'inspiresoftwareintro.mp4'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

// Build A (the repository as it is) and build B (one module changed).
function builds() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sotw-builds-'));
  const files = [...new Set([...SITE, ...shellFiles(readFileSync(path.join(ROOT, 'sw.js'), 'utf8'))])];
  for (const build of ['a', 'b']) {
    for (const item of files) cpSync(path.join(ROOT, item), path.join(dir, build, item), { recursive: true });
  }
  const changed = path.join(dir, 'b', 'src/app/toast.js');
  writeFileSync(changed, `${readFileSync(changed, 'utf8')}\n// Build B: a module-only change.\n`);
  execFileSync(process.execPath, [path.join(ROOT, 'tools/stamp-assets.mjs'), '--root', path.join(dir, 'b')]);
  return { a: path.join(dir, 'a'), b: path.join(dir, 'b'), dir };
}

// Serves `site.root` at /SHELLS-FEATHERS/, as Pages does.
function servePages(site) {
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (!pathname.startsWith('/SHELLS-FEATHERS/')) return res.writeHead(404).end();
    const relative = decodeURIComponent(pathname.slice('/SHELLS-FEATHERS/'.length)) || 'index.html';
    const file = path.join(site.root, relative);
    let stat = null;
    try { stat = file.startsWith(site.root + path.sep) ? statSync(file) : null; } catch { /* missing */ }
    if (!stat?.isFile()) return res.writeHead(404).end();
    site.requests.push(relative);
    const headers = { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600', 'Accept-Ranges': 'bytes' };
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
    if (range) {
      const start = Number(range[1] || 0);
      const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      return pipeline(createReadStream(file, { start, end }), res, () => {});
    }
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    return pipeline(createReadStream(file), res, () => {});
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Every load opens on Touch to start; pass it as a player would (intro seen),
// and note whether the update banner ever showed on this page.
const INIT = `(() => {
  try { sessionStorage.setItem('spiritOfTheWoods:introSeen', '1'); } catch {}
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-gate')?.click();
    const banner = document.getElementById('update-banner');
    new MutationObserver(() => { if (!banner.hidden) window.__bannerShown = true; }).observe(banner, { attributes: true });
  });
})();`;

const MUTE = { 'spiritOfTheWoods:v2': JSON.stringify({ version: 2, settings: { sfx: false, music: false } }) };

// Which build this page runs: the toast module's stamp in its import map.
const runningBuild = (page) => page.evaluate(() => JSON.parse(document.querySelector('script[type="importmap"]').textContent).imports['./src/app/toast.js']);
const stampOf = (root) => JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(readFileSync(path.join(root, 'index.html'), 'utf8'))[1]).imports['./src/app/toast.js'];
const releaseOf = (root) => /const RELEASE = '([0-9a-f]+)'/.exec(readFileSync(path.join(root, 'sw.js'), 'utf8'))[1];
const bannerVisible = (page) => page.locator('#update-banner').isVisible();
const match = async (game) => ({ cells: await game.cells(), turn: await game.turnText() });

test('an update: first install, decline, keep playing, relaunch, accept, resume, offline', { timeout: 180_000 }, async (t) => {
  const { a, b, dir } = builds();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.notEqual(stampOf(a), stampOf(b), 'build B changes a module');
  assert.notEqual(releaseOf(a), releaseOf(b), 'and so is a release of its own');
  const site = { root: a, requests: [] };
  const server = await servePages(site);
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const url = `http://localhost:${server.address().port}/SHELLS-FEATHERS/`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  await context.addInitScript({ content: INIT });
  const blank = await context.newPage();
  await blank.goto(`${url}manifest.webmanifest`);
  await blank.evaluate((entries) => { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); }, MUTE);
  await blank.close();

  const page = await context.newPage();
  const game = new GamePage(page, url);
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  let loads = 0;
  page.on('load', () => { loads += 1; });

  await t.test('build A: first install, no prompt and no refresh', async () => {
    await page.goto(url);
    await game.waitForScreen('hub-screen');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
    await page.waitForTimeout(500);
    assert.equal(loads, 1, 'never refreshed');
    assert.equal(await page.evaluate(() => Boolean(window.__bannerShown)), false, 'no prompt on a first install');
    assert.equal(await runningBuild(page), stampOf(a));
    assert.deepEqual(await page.evaluate(() => caches.keys()), [`spirit-woods-shell-${releaseOf(a)}`]);
  });

  await t.test('build B published mid-match: it waits, and Reload or Later is offered', async () => {
    await game.startNew('#/shells-feathers/play/two', 'game-screen');
    await game.tap(0);
    await game.waitForTurn("Player 2's Turn");
    await game.tap(4);
    await game.waitForTurn("Player 1's Turn");
    site.root = b;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.locator('#update-banner').waitFor({ state: 'visible', timeout: 15_000 });
    assert.match(await page.locator('#update-text, #update-banner-text').textContent(), /update is ready/i);
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return { waiting: reg.waiting?.state, keys: await caches.keys() };
    });
    assert.equal(state.waiting, 'installed', 'the new worker waits');
    assert.deepEqual(state.keys.sort(), [`spirit-woods-shell-${releaseOf(a)}`, `spirit-woods-shell-${releaseOf(b)}`].sort(), 'in its own cache');
    assert.equal(loads, 1, 'nothing refreshed');
    assert.equal(await runningBuild(page), stampOf(a));
    // The banner covers nothing: every square and the Menu button are on top.
    const covered = await page.evaluate(() => [...document.querySelectorAll('#game-screen .cell, #game-screen .menu-btn')].filter((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(hit === el || el.contains(hit));
    }).length);
    assert.equal(covered, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  });

  await t.test('Later: the match goes on, on build A; the match menu still offers it', async () => {
    await page.getByRole('button', { name: 'Later', exact: true }).click();
    assert.equal(await bannerVisible(page), false);
    await game.tap(8);
    await game.waitForTurn("Player 2's Turn");
    await game.tap(2);
    await game.waitForTurn("Player 1's Turn");
    assert.deepEqual(await game.cells(), ['🐚', '', '🪶', '', '🪶', '', '', '', '🐚']);
    assert.equal(await runningBuild(page), stampOf(a));
    await game.press('Menu', { exact: true });
    await page.locator('.match-menu.active [data-update-row]').waitFor({ state: 'visible' });
    await game.press('Resume', { exact: true });
    assert.equal(await bannerVisible(page), false, 'not again during the match');
    assert.equal(loads, 1);
  });

  let before;
  await t.test('a relaunch meanwhile: still build A, the same match, and the waiting update offered at startup', async () => {
    before = await match(game);
    await page.reload();
    await game.waitForScreen('game-screen');
    assert.equal(await runningBuild(page), stampOf(a), 'the page comes from its own release');
    assert.deepEqual(await match(game), before, 'resumed on the same turn');
    await page.locator('#update-banner').waitFor({ state: 'visible', timeout: 10_000 });
    loads = 1;
  });

  await t.test('Reload: saved, handed over, one refresh, the same turn on build B', async () => {
    await game.press('Menu', { exact: true });
    await page.locator('.match-menu.active').getByRole('button', { name: 'Reload to Update' }).click();
    await page.waitForFunction(() => document.readyState === 'complete' && navigator.serviceWorker.controller
      && JSON.parse(document.querySelector('script[type="importmap"]').textContent).imports['./src/app/toast.js'] !== undefined, null, { timeout: 15_000 });
    await game.waitForScreen('game-screen');
    await page.waitForTimeout(1500); // no second refresh
    assert.equal(loads, 2, 'exactly one refresh');
    assert.equal(await runningBuild(page), stampOf(b));
    assert.deepEqual(await match(game), before, 'resumed on the same turn');
    assert.equal(await bannerVisible(page), false, 'nothing left to offer');
    assert.equal(await page.locator('[data-update-row]:not([hidden])').count(), 0);
    assert.deepEqual(await page.evaluate(() => caches.keys()), [`spirit-woods-shell-${releaseOf(b)}`], "build A's cache is gone");
    // And play goes on.
    await game.tap(6);
    await game.waitForTurn("Player 2's Turn");
  });

  await t.test('offline: launches build B and plays; effects cached, music and video streamed', async () => {
    await context.setOffline(true);
    const offline = await context.newPage();
    offline.on('pageerror', (err) => errors.push(err.message));
    const g = new GamePage(offline, url);
    await offline.goto(url);
    await g.waitForScreen('hub-screen');
    assert.equal(await runningBuild(offline), stampOf(b));
    await g.startNew('#/acorns-leaves/play/two', 'al-game-screen');
    const turn = await offline.locator('#al-turn').textContent();
    const [move] = legalMoves(createInitialState());
    for (const square of move.path) await offline.locator(`#al-board button[data-square="${square}"]`).click();
    await offline.waitForFunction((was) => document.getElementById('al-turn').textContent !== was, turn);
    const cached = await offline.evaluate(async () => {
      const cache = await caches.open((await caches.keys())[0]);
      const has = async (file) => Boolean(await cache.match(new URL(file, location.href).href));
      return {
        effects: await Promise.all(['sounds/capture.wav', 'sounds/select.wav', 'victory.mp3', 'newgame.mp3'].map(has)),
        streamed: await Promise.all(['gameplay.mp3', 'inspiresoftwareintro.mp4'].map(has)),
      };
    });
    assert.deepEqual(cached, { effects: [true, true, true, true], streamed: [false, false] });
  });

  assert.deepEqual(errors, []);
});
