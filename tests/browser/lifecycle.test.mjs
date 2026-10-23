// Restart / leave / screen-switch behavior in the real page. Each test
// reproduces a stale-callback bug found in the v1 audit (docs/upgrade-plan.md)
// and checks it no longer happens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';

const SPIRIT_DELAY = 800;
const RESULT_DELAY = 800;

test('match lifecycle', { timeout: 120_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('A1: leaving while the Spirit is about to win shows no result on the menu and records nothing', async () => {
    const game = await openGame(harness);
    await game.chooseSettings({ difficulty: 'Wise' });
    await game.press('Begin Journey');
    await game.press('Single Player');
    await game.waitForTurn('Your Turn');
    // Wise is deterministic: 0 -> 4, 1 -> 2, then 3 leaves 2-4-6 open for the Spirit.
    await game.tap(0);
    await game.waitForPieces(2);
    await game.waitForTurn('Your Turn');
    await game.tap(1);
    await game.waitForPieces(4);
    await game.waitForTurn('Your Turn');
    assert.deepEqual(await game.cells(), ['🐚', '🐚', '🪶', '', '🪶', '', '', '', '']);
    await game.tap(3);
    await game.press('Return Home'); // within the Spirit's 800ms

    await game.wait(SPIRIT_DELAY + RESULT_DELAY + 600);
    assert.equal(await game.activeScreen(), 'start-screen');
    assert.equal(await game.modalOpen(), false);
    assert.equal((await game.audioState('victory-sound')).paused, true);
    assert.deepEqual(await game.lifetimeStats(), { victories: '0', balance: '0', lessons: '0', total: '0' });

    // The next match starts clean.
    await game.press('Begin Journey');
    await game.press('Single Player');
    await game.waitForTurn('Your Turn');
    assert.deepEqual(await game.cells(), Array(9).fill(''));
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('A2: "New Journey" right after a win keeps the old result modal closed', async () => {
    const game = await openGame(harness);
    await game.press('Begin Journey');
    await game.press('Two Players');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.press('New Journey'); // before the 800ms result delay

    await game.wait(RESULT_DELAY + 600);
    assert.equal(await game.modalOpen(), false);
    assert.deepEqual(await game.cells(), Array(9).fill(''));
    assert.match(await game.turnText(), /^Player 1's Turn/);
    await game.tap(4);
    assert.equal((await game.cells())[4], '🐚', 'new board is playable');
  });

  await t.test('A2b: "Return Home" right after a win keeps the result modal off the menu', async () => {
    const game = await openGame(harness);
    await game.press('Begin Journey');
    await game.press('Two Players');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.press('Return Home');
    await game.wait(RESULT_DELAY + 600);
    assert.equal(await game.activeScreen(), 'start-screen');
    assert.equal(await game.modalOpen(), false);
    // The finished game still counts.
    assert.deepEqual(await game.lifetimeStats(), { victories: '1', balance: '0', lessons: '0', total: '1' });
  });

  await t.test('A3: after a restart the Spirit waits its full delay (no timer carried over)', async () => {
    const game = await openGame(harness);
    await game.press('Begin Journey');
    await game.press('Single Player');
    await game.waitForTurn('Your Turn');
    await game.tap(0);
    await game.wait(100);
    await game.press('New Journey');
    await game.wait(100);
    const replyMs = await game.page.evaluate(() => new Promise((resolve) => {
      const start = performance.now();
      document.querySelector('.cell[data-index="8"]').click();
      const poll = setInterval(() => {
        if (document.querySelectorAll('.cell.occupied').length === 2) {
          clearInterval(poll);
          resolve(performance.now() - start);
        }
      }, 5);
    }));
    assert.ok(replyMs >= SPIRIT_DELAY - 30, `Spirit replied after ${Math.round(replyMs)}ms`);
    await game.wait(SPIRIT_DELAY);
    assert.equal((await game.cells()).filter(Boolean).length, 2, 'exactly one Spirit move');
  });

  await t.test('M1/M2: music keeps playing after draw -> New Game; victory sound stops on New Game', async () => {
    const game = await openGame(harness);
    await game.page.mouse.click(5, 5); // first click starts the music
    await game.press('Begin Journey');
    await game.press('Two Players');
    for (const i of [0, 1, 2, 4, 3, 5, 7, 6, 8]) await game.tap(i);
    assert.equal((await game.waitForResult()).title, 'Balance Achieved');
    await game.press('New Game');
    await game.wait(1_000); // past the point where v1's leftover fade-out paused the music
    await game.waitForMusicPlaying();

    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.waitForResult();
    assert.equal((await game.audioState('victory-sound')).paused, false);
    await game.press('New Game');
    assert.equal((await game.audioState('victory-sound')).paused, true);
    await game.waitForMusicPlaying();
  });

  await t.test('M1: music toggled off and on quickly keeps playing', async () => {
    const game = await openGame(harness);
    await game.page.mouse.click(5, 5);
    await game.waitForMusicPlaying();
    await game.press('Settings');
    await game.page.click('label[for="music-toggle"]');
    await game.wait(200);
    await game.page.click('label[for="music-toggle"]');
    await game.wait(1_000); // past the end of the "off" fade-out
    assert.equal(await game.page.isChecked('#music-toggle'), true);
    await game.waitForMusicPlaying();
  });
});
