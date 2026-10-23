// Acorns & Leaves Classic Checkers engine. Positions are drawn top row first:
// a/A = acorn/acorn king, l/L = leaf/leaf king, '.' = empty. Acorns start at the
// bottom and move up; Leaves start at the top and move down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, FIRST_TO_MOVE, DRAW_AFTER_QUIET_PLIES, IllegalMoveError,
  createInitialState, positionFromRows, rowsFromBoard, legalMoves, legalMovesFrom, findMove, applyMove,
  switchTurn, gameResult, opponent, forwardOf, crownRowOf, squareAt, rowOf, isDarkSquare, countPieces,
} from '../../src/games/acorns-leaves/engine.js';
import { startingPosition } from '../../src/games/acorns-leaves/preview-board.js';

// (row, col) -> square index; path(...pairs) -> list of squares.
const sq = (row, col) => squareAt(row, col);
const path = (...pairs) => pairs.map(([r, c]) => sq(r, c));
const paths = (moves) => moves.map((m) => m.path.map((s) => `${rowOf(s)},${s % SIZE}`).join(' > '));
const empty = '........';

function position(lines, options) {
  return positionFromRows(lines.map((l) => l.replace(/ /g, '')), options);
}

function assertIllegal(state, movePath, code) {
  assert.throws(() => applyMove(state, movePath), (err) => err instanceof IllegalMoveError && err.code === code, `expected ${code}`);
}

// ------------------------------------------------------------------ setup

test('setup: 12 pieces each on the dark squares of the three nearest rows; Acorns move first', () => {
  const state = createInitialState();
  assert.equal(state.board.length, 64);
  assert.equal(state.turn, 'acorn');
  assert.equal(FIRST_TO_MOVE, 'acorn');
  assert.equal(state.quietPlies, 0);
  assert.equal(countPieces(state.board, 'acorn'), 12);
  assert.equal(countPieces(state.board, 'leaf'), 12);
  state.board.forEach((p, square) => {
    if (!p) return;
    assert.ok(isDarkSquare(square), `piece on light square ${square}`);
    assert.equal(p.king, false);
    if (p.side === 'leaf') assert.ok(rowOf(square) <= 2);
    else assert.ok(rowOf(square) >= 5);
  });
  assert.ok(isDarkSquare(sq(7, 0)), 'dark square at bottom-left');
  assert.ok(!isDarkSquare(sq(7, 7)), 'light square at bottom-right');
  assert.equal(gameResult(state), null);
});

test('setup: matches the picture on the hub preview card', () => {
  const engine = createInitialState().board.map((p) => p?.side ?? null);
  const picture = startingPosition().map((s) => s.piece);
  assert.deepEqual(engine, picture);
});

test('directions: Acorns move up toward row 0 and crown there; Leaves move down and crown on row 7', () => {
  assert.equal(forwardOf('acorn'), -1);
  assert.equal(forwardOf('leaf'), 1);
  assert.equal(crownRowOf('acorn'), 0);
  assert.equal(crownRowOf('leaf'), 7);
  assert.equal(opponent('acorn'), 'leaf');
  assert.equal(opponent('leaf'), 'acorn');
});

test('the opening offers the classic seven moves to each side', () => {
  const start = createInitialState();
  assert.deepEqual(paths(legalMoves(start)), [
    '5,0 > 4,1', '5,2 > 4,1', '5,2 > 4,3', '5,4 > 4,3', '5,4 > 4,5', '5,6 > 4,5', '5,6 > 4,7',
  ]);
  const afterAcorn = applyMove(start, path([5, 2], [4, 3]));
  assert.equal(afterAcorn.turn, 'leaf');
  assert.equal(legalMoves(afterAcorn).length, 7);
  assert.ok(legalMoves(afterAcorn).every((m) => rowOf(m.to) === rowOf(m.from) + 1), 'Leaves move down');
});

test('positions round-trip and reject pieces on light squares', () => {
  const rows = rowsFromBoard(createInitialState().board);
  assert.deepEqual(rowsFromBoard(positionFromRows(rows).board), rows);
  assert.throws(() => positionFromRows(['l.......', empty, empty, empty, empty, empty, empty, empty]), /dark squares/);
  assert.throws(() => positionFromRows([empty]), /8 rows/);
});

// ------------------------------------------------------------------ moves and illegal moves

const OPEN = position([
  '........',
  '........',
  '.....l..',
  '........',
  '........',
  '..a.....',
  '........',
  '........',
]);

test('an ordinary piece steps one square diagonally forward', () => {
  assert.deepEqual(paths(legalMoves(OPEN)), ['5,2 > 4,1', '5,2 > 4,3']);
  const next = applyMove(OPEN, path([5, 2], [4, 1]));
  assert.deepEqual(paths(legalMoves(next)), ['2,5 > 3,4', '2,5 > 3,6']);
});

test('illegal moves are refused with a reason, and the position is unchanged', () => {
  const before = rowsFromBoard(OPEN.board);
  assertIllegal(OPEN, path([5, 2], [6, 1]), 'not-allowed'); // backward
  assertIllegal(OPEN, path([5, 2], [4, 2]), 'not-allowed'); // straight up, onto a light square
  assertIllegal(OPEN, path([5, 2], [3, 4]), 'not-allowed'); // two squares without a capture
  assertIllegal(OPEN, path([5, 2], [5, 4]), 'not-allowed'); // sideways
  assertIllegal(OPEN, path([2, 5], [3, 4]), 'not-your-piece');
  assertIllegal(OPEN, path([4, 5], [3, 4]), 'no-piece');
  for (const bad of [[], [sq(5, 2)], [-1, 3], [sq(5, 2), 64], [sq(5, 2), 1.5], 'e3-d4', null]) {
    assertIllegal(OPEN, bad, 'not-allowed');
  }
  const blocked = position(['........', '........', '.....l..', '........', '.a......', '..a.....', '........', '........']);
  assertIllegal(blocked, path([5, 2], [4, 1]), 'not-allowed'); // occupied
  assert.deepEqual(rowsFromBoard(OPEN.board), before);
  assert.equal(findMove(OPEN, path([5, 2], [6, 1])), null);
});

test('states are immutable: applyMove returns a new state and leaves the old one alone', () => {
  const start = createInitialState();
  const next = applyMove(start, legalMoves(start)[0]);
  assert.notEqual(next, start);
  assert.equal(start.turn, 'acorn');
  assert.equal(countPieces(start.board, 'acorn'), 12);
  assert.ok(Object.isFrozen(start) && Object.isFrozen(start.board) && Object.isFrozen(legalMoves(start)[0]));
  assert.throws(() => { start.board[0] = 'x'; }, TypeError);
});

test('switchTurn hands the same position to the other side', () => {
  const flipped = switchTurn(OPEN);
  assert.equal(flipped.turn, 'leaf');
  assert.deepEqual(rowsFromBoard(flipped.board), rowsFromBoard(OPEN.board));
  assert.equal(OPEN.turn, 'acorn');
});

// ------------------------------------------------------------------ captures

test('forced capture: when a capture exists, only captures are legal', () => {
  const state = position([
    '........',
    '........',
    '........',
    '........',
    '...l....',
    '..a...a.',
    '........',
    '........',
  ]);
  const moves = legalMoves(state);
  assert.deepEqual(paths(moves), ['5,2 > 3,4']);
  assert.deepEqual(moves[0].captures, [sq(4, 3)]);
  assertIllegal(state, path([5, 6], [4, 5]), 'must-capture');
  assertIllegal(state, path([5, 2], [4, 1]), 'must-capture');

  const after = applyMove(state, moves[0]);
  assert.equal(after.board[sq(4, 3)], null, 'the jumped piece is removed');
  assert.equal(after.board[sq(3, 4)].side, 'acorn');
  assert.equal(countPieces(after.board, 'leaf'), 0);
});

test('free choice among captures: a single capture is legal even when a double is available', () => {
  const state = position([
    '........',
    '........',
    '.....l..',
    '........',
    '.l...l..',
    'a.....a.',
    '........',
    '........',
  ]);
  assert.deepEqual(paths(legalMoves(state)), ['5,0 > 3,2', '5,6 > 3,4 > 1,6']);
  assert.equal(countPieces(applyMove(state, path([5, 0], [3, 2])).board, 'leaf'), 2);
});

test('multi-jump: the same piece must keep jumping, and every jumped piece is removed', () => {
  const state = position([
    '........',
    '........',
    '.l......',
    '........',
    '...l....',
    '........',
    '...l....',
    '..a.....',
  ]);
  const [triple] = legalMoves(state);
  assert.deepEqual(paths(legalMoves(state)), ['7,2 > 5,4 > 3,2 > 1,0']);
  assert.deepEqual(triple.captures, path([6, 3], [4, 3], [2, 1]));
  assert.equal(triple.crowned, false);
  assertIllegal(state, path([7, 2], [5, 4]), 'must-continue');
  assertIllegal(state, path([7, 2], [5, 4], [3, 2]), 'must-continue');
  const after = applyMove(state, triple.path);
  assert.equal(countPieces(after.board, 'leaf'), 0);
  assert.equal(after.board[sq(1, 0)].king, false);
});

test('multi-jump: when the chain branches, each complete branch is a separate legal move', () => {
  const state = position([
    '........',
    '........',
    '...l.l..',
    '........',
    '...l....',
    '..a.....',
    '........',
    '........',
  ]);
  const moves = legalMoves(state);
  assert.deepEqual(paths(moves), ['5,2 > 3,4 > 1,2', '5,2 > 3,4 > 1,6']);
  assert.ok(moves.every((m) => m.captures.length === 2));
});

test('ordinary pieces capture forward only; kings capture backward too', () => {
  const lines = (piece) => [
    '........',
    '........',
    '........',
    `..${piece}.....`,
    '...l....',
    '........',
    '........',
    'l.......',
  ];
  const man = position(lines('a'));
  assert.deepEqual(paths(legalMoves(man)), ['3,2 > 2,1', '3,2 > 2,3'], 'no backward capture for an ordinary piece');
  assertIllegal(man, path([3, 2], [5, 4]), 'not-allowed');

  const king = position(lines('A'));
  assert.deepEqual(paths(legalMoves(king)), ['3,2 > 5,4'], 'the king must capture backward');
});

test('a piece cannot be jumped twice in one move, and the start square counts as empty', () => {
  // The acorn king may not jump back over the same leaf.
  const once = position(['.......l', '........', '........', '........', '.l......', 'A.......', '........', '........']);
  assert.deepEqual(paths(legalMoves(once)), ['5,0 > 3,2']);

  // A king that circles four leaves lands back on its own (now empty) start square.
  const loop = position([
    '........',
    '........',
    '........',
    '..l.l...',
    '........',
    '..l.l...',
    '...A....',
    '........',
  ]);
  assert.deepEqual(paths(legalMoves(loop)), ['6,3 > 4,1 > 2,3 > 4,5 > 6,3', '6,3 > 4,5 > 2,3 > 4,1 > 6,3']);
  const after = applyMove(loop, legalMoves(loop)[0]);
  assert.equal(after.board[sq(6, 3)].king, true);
  assert.equal(countPieces(after.board, 'leaf'), 0);
});

// ------------------------------------------------------------------ crowning and kings

test('crowning: an Acorn reaching row 0 becomes a king and the turn passes', () => {
  const state = position(['........', '..a.....', '.......l', '........', '........', '........', '........', '........']);
  const move = findMove(state, path([1, 2], [0, 1]));
  assert.equal(move.crowned, true);
  const after = applyMove(state, move);
  assert.deepEqual(after.board[sq(0, 1)], { side: 'acorn', king: true });
  assert.equal(after.turn, 'leaf');
});

test('crowning: a Leaf reaching row 7 becomes a king', () => {
  const state = position(['........', '........', '........', '........', '........', '......a.', '.l......', '........'], { turn: 'leaf' });
  assert.deepEqual(paths(legalMoves(state)), ['6,1 > 7,0', '6,1 > 7,2']);
  assert.ok(legalMoves(state).every((m) => m.crowned));
  assert.equal(applyMove(state, path([6, 1], [7, 2])).board[sq(7, 2)].king, true);
});

test('crowning ends the move, even when the new king could jump again', () => {
  const lines = (mover) => ['........', '..l.l...', `.${mover}......`, '........', '........', '........', '........', '........'];
  const state = position(lines('a'));
  const moves = legalMoves(state);
  assert.deepEqual(paths(moves), ['2,1 > 0,3']);
  assert.equal(moves[0].crowned, true);
  assert.deepEqual(moves[0].captures, [sq(1, 2)]);
  const after = applyMove(state, moves[0]);
  assert.equal(after.board[sq(1, 4)].side, 'leaf', 'the second leaf survives');
  assert.equal(after.turn, 'leaf');

  // As a king on that square, the same piece would have had another jump.
  const kingThere = position(['...A....', '....l...', '........', '........', '........', '........', '........', '........']);
  assert.deepEqual(paths(legalMoves(kingThere)), ['0,3 > 2,5']);
});

test('a king reaching the far row is not crowned again', () => {
  const state = position(['........', '..A.....', '........', '....l...', '........', '........', '........', '........']);
  const move = findMove(state, path([1, 2], [0, 1]));
  assert.equal(move.crowned, false);
  assert.equal(applyMove(state, move).board[sq(0, 1)].king, true);
});

test('kings step one square in any diagonal direction, never further', () => {
  const state = position(['.......l', '........', '........', '........', '...A....', '........', '........', '........']);
  assert.deepEqual(paths(legalMoves(state)), ['4,3 > 3,2', '4,3 > 3,4', '4,3 > 5,2', '4,3 > 5,4']);
  assertIllegal(state, path([4, 3], [2, 5]), 'not-allowed');
  assertIllegal(state, path([4, 3], [7, 6]), 'not-allowed');
});

test('a Leaf king captures toward row 0; an ordinary Leaf cannot', () => {
  const lines = (piece) => ['........', '........', '........', '....a...', `...${piece}....`, '........', '........', 'a.......'];
  assert.deepEqual(paths(legalMoves(position(lines('L'), { turn: 'leaf' }))), ['4,3 > 2,5']);
  assert.deepEqual(paths(legalMoves(position(lines('l'), { turn: 'leaf' }))), ['4,3 > 5,2', '4,3 > 5,4']);
});

test('the draw count rises with quiet king moves and resets on a capture or an ordinary move', () => {
  let state = position(['.L......', '........', '........', '........', '...A....', '........', '........', 'a.......']);
  state = applyMove(state, path([4, 3], [3, 2]));
  assert.equal(state.quietPlies, 1);
  state = applyMove(state, path([0, 1], [1, 0]));
  assert.equal(state.quietPlies, 2);
  state = applyMove(state, path([7, 0], [6, 1]));
  assert.equal(state.quietPlies, 0, 'an ordinary piece moved');

  const capture = position(['.......l', '........', '........', '..l.....', '...A....', '........', '........', '........'], { quietPlies: 50 });
  assert.equal(applyMove(capture, path([4, 3], [2, 1])).quietPlies, 0, 'a capture');
});

// ------------------------------------------------------------------ game end

test('win by elimination: capturing the last piece ends the game', () => {
  const state = position(['........', '........', '........', '........', '...l....', '..a.....', '........', '........']);
  const after = applyMove(state, path([5, 2], [3, 4]));
  assert.deepEqual(gameResult(after), { winner: 'acorn', reason: 'no-pieces' });
  assert.deepEqual(legalMoves(after), []);
  assert.deepEqual(legalMovesFrom(after, sq(3, 4)), []);
  assertIllegal(after, path([3, 4], [2, 3]), 'game-over');
});

test('win by blockade: a side with pieces but no legal move loses', () => {
  const state = position([
    '........',
    '........',
    '........',
    '..a.....',
    '.l......',
    'a.......',
    '.a.a....',
    '........',
  ]);
  assert.equal(gameResult(state), null);
  const after = applyMove(state, path([6, 1], [5, 2]));
  assert.equal(countPieces(after.board, 'leaf'), 1);
  assert.deepEqual(gameResult(after), { winner: 'acorn', reason: 'no-moves' });
  assert.deepEqual(legalMoves(after), []);

  const acornsStuck = position(['.l......', 'a.......', '........', '........', '........', '........', '........', '........']);
  assert.deepEqual(gameResult(acornsStuck), { winner: 'leaf', reason: 'no-moves' });
});

test('draw after 40 moves each with no capture and no ordinary piece moved; a win takes precedence', () => {
  const quiet = position(['.L......', '........', '........', '........', '...A....', '........', '........', '........'], {
    quietPlies: DRAW_AFTER_QUIET_PLIES - 1,
  });
  assert.equal(gameResult(quiet), null);
  const drawn = applyMove(quiet, path([4, 3], [3, 4]));
  assert.deepEqual(gameResult(drawn), { winner: null, reason: 'no-progress' });
  assert.deepEqual(legalMoves(drawn), []);
  assertIllegal(drawn, path([0, 1], [1, 2]), 'game-over');

  const noLeaves = position(['........', '........', '........', '........', '...A....', '........', '........', '........'], {
    turn: 'leaf', quietPlies: DRAW_AFTER_QUIET_PLIES + 5,
  });
  assert.deepEqual(gameResult(noLeaves), { winner: 'acorn', reason: 'no-pieces' });
});

// ------------------------------------------------------------------ whole games

// Seeded random games from the opening: rules that must hold on every move.
test('random games keep every rule, and always end', () => {
  let seed = 20261023;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const endings = { 'no-pieces': 0, 'no-moves': 0, 'no-progress': 0 };

  for (let game = 0; game < 300; game++) {
    let state = createInitialState();
    for (let ply = 0; ; ply++) {
      assert.ok(ply < 3000, 'game did not end');
      const moves = legalMoves(state);
      const result = gameResult(state);
      if (!moves.length) {
        assert.ok(result, 'no moves only when the game is over');
        endings[result.reason]++;
        break;
      }
      assert.equal(result, null);
      const anyCapture = moves.some((m) => m.captures.length);
      assert.ok(moves.every((m) => (m.captures.length > 0) === anyCapture), 'captures are compulsory');

      const chosen = moves[Math.floor(random() * moves.length)];
      const mover = state.board[chosen.from];
      if (!mover.king) {
        for (let i = 1; i < chosen.path.length; i++) {
          assert.equal(Math.sign(rowOf(chosen.path[i]) - rowOf(chosen.path[i - 1])), forwardOf(mover.side), 'ordinary pieces only go forward');
        }
      }
      const next = applyMove(state, chosen);
      assert.equal(next.turn, opponent(state.turn));
      assert.equal(countPieces(next.board, state.turn), countPieces(state.board, state.turn));
      assert.equal(countPieces(next.board, next.turn), countPieces(state.board, next.turn) - chosen.captures.length);
      assert.ok(next.board.every((p, square) => !p || isDarkSquare(square)));
      assert.equal(next.board[chosen.to].king, mover.king || chosen.crowned);
      if (chosen.crowned) assert.equal(rowOf(chosen.to), crownRowOf(mover.side));
      state = next;
    }
  }
  assert.equal(endings['no-pieces'] + endings['no-moves'] + endings['no-progress'], 300);
  assert.ok(endings['no-pieces'] > 0 && endings['no-moves'] > 0, JSON.stringify(endings));
});
