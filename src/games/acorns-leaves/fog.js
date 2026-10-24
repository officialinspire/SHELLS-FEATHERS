// Fog of War (docs/fog-rules.md): what each side sees, and moves picked a
// square at a time against that view. Pure.
//
// A fog turn is { state, moves, path, found }: the real position and its
// legal moves (engine.js), the squares chosen so far, and the hidden pieces
// this turn's blocked jumps have found (rule M5). The real position and
// moves are used only to judge a try. Everything a player or the Spirit is
// shown comes from their view (observe()), never from the real moves: the
// pieces they may pick, where they may go, and whether a capture may be
// possible.
import { rowOf, colOf, squareAt, isDarkSquare, legalMoves, forwardOf, countPieces, opponent } from './engine.js';

// An unseen dark square: it may be empty or hold an opponent piece (V4).
export const FOG = Object.freeze({ fog: true });
export const isPiece = (cell) => cell !== null && cell !== undefined && cell !== FOG;

const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const step = (square, [dr, dc], times = 1) => squareAt(rowOf(square) + dr * times, colOf(square) + dc * times);
const neighbours = (square) => DIAGONALS.map((d) => step(square, d)).filter((s) => s !== -1);
const directionsOf = (p) => (p.king ? DIAGONALS : DIAGONALS.filter(([dr]) => dr === forwardOf(p.side)));
const startsWith = (path, prefix) => prefix.every((square, i) => path[i] === square);
const samePath = (a, b) => a.length === b.length && startsWith(a, b);

// The squares `side` can see on `board`: its own pieces and every square next
// to them (V2, V3, V5).
export function visibleSquares(board, side) {
  const seen = new Set();
  board.forEach((p, square) => {
    if (p?.side !== side) return;
    seen.add(square);
    for (const n of neighbours(square)) seen.add(n);
  });
  return seen;
}

// What `side` sees: its pieces, opponent pieces on squares it can see (plus
// `extra` squares: found blockers, pieces being jumped), null where it knows
// a square is empty, and FOG on every other dark square. Light squares are
// null: they never hold pieces.
export function observe(board, side, extra = []) {
  const seen = visibleSquares(board, side);
  for (const square of extra) seen.add(square);
  return board.map((p, square) => {
    if (!isDarkSquare(square)) return null;
    return seen.has(square) ? p : FOG;
  });
}

const make = (state, moves, path, found) => Object.freeze({
  state, moves, path: Object.freeze(path), found: Object.freeze(found),
});

export const startFogTurn = (state) => make(state, legalMoves(state), [], []);

export const inChain = (turn) => turn.path.length >= 2;
export const selectedSquare = (turn) => (turn.path.length ? turn.path[turn.path.length - 1] : null);

// Pieces jumped so far in an unfinished chain (the square between each pair
// of landings).
export function jumpedSoFar(turn) {
  const jumped = [];
  for (let i = 1; i < turn.path.length; i++) jumped.push((turn.path[i - 1] + turn.path[i]) / 2);
  return jumped;
}

// The real board as it stands mid-move: the moving piece on the last square
// it reached, jumped pieces still in place. Not for display in Fog: see view().
export function displayBoard(turn) {
  const board = [...turn.state.board];
  if (inChain(turn)) {
    const piece = board[turn.path[0]];
    board[turn.path[0]] = null;
    board[turn.path[turn.path.length - 1]] = piece;
  }
  return board;
}

// What the player to move sees now (V6, V7): the pieces it is jumping and the
// pieces its blocked tries found stay in view for the rest of the turn.
export const view = (turn) => observe(displayBoard(turn), turn.state.turn, [...jumpedSoFar(turn), ...turn.found]);

// Landing squares of the jumps that look possible for `piece` standing on
// `at` (M2): a visible opponent piece next to it, in a direction it may
// capture, not already jumped, with a landing square that is known to be
// empty, fogged, or the square the move started from.
function jumpsFrom(seen, at, piece, start, jumped) {
  const lands = [];
  for (const direction of directionsOf(piece)) {
    const over = step(at, direction);
    const land = step(at, direction, 2);
    if (over === -1 || land === -1) continue;
    const target = seen[over];
    if (!isPiece(target) || target.side === piece.side || jumped.includes(over)) continue;
    if (seen[land] === null || seen[land] === FOG || land === start) lands.push(land);
  }
  return lands;
}

// The first steps that look possible: { capture, steps: [{ from, to }] }.
// When any jump looks possible only jumps are offered (M3); otherwise every
// ordinary move to a square known to be empty (M1, M6).
function firstSteps(turn, seen) {
  const side = turn.state.turn;
  const jumps = [];
  const moves = [];
  seen.forEach((p, square) => {
    if (!isPiece(p) || p.side !== side) return;
    for (const to of jumpsFrom(seen, square, p, square, [])) jumps.push({ from: square, to });
    for (const direction of directionsOf(p)) {
      const to = step(square, direction);
      if (to !== -1 && seen[to] === null) moves.push({ from: square, to });
    }
  });
  return jumps.length ? { capture: true, steps: jumps } : { capture: false, steps: moves };
}

// The next steps that look possible from where the turn stands.
export function apparentSteps(turn) {
  const seen = view(turn);
  if (!inChain(turn)) {
    const first = firstSteps(turn, seen);
    if (!turn.path.length) return first;
    return { capture: first.capture, steps: first.steps.filter((s) => s.from === turn.path[0]) };
  }
  const at = turn.path[turn.path.length - 1];
  const piece = turn.state.board[turn.path[0]];
  const lands = jumpsFrom(seen, at, piece, turn.path[0], jumpedSoFar(turn));
  return { capture: true, steps: lands.map((to) => ({ from: at, to })) };
}

// A capture may be possible this turn, so one must be tried (M3).
export const mayCapture = (turn) => !inChain(turn) && firstSteps(turn, view(turn)).capture;

// Pieces that may be picked up, in board order (none mid-chain).
export function movablePieces(turn) {
  if (inChain(turn)) return [];
  return [...new Set(firstSteps(turn, view(turn)).steps.map((s) => s.from))].sort((a, b) => a - b);
}

// Where the picked-up piece may go next, as far as the player can tell.
export function destinations(turn) {
  if (!turn.path.length) return [];
  return [...new Set(apparentSteps(turn).steps.map((s) => s.to))];
}

// Takes a square the player picked. Outcomes as in turn.js choose(), plus:
//   'bumped'  the jump's landing square holds a hidden piece (M5): nothing
//             moves, the piece is found (`found`) and stays in view for the
//             rest of the turn. In a chain with no further jump that looks
//             possible, the move ends there (M7) and `move` is set.
// 'must-capture' means a jump may be possible, so one must be tried first.
export function chooseFog(turn, square) {
  const result = (outcome, next = turn, extra = {}) => ({ turn: next, outcome, ...extra });

  if (destinations(turn).includes(square)) {
    const path = [...turn.path, square];
    const reached = make(turn.state, turn.moves, path, turn.found);
    const done = turn.moves.find((m) => samePath(m.path, path));
    // A chain that really ends here still has to try every further jump that
    // looks possible from here (M7): ending it now would tell the player those
    // landing squares are taken. Crowning always ends it (M8).
    if (done && (!done.captures.length || done.crowned || !destinations(reached).length)) {
      return result('complete', reached, { move: done });
    }
    if (done || turn.moves.some((m) => m.path.length > path.length && startsWith(m.path, path))) {
      return result('jump', reached);
    }
    // Everything about this jump was in view except its fogged landing
    // square, so a hidden piece stands there.
    let next = make(turn.state, turn.moves, turn.path, [...turn.found, square]);
    if (inChain(next) && !destinations(next).length) {
      const end = turn.moves.find((m) => samePath(m.path, next.path));
      return result('bumped', next, { found: square, move: end });
    }
    if (!inChain(next) && !destinations(next).length) next = make(turn.state, turn.moves, [], next.found);
    return result('bumped', next, { found: square });
  }
  if (inChain(turn)) return result('must-continue');
  if (turn.path[0] === square) return result('deselect', make(turn.state, turn.moves, [], turn.found));
  const seen = view(turn);
  if (isPiece(seen[square]) && seen[square].side === turn.state.turn) {
    if (movablePieces(turn).includes(square)) return result('select', make(turn.state, turn.moves, [square], turn.found));
    return result(mayCapture(turn) ? 'must-capture' : 'blocked');
  }
  return result(turn.path.length ? 'not-a-destination' : 'ignored');
}

// Puts the picked-up piece back. A jump already made can't be taken back.
export const cancelFog = (turn) => (inChain(turn) || !turn.path.length ? turn : make(turn.state, turn.moves, [], turn.found));

// Everything the Spirit is given when it is its turn in Fog: its own view,
// the squares chosen so far, the steps that look possible, and how many
// opponent pieces are left (public: 12 minus what it has captured). Never
// the real board or its legal moves.
export function observation(turn) {
  const side = turn.state.turn;
  return {
    side,
    board: view(turn),
    path: [...turn.path],
    steps: apparentSteps(turn).steps.map((s) => ({ ...s })),
    capture: apparentSteps(turn).capture,
    opponentCount: countPieces(turn.state.board, opponent(side)),
  };
}

// Opponent pieces `side` can see, as square -> piece (for "came into view").
export function opponentsInView(seen, side) {
  const found = new Map();
  seen.forEach((p, square) => { if (isPiece(p) && p.side !== side) found.set(square, p); });
  return found;
}

