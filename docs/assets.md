# Assets and their sources

Every file, font and picture the site uses, where it came from, and the terms it is used under. Update this list whenever an asset is added, replaced or removed.

## Used by the game

| Asset | Where it is | What it is | Source | Terms |
|---|---|---|---|---|
| `gameplay.mp3` | `index.html` `#gameplay-music` | Looping music (10 min, 14 MB) | Uploaded by the repository owner (OFFICIAL INSPIRE) in the first commit, `6b8ec0e` (2025-11-05) | **Not recorded.** No license or credit is in the repository. |
| `victory.mp3`, `newgame.mp3`, `button_select.mp3`, `player_select.mp3`, `opponent_select.mp3` | `index.html` `<audio>` elements | Sound effects | Same upload, `6b8ec0e` | **Not recorded**, as above. |
| Acorn, leaf, acorn king and leaf king pieces (`#al-acorn`, `#al-leaf`, `#al-acorn-king`, `#al-leaf-king`, with `#al-acorn-emblem`, `#al-leaf-emblem`, `#al-crown` and their gradients) | Inline SVG sprite at the top of `index.html` | Checkers pieces, drawn on the board, the hub card, How to Play, Your Path and the result panel | Original, drawn by hand in SVG for this project (Stage 5, refined in Stage 7) | Part of this repository |
| Check mark on the selected option | `styles.css`, `.segment input:checked + span::after` (inline SVG data URL) | Selection badge | Original, for this project | Part of this repository |
| Capture cross | `styles.css`, `.al-square.is-jumped::after` (inline SVG data URL) | Marks a piece being jumped | Original, for this project | Part of this repository |
| Boards, plaques, chips, buttons, wood and fog textures, medallions | `styles.css` (CSS gradients and borders, no image files) | All other visuals | Original, for this project | Part of this repository |
| Cinzel | Loaded from Google Fonts in `index.html` | Labels and buttons | Natanael Gama, via [Google Fonts](https://fonts.google.com/specimen/Cinzel) | SIL Open Font License 1.1 |
| Uncial Antiqua | Loaded from Google Fonts in `index.html` | Titles | Astigmatic (Brian J. Bonislawsky), via [Google Fonts](https://fonts.google.com/specimen/Uncial+Antiqua) | SIL Open Font License 1.1 |
| Georgia, Iowan Old Style, Palatino Linotype, serif | The visitor's own fonts (`--font-body`, and the fallback when Google Fonts can't load) | Body text | Installed on the device; nothing is shipped | n/a |
| Emoji: 🐚 shell, 🪶 feather, 🎯, 👥, ⚙️, 🏆, 🌫️ | Text in `index.html` and the Shells & Feathers view | Shells & Feathers pieces, menu icons, the handoff screen | Drawn by the device's emoji font; no image files are shipped, so they look a little different on each system | Unicode characters |

## In the repository but not used

| Asset | What it is | Source | Note |
|---|---|---|---|
| `background.png` (1024×1024, 2.1 MB) | Illustrated woodland scene with animals and plants | Owner upload, `6b8ec0e` | Not referenced by the site. Its origin and terms aren't recorded, so it was left out of the Stage 7 polish. |
| `SPIRIT_OF_THE_WOODS_SHELLS_FEATHERS_TITLE_CARD.png` (1536×1024, 2.0 MB) | Promotional title card | Owner upload, `f7c626d` (2026-08-10) | Not referenced by the site. It includes the GitHub logo and the INSPIRE wordmark, so it suits a repository social preview rather than the game screens. Its Shells & Feathers board (warm wood tray, light squares, shells and feathers) is the reference for the Stage 7 board. |

## Open items for the owner

- **Audio terms.** The six MP3 files have no recorded source or license. If they were licensed (for example from a stock library) or commissioned, add the source and terms to this table.
- **Unused images.** `background.png` and the title card add about 4 MB to every clone. They can stay as source material, but the game doesn't load them.
- **Wording.** The game's art and text are nature-based: shells, feathers, acorns, leaves, wood and mist, with no ceremonial or cultural imagery. The README's description of the game as "Native-American–inspired" and as merging "ancient motifs" with modern code is the owner's own wording, and nothing in the game's assets sources or depicts it. It is worth reviewing, and either sourcing it or rewording it.

## Rules for new assets

- Prefer CSS or hand-written SVG in `index.html` or `styles.css`: crisp at every size, and easy to maintain.
- Any image or sound file must be original or properly licensed, optimized (compressed images, mono or short audio where possible), and added to this table with its source and terms before it is used.
- Keep the direction grounded in the forest: natural materials and plants. Don't add generalized ceremonial imagery or cultural claims that can't be sourced.
