# Acorns & Leaves: Classic Checkers rules

Acorns & Leaves is checkers (draughts) with acorn and leaf pieces. Its rules engine is `src/games/acorns-leaves/engine.js`: pure functions with no user interface. This page records the rules it plays by, the choices made where checkers rule sets differ, and how the Spirit (the computer opponent) chooses its moves. The rules follow **American checkers / English draughts**.

The game is played from the Spirit of the Woods hub, by two players on one device or against the Spirit. The screens only ask the engine what is legal and hand it the move to play; no rule lives in the user interface. Fog of War is not part of this rule set.

## Board and pieces

- An 8 × 8 board. Play happens only on the dark squares, where row + column is odd. Each player has a dark square at their bottom-left corner.
- Squares are numbered 0–63, row by row from the top-left (`index = row × 8 + column`).
- On screen and in announcements, squares are named like a chess board seen from the Acorns' side: files **a–h** from left to right, ranks **1–8** from the Acorns' back row up. The Acorns start on ranks 1–3, the Leaves on ranks 6–8, and a1 is the dark square at the Acorns' bottom-left. When a player takes the Leaves against the Spirit the board is drawn turned round (their pieces at the bottom), and the names stay the same.
- **Leaves** start on the dark squares of rows 0–2 (top), and **Acorns** on rows 5–7 (bottom): 12 pieces each.

## Turns and direction

| | Acorns | Leaves |
|---|---|---|
| Moves first | **Yes.** Acorns are the darker pieces, and in classic checkers the darker side starts. | No |
| "Forward" | Up the board, toward row 0 | Down the board, toward row 7 |
| Crowned on | Row 0 | Row 7 |

Players alternate. Passing is not allowed.

## Moves

| Rule | Choice |
|---|---|
| Ordinary piece, move | One square diagonally **forward** to an empty dark square. |
| Ordinary piece, capture | Diagonally **forward only**: jump an adjacent opponent piece to the empty square just beyond it. **No backward captures** for ordinary pieces (the classic rule; some other draughts games allow them). |
| King, move and capture | One square diagonally in **any** direction, and jumps in any direction. Kings are not "flying": they never slide more than one square. |
| Captures are compulsory | **Yes.** If any capture is available, the player must capture. |
| Choosing between captures | **Free choice.** The player may pick any available capture. There is no rule to take the most pieces or to capture with a king. |
| Chained captures | After a jump, **the same piece must keep jumping** while it can, and the whole chain is one move. Where the chain branches, the player chooses the branch. |
| During a chain | A piece **can't be jumped twice**. Jumped pieces stay on their squares until the move ends, so they can't be landed on. The moving piece's start square counts as empty, so a king can finish on the square it started from. |
| Crowning | An ordinary piece that reaches the far row becomes a king. **Crowning ends the move**, even partway through a chain of jumps: the new king waits until its next turn to move or capture as a king. |

## End of the game

| Result | When |
|---|---|
| Win by elimination | The opponent has no pieces left. |
| Win by blockade | The player to move has pieces but **no legal move**. That player loses. |
| Draw (engine choice) | **40 moves by each side (80 plies) with no capture and no ordinary piece moved.** Only king moves without captures count, and any capture or ordinary-piece move restarts the count. This keeps every game finite. A win is reported ahead of the draw. |

Not modelled: draws by agreement, threefold repetition, resigning, time limits, and tournament opening ballots. "Huffing" (removing a piece that failed to capture) is not used, since captures are simply enforced.

## Engine API

```js
import {
  createInitialState, legalMoves, legalMovesFrom, findMove, applyMove, switchTurn, gameResult,
  analyze, playLegalMove, positionFromRows, rowsFromBoard, IllegalMoveError,
} from './src/games/acorns-leaves/engine.js';
```

| Function | Purpose |
|---|---|
| `createInitialState()` | The starting position, with Acorns to move. A state is `{ board, turn, quietPlies }`, frozen. `board[i]` is `null` or `{ side: 'acorn' \| 'leaf', king }`. |
| `legalMoves(state)` | Every legal move for the side to move, or `[]` once the game has ended. When a capture exists only captures are returned, each as a complete chain. The order is deterministic. |
| `legalMovesFrom(state, square)` | The legal moves of one piece. A UI can highlight these. |
| `findMove(state, path)` | The legal move with this exact path (start square, then each landing square), or `null`. |
| `applyMove(state, moveOrPath)` | Plays a legal move and returns the next state, with captured pieces removed, crowning applied and the turn switched. The input state is untouched. Anything illegal throws `IllegalMoveError` with a `code` (`game-over`, `not-allowed`, `no-piece`, `not-your-piece`, `must-capture`, `must-continue`) and a player-facing message. Every move in the game, the Spirit's included, is played through this check. |
| `analyze(state)` | `{ result, moves }`: `gameResult` and `legalMoves` in one pass. |
| `playLegalMove(state, move)` | `applyMove` without the check, for a move taken from `legalMoves(state)`. Only the Spirit's search uses it, to try moves quickly. |
| `switchTurn(state)` | The same position with the other side to move. `applyMove` uses it; on its own it is for setting up positions. |
| `gameResult(state)` | `null` while the game goes on, or `{ winner, reason }` where `reason` is `no-pieces`, `no-moves` or `no-progress` (`winner: null` for the draw). |
| `positionFromRows(rows, { turn, quietPlies })` / `rowsFromBoard(board)` | Build or print a position as 8 strings (`a`/`A` acorn and acorn king, `l`/`L` leaf and leaf king, `.` empty). Used by the tests. |

A move is `{ from, to, path, captures, crowned }`. For example, a double jump from row 5, column 6 is:

```
{ from: 46, to: 14, path: [46, 28, 14], captures: [37, 21], crowned: false }
```

## The Spirit

`src/games/acorns-leaves/ai.js` picks a move for the side to move. It only ever returns one of `legalMoves(state)`, and the session still plays it through `applyMove`.

- **Search:** iterative deepening negamax with alpha-beta pruning. When the side to move must capture, the search keeps going (a few extra plies) instead of judging the position mid-exchange.
- **Judging a position:** material (a king is worth 1.5 men), men's progress toward the crown row, a guarded back row, the centre, and for the side that is ahead, trading down and bringing kings toward the remaining enemy pieces.
- **Bounded:** each search stops after 12,000 positions or 40 ms, whichever comes first, and plays the best move of the deepest search it finished. That leaves room to draw the move within the browser's 50 ms long-task mark, so a Spirit turn never stalls the page; a slow phone just searches less deeply. When only one move is legal, it is played without searching.

| Level | Looks ahead | Variety |
|---|---|---|
| Gentle | 1 move (its own) | Any move within 40 points of its best: close to random among sensible moves |
| Balanced | 3 plies, plus forced captures | Any move within 12 points (an eighth of a man) of its best |
| Wise | As deep as the bounds allow (typically 5–7 plies on a desktop, fewer on a slow phone) | Always its best move; ties broken at random |

In play the Spirit waits half a second, then shows its move a square at a time (0.4 s per square), so a chain of jumps can be followed. Board input is ignored from the start of its turn until its move is played.

## Tests

`tests/unit/acorns-leaves-engine.test.mjs` covers:
- setup (the hub card and the rules page draw this same starting position);
- the classic seven opening moves;
- illegal moves, each with its reason;
- immutability;
- forced captures and free choice between them;
- multi-jumps (must continue, branching, no double jumps, a king returning to its start square);
- crowning on both sides, including crowning ending a chain;
- king moves and backward captures;
- the draw count;
- elimination, blockade, the draw, and win-before-draw precedence.

It also plays **300 seeded random games** from the opening. On every move it checks that `analyze` matches `gameResult` and `legalMoves`, that `playLegalMove` matches `applyMove`, and that:
- captures are compulsory;
- ordinary pieces only go forward;
- pieces stay on dark squares;
- piece counts change only by captures;
- crowning happens only on the far row;
- the turn alternates;
- every game ends.

`tests/unit/acorns-leaves-ai.test.mjs` covers the Spirit: only legal moves from 120 sampled positions at every level, nothing to choose when the game is over, the bigger capture, never leaving a piece to be jumped for nothing, "give one, take two", the position and time limits (with a fake clock and in real time), repeatability, and stronger levels beating weaker ones over whole games.
