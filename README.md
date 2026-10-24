🎮 SPIRIT OF THE WOODS: Shells & Feathers

by Inspire Studios / Athena Intelligence Solutions

Overview:
A hand-crafted Native-American–inspired twist on the classic Tic-Tac-Toe game — built from scratch in HTML, CSS, and JavaScript.
Each match unfolds deep within the digital forest, where Shells and Feathers represent opposing spirit forces locked in a timeless balance. Choose your side, outwit the AI, or challenge a friend in two-player mode.

Features:
🌿 Clean minimalist board design (no flashy effects — pure focus and strategy)
🪶 Single-player mode with adaptive AI
🐚 Two-player mode for local duels
🔥 Subtle sound design and ambient score
💾 Persistent win/loss stats stored locally
⚙️ Built fully in-browser — no frameworks, no dependencies
🌲 Game hub: Shells & Feathers (Tic-Tac-Toe) and Acorns & Leaves (Checkers: Classic, or Fog of War where you see only what is next to your pieces), each against the forest Spirit (Gentle, Balanced or Wise) or a friend on the same device
🏆 Your Path: each game's records per difficulty, and Shells & Feathers achievements
⌨️ Playable by touch, mouse or keyboard, on phones and desktop; browser Back/Forward move between screens

Built With:

HTML5 + CSS3 (custom board grid + responsive layout)

Vanilla JavaScript (game logic, AI, modal UX)

Native ES modules (no build step, no runtime dependencies)

Vision:
Part of Inspire Studios’ ongoing mission to merge ancient motifs with modern code, Spirit of the Woods symbolizes the bridge between natural wisdom and digital intelligence — a game that honors balance, patience, and the rhythm of play itself.

Playing Locally:
The game loads as ES modules, so serve the folder instead of opening index.html from disk, e.g. `python3 -m http.server` and visit http://localhost:8000.

Tests:
`npm ci`, then `npx playwright install chromium`, then `npm test` (unit tests in Node plus browser tests in headless Chromium). Code layout, save format and test plan: docs/upgrade-plan.md. Checkers rules and the Spirit's search: docs/acorns-leaves-rules.md. Fog of War: docs/fog-rules.md

Assets and credits:
Every sound, font and drawing the game uses, with its source and terms: docs/assets.md
