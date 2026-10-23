# Spirit of the Woods: Upgrade Plan

**Stage 0: audit and baseline.** No gameplay changes were made in this stage.

| | |
|---|---|
| Audited commit | `main` @ `f7c626d` ("Add files via upload") |
| Feature branch | `claude/hopeful-hawking-ummjv2` (branched from that commit) |
| Audit date | 2026-10-23 |
| Live site | https://officialinspire.github.io/SHELLS-FEATHERS/ (`index.html` and `index.js` byte-identical to `main`) |

The existing Shells & Feathers tic-tac-toe game must stay playable at every step of the upgrade. Each stage below ends with the smoke test green and the game deployable as is.

---

## 1. Current architecture

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

## 2. Current behavior (observed)

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

## 3. Problems found

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

## 4. Proposed module boundaries

Constraints: stay a static site with **no build step**, so GitHub Pages keeps working unchanged. Use native ES modules (`<script type="module">`), which every browser that can run the game today supports.

```
index.html               markup only; data-action attributes instead of onclick
styles.css               (later: split base / screens / board if it helps)
src/
  main.js                boot: load storage → apply settings → wire UI → show start
  core/                  pure, no DOM / timers / storage / audio; unit-tested in Node
    rules.js             LINES, winnerOf(board) → {symbol, line} | null, isFull, legalMoves
    ai.js                chooseMove(board, { ai, human, difficulty, rng }) → index
    match.js             createMatch({ mode, p1Symbol, difficulty }) → play(i), turn,
                         result, id; emits 'move' | 'end' exactly once per event
  services/
    storage.js           safe storage wrapper, schema v2, migrate(), validate()
    audio.js             AudioDirector: one music channel with cancellable fades,
                         SFX that stop on new match, unlock-on-gesture, lazy music load
    scheduler.js         after(ms, fn, { owner }) / cancel(owner); owner = match id or screen
  ui/
    screens.js           show(id), back navigation, focus management, modal open/close
    board-view.js        render(match), cells as <button>, click + keyboard → match.play
    hud.js, settings-view.js, stats-view.js
assets/audio/*.mp3, assets/img/*.png   (moved in the cleanup stage, single source per <audio>)
```

**Rules**

1. `core/*` imports nothing from `ui/` or `services/`. All randomness goes through an injected `rng`, so AI tests are deterministic.
2. Only `ui/*` touches the DOM. Only `services/storage.js` touches `localStorage`. Only `services/audio.js` touches `HTMLAudioElement`.
3. Every delayed action (AI think time, result modal, music restart) goes through `scheduler` with the current **match id** as owner. Starting, restarting or abandoning a match calls `cancel(oldId)`. This is the structural fix for A1–A3: a callback can't act on a match that no longer exists.
4. Audio keeps one active fade per channel. Starting a fade cancels the previous one. "Is music supposed to be playing" is a state, not inferred from volume. Fixes M1 and M2.
5. **Phaser: remove it** as part of the refactor, since it renders nothing (fixes D1 and part of P2). If the Spirit of the Woods design stage wants canvas effects, bring it back as an optional `ui/effects` layer: self-hosted or pinned with SRI, loaded lazily, never on the input path, and with the board working if it fails to load.
6. Touch handling: drop the document-level `touchmove` blocker. Use `touch-action: manipulation` on the board and cells instead, and let screens scroll (`overflow-y:auto`, `min-height: 100dvh` with a `100vh` fallback).

**Order of work** (each step ships independently and keeps the smoke test green)

1. **Core extraction.** Move rules and AI into `src/core`, unit-test them (including the exhaustive "Wise never loses" check), and point `index.js` at them. No visible change.
2. **Storage service and migration** (section 5). Fixes S1, S2, ST2, and makes ST1 fixable.
3. **Scheduler, match and audio.** Fixes A1–A3, M1, M2. Write a failing browser test for each bug first.
4. **Layout and input.** Fixes L1, L2, T1, and the zoom part of X1. Add the viewport reachability check (section 6).
5. **Cleanup.** Remove Phaser, fix audio sources, move assets, decide about the unused PNGs, update the README, and choose `.nojekyll` or not (P1–P3, X2, D1).
6. **Spirit of the Woods design work** starts on top of this base. Gameplay changes are out of scope until then.

---

## 5. Storage migration approach

### 5.1 New schema (v2)

Key: `spiritOfTheWoods:v2`

```json
{
  "version": 2,
  "settings": { "sfx": true, "music": true, "difficulty": "easy", "player1Symbol": "shell" },
  "stats": {
    "single": {
      "easy":   { "wins": 0, "losses": 0, "draws": 0 },
      "medium": { "wins": 0, "losses": 0, "draws": 0 },
      "hard":   { "wins": 0, "losses": 0, "draws": 0 }
    },
    "twoPlayer": { "player1Wins": 0, "player2Wins": 0, "draws": 0 },
    "legacy": { "wins": 0, "losses": 0, "draws": 0, "totalGames": 0 }
  },
  "migratedFrom": null
}
```

- `legacy` holds the v1 numbers as they were, because v1 can't be split by mode or difficulty. "Your Path" shows **legacy + new buckets** so that nobody's totals drop after the upgrade. New screens can show per-difficulty records for games played after the upgrade.
- Unknown fields are preserved on write, so a newer version can roll back to an older one without data loss.

### 5.2 Load algorithm (never throws)

1. **Probe storage** inside `try/catch` (set, get and remove a probe key). If that fails, use an in-memory store for the session and keep playing. Optionally show a subtle "progress won't be saved" note.
2. **Read v2.** `JSON.parse` inside `try/catch`, then `validate()`:
   - Counts become non-negative safe integers. Numeric strings are accepted. `NaN`, negatives, `null` and non-numbers become 0.
   - Enums (`difficulty`, `player1Symbol`) fall back to their defaults.
   - Booleans fall back to `true`.

   If v2 is valid, use it.
3. **If v2 is missing,** read the v1 key `spiritOfTheWoodsStats` and validate it the same way, with `totalGames = max(totalGames, wins + losses + draws)`. Build v2 with that `legacy` bucket and `migratedFrom: 1`, then write v2.
4. **If v2 is present but corrupt,** copy the raw string to `spiritOfTheWoods:v2:corrupt` (one slot, overwritten each time) for support and debugging. Then fall back to step 3, or to defaults if there is no usable v1.
5. **Leave the v1 key in place.** Never delete it during migration, so a deploy rollback still finds the old stats.

### 5.3 Writes

- Write after each finished game and each settings change, inside `try/catch`. A failed write is logged once and **never blocks the UI**: the result modal must still appear (S2).
- **Dual-write during transition:** also write the v1 aggregate shape (`wins` = all single wins + all two-player wins, as v1 counted) to the v1 key, for the first releases after the upgrade. A rollback then shows current totals. Stop dual-writing once the new build is proven, and leave the v1 key frozen.

### 5.4 Migration tests (table-driven, `node --test`)

| Input | Expected |
|---|---|
| nothing stored | defaults, v2 written |
| v1 `{"wins":3,"losses":1,"draws":2,"totalGames":6}` | `legacy` = same, `migratedFrom: 1`, v1 key untouched |
| v1 malformed JSON / `null` / `[]` / `"str"` | defaults, no throw, v1 key untouched |
| v1 `{}` | legacy all 0 |
| v1 `{"wins":"3","totalGames":"3"}` | legacy wins 3, totalGames 3 |
| v1 negative / `1e309` / `NaN`-producing values | clamped to 0 or a safe integer |
| v1 `totalGames` < sum of parts | `totalGames` = sum |
| valid v2 | returned unchanged (including unknown fields) |
| corrupt v2 + valid v1 | backup slot written, re-migrated from v1 |
| `getItem` throws | in-memory store, defaults, no throw |
| `setItem` throws | load still succeeds; later saves fail quietly |
| v2 with bad enums | enums reset, counts kept |

---

## 6. Test plan

### 6.1 Baseline smoke check (added in this stage)

`tests/gameplay.smoke.test.mjs`, run with `npm test`:

```sh
npm ci
npx playwright install chromium   # skip if PLAYWRIGHT_BROWSERS_PATH already provides it
npm test
```

It starts a dependency-free static server on the repo root (Linux, so paths are case-sensitive like Pages) and drives headless Chromium at 390×844. It covers:

- **Two-player game:** Player 1 takes the top row. Turn order and indicator are correct after each move, and a tap on an occupied cell is ignored.
- **Result:** modal shows "Player 1 Wins!" with the right message, winning cells 0/1/2 are highlighted, and the session score reads 1–0.
- **New Game:** clears the board and the modal, and keeps the session score.
- **Persistence:** after Return Home and a **page reload**, "Your Path" shows 1 victory and 1 total.
- **Single player (Gentle):** the "You / Spirit" labels appear, the turn goes "Spirit's Turn" → "Your Turn", and the AI makes exactly one move.
- **Overall:** no uncaught page errors, and no same-origin 404s (apart from the known dead `SHELLS & FEATHERS MINI GAME/` paths).

It only uses player-visible DOM, never `gameState` or the storage key. It should keep passing unchanged through the refactor and the v2 storage migration. It needs network access to jsDelivr until Phaser is removed (D1).

It was validated by mutation: it fails if win detection is broken, if the AI never moves, or if stats are not saved.

### 6.2 Unit tests (`node --test`, no dependencies), from step 1 onward

- `rules`: all 8 lines win, no false positives, draw = full board with no winner, and `legalMoves`.
- `ai`:
  - Wise never loses: enumerate all human lines (the audit's 569-line result is the baseline: 0 human wins).
  - Gentle and Balanced only return legal moves.
  - Balanced with a seeded `rng` hits the 70/30 split.
  - Wise wins immediately when it can, and blocks.
- `match`: alternating turns, Player 1 starts, moves after the end are rejected, `end` fires once, and two-player and single-player results map correctly to stats buckets.
- `storage`: the table in section 5.4.
- `scheduler`: `cancel(owner)` drops pending callbacks; run with `node:test` `mock.timers`.

### 6.3 Browser regression tests (same harness, one per bug, written failing first)

| Bug | Steps | Pass condition |
|---|---|---|
| A1 | Wise; human blunders so the AI has a winning reply; Return Home within 800 ms; wait 2 s | Start screen, no modal, stats unchanged |
| A2 | 2P win; New Journey within 800 ms; wait 1 s | No modal over the fresh board |
| A3 | Move, New Journey, move | AI replies after ≥ 750 ms |
| M1 | 2P draw → New Game; also Music off→on in 200 ms | Music element playing |
| M2 | Win → New Game | `victory.mp3` paused |
| S1 / S2 | Seed malformed / `null` / `{}`; stub storage to throw | Cells playable, modal appears, stats numeric |
| T1 | Dispatch `touchmove` on header and controls | Not `defaultPrevented` |
| D1 | Block `cdn.jsdelivr.net` | Game fully playable (once Phaser is removed or optional) |

### 6.4 Viewport reachability check

For each screen, at 320×568, 360×640, 390×844, 393×727, 750×340, 844×390, 768×1024 and 1280×800: every button, toggle and cell is either inside the viewport or reachable by scrolling an ancestor. This catches L1 and L2 and guards the design stage.

### 6.5 Manual checklist (real devices, before each deploy)

- [ ] iOS Safari and Android Chrome, portrait and landscape: full game in both modes; settings and stats fully reachable; bottom buttons not under browser toolbars.
- [ ] Audio: the first tap starts music; mute toggles take effect immediately; music continues after win, draw, New Game and Main Menu; no victory bleed; music pauses when the tab is backgrounded (once added).
- [ ] Rotate mid-game: board state kept, layout fits.
- [ ] Private or incognito window: game playable; stats behave sensibly.
- [ ] Upgrade path: a browser with real v1 stats keeps its totals after deploy.
- [ ] Throttled 3G: time to first playable board.
- [ ] Pages URL after deploy: no 404s in DevTools, and assets load with case-correct paths.

### 6.6 CI (proposed for a later stage, not added here)

A GitHub Actions workflow on `pull_request`: `npm ci`, then `npx playwright install --with-deps chromium`, then `npm test`. It leaves the existing Pages deployment untouched.
