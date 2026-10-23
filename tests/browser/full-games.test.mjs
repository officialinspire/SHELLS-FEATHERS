// Complete games in both modes, at every difficulty, through the real UI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';

const SINGLE_RESULTS = {
  'Victory!': { message: 'The spirits smile upon you', stat: 'victories' },
  'Wisdom Gained': { message: 'The journey continues', stat: 'losses' },
  'Balance Achieved': { message: 'The spirits are in harmony', stat: 'draws' },
};

test('complete games', { timeout: 180_000 }, async (t) => {
  const harness = await startHarness(t);

  for (const difficulty of ['Gentle', 'Balanced', 'Wise']) {
    await t.test(`single player against ${difficulty}, played to a result`, async () => {
      const game = await openGame(harness);
      await game.newMatch('single', { difficulty });
      assert.match(await game.page.locator('#match-info').textContent(), new RegExp(`Against the Spirit · ${difficulty}`));

      // Human takes the first empty cell each turn until the game ends.
      const { title, message } = await game.playFirstEmptyUntilResult();
      assert.ok(SINGLE_RESULTS[title], `unexpected result "${title}"`);
      assert.equal(message, SINGLE_RESULTS[title].message);
      if (difficulty === 'Wise') {
        // Same game v1 produced in the audit: the greedy line loses to Wise.
        assert.equal(title, 'Wisdom Gained');
        assert.deepEqual(await game.cells(), ['🐚', '🐚', '🪶', '🐚', '🪶', '', '🪶', '', '']);
        assert.deepEqual(await game.scores(), ['0', '1']);
      }

      await game.press('All Games');
      await game.waitForScreen('hub-screen');
      const stats = await game.lifetimeStats();
      assert.equal(stats.total, '1');
      assert.equal(stats[SINGLE_RESULTS[title].stat], '1');
      assert.deepEqual(game.pageErrors, []);
    });
  }

  await t.test('two players: Player 2 wins, then a draw; session score and stats add up', async () => {
    const game = await openGame(harness);
    await game.newMatch('two');
    for (const i of [3, 0, 4, 1, 8, 2]) await game.tap(i);
    assert.deepEqual(await game.waitForResult(), { title: 'Player 2 Wins!', message: 'The feather spirit prevails' });
    assert.deepEqual(await game.scores(), ['0', '1']);

    await game.press('Play Again');
    for (const i of [0, 1, 2, 4, 3, 5, 7, 6, 8]) await game.tap(i);
    assert.deepEqual(await game.waitForResult(), { title: 'Balance Achieved', message: 'The spirits are in harmony' });
    assert.deepEqual(await game.scores(), ['0', '1']);

    await game.press('All Games');
    await game.waitForScreen('hub-screen');
    assert.deepEqual(await game.lifetimeStats(), { victories: '1', draws: '1', losses: '0', total: '2' });
  });

  await t.test('two players with Feather as Player 1', async () => {
    const game = await openGame(harness);
    await game.openShellsFeathers();
    await game.chooseOptions({ symbol: 'Feather' });
    await game.press('Two Players');
    await game.waitForTurn("Player 1's Turn 🪶");
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    assert.deepEqual(await game.waitForResult(), { title: 'Player 1 Wins!', message: 'The feather spirit prevails' });
  });
});
