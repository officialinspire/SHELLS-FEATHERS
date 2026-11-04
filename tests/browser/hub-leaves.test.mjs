// Leaves drifting behind the hub (src/app/hub-leaves.js): a bounded,
// decorative, untouchable layer clipped to the screen; made when the hub
// shows and removed when it doesn't, so hub → game → hub never adds leaves
// or animations; held behind the start screen and while the page is hidden;
// none when motion is reduced (by the game's setting, or the device's under
// "Match device"); and a phone in portrait and landscape keeps its labels,
// taps and width.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';
import { leafCount } from '../../src/app/hub-leaves.js';

const V2_KEY = 'spiritOfTheWoods:v2';
const withMotion = (motion) => ({ [V2_KEY]: JSON.stringify({ version: 2, settings: { motion, sfx: false, music: false } }) });

// The leaves now: how many, their running animations, every animation on
// the page, and how the layer is set up.
const leaves = (page) => page.evaluate(() => {
  const layer = document.getElementById('hub-leaves');
  const style = getComputedStyle(layer);
  const all = document.getAnimations();
  return {
    count: layer.querySelectorAll('.drift-leaf').length,
    animations: all.filter((a) => a.effect?.target?.classList?.contains('drift-leaf')).length,
    total: all.length,
    hidden: layer.hidden,
    layer: {
      ariaHidden: layer.getAttribute('aria-hidden'),
      pointer: style.pointerEvents,
      position: style.position,
      overflow: style.overflow,
      behind: Number(style.zIndex) < Number(getComputedStyle(document.getElementById('game-container')).zIndex),
    },
  };
});

const setHidden = (page, hidden) => page.evaluate((h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

test('hub leaves', { timeout: 300_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('a bounded, decorative layer behind the hub, varied leaf by leaf', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, storage: withMotion('full') });
    const { page } = game;
    const now = await leaves(page);
    assert.equal(now.count, leafCount(1280));
    assert.equal(now.animations, now.count * 2, 'a fall and a sway each');
    assert.deepEqual(now.layer, {
      ariaHidden: 'true', pointer: 'none', position: 'fixed', overflow: 'hidden', behind: true,
    });
    // No two leaves alike: size, timing, sway and spin all differ.
    const props = await page.evaluate(() => [...document.querySelectorAll('.drift-leaf')]
      .map((el) => ['--size', '--fall', '--delay', '--sway', '--sway-time', '--spin'].map((p) => el.style.getPropertyValue(p)).join('|')));
    assert.equal(new Set(props).size, props.length);
    for (const name of ['--fall', '--delay', '--size']) {
      const values = await page.evaluate((p) => [...document.querySelectorAll('.drift-leaf')].map((el) => el.style.getPropertyValue(p)), name);
      assert.ok(new Set(values).size > values.length / 2, `${name} varies: ${values}`);
    }
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('hub → game → hub, again and again: never more leaves or animations', async () => {
    const game = await openGame(harness, { viewport: { width: 390, height: 844 }, storage: withMotion('full') });
    const { page } = game;
    await game.settle();
    const first = await leaves(page);
    assert.equal(first.count, leafCount(390));
    for (let round = 0; round < 6; round++) {
      const [hash, screen] = round % 2 ? ['#/acorns-leaves/play/two', 'al-game-screen'] : ['#/shells-feathers/play/two', 'game-screen'];
      await game.startNew(hash, screen);
      const away = await leaves(page);
      assert.deepEqual([away.count, away.animations, away.hidden], [0, 0, true], `round ${round}: none away from the hub`);
      await game.goTo('#/', 'hub-screen');
      await game.settle();
      const back = await leaves(page);
      assert.deepEqual([back.count, back.animations], [first.count, first.animations], `round ${round}: the same number again`);
      assert.ok(back.total <= first.total, `round ${round}: no animation left behind (${back.total} > ${first.total})`);
    }
    // Other screens off the hub too.
    for (const [hash, screen] of [['#/settings', 'settings-screen'], ['#/journal', 'journal-screen'], ['#/shells-feathers', 'sf-setup-screen']]) {
      await game.goTo(hash, screen);
      assert.equal((await leaves(page)).count, 0, screen);
    }
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('held behind the start screen and while the page is hidden', async () => {
    const game = await openGame(harness, { gate: true, viewport: { width: 390, height: 844 }, storage: withMotion('full') });
    const { page } = game;
    assert.equal((await leaves(page)).count, 0, 'none under the start screen');
    await page.evaluate(() => sessionStorage.setItem('spiritOfTheWoods:introSeen', '1'));
    await page.keyboard.press('Enter');
    await game.waitForScreen('hub-screen');
    assert.equal((await leaves(page)).count, leafCount(390), 'they begin with the hub');
    await setHidden(page, true);
    assert.equal((await leaves(page)).count, 0, 'none while hidden');
    await setHidden(page, false);
    assert.equal((await leaves(page)).count, leafCount(390));
  });

  await t.test('motion: none with Reduce, or with the device asking for less under Match device; Full shows them anyway', async () => {
    const cases = [
      ['reduce', 'no-preference', 0],
      ['system', 'reduce', 0],
      ['full', 'reduce', leafCount(390)],
      ['system', 'no-preference', leafCount(390)],
    ];
    for (const [motion, device, expected] of cases) {
      const game = await openGame(harness, { viewport: { width: 390, height: 844 }, storage: withMotion(motion) });
      await game.page.emulateMedia({ reducedMotion: device });
      await game.goTo('#/settings', 'settings-screen');
      await game.goTo('#/', 'hub-screen');
      const now = await leaves(game.page);
      assert.equal(now.count, expected, `${motion} with the device ${device}`);
      assert.equal(now.animations, expected * 2);
    }
    // Changed in Settings, it applies on the way back to the hub.
    const game = await openGame(harness, { viewport: { width: 390, height: 844 }, storage: withMotion('full') });
    await game.goTo('#/settings', 'settings-screen');
    await (await game.reveal('#settings-screen input[name="motion"][value="reduce"]')).check();
    await game.goTo('#/', 'hub-screen');
    assert.equal((await leaves(game.page)).count, 0);
  });

  await t.test('a phone in portrait and landscape: labels clear, taps work, nothing wider than the screen', async () => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      const game = await openGame(harness, {
        device: { viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, storage: withMotion('full'),
      });
      const { page } = game;
      const where = `${viewport.width}×${viewport.height}`;
      assert.ok((await leaves(page)).count > 0, where);
      const check = await page.evaluate(() => {
        const layer = document.getElementById('hub-leaves').getBoundingClientRect();
        // Every visible control and heading on the hub is what a tap at its
        // centre reaches: no leaf over it.
        const covered = [...document.querySelectorAll('#hub-screen :is(a, button, h1, h2, h3)')]
          .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
          .flatMap((el) => {
            const r = el.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            if (cy < 0 || cy > innerHeight) return [];
            const hit = document.elementFromPoint(cx, cy);
            return hit === el || el.contains(hit) ? [] : [`${el.textContent.trim()} → ${hit?.className}`];
          });
        return {
          overflowX: document.documentElement.scrollWidth - innerWidth,
          layer: [layer.left, layer.top, layer.width, layer.height].map(Math.round),
          covered,
        };
      });
      assert.equal(check.overflowX, 0, `${where}: no sideways scroll`);
      assert.deepEqual(check.layer, [0, 0, viewport.width, viewport.height], `${where}: the layer is the screen, clipped`);
      assert.deepEqual(check.covered, [], `${where}: labels and controls on top`);
      // Phones in portrait choose a game first (the chooser shows below 720px).
      const chooser = page.locator('#hub-screen [data-hub-game="al"]');
      if (await chooser.isVisible()) await chooser.tap();
      const play = page.locator('#al-hub-card a[href="#/acorns-leaves"]');
      await play.scrollIntoViewIfNeeded();
      await play.tap();
      await game.waitForScreen('al-setup-screen');
      assert.equal((await leaves(page)).count, 0, `${where}: leaves gone with the hub`);
      assert.deepEqual(game.pageErrors, []);
    }
  });
});
