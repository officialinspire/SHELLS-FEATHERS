// Sound, music and vibration through the real app (src/shared/audio.js,
// feedback.js, haptics.js and the Settings controls in sound-motion.js):
// - one music element, never under the intro, never started twice, through
//   hiding and showing the page, switching games and Play Again;
// - the mix: music trimmed under the effects, each effect at its own gain;
// - sound effects, music and vibration each follow their own saved switch,
//   on the Settings screen and in a match menu, and stay so after a reload;
// - rapid taps: one sound and one buzz per actual event;
// - a resumed match replays its moves silently;
// - two players in Fog: every move sounds and feels the same;
// - missing sound files and no vibration: the games play on;
// - an iPhone-like browser (element volume fixed at 1): levels go through
//   Web Audio gain nodes, so the mix and sliders still apply.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rapidInput, startHarness, openGame } from '../helpers/game-page.mjs';
import { MIX, FADE_MS } from '../../src/shared/audio.js';

const V2_KEY = 'spiritOfTheWoods:v2';
const settings = (patch) => ({ [V2_KEY]: JSON.stringify({ version: 2, settings: { motion: 'reduce', ...patch } }) });

// Records every play() (window.__plays: ids), music play() asked while it
// was already playing (window.__doubleMusic), and every vibration.
const RECORD = `(() => {
  window.__plays = [];
  window.__doubleMusic = 0;
  window.__vibes = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function recordedPlay() {
    if (this.id === 'gameplay-music' && !this.paused) window.__doubleMusic += 1;
    window.__plays.push(this.id);
    return play.call(this);
  };
  Navigator.prototype.vibrate = function vibrate(p) { window.__vibes.push(p); return true; };
})();`;

const effects = (page) => page.evaluate(() => window.__plays.filter((id) => id !== 'gameplay-music' && id !== 'intro-video'));
const vibes = (page) => page.evaluate(() => window.__vibes.slice());
const musicState = (page) => page.evaluate(() => {
  const el = document.getElementById('gameplay-music');
  return {
    playing: !el.paused, volume: el.volume, doubled: window.__doubleMusic, players: document.querySelectorAll('audio#gameplay-music').length,
  };
});

async function open(harness, { storage = settings({}), initScript = RECORD, gate, viewport = { width: 1280, height: 800 } } = {}) {
  const game = await openGame(harness, {
    viewport, storage, initScript, gate,
  });
  if (!gate) {
    await game.waitForScreen('hub-screen');
    await game.page.mouse.click(5, 5); // the first gesture: sound may start
  }
  return game;
}

const setHidden = (page, hidden) => page.evaluate((h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

// Ticks a setting's switch the way a click on it does (it fires change).
const toggle = (page, root, name) => page.evaluate(([r, n]) => document.querySelector(`${r} [data-setting="${n}"]`).click(), [root, name]);

test('audio', { timeout: 600_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('one music element: silent under the intro, then once, through hiding, switching games and Play Again', async () => {
    const game = await open(harness, { gate: true });
    const { page } = game;
    await page.keyboard.press('Enter'); // Touch to start: the intro plays
    await page.waitForFunction(() => document.documentElement.dataset.gate === 'intro');
    await game.wait(600);
    assert.equal((await musicState(page)).playing, false, 'no music under the intro');
    await page.keyboard.press('Escape'); // Skip
    await game.waitForScreen('hub-screen');
    await page.waitForFunction(() => !document.getElementById('gameplay-music').paused);
    await game.wait(FADE_MS + 200);
    const steady = await musicState(page);
    assert.ok(Math.abs(steady.volume - 0.3 * MIX.music) < 0.01, `music at 30% of its trim: ${steady.volume}`);

    for (let i = 0; i < 3; i++) {
      await setHidden(page, true);
      assert.equal((await musicState(page)).playing, false, 'paused while hidden');
      await setHidden(page, false);
      await game.wait(100);
      assert.equal((await musicState(page)).playing, true);
    }
    for (const [hash, screen] of [['#/shells-feathers/play/two', 'game-screen'], ['#/', 'hub-screen'], ['#/acorns-leaves/play/two', 'al-game-screen'], ['#/', 'hub-screen']]) {
      await game.startNew(hash, screen);
      assert.equal((await musicState(page)).playing, true, screen);
    }
    // A win stops the music for the victory theme; Play Again brings it back.
    await game.startNew('#/shells-feathers/play/two', 'game-screen');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.waitForResult();
    await game.wait(FADE_MS + 200);
    assert.equal((await musicState(page)).playing, false, 'quiet for the victory theme');
    assert.ok((await effects(page)).includes('victory-sound'));
    await game.press('Play Again');
    await game.wait(FADE_MS);
    const after = await musicState(page);
    assert.equal(after.playing, true);
    assert.equal(after.doubled, 0, 'play() was never asked of music already playing');
    assert.equal(after.players, 1);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('effects, music and vibration each follow their own saved switch, and stay so after a reload', async () => {
    const game = await open(harness, { storage: settings({ sfx: false, music: true, haptics: true }) });
    const { page } = game;
    await game.startNew('#/shells-feathers/play/two', 'game-screen');
    await game.tap(4);
    assert.deepEqual(await effects(page), [], 'effects off: silent');
    assert.equal((await vibes(page)).length, 1, 'vibration on: one buzz');
    assert.equal((await musicState(page)).playing, true, 'music on');

    // In the match menu: effects on, music off, vibration off.
    await game.press('Menu', { exact: true });
    await game.press('Settings', { exact: true });
    for (const name of ['sfx', 'music', 'haptics']) await toggle(page, '#sf-menu', name);
    await game.press('Done', { exact: true });
    await game.press('Resume', { exact: true });
    assert.equal((await musicState(page)).playing, false, 'music off at once');
    const mark = { e: (await effects(page)).length, v: (await vibes(page)).length };
    await game.tap(0);
    assert.deepEqual((await effects(page)).slice(mark.e), ['opponent-select'], 'effects on');
    assert.equal((await vibes(page)).length, mark.v, 'vibration off');

    await page.reload();
    await game.waitForScreen('game-screen');
    await page.mouse.click(5, 5);
    await game.wait(300);
    assert.equal((await musicState(page)).playing, false, 'music still off after a reload');
    const again = { e: (await effects(page)).length, v: (await vibes(page)).length };
    await game.tap(8);
    assert.deepEqual((await effects(page)).slice(again.e), ['player-select']);
    assert.equal((await vibes(page)).length, again.v);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('rapid taps: one sound and one buzz per actual event', async () => {
    const game = await open(harness, { storage: settings({ haptics: true }) });
    const { page } = game;
    await game.startNew('#/acorns-leaves/play/two', 'al-game-screen');
    // Repeated picks at the same instant share feedback.
    const mark = { e: (await effects(page)).length, v: (await vibes(page)).length };
    await rapidInput(page, () => page.evaluate(() => {
      const piece = document.querySelector('#al-board button[data-piece="acorn"]');
      for (let i = 0; i < 10; i++) piece.click();
    }));
    const tapped = (await effects(page)).slice(mark.e);
    assert.ok(tapped.length <= 2 && tapped.every((id) => id === 'select-sound'), `a pick and a put-back at most: ${tapped}`);
    // A piece picked, then ten taps at once on a square it can't reach.
    await game.square(44).click();
    await game.wait(150); // buzzes closer than HAPTICS.MIN_GAP_MS to the last are dropped
    const mid = { e: (await effects(page)).length, v: (await vibes(page)).length };
    await rapidInput(page, () => page.evaluate(() => {
      const far = document.querySelector('#al-board button[data-square="0"]') ?? document.querySelector('#al-board button[data-square="1"]');
      for (let i = 0; i < 10; i++) far.click();
    }));
    const refused = (await effects(page)).slice(mid.e);
    assert.deepEqual(refused, ['invalid-sound'], 'one rustle');
    assert.equal((await vibes(page)).length - mid.v, 1, 'one buzz');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('a resumed match comes back without replaying its sounds', async () => {
    const game = await open(harness);
    const { page } = game;
    await game.startNew('#/acorns-leaves/play/two', 'al-game-screen');
    for (const path of [[44, 37], [17, 24], [51, 44]]) await game.playPath(path);
    await page.reload();
    await game.waitForScreen('al-game-screen');
    await page.mouse.click(5, 5);
    await game.wait(300);
    assert.deepEqual((await effects(page)).filter((id) => /move|capture|crown/.test(id)), [], 'restored silently');
    const music = await musicState(page);
    assert.equal(music.playing, true);
    assert.equal(music.doubled, 0);
  });

  await t.test('two players in Fog: every move sounds and feels the same, and picks give nothing away', async () => {
    const game = await open(harness, { storage: settings({ haptics: true }) });
    const { page } = game;
    await game.startNew('#/acorns-leaves/fog/two', 'al-game-screen');
    const take = () => page.locator('#al-handoff button').click();
    const mark = { e: (await effects(page)).length, v: (await vibes(page)).length };
    for (const path of [[44, 37], [17, 24], [51, 44], [10, 17]]) {
      if (await page.locator('#al-handoff').isVisible()) await take();
      await game.playPath(path);
    }
    const heard = (await effects(page)).slice(mark.e).filter((id) => id !== 'button-select');
    assert.deepEqual(heard, ['piece-move', 'piece-move', 'piece-move', 'piece-move']);
    const felt = (await vibes(page)).slice(mark.v);
    assert.equal(new Set(felt.map(String)).size, 1, `the same buzz for every move: ${felt}`);
    assert.equal(felt.length, 4);
  });

  await t.test('missing sound files and no vibration: the games play on', async () => {
    const noVibration = `${RECORD}; delete Navigator.prototype.vibrate;`;
    const game = await open(harness, { storage: settings({ haptics: true }), initScript: noVibration });
    const { page } = game;
    await page.route(/\.(mp3|wav)(\?.*)?$/, (route) => route.fulfill({ status: 404, body: '' }));
    await game.startNew('#/shells-feathers/play/two', 'game-screen');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    const result = await game.waitForResult();
    assert.match(result.title, /Wins|Victory/i);
    await game.press('Play Again');
    await game.startNew('#/acorns-leaves/play/two', 'al-game-screen');
    await game.playPath([44, 37]);
    assert.match((await game.checkersView()).turn, /Leaves/);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('an iPhone-like browser (element volume fixed at 1): the mix goes through Web Audio gain nodes', async () => {
    const fixedVolume = `${RECORD};
      Object.defineProperty(HTMLMediaElement.prototype, 'volume', { configurable: true, get() { return 1; }, set() {} });
      window.__routed = [];
      const source = AudioContext.prototype.createMediaElementSource;
      AudioContext.prototype.createMediaElementSource = function routed(el) {
        const node = source.call(this, el);
        const ctx = this;
        const connect = node.connect.bind(node);
        node.connect = (gain) => { window.__routed.push({ id: el.id, gain }); return connect(gain); };
        window.__ctx = ctx;
        return node;
      };`;
    const game = await open(harness, { initScript: fixedVolume });
    const { page } = game;
    await page.waitForFunction(() => window.__ctx?.state === 'running');
    await game.startNew('#/shells-feathers/play/two', 'game-screen');
    await game.wait(FADE_MS + 300);
    await game.tap(4);
    await game.wait(100);
    const gains = await page.evaluate(() => Object.fromEntries(window.__routed.map(({ id, gain }) => [id, gain.gain.value])));
    assert.ok(Math.abs(gains['gameplay-music'] - 0.3 * MIX.music) < 0.01, `music gain ${gains['gameplay-music']}`);
    assert.ok(Math.abs(gains['player-select'] - 0.5 * MIX.sfx['player-select']) < 0.01, `effect gain ${gains['player-select']}`);
    // The sliders still work: music to 80%.
    await game.press('Menu', { exact: true });
    await game.press('Settings', { exact: true });
    await page.evaluate(() => {
      const slider = document.querySelector('#sf-menu [data-setting="musicVolume"]');
      slider.value = '80';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await game.wait(100);
    const music = await page.evaluate(() => window.__routed.find(({ id }) => id === 'gameplay-music').gain.gain.value);
    assert.ok(Math.abs(music - 0.8 * MIX.music) < 0.01, `music gain after the slider: ${music}`);
    assert.deepEqual(game.pageErrors, []);
  });
});
