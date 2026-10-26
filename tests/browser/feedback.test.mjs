// Feedback in the real page: sounds, optional vibration and animations from
// the shared feedback service. A browser with vibration (a recording
// navigator.vibrate), one that refuses, and one without it; the Haptics
// setting, opt-in and remembered; the Spirit's moves and hovering never
// vibrate; rapid refusals buzz once; mute, pausing, a hidden page and
// leaving drop queued effects; reduced motion; and Fog animating only what
// the player can see.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';
import { squareAt } from '../../src/games/acorns-leaves/engine.js';
import { HAPTICS_HINTS } from '../../src/app/sound-motion.js';
import { CUES } from '../../src/shared/feedback.js';
import { DELAYS } from '../../src/games/acorns-leaves/session.js';

const sq = (row, col) => squareAt(row, col);
const V2_KEY = 'spiritOfTheWoods:v2';
// Six quiet moves, then c3 jumps twice (c3-a5-c7).
const TO_DOUBLE_JUMP = [[44, 37], [17, 24], [51, 44], [10, 17], [60, 51], [24, 33]];
const DOUBLE_JUMP = [sq(5, 2), sq(3, 0), sq(1, 2)];

// Records every sound played (window.__plays) and every vibration asked for
// (window.__vibes). The browser's vibration is replaced by a recorder, by
// one that refuses, or removed.
function recording(kind) {
  return `(() => {
    window.__plays = [];
    window.__vibes = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function recordedPlay() {
      window.__plays.push(this.id);
      return play.call(this);
    };
    ${kind === 'none'
    ? 'delete Navigator.prototype.vibrate;'
    : `Navigator.prototype.vibrate = function vibrate(p) { window.__vibes.push(p); return ${kind === 'refuse' ? 'false' : 'true'}; };`}
  })();`;
}

async function open(harness, { kind = 'yes', storage, viewport = { width: 1280, height: 800 } } = {}) {
  const game = await openGame(harness, { viewport, storage });
  await game.page.addInitScript({ content: recording(kind) });
  await game.page.reload();
  await game.waitForScreen('hub-screen');
  await game.page.mouse.click(5, 5); // the first gesture: sound may start
  return game;
}

const vibes = (game) => game.page.evaluate(() => window.__vibes.slice());
const plays = (game) => game.page.evaluate(() => window.__plays.filter((id) => id !== 'gameplay-music'));
const withHaptics = (on) => ({ [V2_KEY]: JSON.stringify({ version: 2, settings: { haptics: on } }) });

test('feedback', { timeout: 600_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('a browser without vibration: Settings says so honestly, the switch is off and disabled, the games play the same', async () => {
    const game = await open(harness, { kind: 'none', storage: withHaptics(true) });
    const { page } = game;
    await game.goTo('#/settings', 'settings-screen');
    const row = await page.evaluate(() => {
      const input = document.getElementById('haptics-toggle');
      return { disabled: input.disabled, checked: input.checked, hint: document.getElementById('haptics-hint').textContent };
    });
    assert.deepEqual(row, { disabled: true, checked: false, hint: HAPTICS_HINTS.unsupported });
    // The match menu's Settings says the same.
    await game.goTo('#/shells-feathers/play/two', 'game-screen');
    await game.press('Menu', { exact: true });
    await game.press('Settings', { exact: true });
    assert.equal(await page.locator('#sf-menu-haptics').isDisabled(), true);
    assert.equal(await page.locator('#sf-menu-haptics-hint').textContent(), HAPTICS_HINTS.unsupported);
    await game.press('Done');
    await game.press('Resume');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    assert.equal((await game.waitForResult()).title, 'Player 1 Wins!');
    const heard = await plays(game);
    assert.ok(heard.includes('player-select') && heard.includes('opponent-select') && heard.includes('victory-sound'));
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('a browser with vibration: off until turned on, remembered, only your own actions, never hover or the Spirit', async () => {
    const game = await open(harness);
    const { page } = game;
    await game.goTo('#/acorns-leaves/play/single', 'al-game-screen');
    await game.playPath([sq(5, 2), sq(4, 3)]);
    assert.deepEqual(await vibes(game), [], 'nothing while Haptics is off (the default)');

    await game.goTo('#/settings', 'settings-screen');
    assert.equal(await page.locator('#haptics-hint').textContent(), HAPTICS_HINTS.available);
    await page.locator('#settings-screen label[for="haptics-toggle"]').click();
    assert.deepEqual(await vibes(game), [12], 'turning it on gives one short sample');
    assert.equal(JSON.parse(await game.storageItem(V2_KEY)).settings.haptics, true);
    await page.reload();
    await game.waitForScreen('settings-screen');
    assert.equal(await page.locator('#haptics-toggle').isChecked(), true, 'remembered');
    await page.mouse.click(5, 5);

    await game.startNew('#/acorns-leaves/play/single', 'al-game-screen');
    // Hovering over pieces and squares: nothing.
    for (const s of [sq(5, 0), sq(5, 2), sq(4, 1), sq(2, 1)]) await game.square(s).hover();
    assert.deepEqual(await vibes(game), []);
    await game.tapSquare(sq(5, 2));
    assert.deepEqual(await vibes(game), [CUES.select.haptic]);
    await game.wait(120);
    await game.tapSquare(sq(4, 3));
    assert.deepEqual(await vibes(game), [CUES.select.haptic, CUES.move.haptic], 'your move');
    await game.waitForBoardState('ready');
    await game.wait(DELAYS.spiritStep);
    assert.deepEqual(await vibes(game), [CUES.select.haptic, CUES.move.haptic], 'the Spirit\'s move: no vibration');

    // A refused pick, many times quickly: one rustle-buzz, not a buzzing.
    await game.wait(120);
    await page.evaluate((s) => {
      const el = document.querySelector(`#al-board [data-square="${s}"]`);
      for (let i = 0; i < 8; i++) el.click();
    }, sq(7, 0)); // a1 is boxed in behind b2
    const after = await vibes(game);
    assert.equal(after.filter((v) => v === CUES.invalid.haptic).length, 1, `refusals: ${JSON.stringify(after)}`);
    assert.equal((await plays(game)).filter((id) => id === 'invalid-sound').length, 1, 'and one soft rustle');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('a browser that refuses to vibrate: nothing breaks and Settings explains', async () => {
    const game = await open(harness, { kind: 'refuse' });
    const { page } = game;
    await game.goTo('#/settings', 'settings-screen');
    await page.locator('#settings-screen label[for="haptics-toggle"]').click();
    assert.equal(await page.locator('#haptics-hint').textContent(), HAPTICS_HINTS.refused);
    await game.goTo('#/shells-feathers/play/two', 'game-screen');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    assert.equal((await game.waitForResult()).title, 'Player 1 Wins!');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('mute and rapid input: no effects when muted; a double click is one move with one sound', async () => {
    const game = await open(harness, { storage: withHaptics(true) });
    const { page } = game;
    await game.goTo('#/settings', 'settings-screen');
    await page.locator('#settings-screen label[for="audio-toggle"]').click(); // effects off
    await game.goTo('#/shells-feathers/play/two', 'game-screen');
    const before = (await plays(game)).length;
    await page.locator('.cell[data-index="4"]').dblclick();
    assert.deepEqual(await game.cells(), ['', '', '', '', '🐚', '', '', '', ''], 'one move, not two');
    assert.equal((await plays(game)).length, before, 'muted: nothing plays');
    assert.equal((await vibes(game)).length, 1, 'vibration is its own setting, and one move vibrates once');

    await game.goTo('#/settings', 'settings-screen');
    await page.locator('#settings-screen label[for="audio-toggle"]').click(); // effects on
    await game.startNew('#/shells-feathers/play/two', 'game-screen');
    const mark = (await plays(game)).length;
    await page.locator('.cell[data-index="4"]').dblclick();
    assert.deepEqual((await plays(game)).slice(mark).filter((id) => id === 'player-select'), ['player-select'], 'a double click sounds once');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('pausing, a hidden page and leaving drop queued effects and stop vibration', async () => {
    const game = await open(harness, { storage: withHaptics(true) });
    const { page } = game;
    await game.goTo('#/acorns-leaves/play/two', 'al-game-screen');
    for (const path of TO_DOUBLE_JUMP) await game.playPath(path);
    await game.playPath(DOUBLE_JUMP.slice(0, 2));
    // The last landing and opening the menu in one go: the chirp queued for
    // the multi-jump never plays, and the vibration is stopped.
    await page.evaluate((s) => {
      document.querySelector(`#al-board [data-square="${s}"]`).click();
      document.getElementById('al-menu-button').click();
    }, DOUBLE_JUMP[2]);
    await game.wait(CUES.multi.delay + 300);
    assert.deepEqual((await game.checkersView()).captured, { acorn: 2, leaf: 0 }, 'the move itself was played');
    assert.ok(!(await plays(game)).includes('multi-sound'), 'no chirp behind the menu');
    assert.equal((await vibes(game)).at(-1), 0, 'vibration stopped when the menu opened');
    await game.press('Resume');

    // Leaving: the same.
    await game.goTo('#/acorns-leaves/play/two', 'al-game-screen');
    for (const path of TO_DOUBLE_JUMP) await game.playPath(path);
    await game.playPath(DOUBLE_JUMP.slice(0, 2));
    await page.evaluate((s) => {
      document.querySelector(`#al-board [data-square="${s}"]`).click();
      window.location.hash = '#/';
    }, DOUBLE_JUMP[2]);
    await game.waitForScreen('hub-screen');
    await game.wait(CUES.multi.delay + 300);
    assert.ok(!(await plays(game)).includes('multi-sound'), 'no chirp after leaving');

    // A hidden page: nothing at all until it is shown again.
    await game.goTo('#/shells-feathers/play/two', 'game-screen');
    const setHidden = (hidden) => page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await setHidden(true);
    const quiet = { p: (await plays(game)).length, v: (await vibes(game)).length };
    await page.evaluate(() => document.querySelector('.cell[data-index="0"]').click());
    assert.deepEqual([(await plays(game)).length, (await vibes(game)).length], [quiet.p, quiet.v]);
    assert.deepEqual(await game.cells(), ['', '', '', '', '', '', '', '', ''], 'a hidden page is paused: the tap is not a move');
    await setHidden(false);
    await game.wait(120);
    await game.tap(1);
    assert.equal((await plays(game)).at(-1), 'player-select', 'shown again, feedback returns');
    assert.equal((await vibes(game)).length, quiet.v + 1);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('animations: leaf-like settle where motion is allowed, none under reduced motion; they never hold up a move', async () => {
    const save = (motion) => ({ [V2_KEY]: JSON.stringify({ version: 2, settings: { motion } }) });
    // Records every fx- class put on a square.
    const watch = (game) => game.page.evaluate(() => {
      window.__fx = [];
      // Each record's oldValue is the class list before it; the value after
      // it is the next record's oldValue for that element (or the current).
      new window.MutationObserver((list) => {
        list.forEach((m, i) => {
          const next = list.slice(i + 1).find((n) => n.target === m.target);
          const after = (next ? next.oldValue ?? '' : m.target.className).split(' ');
          const before = (m.oldValue ?? '').split(' ');
          for (const c of after.filter((x) => x.startsWith('fx-') && !before.includes(x))) {
            window.__fx.push({ c, square: m.target.dataset.square ?? m.target.dataset.index, fog: after.includes('is-fog') });
          }
        });
      }).observe(document.getElementById('game-container'), { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });
    const fx = (game) => game.page.evaluate(() => window.__fx);

    const full = await open(harness, { storage: save('full') });
    await full.goTo('#/acorns-leaves/play/two', 'al-game-screen');
    await watch(full);
    await full.tapSquare(sq(5, 2));
    await full.tapSquare(sq(4, 3));
    // Straight on, during the settle: the next side's move is taken.
    await full.tapSquare(sq(2, 1));
    await full.tapSquare(sq(3, 0));
    assert.deepEqual((await full.checkersView()).toMove, 'acorn', 'both moves played');
    assert.deepEqual((await fx(full)).map((f) => `${f.c}@${f.square}`), [`fx-land@${sq(4, 3)}`, `fx-land@${sq(3, 0)}`]);
    await full.wait(900);
    assert.equal(await full.page.locator('#al-board [class*="fx-"]').count(), 0, 'and the classes come off');
    await full.page.locator('#al-board [data-square="60"]').click(); // e1 can't move: refused
    assert.equal((await fx(full)).at(-1).c, 'fx-refuse');

    const reduced = await open(harness, { storage: save('reduce') });
    await reduced.goTo('#/acorns-leaves/play/two', 'al-game-screen');
    await watch(reduced);
    await reduced.playPath([sq(5, 2), sq(4, 3)]);
    await reduced.page.locator('#al-board [data-square="60"]').click();
    assert.deepEqual(await fx(reduced), [], 'reduced motion: no animation classes at all');
    assert.ok((await plays(reduced)).includes('piece-move'), 'but the sounds still come');

    // Fog against the Spirit: nothing animates on a fogged square.
    const fog = await open(harness, { storage: save('full') });
    await fog.goTo('#/acorns-leaves/fog/single', 'al-game-screen');
    await watch(fog);
    // After each tap, every new animation is on a square now in view (or a
    // hidden piece the try just found), never one still under the fog.
    const hiddenNow = (squares) => fog.page.evaluate((list) => list.filter((s) => {
      const el = document.querySelector(`#al-board [data-square="${s}"]`);
      return el.classList.contains('is-fog') && !el.classList.contains('is-found');
    }), squares);
    let seen = 0;
    for (let turn = 0; turn < 6; turn++) {
      await fog.waitForBoardState('ready');
      if (await fog.page.locator('.modal.active').count()) break; // the match is over
      const view = await fog.checkersView();
      const movable = await fog.page.evaluate(() => [...document.querySelectorAll('#al-board .can-move')].map((el) => Number(el.dataset.square)));
      const from = (view.mustJump.length ? view.mustJump : movable)[0];
      for (const s of [from, 'next']) {
        const target = s === 'next' ? (await fog.checkersView()).destinations[0] : s;
        if (target === undefined) break; // the pick found a hidden piece: the turn is over
        await fog.tapSquare(target);
        const drawn = (await fx(fog)).slice(seen);
        seen += drawn.length;
        const moved = drawn.filter((f) => f.c !== 'fx-refuse').map((f) => f.square);
        assert.deepEqual(await hiddenNow(moved), [], `no animation on a hidden square (${JSON.stringify(drawn)})`);
      }
    }
    assert.ok((await fx(fog)).some((f) => f.c === 'fx-land'), 'the player\'s own moves animate');
    for (const g of [full, reduced, fog]) assert.deepEqual(g.pageErrors, []);
  });
});
