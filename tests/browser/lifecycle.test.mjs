// Restart / leave / screen-switch behavior in the real page. Each test
// reproduces a stale-callback bug found in the v1 audit (docs/upgrade-plan.md)
// and checks it no longer happens, including when the player leaves with the
// browser's Back button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';

const SPIRIT_DELAY = 800;
const RESULT_DELAY = 800;

// Wise is deterministic: 0 -> 4, 1 -> 2, then 3 leaves 2-4-6 open, so the
// Spirit's next move (800ms later) wins.
async function reachSpiritWinningReply(game) {
  await game.newMatch('single', { difficulty: 'Wise' });
  await game.tap(0);
  await game.waitForPieces(2);
  await game.waitForTurn('Your Turn');
  await game.tap(1);
  await game.waitForPieces(4);
  await game.waitForTurn('Your Turn');
  assert.deepEqual(await game.cells(), ['🐚', '🐚', '🪶', '', '🪶', '', '', '', '']);
  await game.tap(3);
}

test('match lifecycle', { timeout: 180_000 }, async (t) => {
  const harness = await startHarness(t);

  for (const [how, leave] of [
    ['"Change Mode"', (game) => game.fromMenu('Change Mode')],
    ['the browser Back button', (game) => game.page.goBack()],
  ]) {
    await t.test(`A1: leaving with ${how} while the Spirit is about to win shows no result and records nothing`, async () => {
      const game = await openGame(harness);
      await reachSpiritWinningReply(game);
      await leave(game); // within the Spirit's 800ms

      await game.wait(SPIRIT_DELAY + RESULT_DELAY + 600);
      assert.equal(await game.activeScreen(), 'sf-setup-screen');
      assert.equal(await game.modalOpen(), false);
      assert.equal((await game.audioState('victory-sound')).paused, true);
      assert.deepEqual(await game.pathRecords(), { wins: '0', draws: '0', losses: '0', games: '0', twoPlayer: 'Player 1 wins: 0 · Player 2 wins: 0 · Draws: 0', earlier: '' });

      // The next match starts clean.
      await game.newMatch('single');
      assert.deepEqual(await game.cells(), Array(9).fill(''));
      assert.deepEqual(game.pageErrors, []);
    });
  }

  await t.test('A2: "Restart" right after a win keeps the old result dialog closed', async () => {
    const game = await openGame(harness);
    await game.newMatch('two');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.fromMenu('Restart'); // before the 800ms result delay

    await game.wait(RESULT_DELAY + 600);
    assert.equal(await game.modalOpen(), false);
    assert.deepEqual(await game.cells(), Array(9).fill(''));
    assert.match(await game.turnText(), /^Player 1's Turn/);
    await game.tap(4);
    assert.equal((await game.cells())[4], '🐚', 'new board is playable');
  });

  for (const [how, leave, screen] of [
    ['"Change Mode"', (game) => game.fromMenu('Change Mode'), 'sf-setup-screen'],
    ['the browser Back button', (game) => game.page.goBack(), 'sf-setup-screen'],
    ['a typed URL (hub)', (game) => game.goTo('#/'), 'hub-screen'],
  ]) {
    await t.test(`A2b: leaving with ${how} right after a win keeps the result dialog away`, async () => {
      const game = await openGame(harness);
      await game.newMatch('two');
      for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
      await leave(game);
      await game.wait(RESULT_DELAY + 600);
      assert.equal(await game.activeScreen(), screen);
      assert.equal(await game.modalOpen(), false);
      // The finished game still counts.
      assert.deepEqual(await game.pathRecords(), { wins: '0', draws: '0', losses: '0', games: '0', twoPlayer: 'Player 1 wins: 1 · Player 2 wins: 0 · Draws: 0', earlier: '' });
    });
  }

  await t.test('A3: after a restart the Spirit waits its full delay (no timer carried over)', async () => {
    const game = await openGame(harness);
    await game.newMatch('single');
    await game.tap(0);
    await game.wait(100);
    await game.fromMenu('Restart');
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

  await t.test('M1/M2: music keeps playing after draw -> Play Again; victory sound stops on Play Again', async () => {
    const game = await openGame(harness);
    await game.page.mouse.click(5, 5); // first click starts the music
    await game.newMatch('two');
    for (const i of [0, 1, 2, 4, 3, 5, 7, 6, 8]) await game.tap(i);
    assert.equal((await game.waitForResult()).title, 'Balance Achieved');
    await game.press('Play Again');
    await game.wait(1_000); // past the point where v1's leftover fade-out paused the music
    await game.waitForMusicPlaying();

    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.waitForResult();
    assert.equal((await game.audioState('victory-sound')).paused, false);
    await game.press('Play Again');
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
