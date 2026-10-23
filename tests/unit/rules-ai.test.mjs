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
