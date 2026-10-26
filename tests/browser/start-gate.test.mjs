// Touch to start and the INSPIRE intro in the page: the start screen at
// every load with the page behind it inert; the intro once per browser
// session, skippable; the music only once the game appears after it; music
// off plays the intro silently; and a match behind the start screen waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';
import { createInitialState, rowsFromBoard } from '../../src/games/acorns-leaves/engine.js';

const V2_KEY = 'spiritOfTheWoods:v2';
const START = rowsFromBoard(createInitialState().board);
// Records every audio and video play() in order (window.__plays).
const RECORD = `(() => {
  window.__plays = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function recordedPlay() {
    window.__plays.push(this.id + (this.muted ? ':muted' : ''));
    return play.call(this);
  };
})();`;
const plays = (page) => page.evaluate(() => window.__plays.slice());
const gateState = (page) => page.evaluate(() => document.documentElement.dataset.gate);

test('start screen and intro', { timeout: 300_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('first visit: start screen, then the intro with sound, then the hub with its music', async () => {
    const game = await openGame(harness, { gate: true, initScript: RECORD });
    const { page } = game;
    assert.equal(await gateState(page), 'start');
    assert.equal(await page.locator('#start-gate').isVisible(), true);
    assert.equal(await page.locator('#start-button').textContent(), 'Touch, click, or press any key to start');
    assert.equal(await page.evaluate(() => document.getElementById('game-container').inert), true, 'the hub waits behind it');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'start-button');
    assert.deepEqual(await plays(page), [], 'nothing plays before the tap');

    await page.locator('#start-gate').click({ position: { x: 20, y: 300 } }); // anywhere on the screen
    assert.equal(await gateState(page), 'intro');
    assert.equal(await page.locator('#intro-video').getAttribute('src'), 'inspiresoftwareintro.mp4');
    assert.deepEqual(await plays(page), ['intro-video'], 'the intro, with sound; no music under it');
    await page.waitForFunction(() => document.getElementById('intro-video').currentTime > 0.3, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => document.getElementById('gameplay-music').paused), true);

    await page.locator('#intro-skip').click();
    await game.waitForScreen('hub-screen');
    assert.equal(await gateState(page), 'ready');
    assert.equal(await page.locator('#intro-gate').isVisible(), false);
    assert.equal(await page.evaluate(() => document.getElementById('game-container').inert), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'hub-title');
    await page.waitForFunction(() => !document.getElementById('gameplay-music').paused, null, { timeout: 5000 });
    assert.deepEqual(await plays(page), ['intro-video', 'gameplay-music'], 'the music starts with the hub');

    // Reloaded this session: the start screen again, then straight in.
    await page.reload();
    assert.equal(await gateState(page), 'start');
    await page.keyboard.press('Enter');
    await game.waitForScreen('hub-screen');
    assert.equal(await gateState(page), 'ready');
    await page.waitForFunction(() => !document.getElementById('gameplay-music').paused, null, { timeout: 5000 });
    assert.deepEqual(await plays(page), ['gameplay-music'], 'no intro the second time');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('the intro plays through to its end on its own, and Skip is ignored right after the start tap', async () => {
    const game = await openGame(harness, { gate: true, initScript: RECORD });
    const { page } = game;
    await page.keyboard.press('Space');
    await page.keyboard.press('Escape'); // the same moment: ignored
    assert.equal(await gateState(page), 'intro');
    await page.waitForFunction(() => document.documentElement.dataset.gate === 'ready', null, { timeout: 15_000 });
    assert.ok(await page.evaluate(() => document.getElementById('intro-video').currentTime > 5), 'it played to the end');
    await page.waitForFunction(() => !document.getElementById('gameplay-music').paused, null, { timeout: 5000 });
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('music off: the intro plays silently, and no music follows', async () => {
    const game = await openGame(harness, {
      gate: true, initScript: RECORD, storage: { [V2_KEY]: JSON.stringify({ version: 2, settings: { music: false } }) },
    });
    const { page } = game;
    await page.locator('#start-button').click({ force: true }); // it breathes, so never "stable"
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await game.waitForScreen('hub-screen');
    await page.waitForTimeout(500);
    assert.deepEqual(await plays(page), ['intro-video:muted']);
  });

  await t.test('a match behind the start screen waits: the Spirit moves only after the start', async () => {
    const game = await openGame(harness, {
      gate: true,
      fakeClock: true,
      initScript: "sessionStorage.setItem('spiritOfTheWoods:introSeen', '1');",
      storage: { [V2_KEY]: JSON.stringify({ version: 2, settings: { sfx: false, music: false }, acornsLeaves: { settings: { side: 'leaf' } } }) },
    });
    const { page } = game;
    await page.goto(`${game.base}/index.html#/acorns-leaves/play/single`);
    await page.clock.runFor(10_000);
    assert.equal(await gateState(page), 'start');
    assert.deepEqual(await game.checkersRows(), START, 'the Spirit (Acorns, to move) waits');
    await page.keyboard.press('Enter');
    assert.equal(await gateState(page), 'ready');
    await page.clock.runFor(10_000);
    assert.notDeepEqual(await game.checkersRows(), START, 'and moves once the game is shown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.square !== undefined), true, 'focus on the board');
  });

  await t.test('small screens: the start screen and Skip fit, and Skip is easy to hit', async () => {
    for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
      const game = await openGame(harness, { gate: true, viewport });
      const { page } = game;
      const fit = await page.evaluate(() => [...document.querySelectorAll('#start-gate .start-card, #start-gate .start-byline')]
        .map((el) => el.getBoundingClientRect()).every((r) => r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth));
      assert.equal(fit, true, `${viewport.width}×${viewport.height}: start screen fits`);
      await page.locator('#start-button').click({ force: true }); // it breathes, so never "stable"
      const skip = await page.locator('#intro-skip').boundingBox();
      assert.ok(skip.height >= 44 && skip.y + skip.height <= viewport.height && skip.x + skip.width <= viewport.width, JSON.stringify(skip));
      assert.deepEqual(game.pageErrors, []);
    }
  });
});
