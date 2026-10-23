// Acorns & Leaves: a Classic Checkers rules engine (American checkers /
// English draughts). Pure functions over immutable states: no DOM, no timers,
// no storage. Rule choices are explained in docs/acorns-leaves-rules.md.
//
// Board: 8×8, squares indexed 0..63 row by row from the top-left
// (index = row * 8 + col). Play is on the dark squares, where
// (row + col) is odd; each player has a dark square at their bottom-left.
// Leaves start on rows 0-2 (top) and move down; Acorns start on rows 5-7
// (bottom), move up, and move first.
//
// Rules in brief:
// - Ordinary pieces move one square diagonally forward and capture forward
//   only. Kings move and capture one square diagonally in any direction.
// - Captures are compulsory. With several captures available the player may
//   choose any of them, but a capturing piece must keep jumping while it can.
//   A piece can't be jumped twice in one move; jumped pieces leave the board
//   when the move ends.
// - Reaching the far row crowns an ordinary piece and ends the move, even in
//   the middle of a chain of jumps.
// - A player with no pieces, or with no legal move on their turn, loses. A
//   game is drawn after 40 moves by each side (80 plies) with no capture and
//   no ordinary piece moved.
//
// A move is a plain object { from, to, path, captures, crowned }: `path` lists
// every square the piece stands on, start to finish (one step for a simple
// move, one entry per jump otherwise), and `captures` the jumped squares.

export const SIZE = 8;
export const SIDES = Object.freeze(['acorn', 'leaf']);
export const FIRST_TO_MOVE = 'acorn';
export const DRAW_AFTER_QUIET_PLIES = 80;

const piece = (side, king) => Object.freeze({ side, king });
const PIECES = Object.freeze({
  a: piece('acorn', false), A: piece('acorn', true),
  l: piece('leaf', false), L: piece('leaf', true),
});
const ALL_DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export const opponent = (side) => (side === 'acorn' ? 'leaf' : 'acorn');
// Row step toward the opponent's side of the board.
export const forwardOf = (side) => (side === 'acorn' ? -1 : 1);
export const crownRowOf = (side) => (side === 'acorn' ? 0 : SIZE - 1);

export const rowOf = (square) => Math.floor(square / SIZE);
export const colOf = (square) => square % SIZE;
export const isDarkSquare = (square) => (rowOf(square) + colOf(square)) % 2 === 1;
// The square at (row, col), or -1 off the board.
export const squareAt = (row, col) => (row >= 0 && row < SIZE && col >= 0 && col < SIZE ? row * SIZE + col : -1);
const isSquare = (value) => Number.isInteger(value) && value >= 0 && value < SIZE * SIZE;
const step = (square, [dr, dc], times = 1) => squareAt(rowOf(square) + dr * times, colOf(square) + dc * times);

export class IllegalMoveError extends Error {
  // code: 'game-over' | 'not-allowed' | 'no-piece' | 'not-your-piece' | 'must-capture' | 'must-continue'
  constructor(code, message) {
    super(message);
    this.name = 'IllegalMoveError';
    this.code = code;
  }
}

function makeState(board, turn, quietPlies) {
  return Object.freeze({ board: Object.freeze(board), turn, quietPlies });
}

// ---------------------------------------------------------------- positions

export function createInitialState() {
  return positionFromRows([
    '.l.l.l.l',
    'l.l.l.l.',
    '.l.l.l.l',
    '........',
    '........',
    'a.a.a.a.',
    '.a.a.a.a',
    'a.a.a.a.',
  ]);
}

// Builds a state from 8 strings of 8 characters, top row first:
// a/A = acorn/acorn king, l/L = leaf/leaf king, anything else = empty.
export function positionFromRows(rows, { turn = FIRST_TO_MOVE, quietPlies = 0 } = {}) {
  if (!Array.isArray(rows) || rows.length !== SIZE || rows.some((r) => typeof r !== 'string' || r.length !== SIZE)) {
    throw new Error('A position needs 8 rows of 8 characters.');
  }
  if (!SIDES.includes(turn)) throw new Error(`Unknown side: ${turn}`);
  const board = [];
  rows.forEach((row, r) => [...row].forEach((char, c) => {
    const found = PIECES[char] ?? null;
    if (found && (r + c) % 2 === 0) throw new Error(`Pieces stand on dark squares only (row ${r}, column ${c}).`);
    board.push(found);
  }));
  return makeState(board, turn, quietPlies);
}

export function rowsFromBoard(board) {
  const codes = { acorn: ['a', 'A'], leaf: ['l', 'L'] };
  const rows = [];
  for (let r = 0; r < SIZE; r++) {
    rows.push(board.slice(r * SIZE, (r + 1) * SIZE).map((p) => (p ? codes[p.side][p.king ? 1 : 0] : '.')).join(''));
  }
  return rows;
}

export const countPieces = (board, side) => board.filter((p) => p?.side === side).length;

// ---------------------------------------------------------------- moves

const directionsOf = (p) => (p.king ? ALL_DIRECTIONS : ALL_DIRECTIONS.filter(([dr]) => dr === forwardOf(p.side)));

function move(path, captures, crowned) {
  return Object.freeze({
    from: path[0], to: path[path.length - 1], path: Object.freeze(path), captures: Object.freeze(captures), crowned,
  });
}

// Every complete capture sequence for the piece on `from`. The board is not
// changed while searching: jumped pieces stay put (so they block squares and
// can't be jumped again) and the start square counts as empty.
function captureSequences(board, from) {
  const mover = board[from];
  const crownRow = crownRowOf(mover.side);
  const results = [];
  const search = (at, path, captured) => {
    let jumped = false;
    for (const direction of directionsOf(mover)) {
      const over = step(at, direction);
      const land = step(at, direction, 2);
      if (over === -1 || land === -1) continue;
      const target = board[over];
      if (!target || target.side === mover.side || captured.includes(over)) continue;
      if (board[land] !== null && land !== from) continue;
      jumped = true;
      const nextPath = [...path, land];
      const nextCaptured = [...captured, over];
      // Crowning ends the move, even if more jumps would follow.
      if (!mover.king && rowOf(land) === crownRow) results.push(move(nextPath, nextCaptured, true));
      else search(land, nextPath, nextCaptured);
    }
    if (!jumped && captured.length) results.push(move(path, captured, false));
  };
  search(from, [from], []);
  return results;
}

function simpleMoves(board, from) {
  const mover = board[from];
  return directionsOf(mover)
    .map((direction) => step(from, direction))
    .filter((to) => to !== -1 && board[to] === null)
    .map((to) => move([from, to], [], !mover.king && rowOf(to) === crownRowOf(mover.side)));
}

// All legal moves for `side` on `board`, ignoring the draw rule: captures if
// any exist (they are compulsory), otherwise simple moves. Ordered by start
// square, then search order, so results are deterministic.
function movesFor(board, side) {
  const own = [];
  for (let square = 0; square < board.length; square++) if (board[square]?.side === side) own.push(square);
  const captures = own.flatMap((square) => captureSequences(board, square));
  return captures.length ? captures : own.flatMap((square) => simpleMoves(board, square));
}

// The moves available to the side to move (none once the game has ended).
export function legalMoves(state) {
  return gameResult(state) ? [] : movesFor(state.board, state.turn);
}

export const legalMovesFrom = (state, square) => legalMoves(state).filter((m) => m.from === square);

const samePath = (a, b) => a.length === b.length && a.every((square, i) => square === b[i]);
const startsWith = (path, prefix) => prefix.length < path.length && prefix.every((square, i) => square === path[i]);

// The legal move with exactly this path (start square, then each landing
// square), or null.
export function findMove(state, path) {
  if (!Array.isArray(path)) return null;
  return legalMoves(state).find((m) => samePath(m.path, path)) ?? null;
}

function explainIllegal(state, path) {
  if (gameResult(state)) return new IllegalMoveError('game-over', 'The game is over.');
  if (!Array.isArray(path) || path.length < 2 || !path.every(isSquare)) {
    return new IllegalMoveError('not-allowed', 'A move needs a start square and at least one square to move to.');
  }
  const mover = state.board[path[0]];
  if (!mover) return new IllegalMoveError('no-piece', 'There is no piece on that square.');
  if (mover.side !== state.turn) {
    return new IllegalMoveError('not-your-piece', `It is the ${state.turn === 'acorn' ? 'Acorns' : 'Leaves'}' turn.`);
  }
  const moves = legalMoves(state);
  if (moves.some((m) => startsWith(m.path, path))) {
    return new IllegalMoveError('must-continue', 'The same piece must keep jumping while it can.');
  }
  if (moves[0]?.captures.length) return new IllegalMoveError('must-capture', 'A capture is available, so you must capture.');
  return new IllegalMoveError('not-allowed', 'That move is not allowed.');
}

// ---------------------------------------------------------------- turns

// The same position with the other side to move. applyMove calls this after
// every move; on its own it is only for setting up positions (passing is not a
// legal move in checkers).
export function switchTurn(state) {
  return makeState([...state.board], opponent(state.turn), state.quietPlies);
}

// Plays a legal move (a move object from legalMoves, or its path) and returns
// the next state with the other side to move. Throws IllegalMoveError, with a
// code and a player-facing message, for anything else.
export function applyMove(state, moveOrPath) {
  const path = Array.isArray(moveOrPath) ? moveOrPath : moveOrPath?.path;
  const chosen = findMove(state, path);
  if (!chosen) throw explainIllegal(state, path);

  const board = [...state.board];
  const mover = board[chosen.from];
  board[chosen.from] = null;
  for (const square of chosen.captures) board[square] = null;
  board[chosen.to] = chosen.crowned ? PIECES[mover.side === 'acorn' ? 'A' : 'L'] : mover;

  // Progress (captures and ordinary-piece moves) resets the draw count.
  const quietPlies = chosen.captures.length || !mover.king ? 0 : state.quietPlies + 1;
  return switchTurn(makeState(board, state.turn, quietPlies));
}

// ---------------------------------------------------------------- game end

// null while the game goes on, otherwise { winner, reason }:
// - { winner, reason: 'no-pieces' } when one side has no pieces left;
// - { winner, reason: 'no-moves' } when the side to move has no legal move
//   (winner is the other side);
// - { winner: null, reason: 'no-progress' } after DRAW_AFTER_QUIET_PLIES
//   plies with no capture and no ordinary piece moved.
// A win takes precedence over the draw.
export function gameResult(state) {
  const { board, turn } = state;
  if (countPieces(board, turn) === 0) return { winner: opponent(turn), reason: 'no-pieces' };
  if (countPieces(board, opponent(turn)) === 0) return { winner: turn, reason: 'no-pieces' };
  if (movesFor(board, turn).length === 0) return { winner: opponent(turn), reason: 'no-moves' };
  if (state.quietPlies >= DRAW_AFTER_QUIET_PLIES) return { winner: null, reason: 'no-progress' };
  return null;
}
