# Assets and their sources

Every file, font and picture the site uses, where it came from, and the terms it is used under. Update this list whenever an asset is added, replaced or removed.

## Used by the game

| Asset | Where it is | What it is | Source | Terms |
|---|---|---|---|---|
| `gameplay.mp3` | `index.html` `#gameplay-music` | Looping music (10 min). Loads only when it first plays. | Uploaded by the repository owner (OFFICIAL INSPIRE) in the first commit, `6b8ec0e` (2025-11-05). Re-encoded in Stage 8 by `tools/prepare-audio.sh` from 192 to 96 kbit/s: 14.4 MB → 7.2 MB. Same recording. | **Not recorded.** No license or credit is in the repository. |
| `victory.mp3` | `#victory-sound` | Victory theme (a win, or either player's win in a two-player game) | Same upload. Re-encoded at 96 kbit/s, without the 1.9 s of silence at its end: 750 KB → 356 KB. | **Not recorded**, as above. |
| `button_select.mp3`, `player_select.mp3`, `opponent_select.mp3`, `newgame.mp3` | `#button-select` (menus and options), `#player-select` / `#opponent-select` (Shells & Feathers pieces), `#newgame-sound` | Short effects | Same upload. Trimmed by `tools/prepare-audio.sh`. The originals began with 0.08–0.51 s of silence, so a placed piece sounded half a second late. The levels were also evened out: the two select sounds were about five times louder than the menu click. Same sounds. 211 KB → 81 KB together. | **Not recorded**, as above. |
| `sounds/piece-move.wav`, `sounds/piece-move-other.wav` | `#piece-move`, `#piece-move-other` | Acorns & Leaves: a wooden piece set down (yours; the other side's, lower and softer) | Original. Synthesized by `tools/make-sounds.py` (filtered noise click and decaying resonances). | Part of this repository |
| `sounds/capture.wav` | `#capture-sound` | A capture: the landing, and the taken piece lifted off | Original, `tools/make-sounds.py` | Part of this repository |
| `sounds/crown.wav` | `#crown-sound` | Crowning: three rising mallet-bell notes (D5, A5, D6) | Original, `tools/make-sounds.py` | Part of this repository |
| `sounds/reveal.wav` | `#reveal-sound` | Fog of War: a hidden piece found by a blocked try (a short breath of air and one high note) | Original, `tools/make-sounds.py` | Part of this repository |
| `sounds/result-draw.wav`, `sounds/result-loss.wav` | `#draw-sound`, `#loss-sound` | Results: a settling fifth for a draw, a gentle falling step for a loss | Original, `tools/make-sounds.py` | Part of this repository |
| `sounds/achievement.wav` | `#achievement-sound` | An achievement unlocked during play: two quick bright notes | Original, `tools/make-sounds.py` | Part of this repository |
| `inspiresoftwareintro.mp4` | `#intro-video`, set only when the intro plays | The INSPIRE Software intro after "Touch to start" (5.9 s, H.264/AAC, 272 KB), once per browser session | INSPIRE's own studio intro, copied unchanged from Bird Mahjong and Emoji Elements (the same file in both) | INSPIRE's own |
| `inspire-logo.png` | Start screen byline | The INSPIRE logo, "by INSPIRE" (600×181, white letters with a dark outline) | INSPIRE's own logo, copied unchanged from Bird Mahjong (`logo.png`) | INSPIRE's own |
| `sounds/select.wav` | `#select-sound` | Picking up a checker: a short, soft shell click (0.09 s) | Original, `tools/make-sounds.py` (Stage 13) | Part of this repository |
| `sounds/invalid.wav` | `#invalid-sound` | A refused tap: a soft leaf rustle, quiet and brief (0.2 s), never an alarm | Original, `tools/make-sounds.py` (Stage 13) | Part of this repository |
| `sounds/multi.wav` | `#multi-sound` | Two or more captures in one move: a short two-note chirp, G5 to D6 (0.36 s) | Original, `tools/make-sounds.py` (Stage 13) | Part of this repository |
| Acorn, leaf, acorn king and leaf king pieces (`#al-acorn`, `#al-leaf`, `#al-acorn-king`, `#al-leaf-king`, with `#al-acorn-emblem`, `#al-leaf-emblem`, `#al-crown` and their gradients) | Inline SVG sprite at the top of `index.html` | Checkers pieces: the board, the hub card, How to Play, Your Path and the result panel. Since Stage 10, kings carry a crown that rises above the disc, so their outline differs from an ordinary piece's. | Original, drawn by hand in SVG for this project (Stages 5, 7 and 10) | Part of this repository |
| Shell and feather pieces (`#sf-shell`, `#sf-feather`, gradients `#sf-pearl`, `#sf-plume`) | Inline SVG sprite in `index.html` | Shells & Feathers pieces: the board, the player chips, the turn line, the result medallion, the setup options and the hub card. They replace the 🐚 and 🪶 emoji, which looked different on every device. A pearl spiral seashell and a barred feather, natural objects only. | Original, drawn in SVG for this project (Stage 10) | Part of this repository |
| Interface icons (`#icon-tree`, `#icon-pair`, `#icon-gear`, `#icon-trail`, `#icon-mist`) | Inline SVG sprite in `index.html` | Play the Spirit, Two Players, Settings, Your Path and the Fog handoff screen. They replace 🎯, 👥, ⚙️, 🏆 and 🌫️. (The Stage 10 check mark for unlocked achievements gave way to the journal's medallions in Stage 14.) | Original, drawn in SVG for this project (Stage 10) | Part of this repository |
| Check mark on the selected option | `styles.css`, `.segment input:checked + span::after` (inline SVG data URL) | Selection badge | Original, for this project | Part of this repository |
| Capture cross | `styles.css`, `.al-square.is-jumped::after` (inline SVG data URL) | Marks a piece being jumped | Original, for this project | Part of this repository |
| Boards, plaques, chips, buttons, wood grain, fog, the forest background and its scattered-leaf texture (an inline SVG data URL), medallions | `styles.css` (CSS gradients, borders and one inline SVG, no image files) | All other visuals | Original, for this project | Part of this repository |
| Cinzel | Loaded from Google Fonts in `index.html` | Labels and buttons | Natanael Gama, via [Google Fonts](https://fonts.google.com/specimen/Cinzel) | SIL Open Font License 1.1 |
| Uncial Antiqua | Loaded from Google Fonts in `index.html` | Titles | Astigmatic (Brian J. Bonislawsky), via [Google Fonts](https://fonts.google.com/specimen/Uncial+Antiqua) | SIL Open Font License 1.1 |
| Georgia, Iowan Old Style, Palatino Linotype, serif | The visitor's own fonts (`--font-body`, and the fallback when Google Fonts can't load) | Body text | Installed on the device; nothing is shipped | n/a |
| Journal and achievement icons (`#icon-journal` and 19 `#ach-*` symbols: sprout, stack, laurel, shell, feather, breeze, scales, shield, pair, acorn, leaf, crown, hop, sun in mist, owl, lantern, fork, oak, compass) | Inline SVG sprite in `index.html` | The Journal link and tab, each achievement's medallion in the journal, and the unlock notice in the match header | Original, drawn in SVG for this project in the interface icons' line style (Stage 14) | Part of this repository |
| Emoji | None in the game since Stage 10: every piece and icon is drawn from the SVG sprite, so it looks the same on every device. A locked achievement's medallion is a dashed ring drawn with CSS. | | | |

### Sizes

All audio together is 7.9 MB, down from 15.4 MB. The music, at 7.2 MB, is fetched only when it first plays. The eleven original effects are 22,050 Hz mono WAV, 278 KB together (the three added in Stage 13 are 28 KB of that): short enough that a compressed format would save little, and with no encoder delay before the sound. `tools/make-sounds.py` gives byte-identical files on every run (fixed seed), so anyone can check they are made from scratch. `tools/prepare-audio.sh` rebuilds the MP3s from the originals in git history.

## In the repository but not used

| Asset | What it is | Source | Note |
|---|---|---|---|
| `background.png` (1024×1024, 2.1 MB) | Illustrated woodland scene with animals and plants | Owner upload, `6b8ec0e` | Not referenced by the site. Its origin and terms aren't recorded, so it was left out of the Stage 7 polish. |
| `SPIRIT_OF_THE_WOODS_SHELLS_FEATHERS_TITLE_CARD.png` (1536×1024, 2.0 MB) | Promotional title card | Owner upload, `f7c626d` (2026-08-10) | Not referenced by the site. It includes the GitHub logo and the INSPIRE wordmark, so it suits a repository social preview rather than the game screens. Its Shells & Feathers board (warm wood tray, light squares, shells and feathers) is the reference for the Stage 7 board. |

## Open items for the owner

- **Audio terms.** The six MP3 files (the owner's, trimmed and re-encoded but otherwise unchanged) have no recorded source or license. If they were licensed (for example from a stock library) or commissioned, add the source and terms to this table. The eight WAV files are original.
- **Unused images.** `background.png` and the title card add about 4 MB to every clone. They can stay as source material, but the game doesn't load them.
- **Wording.** The game's art and text are nature-based: shells, feathers, acorns, leaves, wood and mist, with no ceremonial or cultural imagery. The README's description of the game as "Native-American–inspired" and as merging "ancient motifs" with modern code is the owner's own wording, and nothing in the game's assets sources or depicts it. It is worth reviewing, and either sourcing it or rewording it.

## Rules for new assets

- Prefer CSS or hand-written SVG in `index.html` or `styles.css`: crisp at every size, and easy to maintain.
- Any image or sound file must be original or properly licensed, optimized (compressed images, mono or short audio where possible), and added to this table with its source and terms before it is used.
- Keep the direction grounded in the forest: natural materials, plants, shells and feathers drawn as natural objects. Don't add tribal or ceremonial symbols, patterns that imitate a particular people's art, or cultural claims that can't be sourced.
