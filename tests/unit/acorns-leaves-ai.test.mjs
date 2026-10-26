// The Acorns & Leaves Spirit: legal moves only, sensible play at each level,
// and a search that always stops within its bounds. Positions are drawn top
// row first (a/A acorn, l/L leaf, '.' empty); Acorns move up the board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, positionFromRows, legalMoves, applyMove, analyze, squareAt, countPieces,
} from '../../src/games/acorns-leaves/engine.js';
import { chooseMove, planMove, evaluate, DIFFICULTIES, LIMITS } from '../../src/games/acorns-leaves/ai.js';

const sq = (row, col) => squareAt(row, col);
const path = (...pairs) => pairs.map(([r, c]) => sq(r, c));
const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
// Node-bounded only, so results don't depend on the machine's speed.
const steady = { now: () => 0 };
// The same move as one of legalMoves(state) (move lists are rebuilt per call).
const isLegal = (state, move) => legalMoves(state).some((m) => String(m.path) === String(move?.path)
  && String(m.captures) === String(move.captures) && m.crowned === move.crowned);

// Positions met in seeded random games: openings, middlegames, endgames.
function samplePositions(count, seed) {
  const rng = seeded(seed);
  const positions = [];
  while (positions.length < count) {
    let state = createInitialState();
    const plies = Math.floor(rng() * 90);
    for (let i = 0; i < plies; i++) {
      const moves = legalMoves(state);
      if (!moves.length) break;
      state = applyMove(state, moves[Math.floor(rng() * moves.length)]);
    }
    if (legalMoves(state).length) positions.push(state);
  }
  return positions;
}

test('every level only ever chooses one of the legal moves', () => {
  let checked = 0;
  for (const state of samplePositions(120, 7)) {
    for (const difficulty of DIFFICULTIES) {
      const move = chooseMove(state, { difficulty, rng: seeded(checked + 1), maxNodes: 1500, ...steady });
      assert.ok(isLegal(state, move), `${difficulty} chose a move outside legalMoves`);
      assert.doesNotThrow(() => applyMove(state, move.path));
      checked++;
    }
  }
  assert.equal(checked, 360);
});

test('with no legal move there is nothing to choose; a forced move is played without searching', () => {
  const over = positionFromRows(['........', '........', '........', '..l.....', '........', '........', '........', '........']);
  assert.equal(chooseMove(over, { difficulty: 'hard' }), null, 'Acorns have no pieces');
  // The leaf on (4,1) is boxed in: both squares ahead are taken and neither jump lands.
  const blocked = positionFromRows(['........', '........', '........', '..a.....', '.l......', 'a.a.....', '...a....', '........'], { turn: 'leaf' });
  assert.deepEqual(analyze(blocked).result, { winner: 'acorn', reason: 'no-moves' });
  assert.equal(chooseMove(blocked, { difficulty: 'hard' }), null);

  // A single forced capture: no search needed.
  const forced = positionFromRows(['.......l', '........', '........', '........', '.l......', '..a.....', '........', '........']);
  const plan = planMove(forced, { difficulty: 'hard' });
  assert.deepEqual(plan.move.path, path([5, 2], [3, 0]));
  assert.equal(plan.nodes, 0);
});

test('Balanced and Wise take the bigger capture when the choice is free', () => {
  // The acorn on (5,4) may jump one leaf (to the right) or two (to the left).
  const choice = positionFromRows([
    '........',
    '........',
    '...l....',
    '........',
    '...l.l..',
    '....a...',
    '........',
    '........',
  ]);
  assert.deepEqual(legalMoves(choice).map((m) => m.captures.length).sort(), [1, 2]);
  for (const difficulty of ['medium', 'hard']) {
    for (let seed = 1; seed <= 5; seed++) {
      const move = chooseMove(choice, { difficulty, rng: seeded(seed), ...steady });
      assert.deepEqual(move.path, path([5, 4], [3, 2], [1, 4]), `${difficulty}, seed ${seed}`);
    }
  }
  // Every level captures, as the rules require.
  for (const difficulty of DIFFICULTIES) assert.ok(chooseMove(choice, { difficulty, ...steady }).captures.length > 0);
});

test('Balanced and Wise never leave a piece to be jumped for nothing', () => {
  // Moving (5,2) to (4,1) or (5,4) to (4,3) lets the leaf on (3,2) jump it.
  const state = positionFromRows([
    '.l......',
    '........',
    '........',
    '..l.....',
    '........',
    '..a.a...',
    '........',
    '........',
  ]);
  const hanging = [path([5, 2], [4, 1]), path([5, 4], [4, 3])].map(String);
  for (const difficulty of ['medium', 'hard']) {
    for (let seed = 1; seed <= 8; seed++) {
      const move = chooseMove(state, { difficulty, rng: seeded(seed), ...steady });
      assert.ok(!hanging.includes(String(move.path)), `${difficulty} hung a piece: ${move.path}`);
    }
  }
});

test('Balanced and Wise find "give one, take two"; Gentle does not look that far', () => {
  // Acorn (4,3) to (3,4) offers a piece: the leaf on (2,5) must take it,
  // landing on (4,3), and the acorn on (5,2) then jumps twice.
  const state = positionFromRows([
    '.......l',
    '........',
    '...l.l..',
    '........',
    '...a.a..',
    '..a.....',
    '.a......',
    '........',
  ]);
  for (const difficulty of ['medium', 'hard']) {
    const move = chooseMove(state, { difficulty, rng: seeded(1), ...steady });
    assert.deepEqual(move.path, path([4, 3], [3, 4]), difficulty);
  }
  const offered = applyMove(state, path([4, 3], [3, 4]));
  assert.deepEqual(legalMoves(offered).map((m) => m.path), [path([2, 5], [4, 3])], 'the leaf must take');
  const taken = applyMove(offered, path([2, 5], [4, 3]));
  const reply = chooseMove(taken, { difficulty: 'hard', ...steady });
  assert.deepEqual(reply.path, path([5, 2], [3, 4], [1, 2]));
  const after = applyMove(taken, reply);
  assert.deepEqual([countPieces(after.board, 'acorn'), countPieces(after.board, 'leaf')], [3, 1]);

  // Gentle looks one move ahead only, so it is just as happy with other moves.
  const gentle = new Set();
  for (let seed = 1; seed <= 20; seed++) gentle.add(String(chooseMove(state, { difficulty: 'easy', rng: seeded(seed), ...steady }).path));
  assert.ok(gentle.size >= 3, `Gentle varied its move (${gentle.size} different)`);
});

test('the search stops at its position limit and still returns a legal move', () => {
  for (const state of samplePositions(20, 11)) {
    for (const maxNodes of [1, 50, 400]) {
      const plan = planMove(state, { difficulty: 'hard', maxNodes, ...steady });
      assert.ok(isLegal(state, plan.move));
      assert.ok(plan.nodes <= maxNodes, `${plan.nodes} positions for a limit of ${maxNodes}`);
      // Either the limit cut the search short, or it ended by itself (a forced
      // result found) after finishing at least one full search.
      if (plan.nodes) assert.ok(plan.stopped || plan.depth >= 1);
      if (maxNodes === 1 && plan.nodes) assert.deepEqual([plan.stopped, plan.depth], [true, 0]);
    }
  }
});

test('the search stops at its time limit, read from the clock it is given', () => {
  const state = createInitialState();
  let calls = 0;
  const clock = () => calls++; // 1 ms per reading
  const plan = planMove(state, { difficulty: 'hard', timeLimitMs: 5, maxNodes: Infinity, now: clock });
  assert.equal(plan.stopped, true);
  assert.ok(plan.nodes <= 64 * 6, `stopped after ${plan.nodes} positions`);
  assert.ok(isLegal(state, plan.move));

  // A clock that has already run out: the move is still legal.
  let late = 0;
  const expired = planMove(state, { difficulty: 'hard', timeLimitMs: 0, maxNodes: Infinity, now: () => (late += 1000) });
  assert.ok(isLegal(state, expired.move));
});

test('in real time, Wise answers within its 40 ms limit (plus slack for a busy machine) on busy positions', () => {
  assert.equal(LIMITS.timeLimitMs, 40);
  let slowest = 0;
  for (const state of samplePositions(25, 21)) {
    const started = performance.now();
    const plan = planMove(state, { difficulty: 'hard' });
    slowest = Math.max(slowest, performance.now() - started);
    assert.ok(isLegal(state, plan.move));
  }
  // Unbounded, Wise would search 12 plies deep and take seconds per move.
  assert.ok(slowest < 150, `slowest move took ${Math.round(slowest)} ms`);
});

test('the same random source gives the same move; the evaluation is symmetric', () => {
  for (const state of samplePositions(10, 31)) {
    for (const difficulty of DIFFICULTIES) {
      const a = chooseMove(state, { difficulty, rng: seeded(9), maxNodes: 800, ...steady });
      const b = chooseMove(state, { difficulty, rng: seeded(9), maxNodes: 800, ...steady });
      assert.deepEqual(a, b);
    }
  }
  const start = createInitialState();
  assert.equal(evaluate(start), 0);
  assert.equal(evaluate({ board: start.board, turn: 'leaf' }), 0);
  // A man ahead is good for one side and equally bad for the other.
  const ahead = positionFromRows(['.l......', '........', '........', '........', '........', '........', '........', 'a.a.....']);
  assert.ok(evaluate(ahead) > 90);
  assert.equal(evaluate({ board: ahead.board, turn: 'leaf' }), -evaluate(ahead));
});

test('stronger levels beat weaker ones over whole games', () => {
  const play = (acornLevel, leafLevel, seed) => {
    const rng = seeded(seed);
    let state = createInitialState();
    for (;;) {
      const { result } = analyze(state);
      if (result) return result.winner;
      const difficulty = state.turn === 'acorn' ? acornLevel : leafLevel;
      state = applyMove(state, chooseMove(state, { difficulty, rng, maxNodes: 1500, ...steady }));
    }
  };
  const record = (strong, weak, games) => {
    let wins = 0;
    for (let g = 0; g < games; g++) {
      const strongIsAcorn = g % 2 === 0;
      const winner = strongIsAcorn ? play(strong, weak, g + 1) : play(weak, strong, g + 1);
      if (winner === (strongIsAcorn ? 'acorn' : 'leaf')) wins++;
    }
    return wins;
  };
  assert.equal(record('hard', 'easy', 4), 4, 'Wise beats Gentle');
  assert.equal(record('medium', 'easy', 4), 4, 'Balanced beats Gentle');
  assert.ok(record('hard', 'medium', 4) >= 3, 'Wise beats Balanced');
});
