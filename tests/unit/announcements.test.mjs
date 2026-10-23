// What the board tells assistive technology: square names, lines, moves,
// turns and results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINES } from '../../src/games/shells-feathers/rules.js';
import { squareName, lineName, moveStatus, turnStatus, resultStatus } from '../../src/games/shells-feathers/view.js';

test('squares and lines have plain names', () => {
  assert.equal(squareName(0), 'row 1, column 1');
  assert.equal(squareName(5), 'row 2, column 3');
  assert.equal(squareName(8), 'row 3, column 3');
  assert.deepEqual(LINES.map(lineName), [
    'the top row', 'the middle row', 'the bottom row',
    'the left column', 'the middle column', 'the right column',
    'the diagonal from top left', 'the diagonal from top right',
  ]);
});

test('each move says who placed which piece where', () => {
  assert.equal(moveStatus({ actor: 'you', symbol: 'shell', index: 4 }), 'You placed a shell on row 2, column 2.');
  assert.equal(moveStatus({ actor: 'spirit', symbol: 'feather', index: 6 }), 'The Spirit placed a feather on row 3, column 1.');
  assert.equal(moveStatus({ actor: 'player2', symbol: 'shell', index: 2 }), 'Player 2 placed a shell on row 1, column 3.');
});

test('turns and results are announced in words, keeping the game\'s result titles', () => {
  assert.equal(turnStatus('single', true), 'Your turn.');
  assert.equal(turnStatus('single', false), "The Spirit's turn.");
  assert.equal(turnStatus('two', false), "Player 2's turn.");
  assert.equal(resultStatus('win', 'shell', [0, 1, 2]), 'Victory! Three shells in the top row.');
  assert.equal(resultStatus('loss', 'feather', [2, 4, 6]), 'Wisdom Gained Three feathers in the diagonal from top right.');
  assert.equal(resultStatus('player1', 'feather', [1, 4, 7]), 'Player 1 Wins! Three feathers in the middle column.');
  assert.equal(resultStatus('draw', null, null), 'Balance Achieved: a draw. The board is full with no three in a row.');
});
