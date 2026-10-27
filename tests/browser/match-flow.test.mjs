// Stage 15 in the page: best-of sets with their progress, records and next
// actions; Switch Sides; unfinished matches resumed after a reload (and old,
// corrupt or unfitting ones set aside with a word); two players in Fog
// resumed behind the handoff; the one-time tutorial, its isolated practice
// and its Fog step; and the result dialog on a small phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';
import { squareAt } from '../../src/games/acorns-leaves/engine.js';
import { PROBLEM_TEXT } from '../../src/shared/resume.js';

const sq = (row, col) => squareAt(row, col);
const V2_KEY = 'spiritOfTheWoods:v2';
const RESUME_KEY = 'spiritOfTheWoods:resume';
// Gentle picks the first open square when Math.random gives 0.
const FIRST_OPEN = 'Math.random = () => 0;';
const P1_WINS = [0, 3, 1, 4, 2];
const quiet = { [V2_KEY]: JSON.stringify({ version: 2, settings: { sfx: false, music: false } }) };

test('match flow', { timeout: 900_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('best of three, two players: progress in the header and the result; the set recorded apart from the games', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, storage: quiet });
    const { page } = game;
    await game.goTo('#/shells-feathers', 'sf-setup-screen');
    await page.locator('label:has(input[name="sf-length"][value="3"])').click();
    assert.match(await page.locator('#sf-length-hint').textContent(), /^Best of 3: up to three rounds; the first to win two takes the set\. A drawn round counts/);
    await game.press('Two Players');
    await game.waitForScreen('game-screen');
    assert.equal(await page.locator('#sf-set-line').textContent(), '. Round 1 of 3 · Player 1 0, Player 2 0');
    for (const i of P1_WINS) await game.tap(i);
    await game.waitForResult();
    assert.equal(await page.locator('#modal-set').textContent(), 'Round 2 of 3 · Player 1 1, Player 2 0');
    assert.equal(await page.locator('#modal-summary').isVisible(), false, 'no second score line in a set');
    assert.equal(await page.locator('#game-modal [data-action="switch-sides"]').isVisible(), false, 'two players swap seats instead');
    assert.deepEqual(await page.locator('#game-modal .modal-buttons :is(a, button)').evaluateAll((els) => els.filter((e) => !e.hidden).map((e) => e.textContent)),
      ['Next Round', 'Change Setup', 'Home']);
    await game.press('Next Round');
    assert.deepEqual(await game.cells(), Array(9).fill(''));
    for (const i of P1_WINS) await game.tap(i);
    await game.waitForResult();
    assert.equal(await page.locator('#modal-set').textContent(), 'Player 1 wins the set · Player 1 2, Player 2 0');
    assert.equal(await page.locator('#game-modal [data-action="play-again"]').textContent(), 'Play Again');
    await game.press('Home');
    await game.waitForScreen('hub-screen');
    const stats = JSON.parse(await game.storageItem(V2_KEY)).shellsFeathers.stats;
    assert.equal(stats.twoPlayer.player1Wins, 2, 'two games');
    assert.deepEqual(stats.sets.twoPlayer.bestOf3, { player1Wins: 1, player2Wins: 0, draws: 0 }, 'one set');
    assert.equal(await game.storageItem(RESUME_KEY), null, 'nothing left to resume');
    await game.goTo('#/your-path', 'path-screen');
    assert.deepEqual(await page.locator('#sf-set-records li').allTextContents(), ['two players, best of 3: Player 1 1, Player 2 0, drawn 0']);
    assert.deepEqual(await page.locator('#al-set-records li').allTextContents(), ['No sets finished yet. Choose Best of 3 or Best of 5 on the game’s screen.']);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('against the Spirit: Switch Sides plays the other pieces and keeps the score; the setup screen shows the switch', async () => {
    const game = await openGame(harness, { viewport: { width: 390, height: 844 }, storage: quiet, initScript: FIRST_OPEN });
    const { page } = game;
    await game.goTo('#/shells-feathers', 'sf-setup-screen');
    await page.locator('label:has(input[name="sf-length"][value="3"])').click();
    await game.press('Play the Spirit');
    await game.waitForScreen('game-screen');
    for (const i of [4, 1, 7]) {
      await game.waitForTurn('Your Turn');
      await game.tap(i);
    }
    assert.equal((await game.waitForResult()).title, 'Victory!');
    await game.press('Switch Sides');
    assert.match(await page.locator('#match-info').textContent(), /You play Feather\. Round 2 of 3 · You 1, the Spirit 0$/);
    await game.fromMenu('Change Mode');
    await game.waitForScreen('sf-setup-screen');
    assert.equal(await page.locator('input[name="sf-symbol"][value="feather"]').isChecked(), true);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('resume: a reload mid-match comes back exactly, the Spirit finishes its turn once; Discard and Play Again leave nothing', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, storage: quiet, fakeClock: true });
    const { page } = game;
    await game.goTo('#/acorns-leaves', 'al-setup-screen');
    await page.locator('label:has(input[name="al-length"][value="3"])').click();
    await game.press('Play the Spirit');
    await game.waitForScreen('al-game-screen');
    await game.playPath([sq(5, 2), sq(4, 3)]);
    const rows = await game.checkersRows();
    await page.reload();
    await game.waitForScreen('al-game-screen');
    assert.equal(await page.evaluate(() => window.location.hash), '#/acorns-leaves/resume');
    assert.deepEqual(await game.checkersRows(), rows, 'the position as it was');
    assert.equal((await game.checkersView()).state, 'waiting', 'the Spirit still to move');
    assert.match(await game.checkersStatus(), /^Match resumed\. You moved from c3 to d4\./);
    assert.match(await page.locator('#al-set-line').textContent(), /Round 1 of 3 · You 0, the Spirit 0$/);
    await page.clock.runFor(10_000);
    const after = await game.checkersRows();
    assert.notDeepEqual(after, rows);
    assert.equal(after.join('').replace(/\./g, '').length, rows.join('').replace(/\./g, '').length, 'one quiet Spirit move');
    assert.equal(JSON.parse(await game.storageItem(RESUME_KEY)).acornsLeaves.moves.length, 2);

    // The setup screen offers it; Discard removes it.
    await game.goTo('#/acorns-leaves', 'al-setup-screen');
    assert.match(await page.locator('#al-resume-text').textContent(), /^Classic against the Spirit \(Gentle\), you play Acorns · Round 1 of 3 · You 0, the Spirit 0 · 2 moves played this round$/);
    await game.goTo('#/', 'hub-screen');
    await page.locator('[data-hub-game="al"]').click();
    assert.equal(await page.locator('#al-hub-resume').isVisible(), true);
    await game.goTo('#/acorns-leaves', 'al-setup-screen');
    await game.press('Discard');
    assert.equal(await page.locator('#al-resume').isVisible(), false);
    assert.equal(await game.storageItem(RESUME_KEY), null);
    await game.goTo('#/', 'hub-screen');
    assert.equal(await page.locator('#al-hub-resume').isVisible(), false);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('resume: two players in Fog come back behind the handoff, nothing drawn until the player to move is ready', async () => {
    const game = await openGame(harness, { viewport: { width: 390, height: 844 }, storage: quiet });
    const { page } = game;
    await game.goTo('#/acorns-leaves/fog/two', 'al-game-screen');
    await game.press("Show the Acorns' board");
    await game.playPath([sq(5, 2), sq(4, 3)]);
    await page.reload();
    await page.locator('#al-handoff').waitFor();
    assert.equal(await page.locator('#al-handoff-title').textContent(), "Leaves' turn");
    assert.equal(await page.locator('#al-board [data-piece]').count(), 0);
    assert.equal(await page.locator('#al-last').textContent(), 'None yet.', 'nothing about the last move (as at any handoff)');
    await game.press("Show the Leaves' board");
    assert.ok(await page.locator('#al-board .is-fog').count() > 0, 'the Leaves see only their view');
    assert.equal(await page.locator(`#al-board [data-square="${sq(4, 3)}"] [data-piece]`).count() + await page.locator(`#al-board [data-square="${sq(4, 3)}"][data-piece]`).count(), 0, 'the acorn that moved is not shown to the Leaves');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('resume: corrupt, other-version and unfitting saves are set aside, with a word on the setup screen', async () => {
    const cases = [
      ['{oops', 'corrupt', 'acorns-leaves', 'al'],
      [JSON.stringify({ version: 7, shellsFeathers: { mode: 'two' } }), 'version', 'shells-feathers', 'sf'],
      [JSON.stringify({ version: 1, shellsFeathers: { mode: 'two', difficulty: 'easy', player1Symbol: 'shell', set: { length: 1, rounds: [] }, moves: [4, 4] } }), 'invalid', 'shells-feathers', 'sf'],
    ];
    for (const [raw, problem, slug, p] of cases) {
      const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, storage: { ...quiet, [RESUME_KEY]: raw } });
      const { page } = game;
      await game.goTo(`#/${slug}/resume`, `${p}-setup-screen`);
      assert.equal(await page.locator(`#${p}-resume-note`).textContent(), PROBLEM_TEXT[problem], problem);
      assert.equal(await page.locator(`#${p}-resume`).isVisible(), false);
      assert.equal(await game.storageItem(RESUME_KEY), null, `${problem}: removed`);
      await game.goTo('#/', 'hub-screen');
      await game.goTo(`#/${slug}`, `${p}-setup-screen`);
      assert.equal(await page.locator(`#${p}-resume-note`).isVisible(), false, 'said once');
      assert.deepEqual(game.pageErrors, []);
    }
  });

  await t.test('tutorial: offered once, skippable, practised apart from everything saved; the Fog step shows only what the acorns see', async () => {
    const game = await openGame(harness, { viewport: { width: 390, height: 844 }, storage: quiet });
    const { page } = game;
    await game.goTo('#/shells-feathers', 'sf-setup-screen');
    assert.equal(await page.locator('#sf-tutorial-card').isVisible(), true);
    await page.locator('#sf-tutorial-card').getByRole('button', { name: 'Skip' }).click();
    assert.equal(await page.locator('#sf-tutorial-card').isVisible(), false);
    await page.reload();
    await game.waitForScreen('sf-setup-screen');
    assert.equal(await page.locator('#sf-tutorial-card').isVisible(), false, 'skipped stays skipped');

    await game.goTo('#/acorns-leaves', 'al-setup-screen');
    const saved = JSON.parse(await game.storageItem(V2_KEY));
    await game.press('Try the tutorial');
    await game.waitForScreen('tutorial-screen');
    const tap = (s) => page.locator(`#practice-board [data-practice="${s}"]`).click();
    const hint = () => page.locator('#tutorial-hint').textContent();
    await tap(sq(5, 2));
    await tap(sq(4, 3));
    assert.match(await hint(), /^Moved\./);
    await game.press('Next');
    await tap(sq(6, 5));
    assert.equal(await hint(), 'You must capture: choose a ringed piece instead.');
    await tap(sq(5, 2));
    await tap(sq(3, 4));
    await game.press('Next');
    await tap(sq(1, 2));
    await tap(sq(0, 1));
    assert.match(await hint(), /^Crowned/);
    await game.press('Next');
    // Fog: hidden leaves are under the mist and never named.
    const labels = () => page.locator('#practice-board button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    const before = await labels();
    assert.ok(before.filter((l) => l.endsWith('in the mist')).length > 10);
    assert.ok(!before.some((l) => /leaf/.test(l)), 'no leaf in view yet');
    assert.doesNotMatch(await page.locator('#tutorial-screen').textContent(), /f4|b6/);
    await tap(sq(6, 5));
    await tap(sq(5, 4));
    assert.equal(await hint(), 'A leaf came out of the mist on f4, next to your acorn.');
    assert.equal((await labels()).filter((l) => /leaf/.test(l)).length, 1, 'only the leaf that came into view');
    await game.press('Play');
    await game.waitForScreen('al-setup-screen');
    assert.equal(await page.locator('#al-tutorial-card').isVisible(), false, 'finished: not offered again');
    // Nothing else changed: records, achievements, unfinished matches.
    const now = JSON.parse(await game.storageItem(V2_KEY));
    assert.deepEqual(now.acornsLeaves.stats, saved.acornsLeaves.stats);
    assert.deepEqual(now.acornsLeaves.achievements, saved.acornsLeaves.achievements);
    assert.deepEqual(now.tutorials, { shellsFeathers: 'skipped', acornsLeaves: 'done' });
    assert.equal(await game.storageItem(RESUME_KEY), null);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('the result dialog fits a small phone, and each action is reachable', async () => {
    for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
      const game = await openGame(harness, { viewport, storage: quiet, initScript: FIRST_OPEN });
      const { page } = game;
      await game.goTo('#/shells-feathers', 'sf-setup-screen');
      await page.locator('label:has(input[name="sf-length"][value="5"])').click();
      await game.startNew('#/shells-feathers/play/single', 'game-screen');
      for (const i of [4, 1, 7]) {
        await game.waitForTurn('Your Turn');
        await game.tap(i);
      }
      await game.waitForResult();
      const problems = await page.evaluate(() => [...document.querySelectorAll('#game-modal .modal-content :is(a, button)')]
        .filter((el) => !el.hidden)
        .flatMap((el) => {
          el.scrollIntoView({ block: 'center' });
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return r.height >= 44 && r.right <= innerWidth && (hit === el || el.contains(hit)) ? [] : [`${el.textContent} ${Math.round(r.height)}`];
        }));
      assert.deepEqual(problems, [], `${viewport.width}×${viewport.height}`);
      assert.deepEqual(game.pageErrors, []);
    }
  });
});
