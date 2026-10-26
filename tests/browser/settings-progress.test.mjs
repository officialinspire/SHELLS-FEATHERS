// Shared settings, sound and saved progress in the real page: nothing plays
// (or loads the music) before the first gesture, a refused play() is retried
// by the next one, volumes, mute and motion apply at once and survive a
// reload, the music pauses while the page is hidden, achievements are listed
// once, a v1 player is migrated, deleting data says exactly what it deletes,
// and blocked storage is reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, openGame } from '../helpers/game-page.mjs';

const V1_KEY = 'spiritOfTheWoodsStats';
const V2_KEY = 'spiritOfTheWoods:v2';

// Records every play() call; `window.__refuse` makes the next N refuse with
// NotAllowedError, as a browser does before a user gesture.
function recordPlays() {
  window.__plays = [];
  window.__refuse = 0;
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function recordedPlay() {
    if (window.__refuse > 0) {
      window.__refuse--;
      window.__plays.push(`refused:${this.id}`);
      return Promise.reject(new DOMException('No user gesture yet', 'NotAllowedError'));
    }
    window.__plays.push(this.id);
    return play.call(this);
  };
}

// Moves a range input as a person would: input events while dragging, one
// change event on release.
async function slide(page, id, value) {
  await page.evaluate(([el, v]) => {
    const input = document.getElementById(el);
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, value]);
}

const plays = (game) => game.page.evaluate(() => window.__plays);

test('settings and progress', { timeout: 300_000 }, async (t) => {
  const harness = await startHarness(t);

  await t.test('no sound, and no music download, before the first gesture; a refused play is retried by the next gesture', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, initScript: recordPlays });
    const requested = [];
    game.page.on('request', (req) => requested.push(new URL(req.url()).pathname));
    // A deep link straight into a match plays nothing either.
    await game.goTo('#/shells-feathers/play/two', 'game-screen');
    await game.wait(1_500);
    assert.deepEqual(await plays(game), []);
    assert.ok(!requested.includes('/gameplay.mp3'), 'the 7 MB music is not fetched before it is needed');

    await game.page.evaluate(() => { window.__refuse = 1; });
    await game.page.keyboard.press('Tab'); // a key press counts as a gesture
    await game.wait(300);
    assert.deepEqual(await plays(game), ['refused:gameplay-music']);
    assert.equal((await game.audioState('gameplay-music')).paused, true);
    assert.deepEqual(game.pageErrors, [], 'a refused play() is handled, never an unhandled rejection');

    await game.tap(4); // the next gesture retries the music, and the move sounds
    await game.waitForMusicPlaying();
    assert.deepEqual(await plays(game), ['refused:gameplay-music', 'gameplay-music', 'player-select']);
    assert.ok(requested.includes('/gameplay.mp3'));
    assert.deepEqual(game.missingAssets, []);
  });

  await t.test('volumes, sound switches and motion apply at once and survive a reload', async () => {
    const game = await openGame(harness, { viewport: { width: 390, height: 844 }, initScript: recordPlays });
    const { page } = game;
    await game.press('Settings');
    await game.waitForScreen('settings-screen');
    await game.waitForMusicPlaying(); // the tap on Settings started it
    await slide(page, 'music-volume', 70);
    assert.equal(await page.locator('#music-volume-value').textContent(), '70%');
    assert.equal(await page.locator('#music-volume').getAttribute('aria-valuetext'), '70%');
    assert.equal((await game.audioState('gameplay-music')).volume, 0.7, 'the music follows the slider at once');
    await slide(page, 'sfx-volume', 20);
    assert.equal(await page.evaluate(() => window.__plays.at(-1)), 'button-select', 'a sample at the new level');
    assert.equal((await game.audioState('button-select')).volume, 0.2);
    await page.locator('#settings-screen label', { has: page.locator('input[value="reduce"]') }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'reduce');
    assert.match(await page.locator('#motion-hint').textContent(), /^Reduce:/);

    await slide(page, 'music-volume', 0);
    assert.equal((await game.audioState('gameplay-music')).paused, true, 'volume 0 pauses the music');
    await slide(page, 'music-volume', 40);
    await game.waitForMusicPlaying(0.4);

    await page.reload();
    await game.waitForScreen('settings-screen');
    assert.equal(await page.inputValue('#music-volume'), '40');
    assert.equal(await page.inputValue('#sfx-volume'), '20');
    assert.equal(await page.locator('#sfx-volume-value').textContent(), '20%');
    assert.equal(await page.isChecked('input[name="motion"][value="reduce"]'), true);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'reduce');
    await page.mouse.click(5, 5);
    await game.waitForMusicPlaying(0.4);
    const saved = JSON.parse(await game.storageItem(V2_KEY)).settings;
    assert.deepEqual(saved, {
      sfx: true, music: true, sfxVolume: 20, musicVolume: 40, motion: 'reduce', haptics: false,
    });
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('motion: Reduce stops animations even where the device allows them; Full keeps them where it asks for less', async () => {
    const animationsAfterAMove = async (game) => {
      await game.goTo('#/shells-feathers/play/two', 'game-screen');
      await game.tap(4);
      return game.page.evaluate(() => document.getAnimations().length);
    };
    const save = (motion) => JSON.stringify({ version: 2, settings: { motion } });

    const allowed = await openGame(harness, { device: { viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' } });
    assert.ok(await animationsAfterAMove(allowed) > 0, 'the device allows motion: the piece settles in');
    const reduced = await openGame(harness, { device: { viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' }, storage: { [V2_KEY]: save('reduce') } });
    assert.equal(await animationsAfterAMove(reduced), 0, 'Reduce: nothing animates');

    const deviceAsks = await openGame(harness, { device: { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' } });
    assert.equal(await animationsAfterAMove(deviceAsks), 0, 'Match device follows the device');
    await deviceAsks.goTo('#/settings', 'settings-screen');
    assert.match(await deviceAsks.page.locator('#motion-hint').textContent(), /asks for reduced motion/);
    const full = await openGame(harness, { device: { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, storage: { [V2_KEY]: save('full') } });
    assert.ok(await animationsAfterAMove(full) > 0, 'Full: gentle motion anyway');
  });

  await t.test('mute, navigation and visibility: leaving a match stops its victory theme; switches silence at once; hidden pages pause the music', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, initScript: recordPlays });
    const { page } = game;
    await game.newMatch('two');
    await game.waitForMusicPlaying();
    const hide = (hidden) => page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await hide(true);
    assert.equal((await game.audioState('gameplay-music')).paused, true, 'paused at once while hidden');
    await hide(false);
    await game.waitForMusicPlaying();

    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.waitForResult();
    await page.waitForFunction(() => !document.getElementById('victory-sound').paused);
    // The music makes way for the victory theme: a one-second fade, then a pause.
    await page.waitForFunction(() => document.getElementById('gameplay-music').paused, null, { timeout: 5_000 });
    await game.goTo('#/settings', 'settings-screen');
    assert.equal((await game.audioState('victory-sound')).paused, true, 'leaving the match stops the victory theme');

    // Effects off: the volume sample (and every other effect) stays silent.
    await page.click('label[for="audio-toggle"]');
    const before = (await plays(game)).length;
    await slide(page, 'sfx-volume', 80);
    assert.deepEqual((await plays(game)).slice(before), [], 'no sample while effects are off');
    // Music: turning it on asks for it now, and off fades it out.
    await page.click('label[for="music-toggle"]');
    await page.click('label[for="music-toggle"]');
    await game.waitForMusicPlaying();
    await page.click('label[for="music-toggle"]');
    await page.waitForFunction(() => document.getElementById('gameplay-music').paused, null, { timeout: 5_000 });
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('achievements: listed in the result dialog once, kept after a reload, and shown in Your Path', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    await game.newMatch('two');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.waitForResult();
    assert.equal(await page.locator('#modal-achievements').textContent(), 'New achievements: First Game · Shared Board');
    await game.press('Play Again');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.waitForResult();
    assert.equal(await page.locator('#modal-achievements').textContent(), '', 'nothing new the second time');
    assert.equal(await page.locator('#modal-achievements').isVisible(), false);

    await page.reload();
    await game.goTo('#/shells-feathers/play/two', 'game-screen');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.waitForResult();
    assert.equal(await page.locator('#modal-achievements').textContent(), '', 'not again after a reload');

    await game.goTo('#/journal/shells-feathers', 'journal-screen');
    const item = (id) => page.locator(`#journal-panel .journal-entry[data-id="${id}"] .entry-state`);
    assert.match(await item('shared-board').textContent(), /^Unlocked \S+/);
    assert.equal(await item('first-win').textContent(), 'Locked', 'two-player wins are not yours');
    await game.goTo('#/your-path', 'path-screen');
    assert.equal(await page.locator('#sf-wins').textContent(), '0');
    assert.equal(await page.locator('#two-player-record').textContent(), 'Player 1 wins: 3 · Player 2 wins: 0 · Draws: 0');
    const stored = JSON.parse(await game.storageItem(V2_KEY)).shellsFeathers.achievements;
    assert.deepEqual(Object.keys(stored), ['first-game', 'shared-board']);
  });

  await t.test('a v1 player: games kept on their own, First Game unlocked "earlier", the v1 record untouched', async () => {
    const v1 = JSON.stringify({ wins: 6, losses: 2, draws: 4, totalGames: 12 });
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 }, storage: { [V1_KEY]: v1 } });
    await game.goTo('#/your-path', 'path-screen');
    const { page } = game;
    assert.match(await page.locator('#legacy-note').textContent(), /^Earlier games: 12 games from before results were kept by mode \(6 wins, which may include two-player wins/);
    await game.goTo('#/journal/shells-feathers', 'journal-screen');
    const state = (id) => page.locator(`#journal-panel .journal-entry[data-id="${id}"] .entry-state`).textContent();
    assert.equal(await state('first-game'), 'Unlocked before dates were kept');
    assert.equal(await state('ten-games'), 'Unlocked before dates were kept');
    assert.equal(await state('first-win'), 'Locked', 'v1 wins may be two-player wins: never guessed');
    assert.equal(await state('shell-win'), 'Locked');
    assert.equal(await game.storageItem(V1_KEY), v1);
  });

  await t.test('delete all saved data: lists what goes, Cancel keeps it, Delete removes every key the game wrote (and only those)', async () => {
    const save = { version: 2, settings: { sfx: false, musicVolume: 80, motion: 'full' }, shellsFeathers: { stats: { single: { hard: { draws: 2 } } } } };
    const game = await openGame(harness, {
      viewport: { width: 390, height: 844 },
      storage: { [V2_KEY]: JSON.stringify(save), [V1_KEY]: '{oops', 'another-site-thing': 'keep me' },
    });
    const { page } = game;
    const keys = () => page.evaluate(() => Object.keys(localStorage).sort());
    assert.deepEqual(await keys(), ['another-site-thing', V2_KEY, V1_KEY, `${V1_KEY}:corrupt`].sort());
    await game.goTo('#/settings', 'settings-screen');
    await game.press('Delete all saved data');
    assert.equal(await page.locator('#confirm-title').textContent(), 'Delete all saved data?');
    const listed = await page.locator('#confirm-deletes li').allTextContents();
    assert.equal(listed.length, 5);
    assert.match(listed.join(' '), /record.*games and sets.*achievement.*unfinished match.*pieces, side, rules, difficulty and match length.*sound, volumes and motion.*spiritOfTheWoodsStats/s);
    await game.press('Cancel');
    assert.equal((await keys()).length, 4, 'Cancel deletes nothing');

    await game.press('Delete all saved data');
    await Promise.all([page.waitForEvent('load'), game.press('Delete all saved data')]);
    await game.waitForScreen('settings-screen');
    assert.deepEqual(await keys(), ['another-site-thing', V2_KEY].sort(), 'a fresh default save, nothing else of ours');
    assert.equal(await game.storageItem('another-site-thing'), 'keep me');
    assert.equal(await page.isChecked('#audio-toggle'), true);
    assert.equal(await page.inputValue('#music-volume'), '30');
    assert.equal(await page.isChecked('input[name="motion"][value="system"]'), true);
    await game.goTo('#/your-path', 'path-screen');
    assert.equal(await page.locator('#sf-draws').textContent(), '0');
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('dialogs keep the keyboard: Tab wraps inside, and Escape works even after a click on the backdrop', async () => {
    const game = await openGame(harness, { viewport: { width: 1280, height: 800 } });
    const { page } = game;
    const focused = () => page.evaluate(() => {
      const el = document.activeElement;
      return { id: el.id, text: el.textContent.trim(), inDialog: Boolean(el.closest('.modal.active')) };
    });
    // The delete-data dialog: two buttons, Tab and Shift+Tab cycle between them.
    await game.goTo('#/settings', 'settings-screen');
    await game.press('Delete all saved data');
    const order = [];
    for (let i = 0; i < 5; i++) {
      order.push((await focused()).id);
      await page.keyboard.press('Tab');
    }
    assert.deepEqual(order, ['confirm-cancel', 'confirm-accept', 'confirm-cancel', 'confirm-accept', 'confirm-cancel']);
    await page.keyboard.press('Shift+Tab');
    assert.equal((await focused()).id, 'confirm-cancel', 'Shift+Tab wraps backwards too');
    await page.mouse.click(5, 5); // the backdrop: focus drops to the page
    await page.keyboard.press('Escape');
    assert.equal(await game.modalOpen(), false, 'Escape still closes it');
    assert.equal(await game.storageItem('spiritOfTheWoods:v2') !== null, true, 'and nothing was deleted');

    // A result dialog: never tabs out to the page behind.
    await game.goTo('#/shells-feathers/play/two', 'game-screen');
    for (const i of [0, 3, 1, 4, 2]) await game.tap(i);
    await game.waitForResult();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      assert.ok((await focused()).inDialog, `Tab ${i + 1} stayed in the dialog`);
    }
    await page.mouse.click(5, 5);
    await page.keyboard.press('Escape');
    assert.equal(await game.modalOpen(), false);
    assert.deepEqual(game.pageErrors, []);
  });

  await t.test('blocked storage: the game says progress isn\'t being kept, settings still apply, and Delete all reports it could not', async () => {
    const game = await openGame(harness, {
      viewport: { width: 390, height: 844 },
      initScript: () => {
        Storage.prototype.getItem = () => { throw new DOMException('denied', 'SecurityError'); };
        Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
        Storage.prototype.removeItem = () => { throw new DOMException('denied', 'SecurityError'); };
      },
    });
    const { page } = game;
    await game.press('Settings');
    await game.waitForScreen('settings-screen');
    assert.equal(await page.locator('#settings-storage-note').isVisible(), false, 'nothing tried yet');
    await slide(page, 'music-volume', 60);
    assert.equal(await page.locator('#settings-storage-note').isVisible(), true);
    await game.waitForMusicPlaying(0.6);
    await game.goTo('#/your-path', 'path-screen');
    assert.equal(await page.locator('#path-storage-note').isVisible(), true);
    await game.goTo('#/settings', 'settings-screen');
    await game.press('Delete all saved data');
    await game.press('Delete all saved data');
    assert.match(await page.locator('#delete-all-status').textContent(), /could not be deleted/);
    assert.equal(await game.activeScreen(), 'settings-screen', 'no reload');
    assert.deepEqual(game.pageErrors, []);
  });
});
