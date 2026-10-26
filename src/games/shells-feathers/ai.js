// The Spirit (single-player opponent). Same strategy as v1:
//   easy   "Gentle"   - random empty cell
//   medium "Balanced" - best move BEST_SHARE (70%) of the time, otherwise random
//   hard   "Wise"     - win, else block, else minimax (never loses)
// Randomness comes from `rng` so tests can make it deterministic.
import { winningLine, isFull, emptyCells } from './rules.js';

export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const DIFFICULTY_NAMES = { easy: 'Gentle', medium: 'Balanced', hard: 'Wise' };
export const BEST_SHARE = 0.7;

// The levels in words (setup screen, match panel), from the same numbers.
export const LEVEL_WORDS = {
  easy: 'Gentle picks any open square at random.',
  medium: `Balanced plays its best move about ${Math.round(BEST_SHARE * 10)} times in 10, and otherwise a random open square.`,
  hard: 'Wise takes a win, blocks yours, and otherwise searches ahead for the strongest square. It never loses.',
};

export function chooseMove(board, { ai, human, difficulty, rng = Math.random }) {
  switch (difficulty) {
    case 'easy': return randomMove(board, rng);
    case 'medium': return rng() < BEST_SHARE ? bestMove(board, ai, human, rng) : randomMove(board, rng);
    case 'hard': default: return bestMove(board, ai, human, rng);
  }
}

export function randomMove(board, rng = Math.random) {
  const open = emptyCells(board);
  return open.length ? open[Math.floor(rng() * open.length)] : -1;
}

export function bestMove(board, ai, human, rng = Math.random) {
  const b = board.slice();
  for (const i of emptyCells(b)) {
    b[i] = ai;
    const wins = winningLine(b, ai);
    b[i] = null;
    if (wins) return i;
  }
  for (const i of emptyCells(b)) {
    b[i] = human;
    const loses = winningLine(b, human);
    b[i] = null;
    if (loses) return i;
  }
  let best = -Infinity;
  let move = -1;
  for (const i of emptyCells(b)) {
    b[i] = ai;
    const score = minimax(b, 0, false, -Infinity, Infinity, ai, human);
    b[i] = null;
    if (score > best) { best = score; move = i; }
  }
  return move !== -1 ? move : randomMove(board, rng);
}

function minimax(board, depth, isMax, alpha, beta, ai, human) {
  if (winningLine(board, ai)) return 10 - depth;
  if (winningLine(board, human)) return depth - 10;
  if (isFull(board)) return 0;
  if (depth > 6) return 0;

  const symbol = isMax ? ai : human;
  let best = isMax ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (board[i] !== null) continue;
    board[i] = symbol;
    const score = minimax(board, depth + 1, !isMax, alpha, beta, ai, human);
    board[i] = null;
    if (isMax) { best = Math.max(best, score); alpha = Math.max(alpha, score); }
    else { best = Math.min(best, score); beta = Math.min(beta, score); }
    if (beta <= alpha) break;
  }
  return best;
}
