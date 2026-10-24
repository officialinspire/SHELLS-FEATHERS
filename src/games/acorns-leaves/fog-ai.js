// The Spirit in Fog of War (docs/fog-rules.md §6). Pure.
//
// It is handed only its own view, fog.js observation(): its pieces, the
// opponent pieces next to them, fogged squares, pieces its blocked tries have
// found, the squares chosen so far this move, the steps that look possible,
// and how many opponent pieces are left (public: 12 minus what it has
// captured). It never sees the real board, so two real boards that look the
// same to it always get the same choice.
//
// It imagines boards that fit the view, placing the unseen opponent pieces on
// fogged squares, searches each with the Classic search (ai.js), and picks the
// step with the best average value. A step that an imagined board blocks is
// worth that board's best move: in play the Spirit would be blocked, learn
// the blocker, and choose again. Each decision shares one bounded search
// (12,000 positions or 40 ms), so a slow device imagines fewer boards.
import { FOG } from './fog.js';
import { legalMoves, playLegalMove, opponent, rowOf, crownRowOf } from './engine.js';
import { createSearch, shuffled, LIMITS } from './ai.js';

// worlds: boards imagined per decision; depth: plies searched on each;
// quiescence: extra plies while captures are forced; margin as in ai.js.
export const FOG_LEVELS = {
  easy: { worlds: 1, depth: 1, quiescence: 0, margin: 40 },
  medium: { worlds: 4, depth: 2, quiescence: 4, margin: 12 },
  hard: { worlds: 8, depth: 3, quiescence: 6, margin: 0 },
};

const defaultNow = () => globalThis.performance.now();
const stepKey = ({ from, to }) => `${from}>${to}`;
const startsWith = (path, prefix) => prefix.every((square, i) => path[i] === square);

// One board that fits the view `seen`. The moving piece goes back to where its
// move started; the opponent's unseen pieces go on fogged squares (never on a
// square this move has passed through), more often on rows nearer their own
// side. A piece placed on its crowning row is a king; otherwise it is assumed
// to be an ordinary piece.
export function imagineBoard(seen, rng) {
  const { board: view, side, path, opponentCount } = seen;
  const other = opponent(side);
  const board = view.map((cell) => (cell === FOG ? null : cell));
  if (path.length >= 2) {
    const piece = board[path[path.length - 1]];
    board[path[path.length - 1]] = null;
    board[path[0]] = piece;
  }
  const home = crownRowOf(side); // the opponent's back row
  const pool = view.flatMap((cell, square) => (cell === FOG && !path.includes(square)
    ? [{ square, weight: 1 + (7 - Math.abs(rowOf(square) - home)) / 2 }]
    : []));
  let missing = opponentCount - board.filter((p) => p?.side === other).length;
  while (missing > 0 && pool.length) {
    let roll = rng() * pool.reduce((sum, p) => sum + p.weight, 0);
    let index = 0;
    while (index < pool.length - 1 && roll >= pool[index].weight) roll -= pool[index++].weight;
    const [{ square }] = pool.splice(index, 1);
    board[square] = Object.freeze({ side: other, king: rowOf(square) === crownRowOf(other) });
    missing--;
  }
  return board;
}

// The full result: { step, score, worlds, nodes, stopped }. `step` is one of
// seen.steps ({ from, to }), or null when none is offered; `worlds` is how
// many imagined boards were searched to the end.
export function planFogStep(seen, {
  difficulty = 'medium',
  rng = Math.random,
  maxNodes = LIMITS.maxNodes,
  timeLimitMs = LIMITS.timeLimitMs,
  now = defaultNow,
} = {}) {
  const { steps, path, side } = seen;
  if (steps.length <= 1) return { step: steps[0] ?? null, score: 0, worlds: 0, nodes: 0, stopped: false };
  const level = FOG_LEVELS[difficulty] ?? FOG_LEVELS.medium;
  const search = createSearch({ maxNodes, timeLimitMs, now, quiescence: level.quiescence });
  const totals = new Map(steps.map((s) => [stepKey(s), 0]));
  let worlds = 0;

  for (let w = 0; w < level.worlds; w++) {
    const state = { board: imagineBoard(seen, rng), turn: side, quietPlies: 0 };
    const moves = legalMoves(state).filter((m) => startsWith(m.path, path));
    if (!moves.length) continue;
    const values = new Map();
    let best = -Infinity;
    for (const m of moves) {
      const value = -search.negamax(playLegalMove(state, m), level.depth - 1);
      if (search.stopped) break;
      best = Math.max(best, value);
      const next = path.length ? { from: path[path.length - 1], to: m.path[path.length] } : { from: m.path[0], to: m.path[1] };
      if (next.to !== undefined) values.set(stepKey(next), Math.max(values.get(stepKey(next)) ?? -Infinity, value));
    }
    if (search.stopped) break;
    for (const s of steps) totals.set(stepKey(s), totals.get(stepKey(s)) + (values.get(stepKey(s)) ?? best));
    worlds++;
  }

  if (!worlds) return { step: steps[0], score: 0, worlds, nodes: search.nodes, stopped: search.stopped };
  // Shuffle, then sort: ties are broken by `rng`.
  const scored = shuffled(steps, rng)
    .map((step) => ({ step, score: totals.get(stepKey(step)) / worlds }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0].score;
  const choices = level.margin > 0 ? scored.filter((r) => r.score >= top - level.margin) : [scored[0]];
  const pick = choices[Math.floor(rng() * choices.length)] ?? scored[0];
  return { step: pick.step, score: pick.score, worlds, nodes: search.nodes, stopped: search.stopped };
}

// The Spirit's next step in Fog, from its own view only.
export const chooseFogStep = (seen, options) => planFogStep(seen, options).step;
