# Spirit of the Woods: Upgrade Plan

| | |
|---|---|
| Audited commit | `main` @ `f7c626d` ("Add files via upload") |
| Feature branch | `claude/hopeful-hawking-ummjv2` (branched from that commit) |
| Stage 0: audit and baseline smoke test | `d97fc97` (2026-10-23) |
| Stage 1: module refactor, lifecycle, save migration | the commit that adds this section (see §0) |
| Live site | https://officialinspire.github.io/SHELLS-FEATHERS/ still serves v1 from `main`. Nothing from this branch is merged or deployed. |

The existing Shells & Feathers tic-tac-toe game must stay playable at every step of the upgrade. Each stage ends with every test green and the game deployable as is.

Sections 1–3 are the audit of v1 and stay as they were written, as a record of what v1 did. Sections 4–6 describe the current code.

---

## 0. Status after Stage 1

**Done in Stage 1.**
- `index.js` is split into ES modules under `src/` (§4), with explicit lifecycles for screens, matches, timers and music fades.
- Phaser has been removed.
- The v1 stats record is migrated into a validated, versioned save (§5) without being erased.

Gameplay, text, timings, sounds and the AI are unchanged, apart from the fixes in the table below:
- The new AI was compared with v1's on all 4,194 positions where the AI moves, for every difficulty and five random seeds: 62,910 comparisons, 0 differences.
- Screenshots of every screen on `main` and on the branch (desktop and Pixel 5, with animations frozen) are pixel-identical. The one exception is anti-aliasing on the board's outer border on the phone game screen; with no canvas layer underneath, the border rasterizes slightly differently.

**Phaser decision: removed.** It drew nothing (pieces, highlights and animations are all DOM/CSS). Its render loop ran at 60 fps even on menus, and a blocked CDN stopped every match from starting. Giving it a real purpose would mean redrawing the board in canvas, which is a design decision for the Spirit of the Woods stage. If that stage wants canvas effects, add them as an optional layer that loads lazily and is never needed for input (§4).

| ID | Finding (see §3) | Status |
|---|---|---|
| S1 | Corrupt stats brick the board | **Fixed.** Repaired or reset, never thrown. Unreadable values are copied to `<key>:corrupt`. |
| S2 | Storage that throws | **Fixed.** Play continues with in-memory records; the result modal always opens. |
| A1 | AI keeps playing after Return Home | **Fixed.** Leaving disposes the match's timers. |
| A2 | Result modal reopens after a quick restart | **Fixed.** Same mechanism. |
| A3 | AI timer carried into the next game | **Fixed.** Same mechanism. |
| D1 | Board depends on the Phaser CDN | **Fixed.** Phaser removed; the game makes no off-site requests except web fonts. |
| M1 | Overlapping fades pause the music | **Fixed.** One fade at a time; a new fade cancels the old one. |
| M2 | Victory track bleeds into the next game | **Fixed.** Stopped when its match ends (New Game, New Journey, leaving). |
| ST2 | Settings not saved | **Fixed.** Saved in the v2 save file. |
| X2 | Double click sound, dead `beforeunload` fade | **Fixed.** README updated too. |
| X3 | Settings change a live game | **Fixed.** Settings are read when a match starts. |
| P1 | 6 × 404 from dead audio paths | **Fixed.** Dead `<source>` entries removed. |
| P2 | Heavy preloads | Partly. Phaser (306 KB plus the render loop) is gone; `gameplay.mp3` still preloads. |
| ST1 | Mixed stat semantics | Data fixed, display unchanged. New games are recorded per mode and difficulty (§5). "Your Path" still shows v1 totals until the design stage decides what to show. |
| L1, L2, T1 | Landscape, settings scrolling, page-wide touch block | **Open** (layout stage). The touch block is now added when the game screen opens and removed when it closes; same effect as v1. |
| L3 | Hidden overflow (new, found by the tests) | **Open** (layout stage). The 200%-size animated `body::before` makes the document scrollable by script even though users can't scroll it. Playwright's scroll-into-view moved the whole page by up to ~400 px in mobile emulation, on `main` and the branch alike. |
| P3, X1 | Unused assets and CSS; accessibility | **Open.** |

**Trade-off: `file://`.** Browsers don't load ES modules from `file://`, so opening `index.html` straight from disk no longer works. Serve the folder instead (`python3 -m http.server`). GitHub Pages is unaffected.

---

## 1. v1 architecture (as audited)

### 1.1 Files

| File | Size | Role |
|---|---|---|
| `index.html` | 168 lines | Five `.screen` sections (start, mode, settings, stats, game) and one result modal. Buttons call global functions through inline `onclick=` attributes. Six `<audio>` elements. Loads Phaser from a CDN, then `index.js`. |
| `index.js` | 442 lines | Everything else: one global `gameState` object, `audioManager`, an (empty) Phaser scene, the rules, the AI, navigation, and stats persistence. Classic script, no modules. |
| `styles.css` | 812 lines | Theme variables, screens, board grid, modal, two breakpoints (768px, 480px). About 90 lines of unused "celebration" styles (`.celebration-container`, `.grass-blade`, `.flower`, `.butterfly`, `@keyframes float`). |
| `gameplay.mp3` | 14 MB, 10:00 | Looping music, used on every screen. |
| `victory.mp3` | 732 KB, 0:31 | Played on any win (also when the AI wins). |
| `newgame.mp3`, `player_select.mp3`, `opponent_select.mp3`, `button_select.mp3` | 22–124 KB, 1–5 s | Sound effects. |
| `background.png` | 2.1 MB, 1024×1024 | **Not referenced anywhere.** |
| `SPIRIT_OF_THE_WOODS_SHELLS_FEATHERS_TITLE_CARD.png` | 2.0 MB, 1536×1024 | **Not referenced anywhere** (added in the latest commit). |
| `README.md` | | Says "no frameworks, no dependencies" and "adaptive AI". Neither is accurate (Phaser is loaded from a CDN, and the AI has three fixed levels). |

### 1.2 Runtime and external dependencies

- **No build step.** The repo root is the site. Everything runs as classic scripts in global scope.
- **Phaser 3.70.0**, loaded from `cdn.jsdelivr.net` with no Subresource Integrity (SRI) and no local fallback. It is about 1.1 MB minified (about 306 KB transferred). Phaser does **nothing visible**: `GameScene.create()` computes a `boardData` object and draws nothing. Cells, symbols and highlights are all DOM/CSS. The scene's render loop still runs at about 60 fps on an empty canvas, and keeps running on the menus (measured: 59 frames/s on the game screen, 30 frames per 0.5 s after going back home).
- **Google Fonts**: Cinzel, Uncial Antiqua.
- **Inline handlers are a public contract.** `index.html` calls `showGameModeSelection`, `showSettings`, `showStats`, `showStartScreen` (×5), `startSinglePlayer`, `startTwoPlayer`, `resetGame`, `resetStats` and `startNewGame` by global name. Any refactor must keep these working until the markup moves to `addEventListener`.

### 1.3 State, flow and timers

`gameState` holds the board (`Array(9)` of `'shell' | 'feather' | null`), the current player, P1/P2 and player/AI symbols, difficulty, audio flags, mode (`single`/`two`), `gameActive`, `aiIsThinking`, lifetime `stats` and `sessionScores`.

```
start ──Begin Journey──▶ mode ──Single Player / Two Players──▶ game ──(win/draw)──▶ modal
  │                                                             │  New Journey = resetGame()
  ├─Settings──▶ settings                                        │  Return Home = showStartScreen()
  └─Your Path─▶ stats (Clear Path → confirm())                  modal: New Game = startNewGame(), Main Menu
```

Delayed work uses bare `setTimeout`/`setInterval` calls that are never cancelled:

| Timer | Where | Purpose |
|---|---|---|
| 800 ms | `makeMove` | AI "thinking" delay before `makeAIMove` |
| 600 ms | `resetGame` | AI first move (unreachable: Player 1 always starts and is always the human) |
| 800 ms | `endGame` | Show the result modal |
| 300 ms | `startNewGame` | Restart music after the new-game sting |
| 50 ms intervals | `audioManager.fadeIn/fadeOut` | Volume ramps. A new one starts on every call, and old ones are never cleared. |
| `requestAnimationFrame` | `showGameScreen` | Lazy Phaser init, then `resetGame()` |

### 1.4 Storage

- One key: `localStorage['spiritOfTheWoodsStats']` = `{"wins":n,"losses":n,"draws":n,"totalGames":n}`. No version field.
- Read once on `DOMContentLoaded` with a bare `JSON.parse`, and written after every finished game. There is no `try/catch` and no shape validation.
- Semantics: `wins` = single-player wins **plus every two-player win** (either player). `losses` = single-player losses only. `draws` and `totalGames` cover both modes.
- **Settings are not persisted.** Sound, music, difficulty and symbol reset to defaults on every load.

### 1.5 Audio

- Six `<audio preload="auto">` elements. Each lists a non-existent `SHELLS & FEATHERS MINI GAME/<file>.mp3` source first, then the real root-level file, so every page load makes **6 requests that 404**.
- Music starts on the first click anywhere (autoplay unlock), loops `gameplay.mp3`, and fades to volume 0.3 over 1 s. Sound effects play at 0.5.
- A win fades the music out and plays `victory.mp3`. A draw leaves the music running. "New Game" in the modal fades the music out, plays `newgame.mp3`, and restarts the music 300 ms later.

### 1.6 GitHub Pages

- Legacy **"Deploy from a branch"** mode: `main`, `/` (root). Both "pages build and deployment" runs (for `6b8ec0e` and `f7c626d`) succeeded. There is no custom workflow, `CNAME`, `.nojekyll` or `_config.yml`.
- That means **Jekyll processes the repo on every push to `main`**. Consequences for upcoming stages:
  - Markdown files are rendered and published. This file will appear at `/docs/upgrade-plan.html` once merged, and `package.json` and `tests/` will be served as static files. Both are harmless, but worth knowing.
  - Liquid runs over Markdown and HTML that Jekyll renders. Avoid double-brace or brace-percent sequences in `.md` files, or the Pages build can fail. Adding `.nojekyll` avoids this (Markdown is then served raw); decide that at deploy time.
  - Pages paths are **case-sensitive**. A local check on macOS will not catch `Victory.mp3` vs `victory.mp3`. The smoke test's static server runs on Linux and fails on any same-origin 404.
  - Keep the Pages source at the root. Do not switch it to `/docs`: the game lives at the root.

---

## 2. v1 behavior (as audited)

Stage 1 keeps all of this. The differences are listed in §0: settings are now saved, stale timers and fades are gone, and the victory track stops when its match ends.

Observed in headless Chromium (Playwright 1.63.0) against a local static server, at desktop size (1280×800) and with phone emulation: iPhone SE 320×568, a 360×640 Android, Pixel 5 393×727, and iPhone 12 landscape 750×340. AI strength was checked by loading the unmodified `index.js` into a Node VM and enumerating every game.

**Menu.** "Spirit of the Woods / A Peaceful Journey of Shells & Feathers" with three buttons: Begin Journey, Settings, Your Path. Begin Journey opens "Choose Your Path" with Single Player ("Challenge the Spirit"), Two Players ("Share the Journey") and Return to Lodge.

**Symbol selection.** Settings → "Player 1 Symbol": 🐚 Shell (default) or 🪶 Feather. Player 2 (or the AI) gets the other symbol. **Player 1 always moves first in every game**, so in single player the human always opens and the AI never starts.

**AI difficulties** (Settings → "Spirit Challenge"; default Gentle). The AI replies 800 ms after the human's move.

| Label | Key | Behavior | Measured |
|---|---|---|---|
| Gentle | `easy` | Uniformly random empty cell | — |
| Balanced | `medium` | Each move: 70% "best move", 30% random | A fixed corner-first human wins 18.7% of 20,000 sampled games |
| Wise | `hard` | Win if possible → block if possible → minimax with alpha-beta | **Unbeatable**: across all 569 possible human move sequences, 0 human wins, 183 draws, 386 AI wins. Slowest reply about 14 ms. Deterministic (ties go to the lowest index). |

**Two-player mode.** Hot-seat on one device. The turn indicator reads "Player 1's Turn 🐚" (turquoise) or "Player 2's Turn 🪶" (orange). The score header reads "Player 1: n | Player 2: n".

**Win.** The three winning cells pulse gold, music fades out and `victory.mp3` plays (also when the AI wins), and the modal appears after 800 ms:
- Single player win: "Victory!" / "The spirits smile upon you"
- Single player loss: "Wisdom Gained" / "The journey continues"
- Two players: "Player N Wins!" / "The shell spirit prevails" (or feather)

**Draw.** "Balance Achieved" / "The spirits are in harmony". No sound, and the music keeps playing.

**Modal and controls.** In the modal, New Game keeps the session score and Main Menu goes home. On the board, New Journey resets the board without sound and Return Home goes back to the start screen (and leaves the game "active"; see A1). The session score ("You / Spirit" or "Player 1 / Player 2") resets when a mode is chosen from the menu and does not count draws.

**Stats ("Your Path").** Victories, Balance (draws), Lessons (losses) and Total Journeys. "Clear Path" asks via `confirm()`. Two-player wins count as Victories.

**Settings.** Sound Effects toggle, Music toggle, difficulty, Player 1 symbol. Changes apply immediately to in-memory state and are lost on reload.

**Phone layout**

| Viewport | Start | Mode | Settings | Stats | Game |
|---|---|---|---|---|---|
| 320×568 (iPhone SE) | OK | OK | **"Return to Lodge" clipped** (top at y=559 of 568) and the page cannot scroll | OK (inner scroll) | OK, board 272 px |
| 360×640 | OK | OK | Back button 5 px clipped | OK (inner scroll) | OK, board 306 px |
| 393×727 (Pixel 5) | OK | OK | OK | OK (inner scroll) | OK, board 334 px |
| 750×340 (landscape) | OK | **Back button off-screen** | **Symbol buttons and back button off-screen**, no scroll | OK (inner scroll) | **Unplayable**: board is 638×638 starting at y=−127, controls at y=541, scrolling blocked |

---

## 3. Problems found in v1

Current status of each finding: §0.

Severity: **High** means it breaks play or loses data. **Medium** means it is visibly wrong. **Low** means hygiene or performance. Every item marked *repro* was reproduced in the browser during the audit; *inspection* items come from reading the code.

| ID | Sev | Area | Finding | Evidence |
|---|---|---|---|---|
| S1 | High | Storage | **Corrupt stats bricks the game.** If `spiritOfTheWoodsStats` holds malformed JSON or `null`, `loadStats()` throws inside the `DOMContentLoaded` handler, so `initializeEventListeners()` never runs. Menus still work (inline handlers), but **cells ignore taps** and the settings toggles do nothing. `{}` loads silently, shows blank stats, and then saves `{"totalGames":null,"wins":null}` (NaN). | repro: seeded `{bad json`, `null`, `{}` |
| S2 | High | Storage | **Storage that throws is not handled.** If `getItem` throws (storage disabled or blocked), the result is the same as S1. If `setItem` throws (quota exceeded or a private-mode quirk), `endGame` aborts before scheduling the modal: the game ends but **no result modal ever appears**. | repro: stubbed `Storage.prototype` |
| A1 | High | AI / timers | **Stale AI move after leaving the game.** "Return Home" during the AI's 800 ms delay leaves `gameActive` and `aiIsThinking` set. The AI then plays on the hidden board, can win, **records a loss**, fades the music, plays `victory.mp3`, and **opens "Wisdom Gained" over the main menu**. | repro: screenshot of modal over start screen. Stats went to `losses:1` while on the menu. |
| A2 | High | Timers | **The result modal reappears after a quick restart.** Pressing "New Journey" within 800 ms of a win resets the board, then the pending `endGame` timer opens the old result modal over the new game. | repro |
| A3 | Med | AI / timers | **The AI timer is not cancelled on restart.** Make a move, press "New Journey", and move again: the timer from the previous game fires in the new one, so the AI answers in about 530 ms instead of 800 ms. The `aiIsThinking` flag keeps it from moving twice, but the timer still belongs to the wrong game. | repro: 3/3 trials 526–557 ms |
| L1 | High | Layout | **Landscape phones can't play.** The `max-width: 768px` rule sets the board to `85vw` square, ignoring height. At 750×340 the board is 638 px tall, the top row is cut off, the controls are below the fold, and body `overflow:hidden` plus the touch block (T1) prevent scrolling. | repro: screenshot |
| D1 | High | Dependency | **The game depends on a CDN for an empty canvas.** If jsDelivr is blocked or offline, `class GameScene extends Phaser.Scene` throws, the `DOMContentLoaded` handler is never registered, and `showGameScreen` throws "Phaser is not defined". The board never becomes active. The script also has no SRI. | repro: blocked `cdn.jsdelivr.net` |
| M1 | Med | Audio | **Overlapping fades stop the music.** Fade intervals are never cancelled, so a running `fadeOut` pauses the element right after a new `fadeIn` starts. Seen: after a **draw → New Game**, music stays paused although Music is on. Music toggled **off→on within 200 ms** shows the toggle on but music paused. By inspection, the same race applies to win → Main Menu within 1 s. | repro (draw → New Game, toggle) + inspection |
| M2 | Med | Audio | **The 31 s victory track bleeds into the next game.** `victory.mp3` is never stopped, so it plays on top of the new-game sting and the restarted music. | repro: still playing 1.5 s into the next game |
| T1 | Med | Input | **Page-wide touch-scroll blocking.** `document.addEventListener('touchmove', preventDefault, {passive:false})` cancels every touchmove anywhere on the game screen (header, controls, board), not just the board. This is harmless when everything fits, and it is what makes L1 unrecoverable. It also forces a non-passive document listener. | repro: synthetic `TouchEvent` was `defaultPrevented` on header, controls and board |
| L2 | Med | Layout | **Settings can't scroll.** `.screen` is `height:100vh` and `body` is `overflow:hidden`, so content taller than the viewport is cut off (see the phone table). On real iOS Safari, `100vh` also includes the area under the toolbars, so bottom buttons may sit behind them (needs a real-device check). | repro (emulated) + inspection |
| ST1 | Med | Stats | **Mixed stat semantics.** Two-player wins count as personal "Victories", two-player games add to "Total Journeys", and there is no per-difficulty breakdown. | repro |
| ST2 | Med | Settings | **Settings are not saved.** Difficulty, symbol and sound choices reset on every visit. | repro |
| P1 | Low | Network | 6 × 404 per page load from the dead `SHELLS & FEATHERS MINI GAME/` audio sources. | repro |
| P2 | Low | Perf | `gameplay.mp3` (14 MB, 10 min) is `preload="auto"`, and everything else preloads too. About 1.3 MB of completed transfers on first load, plus the streaming music. Phaser (306 KB) loads and renders an empty canvas at 60 fps, even while on menus. | repro |
| P3 | Low | Assets | `background.png` and the title card PNG (4.1 MB together) are unused. So are about 90 lines of celebration CSS. | inspection |
| X1 | Low | A11y | The viewport sets `user-scalable=no, maximum-scale=1.0`, which blocks zoom. Cells are `div`s: not focusable, no keyboard play, no labels. Turn and result changes are not announced (no live region). Symbols are emoji only. | inspection |
| X2 | Low | Code | Difficulty and symbol buttons play `button-select` twice (their own handler plus the generic one). The `beforeunload` fade can never finish. `README.md` is inaccurate (see 1.1). | inspection |
| X3 | Low | Logic | Settings write straight into live `gameState`. Combined with A1 (game left "active"), changing the symbol while an AI move is pending would make the AI place the newly assigned AI symbol. | inspection only, not reproduced |

### The four checks requested for this audit

- **Stale AI moves after restart:** confirmed (A1, A3), plus the closely related stale result-modal timer (A2). The root cause is the same in all three: timers are not tied to the match that created them.
- **Overlapping music fades:** confirmed (M1). The root cause is uncancelled `setInterval` fades on a shared element, plus no single "music state".
- **Page-wide touch-scroll blocking:** confirmed (T1). On its own it is invisible in portrait. Together with L1 and L2 it locks players out.
- **Corrupt localStorage handling:** none (S1, S2). One bad value disables the board until the user clears site data.

---


## 4. Module boundaries (implemented in Stage 1)

The site is still static with **no build step**. `index.html` loads `src/main.js` as a native ES module, and Pages serves the files as they are. There are no runtime dependencies.

```
index.html               markup only; buttons declare data-action="…" (no inline handlers)
styles.css               unchanged except the removed #game-canvas rule
src/
  main.js                entry: createApp(...).init()
  app/                   navigation and app composition
    app.js               builds the shared services, screens and session; one delegated
                         click listener maps data-action → action
    navigation.js        shows one .screen at a time; runs leave() on the old screen,
                         then enter(...args) on the new one
    settings-screen.js   toggles, difficulty, symbol: shows saved values, saves changes
    stats-screen.js      "Your Path" totals and Clear Path
  shared/                used by any game; no DOM except the <audio> elements
    storage.js           guarded localStorage access (never throws) + readJson
    save-data.js         v2 save schema: defaults, validation, v1 migration (pure)
    profile.js           loads/repairs/migrates the save; settings and records API
    audio.js             music with one cancellable fade at a time; sound effects
    timers.js            createTimerScope(): after(ms, fn) / dispose()
  games/shells-feathers/ the game
    rules.js             lines, winner, full board, empty cells (pure)
    ai.js                the Spirit: chooseMove(board, {ai, human, difficulty, rng}) (pure)
    match.js             one game's state: turn, play(i), result, outcome (pure)
    session.js           runs matches on the game screen: Spirit turns, results,
                         session score, sounds (no DOM; talks to view.js)
    view.js              board cells, turn indicator, score, result modal (DOM)
```

**Dependency rules.**
- `games/*/rules|ai|match` are pure.
- `session.js` takes its view, audio, profile, clock and random source as parameters, so the unit tests run it with fakes.
- Only `view.js` and `app/*` touch the DOM.
- Only `storage.js` touches `localStorage`.
- Only `audio.js` touches `<audio>` elements.
- One exception, chosen on purpose: `shared/save-data.js` imports the game's symbol and difficulty lists, because the save file stores this game's records.

**Initialization and teardown.**
- `createApp({ doc, win }).init()` runs once:
  - loads the profile (and migrates it);
  - binds the delegated click listener, the cells and the settings controls;
  - renders the stats;
  - arms the "first click starts the music" listener.
- **Navigation:** `nav.show(id)` always calls the current screen's `leave()` before the next screen's `enter()`.
  - The game screen's `enter(mode)` adds the touch-scroll block and calls `session.enter(mode)`.
  - Its `leave()` calls `session.leave()` and removes the touch block.
  - So *any* way off the game screen (Return Home, Main Menu) tears the match down.
- **Matches:** every match gets its own timer scope, and `teardownMatch()` runs first in `startMatch()` and in `leave()`. Teardown:
  - disposes the match's timers (Spirit move, result modal, music restart);
  - closes the result modal;
  - stops the victory sound;
  - clears the Spirit-thinking lock.

  A disposed scope ignores later `after()` calls, so nothing from an old match can fire. This covers "New Journey" (`restart()`), "New Game" (`playAgain()`) and leaving (`leave()`).
- **Music:** `audio.js` keeps one fade timer. Starting a fade cancels the running one. `startMusic()` while music is playing ramps back up from the current volume (v1 dropped it to silence first). `stopMusic()` pauses only when its own fade finishes.

**Remaining order of work.**
1. **Layout and input:** L1, L2, L3, T1, and the zoom part of X1. Add the viewport reachability check (§6.3).
2. **Cleanup:** decide about the unused PNGs and CSS (P3), music preloading (P2), and `.nojekyll`.
3. **Spirit of the Woods design work.** Gameplay changes (including what "Your Path" shows, ST1) belong here.

---

## 5. Save format and migration (implemented in Stage 1)

### 5.1 Schema (v2)

Key: `spiritOfTheWoods:v2`

```json
{
  "version": 2,
  "settings": { "sfx": true, "music": true },
  "shellsFeathers": {
    "settings": { "difficulty": "easy", "player1Symbol": "shell" },
    "stats": {
      "single": {
        "easy":   { "wins": 0, "losses": 0, "draws": 0 },
        "medium": { "wins": 0, "losses": 0, "draws": 0 },
        "hard":   { "wins": 0, "losses": 0, "draws": 0 }
      },
      "twoPlayer": { "player1Wins": 0, "player2Wins": 0, "draws": 0 },
      "legacy": { "wins": 0, "losses": 0, "draws": 0, "totalGames": 0 }
    }
  },
  "migratedFrom": null
}
```

- App-wide settings (sound, music) sit at the top level. Shells & Feathers settings and records sit under `shellsFeathers`, leaving room for more Spirit of the Woods games.
- `legacy` holds the v1 numbers as they were: v1 can't be split by mode or difficulty. `migratedFrom` is `1` when the save came from v1.
- "Your Path" shows `summarizeStats()`: legacy plus every new bucket, in v1 terms (Victories include two-player wins). Existing players see the same numbers after the upgrade.
- Unknown fields are kept when the save is repaired and written, so data from a newer build survives a round trip through this one.

### 5.2 Loading (`profile.js` `loadSave`, never throws)

1. Read the v1 key `spiritOfTheWoodsStats`.
   - Readable values are repaired: numeric strings are accepted; negatives, `NaN`, `Infinity`, `null` and non-numbers become 0; `totalGames` is at least wins + losses + draws.
   - Unreadable values (bad JSON, or not an object) are **copied** to `spiritOfTheWoodsStats:corrupt`.
   - The v1 key itself is never changed by loading.
2. Read `spiritOfTheWoods:v2`. If it is a v2 object, repair it field by field:
   - counts as above;
   - unknown enum values reset to defaults;
   - non-boolean toggles reset to `true`.

   If the v1 record holds **more games** than v2 (an older build kept playing after a rollback), the difference is added to `legacy`, once. Use the result.
3. If v2 is unreadable, copy it to `spiritOfTheWoods:v2:corrupt`.
4. Build a new v2: migrated from v1 if usable (`migratedFrom: 1`), otherwise defaults. Write it.

`storage.js` guards every call. If storage is blocked, reads return nothing and writes report failure; the game keeps its records in memory for the session and logs one console warning.

### 5.3 Writes

- **When:** settings changes and every finished game write the v2 save.
- **Dual-write:** finished games and Clear Path also write the v1-shaped totals to `spiritOfTheWoodsStats`. An older build, after a rollback, then shows the player's current totals. On the next load of this build the totals match and nothing is double-counted.
- **Clear Path:** an explicit player action. It is the only thing that lowers the numbers.

### 5.4 Checks

`tests/unit/migration.test.mjs` covers:
- the table from the audit plan: nothing stored, valid v1, odd v1 values, unreadable v1, valid v2 with unknown fields, corrupt v2 plus v1, bad v2 fields;
- the rollback fold-in (without double counting);
- the dual-write;
- Clear Path;
- settings validation;
- storage that throws on every call, a storage getter that throws, and write-only failure (quota).

`tests/browser/storage.test.mjs` repeats the important cases in the real page.

---

## 6. Test plan

### 6.1 Automated tests (current)

```sh
npm ci
npx playwright install chromium   # skip if PLAYWRIGHT_BROWSERS_PATH already provides it
npm test                          # = npm run test:unit && npm run test:browser
```

**Unit tests** (`tests/unit`, plain `node --test`, no browser, about 1 s). Timers run on a fake clock, so every pending callback is visible.

| File | Covers |
|---|---|
| `session.test.mjs` | **Reset and stale callbacks.** "New Journey" cancels the pending Spirit move, and the new match gets its full 800 ms. Leaving during the Spirit's turn records nothing and plays nothing. The result modal never opens after restart, New Game or leave, and opens exactly once if the player stays. New Game stops the victory sound and restarts music after 300 ms; that restart is cancelled by a restart. The Spirit moves exactly once and the player can't move during its turn. Session score resets per mode and survives restarts. Results land in the right buckets. Settings apply from the next match. |
| `migration.test.mjs` | Save format, migration and malformed storage (§5.4). |
| `timers-audio.test.mjs` | Timer scopes (dispose cancels and ignores later calls; scopes are independent). Music fades: draw → New Game and music off→on keep music playing; no dip when already playing; fade-out pauses; toggles respected. |
| `rules-ai.test.mjs` | Lines, draws, illegal moves, outcomes. **Wise never loses**: all 569 human lines give 183 draws and 386 AI wins, as v1 measured. Win-before-block. Gentle and Balanced with a fixed random source. |

**Browser tests** (`tests/browser`, Playwright + Chromium against a built-in static server). Every off-site request is blocked, which proves the game is self-contained. Each test also asserts no page errors and no missing files.

| File | Covers |
|---|---|
| `gameplay.smoke.test.mjs` | The Stage 0 baseline, assertions unchanged. |
| `full-games.test.mjs` | Single player played to a result against Gentle, Balanced and Wise; Wise reproduces v1's exact audited game. Two players: Player 2 win then draw, session score and stats. Feather as Player 1. |
| `lifecycle.test.mjs` | Audit bugs A1, A2 (plus Return Home), A3, M1, M2 reproduced in the real UI and shown fixed. |
| `storage.test.mjs` | v1 player upgrades and keeps records (including after more games and a reload; v1 key untouched by the migration, then mirrored). Malformed, `null` and `{}` v1 values. Corrupt v2 rebuilt from v1. Storage that throws. Settings surviving a reload. |

### 6.2 How Stage 1 was verified beyond the suite

- **AI:** v1's `index.js` (from `main`) was loaded in a Node VM and compared with `src/games/shells-feathers/ai.js` on every AI-to-move position, for both symbol assignments, every difficulty and five seeded random sources. 62,910 comparisons, 0 differences.
- **Visual parity:** screenshots of start, modes, settings, stats, a game in progress, a win, and a single-player reply, on `main` and on the branch. Desktop 1280×800 and Pixel 5, with animations disabled and scroll reset. Identical except the phone board-border anti-aliasing noted in §0.
- **Mutation check:** key safeguards were removed one at a time (timer disposal on teardown, fade cancellation, the storage guards, the v1 migration). The suite failed each time.

### 6.3 Next: viewport reachability check (layout stage)

For each screen, at 320×568, 360×640, 390×844, 393×727, 750×340, 844×390, 768×1024 and 1280×800: every button, toggle and cell is either inside the viewport or reachable by scrolling an ancestor. This catches L1 and L2, and guards the design stage. It should also assert that the document can't be scrolled by script (L3).

### 6.4 Manual checklist (real devices, before each deploy)

- [ ] iOS Safari and Android Chrome, portrait and landscape: full game in both modes; settings and stats fully reachable; bottom buttons not under browser toolbars.
- [ ] Audio: the first tap starts music; mute toggles take effect immediately; music continues after win, draw, New Game and Main Menu; no victory bleed.
- [ ] Rotate mid-game: board state kept, layout fits.
- [ ] Private or incognito window: game playable; stats behave sensibly.
- [ ] Upgrade path: a browser with real v1 stats keeps its totals after deploy, and they appear in "Your Path".
- [ ] Throttled 3G: time to first playable board.
- [ ] Pages URL after deploy: no 404s in DevTools; `src/*.js` served as JavaScript; assets load with case-correct paths.

### 6.5 CI (proposed, not added yet)

A GitHub Actions workflow on `pull_request`: `npm ci`, then `npx playwright install --with-deps chromium`, then `npm test`. It leaves the existing Pages deployment untouched.
