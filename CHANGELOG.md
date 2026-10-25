# Changelog

## 2.0.0: Spirit of the Woods (unreleased; branch `claude/hopeful-hawking-ummjv2`)

The single Shells & Feathers page becomes **Spirit of the Woods**, a hub of two games.

### New
- **Hub:** a hub screen with real links and browser Back/Forward, plus How to Play, Settings and Your Path pages.
- **Acorns & Leaves:**
  - checkers in **Classic** (American rules, compulsory captures, multi-jumps, kings) against the Spirit (Gentle, Balanced, Wise) or two players;
  - **Fog of War**, where each side sees only what is next to its pieces, with a private handoff screen for two players.
- **Settings shared by both games:** music and sound-effect switches with separate volumes, and a motion preference (follow the device, Reduce or Full).
- **Your Path:**
  - each game's records, with your games against the Spirit kept apart from two-player games;
  - Classic and Fog side by side;
  - **13 achievements**, each unlocked once and dated.
- **Clearing data:** clearing a game's progress or deleting all saved data lists exactly what will be deleted first.
- **Sounds:** new original sounds for moves, captures, crowning, Fog reveals, draws, losses and achievements.

### Changed
- **Visual identity:**
  - **Look:** one woodland tabletop look across the hub and both games, built on design tokens (type, spacing, surfaces, shadows, borders, icons, states).
  - **Artwork:** original SVG shell and feather pieces and interface icons replace every emoji.
  - **Kings:** they wear a crown that rises above the piece.
- **Shells & Feathers:**
  - redesigned on a wooden board, with player chips ("To move", "Winner");
  - one result panel shared with Acorns & Leaves;
  - the session score;
  - gentle, brief motion that respects reduced-motion settings.
- **Keyboard and screen readers:** both games are fully playable with the keyboard. Every square, move and result is announced.
- **Phone layouts:** checked down to 320 × 568 and 360 × 560, and in landscape.
- **Saves:** a versioned save (`spiritOfTheWoods:v2`) that migrates the original `spiritOfTheWoodsStats` record and keeps it up to date for rollback safety. Damaged data is set aside, never lost.
- **Audio:**
  - nothing plays before the first tap or key press;
  - refused or interrupted playback is handled;
  - the music loads only when it plays and pauses when the page is hidden;
  - the owner's sound effects start on time (up to half a second of leading silence trimmed);
  - all audio is half the size it was (15.4 MB → 7.9 MB).
- **Deploys:** the site is safe to redeploy on GitHub Pages. Content-hashed module URLs (`tools/stamp-assets.mjs`) stop browsers mixing old and new files during the ten-minute cache window, and `.nojekyll` serves files as they are.

### Fixed (from v1)
- **Broken audio paths:** the published page loaded sounds from a missing `SHELLS & FEATHERS MINI GAME/` folder.
- **Phaser:** the 1.1 MB Phaser library loaded from a CDN, drew nothing, and kept a render loop running. It is removed.
- **Stale timers:** a result dialog or Spirit move could appear after restarting or leaving a match. Games could also be counted twice. Every timer now belongs to its match and is cancelled with it.
- **Music:** music could stay paused after a quick off/on or a draw followed by Play Again.
- **Dialog focus:** in the result and delete dialogs, Tab used to escape to the page behind, and Escape then stopped working. (Found in final QA.)
- **Asset stamp:** `tools/stamp-assets.mjs` now updates an existing stamp; before, only the first one was written. Its test checks the real file hashes.

### Known limitations
- The music and original sound effects have no recorded source or license (see `docs/assets.md`).
- The game is tested in Chromium, emulating phones. Safari, Firefox and real devices still need a manual pass (the checklist is in `docs/upgrade-plan.md` §6.4).
- Saves from a newer save version are set aside, not read.
- In Fog of War, the real board is in the page's memory: Fog protects what the page shows, says, plays and stores, not developer tools.

## 1.0.0 (2025-11-05)
- Shells & Feathers tic-tac-toe: one player against an AI with three levels, or two players; local win/loss stats.
