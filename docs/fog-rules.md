# Acorns & Leaves: Fog of War rules

Fog of War is a separate Acorns & Leaves mode. It plays by the Classic rules in [`acorns-leaves-rules.md`](acorns-leaves-rules.md) on the real board, but each player sees only part of the board. **Classic Checkers is unchanged:** full visibility and the same rules. Choose between them with "Rules" on the Acorns & Leaves setup screen.

The rules below are numbered so the code and tests can point at them. The code is `src/games/acorns-leaves/fog.js` (what each side sees, and trying moves), `fog-ai.js` (the Spirit in Fog) and the Fog paths in `session.js` and `view.js`.

## 1. Words used here

- **Viewer:** the player whose view is being drawn. Against the Spirit, that is always you. With two players, it is the player whose turn it is, once they have taken the device (§5).
- **Next to:** a dark square one diagonal step away, in any of the four directions.
- **Your pieces:** the side you play, men and kings.

## 2. What you see

| | Rule |
|---|---|
| **V1 Terrain** | The whole board is always shown: all 64 squares, light and dark, with their coordinates. |
| **V2 Your pieces** | You always see all of your own pieces, and which are kings. |
| **V3 Opponent pieces** | An opponent piece is shown, with its type (man or king), only when it stands on a dark square **next to one of your pieces**. Every one of your pieces sees one step in all four diagonal directions; men and kings see the same distance, and direction (forward or backward) doesn't matter. |
| **V4 Fog** | Every other dark square is **fogged**: drawn under mist and named "hidden". A fogged square may be empty or may hold an opponent piece; the game never tells you which. Your own pieces are never under fog. |
| **V5 Known empty** | A dark square next to one of your pieces with nothing on it is shown as empty, and that is reliable: nothing hides there. |
| **V6 When the view changes** | The view is worked out from the position as it stands: when your turn starts, and after each jump of your own move. A jumping piece sees from the square it has landed on. The pieces it has jumped stay on the board, and in view, until the move ends. You see what is in range now: an opponent piece that is no longer next to one of yours disappears from view, even if it hasn't moved. |
| **V7 Found pieces** | A hidden piece that blocks one of your jumps is shown to you for the rest of that turn (M5). |
| **V8 Game over** | When the game ends, the fog lifts and the whole board is shown. |

Captured counts ("Captured 3") stay on screen for both sides, so you always know how many pieces your opponent has left, but not where they are.

## 3. Moves and captures

**The real board decides.** Legal moves, compulsory captures, chains of jumps, crowning, the draw count and the end of the game are exactly the Classic rules applied to the real position. Fog changes only what you see, and how you find out what is legal.

| | Rule |
|---|---|
| **M1 Ordinary moves** | An ordinary move goes to a square next to the piece, which is always in view (V5). So an ordinary move you can see is a real legal move, as long as no capture has to be made. |
| **M2 Jumps that look possible** | A jump **looks possible** when the piece jumped is a visible opponent piece next to your piece, in a direction your piece may capture (men forward, kings any direction), and the landing square beyond it is either known to be empty or fogged. These are the only jumps you are offered. |
| **M3 Captures first** | If any jump looks possible, you must try one (your choice which), and ordinary moves are not offered. The pieces that can try one are ringed. The game says "you may be able to capture", never "you must", because it can't tell you whether a fogged landing square is free. |
| **M4 Trying commits you** | If the landing square is really empty, the jump is made at once, exactly as in Classic. |
| **M5 Blocked** | If the landing square holds a hidden piece, the jump does not happen: nothing moves and your turn goes on. That hidden piece is shown to you, on the square you tried, for the rest of your turn ("Blocked: a hidden leaf is on e5"). It is the only thing you learn, and your opponent is not told. Then choose again. |
| **M6 No capture after all** | When no jump looks possible any more, every ordinary move is offered: the real board has no capture either. |
| **M7 Chains** | After each jump, if another jump looks possible for the same piece from where it landed, you must try it (M3–M5). A blocked try is revealed. When no further jump looks possible, the move ends where the piece stands. The piece can't be put back once it has jumped. |
| **M8 Crowning** | Reaching the far row crowns a man and ends the move, as in Classic, even if a jump looks possible from there. |

**Why this is exactly the Classic rule on the real board.**
- **Every real capture looks possible.** The piece to be jumped is next to yours, so you see it. Its real landing square is empty, so it isn't shown as taken. You can therefore never be offered an ordinary move while a capture is really available.
- **A try fails for only one reason.** Everything about a jump that looks possible is in view, except whether a fogged landing square is empty. A failed try therefore always means a hidden piece is there, and only an opponent piece can hide in fog (V4). That is what M5 shows you.
- **So every move played is legal.** Each move that is played is a legal move of the real position, and a game can never get stuck. The tests check this over thousands of random positions, for both sides.

**Why trying is fair.** You only learn what is on a fogged square by committing to move there. If it is empty, you have moved. A block shows only the square you tried, never anything else. The Spirit plays by the same rules.

## 4. What the game never gives away

Hidden positions are not revealed through any of these:

| Channel | In Fog |
|---|---|
| The page (DOM) | The board is drawn from your view only. A fogged square has no piece in it and no piece attribute; the real board is never written into the page. |
| Accessible names and announcements | Fogged squares are named "e5: hidden". Announcements say only what you could see for yourself. |
| Move highlights | The pieces you can pick, the rings and the landing marks come from what looks possible to you (M2–M3), never from the real list of legal moves. |
| The opponent's move | It is not animated and its route is not highlighted. You are told that the opponent moved, which of your pieces it captured (squares you always see), and which opponent pieces have come into or gone out of view. |
| Turn lines | Never say whether your opponent must capture. |
| The Spirit | It decides as its turn starts, and its move appears after a fixed pause (0.9 s), so how long it thought shows nowhere. It shows no selection, route or "thinking" about particular squares, and its blocked tries are not reported. |
| Records | Your Path counts Fog games separately, by result only. Acorns & Leaves has no achievements. |
| End of game | The fog lifts only once the game is over. |
| Two players | The handoff screen (§5). |

**Limit.** This is a game running in your browser, so the real position is in the page's memory. Someone using developer tools could read it. Fog protects everything the game shows, says, announces or writes into the page.

## 5. Two players on one device

- **Handoff screen.** Before each turn, including the first, a handoff screen covers the whole screen and names the side to play next ("Leaves' turn: pass the device"). Behind it the board holds no pieces at all (every dark square fogged), and it can't be reached with the keyboard or a screen reader. The next player's view is drawn only when they press "Show the Leaves' board".
- **Announcements.** After your move you hear only "Move made", followed by whose turn it is, so nothing about your move is left in the page while the device changes hands. The next player, after taking the device, hears only what they can see: that the other side moved, what it captured of theirs, and what has come into or gone out of view.
- **Keyboard.** The board's keyboard stop goes back to its usual first square before the handoff, so it can't point at the square the last player moved to.
- **Restart.** Restart starts a new game with the handoff to the Acorns.

## 6. The Spirit in Fog

- **What it is given:** only its own view, the same kind you get:
  - its pieces;
  - the opponent pieces next to them;
  - which squares are fogged;
  - pieces found by its blocked tries;
  - how many opponent pieces are left (public, from the captured counts).

  It is never given the real board, so its choice depends only on that view. The tests check this: two real boards that look the same to the Spirit always get the same move.
- **How it chooses:**
  - It imagines several boards that fit what it sees, placing the unseen pieces on fogged squares, more often on rows nearer their home side. A piece imagined on its crowning row is a king; otherwise it assumes ordinary pieces.
  - It searches each imagined board with the Classic search (`ai.js`) and takes the move with the best average.
- **Same rules as you:** it must try captures that look possible (M3), can be blocked (M5), learns only the blocking piece, and chooses again.
- **Levels:**

  | Level | Imagined boards | Search depth |
  |---|---|---|
  | Gentle | 1 | 1 ply |
  | Balanced | 4 | 2 plies, plus forced captures |
  | Wise | up to 8 | 3 plies, plus forced captures |

  Each decision has the same bound as in Classic: 12,000 positions or 40 ms.

## 7. Records

Fog games are recorded apart from Classic games: wins, draws and losses per Spirit difficulty, and Acorns wins, Leaves wins and draws for two players. Your Path shows them in their own table.

## 8. Tests

| File | Covers |
|---|---|
| `tests/unit/acorns-leaves-fog.test.mjs` | **What each side sees (V1–V8):** a hand-made position and the opening, from both sides; 150 random positions, from both sides. **Moves (M1–M8):** must try a capture into an empty fogged square; a blocked try that reveals only the blocker, after which ordinary moves open; two captures where one is blocked and the other stays compulsory; a chain that must try a blocked continuation and then ends; a chain that continues into fog; crowning ending a chain; a king's loop through fog; no backward jumps for men. **Properties:** every real capture looks possible, from both sides, over 300 random positions; 120 random games played only through the fog view, where every move is legal, blocks happen only on hidden opponent pieces, and nothing gets stuck; two real boards that look the same give the same lists. |
| `tests/unit/acorns-leaves-fog-ai.test.mjs` | Imagined boards fit the view. Only offered steps at every level. **Not omniscient:** two real boards that look the same get the same step, at every level. Forced and empty choices. Position and time limits. Not leaving a piece to a visible enemy. Choosing within a chain. Wise beats Gentle over whole Fog games. |
| `tests/unit/acorns-leaves-fog-session.test.mjs` | Every model drawn is checked: no piece in fog, no opponent piece out of range. The Spirit is handed exactly its view. It decides at once, and its move appears after the fixed pause without being described or highlighted. Blocked tries, including one that ends a chain. The fog lifts at the end, and the game is kept in the Fog records. Two-player handoff with an empty board behind it, and each player told only their view. Restarting and leaving cancel the Spirit and the handoff. Classic is unchanged. Two real boards that look the same draw and say the same. A whole game against the real Spirit. |
| `tests/browser/acorns-leaves-fog.test.mjs` | **Setup:** Fog chosen and remembered, with its own routes. **A whole two-player game**, with every turn checked against that player's view square by square (piece attributes, drawn pieces, fog, accessible names). Every handoff covers the screen, has no piece, mark or last-move hint behind it, and resets the keyboard stop; the fog lifts at the end. **A whole game against the Spirit** with leak checks on every turn. A blocked try revealing exactly one square. Restart during the Spirit's turn. Classic still showing everything. Phone and landscape layout. |
| `tests/browser/hub.test.mjs` | The handoff screen and the Fog match are reachable, with large enough controls, at four screen sizes. |
