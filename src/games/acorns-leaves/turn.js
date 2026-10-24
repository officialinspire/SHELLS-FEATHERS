// One player's turn, picked a square at a time: first a piece, then each
// square it lands on, until the squares chosen spell out a complete legal
// move. Pure: every call returns a new turn and nothing is played here; the
// session plays the finished move through applyMove.
//
// A turn is { state, moves, path }: the position, its legal moves, and the
// squares chosen so far (start square first). While `path` holds a start
// square and at least one landing, the piece is in the middle of a chain of
// jumps and must keep jumping; it can't be put back.
import { legalMoves } from './engine.js';

const startsWith = (path, prefix) => prefix.every((square, i) => path[i] === square);
const samePath = (a, b) => a.length === b.length && startsWith(a, b);
const make = (state, moves, path) => Object.freeze({ state, moves, path: Object.freeze(path) });
const owns = (turn, square) => turn.state.board[square]?.side === turn.state.turn;

export const startTurn = (state) => make(state, legalMoves(state), []);

// Captures are compulsory this turn (so every legal move is a capture).
export const mustCapture = (turn) => turn.moves.length > 0 && turn.moves[0].captures.length > 0;

// A piece has jumped and must jump again.
export const inChain = (turn) => turn.path.length >= 2;

// Squares of the pieces that can start a move, in board order.
export const movablePieces = (turn) => [...new Set(turn.moves.map((m) => m.from))].sort((a, b) => a - b);

// The legal moves that continue the squares chosen so far.
const continuing = (turn, path = turn.path) => turn.moves.filter((m) => m.path.length > path.length && startsWith(m.path, path));

// Where the chosen piece may go next (empty when nothing is chosen).
export function destinations(turn) {
  if (!turn.path.length) return [];
  return [...new Set(continuing(turn).map((m) => m.path[turn.path.length]))];
}

// Pieces jumped so far in an unfinished chain. They stay on the board until
// the move ends.
export function jumpedSoFar(turn) {
  if (!inChain(turn)) return [];
  return continuing(turn)[0].captures.slice(0, turn.path.length - 1);
}

// The board as it looks mid-move: the chosen piece stands on the last square
// it reached; jumped pieces are still there.
export function displayBoard(turn) {
  const board = [...turn.state.board];
  if (inChain(turn)) {
    const piece = board[turn.path[0]];
    board[turn.path[0]] = null;
    board[turn.path[turn.path.length - 1]] = piece;
  }
  return board;
}

// The square the chosen piece stands on, or null.
export const selectedSquare = (turn) => (turn.path.length ? turn.path[turn.path.length - 1] : null);

// Takes a square the player picked. Returns { turn, outcome, move? }:
//   'select'            a piece was picked up
//   'deselect'          the picked-up piece was put back
//   'jump'              the piece jumped and must jump again
//   'complete'          that square finished a legal move (`move`)
//   'must-capture'      one of the player's pieces that can't capture, while a
//                       capture is compulsory
//   'blocked'           one of the player's pieces with no move
//   'must-continue'     mid-chain, anything but the next landing squares
//   'not-a-destination' the picked-up piece can't go there
//   'ignored'           nothing picked up, and not one of the player's pieces
export function choose(turn, square) {
  const result = (outcome, next = turn, move) => ({ turn: next, outcome, ...(move ? { move } : {}) });

  if (destinations(turn).includes(square)) {
    const path = [...turn.path, square];
    const done = turn.moves.find((m) => samePath(m.path, path));
    if (done) return result('complete', make(turn.state, turn.moves, path), done);
    return result('jump', make(turn.state, turn.moves, path));
  }
  if (inChain(turn)) return result('must-continue');
  if (turn.path[0] === square) return result('deselect', make(turn.state, turn.moves, []));
  if (owns(turn, square)) {
    if (movablePieces(turn).includes(square)) return result('select', make(turn.state, turn.moves, [square]));
    return result(mustCapture(turn) ? 'must-capture' : 'blocked');
  }
  return result(turn.path.length ? 'not-a-destination' : 'ignored');
}

// Puts the picked-up piece back. A jump already made can't be taken back.
export const cancel = (turn) => (inChain(turn) || !turn.path.length ? turn : make(turn.state, turn.moves, []));
