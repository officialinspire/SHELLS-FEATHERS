// The look shared by both games (Stage 7): player chips that mark whose move
// it is and who won, the result panel (winning piece, result, summary), and
// motion that is brief, never loops, and stops for reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';
import { squareAt } from '../../src/games/acorns-leaves/engine.js';

const sq = (row, col) => squareAt(row, col);
// Six quiet moves after which the Acorns must capture (see acorns-leaves.test.mjs).
const TO_DOUBLE_JUMP = [[44, 37], [17, 24], [51, 44], [10, 17], [60, 51], [24, 33]];

// The Shells & Feathers chips: [player 1, player 2], each as its marks and tag.
const chips = (game) => game.page.evaluate(() => [1, 2].map((n) => {
  const chip = document.getElementById(`sf-side-${n}`);
  const tag = chip.querySelector('.side-chip-tag');
  return {
    glyph: chip.querySelector('.side-chip-glyph').textContent,
    active: chip.classList.contains('is-active'),
    winner: chip.classList.contains('is-winner'),
    tag: tag.hidden ? '' : tag.textContent,
  };
}));

const panel = (game, id) => game.page.evaluate((modal) => ({
  emblem: [...document.querySelectorAll(`#${modal} .emblem-piece`)].map((el) => el.textContent),
  summary: document.querySelector(`#${modal} .modal-summary`).textContent,
}), id);

// Every running animation, with how long it runs in all.
const animations = (game) => game.page.evaluate(() => document.getAnimations().map((a) => {
  const timing = a.effect.getComputedTiming();
  return { name: a.animationName ?? a.transitionProperty, iterations: timing.iterations, total: timing.activeDuration };
}));

test('Spirit of the Woods polish', { timeout: 300_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('Shells & Feathers chips show whose move it is and who won, in words as well as color', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    await game.newMatch('two', { symbol: 'Feather' });
    assert.deepEqual(await chips(game), [
      { glyph: '🪶', active: true, winner: false, tag: 'To move' },
      { glyph: '🐚', active: false, winner: false, tag: '' },
    ]);
    await game.tap(0);
    await game.waitForTurn("Player 2's Turn");
    assert.deepEqual((await chips(game)).map((c) => c.tag), ['', 'To move']);
    for (const i of [3, 1, 4]) await game.tap(i);
    await game.tap(2); // Player 1 completes the top row
    assert.equal((await game.waitForResult()).title, 'Player 1 Wins!');
    assert.deepEqual(await chips(game), [
      { glyph: '🪶', active: false, winner: true, tag: 'Winner' },
      { glyph: '🐚', active: false, winner: false, tag: '' },
    ]);
    // The scores and labels the header always showed are still there.
    assert.deepEqual(await game.scores(), ['1', '0']);
    assert.equal(await game.page.locator('#player1-label').textContent(), 'Player 1: ');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('the Shells & Feathers result panel: winning piece, both pieces for a draw, and the session score', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    await game.newMatch('two');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.waitForResult();
    assert.deepEqual(await panel(game, 'game-modal'), { emblem: ['🐚'], summary: 'Score · Player 1 1 · Player 2 0' });
    assert.equal(await game.page.locator('#game-modal').getAttribute('aria-describedby'), 'modal-message modal-summary modal-achievements');

    await game.press('Play Again');
    await game.waitForTurn("Player 1's Turn");
    assert.deepEqual((await chips(game)).map((c) => c.tag), ['To move', ''], 'a new round clears the winner');
    // A draw: shells 0 2 3 7 8, feathers 1 4 5 6.
    for (const i of [0, 1, 2, 4, 3, 5, 7, 6, 8]) await game.tap(i);
    assert.equal((await game.waitForResult()).title, 'Balance Achieved');
    assert.deepEqual(await panel(game, 'game-modal'), { emblem: ['🐚', '🪶'], summary: 'Score · Player 1 1 · Player 2 0' });
    assert.deepEqual((await chips(game)).map((c) => c.tag), ['', ''], 'no winner after a draw');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('motion is brief and never loops: screens, pieces, the winning line, the result panel and capture rings', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const seen = [];
    const look = async (where) => {
      for (const a of await animations(game)) seen.push({ where, ...a });
    };
    await look('hub');
    await game.newMatch('two');
    await look('Shells & Feathers setup and match');
    for (const i of [0, 3, 1, 4]) await game.tap(i);
    await look('a piece placed');
    await game.tap(2);
    await game.page.locator('.cell.winner').first().waitFor();
    await look('the winning line');
    await game.waitForResult();
    await look('the result panel');
    await game.goTo('#/acorns-leaves/play/two', 'al-game-screen');
    for (const [from, to] of TO_DOUBLE_JUMP) await game.playPath([from, to]);
    assert.ok((await game.checkersView()).mustJump.includes(sq(5, 2)), 'pieces that must capture are ringed');
    await look('Acorns & Leaves, a capture to make');
    assert.ok(seen.length >= 4, `${seen.length} animations seen`);
    for (const a of seen) {
      assert.notEqual(a.iterations, Infinity, `${a.name} loops (${a.where})`);
      assert.ok(a.total <= 2000, `${a.name} runs ${a.total}ms (${a.where})`);
    }
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('reduced motion: nothing animates or eases, and every state still shows', async () => {
    const game = await openGame(harness, { device: { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' } });
    await game.newMatch('two');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.waitForResult();
    // The winning squares, the medallion and the panel itself are all still.
    assert.deepEqual(await animations(game), []);
    const transition = await game.page.locator('#game-modal .btn-primary').evaluate((el) => getComputedStyle(el).transitionDuration);
    assert.equal(transition, '0s', 'buttons change state at once');
    // Every state still shows: the winning line is gold and edged.
    assert.equal(await game.page.locator('.cell.winner').first().evaluate((el) => getComputedStyle(el).borderTopWidth), '3px');
    assert.deepEqual(game.pageErrors, []);
  });
});
