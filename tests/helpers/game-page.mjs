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

// Every load opens on "Touch to start" (src/app/start-gate.js). Tests about
// the game pass it as a player's first tap would, with the intro already
// seen this session; `gate: true` leaves the start screen and intro to the
// test.
const PASS_START_GATE = `(() => {
  try { sessionStorage.setItem('spiritOfTheWoods:introSeen', '1'); } catch {}
  document.addEventListener('DOMContentLoaded', () => document.getElementById('start-gate')?.click());
})();`;

// Opens the game's hub in a fresh browser context (empty storage). `device`
// is a Playwright device descriptor (touch devices tap instead of click);
// `storage` seeds localStorage before the game's first load; `initScript`
// runs before the page's own scripts on every load; `fakeClock` gives the
// page Playwright's controllable clock (timers run only on page.clock.runFor).
export async function openGame({ base, browser }, {
  viewport = { width: 390, height: 844 }, device, storage, initScript, fakeClock = false, gate = false,
} = {}) {
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
  if (!gate) await page.addInitScript({ content: PASS_START_GATE });
  if (initScript) await page.addInitScript(initScript);
  if (fakeClock) await page.clock.install();
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

  // A button or link on the visible screen, or in a result dialog or handoff
  // screen while one is open, by its accessible name. Hidden screens can't
  // match.
  control(name, { exact = false } = {}) {
    const cover = '.modal.active, .handoff:not([hidden])';
    const scope = this.page.locator(`${cover}, .screen.active:not(:has(~ :is(${cover})))`).first();
    return scope.getByRole('button', { name, exact }).or(scope.getByRole('link', { name, exact }));
  }

  async press(name, options) {
    const target = this.control(name, options);
    if (this.touch) await target.tap();
    else await target.click();
  }

  // On a match screen: opens the match menu and presses one of its items
  // (Restart, Change Mode, All Games, Resume).
  async fromMenu(name) {
    await this.press('Menu', { exact: true });
    await this.page.locator('.match-menu.active').waitFor();
    await this.press(name, { exact: true });
  }

  activeScreen() {
    return this.page.locator('.screen.active').getAttribute('id');
  }

  waitForScreen(id, timeout = 10_000) {
    return this.page.waitForFunction((s) => document.querySelector('.screen.active')?.id === s, id, { timeout });
  }

  // Waits for running transitions (screen fade-in, piece placement) to end,
  // so measurements see the layout a player sees. Animations held by the
  // match menu (paused) are left alone.
  settle() {
    return this.page.evaluate(() => Promise.all(document.getAnimations()
      .filter((a) => a.playState !== 'paused' && a.effect?.getComputedTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => {}))));
  }

  // Navigates like a typed URL or bookmark (hash change).
  async goTo(hash, screen) {
    await this.page.evaluate((h) => { location.hash = h; }, hash);
    if (screen) await this.waitForScreen(screen);
  }

  // Starts a new match at `hash` the way a Play link does (a link pressed
  // always starts a new match; typing the address or Back/Forward resumes an
  // unfinished one).
  async startNew(hash, screen) {
    await this.page.evaluate((h) => {
      const link = Object.assign(document.createElement('a'), { href: h });
      document.body.append(link);
      link.click();
      link.remove();
    }, hash);
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

  // The board as 🐚 / 🪶 / '' per square, read from each square's
  // data-symbol (the pieces themselves are drawn as SVG).
  cells() {
    return this.page.locator('.cell').evaluateAll((els) => els.map((el) => ({ shell: '🐚', feather: '🪶' })[el.dataset.symbol] ?? ''));
  }

  // A finger tap right after a move is taken as a stray double tap and
  // ignored (src/shared/board-taps.js), so a touch test, like a player, waits
  // for the board to settle first.
  async waitForSettled(board) {
    await this.page.waitForFunction((id) => !('settling' in document.getElementById(id).dataset), board, { timeout: 10_000 });
  }

  async tap(index) {
    const cell = this.page.locator(`.cell[data-index="${index}"]`);
    if (!this.touch) return cell.click();
    await this.waitForSettled('board-overlay');
    return cell.tap();
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

  // Whether a result dialog (either game's) is open.
  modalOpen() {
    return this.page.evaluate(() => document.querySelector('.modal.active') !== null);
  }

  async waitForResult(timeout = 10_000) {
    const modal = this.page.locator('.modal.active');
    await modal.waitFor({ timeout });
    return {
      title: await modal.locator('.modal-title').textContent(),
      message: await modal.locator('.modal-message').textContent(),
    };
  }

  scores() {
    return this.page.evaluate(() => [
      document.getElementById('player1-score').textContent,
      document.getElementById('player2-score').textContent,
    ]);
  }

  // Shells & Feathers records as "Your Path" shows them: your games against
  // the Spirit (wins, draws, losses, games), the two-player line, and the
  // note about earlier (v1) games ('' when hidden). Opens Your Path by URL and
  // leaves the page on the hub.
  async pathRecords() {
    await this.goTo('#/your-path', 'path-screen');
    const records = await this.page.evaluate(() => {
      const read = (id) => document.getElementById(id).textContent;
      const note = document.getElementById('legacy-note');
      return {
        wins: read('sf-wins'),
        draws: read('sf-draws'),
        losses: read('sf-losses'),
        games: read('sf-games'),
        twoPlayer: read('two-player-record'),
        earlier: note.hidden ? '' : note.textContent,
      };
    });
    await this.goHome();
    return records;
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

  // ------------------------------------------------------ Acorns & Leaves

  // Hub -> Acorns & Leaves setup screen.
  async openAcornsLeaves() {
    await this.press('Play Acorns & Leaves', { exact: true });
    await this.waitForScreen('al-setup-screen');
  }

  // On the Acorns & Leaves setup screen: variant 'Classic' | 'Fog of War';
  // side 'Acorns' | 'Leaves'; difficulty 'Gentle' | 'Balanced' | 'Wise'.
  async chooseCheckersOptions({ variant, side, difficulty } = {}) {
    if (variant) await this.page.getByRole('radio', { name: variant, exact: true }).check();
    if (side) await this.page.getByRole('radio', { name: side, exact: true }).check();
    if (difficulty) await this.page.getByRole('radio', { name: difficulty, exact: true }).check();
  }

  async startCheckers(mode) {
    await this.press(mode === 'single' ? 'Play the Spirit' : 'Two Players');
    await this.waitForScreen('al-game-screen');
  }

  // Hub -> setup -> match.
  async newCheckersMatch(mode, options) {
    await this.openAcornsLeaves();
    await this.chooseCheckersOptions(options);
    await this.startCheckers(mode);
  }

  square(index) {
    return this.page.locator(`#al-board button[data-square="${index}"]`);
  }

  async tapSquare(index) {
    if (!this.touch) return this.square(index).click();
    await this.waitForSettled('al-board');
    return this.square(index).tap();
  }

  // Taps each square of a move's path in turn.
  async playPath(path) {
    for (const index of path) await this.tapSquare(index);
  }

  // The board as 8 strings, top row first, in the engine's notation
  // (a/A acorn/king, l/L leaf/king, '.' empty), read from the drawn pieces.
  checkersRows() {
    return this.page.evaluate(() => {
      const codes = { acorn: 'a', 'acorn-king': 'A', leaf: 'l', 'leaf-king': 'L' };
      const cells = Array(64).fill('.');
      for (const el of document.querySelectorAll('#al-board [data-square]')) {
        cells[Number(el.dataset.square)] = codes[el.dataset.piece] ?? '.';
      }
      return Array.from({ length: 8 }, (_, r) => cells.slice(r * 8, r * 8 + 8).join(''));
    });
  }

  // What the match screen shows: board state, turn line, guidance, captured
  // counts, the side to move, and which squares carry which marks.
  checkersView() {
    return this.page.evaluate(() => {
      const squaresWith = (cls) => [...document.querySelectorAll(`#al-board .${cls}`)].map((el) => Number(el.dataset.square)).sort((a, b) => a - b);
      const count = (side) => Number(document.querySelector(`#al-side-${side} .al-side-count`).textContent);
      const active = document.querySelector('.al-side.is-active');
      return {
        state: document.getElementById('al-board').dataset.state,
        busy: document.getElementById('al-board').getAttribute('aria-busy'),
        turn: document.getElementById('al-turn').textContent,
        hint: document.getElementById('al-hint').textContent,
        toMove: active ? active.id.replace('al-side-', '') : null,
        captured: { acorn: count('acorn'), leaf: count('leaf') },
        selected: squaresWith('is-selected'),
        destinations: squaresWith('is-destination'),
        mustJump: squaresWith('must-jump'),
        jumped: squaresWith('is-jumped'),
        trail: squaresWith('is-trail'),
        lastMove: squaresWith('is-last'),
        wasCaptured: squaresWith('was-captured'),
      };
    });
  }

  label(index) {
    return this.square(index).getAttribute('aria-label');
  }

  checkersStatus() {
    return this.page.locator('#al-status').evaluate((el) => el.textContent.trim());
  }

  waitForBoardState(state, timeout = 10_000) {
    return this.page.waitForFunction((s) => document.getElementById('al-board').dataset.state === s, state, { timeout });
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

  // Waits for the music to be playing at its full volume, 0.3 unless the
  // settings say otherwise (fades run on timers, so allow for a slow machine).
  waitForMusicPlaying(level = 0.3, timeout = 10_000) {
    return this.page.waitForFunction((target) => {
      const el = document.getElementById('gameplay-music');
      return !el.paused && Math.abs(el.volume - target) < 1e-6;
    }, level, { timeout });
  }

  wait(ms) {
    return this.page.waitForTimeout(ms);
  }
}
