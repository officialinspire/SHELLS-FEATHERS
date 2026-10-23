// The Spirit of the Woods hub: game cards, How to Play, Settings and Your
// Path entry points, the route from game selection to match and back, browser
// navigation, keyboard play, and phone/desktop layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devices } from 'playwright';
import { startHarness, openGame } from '../helpers/game-page.mjs';

const SINGLE_RESULT_TITLES = ['Victory!', 'Wisdom Gained', 'Balance Achieved'];

const names = (locator) => locator.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') || el.textContent.trim()));

test('game hub', { timeout: 300_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('Shells & Feathers is playable; Acorns & Leaves is only a preview with no way to start it', async () => {
    const game = await openGame(harness);
    const { page } = game;
    assert.equal(await game.activeScreen(), 'hub-screen');
    assert.equal(await page.title(), 'Spirit of the Woods');

    const sf = page.locator('article', { has: page.locator('#sf-card-title') });
    assert.equal(await sf.locator('.badge').textContent(), 'Ready to play');
    assert.deepEqual(await names(sf.getByRole('link')), ['Play Shells & Feathers', 'How to Play Shells & Feathers']);
    assert.equal(await sf.getByRole('link', { name: 'Play Shells & Feathers', exact: true }).getAttribute('href'), '#/shells-feathers');

    const al = page.locator('article', { has: page.locator('#al-card-title') });
    assert.match(await al.locator('.badge').textContent(), /^Preview/);
    assert.match(await al.textContent(), /can't be played yet/);
    assert.deepEqual(await names(al.getByRole('link')), ['How to Play Acorns & Leaves'], 'only a How to Play link');
    assert.equal(await al.getByRole('button').count(), 0, 'no buttons on the preview card');
    assert.equal(await al.locator('.btn-primary').count(), 0, 'nothing styled as a primary (play) action');
    assert.equal(await al.evaluate((el) => getComputedStyle(el).borderTopStyle), 'dashed');
    assert.equal(await page.locator('a[href*="acorns-leaves/play"], [data-action*="acorns"]').count(), 0);

    const preview = al.locator('[data-checkers-preview]');
    assert.equal(await preview.getAttribute('aria-hidden'), 'true', 'the picture is decorative');
    assert.equal(await preview.locator('.checkers-square').count(), 64);
    assert.equal(await preview.locator('.checkers-square', { hasText: '🌰' }).count(), 12);
    assert.equal(await preview.locator('.checkers-square', { hasText: '🍂' }).count(), 12);

    const more = page.locator('nav.hub-links').getByRole('link');
    assert.deepEqual((await names(more)).map((n) => n.replace(/^\S+\s/, '')), ['Settings', 'Your Path']);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('How to Play pages for both games', async () => {
    const game = await openGame(harness);
    const { page } = game;
    await game.press('How to Play Shells & Feathers');
    await game.waitForScreen('sf-howto-screen');
    assert.match(await page.locator('#sf-howto-screen').textContent(), /three of your pieces in a row/);
    await game.press('Play Shells & Feathers', { exact: true });
    await game.waitForScreen('sf-setup-screen');

    // From the setup screen, How to Play and Back return to the setup screen.
    await game.press('How to Play');
    await game.waitForScreen('sf-howto-screen');
    await game.press('Back');
    await game.waitForScreen('sf-setup-screen');

    await game.goHome();
    await game.press('How to Play Acorns & Leaves');
    await game.waitForScreen('al-howto-screen');
    const screen = page.locator('#al-howto-screen');
    assert.match(await screen.locator('.notice-preview').textContent(), /can't be played yet/);
    assert.deepEqual(await names(screen.locator('a, button')), ['← Back'], 'no play control on the preview page');
    assert.equal(await screen.locator('.checkers-square').count(), 64);
    assert.doesNotMatch(await screen.textContent(), /traditional|native|tribe|sacred/i);
    assert.equal(await page.title(), 'Acorns & Leaves (Preview) · Spirit of the Woods');
    await game.press('Back');
    await game.waitForScreen('hub-screen');

    await game.goTo('#/acorns-leaves', 'al-howto-screen');
    assert.equal(await page.evaluate(() => location.hash), '#/acorns-leaves/how-to-play');
    await game.goTo('#/acorns-leaves/play', 'hub-screen');
    assert.equal(await page.evaluate(() => location.hash), '#/', 'no play route for the preview');
  });

  await t.test('full trip: hub, setup, match, result, play again, change mode, other mode, all games, settings, Your Path', async () => {
    const game = await openGame(harness);
    const { page } = game;
    await game.newMatch('single', { difficulty: 'Gentle' });
    assert.equal(await page.title(), 'Shells & Feathers: vs the Spirit · Spirit of the Woods');
    const first = await game.playFirstEmptyUntilResult();
    assert.ok(SINGLE_RESULT_TITLES.includes(first.title), first.title);
    assert.equal(await game.turnText(), first.title, 'turn line shows the result');

    await game.press('Play Again');
    await game.waitForTurn('Your Turn');
    assert.deepEqual(await game.cells(), Array(9).fill(''));

    await game.press('Change Mode');
    await game.waitForScreen('sf-setup-screen');
    await game.startMatch('two');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    assert.equal((await game.waitForResult()).title, 'Player 1 Wins!');
    await game.press('All Games');
    await game.waitForScreen('hub-screen');

    await game.press('Settings');
    await game.waitForScreen('settings-screen');
    await game.press('Back');
    await game.waitForScreen('hub-screen');

    await game.press('Your Path');
    await game.waitForScreen('path-screen');
    assert.equal(await page.locator('#total-games').textContent(), '2');
    const achievement = (title) => page.locator('.achievement', { hasText: title });
    for (const title of ['First Game', 'Shared Board']) assert.match(await achievement(title).getAttribute('class'), /is-unlocked/, title);
    for (const title of ['Steady Hand', 'Ten Games']) assert.match(await achievement(title).getAttribute('class'), /is-locked/, title);
    const gentleWon = first.title === 'Victory!';
    assert.match(await achievement('Gentle Win').getAttribute('class'), gentleWon ? /is-unlocked/ : /is-locked/);
    assert.equal(await page.locator('#achievement-count').textContent(), `(${gentleWon ? 3 : 2} of 6)`);
    await game.press('Back');
    await game.waitForScreen('hub-screen');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('browser Back/Forward, reload, deep links and unknown links', async () => {
    const game = await openGame(harness);
    const { page } = game;
    await game.newMatch('two');
    await game.tap(0);

    await page.goBack();
    await game.waitForScreen('sf-setup-screen');
    assert.equal(await page.title(), 'Shells & Feathers · Spirit of the Woods');
    await page.goForward();
    await game.waitForScreen('game-screen');
    assert.deepEqual(await game.cells(), Array(9).fill(''), 'Forward starts a fresh match');
    assert.match(await game.turnText(), /^Player 1's Turn/);
    await page.goBack();
    await game.waitForScreen('sf-setup-screen');
    await page.goBack();
    await game.waitForScreen('hub-screen');
    assert.equal(await page.title(), 'Spirit of the Woods');

    // "Change Mode" steps back through history instead of piling up entries,
    // so Forward returns to the match.
    await game.openShellsFeathers();
    await game.startMatch('two');
    const historyLength = await page.evaluate(() => history.length);
    await game.press('Change Mode');
    await game.waitForScreen('sf-setup-screen');
    assert.equal(await page.evaluate(() => history.length), historyLength);
    await page.goForward();
    await game.waitForScreen('game-screen');
    await page.goBack();
    await game.waitForScreen('sf-setup-screen');
    await game.press('All games');
    await game.waitForScreen('hub-screen');

    // Back while the result dialog is open closes it with the match.
    await game.newMatch('two');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.waitForResult();
    await page.goBack();
    await game.waitForScreen('sf-setup-screen');
    assert.equal(await game.modalOpen(), false);
    assert.equal(await page.locator('#game-screen').evaluate((el) => el.inert), false);

    await page.goto(`${game.base}/index.html#/shells-feathers/play/single`);
    await game.waitForScreen('game-screen');
    await game.waitForTurn('Your Turn');
    assert.match(await page.locator('#match-info').textContent(), /^Against the Spirit · Gentle/);
    await page.reload();
    await game.waitForScreen('game-screen');
    await game.tap(4);
    await game.waitForPieces(2);

    await page.goto(`${game.base}/index.html#/nowhere`);
    await game.waitForScreen('hub-screen');
    assert.equal(await page.evaluate(() => location.hash), '#/');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('keyboard only: reach the game, play two players to a win, use the result dialog', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    const active = () => page.evaluate(() => {
      const el = document.activeElement;
      return {
        label: el.getAttribute('aria-label') || el.textContent.trim().replace(/\s+/g, ' '),
        id: el.id,
        index: el.dataset?.index ?? null,
        inModal: Boolean(el.closest('#game-modal')),
        inBoard: Boolean(el.closest('#game-screen')),
        outline: getComputedStyle(el).outlineStyle,
      };
    });
    const tabTo = async (pattern) => {
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab');
        if (pattern.test((await active()).label)) return;
      }
      assert.fail(`never reached ${pattern} with Tab`);
    };

    await tabTo(/^Play Shells & Feathers$/);
    assert.equal((await active()).outline, 'solid', 'visible focus ring');
    await page.keyboard.press('Enter');
    await game.waitForScreen('sf-setup-screen');
    assert.equal((await active()).id, 'sf-setup-title', 'focus moves to the new screen');

    await tabTo(/Two Players/);
    await page.keyboard.press('Enter');
    await game.waitForScreen('game-screen');
    assert.equal((await active()).index, '0', 'focus lands on the board');

    // P1 0, P2 3, P1 1, P2 4, P1 2 using arrows and Enter/Space.
    for (const keys of [['Enter'], ['ArrowDown', 'Enter'], ['ArrowUp', 'ArrowRight', 'Space'], ['ArrowDown', 'Enter'], ['ArrowUp', 'ArrowRight', 'Enter']]) {
      for (const key of keys) await page.keyboard.press(key);
    }
    const cell = await active();
    assert.equal(cell.index, '2');
    assert.equal(cell.outline, 'solid');
    assert.deepEqual(await game.waitForResult(), { title: 'Player 1 Wins!', message: 'The shell spirit prevails' });
    assert.equal((await active()).label, 'Play Again', 'the dialog takes focus');
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      assert.equal((await active()).inBoard, false, 'focus never reaches the board behind the dialog');
    }

    await page.keyboard.press('Escape');
    assert.equal(await game.modalOpen(), false);
    assert.equal((await active()).label, 'Restart');
    assert.deepEqual(await game.cells(), ['🐚', '🐚', '🐚', '🪶', '🪶', '', '', '', '']);
    assert.match(await page.locator('.cell[data-index="0"]').getAttribute('aria-label'), /Row 1, column 1: shell, winning line/);

    await page.keyboard.press('Tab');
    assert.equal((await active()).label, 'Change Mode');
    await page.keyboard.press('Enter');
    await game.waitForScreen('sf-setup-screen');
    assert.deepEqual(game.pageErrors, []);
  });

  for (const [label, options] of [
    ['narrow phone (320×568, touch)', { device: devices['iPhone SE'] }],
    ['desktop (1280×800)', { viewport: { width: 1280, height: 800 } }],
  ]) {
    await t.test(`${label}: reach Shells & Feathers from the hub and play both modes to a result`, async () => {
      const game = await openGame(harness, options);
      const { page } = game;
      await game.newMatch('single');
      await game.settle();
      const height = await page.evaluate(() => [document.documentElement.scrollHeight, innerHeight]);
      assert.ok(height[0] <= height[1] + 1, `the whole match fits on screen (${height[0]}px of ${height[1]}px)`);
      const { title } = await game.playFirstEmptyUntilResult();
      assert.ok(SINGLE_RESULT_TITLES.includes(title), title);

      await game.press('Play Again');
      await game.waitForTurn('Your Turn');
      await game.press('Change Mode');
      await game.waitForScreen('sf-setup-screen');
      await game.startMatch('two');
      for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
      assert.equal((await game.waitForResult()).title, 'Player 1 Wins!');
      await game.press('View Board');
      assert.equal(await game.modalOpen(), false);
      assert.equal(await game.turnText(), 'Player 1 Wins!');
      await game.press('Change Mode');
      await game.waitForScreen('sf-setup-screen');
      await game.press('All games');
      await game.waitForScreen('hub-screen');
      assert.deepEqual(game.pageErrors, []);
    });
  }

  await t.test('every control on every screen can be reached, and is at least 44px, at phone, landscape and desktop sizes', async () => {
    const sizes = [[320, 568], [360, 640], [750, 340], [1280, 800]];
    const routes = [
      ['#/', 'hub-screen'],
      ['#/shells-feathers', 'sf-setup-screen'],
      ['#/shells-feathers/play/two', 'game-screen'],
      ['#/shells-feathers/how-to-play', 'sf-howto-screen'],
      ['#/acorns-leaves/how-to-play', 'al-howto-screen'],
      ['#/settings', 'settings-screen'],
      ['#/your-path', 'path-screen'],
    ];
    // Scrolls each control into view and checks it is on screen and not covered.
    const unreachable = (scope) => game.page.evaluate((selector) => {
      const problems = [];
      for (const el of document.querySelectorAll(`${selector} :is(a, button, input)`)) {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect();
        const onScreen = r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const name = el.getAttribute('aria-label') || el.textContent.trim() || el.name || el.id;
        if (!onScreen || !(hit === el || el.contains(hit))) {
          problems.push(`${name} @ ${Math.round(r.left)},${Math.round(r.top)}`);
        }
        // Comfortable touch target: at least 44×44 (a whole label counts for its input).
        const target = (el.closest('label') ?? el).getBoundingClientRect();
        if (target.width < 44 || target.height < 44) {
          problems.push(`${name} is only ${Math.round(target.width)}×${Math.round(target.height)}px`);
        }
      }
      if (document.documentElement.scrollWidth > innerWidth) problems.push(`page is ${document.documentElement.scrollWidth}px wide`);
      return problems;
    }, scope);

    let game;
    for (const [width, height] of sizes) {
      game = await openGame(harness, { viewport: { width, height } });
      for (const [hash, screen] of routes) {
        await game.goTo(hash, screen);
        await game.settle();
        assert.deepEqual(await unreachable('.screen.active'), [], `${width}×${height} ${hash}`);
      }
      // The result dialog, on the match screen.
      await game.goTo('#/shells-feathers/play/two', 'game-screen');
      for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
      await game.waitForResult();
      await game.settle();
      assert.deepEqual(await unreachable('#game-modal'), [], `${width}×${height} result dialog`);
      // The page itself never scrolls sideways.
      assert.equal(await game.page.evaluate(() => { window.scrollTo(5000, 0); return scrollX; }), 0);
      await game.page.context().close();
    }
  });
});
