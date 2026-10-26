import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';

test('the installed application shell loads and plays offline', { timeout: 60_000 }, async (t) => {
  const harness = await startHarness(t);
  const game = await openGame(harness);
  const { page } = game;
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
  assert.equal(manifest, 'manifest.webmanifest');
  const icons = await page.evaluate(async () => (await (await fetch('manifest.webmanifest')).json()).icons);
  assert.ok(icons.some((icon) => icon.sizes === '192x192' && icon.src.includes('acorn')));
  assert.ok(icons.some((icon) => icon.sizes === '512x512' && icon.src.includes('acorn')));

  await page.context().setOffline(true);
  await page.reload();
  assert.equal(await game.activeScreen(), 'hub-screen');
  await game.openShellsFeathers();
  await game.press('Two Players');
  await game.waitForTurn("Player 1's Turn");
  await game.tap(0);
  await game.waitForTurn("Player 2's Turn");
  assert.deepEqual(game.pageErrors, []);
});
