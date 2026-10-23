// Browser-test helpers. Tests drive the game only through what a player sees
// (screens, buttons, cells, text) plus localStorage, never internal objects.
// Waits are capped at 10s: generous for a cold CI machine running several
// browsers at once, and only an upper bound, so passing tests aren't slower.
import { chromium } from 'playwright';
import { serveRepo } from './static-server.mjs';

// Starts the static server and Chromium for one test file; both stop when the
// test (or suite) `t` finishes.
export async function startHarness(t) {
  const server = await serveRepo();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    server.closeAllConnections();
    server.close();
  });
  return { base, browser };
}

// Opens the game's hub in a fresh browser context (empty storage). `device`
// is a Playwright device descriptor (touch devices tap instead of click);
// `storage` seeds localStorage before the game's first load; `initScript`
// runs before the page's own scripts on every load.
export async function openGame({ base, browser }, { viewport = { width: 390, height: 844 }, device, storage, initScript } = {}) {
  const context = await browser.newContext(device ?? { viewport });
  const page = await context.newPage();
  const game = new GamePage(page, base, { touch: Boolean(device?.hasTouch) });

  page.on('pageerror', (err) => game.pageErrors.push(err.message));
  page.on('response', (res) => {
    const url = new URL(res.url());
    if (url.origin === base && res.status() >= 400) game.missingAssets.push(`${res.status()} ${decodeURIComponent(url.pathname)}`);
  });
  // Everything the game needs must come from the site itself. Off-site
  // requests (Google Fonts) are recorded and blocked.
  await page.route((url) => url.origin !== base, (route) => {
    game.externalRequests.push(route.request().url());
    return route.abort();
  });

  if (storage) {
    await page.goto(`${base}/__blank`);
    await page.evaluate((entries) => {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    }, storage);
  }
  if (initScript) await page.addInitScript(initScript);
  await page.goto(`${base}/index.html`);
  return game;
}

export class GamePage {
  constructor(page, base, { touch = false } = {}) {
    this.page = page;
    this.base = base;
    this.touch = touch;
    this.pageErrors = [];
    this.missingAssets = [];
    this.externalRequests = [];
  }

  // A button or link on the visible screen, or in the result dialog while it
  // is open, by its accessible name. Hidden screens can't match.
  control(name, { exact = false } = {}) {
    const scope = this.page.locator('#game-modal.active, .screen.active:not(:has(~ #game-modal.active))').first();
    return scope.getByRole('button', { name, exact }).or(scope.getByRole('link', { name, exact }));
  }

  async press(name, options) {
    const target = this.control(name, options);
    if (this.touch) await target.tap();
    else await target.click();
  }

  activeScreen() {
    return this.page.locator('.screen.active').getAttribute('id');
  }

  waitForScreen(id, timeout = 10_000) {
    return this.page.waitForFunction((s) => document.querySelector('.screen.active')?.id === s, id, { timeout });
  }

  // Waits for running transitions (screen fade-in, piece placement) to end,
  // so measurements see the layout a player sees.
  settle() {
    return this.page.evaluate(() => Promise.all(document.getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => {}))));
  }

  // Navigates like a typed URL or bookmark (hash change).
  async goTo(hash, screen) {
    await this.page.evaluate((h) => { location.hash = h; }, hash);
    if (screen) await this.waitForScreen(screen);
  }

  goHome() {
    return this.goTo('#/', 'hub-screen');
  }

  // Hub -> Shells & Feathers setup screen.
  async openShellsFeathers() {
    await this.press('Play Shells & Feathers', { exact: true });
    await this.waitForScreen('sf-setup-screen');
  }

  // On the setup screen: difficulty 'Gentle' | 'Balanced' | 'Wise'; symbol 'Shell' | 'Feather'.
  async chooseOptions({ difficulty, symbol } = {}) {
    if (difficulty) await this.page.getByRole('radio', { name: difficulty, exact: true }).check();
    if (symbol) await this.page.getByRole('radio', { name: symbol }).check();
  }

  // On the setup screen: starts a match and waits for the first turn.
  async startMatch(mode) {
    await this.press(mode === 'single' ? 'Play the Spirit' : 'Two Players');
    await this.waitForScreen('game-screen');
    await this.waitForTurn(mode === 'single' ? 'Your Turn' : "Player 1's Turn");
  }

  // Hub -> setup -> match.
  async newMatch(mode, options) {
    await this.openShellsFeathers();
    await this.chooseOptions(options);
    await this.startMatch(mode);
  }

  turnText() {
    return this.page.locator('#turn-indicator').textContent();
  }

  cells() {
    return this.page.locator('.cell').allTextContents();
  }

  tap(index) {
    const cell = this.page.locator(`.cell[data-index="${index}"]`);
    return this.touch ? cell.tap() : cell.click();
  }

  waitForTurn(prefix, timeout = 10_000) {
    return this.page.waitForFunction(
      (p) => document.getElementById('turn-indicator').textContent.startsWith(p),
      prefix,
      { timeout },
    );
  }

  waitForPieces(count, timeout = 10_000) {
    return this.page.waitForFunction((n) => document.querySelectorAll('.cell.occupied').length === n, count, { timeout });
  }

  modalOpen() {
    return this.page.locator('#game-modal').evaluate((el) => el.classList.contains('active'));
  }

  async waitForResult(timeout = 10_000) {
    await this.page.locator('#game-modal.active').waitFor({ timeout });
    return {
      title: await this.page.locator('#modal-title').textContent(),
      message: await this.page.locator('#modal-message').textContent(),
    };
  }

  scores() {
    return this.page.evaluate(() => [
      document.getElementById('player1-score').textContent,
      document.getElementById('player2-score').textContent,
    ]);
  }

  // Lifetime totals as "Your Path" shows them. Opens Your Path by URL and
  // leaves the page on the hub.
  async lifetimeStats() {
    await this.goTo('#/your-path', 'path-screen');
    const read = (id) => this.page.locator(`#${id}`).textContent();
    const stats = {
      victories: await read('wins-count'),
      draws: await read('draws-count'),
      losses: await read('losses-count'),
      total: await read('total-games'),
    };
    await this.goHome();
    return stats;
  }

  // Taps the first empty square each turn until a single-player game ends.
  async playFirstEmptyUntilResult() {
    while (!(await this.modalOpen())) {
      const board = await this.cells();
      if (board.indexOf('') === -1 || (await this.page.locator('.cell.winner').count()) > 0) break;
      const pieces = board.filter(Boolean).length;
      await this.tap(board.indexOf(''));
      await this.page.waitForFunction(
        (n) => document.querySelectorAll('.cell.occupied').length > n + 1
          || document.querySelectorAll('.cell.winner').length > 0
          || document.querySelectorAll('.cell.occupied').length === 9,
        pieces,
        { timeout: 10_000 },
      );
    }
    return this.waitForResult();
  }

  storageItem(key) {
    return this.page.evaluate((k) => localStorage.getItem(k), key);
  }

  audioState(id) {
    return this.page.evaluate((i) => {
      const el = document.getElementById(i);
      return { paused: el.paused, volume: Math.round(el.volume * 1000) / 1000 };
    }, id);
  }

  // Waits for the music to be playing at full volume (fades run on timers, so
  // allow for a slow machine).
  waitForMusicPlaying(timeout = 10_000) {
    return this.page.waitForFunction(() => {
      const el = document.getElementById('gameplay-music');
      return !el.paused && Math.abs(el.volume - 0.3) < 1e-6;
    }, null, { timeout });
  }

  wait(ms) {
    return this.page.waitForTimeout(ms);
  }
}
