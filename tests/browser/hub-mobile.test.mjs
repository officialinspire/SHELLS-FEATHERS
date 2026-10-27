import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';

const layout = (page) => page.evaluate(() => {
  const hub = document.getElementById('hub-screen');
  const visible = (selector) => {
    const element = hub.querySelector(selector);
    if (!element.getClientRects().length) return null;
    const { top, bottom, left, right, height } = element.getBoundingClientRect();
    return { top, bottom, left, right, height };
  };
  return {
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    chooser: visible('.hub-chooser'),
    links: visible('.hub-links'),
  };
});

test('the mobile hub fits and both games remain reachable', { timeout: 120_000 }, async (t) => {
  const harness = await startHarness(t);
  for (const [width, height] of [[320, 568], [360, 560], [390, 664], [390, 844], [568, 320], [640, 360]]) {
    const game = await openGame(harness, { viewport: { width, height } });
    const { page } = game;
    await game.settle();
    for (const [id, title] of [['sf', 'Shells & Feathers'], ['al', 'Acorns & Leaves']]) {
      await page.locator(`[data-hub-game="${id}"]`).click();
      const chosen = page.locator(`#${id}-hub-card`);
      assert.equal(await chosen.isVisible(), true, `${width}×${height}: ${title} visible`);
      assert.equal(await page.locator(`#${id === 'sf' ? 'al' : 'sf'}-hub-card`).isVisible(), false);
      assert.equal(await page.locator(`[data-hub-game="${id}"]`).getAttribute('aria-pressed'), 'true');
      const size = await layout(page);
      assert.ok(size.scrollWidth <= width + 1, `${width}×${height}: horizontal fit ${size.scrollWidth}`);
      assert.ok(size.scrollHeight <= height + 1, `${width}×${height}: vertical fit ${size.scrollHeight}`);
      for (const part of ['chooser', 'links']) {
        assert.ok(size[part].top >= -1 && size[part].bottom <= height + 1, `${width}×${height}: ${part} on screen`);
      }
      const card = await chosen.boundingBox();
      assert.ok(card.y >= -1 && card.y + card.height <= height + 1, `${width}×${height}: ${title} card on screen`);
      assert.equal(await chosen.getByRole('link', { name: `Play ${title}`, exact: true }).isVisible(), true);
      assert.equal(await chosen.getByRole('link', { name: `How to Play ${title}` }).isVisible(), true);
    }
    assert.deepEqual(game.pageErrors, []);
    await page.context().close();
  }
});

test('game selection survives a visit and desktop shows both cards', { timeout: 120_000 }, async (t) => {
  const harness = await startHarness(t);
  const game = await openGame(harness, { viewport: { width: 390, height: 664 } });
  const { page } = game;
  await page.locator('[data-hub-game="al"]').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('[data-hub-game="sf"]').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('End');
  assert.equal(await page.locator('[data-hub-game="al"]').getAttribute('aria-pressed'), 'true');
  await game.press('Play Acorns & Leaves', { exact: true });
  await game.waitForScreen('al-setup-screen');
  await game.press('All games');
  await game.waitForScreen('hub-screen');
  assert.equal(await page.locator('#al-hub-card').isVisible(), true);
  await page.setViewportSize({ width: 900, height: 700 });
  assert.equal(await page.locator('#sf-hub-card').isVisible(), true);
  assert.equal(await page.locator('#al-hub-card').isVisible(), true);
  assert.equal(await page.locator('.hub-chooser').isVisible(), false);
  assert.deepEqual(game.pageErrors, []);
});
