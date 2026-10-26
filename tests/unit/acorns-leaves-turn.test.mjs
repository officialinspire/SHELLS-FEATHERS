// Picking an Acorns & Leaves move a square at a time (turn.js), and the words
// used for squares, moves, turns and results (text.js). Positions are drawn
// top row first (a/A acorn, l/L leaf, '.' empty); Acorns move up the board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, positionFromRows, squareAt, applyMove } from '../../src/games/acorns-leaves/engine.js';
import {
  startTurn, choose, cancel, mustCapture, inChain, movablePieces, destinations, jumpedSoFar, displayBoard, selectedSquare,
} from '../../src/games/acorns-leaves/turn.js';
import {
  squareName, pieceName, moveText, turnText, turnLabel, guidance, resultText, outcomeOf, FEEDBACK,
} from '../../src/games/acorns-leaves/text.js';

const sq = (row, col) => squareAt(row, col);
const path = (...pairs) => pairs.map(([r, c]) => sq(r, c));

// Applies picks in order; returns the outcomes and the final turn.
function pick(turn, ...squares) {
  const outcomes = [];
  let last;
  for (const square of squares) {
    last = choose(turn, square);
    outcomes.push(last.outcome);
    turn = last.turn;
  }
  return { turn, outcomes, move: last?.move };
}

test('opening: pick a piece, see where it can go, move it; nothing else does anything', () => {
  const turn = startTurn(createInitialState());
  assert.equal(mustCapture(turn), false);
  assert.deepEqual(movablePieces(turn), path([5, 0], [5, 2], [5, 4], [5, 6]));
  assert.deepEqual(destinations(turn), [], 'nothing picked up yet');

  assert.equal(choose(turn, sq(6, 1)).outcome, 'blocked', 'a back piece has no move yet');
  assert.equal(choose(turn, sq(2, 1)).outcome, 'ignored', "the other side's piece");
  assert.equal(choose(turn, sq(4, 1)).outcome, 'ignored', 'an empty square');
  assert.equal(choose(turn, sq(4, 0)).outcome, 'ignored', 'a light square');

  const picked = choose(turn, sq(5, 2));
  assert.equal(picked.outcome, 'select');
  assert.equal(selectedSquare(picked.turn), sq(5, 2));
  assert.deepEqual(destinations(picked.turn).sort(), path([4, 1], [4, 3]).sort());
  assert.equal(inChain(picked.turn), false);
  assert.deepEqual(displayBoard(picked.turn), [...createInitialState().board], 'nothing moves until a square is chosen');

  // Another piece, the same piece again, a square it can't reach, cancel.
  assert.deepEqual(pick(picked.turn, sq(5, 4)).outcomes, ['select']);
  assert.equal(selectedSquare(pick(picked.turn, sq(5, 4)).turn), sq(5, 4));
  assert.deepEqual(pick(picked.turn, sq(5, 2)).outcomes, ['deselect']);
  assert.equal(selectedSquare(pick(picked.turn, sq(5, 2)).turn), null);
  assert.deepEqual(pick(picked.turn, sq(3, 2)).outcomes, ['not-a-destination']);
  assert.deepEqual(pick(picked.turn, sq(6, 1)).outcomes, ['blocked'], 'the picked piece stays picked');
  assert.equal(selectedSquare(cancel(picked.turn)), null);

  const done = choose(picked.turn, sq(4, 3));
  assert.equal(done.outcome, 'complete');
  assert.deepEqual(done.move.path, path([5, 2], [4, 3]));
  assert.doesNotThrow(() => applyMove(createInitialState(), done.move));
});

test('mandatory capture: only pieces that can capture can be picked, and only to jump', () => {
  const state = positionFromRows([
    '.......l',
    '........',
    '........',
    '........',
    '.l......',
    '..a.....',
    '.....a..',
    '........',
  ]);
  const turn = startTurn(state);
  assert.equal(mustCapture(turn), true);
  assert.deepEqual(movablePieces(turn), [sq(5, 2)]);
  assert.equal(choose(turn, sq(6, 5)).outcome, 'must-capture');
  const picked = choose(turn, sq(5, 2)).turn;
  assert.deepEqual(destinations(picked), [sq(3, 0)], 'the jump, not the ordinary step to (4,3)');
  assert.equal(choose(picked, sq(4, 3)).outcome, 'not-a-destination');
  const { outcomes, move } = pick(picked, sq(3, 0));
  assert.deepEqual(outcomes, ['complete']);
  assert.deepEqual(move.captures, [sq(4, 1)]);
});

test('multi-jump: the piece moves on, jumped pieces wait, it must keep jumping, and a branch can be chosen', () => {
  // The acorn on (6,1) jumps to (4,3), then may go left (to (2,1), two
  // captures) or right (to (2,5) and on to (0,7): three captures and a crown).
  const state = positionFromRows([
    '.l......',
    '......l.',
    '........',
    '..l.l...',
    '........',
    '..l.....',
    '.a......',
    '....a...',
  ]);
  const turn = startTurn(state);
  assert.deepEqual(movablePieces(turn), [sq(6, 1)]);
  const first = pick(turn, sq(6, 1), sq(4, 3));
  assert.deepEqual(first.outcomes, ['select', 'jump']);
  const mid = first.turn;
  assert.equal(inChain(mid), true);
  assert.equal(selectedSquare(mid), sq(4, 3));
  assert.deepEqual(jumpedSoFar(mid), [sq(5, 2)]);
  assert.deepEqual(destinations(mid).sort(), path([2, 1], [2, 5]).sort());
  const shown = displayBoard(mid);
  assert.equal(shown[sq(6, 1)], null, 'the piece has left its start square');
  assert.deepEqual(shown[sq(4, 3)], { side: 'acorn', king: false });
  assert.deepEqual(shown[sq(5, 2)], { side: 'leaf', king: false }, 'the jumped leaf stays until the move ends');
  assert.deepEqual(state.board[sq(6, 1)], { side: 'acorn', king: false }, 'the position itself is unchanged');

  // Mid-chain nothing else can be picked and the jump can't be taken back.
  for (const square of [sq(6, 1), sq(7, 4), sq(3, 2), sq(4, 1)]) {
    assert.equal(choose(mid, square).outcome, 'must-continue', `square ${square}`);
  }
  assert.equal(cancel(mid), mid);

  const right = pick(mid, sq(2, 5));
  assert.deepEqual(right.outcomes, ['jump']);
  assert.deepEqual(jumpedSoFar(right.turn), path([5, 2], [3, 4]));
  assert.deepEqual(destinations(right.turn), [sq(0, 7)]);
  const crowned = choose(right.turn, sq(0, 7));
  assert.equal(crowned.outcome, 'complete');
  assert.deepEqual(crowned.move.path, path([6, 1], [4, 3], [2, 5], [0, 7]));
  assert.deepEqual(crowned.move.captures, path([5, 2], [3, 4], [1, 6]));
  assert.equal(crowned.move.crowned, true);

  const left = choose(mid, sq(2, 1));
  assert.equal(left.outcome, 'complete');
  assert.deepEqual(left.move.captures, path([5, 2], [3, 2]));
});

test('a king can finish a chain on the square it started from', () => {
  const state = positionFromRows([
    '.l......',
    '........',
    '........',
    '..l.l...',
    '........',
    '..l.l...',
    '...A....',
    '........',
  ]);
  const turn = startTurn(state);
  const picked = choose(turn, sq(6, 3)).turn;
  assert.equal(choose(picked, sq(6, 3)).outcome, 'deselect', 'before any jump, its own square puts it back');
  const { outcomes, move, turn: end } = pick(picked, sq(4, 1), sq(2, 3), sq(4, 5), sq(6, 3));
  assert.deepEqual(outcomes, ['jump', 'jump', 'jump', 'complete']);
  assert.deepEqual(move.path, path([6, 3], [4, 1], [2, 3], [4, 5], [6, 3]));
  assert.equal(move.captures.length, 4);
  assert.deepEqual(displayBoard(end)[sq(6, 3)], { side: 'acorn', king: true });
});

test('square names read like a board seen from the Acorns\' side', () => {
  assert.equal(squareName(sq(7, 0)), 'a1');
  assert.equal(squareName(sq(0, 7)), 'h8');
  assert.equal(squareName(sq(5, 2)), 'c3');
  assert.equal(squareName(sq(4, 3)), 'd4');
  assert.equal(squareName(sq(2, 1)), 'b6');
  assert.equal(pieceName(null), 'empty');
  assert.equal(pieceName({ side: 'acorn', king: false }), 'acorn');
  assert.equal(pieceName({ side: 'leaf', king: true }), 'leaf king');
});

test('move announcements say who moved, the route, what was captured, and crowning', () => {
  const man = { side: 'acorn', king: false };
  assert.equal(
    moveText({ mode: 'single', humanSide: 'acorn', piece: man, move: { path: path([5, 2], [4, 3]), captures: [], crowned: false, to: sq(4, 3) } }),
    'You moved from c3 to d4.',
  );
  assert.equal(
    moveText({ mode: 'single', humanSide: 'acorn', piece: { side: 'leaf', king: false }, move: { path: path([2, 3], [4, 1]), captures: [sq(3, 2)], crowned: false, to: sq(4, 1) } }),
    'The Spirit jumped from d6 to b4, capturing 1 acorn.',
  );
  assert.equal(
    moveText({
      mode: 'two', piece: man,
      move: { path: path([6, 1], [4, 3], [2, 5], [0, 7]), captures: path([5, 2], [3, 4], [1, 6]), crowned: true, to: sq(0, 7) },
    }),
    'Acorns jumped from b2 to d4 to f6 to h8, capturing 3 leaves. The acorn on h8 is now a king.',
  );
  assert.equal(
    moveText({ mode: 'two', piece: { side: 'leaf', king: true }, move: { path: path([3, 2], [4, 3]), captures: [], crowned: false, to: sq(4, 3) } }),
    'Leaves moved a king from c5 to d4.',
  );
});

test('turn lines, guidance and feedback', () => {
  assert.equal(turnText({ mode: 'single', turn: 'acorn', humanSide: 'acorn', mustCapture: false }), 'Your turn.');
  assert.equal(turnText({ mode: 'single', turn: 'acorn', humanSide: 'acorn', mustCapture: true }), 'Your turn. You must capture.');
  assert.equal(turnText({ mode: 'single', turn: 'leaf', humanSide: 'acorn', mustCapture: false }), "The Spirit's turn.");
  assert.equal(turnText({ mode: 'two', turn: 'leaf', mustCapture: true }), "Leaves' turn. Leaves must capture.");
  assert.equal(turnLabel({ mode: 'single', turn: 'leaf', humanSide: 'leaf' }), 'Your Turn');
  assert.equal(turnLabel({ mode: 'single', turn: 'acorn', humanSide: 'leaf' }), "Spirit's Turn");
  assert.equal(turnLabel({ mode: 'two', turn: 'acorn' }), "Acorns' Turn");
  assert.match(guidance({ stage: 'choose-piece', mustCapture: true }), /must capture/);
  assert.equal(guidance({ stage: 'choose-piece', mustCapture: false }), 'Choose a piece to move.');
  assert.match(guidance({ stage: 'keep-jumping' }), /^Keep jumping/);
  assert.equal(guidance({ stage: 'choose-square', mustCapture: false }), 'Choose a dot to move to, or the piece to put it back.', 'says how to put a piece back');
  for (const key of ['must-capture', 'blocked', 'must-continue', 'not-a-destination']) assert.ok(FEEDBACK[key], key);
});

test('results name the winner and how the game ended', () => {
  const single = (result, humanSide = 'acorn') => resultText({ mode: 'single', result, humanSide });
  assert.deepEqual(single({ winner: 'acorn', reason: 'no-pieces' }), { outcome: 'win', title: 'Victory!', message: 'You captured every leaf.' });
  assert.deepEqual(single({ winner: 'acorn', reason: 'no-moves' }), { outcome: 'win', title: 'Victory!', message: 'The Spirit has no move left.' });
  assert.deepEqual(single({ winner: 'acorn', reason: 'no-pieces' }, 'leaf'), {
    outcome: 'loss', title: 'Wisdom Gained', message: 'The Spirit captured every leaf.',
  });
  assert.equal(single({ winner: 'leaf', reason: 'no-moves' }).message, 'You have no move left.');
  assert.deepEqual(resultText({ mode: 'two', result: { winner: 'leaf', reason: 'no-moves' } }), {
    outcome: 'leaf', title: 'Leaves Win!', message: 'Acorns have no move left.',
  });
  const draw = resultText({ mode: 'two', result: { winner: null, reason: 'no-progress' } });
  assert.equal(draw.title, 'Balance Achieved');
  assert.match(draw.message, /40 moves each/);
  assert.equal(outcomeOf({ mode: 'single', result: { winner: null }, humanSide: 'leaf' }), 'draw');
});
