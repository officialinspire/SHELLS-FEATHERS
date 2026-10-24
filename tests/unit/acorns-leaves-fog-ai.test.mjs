// The Spirit in Fog of War: it decides from its own view only (fog.js
// observation()), offers only steps that look possible, keeps to its bounds,
// plays sensibly with what it can see, and gets stronger with its level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, positionFromRows, legalMoves, applyMove, analyze, squareAt, rowOf,
} from '../../src/games/acorns-leaves/engine.js';
import { FOG, observe, observation, startFogTurn, chooseFog } from '../../src/games/acorns-leaves/fog.js';
import { chooseFogStep, planFogStep, imagineBoard, FOG_LEVELS } from '../../src/games/acorns-leaves/fog-ai.js';
import { DIFFICULTIES } from '../../src/games/acorns-leaves/ai.js';

const sq = (row, col) => squareAt(row, col);
const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const steady = { now: () => 0 };
const fast = { ...steady, maxNodes: 1500 };

function samplePositions(count, seed) {
  const rng = seeded(seed);
  const states = [];
  while (states.length < count) {
    let state = createInitialState();
    const plies = Math.floor(rng() * 70);
    for (let i = 0; i < plies && !analyze(state).result; i++) {
      const moves = legalMoves(state);
      state = applyMove(state, moves[Math.floor(rng() * moves.length)]);
    }
    if (!analyze(state).result) states.push(state);
  }
  return states;
}

// Plays one Fog move for the side to move with `decide(view) -> step`,
// through the same tries and blocks a player gets. Returns the move.
function fogMove(state, decide) {
  let turn = startFogTurn(state);
  for (let tries = 0; tries < 100; tries++) {
    const step = decide(observation(turn));
    if (!turn.path.length) turn = chooseFog(turn, step.from).turn;
    const result = chooseFog(turn, step.to);
    if (result.move) return result.move;
    turn = result.turn;
  }
  throw new Error('the move never ended');
}

test('imagined boards fit the view: seen squares unchanged, unseen pieces only in fog, the right number of them', () => {
  for (const state of samplePositions(60, 3)) {
    const seen = observation(startFogTurn(state));
    const other = state.turn === 'acorn' ? 'leaf' : 'acorn';
    const board = imagineBoard(seen, seeded(9));
    board.forEach((piece, square) => {
      if (seen.board[square] !== FOG) assert.deepEqual(piece, seen.board[square], 'what is seen is kept');
      else if (piece) assert.equal(piece.side, other, 'only opponent pieces are imagined');
      if (piece && !piece.king && piece.side === other) assert.notEqual(rowOf(square), other === 'acorn' ? 0 : 7);
    });
    assert.equal(board.filter((p) => p?.side === other).length, seen.opponentCount);
  }
});

test('every level only chooses a step it was offered, from either side, on random positions', () => {
  let checked = 0;
  for (const state of samplePositions(80, 5)) {
    const seen = observation(startFogTurn(state));
    for (const difficulty of DIFFICULTIES) {
      const step = chooseFogStep(seen, { difficulty, rng: seeded(checked + 1), ...fast });
      assert.ok(seen.steps.some((s) => s.from === step.from && s.to === step.to), `${difficulty}: ${JSON.stringify(step)}`);
      checked++;
    }
  }
  assert.equal(checked, 240);
});

test('not omniscient: two real boards that look the same to the Spirit get the same step', () => {
  // Move one of the opponent's hidden pieces to another fogged square: the
  // Spirit's view is unchanged, so its choice must be too.
  const rng = seeded(21);
  let pairs = 0;
  for (const state of samplePositions(150, 9)) {
    const seen = observe(state.board, state.turn);
    const fogSquares = seen.flatMap((cell, s) => (cell === FOG ? [s] : []));
    const hidden = fogSquares.filter((s) => state.board[s]);
    const empty = fogSquares.filter((s) => !state.board[s]);
    if (!hidden.length || !empty.length) continue;
    const from = hidden[Math.floor(rng() * hidden.length)];
    const to = empty[Math.floor(rng() * empty.length)];
    const board = [...state.board];
    [board[to], board[from]] = [board[from], null];
    if (!board[to].king && rowOf(to) === (board[to].side === 'acorn' ? 0 : 7)) continue;
    const twin = { ...state, board };
    const a = observation(startFogTurn(state));
    const b = observation(startFogTurn(twin));
    assert.deepEqual(a, b, 'the Spirit is handed the same view');
    for (const difficulty of DIFFICULTIES) {
      assert.deepEqual(
        planFogStep(a, { difficulty, rng: seeded(pairs + 7), ...fast }),
        planFogStep(b, { difficulty, rng: seeded(pairs + 7), ...fast }),
      );
    }
    pairs++;
  }
  assert.ok(pairs > 60, `${pairs} pairs`);
});

test('a single offered step is taken without searching; with none there is nothing to choose', () => {
  const state = positionFromRows(['.......l', '........', '........', '........', '.l......', '..a.....', '........', '........']);
  const seen = observation(startFogTurn(state));
  assert.deepEqual(seen.steps, [{ from: sq(5, 2), to: sq(3, 0) }]);
  assert.deepEqual(planFogStep(seen, { difficulty: 'hard' }), { step: seen.steps[0], score: 0, worlds: 0, nodes: 0, stopped: false });
  assert.equal(chooseFogStep({ ...seen, steps: [] }), null);
});

test('the search keeps to its position and time limits and still answers', () => {
  const seen = observation(startFogTurn(createInitialState()));
  for (const maxNodes of [1, 100, 2000]) {
    const plan = planFogStep(seen, { difficulty: 'hard', maxNodes, ...steady });
    assert.ok(plan.nodes <= maxNodes, `${plan.nodes} for ${maxNodes}`);
    assert.ok(seen.steps.includes(plan.step));
  }
  let calls = 0;
  const timed = planFogStep(seen, { difficulty: 'hard', maxNodes: Infinity, timeLimitMs: 5, now: () => calls++ });
  assert.equal(timed.stopped, true);
  assert.ok(seen.steps.includes(timed.step));
  // Real time: never far beyond the 40 ms limit.
  let slowest = 0;
  for (const state of samplePositions(20, 31)) {
    const started = performance.now();
    planFogStep(observation(startFogTurn(state)), { difficulty: 'hard' });
    slowest = Math.max(slowest, performance.now() - started);
  }
  assert.ok(slowest < 150, `slowest ${Math.round(slowest)} ms`);
});

test('Balanced and Wise do not leave a piece for a visible enemy to take', () => {
  // The leaf on a5 can jump the acorn on b4 if c3 stays empty.
  const state = positionFromRows(['.......l', '........', '........', 'l.......', '.a......', '........', '.a.a....', '........']);
  const seen = observation(startFogTurn(state));
  assert.deepEqual(seen.board[sq(3, 0)], { side: 'leaf', king: false }, 'the threat is in view');
  const bad = [`${sq(6, 1)}>${sq(5, 0)}`, `${sq(6, 3)}>${sq(5, 4)}`];
  for (const difficulty of ['medium', 'hard']) {
    for (let seed = 1; seed <= 6; seed++) {
      const step = chooseFogStep(seen, { difficulty, rng: seeded(seed), ...steady, maxNodes: 4000 });
      assert.ok(!bad.includes(`${step.from}>${step.to}`), `${difficulty} seed ${seed} left b4 to be taken`);
    }
  }
});

test('in a chain the Spirit chooses among the next landings it can see', () => {
  // The leaf on c7 jumps d6 to e5; from e5 two further jumps look possible.
  const state = positionFromRows(['........', '..l.....', '...a....', '........', '...a.a..', '........', '........', '......a.'], { turn: 'leaf' });
  let turn = startFogTurn(state);
  turn = chooseFog(turn, sq(1, 2)).turn;
  turn = chooseFog(turn, sq(3, 4)).turn;
  const seen = observation(turn);
  assert.deepEqual(seen.path, [sq(1, 2), sq(3, 4)]);
  assert.equal(seen.steps.length, 2);
  for (const difficulty of DIFFICULTIES) {
    const step = chooseFogStep(seen, { difficulty, rng: seeded(3), ...fast });
    assert.equal(step.from, sq(3, 4));
    assert.ok(seen.steps.some((s) => s.to === step.to));
  }
});

test('whole Fog games: every move legal, and Wise beats Gentle', () => {
  const play = (acornLevel, leafLevel, seed) => {
    const rng = seeded(seed);
    let state = createInitialState();
    for (let ply = 0; ; ply++) {
      const { result } = analyze(state);
      if (result) return result.winner;
      assert.ok(ply < 2000);
      const difficulty = state.turn === 'acorn' ? acornLevel : leafLevel;
      const move = fogMove(state, (seen) => chooseFogStep(seen, { difficulty, rng, ...steady, maxNodes: 1200 }));
      state = applyMove(state, move);
    }
  };
  let wins = 0;
  for (let g = 0; g < 4; g++) {
    const wiseIsAcorn = g % 2 === 0;
    const winner = wiseIsAcorn ? play('hard', 'easy', g + 1) : play('easy', 'hard', g + 1);
    if (winner === (wiseIsAcorn ? 'acorn' : 'leaf')) wins++;
  }
  assert.ok(wins >= 3, `Wise won ${wins} of 4`);
  assert.equal(Object.keys(FOG_LEVELS).join(), DIFFICULTIES.join());
});
