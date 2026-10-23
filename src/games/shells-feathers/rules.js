// Shells & Feathers board rules. Pure functions over a 9-cell board whose
// cells hold 'shell', 'feather' or null (indexes run left to right, top to
// bottom).

export const SYMBOLS = ['shell', 'feather'];

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export const opponentOf = (symbol) => (symbol === 'shell' ? 'feather' : 'shell');

export function winningLine(board, symbol) {
  return LINES.find((line) => line.every((i) => board[i] === symbol)) ?? null;
}

export const isFull = (board) => board.every((cell) => cell !== null);

export const emptyCells = (board) => board.flatMap((cell, i) => (cell === null ? [i] : []));
