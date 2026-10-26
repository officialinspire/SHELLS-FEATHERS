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
  - achievements, each unlocked once and dated.
- **Achievement journal:** 22 achievements in a journal with tabs for All, Shells & Feathers, Acorns & Leaves and the Collection. Each has an original icon, its exact rule, progress where it means something, and the date it was unlocked.
  - **New:** First Game in Acorns & Leaves, a win with each side (shells, feathers, acorns, leaves), Passing in the Mist (two-player Fog), and the Collection (Two Paths, Friend of the Woods, Every Side).
  - **Counting:** your games against the Spirit and two-player games on the device are counted apart.
  - **Earlier unlocks:** kept with their dates; new ones are added only where saved records prove them, never guessed.
  - **Notices:** an achievement unlocked during play is told in the match header, in the match line's place, never over the board or its controls.
- **Clearing data:** clearing a game's progress or deleting all saved data lists exactly what will be deleted first.
- **Sounds:** new original sounds for moves, captures, crowning, Fog reveals, draws, losses and achievements.
- **Feedback:** one shared feedback service plays each event's sound, optional vibration and animation exactly once:
  - new soft sounds for picking up a piece (a shell click), a refused tap (a leaf rustle) and multi-jumps (a short chirp);
  - a leaf-like settle where a piece lands, a crown that swells once, and a brief glow on a refused square, all skipped under reduced motion;
  - nothing queued plays after muting, pausing, hiding the page or leaving a match;
  - in Fog nothing gives away a hidden piece, and with two players every move sounds and feels the same.
- **Haptics setting:** optional short vibrations for your own actions (never the Spirit's moves or hovering), rate limited, off by default, and shown as unavailable, with the reason, where the browser can't vibrate.

- **Match sets:** best of three and best of five, for both games and every mode, besides single games.
  - **Draws:** a drawn round counts as a round but scores for no one, so every set ends.
  - **Progress:** shown in the match header and the result.
  - **Records:** every round is still a game in your records, and finished sets are recorded apart.
- **Result screen:** the outcome, the set's progress or result, then Next Round or Play Again/Rematch, Switch Sides (against the Spirit, and the score follows you), Change Setup and Home.
- **Resume:** an unfinished match, including a set in progress, comes back after a reload or when you return.
  - It is checked against the rules and restored exactly, or set aside with a note: never changed.
  - Two players in Fog of War resume behind the handoff screen.
- **Tutorial:** a one-minute practice for each game on its own board, offered once and easy to skip. Nothing in it counts. Its Fog of War step only ever shows what you could see.

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
- **Desktop play:**
  - **Layout:** on wide screens the board sits beside a side panel: turn and status, the last move, a one-line rule note, Rules and keys, Restart, Change Mode, and Play Again once the game is over.
  - **Keyboard:** fully playable, with focus put back predictably after every action, and a focus ring that never looks like the picked-up piece.
  - **Explanations:** forced captures, continuing jumps, crowning, blocked pieces, the Spirit's thinking (with how its level plays) and results are explained in short text. In Fog it only ever says what that player could see.
  - **Pause:** the menu has its own Settings, and the game stays paused while you change them. The game also pauses while the page is hidden.
- **Difficulty descriptions** now say exactly how the Spirit plays at each level, in Classic and separately in Fog, built from its real settings.
- **Phone play:**
  - **Board first:** the board takes all the room the header and guidance leave, at any phone size, toolbar state and orientation. Short screens scroll instead of clipping, and landscape puts the board beside the header.
  - **Menu:** Restart, Change Mode and All Games moved into a **Menu** that pauses the game, and the Spirit waits behind it. Play Again or Rematch shows under the board once a game is over.
  - **Taps:** tap a checker, then where it goes, or tap it again to put it back. Scrolls, pinches, slides, finger bounces and a stray tap right after a move no longer count as moves.
  - **Selection:** the picked-up checker gets a bright ring.
  - **Checked** from 320 × 460 to 932 × 430, in portrait and landscape, including rotation mid-game.
- **Saves:** a versioned save (`spiritOfTheWoods:v2`) that migrates the original `spiritOfTheWoodsStats` record and keeps it up to date for rollback safety. Damaged data is set aside, never lost.
- **Audio:**
  - nothing plays before the first tap or key press;
  - refused or interrupted playback is handled;
  - the music loads only when it plays and pauses when the page is hidden;
  - the owner's sound effects start on time (up to half a second of leading silence trimmed);
  - all audio is half the size it was (15.4 MB → 7.9 MB).
- **Deploys:** the site is safe to redeploy on GitHub Pages. Content-hashed module URLs (`tools/stamp-assets.mjs`) stop browsers mixing old and new files during the ten-minute cache window, and `.nojekyll` serves files as they are.

- **Loading on slow phones:** about 1.5 s faster to be ready, measured on an emulated slow phone. Every script is fetched at once, and sound effects wait for the first tap.

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
