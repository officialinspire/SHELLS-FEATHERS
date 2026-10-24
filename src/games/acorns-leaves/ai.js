// The Spirit for Acorns & Leaves: picks a move for the side to move. Pure: it
// reads a state and returns one of legalMoves(state), so it can only ever
// choose a legal move, and it changes nothing.
//
// Search: iterative deepening negamax with alpha-beta pruning. Captures are
// compulsory, so a position where the side to move must capture is searched
// further (up to `quiescence` extra plies) instead of being scored mid-fight.
//
// Bounded: every search stops after `maxNodes` positions or `timeLimitMs`
// milliseconds, whichever comes first, and plays the best move of the deepest
// search it finished. 40 ms leaves room for drawing the move within the
// browser's 50 ms long-task mark, so the page never stalls; a slow phone just
// searches less deeply.
//
// Levels:
//   easy   "Gentle"   - looks one move ahead and picks any move close to its best
//   medium "Balanced" - three moves ahead, with a little variety
//   hard   "Wise"     - as deep as the bounds allow, always its best move
// Randomness comes from `rng` so tests can make it deterministic.
import { analyze, playLegalMove, rowOf, colOf } from './engine.js';

export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const DIFFICULTY_NAMES = { easy: 'Gentle', medium: 'Balanced', hard: 'Wise' };

// depth: full plies searched; quiescence: extra plies while captures are
// forced; margin: moves scoring within this much of the best may be chosen.
export const LEVELS = {
  easy: { depth: 1, quiescence: 0, margin: 40 },
  medium: { depth: 3, quiescence: 4, margin: 12 },
  hard: { depth: 12, quiescence: 8, margin: 0 },
};
export const LIMITS = { maxNodes: 12_000, timeLimitMs: 40 };

const WIN = 100_000;
const MAN = 100;
const KING = 150;
const defaultNow = () => globalThis.performance.now();

// Score of `state` for the side to move: material, men's progress toward the
// crown row, the back row kept guarded, the centre held, and for the side that
// is ahead a push to trade down and to bring its kings toward the remaining
// enemy pieces. Symmetric: the other side to move sees the opposite score.
export function evaluate({ board, turn }) {
  let score = 0;
  let pieces = 0;
  const material = { [turn]: 0, other: 0 };
  const kings = { [turn]: [], other: [] };
  const squares = { [turn]: [], other: [] };
  for (let square = 0; square < board.length; square++) {
    const p = board[square];
    if (p === null) continue;
    pieces++;
    const row = rowOf(square);
    const col = colOf(square);
    let value;
    if (p.king) {
      value = KING;
    } else {
      const advanced = p.side === 'acorn' ? 7 - row : row;
      value = MAN + advanced * 3 + (advanced === 0 ? 8 : 0);
    }
    if (row >= 2 && row <= 5 && col >= 2 && col <= 5) value += 4;
    const owner = p.side === turn ? turn : 'other';
    score += owner === turn ? value : -value;
    material[owner] += p.king ? KING : MAN;
    squares[owner].push(square);
    if (p.king) kings[owner].push(square);
  }
  const lead = material[turn] - material.other;
  score += Math.sign(lead) * Math.round((Math.abs(lead) * (24 - pieces)) / 48);
  if (lead !== 0) {
    const [leader, trailer, sign] = lead > 0 ? [turn, 'other', -1] : ['other', turn, 1];
    for (const king of kings[leader]) {
      let nearest = 7;
      for (const target of squares[trailer]) {
        nearest = Math.min(nearest, Math.max(Math.abs(rowOf(king) - rowOf(target)), Math.abs(colOf(king) - colOf(target))));
      }
      score += sign * nearest * 2;
    }
  }
  return score;
}

// Bigger captures and crowning first: better moves searched first prune more.
const urgency = (m) => m.captures.length * 4 + (m.crowned ? 2 : 0);
const byUrgency = (moves) => [...moves].sort((a, b) => urgency(b) - urgency(a));

export function shuffled(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// A bounded negamax search with alpha-beta pruning. Once `maxNodes` positions
// or `timeLimitMs` milliseconds have been used it stops for good: `stopped`
// turns true and every later value is meaningless. While captures are forced
// it searches up to `quiescence` plies past `depth`. The Fog Spirit
// (fog-ai.js) shares one search between the boards it imagines.
export function createSearch({
  maxNodes = LIMITS.maxNodes, timeLimitMs = LIMITS.timeLimitMs, now = defaultNow, quiescence = 0,
} = {}) {
  const started = now();
  let nodes = 0;
  let stopped = false;
  const outOfBudget = () => {
    if (!stopped && (nodes >= maxNodes || (nodes % 64 === 0 && now() - started >= timeLimitMs))) stopped = true;
    return stopped;
  };

  // Value of `position` for its side to move, searched `depth` plies deep.
  function negamax(position, depth, alpha = -Infinity, beta = Infinity, ply = 1) {
    nodes++;
    if (outOfBudget()) return 0;
    const { result, moves: replies } = analyze(position);
    if (result) {
      if (result.winner === null) return 0;
      return result.winner === position.turn ? WIN - ply : ply - WIN;
    }
    const mustCapture = replies[0].captures.length > 0;
    if (depth <= 0 && (!mustCapture || depth <= -quiescence)) return evaluate(position);
    let best = -Infinity;
    for (const reply of byUrgency(replies)) {
      const value = -negamax(playLegalMove(position, reply), depth - 1, -beta, -alpha, ply + 1);
      if (stopped) return 0;
      if (value > best) best = value;
      if (value > alpha) alpha = value;
      if (alpha >= beta) break;
    }
    return best;
  }

  return {
    negamax,
    get stopped() { return stopped; },
    get nodes() { return nodes; },
  };
}

// The full search result: { move, score, depth, nodes, stopped }. `depth` is
// the deepest search finished (0 when the move was forced or no search
// finished), and `stopped` says whether a bound cut the search short.
export function planMove(state, {
  difficulty = 'medium',
  rng = Math.random,
  maxNodes = LIMITS.maxNodes,
  timeLimitMs = LIMITS.timeLimitMs,
  now = defaultNow,
} = {}) {
  const level = LEVELS[difficulty] ?? LEVELS.medium;
  const { moves } = analyze(state);
  if (moves.length === 0) return { move: null, score: 0, depth: 0, nodes: 0, stopped: false };
  if (moves.length === 1) return { move: moves[0], score: 0, depth: 0, nodes: 0, stopped: false };

  const search = createSearch({ maxNodes, timeLimitMs, now, quiescence: level.quiescence });

  // Shuffle, then sort: equal moves come in a random order, so ties are broken
  // by `rng` and repeated games differ.
  let order = byUrgency(shuffled(moves, rng));
  let scored = null;
  let depth = 0;
  for (let d = 1; d <= level.depth; d++) {
    const results = [];
    let alpha = -Infinity;
    for (const move of order) {
      // With a margin every move needs its own exact score; otherwise only the
      // best does, and alpha-beta can cut the rest short.
      const floor = level.margin > 0 ? -Infinity : alpha;
      const value = -search.negamax(playLegalMove(state, move), d - 1, -Infinity, -floor, 1);
      if (search.stopped) break;
      results.push({ move, score: value });
      if (value > alpha) alpha = value;
    }
    if (search.stopped) break;
    scored = results.sort((a, b) => b.score - a.score); // stable: ties keep their order
    order = scored.map((r) => r.move);
    depth = d;
    if (Math.abs(scored[0].score) > WIN / 2) break; // a forced win or loss was found
  }

  if (!scored) return { move: order[0], score: 0, depth: 0, nodes: search.nodes, stopped: search.stopped };
  const best = scored[0].score;
  const choices = level.margin > 0 ? scored.filter((r) => r.score >= best - level.margin) : [scored[0]];
  const pick = choices[Math.floor(rng() * choices.length)] ?? scored[0];
  return { move: pick.move, score: pick.score, depth, nodes: search.nodes, stopped: search.stopped };
}

// The Spirit's move for the side to move, or null when it has none.
export const chooseMove = (state, options) => planMove(state, options).move;
