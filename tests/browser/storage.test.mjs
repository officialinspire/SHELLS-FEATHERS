// Save-data migration and malformed storage in the real page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';

const V1_KEY = 'spiritOfTheWoodsStats';
const V2_KEY = 'spiritOfTheWoods:v2';

// Hub -> two-player match -> Player 1 wins -> back to the hub.
async function playTwoPlayerWin(game) {
  await game.newMatch('two');
  for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
  const result = await game.waitForResult();
  await game.press('All Games');
  await game.waitForScreen('hub-screen');
  return result;
}

test('save data', { timeout: 120_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('an existing v1 player keeps their records through the upgrade and after more games', async () => {
    const v1 = JSON.stringify({ wins: 4, losses: 2, draws: 3, totalGames: 9 });
    const game = await openGame(harness, { storage: { [V1_KEY]: v1 } });
    assert.deepEqual(await game.lifetimeStats(), { victories: '4', draws: '3', losses: '2', total: '9' });
    assert.equal(await game.storageItem(V1_KEY), v1, 'v1 record untouched by the migration');
    const v2 = JSON.parse(await game.storageItem(V2_KEY));
    assert.equal(v2.version, 2);
    assert.equal(v2.migratedFrom, 1);
    assert.deepEqual(v2.shellsFeathers.stats.legacy, { wins: 4, losses: 2, draws: 3, totalGames: 9 });

    await playTwoPlayerWin(game);
    const expected = { victories: '5', draws: '3', losses: '2', total: '10' };
    assert.deepEqual(await game.lifetimeStats(), expected);
    assert.deepEqual(JSON.parse(await game.storageItem(V1_KEY)), { wins: 5, losses: 2, draws: 3, totalGames: 10 });

    await game.page.reload();
    assert.deepEqual(await game.lifetimeStats(), expected);
    assert.deepEqual(game.pageErrors, []);
  });

  for (const [label, raw] of [['malformed JSON', '{bad json'], ['null', 'null'], ['an empty object', '{}']]) {
    await t.test(`v1 stats holding ${label}: the game loads and plays normally`, async () => {
      const game = await openGame(harness, { storage: { [V1_KEY]: raw } });
      assert.deepEqual(game.pageErrors, []);
      assert.deepEqual(await game.lifetimeStats(), { victories: '0', draws: '0', losses: '0', total: '0' });
      assert.equal((await playTwoPlayerWin(game)).title, 'Player 1 Wins!');
      assert.deepEqual(await game.lifetimeStats(), { victories: '1', draws: '0', losses: '0', total: '1' });
      if (raw !== '{}') assert.equal(await game.storageItem(`${V1_KEY}:corrupt`), raw, 'unreadable value kept');
      assert.deepEqual(game.pageErrors, []);
    });
  }

  await t.test('a corrupt v2 save is rebuilt from v1 without losing records', async () => {
    const game = await openGame(harness, {
      storage: { [V2_KEY]: '{"version":2,', [V1_KEY]: JSON.stringify({ wins: 1, losses: 1, draws: 1, totalGames: 3 }) },
    });
    assert.deepEqual(await game.lifetimeStats(), { victories: '1', draws: '1', losses: '1', total: '3' });
    assert.equal(await game.storageItem(`${V2_KEY}:corrupt`), '{"version":2,');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('storage that throws on every call: playable, and the result modal still appears', async () => {
    const game = await openGame(harness, {
      initScript: () => {
        Storage.prototype.getItem = () => { throw new DOMException('denied', 'SecurityError'); };
        Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
      },
    });
    assert.deepEqual(game.pageErrors, []);
    assert.equal((await playTwoPlayerWin(game)).title, 'Player 1 Wins!');
    assert.deepEqual(await game.lifetimeStats(), { victories: '1', draws: '0', losses: '0', total: '1' });
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('settings are saved: difficulty, symbol, sound and music survive a reload', async () => {
    const game = await openGame(harness);
    await game.openShellsFeathers();
    await game.chooseOptions({ difficulty: 'Wise', symbol: 'Feather' });
    await game.press('All games');
    await game.press('Settings');
    await game.page.click('label[for="audio-toggle"]');
    await game.page.click('label[for="music-toggle"]');
    await game.page.reload();

    assert.equal(await game.activeScreen(), 'settings-screen');
    const checked = (selector) => game.page.isChecked(selector);
    assert.equal(await checked('#audio-toggle'), false);
    assert.equal(await checked('#music-toggle'), false);
    await game.goHome();
    await game.openShellsFeathers();
    assert.equal(await checked('input[name="sf-difficulty"][value="hard"]'), true);
    assert.equal(await checked('input[name="sf-symbol"][value="feather"]'), true);
    assert.match(await game.page.locator('#sf-difficulty-hint').textContent(), /^Wise:/);

    await game.startMatch('single');
    assert.match(await game.page.locator('#match-info').textContent(), /Wise · You play 🪶 Feather/);
    await game.tap(4);
    assert.equal((await game.cells())[4], '🪶');
    await game.waitForTurn('Your Turn');
    assert.equal((await game.cells()).filter((c) => c === '🐚').length, 1, 'Spirit plays shell');
    assert.equal((await game.audioState('gameplay-music')).paused, true, 'music stays off');
  });
});
