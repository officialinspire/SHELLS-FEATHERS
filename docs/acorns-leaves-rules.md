# Acorns & Leaves: Classic Checkers rules

Acorns & Leaves is checkers (draughts) with acorn and leaf pieces. Its rules engine is `src/games/acorns-leaves/engine.js`: pure functions with no user interface. This page records the rules it plays by, and the choices made where checkers rule sets differ. The rules follow **American checkers / English draughts**.

The game is not playable yet: the board and controls come in a later stage. Fog of War is not part of this rule set.

## Board and pieces

- An 8 × 8 board. Play happens only on the dark squares, where row + column is odd. Each player has a dark square at their bottom-left corner.
- Squares are numbered 0–63, row by row from the top-left (`index = row × 8 + column`).
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
  positionFromRows, rowsFromBoard, IllegalMoveError,
} from './src/games/acorns-leaves/engine.js';
```

| Function | Purpose |
|---|---|
| `createInitialState()` | The starting position, with Acorns to move. A state is `{ board, turn, quietPlies }`, frozen. `board[i]` is `null` or `{ side: 'acorn' \| 'leaf', king }`. |
| `legalMoves(state)` | Every legal move for the side to move, or `[]` once the game has ended. When a capture exists only captures are returned, each as a complete chain. The order is deterministic. |
| `legalMovesFrom(state, square)` | The legal moves of one piece. A UI can highlight these. |
| `findMove(state, path)` | The legal move with this exact path (start square, then each landing square), or `null`. |
| `applyMove(state, moveOrPath)` | Plays a legal move and returns the next state, with captured pieces removed, crowning applied and the turn switched. The input state is untouched. Anything illegal throws `IllegalMoveError` with a `code` (`game-over`, `not-allowed`, `no-piece`, `not-your-piece`, `must-capture`, `must-continue`) and a player-facing message. |
| `switchTurn(state)` | The same position with the other side to move. `applyMove` uses it; on its own it is for setting up positions. |
| `gameResult(state)` | `null` while the game goes on, or `{ winner, reason }` where `reason` is `no-pieces`, `no-moves` or `no-progress` (`winner: null` for the draw). |
| `positionFromRows(rows, { turn, quietPlies })` / `rowsFromBoard(board)` | Build or print a position as 8 strings (`a`/`A` acorn and acorn king, `l`/`L` leaf and leaf king, `.` empty). Used by the tests. |

A move is `{ from, to, path, captures, crowned }`. For example, a double jump from row 5, column 6 is:

```
{ from: 46, to: 14, path: [46, 28, 14], captures: [37, 21], crowned: false }
```

## Tests

`tests/unit/acorns-leaves-engine.test.mjs` covers:
- setup, including that it matches the picture on the hub's preview card;
- the classic seven opening moves;
- illegal moves, each with its reason;
- immutability;
- forced captures and free choice between them;
- multi-jumps (must continue, branching, no double jumps, a king returning to its start square);
- crowning on both sides, including crowning ending a chain;
- king moves and backward captures;
- the draw count;
- elimination, blockade, the draw, and win-before-draw precedence.

It also plays **300 seeded random games** from the opening. On every move it checks:
- captures are compulsory;
- ordinary pieces only go forward;
- pieces stay on dark squares;
- piece counts change only by captures;
- crowning happens only on the far row;
- the turn alternates;
- every game ends.
