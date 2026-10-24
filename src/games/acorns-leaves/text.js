// Words for Acorns & Leaves: square names, what a move did, whose turn it
// is, guidance for the player, and results. Pure, so the session and the
// tests share them.
//
// Squares are named like a chess board seen from the Acorns' side: files a-h
// from left to right and ranks 1-8 from the bottom (the Acorns' back row) up,
// so the Acorns start on ranks 1-3 and the Leaves on ranks 6-8.
import { rowOf, colOf, SIZE } from './engine.js';

export const SIDE_NAMES = { acorn: 'Acorns', leaf: 'Leaves' };
const ONE = { acorn: 'acorn', leaf: 'leaf' };
const MANY = { acorn: 'acorns', leaf: 'leaves' };

export const squareName = (square) => `${'abcdefgh'[colOf(square)]}${SIZE - rowOf(square)}`;

export const pieceName = (piece) => (piece ? `${ONE[piece.side]}${piece.king ? ' king' : ''}` : 'empty');

const count = (n, side) => `${n} ${n === 1 ? ONE[side] : MANY[side]}`;

// "e3", "c5 or e5", "b4, d4 or f4".
export function listSquares(squares) {
  const names = squares.map(squareName);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names.join('');
}

// After a piece is picked up: "Acorn on c3 picked up. It can move to b4 or d4."
export function pickText({ square, piece, destinations, capture }) {
  const name = pieceName(piece);
  return `${name[0].toUpperCase()}${name.slice(1)} on ${squareName(square)} picked up. `
    + `It can ${capture ? 'jump' : 'move'} to ${listSquares(destinations)}.`;
}

// After one jump of a chain: "Jumped to e5. Keep jumping: c7 or g7."
export const jumpText = ({ to, destinations }) => `Jumped to ${squareName(to)}. Keep jumping: ${listSquares(destinations)}.`;

// Who is playing `side`: "You" / "The Spirit" against the Spirit, the side's
// name with two players.
export function actorName(mode, side, humanSide) {
  if (mode === 'single') return side === humanSide ? 'You' : 'The Spirit';
  return SIDE_NAMES[side];
}

// "You jumped from c3 to e5 to c7, capturing 2 leaves." `piece` is the piece
// that moved, as it was before the move.
export function moveText({ mode, humanSide, move, piece }) {
  const who = actorName(mode, piece.side, humanSide);
  const route = move.path.map(squareName).join(' to ');
  const king = piece.king ? ' a king' : '';
  const other = piece.side === 'acorn' ? 'leaf' : 'acorn';
  let text = move.captures.length
    ? `${who} jumped${king} from ${route}, capturing ${count(move.captures.length, other)}.`
    : `${who} moved${king} from ${route}.`;
  if (move.crowned) text += ` The ${ONE[piece.side]} on ${squareName(move.to)} is now a king.`;
  return text;
}

// "Your turn." / "The Spirit's turn." / "Leaves' turn. Leaves must capture."
export function turnText({ mode, turn, humanSide, mustCapture }) {
  const who = actorName(mode, turn, humanSide);
  const whose = who === 'You' ? 'Your' : who === 'The Spirit' ? "The Spirit's" : `${who}'`;
  const must = mustCapture ? ` ${who} must capture.` : '';
  return `${whose} turn.${must}`;
}

// The turn line above the board.
export function turnLabel({ mode, turn, humanSide }) {
  if (mode === 'single') return turn === humanSide ? 'Your Turn' : "Spirit's Turn";
  return `${SIDE_NAMES[turn]}' Turn`;
}

// The guidance line under the board, for the player whose turn it is.
// stage: 'choose-piece' | 'choose-square' | 'keep-jumping'
export function guidance({ stage, mustCapture }) {
  if (stage === 'keep-jumping') return 'Keep jumping: choose the next ring.';
  if (stage === 'choose-square') return mustCapture ? 'Choose a ring to jump to.' : 'Choose a dot to move to.';
  return mustCapture ? 'You must capture: choose a ringed piece.' : 'Choose a piece to move.';
}

// What to say when a pick does nothing (see turn.js choose()).
export const FEEDBACK = {
  'must-capture': 'You must capture: choose a ringed piece instead.',
  blocked: 'That piece has no move right now.',
  'must-continue': 'Keep jumping with the same piece: choose a ring.',
  'not-a-destination': "It can't go there. Choose a marked square or another piece.",
};

const RESULT_TITLES = {
  win: 'Victory!',
  loss: 'Wisdom Gained',
  draw: 'Balance Achieved',
  acorn: 'Acorns Win!',
  leaf: 'Leaves Win!',
};

// outcome: 'win' | 'loss' | 'draw' against the Spirit (from the player's
// side), 'acorn' | 'leaf' | 'draw' with two players.
export function outcomeOf({ mode, result, humanSide }) {
  if (result.winner === null) return 'draw';
  if (mode === 'single') return result.winner === humanSide ? 'win' : 'loss';
  return result.winner;
}

// { title, message } for the result dialog; the message says how it ended.
export function resultText({ mode, result, humanSide }) {
  const outcome = outcomeOf({ mode, result, humanSide });
  const title = RESULT_TITLES[outcome];
  if (result.winner === null) {
    return { outcome, title, message: 'A draw: 40 moves each with no capture or ordinary move.' };
  }
  const loser = result.winner === 'acorn' ? 'leaf' : 'acorn';
  const winnerName = actorName(mode, result.winner, humanSide);
  const loserName = actorName(mode, loser, humanSide);
  const message = result.reason === 'no-pieces'
    ? `${winnerName} captured every ${ONE[loser]}.`
    : `${loserName} ${loserName === 'You' || loserName.endsWith('s') ? 'have' : 'has'} no move left.`;
  return { outcome, title, message };
}
