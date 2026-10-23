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

// Opens the game in a fresh browser context (empty storage). `storage` seeds
// localStorage before the game's first load; `initScript` runs before the
// page's own scripts on every load.
export async function openGame({ base, browser }, { viewport = { width: 390, height: 844 }, storage, initScript } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const game = new GamePage(page, base);

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
  constructor(page, base) {
    this.page = page;
    this.base = base;
    this.pageErrors = [];
    this.missingAssets = [];
    this.externalRequests = [];
  }

  // Clicks a button on the visible screen (or the open modal) by its label, so
  // the same label on a hidden screen can't match.
  press(name) {
    return this.page.locator('.screen.active, #game-modal.active').getByRole('button', { name }).click();
  }

  activeScreen() {
    return this.page.locator('.screen.active').getAttribute('id');
  }

  turnText() {
    return this.page.locator('#turn-indicator').textContent();
  }

  cells() {
    return this.page.locator('.cell').allTextContents();
  }

  tap(index) {
    return this.page.locator(`.cell[data-index="${index}"]`).click();
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

  // Lifetime totals as "Your Path" shows them. Leaves the page on the stats
  // screen's "Return to Lodge" (start screen).
  async lifetimeStats() {
    await this.press('Your Path');
    const read = (id) => this.page.locator(`#${id}`).textContent();
    const stats = {
      victories: await read('wins-count'),
      balance: await read('draws-count'),
      lessons: await read('losses-count'),
      total: await read('total-games'),
    };
    await this.press('Return to Lodge');
    return stats;
  }

  async chooseSettings({ difficulty, symbol } = {}) {
    await this.press('Settings');
    if (difficulty) await this.press(difficulty);
    if (symbol) await this.press(symbol);
    await this.press('Return to Lodge');
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
