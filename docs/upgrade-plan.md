# Spirit of the Woods: Upgrade Plan

| | |
|---|---|
| Audited commit | `main` @ `f7c626d` ("Add files via upload") |
| Feature branch | `claude/hopeful-hawking-ummjv2` (branched from that commit) |
| Stage 0: audit and baseline smoke test | `d97fc97` (2026-10-23) |
| Stage 1: module refactor, lifecycle, save migration | `2a222c0` |
| Stage 2: Spirit of the Woods game hub | `2099f98` |
| Stage 3: Shells & Feathers match flows, board accessibility, gestures | `bb5708d` |
| Stage 4: Acorns & Leaves Classic Checkers rules engine | `2fc7c37` |
| Stage 5: Acorns & Leaves playable (board, two players, the Spirit) | `e05a922` |
| Stage 6: Acorns & Leaves Fog of War mode | `69852ea` |
| Stage 7: one Spirit of the Woods look (polish, motion, accessibility, assets) | `9e8fad9` |
| Stage 8: shared settings, sound, Your Path, achievements, saved data | `a3e49d4` |
| Stage 9: end-to-end QA, Pages caching, README, changelog | `6970194` |
| Stage 10: visual identity (design tokens, woodland palette, original SVG pieces and icons) | the commit that adds §0.1 |
| Live site | https://officialinspire.github.io/SHELLS-FEATHERS/ still serves v1 from `main`. Nothing from this branch is merged or deployed. |

The existing Shells & Feathers tic-tac-toe game must stay playable at every step of the upgrade. Each stage ends with every test green and the game deployable as is.

Sections 1–3 are the audit of v1 and stay as they were written, as a record of what v1 did. Sections 4–6 describe the current code.

---

## 0. Status

### 0.1 Stage 10: visual identity

**Direction.** A woodland tabletop:
- the boards are warm wooden trays and frames on a forest-green page, which fades from canopy to forest floor;
- panels are dark bark, with a grain too faint to touch text contrast;
- the pieces are pearl shells, soft feathers, and readable acorns and leaves;
- turquoise is kept for what you can act on (primary buttons, the selected option's edge, "To move", move markers).

The motifs are natural objects only. No tribal or ceremonial symbols, and no cultural claims, were added.

**Design tokens.** They are at the top of `styles.css`, and components use them rather than raw values:
- **Palette:** forest, wood, pearl, feather, turquoise, gold, ember.
- **Text and typography:** text colors, families, a type scale, leading and tracking.
- **Spacing:** 4px steps.
- **Shapes and effects:** radii, surfaces (panel, raised, inset, board frame, board squares, grain), borders, shadows (including a board shadow, so the board leads every screen).
- **Icons and states:** icon sizes, and hover, press, selected, disabled and focus states.

Panel-like boxes share one surface rule. Old variable names remain as aliases; the unused ones are removed.

**Artwork, replacing emoji.** The game no longer uses any emoji. Everything is original SVG in the `index.html` sprite (`docs/assets.md`):
- **Shells & Feathers pieces:** a pearl spiral seashell and a barred feather, drawn with dark outlines so they read on the wood at every size. They appear on the board, the player chips, the turn line, the result medallion, the setup options and the hub card.
- **Icons:** Play the Spirit (a tree), Two Players, Settings, Your Path (a trail), the Fog handoff (mist), and the achievement and notice checks.
- **Kings:** the crown now rises above the disc, so a king's outline differs from an ordinary piece's. It reads even on 36px squares.

**Other changes.**
- **Selected options:** light, with a turquoise edge and a check, instead of solid turquoise blocks.
- **Checkers frame:** thicker and wooden. The board's width now allows for the frame, which fixes a 14px overflow on 400–600px-wide screens.
- **Shells & Feathers text:** the turn line and match info no longer contain emoji ("Player 1's Turn", with the piece drawn beside it). The tests read pieces from `data-symbol`.

**Fixed.**
- `tools/stamp-assets.mjs` (Stage 9) replaced only the *first* stamp: its marker contains `(`, which the regex read as syntax. `--check` and its test shared the mistake, so both passed.
- The test now compares every import-map entry with the file's real hash, and restamps a deliberately stale copy.
- The committed Stage 9 stamp was checked and was correct.

**Verification.**
- **Screenshots** before and after of 14 screens at 360×640, 360×560, 640×360 and 1280×800, reviewed by eye. The pieces were previewed at 34–130px.
- **Contrast audit:** 0 of 1,754 text runs below AA, no touch-size problems, no clipped text. The focus rings on the volume sliders were checked directly.
- **Tests:** unit and browser suites, twice.

### 0.2 Stage 9: end-to-end QA before the playtest

**Scripted play.** The site was served under `/SHELLS-FEATHERS/`, as Pages does, so a root-relative path would fail. Every move was made through the page:

| Run | What was played or checked | Result |
|---|---|---|
| Phone (Galaxy S5, touch) | Every mode to a result: Shells & Feathers against Gentle, Balanced and Wise, and two players with Feather as Player 1. Acorns & Leaves Classic against all three levels (as both sides) and two players. Fog against Gentle and Wise, and Fog two players. | 12 games finished. Saved records and Your Path matched the games played exactly; achievements appeared once. Each fogged square, on every turn, held no piece and was named "hidden". The 139 handoffs showed no piece. |
| Desktop, keyboard only | A Shells & Feathers game. The result dialog's focus and Escape. Settings switches, volume arrows (saved) and motion radios. The delete dialog. Checkers moves by Enter and Space. | One defect (below), fixed. |
| Reduced motion | A Shells & Feathers result and a checkers move | No animations ran. |
| Audio | Every `play()` refused; `play()` throwing; muted settings | Games play normally. When muted, no `play()` is called at all. |
| Storage | v1 only; v1 with odd values; corrupt v1; corrupt v2 with v1; a Stage 5 save; wrong types everywhere; a future version | Each loaded, migrated or set the bad copy aside, and played on. |
| Rapid use | 15 restarts during Wise's turn; leaving mid-turn; Back/Forward hammering; restart during the checkers Spirit's chain and during the Fog pause; a double "Play Again" | No stale move, no cancelled game recorded, no game counted twice. |
| Fog privacy | A whole two-player Fog game, recording every sound | Only the move tap, the music and the victory theme were heard. |
| Achievement notice | Greedy play against Gentle until a crowning and a double jump | Each notice appeared once and was saved; none appeared in two-player games. |

**Defect found and fixed.** In the result dialogs and the delete dialog, Tab past the last button left the dialog for the inert page. Escape then no longer closed the dialog. `src/app/dialog-focus.js` now wraps Tab inside the open dialog, and passes Escape to it from anywhere. A browser test covers this, and fails without the fix.

**GitHub Pages.**
- **Paths:** all relative, case-correct and present. A new unit test checks every reference and import.
- **Caching:** Pages caches every file for ten minutes (`max-age=600`, checked on the live site). `tools/stamp-assets.mjs` now gives the stylesheet and every module a content-hashed URL through an import map. This stops a new `index.html` from running against stale modules, or the reverse. A unit test fails while the stamp is stale; it was checked by changing the stylesheet.
- **Jekyll:** `.nojekyll` is added.
- **Already removed:** Phaser and the broken audio paths went in Stage 1. The live v1 page still has both until this branch is merged.
- **Dead code:** the stylesheet has no class used nowhere, and there is no stale markup or unused keyframes.

**Analytics.** The repository has no analytics or event-tracking code and no INSPIRE convention to follow, so none was added. The PR asks which convention, if any, to adopt.

### 0.3 Stage 8: settings, sound, Your Path and achievements

**Settings.**
- Settings holds only what every game shares:
  - **Music** and **Sound effects**, each with a switch and its own volume slider (0–100%; the slider moves the sound as you drag, and the effects slider plays a sample when let go);
  - **Motion:** "Match device" follows `prefers-reduced-motion`; "Reduce" and "Full" override it;
  - **Delete all saved data.**
- Each game's own options (pieces, side, rules, the Spirit's difficulty) stay on that game's setup screen. Settings links to them rather than repeating them.
- Everything is saved in the v2 save (§5.1) and applies at once.
- Motion is applied as `<html data-motion>`, which `styles.css` reads.

**Sound.**
- **Nothing plays until the first tap, click or key press.** The music is wanted from the start and begins on that gesture. It is no longer preloaded: its 7.2 MB file loads only when it first plays.
- **`play()` handling** (`src/shared/audio.js`):
  - **Refused** for lack of a gesture (NotAllowedError): sound locks again, and the next gesture retries the music.
  - **Aborted** by a pause (AbortError): expected, and ignored.
  - **Late refusal:** one that arrives after a newer request is ignored, so it can't undo that request.
  - **Old browsers:** `play()` that throws, or returns nothing, is handled.
- **Fades:** only one runs at a time. A volume change mid-fade retargets it, and the volume is kept within 0–1.
- **Switches and volumes:**
  - turning effects off, or their volume to 0, stops one that is playing;
  - music at volume 0 is paused rather than played silently.
- **Navigation and visibility:** leaving a match stops its victory theme, and the music pauses while the page is hidden.
- **New sounds:** placement and the other side's move (wooden taps), capture, crowning, a revealed piece (Fog), a draw, a loss, and an achievement chime. They are original, synthesized by `tools/make-sounds.py`.
- **Kept, trimmed and re-encoded:** the owner's menu, Shells & Feathers placement, new-game, victory and music files (`tools/prepare-audio.sh`):
  - the short effects had up to half a second of silence before them;
  - their levels differed fivefold;
  - the music and victory theme are now at 96 kbit/s.

  All audio went from 15.4 MB to 7.9 MB. See [`assets.md`](assets.md).
- **Results:** a win plays the victory theme as before. A loss now has a gentle falling pair of notes instead of nothing, and a draw a settling chord.
- **Fog:** sounds never tell a listener what they couldn't see ([`fog-rules.md`](fog-rules.md) §4). With two players, every move is the same tap and nothing else sounds. This also fixes a Stage 6 leak by ear: the mover's mid-chain jumps and blocked tries used to make a sound the other player could hear.

**Your Path.**
- Each game has its own panel. The device owner's games against the Spirit (wins, draws, losses, games, and a table per difficulty) are shown apart from **two-player games on this device**, which never count as the owner's wins.
- Acorns & Leaves shows Classic and Fog of War side by side.
- Shells & Feathers games from v1, which didn't record mode or difficulty, are listed on their own line: "8 games … 5 wins, which may include two-player wins".
- The v1-style totals are still mirrored to `spiritOfTheWoodsStats` for rollback safety.

**Achievements.**

| Game | Achievements |
|---|---|
| Shells & Feathers (7) | First Game, **First Win**, Gentle Win, Balanced Win, Steady Hand, Shared Board, Ten Games |
| Acorns & Leaves (6) | **First Win**, **Crowned** (first king), **Double Jump** (first multi-jump), **Through the Fog** (first Fog win), Wise Victory, Shared Board |

- **Kept in the save:** each is unlocked once and kept with the time it was unlocked (§5.1). It is never announced twice: not after a reload, not when earned again.
- **Where they show:**
  - those a result unlocks are listed in the result dialog ("New achievement: First Win");
  - Crowned and Double Jump appear as they happen in a notice at the top of the screen, which taps pass through and screen readers read out;
  - Your Path shows the date of each.
- **Whose achievements:** wins and moments count only in games against the Spirit. Two-player games give only Shared Board.
- **Older saves:** they get what their records already earned, once, marked "Unlocked earlier".

**Deleting data, explicitly.**
- "Clear Shells & Feathers progress" and "Clear Acorns & Leaves progress" (Your Path), and "Delete all saved data" (Settings), each open a dialog listing exactly what is deleted, with counts, and what is kept.
- Cancel is focused first, and Escape cancels.
- Delete all removes the game's four storage keys (the v1 record included) and nothing else, then reloads with defaults.
- If storage is blocked or full, Settings and Your Path say that nothing is being saved, and Delete all says it couldn't delete.

**Checks.**

| | Result |
|---|---|
| Unit tests | 195 (was 165) |
| Browser tests | 85 (was 76) |
| Contrast audit (Stage 7 script, with the new screens and the delete dialog) | 0 of 1,750 text runs below AA |

- **Deliberate bugs:** ten were put in one at a time and each was caught by a named test:
  - an achievement unlocking twice;
  - backfilling a cleared save;
  - clearing that keeps achievements;
  - Delete all keeping the v1 key;
  - two-player moments unlocking;
  - no save-failure flag;
  - effects before a gesture;
  - unvalidated volumes;
  - v1 games not migrated;
  - volume outside 0–1.
- **Audio and Fog safeguards:** three more deliberate bugs (the stale-refusal guard, and the two Fog sound rules) were also caught.

### 0.4 Stage 7: one Spirit of the Woods look

The hub and both games now share one look, polished as one collection. The palette (browns, sand, cream, turquoise and sunset orange on the brown-to-sky gradient), the Uncial Antiqua and Cinzel type, and the Shells & Feathers pieces and wording are kept. Nothing about play, rules, routes or saves changed. Assets and their sources are listed in [`assets.md`](assets.md).

**Hierarchy.**
- Every screen opens with its title on a bark plaque, the same width as the panels below it. Before, titles, subtitles, "Choose a game" and the "How to Play" links sat straight on the light middle of the gradient. "Choose a game" and the text links are now small bark pills.
- The decorative turquoise-and-orange rule moved under the hub title.

**Boards.**
- **Shells & Feathers** is a solid wooden tray with lighter wooden squares, after the board on the owner's title card. Before, it was a pale, see-through board. Pieces have a thin dark edge, so pale shells and brown feathers both stand out.
- **Hover and press:** a teal inner ring.
- **Winning line:** gold squares with the existing 3px dark edge.
- **Acorns & Leaves:**
  - Coordinates on dark squares sit on a small backing, so they stay readable over pieces, rings and route tints.
  - Fogged squares are lighter mist with dark coordinates. The "must capture" ring is steady instead of blinking.

**Pieces.** The acorn and leaf pieces were redrawn as original SVG:
- shaded discs;
- a scaled acorn cap;
- a two-tone leaf;
- a gold-gradient crown;
- on kings, a larger emblem, so it still reads on 36px squares.

The symbol IDs are unchanged.

**Turn cues.** Shells & Feathers now has one chip per player, like Acorns & Leaves: the piece, the name and the score.
- The player to move gets a colored edge and a "To move" tag: turquoise for Player 1 or you, orange for Player 2 or the Spirit.
- After a win, the winner's chip turns gold with a "Winner" tag.
- The turn line no longer pulses.
- Both games share the same chip styles.

**Result panels.** Both games use one panel:
- a wooden medallion with the winning piece (both pieces for a draw);
- the result and message as before;
- a summary line: the session score in Shells & Feathers, the captured counts in Acorns & Leaves. Screen readers read it with the result (`aria-describedby`);
- the actions.

Victory feedback is restrained: the medallion gets one soft gold glow, and the winning squares glow twice and then stay gold. There is no confetti and nothing loops.

**Buttons.**
- **Fixed:** hover and press on teal buttons, and hover on outlined buttons, fell back to the plain brown button's style. The plain button's state rules had higher specificity. They now sit in `:where()`, so each kind keeps its own hover and press.
- **States:** every button kind has a distinct hover, press, disabled and focus state.
- **Contrast:** teal buttons are a little deeper, so their text meets 4.5:1.

**Motion.**
- **Removed:** every endless animation (the drifting background light, the title glow, the turn line pulse, the winning-square pulse, the blinking capture ring).
- **Softened:**

  | | Before | Now |
  |---|---|---|
  | Screen change | 0.4 s, 20px slide | 0.24 s, 8px |
  | Result panel | 0.5 s, 50px drop | 0.24 s, 12px rise |
  | Shells & Feathers piece | 0.5 s spin | 0.24 s settle |
- **Reduced motion:** `prefers-reduced-motion` turns every animation and transition off (`none`); every state still shows at once.
  - Before, the rule cut every duration to 0.01 ms. That gave every property on every element a one-frame transition, so a chip or the turn line could show its old color for a frame.

**Layout on short screens.**
- **Chips:** in landscape (640×360) the Shells & Feathers chips cut "Player 1: 0" to "Pl…".
  - Chip text now wraps instead of being cut off.
  - On short landscape screens the two Shells & Feathers chips stack, one per row, so the name and score stay on one line.
  - Chip pieces are smaller there.
- **Result panel in landscape:** the medallion sits beside the title, and the panel fits without scrolling.
- **Checkers squares:** on a 360×560 Android screen (a Galaxy S5 with browser bars) they were 35px. The board now uses the spare height, giving 36px squares, and the whole match still fits.
- **No scroll blocking:** menus, How to Play, Settings and Your Path scroll normally. Matches and result panels fit without scrolling at every size checked.

**Audit (scripted; before → after).** Every screen and overlay was checked at 360×640, 360×560, 640×360 and 1280×800:

| Check | Before | After |
|---|---|---|
| Text below WCAG AA | 111 of 1417 runs | 0 of 1439 |
| Controls under 44px (checkers squares under 36px) | 64 squares on the 360×560 screen | 0 |
| Focused controls without a visible ring | 0 | 0 |
| Clipped text | 0 | 0 |

How contrast was measured: each text run was compared with the pixels actually rendered behind it, with the text hidden. Text shadows were ignored, so the figures are conservative.

**Assets.** [`assets.md`](assets.md) lists every file, font and drawing, with its source and terms. Open items for the owner:
- the six MP3s have no recorded source or license;
- the two PNGs in the repository are unused;
- the README's "Native-American–inspired" and "ancient motifs" wording is not sourced, or shown anywhere in the game.

No ceremonial or cultural imagery was added.

### 0.5 Stage 6: Fog of War for Acorns & Leaves

Fog of War is a separate Acorns & Leaves mode, chosen with "Rules: Classic / Fog of War" on the setup screen. It has its own routes (`#/acorns-leaves/fog/single`, `…/fog/two`) and its own records. **Classic is unchanged:** same rules, full visibility, and its tests pass as before. The exact rules are in [`fog-rules.md`](fog-rules.md), written before the code.

**Rules in brief.**
- **What you see:** your own pieces always. An opponent piece only when it is on a dark square next to one of your pieces. Every other dark square is fogged (hatched mist, named "hidden"). The terrain and coordinates stay visible, and the fog lifts when the game ends.
- **The real board decides** legal moves and compulsory captures (Classic rules). You are offered the moves that look possible from your view:
  - **Captures first:** a jump looks possible when a visible enemy piece is next to yours and the landing square is known to be empty or fogged. If any jump looks possible you must try one, and the game says "may", never "must".
  - **A try commits you:** if the landing square is free, the jump is made.
  - **Blocked:** if a hidden piece is there, nothing moves, that one piece is shown to you for the rest of the turn ("Blocked: a hidden leaf is on e5"), and you choose again. With no capture left to try, ordinary moves open.
  - **Chains:** a chain must try every further jump that looks possible, and ends where a block leaves none.

  Every real capture always looks possible, so this is exactly the Classic rule on the real board. The tests check this over thousands of random positions.

**Never revealed.**
- **The page:** the board is drawn only from the viewer's view, never the real board. No hidden piece appears in the DOM, piece attributes, accessible names or marks. Pick, ring and landing highlights come from what looks possible.
- **The opponent's move:** it is not animated or highlighted. It is described only as far as the viewer can see: "The Spirit moved, capturing your acorn on d4. In view now: leaf on e5."
- **The Spirit:**
  - It decides from its own view only (`fog.js` `observation()`); the tests give it two real boards that look the same and check it always makes the same choice.
  - It decides as its turn starts, and its move appears after a fixed 0.9 s pause, so its thinking time shows nowhere.
  - It goes through the same tries and blocks as a player. It imagines boards that fit its view (`fog-ai.js`) and searches them with the Classic search, under the same 12,000-position / 40 ms bound.
  - In AI-vs-AI Fog games, Wise beat Gentle 6–0, Balanced beat Gentle 5–1, and Wise beat Balanced 4–2.
- **Records:** results only, kept apart from Classic. Acorns & Leaves has no achievements.

**Two players.**
- **Handoff screen:** before every turn, an opaque full-screen handoff ("Leaves' turn: pass the device") hides the board until the next player presses "Show the Leaves' board". It also offers "Leave this game".
- **Behind it:**
  - the board has no pieces, marks or last-move hints;
  - the match screen is inert;
  - the keyboard stop is reset to a3;
  - the only announcement is "Move made", so nothing about the last move is left in the page.

  The next player hears only what they can see.

**Leaks found and fixed while building it.** All three were in two-player Fog, plus one timing detail:
- The mover's description of their move stayed in the announcement region during the handoff.
- The board's keyboard stop stayed on the square the last player used.
- The Spirit originally decided after its pause, so its search time added to the pause. It now decides first.

**Playtests (scripted, real timers, screenshots reviewed).** The scripted player saw only the page: it chose among the pieces and squares the page offered. Every turn it checked that no piece was drawn in fog.

| Device (emulated) | Game | Result | Notes |
|---|---|---|---|
| Desktop 1280×800 | Fog vs Wise, playing Acorns | Spirit won | 62 Spirit turns, pause 0.9 s each; 5 blocked tries (3 ended a chain); no long tasks |
| iPhone SE 320×568, touch, 4× CPU throttle | Fog vs Balanced, playing Leaves (turned board) | Player won | 33 Spirit turns; 2 blocked tries; 9 tasks over 50 ms, longest 67 ms |
| Pixel 7, touch | Fog, two players | Leaves won | 54 handoffs, no piece behind any of them; 20 blocked tries |

Each game was recorded once in the Fog records. The match fitted the screen, there were no page errors, and the fog lifted at the end. Screenshots reviewed:
- the start;
- "may capture" rings;
- a blocked try with the found piece framed;
- a chain trying a fogged landing;
- the Spirit thinking;
- the handoff screen;
- the board after a handoff;
- the result, and the revealed final board.

### 0.6 Stage 5: Acorns & Leaves is playable

The checkers engine from Stage 4 now drives a real game in the hub. The hub card says "Ready to play" and leads to a setup screen (side and Spirit difficulty), then a match for two players on one device or against the Spirit, then a result dialog with Rematch, Change Mode, All Games and View Board. Records appear in Your Path. Shells & Feathers is unchanged, and there is no Fog of War.

**Rules stay in the engine.** The new code is split the way Shells & Feathers is:

| File | Role | DOM? |
|---|---|---|
| `engine.js` | The rules (Stage 4). Added `analyze` (result and moves in one pass) and `playLegalMove` (unchecked apply, for the AI's search); faster piece counting. Rules unchanged: the 300 random games now also check that both new functions agree with the old ones. | No |
| `turn.js` | Picking a move a square at a time: piece, then each landing square, until the squares spell a legal move. Says why a pick does nothing (must capture, must keep jumping, not a destination). | No |
| `ai.js` | The Spirit (below). | No |
| `text.js` | Square names (a1–h8), move, turn, result and guidance wording. | No |
| `session.js` | One match: turns, the Spirit's timed moves, results, sounds, scoring once. Draws through a view object. | No |
| `view.js` | The 8×8 board, side panels, turn and guidance lines, announcements, result dialog, keyboard movement. Draws the session's model; knows no rules. | Yes |
| `pieces.js` | Piece icons from the SVG symbols in `index.html`; the mini boards on the hub card and rules page. | Yes |
| `setup.js` | The setup screen's side and difficulty choices (saved). | Yes |

`preview-board.js` (the static emoji picture) is gone; the card and the rules page draw the engine's own starting position.

**Board and pieces.**
- **Board:** 8×8, light and dark wood. The 32 dark squares are buttons, with coordinates on the edge squares (files a–h, ranks 1–8 from the Acorns' side).
- **Pieces:** inline SVG, so they look the same on every device (no emoji).
  - Acorns: a light wooden disc, dark rim, acorn on top.
  - Leaves: a dark green disc, cream rim, leaf on top.
  - Checked in grayscale: the sides still differ by lightness, rim and emblem shape.
- **King:** a crown, a gold ring and a second disc underneath, keeping its side's face and emblem.
- **Turned board:** against the Spirit the player's side sits at the bottom, so playing the Leaves turns the board round. Arrow keys follow the screen.

**What the board shows.** Each mark has a shape as well as a color, and each is in the square's spoken name.

| Situation | On screen | Spoken (square name) |
|---|---|---|
| Piece picked up | Gold square, piece raised | "c3: acorn, selected" |
| Where it can go | Turquoise dot (move) or ring (jump) | "d4: empty, move here" / "jump here" |
| Captures are compulsory | Pulsing orange ring on each piece that must capture; guidance "You must capture: choose a ringed piece." | "must capture" |
| A chain of jumps | The piece moves to each landing square; jumped pieces fade and get a cross until the move ends; the route so far is tinted; "Keep jumping: choose the next ring." Other picks, and Escape, are refused. | "being captured" |
| The last move | Tinted route; faint crosses where pieces were taken | "last move", "captured in the last move" |
| Whose move | Side panel with a turquoise edge and a "To move" tag; turn line ("Your Turn", "Spirit's Turn", "Acorns' Turn") | Announced after each move |
| Captured counts | "Captured N" in each side's panel | Read with the panel |
| Result | Turn line shows the title, winner's panel gets a "Winner" tag, the board locks, then the dialog | Announced with the reason |

The status region (outside the screen, like Shells & Feathers) announces picks ("Acorn on c3 picked up. It can move to b4 or d4."), each move with its route and captures ("The Spirit jumped from c7 to e5 to c3, capturing 2 acorns. Your turn."), crowning, refusals and results.

**The Spirit** (`ai.js`, details in [`acorns-leaves-rules.md`](acorns-leaves-rules.md#the-spirit)):
- It only ever returns one of the engine's legal moves, and the session still plays it through `applyMove`.
- **Search:** iterative-deepening alpha-beta, extended while captures are forced.
- **Bounded:** 12,000 positions or 40 ms per move, whichever comes first.
- **Levels:** Gentle looks one move ahead with a lot of variety; Balanced looks three plies ahead; Wise searches as deep as the bound allows.
- **Its turn:** it waits 0.5 s, then shows its move a square at a time (0.4 s per square) so chains can be followed.
- **Stray input:** from the start of its turn until its move is played, the board is `aria-busy`, every square is `aria-disabled`, and the session ignores every pick and Escape.
- **Cancelling:** the match's timer scope holds the pause and every step. Restart, Rematch, Change Mode, Back, going home and switching to Shells & Feathers all dispose it, even halfway through a chain.

**Never freezing the page.** Measured in Chromium with a long-task observer (tasks over 50 ms) during whole games against Wise:
- With a first 50 ms bound, every Wise turn on desktop came out at 50–55 ms, and up to 64 ms under 4× CPU throttling (a slower phone).
- The bound is now 40 ms. A whole desktop game against Wise (44 Spirit moves) produced no task over 50 ms. A whole 320×568 game at 4× throttling (154 Spirit moves) produced 8 tasks between 50 and 55 ms.
- A slower device simply searches less deeply.

**Records and settings.**
- The save file (still v2) gains an `acornsLeaves` section (§5.1): the side and difficulty last chosen, wins, draws and losses per Spirit difficulty, and two-player Acorns wins, Leaves wins and draws.
- A save from Stage 4 or earlier loads with that section added and everything else untouched. Unknown fields are kept.
- Checkers games never touch the v1 totals or the Shells & Feathers achievements.
- Your Path shows both games, and each game has its own Clear button.

**Layout.** At every size the whole match fits on one screen without scrolling, even with two-line guidance:

| Viewport | Board | Square |
|---|---|---|
| 320×568 | 290 px | 36 px |
| 360×640 | 334 px | 42 px |
| 750×340 | 294 px | 37 px |
| 1280×800 | 508 px | 64 px |

- Landscape phones put the board beside the panel.
- Squares are 36 px on the narrowest phone: 8 squares can't reach 44 px in 320 px. That is above the 24 px WCAG minimum, and every other control is still 44 px or more.
- The board alone uses `touch-action: manipulation`; nothing blocks scrolling or pinch zoom, and a swipe across the board is not a move.

**Wording.** "Ready to play" card; the rules page is shorter and covers the board marks and keys. The setup screen says "Acorns move first. Your pieces start at the bottom of the board." No origin claims, and no ceremonial or tribal wording.

**Playtests (scripted, real timers, screenshots reviewed).** Emulated devices in Chromium, final code. Human moves were chosen by the engine's own AI in Node and played by taps or clicks; every Spirit move was matched to one of the engine's legal moves.

| Device (emulated) | Game | Result | Notes |
|---|---|---|---|
| Desktop 1280×800 | vs Wise, playing Acorns | Player won (the Spirit had no move) after 89 plies | 44 Spirit moves, all legal; 4 crownings; no long tasks |
| iPhone SE 320×568, touch, 4× CPU throttle | vs Wise, playing Acorns | Draw by the 40-move rule after 308 plies | 154 Spirit moves, all legal; 6 crownings; 8 tasks of 50–55 ms |
| iPhone SE 320×568, touch, 4× CPU throttle | vs Balanced, playing Leaves (turned board) | Draw by the 40-move rule after 161 plies | 81 Spirit moves, all legal; two double jumps by the player |
| Pixel 7, touch | Two players | Acorns won (the Leaves had no move) after 47 plies | Recorded as an Acorns win |
| Desktop 1280×800 | vs Gentle, playing Acorns | Player won (every leaf captured) after 67 plies | Two double jumps by the player, one by the Spirit, shown a square at a time |

Each game was recorded exactly once, in the right bucket. No page errors in any run, and the match fitted the screen at the end of every game. An earlier run, before the fixes below, had a Wise win for the Spirit after 234 plies. Screenshots reviewed:
- picking a piece;
- must-capture rings;
- the player's and the Spirit's chains mid-jump;
- crowning;
- the Spirit thinking;
- result dialogs and final boards.

The 320 px draw run found guidance and result text wrapping to three lines and pushing the controls off screen, and side names being cut short. Fixed: shorter wording, a tighter header, "You"/"Spirit" names with the side spoken, and a fit check with the longest guidance.

### 0.7 Stage 4: the Acorns & Leaves rules engine

`src/games/acorns-leaves/engine.js` is a pure Classic Checkers engine (American checkers / English draughts), separate from any user interface. The full rules and every rule choice are in [`docs/acorns-leaves-rules.md`](acorns-leaves-rules.md).

**Rule choices.**
- Acorns move first and move up the board; Leaves move down.
- Ordinary pieces move and capture forward only; there are no backward captures.
- Kings move and capture one square in any direction (no flying kings).
- Captures are compulsory, with a free choice between them.
- Chains must be completed by the same piece. A piece can't be jumped twice, and jumped pieces are removed when the move ends.
- Crowning ends the move, even partway through a chain.
- A side with no pieces, or with no legal move on its turn, loses.
- The engine also draws a game after 40 moves each with no capture and no ordinary-piece move, so every game ends.

**API.**
- `createInitialState`
- `legalMoves` / `legalMovesFrom` / `findMove`
- `applyMove`, which validates the move, applies it and switches the turn. Illegal moves throw `IllegalMoveError` with a reason code and message.
- `switchTurn`
- `gameResult`
- `positionFromRows` / `rowsFromBoard`

**Tests.** 26 unit tests, including 300 seeded random games checked against the rules on every move. Nine rule bugs were introduced one at a time, and each made the tests fail.

**Still a preview (until Stage 5).** The hub card, preview notice and rules page said the rules were ready but the board wasn't, and stated the forward-only captures, the free choice between captures, crowning ending the move and the draw rule. Shells & Feathers was unchanged. Fog of War was not part of this stage.

### 0.8 Stage 3: Shells & Feathers inside the hub

The game keeps everything it had:
- Shell 🐚 and Feather 🪶 pieces;
- the choice of side;
- Gentle, Balanced and Wise;
- local two-player play;
- its stats.

This stage audited every match flow in the real page, fixed what the audit found, and added checks for each flow.

**Match-flow audit.** Each flow was driven in Chromium, then rechecked after the fixes.

| Flow | Found | Now |
|---|---|---|
| First move | Player 1 (you, in single player) moves first. The turn line was the only cue. | Unchanged rule. The status region also says "New round. Your turn." |
| The Spirit's turn | Empty squares still looked and announced as playable; taps were silently ignored. Where the Spirit moved was never announced. | The board is marked busy and its empty squares unavailable (progress cursor) for the 800 ms. The Spirit's move is announced ("The Spirit placed a feather on row 3, column 1. Your turn."). |
| Win / draw | After the end, empty squares still said "empty" with a pointer cursor. The winning line was marked by color only. The result was announced only as the title. | The board locks (all squares unavailable; empty ones fade to a dashed outline). Winning squares also get a solid edge and are named "winning line". The status names the line ("Three shells in the top row.") or the draw. |
| Rematch | Worked. | Unchanged; checked that nothing is re-scored. |
| Leaving mid-turn, switching games | Worked (Stage 1 timer scopes). | Checked again for Restart, Change Mode, Back, going home and switching to Acorns & Leaves, during the Spirit's turn. |
| Scoring twice | No double score found, even after two synchronous clicks plus key repeats on the winning square. | Now an explicit rule as well: `session.js` records a round at most once (`scoredMatch`). It backs up the rules, which already refuse moves after the end. Rounds that are restarted or left are never scored. |

**Board accessibility.**
- The nine squares are buttons, with one tab stop and arrow, Home and End keys. Enter or Space places a piece.
- Each square's name gives its row, column and contents, and "winning line" where it applies. Taken squares, and every square while the board waits or is over, are `aria-disabled`.
- A polite status region outside the match screen announces each move, whose turn it is, and the result. It sits outside so that the dialog making the board inert can't cut off the last announcement. The turn line itself is no longer a live region, so nothing is announced twice.
- **Focus:** a 3 px dark ring outside each square and a cream edge inside. Neither uses box-shadow, so the winning glow can't hide it. Squares no longer transition "all" properties, so the ring appears instantly.
- **Touch:** squares are at least 60 px on a 320 px-wide phone, and every control in the app is at least 44 × 44 px (checked at four screen sizes).

**Gestures.** There is no `touchmove` blocking anywhere. Stage 3 also removed `overscroll-behavior: none` from `body`, which had disabled pull-to-refresh and overscroll on every screen. The only gesture setting left is `touch-action: manipulation` on the board and its squares: no double-tap zoom delay, while scrolling and pinch zoom still work. A swipe across the board is not taken as a move.

**Phone smoke test.** iPhone SE (320×568), Pixel 7 (412×839) and iPhone 12 landscape (750×340), emulated in Chromium, taps only:
- hub → setup (Feather, Balanced) → a full game against the Spirit → View Board → Restart;
- Change Mode → a two-player win → All Games → Your Path.

On all three: no errors, no sideways scrolling, and exactly two games recorded. Screenshots of the waiting, result and final-board states were reviewed.

**Known limit (unchanged).** Two tabs playing at once each keep their own copy of the records, and the last one saved wins. Nothing is double-counted, but one tab's games can be overwritten.

### 0.9 Stage 2: the game hub

The opening screen is now a hub for Spirit of the Woods games.

**Games.**
- **Shells & Feathers (Tic-Tac-Toe)** is marked "Ready to play" and has Play and How to Play.
- **Acorns & Leaves (Checkers)** is a clearly marked preview: a dashed, muted card with a "Preview · not playable yet" badge and a static picture of the starting position. Its only control is How to Play.
  - There is no play button, no play route and no disabled-looking play control.
  - Its How to Play page states that the engine isn't built yet, and gives the rules the first version is planned to follow.

**Path through the app.** Every step is a real URL (§4.1), so Back/Forward, reload and bookmarks work. Hub → game setup (pieces and Spirit difficulty) → match → result dialog. From the result dialog:
- **Play Again** keeps you in the match.
- **Change Mode** goes back to setup.
- **All Games** returns to the hub.
- **View Board** closes the dialog and shows the final board.

Settings (sound, music) and Your Path (totals, records per difficulty and two-player, six achievements, Clear) are linked from the hub.

**Look and feel.** The forest palette, fonts, gradient and the Shells & Feathers board and pieces are kept.
- Content sits on darker panels so cream text stays readable over the light end of the gradient.
- Long text uses a serif body font.
- Hierarchy is primary teal (from the existing turquoise), then brown, outlined and quiet buttons. Each has visible hover, pressed, focus and disabled states.

**Keyboard and accessibility (X1).**
- Squares are buttons: one tab stop, arrow keys to move, Enter or Space to play. Each square has a spoken label ("Row 1, column 2: shell").
- The turn line is a live region.
- The result dialog is a real dialog: it takes focus, the board behind it is inert, and Escape closes it.
- Focus moves to each new screen's heading.
- Toggles and options are real checkboxes and radios.
- Pinch zoom is allowed again, and motion is reduced when the system asks for it.

**Wording.** "Sacred Settings", "Your Sacred Journey", "Return to Lodge" and the eagle icon are gone. The hub and new pages use plain, nature-based language. Acorns & Leaves is described only as checkers (draughts) with a forest look, with no claim about its origins. The Shells & Feathers result lines ("The spirits smile upon you", …) are kept as part of that game's recognizable presentation.

**Layout findings fixed in this stage.**

| ID | Status |
|---|---|
| L1 | **Fixed.** On short landscape screens the board sits beside the score and controls and fits the screen height. |
| L2 | **Fixed.** Screens scroll when taller than the window. |
| L3 | **Fixed.** The drifting background is fixed-position, and the fade-in no longer adds overflow. |
| T1 | **Fixed.** The page-wide touch block is gone; the board uses `touch-action: manipulation`. |
| P3 (CSS) | **Fixed.** The unused celebration styles are removed. The unused PNGs remain. |
| ST1 | **Fixed.** Your Path shows the per-mode breakdown next to the v1-style totals. |

### 0.10 Stage 1: modules, lifecycle, save migration

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


## 4. Module boundaries (Stage 1, extended in Stages 2–5)

The site is still static with **no build step**. `index.html` loads `src/main.js` as a native ES module, and Pages serves the files as they are. There are no runtime dependencies.

```
index.html               markup only: every screen, both result dialogs, the
                         SVG piece symbols, <audio>
styles.css               forest theme; S&F board styles carried over from v1
src/
  main.js                entry: createApp(...).init()
  app/                   navigation and app composition
    app.js               builds services, router, screens and both games'
                         sessions; routes link clicks, runs data-action
                         buttons, moves focus
    router.js            hash routes (§4.1): go(), up(), back(), Back/Forward
    navigation.js        shows one .screen at a time; leave() on the old screen,
                         then enter(...args) on the new one
    settings-screen.js   sound and music toggles (saved)
    path-screen.js       "Your Path": both games' records, S&F achievements, Clear
  shared/                used by any game; no DOM except the <audio> elements
    storage.js           guarded localStorage access (never throws) + readJson
    save-data.js         v2 save schema: defaults, validation, v1 migration (pure)
    profile.js           loads/repairs/migrates the save; settings and records API
    audio.js             music with one cancellable fade at a time; sound effects
    timers.js            createTimerScope(): after(ms, fn) / dispose()
  games/shells-feathers/ the playable game
    rules.js             lines, winner, full board, empty cells (pure)
    ai.js                the Spirit: chooseMove(board, {ai, human, difficulty, rng}) (pure)
    match.js             one game's state: turn, play(i), result, outcome (pure)
    session.js           runs matches on the match screen: Spirit turns, results,
                         session score, sounds (no DOM; talks to view.js)
    view.js              board, turn line, score, match info, result dialog;
                         arrow-key movement between squares (DOM)
    setup.js             setup screen: Player 1 pieces and Spirit difficulty (saved)
    achievements.js      six achievements derived from the saved records (pure)
  games/acorns-leaves/   checkers (docs/acorns-leaves-rules.md)
    engine.js            Classic Checkers rules: setup, legal moves, applyMove,
                         switchTurn, gameResult, analyze (pure)
    ai.js                the Spirit: planMove/chooseMove, bounded search (pure)
    turn.js              picking a move a square at a time (pure)
    text.js              square names and every announcement and line (pure)
    session.js           runs matches: turns, the Spirit's timed moves, results,
                         sounds (no DOM; talks to view.js)
    view.js              8×8 board, side panels, turn and guidance lines,
                         announcements, result dialog, arrow keys (DOM)
    pieces.js            piece icons and mini boards from the SVG symbols (DOM)
    setup.js             setup screen: rules, side and Spirit difficulty (saved)
    fog.js               Fog of War: what each side sees, moves tried against
                         that view, the Spirit's observation (pure; docs/fog-rules.md)
    fog-ai.js            the Spirit in Fog: imagined boards that fit its view (pure)
```

**Dependency rules.**
- `games/*/rules|engine|ai|match|turn|text|fog|fog-ai|achievements` are pure.
- In Fog, nothing outside `fog.js` and `session.js` reads the real position before the game ends: the view gets the viewer's view, and `fog-ai.js` gets only `observation()`.
- Each `session.js` takes its view, audio, profile, clock and random source as parameters (the checkers one also its AI and starting position), so the unit tests run it with fakes.
- Only `view.js`, `setup.js`, `pieces.js` and `app/*` touch the DOM.
- Only `storage.js` touches `localStorage`.
- Only `audio.js` touches `<audio>` elements.
- One exception, chosen on purpose: `shared/save-data.js` imports each game's sides and difficulty lists, because the save file stores their records.

### 4.1 Routes

| URL | Screen |
|---|---|
| `#/` (or no hash) | Hub |
| `#/shells-feathers` | Shells & Feathers setup (pieces, difficulty, mode) |
| `#/shells-feathers/play/single`, `…/play/two` | Match (a fresh match each time the route is entered) |
| `#/shells-feathers/how-to-play` | How to Play Shells & Feathers |
| `#/acorns-leaves` | Acorns & Leaves setup (side, difficulty, mode) |
| `#/acorns-leaves/play/single`, `…/play/two` | Classic checkers match (a fresh match each time the route is entered) |
| `#/acorns-leaves/fog/single`, `…/fog/two` | Fog of War match (same screen; a fresh match each time) |
| `#/acorns-leaves/how-to-play` | How to Play Acorns & Leaves |
| `#/settings`, `#/your-path` | Settings, Your Path |
| anything else | Hub (the URL is rewritten to `#/`) |

Hash routes keep every screen on `index.html`, which GitHub Pages can serve without server rewrites.

Navigation uses real links, so new tabs and keyboard Enter work. The app routes link clicks itself, adding a history entry that remembers the screen it came from:
- `data-up` links ("All games", "Change Mode") step **back** through history when the target is the previous screen, so Back and Forward stay predictable instead of piling up entries.
- `data-back` links ("← Back") return to the previous screen of this visit, or to the hub on a fresh visit.
- Leaving either match screen by any route (a button, Back, or a typed URL) runs that game's match teardown.

**Initialization and teardown.**
- `createApp({ doc, win }).init()` runs once:
  - loads the profile (and migrates it);
  - binds the click routing, both boards, both setup screens and the settings controls;
  - draws the checkers mini boards and renders Your Path;
  - arms the "first click starts the music" listener;
  - starts the router, which shows the screen for the current URL.
- **Navigation:** `nav.show(id)` always calls the current screen's `leave()` before the next screen's `enter()`.
  - Each match screen's `enter(mode)` calls its session's `enter(mode)`, and its `leave()` calls `leave()`.
  - After each route change, focus moves to the new screen's heading, or to the board for a match.
- **Matches:** every match gets its own timer scope, and `teardownMatch()` runs first in `startMatch()` and in `leave()`. Teardown:
  - disposes the match's timers (Spirit move, result dialog, music restart);
  - closes the result dialog;
  - stops the victory sound;
  - clears the Spirit-thinking lock.

  A disposed scope ignores later `after()` calls, so nothing from an old match can fire. This covers Restart (`restart()`), Play Again / Rematch (`playAgain()`) and leaving (`leave()`). The checkers session works the same way; its scope also holds each step of the Spirit's chain of jumps.
- **Music:** `audio.js` keeps one fade timer. Starting a fade cancels the running one. `startMusic()` while music is playing ramps back up from the current volume (v1 dropped it to silence first). `stopMusic()` pauses only when its own fade finishes.

**Remaining order of work.**
1. **Real-device and screen-reader pass** (§6.4), now including Acorns & Leaves (VoiceOver and TalkBack on the 64-square board, touch play on a real small phone).
2. **Cleanup:** the unused PNGs (P3), music preloading (P2), `.nojekyll`.
3. **Acorns & Leaves extras**, if wanted: achievements, a session score, undo in two-player games. In Fog, the Spirit could remember where it last saw pieces; today it imagines unseen pieces afresh each turn.

---

## 5. Save format and migration (implemented in Stage 1)

### 5.1 Schema (v2)

Key: `spiritOfTheWoods:v2`

```json
{
  "version": 2,
  "settings": { "sfx": true, "music": true, "sfxVolume": 50, "musicVolume": 30, "motion": "system" },
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
    },
    "achievements": { "first-win": { "at": 1793050000000 } }
  },
  "acornsLeaves": {
    "settings": { "difficulty": "easy", "side": "acorn", "variant": "classic" },
    "stats": {
      "single": {
        "easy":   { "wins": 0, "losses": 0, "draws": 0 },
        "medium": { "wins": 0, "losses": 0, "draws": 0 },
        "hard":   { "wins": 0, "losses": 0, "draws": 0 }
      },
      "twoPlayer": { "acornWins": 0, "leafWins": 0, "draws": 0 },
      "fog": { "single": { "…": "same shape as above" }, "twoPlayer": { "…": "same shape as above" } }
    },
    "achievements": {}
  },
  "migratedFrom": null
}
```

- App-wide settings (sound, music) sit at the top level. Each game's settings and records sit under its own key: `shellsFeathers`, and since Stage 5 `acornsLeaves` (the side the player takes against the Spirit, the Spirit's difficulty, and results from the player's side).
- Stage 6 added `settings.variant` (the rules last chosen) and `stats.fog` (Fog of War records, same shape as Classic), also without a version bump.
- Stage 8 added, again without a version bump:
  - `settings.sfxVolume` and `settings.musicVolume`: whole numbers 0–100; anything else falls back to 50 and 30.
  - `settings.motion`: `system`, `reduce` or `full`.
  - `<game>.achievements`: each unlocked achievement keyed by id, `{ "at": <ms since 1970> }`, or `{ "at": null }` for one found in the records of an older save.
  - **Backfill:** a save with no `achievements` field gets them worked out from its records, once. Afterwards the field exists, even when empty after a clear, so nothing comes back. A v1 player gets First Game, and Ten Games with ten or more games, the same way.
  - **Repair:** malformed entries are dropped. Ids from a newer build are kept but not shown.
- **Unlock once:** an id already present is never unlocked or announced again. Only "Clear … progress" for its game removes it. The definitions are in `src/shared/achievements.js`.
- `acornsLeaves` was added without a version bump: a v2 save without it gets the defaults when loaded, field by field, like any other missing field. Stage 4 builds keep the section as an unknown field.
- `legacy` holds the v1 numbers as they were: v1 can't be split by mode or difficulty. `migratedFrom` is `1` when the save came from v1.
- "Your Path" (since Stage 8) shows each game's own games against the Spirit apart from two-player games, and the v1 games on their own line. They can't be split, and v1 counted two-player wins as victories. `summarizeStats()` still gives the v1-style totals: they are mirrored to the v1 key, and they count toward First Game and Ten Games.
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

`storage.js` guards every call. If storage is blocked, reads return nothing and writes report failure. The game keeps its records and settings in memory for the session and logs one console warning. Since Stage 8, Settings and Your Path also show a note that nothing is being saved.

### 5.3 Writes

- **When:** settings changes and every finished game write the v2 save.
- **Dual-write:** finished games and Clear Path also write the v1-shaped totals to `spiritOfTheWoodsStats`. An older build, after a rollback, then shows the player's current totals. On the next load of this build the totals match and nothing is double-counted.
- **Clearing:** explicit player actions only, each behind a dialog that lists exactly what goes and what stays (Cancel is focused, and Escape cancels):
  - **"Clear Shells & Feathers progress"** (Your Path) deletes that game's records, including the v1 games, and its achievements. The v1 mirror goes to zero to match. Settings and the other game are kept.
  - **"Clear Acorns & Leaves progress"** does the same for Acorns & Leaves (Classic and Fog).
  - **"Delete all saved data"** (Settings) removes every key the game writes: the v2 save, the v1 record `spiritOfTheWoodsStats`, and both `:corrupt` copies. It then reloads with defaults. Nothing else in the browser's storage is touched. If storage refuses, the page says what couldn't be deleted.

### 5.4 Checks

`tests/unit/migration.test.mjs` covers:
- the table from the audit plan: nothing stored, valid v1, odd v1 values, unreadable v1, valid v2 with unknown fields, corrupt v2 plus v1, bad v2 fields;
- the rollback fold-in (without double counting);
- the dual-write;
- clearing each game;
- settings validation, including volumes and motion.

`tests/unit/hub-content.test.mjs` covers achievements:
- unlocked once, across reloads;
- backfill;
- repair of malformed entries;
- clearing one game;
- delete all;
- blocked storage.

Storage failure is covered in both files: storage that throws on every call, a storage getter that throws, and write-only failure (quota).

In the real page:
- `tests/browser/storage.test.mjs` repeats the important migration cases;
- `tests/browser/settings-progress.test.mjs` covers settings, achievements, deleting data and blocked storage.

---

## 6. Test plan

### 6.1 Automated tests (current)

```sh
npm ci
npx playwright install chromium   # skip if PLAYWRIGHT_BROWSERS_PATH already provides it
npm test                          # = npm run test:unit && npm run test:browser
```

**Unit tests** (`tests/unit`, plain `node --test`, no browser; about 15 s, most of it the checkers AI playing whole games). Timers run on a fake clock, so every pending callback is visible.

| File | Covers |
|---|---|
| `session.test.mjs` | **Scoring once:** a round is recorded once whatever follows its last move (taps, Play Again, Restart), including when the Spirit ends it; rounds restarted or left before the end are never recorded. **Board states:** ready → waiting → ready → over; two players never wait. Each move names who made it. **Reset and stale callbacks.** Restart cancels the pending Spirit move, and the new match gets its full 800 ms. Leaving during the Spirit's turn records nothing and plays nothing. The result dialog never opens after Restart, Play Again or leave, and opens exactly once if the player stays. Play Again stops the victory sound and restarts music after 300 ms; that restart is cancelled by a restart. The Spirit moves exactly once and the player can't move during its turn. Session score resets per mode and survives restarts. Results land in the right buckets. Settings apply from the next match. Match info and the result line reach the view. |
| `migration.test.mjs` | Save format, migration and malformed storage (§5.4), and the Acorns & Leaves section: added to older v2 saves, repaired field by field (including the rules choice), recorded and cleared apart from Shells & Feathers and the v1 totals, with Fog records apart from Classic ones. |
| `timers-audio.test.mjs` | **Timer scopes:** dispose cancels and ignores later calls; scopes are independent. **Audio (Stage 8):** nothing plays (or fades) before the first gesture, and music asked for earlier starts then. A refused `play()` locks sound again and the next gesture retries; an AbortError is ignored; a late refusal can't undo a newer request; `play()` that throws or returns nothing is handled. One fade at a time through rapid start/stop/mute/volume changes, ending where the last call says. Volume never leaves 0–1 (the fake element throws, like a real one). The music volume applies at once, retargets a fade-in, pauses at 0 and fades back in. Effects follow their switch and volume, and stop when turned off. A hidden page pauses the music, and showing it again resumes it only if music is still wanted. Draw → Play Again and music off→on keep music playing. |
| `rules-ai.test.mjs` | Lines, draws, illegal moves, outcomes. A line completed on the ninth move is a win, not a draw. Completing two lines at once is one win. Feather as Player 1 moves first. No move after a draw or win. **Wise never loses**: all 569 human lines give 183 draws and 386 AI wins, as v1 measured, and it also never loses when the player picks Feather. The Spirit only picks empty squares, at every difficulty, from every reachable position. Win-before-block. Gentle and Balanced with a fixed random source. |
| `announcements.test.mjs` | Square and line names; move, turn and result announcements (keeping the game's result titles). |
| `navigation.test.mjs` | Hash parsing. Unknown routes go to the hub (and are rewritten); each game has a play route per mode. go/up/back against a fake history (up() steps back instead of adding entries; back() falls back to the hub on a fresh visit). Typed URLs and Back/Forward. Arrow-key movement on both boards: on the checkers board, between dark squares only, every one reachable, with the board turned round too. Checkers square names ("d4: empty, move here"). |
| `acorns-leaves-engine.test.mjs` | **Checkers engine:** setup, the seven opening moves, illegal moves with reasons, immutability, forced captures, free choice between captures, multi-jumps (must continue, branches, no double jumps, a king's loop back to its start), crowning on both sides and crowning ending a chain, king moves and backward captures, the draw count, and elimination, blockade, draw and win-before-draw. 300 seeded random games check every move against the rules, and that `analyze` and `playLegalMove` agree with `gameResult`, `legalMoves` and `applyMove`. |
| `acorns-leaves-ai.test.mjs` | **The Spirit:** only legal moves from 120 sampled positions at all three levels; nothing to choose once the game is over, and a forced move played without searching; the bigger capture; never leaving a piece to be jumped for nothing; "give one, take two" found by Balanced and Wise; the position limit and the time limit (fake clock), and under 150 ms in real time on busy positions; the same random source gives the same move; a symmetric evaluation; Wise and Balanced beat Gentle, and Wise beats Balanced, over whole games. |
| `acorns-leaves-turn.test.mjs` | **Picking a move:** select, put back, pick another, refusals with reasons (no move, must capture, not a destination); a chain of jumps square by square (the piece moves on, jumped pieces stay, nothing else can be picked, no taking back, branches, crowning ends it); a king's chain ending on its start square. **Words:** square names, move, turn, guidance and result text. |
| `acorns-leaves-session.test.mjs` | **Checkers session:** two-player turns and announcements; refusals and Escape; a chain of jumps with captured counts and crowning; the Spirit's pause and square-by-square move, with every pick and Escape ignored meanwhile; playing the Leaves (turned board, the Spirit opens); Restart, leaving and Rematch while the Spirit thinks or halfway through its chain cancel it and record nothing; a win recorded once, the dialog after its delay, picks ignored after the end; Restart before the dialog keeps it closed; a loss without the victory sound; two-player wins and draws; settings from the next game; a whole game against the real Spirit. |
| `acorns-leaves-fog.test.mjs` | **Fog of War rules** (docs/fog-rules.md): visibility from both sides; tries, blocks and chains; random-game properties (every real capture looks possible, every move legal, blocks only on hidden pieces); boards that look the same give the same lists. |
| `acorns-leaves-fog-ai.test.mjs` | **The Spirit in Fog:** imagined boards fit its view; only offered steps; not omniscient (the same view gives the same step); bounds; sensible play; Wise beats Gentle. |
| `acorns-leaves-fog-session.test.mjs` | **Fog session:** every drawn model leak-free; the Spirit handed only its view, deciding at once and moving unseen after a fixed pause; blocked tries; the fog lifting; Fog records; the two-player handoff; restarts; Classic unchanged; whole game against the real Spirit. |
| `sounds-achievements.test.mjs` | **Sounds and achievements in play (Stage 8):**<ul><li>**Results:** a win plays the victory theme (the music pauses); a loss and a draw have gentle sounds of their own and the music continues.</li><li>**Achievements:** the result dialog lists the new ones once; your double jump and crowning are reported at once, and once; nothing from two-player moments.</li><li>**Fog:** in a whole two-player game every move makes the same tap and nothing else; the Spirit's crowning is heard in Classic, never in Fog; in a whole game against the Spirit its turns never sound a crowning or reveal.</li><li>**Achievement notice:** queues, one chime per batch, then clears.</li></ul> |
| `asset-versions.test.mjs` | **The site as Pages serves it (Stage 9):** the asset stamp is current; every referenced file and module import is relative and exists under that exact name; `.nojekyll` is present. |
| `hub-content.test.mjs` | **Achievements (Stage 8), both games:**<ul><li>all locked at first;</li><li>each record achievement from its record;</li><li>two-player wins never count as yours;</li><li>v1 games count toward First Game and Ten Games only;</li><li>each unlocks once, across reloads, keeping its time;</li><li>moments only in games against the Spirit;</li><li>older saves backfilled once, and cleared ones never;</li><li>malformed entries repaired, a newer build's ids kept;</li><li>clearing one game leaves the other and the settings;</li><li>Delete all removes exactly the game's keys, the v1 one included;</li><li>blocked storage works for the session and is reported once.</li></ul> |

**Browser tests** (`tests/browser`, Playwright + Chromium against a built-in static server). Every off-site request is blocked, which proves the game is self-contained. Each test also asserts no page errors and no missing files.

| File | Covers |
|---|---|
| `gameplay.smoke.test.mjs` | The Stage 0 baseline. Game assertions unchanged; navigation follows the hub. |
| `full-games.test.mjs` | Single player played to a result against Gentle, Balanced and Wise; Wise reproduces v1's exact audited game. Two players: Player 2 win then draw, session score and stats. Feather as Player 1. |
| `lifecycle.test.mjs` | Audit bugs A1, A2, A3, M1 and M2 reproduced in the real UI and shown fixed. Leaving the match by Change Mode, the browser Back button or a typed URL. |
| `storage.test.mjs` | v1 player upgrades and keeps records (including after more games and a reload; v1 key untouched by the migration, then mirrored). Malformed, `null` and `{}` v1 values. Corrupt v2 rebuilt from v1. Storage that throws. Settings, pieces and difficulty surviving a reload. |
| `settings-progress.test.mjs` | **Settings and progress (Stage 8):**<ul><li>**Dialogs (Stage 9):** keep the keyboard: Tab wraps and Escape works after a backdrop click.</li><li>**Sound start:** no `play()`, and no music download, before the first gesture, even on a deep link into a match; a refused play is retried by the next gesture, with no page error.</li><li>**Saved settings:** volumes, switches and motion apply at once and survive a reload.</li><li>**Motion:** Reduce stops animations where the device allows them; Full keeps them where it asks for less.</li><li>**Pausing:** leaving a match stops its victory theme, switches silence at once, and the music pauses while the page is hidden.</li><li>**Achievements:** listed in the result dialog once, even after a reload, and dated in Your Path.</li><li>**v1 player:** their games shown on their own; the v1 record untouched.</li><li>**Delete all:** the dialog lists what goes, Cancel keeps it, and Delete removes only the game's keys.</li><li>**Blocked storage:** reported, and Delete all says it could not.</li></ul> |
| `match-flows.test.mjs` | **First move and the Spirit's turn:** the board is busy, taps are ignored, and both moves are announced. **Win and draw:** the board locks, winning squares are named and edged, the result and line are announced, and a draw adds to neither score. **Scoring once:** the winning square is clicked twice in one task and pressed with Enter three times; then View Board, taps after the end, Restart, Back/Forward and reload. Exactly one game is recorded. **Cancelling the Spirit's move:** Restart, switching to an Acorns & Leaves match, and going home during its turn; nothing scored, no stale move. **Keyboard:** arrows, Home/End, Enter/Space, taken squares refuse, and a dark focus ring on empty, taken and winning squares. **Phone (320×568, touch):** pinch zoom allowed; a touch drag scrolls the setup screen; no `touchmove` is blocked anywhere; no page-wide overscroll setting; only the board uses `touch-action: manipulation`; squares are 60 px or more; a swipe across the board is not a move; a touch game plays to a result. |
| `acorns-leaves.test.mjs` | **Board and pieces:** the engine's starting position as drawn, 32 dark-square buttons, separate acorn and leaf drawings (rim and emblem), kings with a crown. **Picking and moving:** selection, destinations, square names, announcements, refusals. **Capture sequence:** compulsory capture with both capturing pieces ringed, a double jump square by square (piece moves on, jumped leaf marked, route tinted, other picks and Escape refused), captured counts, the recapture. **Whole games:** two players to a result with every move checked against the engine, the result panel (the winner's piece, or both for a draw, and the captured counts), the board locked after the end, Restart, one record, Your Path; against the Spirit (Playwright's clock) to a result, with stray clicks and Escape ignored during its turn and every one of its moves matched to a legal move, then Rematch. **Cancelling:** Restart, Change Mode, Back, going home and switching to Shells & Feathers during the Spirit's turn. **Turned board:** playing the Leaves puts h8 bottom-left, the Spirit opens, keys follow the screen. **Keyboard only:** Tab to the game, arrows, Enter/Space, Escape, focus ring above neighbours. **Layout:** at 320×568 (touch), 360×560 (Android, touch), 390×844, 640×360 (Android landscape, touch), 750×340 and 1280×800 the whole match fits with the longest guidance, squares are at least 36 px, and the capture line plays. **Phone gestures:** a swipe is not a move, nothing blocks touch. **Your Path:** records shown and cleared apart from Shells & Feathers; saved side and difficulty preselected. |
| `acorns-leaves-fog.test.mjs` | **Fog of War in the page:** the rules choice and its routes; a whole two-player game checked square by square against each player's view (pieces, drawn pieces, fog, names), with every handoff covering the screen, holding no piece or mark, and resetting the keyboard stop; a whole game against the Spirit with leak checks every turn; a blocked try revealing exactly one square; Restart during the Spirit's turn; Classic still showing everything; phone and landscape layout. |
| `polish.test.mjs` | **The shared look (Stage 7).** Shells & Feathers chips: "To move" follows the turn, "Winner" marks the winner and clears on the next round, nothing after a draw; the scores and labels are unchanged. **Result panel:** the winning piece, both pieces for a draw, and the session score, read with the result. **Motion:** every animation seen on the hub, the match, a piece placed, the winning line, the result panel and a capture to make is finite and done within 2 s; the test fails if any loops. **Reduced motion:** nothing animates and buttons change state at once, while the winning line still shows gold and edged. |
| `hub.test.mjs` | **Hub:** both cards are ready to play, with Play and How to Play; the checkers card shows the starting position with the game's pieces; both How to Play pages (the checkers one covers every rule choice and the board marks). **Full trip:** hub → setup → match → result → Play Again → Change Mode → other mode → All Games → Settings → Your Path achievements. **History:** Back/Forward (fresh match on Forward; "Change Mode" adds no history entry), reload, deep links, unknown links. **Keyboard only:** Tab to the game, arrow keys and Enter/Space to win, the dialog takes and keeps focus, Escape shows the board. **Devices:** narrow phone 320×568 with touch, and desktop 1280×800, each playing both modes to a result with the match fitting on screen. **Reachability:** at 320×568, 360×560 (a short Android screen), 360×640, 640×360, 750×340 and 1280×800, every link, button and input on every screen (and in both result dialogs) can be scrolled into view, is not covered, and is at least 44×44 px (checkers squares at least 36×36), including the Fog handoff screen, the Fog match and the delete-all dialog; no sideways scrolling. |

### 6.2 How each stage was verified beyond the suite

**Stage 1.**
- **AI:** v1's `index.js` (from `main`) was loaded in a Node VM and compared with `src/games/shells-feathers/ai.js` on every AI-to-move position, for both symbol assignments, every difficulty and five seeded random sources. 62,910 comparisons, 0 differences.
- **Visual parity:** screenshots of start, modes, settings, stats, a game in progress, a win, and a single-player reply, on `main` and on the branch. Desktop 1280×800 and Pixel 5, with animations disabled and scroll reset. Identical except the phone board-border anti-aliasing noted in §0.10.
- **Mutation check:** key safeguards were removed one at a time (timer disposal on teardown, fade cancellation, the storage guards, the v1 migration). The suite failed each time.

**Stage 2.**
- **Screenshots** of every screen at 320×568, 1280×800 and 750×340 landscape were reviewed by eye. The match screen was compared side by side with Stage 1: same board, pieces and colors, with a darker header and one row of controls.
- **Mutation check:** these safeguards were removed one at a time, and the suite failed each time:
  - history stepping for "Change Mode";
  - the rewrite of unknown URLs;
  - the inert board behind the dialog;
  - Escape;
  - focus moving to the new screen;
  - the one-row controls on narrow phones;
  - saving the difficulty choice.

**Stage 3.**
- **Match-flow audit** in Chromium before and after the fixes (§0.8), and the **phone smoke test** on three emulated phones (§0.8).
- **Mutation check:** each of these was removed one at a time, and the suite failed each time:
  - the waiting and locked board states;
  - turn announcements;
  - the instant focus ring;
  - the winning squares' solid edge.

  Re-adding page-wide `overscroll-behavior` or a page-wide `touchmove` block also fails the phone test.
- **Scoring is protected three times:**
  - the rules refuse moves after the end;
  - the session ignores taps once a round has a result;
  - the session records each round at most once.

  Removing one or two layers changes nothing observable. With all three removed, the score-once test fails.

**Stage 4.** Nine rule bugs were put into the engine one at a time; the engine tests failed for each (§0.7).

**Stage 5.**
- **Scripted playtests** on emulated desktop and phones, with long-task measurement and screenshots (§0.6).
- **Mutation check:** each of these was introduced one at a time, and the suite failed each time:
  - the board taking picks while the Spirit acts;
  - a teardown that keeps the old timers;
  - the Spirit choosing from the other side's moves;
  - an unbounded search;
  - no capture extension in the search;
  - a jump that can be taken back;
  - picking another piece mid-chain;
  - jumped pieces not marked;
  - crowning not announced;
  - squares left enabled while the Spirit acts;
  - the board never turned round;
  - must-capture rings missing;
  - leaving a match without tearing it down;
  - checkers results leaking into the v1 totals;
  - the focused square drawn under its neighbours;
  - narrow phones getting the desktop board size.
- **Gaps the check found:**
  - Leaving without teardown was missed at first: coming back always starts a fresh board. The cancel tests now also check that the board left behind stays frozen and silent.
  - Removing only one of the two narrow-phone size rules (`vh` and `dvh`) changes nothing in Chromium, so both were removed together for the check.
- **Redundant layer:** removing only the "score once" guard is not observable. As in Shells & Feathers, the rules already refuse moves after the end, and the session ignores picks once there is a result.

**Stage 6.**
- **Scripted Fog playtests** on emulated desktop and phones. The scripted player saw only the page; screenshots and long tasks were reviewed (§0.5).
- **Leak and rule check:** each of these was introduced one at a time, and the suite failed every time (16 of 16):
  - drawing the real board on the player's turn, or during the Spirit's turn;
  - handing the Spirit the real board;
  - describing the Spirit's move in full;
  - highlighting the opponent's last move;
  - landing squares, or "a capture may be possible", taken from the real legal moves;
  - ending a chain without trying the jumps that look possible;
  - a block revealing the squares around the blocker;
  - no handoff, or pieces left behind it;
  - the keyboard stop left on the last square used;
  - the mover's move left in the announcements;
  - the Spirit deciding when its pause ends;
  - fogged squares named "empty";
  - the Spirit's move animated.

**Stage 7.**
- **Before and after screenshots** of the same 14 screens and overlays at four sizes, made with the same script on Stage 6 (`69852ea`) and on this commit, and reviewed side by side: hub, both setups, both matches, both result panels, a capture chain, the final board, Fog, the handoff, How to Play, Settings and Your Path.
- **Audit script:** contrast against the rendered pixels, touch-target size, focus rings and clipped text, on every screen and overlay (§0.4).
- **Mutation check:** an endless pulse was put back on the turn line, and `polish.test.mjs` failed.

**Stage 8.**
- **Mutation check:** ten safeguards were removed one at a time (§0.3), with the unit suite passing first. Each was caught by a named test.
- **Sound timing:** every effect was measured. Each now starts within about 10 ms of being played (before, the select sounds started 0.32–0.51 s late), and `tools/make-sounds.py` gives byte-identical files on every run.
- **Screenshots** of Settings, Your Path, both delete dialogs, a result with a new achievement, and the in-play notice, at 360×640, 360×560 and 1280×800, reviewed by eye.
- **Stage 7 audit** re-run with the new screens: contrast clean, touch sizes clean, no clipped text. Focus rings were checked on the volume sliders directly, because the audit's sibling probe for inputs doesn't fit range inputs.

**Stage 9.**
- **Scripted play:** the end-to-end playthroughs in §0.2 (scratch scripts, not part of the suite).
- **Dialog focus:** the new dialog-focus test was shown to fail without its fix.
- **Asset stamp:** the stale-stamp test was shown to fail after a one-character stylesheet change.

### 6.3 Remaining automated checks to add

- **More viewports:** 390×844, 393×727, 844×390 and 768×1024 in the reachability test.
- **Acorns & Leaves:** the reachability test opens its result dialog directly (a real game to reach it at four sizes would be slow); `acorns-leaves.test.mjs` reaches it by play. A seeded short game to a result would let the reachability test do the same.
- **Checkers screen reader output:** the announcements are unit-tested as text; nothing yet checks them through a real screen reader.

### 6.4 Manual checklist (real devices, before each deploy)

- [ ] iOS Safari and Android Chrome, portrait and landscape: full game in both modes; settings and stats fully reachable; bottom buttons not under browser toolbars.
- [ ] Audio: the first tap starts music; mute toggles take effect immediately; music continues after win, draw, Play Again and All Games; no victory bleed.
- [ ] Rotate mid-game: board state kept, layout fits.
- [ ] Browser Back/Forward and the system back gesture on Android move between hub, setup and match as expected.
- [ ] A screen reader (VoiceOver, TalkBack) announces squares, turns and results, and the dialog; on the checkers board also picks, chains of jumps, the Spirit's moves and crowning.
- [ ] Acorns & Leaves on a real small phone: squares easy to hit, a whole game by touch in both modes, the board turned round when playing the Leaves, and no lag when the Spirit moves.
- [ ] Private or incognito window: game playable; stats behave sensibly.
- [ ] Upgrade path: a browser with real v1 stats keeps its totals after deploy, and they appear in "Your Path".
- [ ] Throttled 3G: time to first playable board.
- [ ] Pages URL after deploy: no 404s in DevTools; `src/*.js` served as JavaScript; assets load with case-correct paths.

### 6.5 CI (proposed, not added yet)

A GitHub Actions workflow on `pull_request`: `npm ci`, then `npx playwright install --with-deps chromium`, then `npm test`. It leaves the existing Pages deployment untouched.
