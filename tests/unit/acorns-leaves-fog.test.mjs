// Fog of War (docs/fog-rules.md): what each side sees (V1-V8), trying moves
// against that view (M1-M8), and properties over random games: every real
// capture looks possible, blocked tries happen only on hidden pieces, every
// move played is legal, and nothing a player is shown depends on what they
// can't see. Positions are drawn top row first (a/A acorn, l/L leaf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, positionFromRows, legalMoves, applyMove, analyze, squareAt, rowOf, colOf, isDarkSquare,
} from '../../src/games/acorns-leaves/engine.js';
import {
  FOG, isPiece, observe, visibleSquares, startFogTurn, chooseFog, cancelFog, view, apparentSteps, mayCapture,
  movablePieces, destinations, inChain, jumpedSoFar, observation, selectedSquare,
} from '../../src/games/acorns-leaves/fog.js';

const sq = (row, col) => squareAt(row, col);
const path = (...pairs) => pairs.map(([r, c]) => sq(r, c));
const position = (rows, options) => positionFromRows(rows, options);
const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const nextTo = (a, b) => Math.abs(rowOf(a) - rowOf(b)) === 1 && Math.abs(colOf(a) - colOf(b)) === 1;
const fogged = (seen) => seen.flatMap((cell, square) => (cell === FOG ? [square] : []));
const shown = (seen, side) => seen.flatMap((cell, square) => (isPiece(cell) && cell.side === side ? [square] : []));

// Picks squares in order; returns the outcomes and the last result.
function pick(turn, ...squares) {
  const outcomes = [];
  let last = { turn };
  for (const square of squares) {
    last = chooseFog(last.turn, square);
    outcomes.push(last.outcome);
  }
  return { ...last, outcomes };
}

// Random positions from seeded random games (both sides to move).
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

// ------------------------------------------------------------- visibility

test('V1-V5: each side sees its own pieces, opponent pieces next to them, and fog everywhere else', () => {
  // Leaves on b8 (far), d6 and f4 (king) next to the acorn on e5, c3 next to b2.
  const state = position([
    '.l......',
    '........',
    '...l....',
    '....a...',
    '.....L..',
    '..l.....',
    '.a......',
    '........',
  ]);
  const acorns = observe(state.board, 'acorn');
  assert.deepEqual(shown(acorns, 'acorn'), path([3, 4], [6, 1]), 'V2: own pieces');
  assert.deepEqual(shown(acorns, 'leaf'), path([2, 3], [4, 5], [5, 2]), 'V3: only the leaves next to an acorn');
  assert.deepEqual(acorns[sq(4, 5)], { side: 'leaf', king: true }, 'a king is seen as a king, behind the acorn too');
  assert.equal(acorns[sq(0, 1)], FOG, 'the far leaf is under fog');
  assert.equal(acorns[sq(2, 5)], null, 'V5: an empty square next to an acorn is known to be empty');
  assert.equal(fogged(acorns).length, 32 - 10, 'V4: every other dark square is fogged');
  assert.ok(acorns.every((cell, square) => isDarkSquare(square) || cell === null), 'V1: light squares are plain terrain');

  // Seeing is symmetric: a leaf next to an acorn sees it too; the far leaf sees nothing.
  const leaves = observe(state.board, 'leaf');
  assert.deepEqual(shown(leaves, 'acorn'), path([3, 4], [6, 1]));
  assert.deepEqual(shown(leaves, 'leaf'), path([0, 1], [2, 3], [4, 5], [5, 2]));
  assert.ok(fogged(leaves).every((square) => !isPiece(state.board[square]) || state.board[square].side === 'acorn'));
});

test('V4: at the start each side sees its own 12 pieces and none of the other side', () => {
  const state = createInitialState();
  for (const side of ['acorn', 'leaf']) {
    const seen = observe(state.board, side);
    assert.equal(shown(seen, side).length, 12);
    assert.equal(shown(seen, side === 'acorn' ? 'leaf' : 'acorn').length, 0);
    assert.equal(fogged(seen).length, 16, `${side}: the other half of the board is fogged`);
  }
});

test('on random positions, from both sides, an opponent piece is shown only next to one of the viewer\'s pieces', () => {
  for (const state of samplePositions(150, 3)) {
    for (const side of ['acorn', 'leaf']) {
      const seen = observe(state.board, side);
      const own = state.board.flatMap((p, s) => (p?.side === side ? [s] : []));
      seen.forEach((cell, square) => {
        const real = state.board[square];
        if (real?.side === side) assert.deepEqual(cell, real, 'own pieces always shown');
        else if (isPiece(cell)) assert.ok(own.some((o) => nextTo(o, square)), 'shown opponent piece is next to an own piece');
        else if (cell === FOG) assert.ok(!own.some((o) => nextTo(o, square)), 'fog only out of range');
        else if (isDarkSquare(square)) assert.equal(real, null, 'a square shown empty is empty');
      });
      assert.equal(visibleSquares(state.board, side).size, 32 - fogged(seen).length);
    }
  }
});

// ------------------------------------------------------------- moves

// The acorn on c3 can jump b4 to a5; whether a5 is free is hidden by fog.
const JUMP_INTO_FOG = (landing) => position([
  '.......l',
  '........',
  '........',
  landing,
  '.l......',
  '..a.....',
  '.....a..',
  '........',
]);

test('M2-M4: a capture that may be possible must be tried first, and trying it into an empty fogged square captures', () => {
  const turn = startFogTurn(JUMP_INTO_FOG('........'));
  assert.equal(view(turn)[sq(3, 0)], FOG, 'the landing square is fogged');
  assert.equal(mayCapture(turn), true);
  assert.deepEqual(movablePieces(turn), [sq(5, 2)], 'only the piece that may capture is offered');
  assert.equal(chooseFog(turn, sq(6, 5)).outcome, 'must-capture', 'no ordinary move while a capture may be possible');
  const { outcomes, move } = pick(turn, sq(5, 2), sq(3, 0));
  assert.deepEqual(outcomes, ['select', 'complete']);
  assert.deepEqual(move.captures, [sq(4, 1)]);
});

test('M5-M6: a jump blocked by a hidden piece reveals only that piece; with no capture left, ordinary moves open up', () => {
  const state = JUMP_INTO_FOG('l.......');
  const turn = startFogTurn(state);
  assert.equal(view(turn)[sq(3, 0)], FOG, 'the blocking leaf starts hidden');
  assert.deepEqual(legalMoves(state).map((m) => m.captures.length), [0, 0, 0], 'really, no capture is possible');
  assert.equal(mayCapture(turn), true, '... but from the acorns\' side it may be');

  const tried = pick(turn, sq(5, 2), sq(3, 0));
  assert.deepEqual(tried.outcomes, ['select', 'bumped']);
  assert.equal(tried.found, sq(3, 0));
  assert.equal(tried.move, undefined, 'nothing moved');
  const after = tried.turn;
  assert.deepEqual(after.state, state, 'the position is untouched');
  assert.deepEqual(view(after)[sq(3, 0)], { side: 'leaf', king: false }, 'the blocker is now shown');
  const before = view(turn);
  assert.deepEqual(view(after).map((c, s) => (s === sq(3, 0) ? null : c)), before.map((c, s) => (s === sq(3, 0) ? null : c)),
    'nothing else was revealed');
  assert.equal(mayCapture(after), false);
  assert.equal(selectedSquare(after), sq(5, 2), 'the piece stays picked up');
  assert.deepEqual(destinations(after), [sq(4, 3)], 'M6: now with its ordinary move');
  assert.deepEqual(movablePieces(after), [sq(5, 2), sq(6, 5)], 'M6: ordinary moves are offered');
  const { outcomes, move } = pick(after, sq(6, 5), sq(5, 6));
  assert.deepEqual(outcomes, ['select', 'complete']);
  assert.doesNotThrow(() => applyMove(state, move), 'the move played is legal on the real board');
});

test('M5: with two captures that may be possible, a blocked one leaves the other compulsory', () => {
  // c3 over b4 to a5 is blocked by a hidden leaf; g3 over f4 to e5 is open.
  const state = position(['.......l', '........', '........', 'l.......', '.l...l..', '..a...a.', '........', '........']);
  const turn = startFogTurn(state);
  assert.deepEqual(movablePieces(turn), path([5, 2], [5, 6]));
  const blocked = pick(turn, sq(5, 2), sq(3, 0));
  assert.equal(blocked.outcome, 'bumped');
  assert.equal(mayCapture(blocked.turn), true, 'the other capture still may be possible');
  assert.deepEqual(movablePieces(blocked.turn), [sq(5, 6)], 'no ordinary move yet');
  assert.equal(chooseFog(blocked.turn, sq(5, 2)).outcome, 'must-capture');
  const { outcome, move } = pick(blocked.turn, sq(5, 6), sq(3, 4));
  assert.equal(outcome, 'complete');
  assert.deepEqual(move.path, path([5, 6], [3, 4]));
});

test('M7: a chain must try every further jump that looks possible; a blocked one ends the move there', () => {
  // b2 jumps c3 to d4. From d4 the leaf on e5 comes into view (it was hidden),
  // and the landing f6 beyond it is fogged and holds a hidden leaf.
  const state = position(['.l......', '........', '.....l..', '....l...', '........', '..l.....', '.a......', '........']);
  assert.deepEqual(legalMoves(state).map((m) => m.path), [path([6, 1], [4, 3])], 'really the chain ends on d4');
  const turn = startFogTurn(state);
  assert.equal(view(turn)[sq(3, 4)], FOG, 'e5 is out of sight at first');
  const first = pick(turn, sq(6, 1), sq(4, 3));
  assert.deepEqual(first.outcomes, ['select', 'jump'], 'not ended yet: from d4 a jump over e5 looks possible');
  assert.deepEqual(view(first.turn)[sq(3, 4)], { side: 'leaf', king: false }, 'V6: the jumping piece sees from where it landed');
  assert.deepEqual(jumpedSoFar(first.turn), [sq(5, 2)]);
  assert.deepEqual(view(first.turn)[sq(5, 2)], { side: 'leaf', king: false }, 'the jumped piece stays in view');
  assert.deepEqual(destinations(first.turn), [sq(2, 5)]);
  assert.equal(chooseFog(first.turn, sq(7, 0)).outcome, 'must-continue');
  assert.equal(cancelFog(first.turn), first.turn, 'a jump made can\'t be taken back');

  const second = chooseFog(first.turn, sq(2, 5));
  assert.equal(second.outcome, 'bumped');
  assert.equal(second.found, sq(2, 5));
  assert.deepEqual(second.move.path, path([6, 1], [4, 3]), 'the move ends where the piece stands');
  assert.doesNotThrow(() => applyMove(state, second.move));
});

test('M7: a chain continues into an empty fogged square', () => {
  const state = position(['.l......', '........', '........', '....l...', '........', '..l.....', '.a......', '........']);
  const { outcomes, move } = pick(startFogTurn(state), sq(6, 1), sq(4, 3), sq(2, 5));
  assert.deepEqual(outcomes, ['select', 'jump', 'complete']);
  assert.deepEqual(move.captures, path([5, 2], [3, 4]));
});

test('M8: crowning ends the move, even with a jump the new king could make; a king can loop back through fog', () => {
  // b6 jumps c7 to d8 and is crowned. As a king it could jump e7 next, but crowning ends the move.
  const crown = position(['........', '..l.l...', '.a......', '........', '........', '........', '.l......', '........']);
  const crowned = pick(startFogTurn(crown), sq(2, 1), sq(0, 3));
  assert.deepEqual(crowned.outcomes, ['select', 'complete']);
  assert.equal(crowned.move.crowned, true);

  const loop = position(['.l......', '........', '........', '..l.l...', '........', '..l.l...', '...A....', '........']);
  const round = pick(startFogTurn(loop), sq(6, 3), sq(4, 1), sq(2, 3), sq(4, 5), sq(6, 3));
  assert.deepEqual(round.outcomes, ['select', 'jump', 'jump', 'jump', 'complete']);
  assert.equal(round.move.captures.length, 4);
});

test('ordinary pieces are not offered backward jumps, even when the piece behind is visible', () => {
  // The leaf on d6 sits behind the acorn on c5 (acorns move up), with e7 empty.
  const state = position(['.......l', '........', '...l....', '..a.....', '........', '........', '........', '........']);
  const turn = startFogTurn(state);
  assert.deepEqual(view(turn)[sq(2, 3)], { side: 'leaf', king: false });
  assert.equal(mayCapture(turn), true, 'c5 over d6 to e7 is forward for an acorn');
  const behind = position(['.......l', '........', '........', '..a.....', '...l....', '........', '........', '........']);
  const t2 = startFogTurn(behind);
  assert.deepEqual(view(t2)[sq(4, 3)], { side: 'leaf', king: false }, 'the leaf behind is seen');
  assert.equal(mayCapture(t2), false, 'but an ordinary acorn can\'t capture backward');
});

// ------------------------------------------------------------- properties

test('on random positions, from both sides: every real capture looks possible, and ordinary moves match the real ones', () => {
  const counts = { realCaptures: 0, onlyApparent: 0, ordinary: 0 };
  for (const state of samplePositions(300, 7)) {
    const turn = startFogTurn(state);
    const real = legalMoves(state);
    const offered = apparentSteps(turn);
    const key = (a, b) => `${a}>${b}`;
    const offeredKeys = new Set(offered.steps.map((s) => key(s.from, s.to)));
    if (real[0].captures.length) {
      counts.realCaptures++;
      assert.equal(offered.capture, true, 'a real capture is never missed');
      for (const m of real) assert.ok(offeredKeys.has(key(m.path[0], m.path[1])), 'every real capture looks possible');
    } else if (offered.capture) {
      // Every capture that looks possible is really blocked: they are tried
      // first (M3), and each try is blocked (M5) before ordinary moves open (M6).
      counts.onlyApparent++;
      for (const s of offered.steps) assert.ok(state.board[s.to] && state.board[s.to].side !== state.turn);
    } else {
      counts.ordinary++;
      assert.deepEqual([...offeredKeys].sort(), real.map((m) => key(m.path[0], m.path[1])).sort(), 'the ordinary moves are exactly the real ones');
    }
  }
  assert.ok(counts.realCaptures > 20 && counts.onlyApparent > 5 && counts.ordinary > 100, JSON.stringify(counts));
});

test('random games played only through the fog view: every move legal, blocks only on hidden pieces, never stuck', () => {
  const rng = seeded(11);
  const tally = { games: 0, moves: 0, bumps: 0, chainBumps: 0 };
  for (let game = 0; game < 120; game++) {
    let state = createInitialState();
    for (let ply = 0; !analyze(state).result; ply++) {
      assert.ok(ply < 3000);
      let turn = startFogTurn(state);
      let played = null;
      for (let tries = 0; !played; tries++) {
        assert.ok(tries < 200, 'a turn always ends');
        const before = view(turn);
        const options = turn.path.length ? destinations(turn) : movablePieces(turn);
        assert.ok(options.length > 0, 'there is always something to pick');
        const square = options[Math.floor(rng() * options.length)];
        const result = chooseFog(turn, square);
        assert.notEqual(result.outcome, 'must-capture');
        if (result.outcome === 'bumped') {
          tally.bumps++;
          if (result.move) tally.chainBumps++;
          assert.equal(before[result.found], FOG, 'a block only happens on a fogged square');
          const real = turn.state.board[result.found];
          assert.ok(real && real.side !== state.turn, 'and only on a hidden opponent piece');
        }
        if (result.move) played = result.move;
        turn = result.turn;
      }
      assert.doesNotThrow(() => applyMove(state, played));
      state = applyMove(state, played);
      tally.moves++;
    }
    tally.games++;
  }
  assert.equal(tally.games, 120);
  assert.ok(tally.bumps > 20 && tally.chainBumps > 0, JSON.stringify(tally));
});

test('nothing shown depends on what is hidden: two real boards that look the same give the same lists', () => {
  // Move one hidden opponent piece to another fogged square: the side to move
  // must not be able to tell the difference, before or during its move.
  const rng = seeded(5);
  let pairs = 0;
  for (const state of samplePositions(200, 13)) {
    const seen = observe(state.board, state.turn);
    const hidden = fogged(seen).filter((s) => state.board[s]);
    const emptyFog = fogged(seen).filter((s) => !state.board[s]);
    if (!hidden.length || !emptyFog.length) continue;
    const from = hidden[Math.floor(rng() * hidden.length)];
    const to = emptyFog[Math.floor(rng() * emptyFog.length)];
    const board = [...state.board];
    board[to] = board[from];
    board[from] = null;
    // A man moved onto its own crowning row would be a king; skip those.
    if (!board[to].king && rowOf(to) === (board[to].side === 'acorn' ? 0 : 7)) continue;
    const twin = { ...state, board };
    const a = startFogTurn(state);
    const b = startFogTurn(twin);
    assert.deepEqual(observation(a), observation(b));
    assert.deepEqual([movablePieces(a), mayCapture(a)], [movablePieces(b), mayCapture(b)]);
    // The first pick (with no try made yet) gives the same lists in both.
    for (const piece of movablePieces(a)) {
      const pa = chooseFog(a, piece);
      const pb = chooseFog(b, piece);
      assert.equal(pa.outcome, pb.outcome);
      assert.deepEqual(destinations(pa.turn), destinations(pb.turn));
      assert.deepEqual(view(pa.turn), view(pb.turn));
    }
    pairs++;
  }
  assert.ok(pairs > 100, `${pairs} pairs compared`);
});

test('the Spirit\'s observation holds no hidden piece', () => {
  for (const state of samplePositions(100, 17)) {
    const turn = startFogTurn(state);
    const seen = observation(turn);
    assert.equal(seen.side, state.turn);
    assert.deepEqual(Object.keys(seen).sort(), ['board', 'capture', 'opponentCount', 'path', 'side', 'steps']);
    seen.board.forEach((cell, square) => {
      if (isPiece(cell) && cell.side !== state.turn) {
        assert.ok(state.board.some((p, s) => p?.side === state.turn && nextTo(s, square)));
      }
    });
    assert.equal(inChain(turn), false);
  }
});
