// Board rules, match state and the Spirit's moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINES, winningLine, isFull, emptyCells } from '../../src/games/shells-feathers/rules.js';
import { createMatch } from '../../src/games/shells-feathers/match.js';
import { chooseMove, bestMove } from '../../src/games/shells-feathers/ai.js';

const parse = (s) => [...s].map((c) => ({ S: 'shell', F: 'feather' })[c] ?? null);

test('every line wins; no false positives', () => {
  for (const line of LINES) {
    const board = Array(9).fill(null);
    for (const i of line) board[i] = 'shell';
    assert.deepEqual(winningLine(board, 'shell'), line);
    assert.equal(winningLine(board, 'feather'), null);
  }
  assert.equal(winningLine(parse('SFSSFFFSS'), 'shell'), null);
  assert.equal(isFull(parse('SFSSFFFSS')), true);
  assert.deepEqual(emptyCells(parse('S.F..S...')), [1, 3, 4, 6, 7, 8]);
});

test('a match alternates turns from Player 1 and rejects illegal moves', () => {
  const match = createMatch({ mode: 'two', player1Symbol: 'feather', difficulty: 'easy' });
  assert.equal(match.turn, 'feather');
  assert.deepEqual(match.play(4), { index: 4, symbol: 'feather' });
  assert.equal(match.turn, 'shell');
  for (const bad of [4, -1, 9, 1.5, '3', null]) assert.equal(match.play(bad), null, String(bad));
  assert.equal(match.turn, 'shell');
});

test('outcomes: win/loss in single player, player1/player2 in two players, draw, and no moves after the end', () => {
  const play = (mode, moves) => {
    const match = createMatch({ mode, player1Symbol: 'shell', difficulty: 'easy' });
    for (const i of moves) match.play(i);
    return match;
  };
  assert.equal(play('single', [0, 3, 1, 4, 2]).outcome, 'win');
  assert.equal(play('single', [3, 0, 4, 1, 8, 2]).outcome, 'loss');
  assert.equal(play('two', [0, 3, 1, 4, 2]).outcome, 'player1');
  assert.equal(play('two', [3, 0, 4, 1, 8, 2]).outcome, 'player2');
  const draw = play('two', [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.equal(draw.outcome, 'draw');
  assert.deepEqual(draw.result, { winner: null, line: null });

  const won = play('two', [0, 3, 1, 4, 2]);
  assert.deepEqual(won.result.line, [0, 1, 2]);
  assert.equal(won.play(8), null);
});

test('Wise never loses: every possible human line, human moving first', () => {
  const tally = { win: 0, draw: 0, loss: 0 };
  const walk = (board) => {
    for (const i of emptyCells(board)) {
      const b = board.slice();
      b[i] = 'shell';
      if (winningLine(b, 'shell')) { tally.win++; continue; }
      if (isFull(b)) { tally.draw++; continue; }
      b[chooseMove(b, { ai: 'feather', human: 'shell', difficulty: 'hard' })] = 'feather';
      if (winningLine(b, 'feather')) { tally.loss++; continue; }
      if (isFull(b)) { tally.draw++; continue; }
      walk(b);
    }
  };
  walk(Array(9).fill(null));
  // Same totals as the v1 AI measured during the audit (docs/upgrade-plan.md).
  assert.deepEqual(tally, { win: 0, draw: 183, loss: 386 });
});

test('Wise takes a win before blocking, and blocks when it cannot win', () => {
  assert.equal(bestMove(parse('FF.SS....'), 'feather', 'shell'), 2);
  assert.equal(bestMove(parse('SS..F....'), 'feather', 'shell'), 2);
});

test('Gentle plays a random empty cell; Balanced plays best below 0.7, random above', () => {
  const board = parse('SS..F....');
  const open = emptyCells(board);
  for (const r of [0, 0.25, 0.5, 0.99]) {
    assert.equal(chooseMove(board, { ai: 'feather', human: 'shell', difficulty: 'easy', rng: () => r }), open[Math.floor(r * open.length)]);
  }
  assert.equal(chooseMove(board, { ai: 'feather', human: 'shell', difficulty: 'medium', rng: () => 0.69 }), 2);
  const values = [0.7, 0.99];
  const random = chooseMove(board, { ai: 'feather', human: 'shell', difficulty: 'medium', rng: () => values.shift() });
  assert.equal(random, open[open.length - 1]);
});

test('a line completed on the ninth move is a win, not a draw', () => {
  // Shell's ninth move fills the board (S S F / F F S / S F S) with no line: a draw.
  const draw = createMatch({ mode: 'two', player1Symbol: 'shell', difficulty: 'easy' });
  for (const i of [0, 2, 1, 3, 5, 4, 6, 7, 8]) draw.play(i);
  assert.equal(draw.outcome, 'draw');

  // Shell's ninth move completes the 0-4-8 diagonal on a full board.
  const win = createMatch({ mode: 'two', player1Symbol: 'shell', difficulty: 'easy' });
  for (const i of [0, 1, 4, 2, 5, 3, 6, 7, 8]) win.play(i);
  assert.ok(win.board.every(Boolean), 'board is full');
  assert.equal(win.outcome, 'player1');
  assert.deepEqual(win.result.line, [0, 4, 8]);
});

test('completing two lines with one move is a single win', () => {
  // Shell at 0, 2, 6, 8 then 4 completes both diagonals (and more) at once.
  const match = createMatch({ mode: 'two', player1Symbol: 'shell', difficulty: 'easy' });
  for (const i of [0, 1, 2, 3, 6, 5, 8, 7, 4]) match.play(i);
  assert.equal(match.outcome, 'player1');
  assert.equal(match.play(0), null);
});

test('Feather as Player 1 moves first and is "you" in single player', () => {
  const match = createMatch({ mode: 'single', player1Symbol: 'feather', difficulty: 'hard' });
  assert.equal(match.turn, 'feather');
  assert.equal(match.player2Symbol, 'shell');
  assert.deepEqual(match.play(4), { index: 4, symbol: 'feather' });
  assert.equal(match.isSpiritTurn(), true);
});

test('no move is accepted after a draw or a win', () => {
  const draw = createMatch({ mode: 'two', player1Symbol: 'shell', difficulty: 'easy' });
  for (const i of [0, 1, 2, 4, 3, 5, 7, 6, 8]) draw.play(i);
  assert.equal(draw.outcome, 'draw');
  for (let i = 0; i < 9; i++) assert.equal(draw.play(i), null);
});

test('the Spirit only ever picks an empty square, at every difficulty, from every reachable position', () => {
  let positions = 0;
  const seen = new Set();
  const walk = (board, turn) => {
    const key = board.map((c) => c?.[0] ?? '.').join('');
    if (seen.has(key)) return;
    seen.add(key);
    if (winningLine(board, 'shell') || winningLine(board, 'feather') || isFull(board)) return;
    if (turn === 'feather') {
      positions++;
      for (const difficulty of ['easy', 'medium', 'hard']) {
        for (const r of [0, 0.35, 0.69, 0.71, 0.99]) {
          const move = chooseMove(board, { ai: 'feather', human: 'shell', difficulty, rng: () => r });
          assert.ok(Number.isInteger(move) && board[move] === null, `${difficulty} picked ${move} on ${key}`);
        }
      }
    }
    for (const i of emptyCells(board)) {
      const next = board.slice();
      next[i] = turn;
      walk(next, turn === 'shell' ? 'feather' : 'shell');
    }
  };
  walk(Array(9).fill(null), 'shell');
  assert.ok(positions > 2000, `checked ${positions} positions`);
});

test('Wise never loses when the player picks Feather either', () => {
  let humanWins = 0;
  const walk = (board) => {
    for (const i of emptyCells(board)) {
      const b = board.slice();
      b[i] = 'feather';
      if (winningLine(b, 'feather')) { humanWins++; continue; }
      if (isFull(b)) continue;
      b[chooseMove(b, { ai: 'shell', human: 'feather', difficulty: 'hard' })] = 'shell';
      if (winningLine(b, 'shell') || isFull(b)) continue;
      walk(b);
    }
  };
  walk(Array(9).fill(null));
  assert.equal(humanWins, 0);
});
