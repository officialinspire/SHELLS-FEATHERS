# 🎮 Spirit of the Woods

by Inspire Studios / Athena Intelligence Solutions

Two peaceful board games from the forest, played in the browser: **Shells & Feathers** (tic-tac-toe) and **Acorns & Leaves** (checkers, in Classic or Fog of War). Play against the forest Spirit at three difficulties, or with a friend on the same device.

**Play:** https://officialinspire.github.io/SHELLS-FEATHERS/

The link serves whatever is on the `main` branch. Changes on a feature branch appear there only after they are merged.

It works on phones, tablets and desktop, by touch, mouse or keyboard. There is nothing to install and no account. Progress is kept in your browser.

---

## Shells & Feathers

Tic-tac-toe on a wooden board.

- **Goal:** three of your pieces in a row: across, down or diagonally. A full board with no row of three is a draw.
- **Turns:** players take turns placing one piece on an empty square. **Player 1 always moves first**; choose whether Player 1 plays shells or feathers before the game.
- **Against the Spirit** you are Player 1:
  - **Gentle** picks open squares at random.
  - **Balanced** plays its best move about 7 times in 10, and otherwise a random open square.
  - **Wise** takes a win, blocks yours, and otherwise searches ahead for the strongest square. It never loses, so a draw against it is a good result.
- **Two players** share the device. The chips above the board show whose turn it is ("To move") and who won ("Winner"), and keep the score for the session.

## Acorns & Leaves

Checkers (American checkers / English draughts) with acorn and leaf pieces on an 8 × 8 board. Full rules: [`docs/acorns-leaves-rules.md`](docs/acorns-leaves-rules.md).

- **Setup:** 12 pieces each, on the dark squares. **Acorns move first.**
- **Moves:** an ordinary piece moves one square diagonally forward. A **king** moves one square diagonally in any direction (kings don't fly).
- **Captures:** jump an adjacent enemy piece to the empty square beyond it.
  - Ordinary pieces capture **forward only**; kings capture in any direction.
  - **Capturing is compulsory**, but you choose which capture.
  - A piece that can jump again **must keep jumping** with the same piece, and the whole chain is one move.
- **Crowning:** a piece reaching the far row becomes a king (gold ring and crown). Crowning ends the move.
- **Winning:** capture every enemy piece, or leave the other side with no legal move.
- **Draw:** 40 moves by each side with no capture and no ordinary piece moved.
- **Against the Spirit:** pick your side (your pieces start at the bottom) and a level. The setup screen says exactly how each one plays:
  - **Gentle** looks 1 move ahead and picks any move nearly as good as its best, so it can miss a trap.
  - **Balanced** looks 3 moves ahead, follows captures through, and varies between near-equal moves.
  - **Wise** looks up to 12 moves ahead (as far as 12,000 positions or 40 ms allow) and always plays its best move.
  - In **Fog of War** the Spirit sees only what you would: it imagines where your hidden pieces might be (once for Gentle, 4 ways for Balanced, 8 for Wise) and looks 1, 2 or 3 moves ahead on each.

### Fog of War

A separate mode with the same rules on the real board, but you see only part of it. Exact rules: [`docs/fog-rules.md`](docs/fog-rules.md).

- **What you see:** all your own pieces. An enemy piece only when it stands next to one of yours. Every other dark square is misty and may hide an enemy piece.
- **Capturing in the fog:** if a capture *may* be possible you must try one. If a hidden piece blocks the landing square, it is revealed to you and you choose again.
- **Two players:** a handoff screen hides the board between turns. Sounds never give away what the other player can't see.
- **End of game:** the fog lifts when the game ends.

## Controls

| | Touch or mouse | Keyboard |
|---|---|---|
| Menus and buttons | Tap or click | Tab / Shift+Tab, then Enter or Space |
| Place a shell or feather | Tap a square | Arrow keys (Home/End along a row), then Enter or Space |
| Move a checker | Tap a piece, then a marked square: a dot is a move, a ring is a jump. In a chain, tap each landing square. Tap the piece again to put it back. No dragging. | Arrow keys move between dark squares; Enter or Space picks up the piece, then chooses the square; Escape puts it back. |
| Pause, settings, restart, change mode | **Menu**, above the board (on a wide screen Restart and Change Mode are also in the side panel) | Tab to Menu, Enter; Escape steps back and closes it |
| Close a result and see the board | "View Board" | Escape |
| Go back | The ← button, or the browser's Back | Browser Back (Alt+←) |

Screen readers hear every square's name and contents, each move, and the result. Pieces that must capture are ringed in orange. The piece picked up sits on a gold square with a cream ring.

On a phone the board takes all the room the rest of the screen leaves, in portrait or landscape. A scroll, a pinch or a stray second tap is never taken as a move.

On a wide screen a side panel beside the board shows whose turn it is, what to do, the last move, the rule behind what is happening, and the rules and keys. The game pauses while the menu or its Settings is open, and while the page is hidden.

## Settings, Your Path and saved data

- **Settings** are shared by both games:
  - **Music** and **Sound effects**, each with a switch and its own volume.
  - **Motion:** follow the device's "reduce motion" setting, or force Reduce or Full.
  - **Haptics:** short, gentle vibrations for your own moves, captures, crowning, a refused move, results and achievements. Off until you turn it on, and only where the browser can vibrate (Android Chrome can; Safari on iPhone and iPad and most desktop browsers can't, and Settings says so). The Spirit's moves and hovering never vibrate.
  - Sound starts only after your first tap, click or key press, and pauses while the page is hidden.
  - Each game's own options (pieces, side, rules, difficulty) are on that game's screen.
- **Matches:** each game's screen offers a single game, best of three or best of five. A drawn round counts as a round but scores for no one; level after the last round is a drawn set. Sets are recorded apart from games in Your Path.
- **Resume:** an unfinished match is kept as you play and comes back after a reload, or from the game's screen and the hub. Two players in Fog of War resume behind the handoff screen. Pressing Play starts a new match in its place.
- **Tutorial:** each game offers a short practice once (Tutorial on its screen any time). Nothing in it counts.
- **Achievement Journal** (Journal, on the hub): every achievement of both games and the Collection, in tabs, each with its rule, progress and the date it was unlocked. Wins against the Spirit are counted apart from two-player games on the device, and nothing is unlocked from guesses. An achievement unlocked during play is told briefly in the match header, where the mode and difficulty are shown, never over the board.
- **Your Path** shows each game's records:
  - your games against the Spirit by difficulty, kept apart from two-player games on the device (a two-player win never counts as yours);
  - Classic and Fog of War side by side.
- **Achievements** are each unlocked once, and Your Path shows the date. Wins and moments count only in your games against the Spirit.
  - **Shells & Feathers:** First Game, First Win, Gentle Win, Balanced Win, Steady Hand (hold Wise to a draw), Shared Board (a two-player game), Ten Games.
  - **Acorns & Leaves:** First Win, Crowned (first king), Double Jump (two or more captures in one move), Through the Fog (first Fog win), Wise Victory, Shared Board.
- **Saved data:**
  - Everything is kept in this browser's local storage under `spiritOfTheWoods:v2`.
  - The first version's record, `spiritOfTheWoodsStats`, is migrated and kept.
  - "Clear … progress" (Your Path) and "Delete all saved data" (Settings) list exactly what they delete before doing it.

## Assets and credits

- **Artwork and new sounds:** all artwork is original to this project and drawn as SVG and CSS, with no image files: the shell, feather, acorn and leaf pieces, the kings' crowns, the icons, the boards and the woodland background. The new sound effects are original too, synthesized by [`tools/make-sounds.py`](tools/make-sounds.py).
- **Music and original effects:** the music and the original sound effects were uploaded by the owner. Their source and license are not recorded yet.
- **Fonts:** Cinzel (Natanael Gama) and Uncial Antiqua (Astigmatic), SIL Open Font License 1.1, via Google Fonts.

Every asset, with its source and terms: [`docs/assets.md`](docs/assets.md).

## Development

There is no build step and no runtime dependency: the repository root *is* the site (static HTML, CSS and native ES modules). Node is used only for tests and tools.

```sh
# Run it locally (modules need a web server, not file://)
python3 -m http.server 8000         # then open http://localhost:8000

# Tests: unit tests in Node, browser tests in headless Chromium
npm ci
npx playwright install chromium     # once
npm test                            # = npm run test:unit && npm run test:browser
```

**After changing anything in `src/` or `styles.css`, run `npm run stamp`** (`node tools/stamp-assets.mjs`).

GitHub Pages caches every file for ten minutes and can't be told otherwise. The stamp gives the stylesheet and every module a content-hashed URL (through an import map in `index.html`), so after a deploy no browser mixes old and new files. A unit test fails while the stamp is out of date.

**Layout**

| Path | What |
|---|---|
| `index.html`, `styles.css` | All screens and styles |
| `src/main.js`, `src/app/` | The hub: routing, screens, Settings, Your Path, dialogs |
| `src/games/shells-feathers/` | Tic-tac-toe rules, the Spirit, the match session and view |
| `src/games/acorns-leaves/` | Checkers engine, the Spirit's search, Fog of War, session and view |
| `src/shared/` | Save data and migration, achievements, audio, storage, timers, board taps, the match menu |
| `tests/unit`, `tests/browser` | `node:test` suites; the browser tests use Playwright |
| `tools/` | `stamp-assets.mjs` (cache-busting), `make-sounds.py` (original sounds), `prepare-audio.sh` (trims and re-encodes the owner's MP3s) |
| `sounds/`, `*.mp3` | Audio |
| `docs/` | [Upgrade plan, save format and test plan](docs/upgrade-plan.md), [checkers rules](docs/acorns-leaves-rules.md), [Fog of War rules](docs/fog-rules.md), [assets](docs/assets.md) |

**Deploying:** GitHub Pages publishes the root of `main`. `.nojekyll` makes Pages serve every file as it is. All paths are relative, because the site lives at `/SHELLS-FEATHERS/`. File names are case-sensitive there, and a unit test checks every reference.

**Analytics:** the game sends no analytics or tracking events and makes no network requests besides its own files and Google Fonts.

Changes are listed in [`CHANGELOG.md`](CHANGELOG.md).

## Vision

*From the original README, by Inspire Studios:* Part of Inspire Studios’ ongoing mission to merge ancient motifs with modern code, Spirit of the Woods symbolizes the bridge between natural wisdom and digital intelligence — a game that honors balance, patience, and the rhythm of play itself.
