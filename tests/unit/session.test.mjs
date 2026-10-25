// Reset and stale-callback checks for the Shells & Feathers session, with a
// fake clock so every pending timer is visible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, DELAYS } from '../../src/games/shells-feathers/session.js';
import { createProfile } from '../../src/shared/profile.js';
import { openStorage } from '../../src/shared/storage.js';
import { createFakeClock, createFakeView, createFakeAudio, createMemoryStorage } from '../helpers/fakes.mjs';

function setup({ difficulty = 'easy', player1Symbol = 'shell' } = {}) {
  const clock = createFakeClock();
  const view = createFakeView();
  const audio = createFakeAudio();
  const profile = createProfile(openStorage(() => createMemoryStorage()));
  profile.updateGameSettings({ difficulty, player1Symbol });
  // rng 0 makes Gentle/Balanced pick the first empty cell (and Balanced play its best move).
  const session = createSession({ view, audio, profile, clock, rng: () => 0 });
  return { clock, view, audio, profile, session };
}

// Wise is deterministic: after human 0 -> Spirit 4, human 1 -> Spirit 2, the
// Spirit threatens 2-4-6. Human 3 ignores it, so the Spirit's next move wins.
function reachSpiritWinningReply({ session, clock }) {
  session.selectCell(0);
  clock.tick(DELAYS.spiritMove);
  session.selectCell(1);
  clock.tick(DELAYS.spiritMove);
  session.selectCell(3);
}

test('restart ("New Journey") cancels the pending Spirit move and starts a clean match', () => {
  const { session, clock, view } = setup();
  session.enter('single');
  session.selectCell(4);
  assert.equal(clock.pending, 1, 'Spirit move scheduled');

  session.restart();
  assert.equal(clock.pending, 0, 'nothing left scheduled');
  assert.equal(view.pieces, 0);
  assert.deepEqual(view.turn, { mode: 'single', isPlayer1: true, symbol: 'shell' });

  clock.tick(5_000);
  assert.equal(view.pieces, 0, 'old Spirit move never lands on the new board');

  // The new match runs on its own full delay.
  session.selectCell(8);
  clock.tick(DELAYS.spiritMove - 1);
  assert.equal(view.pieces, 1);
  clock.tick(1);
  assert.equal(view.pieces, 2);
});

test('leaving during the Spirit\'s turn cancels its move; no result, stats or sounds follow', () => {
  const { session, clock, view, audio, profile } = setup({ difficulty: 'hard' });
  session.enter('single');
  reachSpiritWinningReply({ session, clock });
  assert.equal(clock.pending, 1);
  const audioBefore = audio.calls.length;

  session.leave();
  clock.tick(10_000);

  assert.equal(clock.pending, 0);
  assert.deepEqual(view.resultsShown, []);
  assert.equal(view.result, null);
  assert.equal(profile.statsSummary().totalGames, 0, 'no loss recorded');
  assert.deepEqual(audio.calls.slice(audioBefore), ['stop:victory-sound'], 'only teardown audio');

  // Selecting a cell after leaving does nothing.
  session.selectCell(5);
  assert.equal(view.board[5], null);
});

test('the result modal of a finished match never opens after restart or leave', () => {
  for (const exit of ['restart', 'playAgain', 'leave']) {
    const { session, clock, view, profile } = setup();
    session.enter('two');
    for (const i of [0, 3, 1, 4, 2]) session.selectCell(i); // Player 1 wins the top row
    assert.equal(profile.statsSummary().wins, 1, `${exit}: result recorded at once`);
    assert.equal(view.result, null, `${exit}: modal waits ${DELAYS.resultModal}ms`);

    clock.tick(DELAYS.resultModal - 1);
    session[exit]();
    clock.tick(10_000);
    assert.deepEqual(view.resultsShown, [], `${exit}: stale modal must not open`);
  }
});

test('the result modal opens once, after its delay, when the player stays', () => {
  const { session, clock, view, audio } = setup();
  session.enter('two');
  for (const i of [0, 3, 1, 4, 2]) session.selectCell(i);
  assert.deepEqual(view.highlighted, [0, 1, 2]);
  assert.ok(audio.calls.includes('music:stop') && audio.calls.includes('sfx:victory-sound'));

  clock.tick(DELAYS.resultModal);
  assert.deepEqual(view.result, { outcome: 'player1', winner: 'shell' });
  clock.tick(10_000);
  assert.deepEqual(view.resultsShown, ['player1']);
});

test('"Play Again" (v1: New Game) stops the victory sound, keeps the session score and restarts music after 300ms', () => {
  const { session, clock, view, audio } = setup();
  session.enter('two');
  for (const i of [0, 3, 1, 4, 2]) session.selectCell(i);
  clock.tick(DELAYS.resultModal);
  audio.calls.length = 0;

  session.playAgain();
  assert.equal(view.result, null);
  assert.equal(view.pieces, 0);
  assert.deepEqual(view.scores, { player1: 1, player2: 0 });
  assert.deepEqual(audio.calls, ['music:stop', 'sfx:newgame-sound', 'stop:victory-sound']);

  clock.tick(DELAYS.musicRestart);
  assert.deepEqual(audio.calls.slice(3), ['music:start']);
});

test('a "Play Again" music restart is cancelled if the match is restarted first', () => {
  const { session, clock, audio } = setup();
  session.enter('two');
  session.playAgain();
  session.restart();
  audio.calls.length = 0;
  clock.tick(1_000);
  assert.deepEqual(audio.calls, []);
});

test('the player cannot move during the Spirit\'s turn, and the Spirit moves exactly once', () => {
  const { session, clock, view } = setup();
  session.enter('single');
  session.selectCell(4);
  session.selectCell(0); // ignored: Spirit's turn
  assert.equal(view.pieces, 1);
  clock.tick(DELAYS.spiritMove * 5);
  assert.equal(view.pieces, 2);
  assert.equal(view.board.filter((c) => c === 'feather').length, 1);
});

test('entering a mode resets the session score; restarts keep it', () => {
  const { session, clock, view } = setup();
  session.enter('two');
  for (const i of [0, 3, 1, 4, 2]) session.selectCell(i);
  session.restart();
  for (const i of [3, 0, 4, 1, 8, 2]) session.selectCell(i); // Player 2 wins the top row
  assert.deepEqual(view.scores, { player1: 1, player2: 1 });

  session.leave();
  session.enter('single');
  assert.deepEqual(view.scores, { player1: 0, player2: 0 });
  clock.tick(10_000);
});

test('results are recorded per mode and difficulty, with v1-style totals', () => {
  const { session, clock, profile } = setup({ difficulty: 'hard' });
  session.enter('single');
  reachSpiritWinningReply({ session, clock });
  clock.tick(DELAYS.spiritMove);
  assert.deepEqual(profile.statsSummary(), { wins: 0, losses: 1, draws: 0, totalGames: 1 });

  session.leave();
  session.enter('two');
  for (const i of [3, 0, 4, 1, 8, 2]) session.selectCell(i); // Player 2 wins
  // v1 counted every two-player win as a Victory.
  assert.deepEqual(profile.statsSummary(), { wins: 1, losses: 1, draws: 0, totalGames: 2 });
});

test('the symbol and difficulty saved in settings apply from the next match', () => {
  const { session, clock, view, profile } = setup();
  profile.updateGameSettings({ player1Symbol: 'feather' });
  session.enter('single');
  session.selectCell(0);
  clock.tick(DELAYS.spiritMove);
  assert.equal(view.board[0], 'feather');
  assert.equal(view.board.filter((c) => c === 'shell').length, 1, 'Spirit plays shell');
});

test('each match tells the view its mode, difficulty and pieces, and the result replaces the turn line', () => {
  const { session, clock, view } = setup({ difficulty: 'medium', player1Symbol: 'feather' });
  session.enter('single');
  assert.deepEqual(view.matchInfo, { mode: 'single', difficulty: 'medium', player1Symbol: 'feather' });
  assert.equal(view.finalTurn, null);

  session.leave();
  session.enter('two');
  for (const i of [3, 0, 4, 1, 8, 2]) session.selectCell(i);
  assert.deepEqual(view.finalTurn, { outcome: 'player2', winner: 'shell', line: [0, 1, 2] });
  clock.tick(10_000);
});

test('a round is scored once, whatever the player does after its last move', () => {
  const { session, clock, view, profile } = setup();
  session.enter('two');
  for (const i of [0, 3, 1, 4, 2]) session.selectCell(i); // Player 1 wins
  for (let n = 0; n < 3; n++) for (let i = 0; i < 9; i++) session.selectCell(i); // taps after the end
  clock.tick(10_000);
  assert.deepEqual(profile.statsSummary(), { wins: 1, losses: 0, draws: 0, totalGames: 1 });
  assert.deepEqual(view.scores, { player1: 1, player2: 0 });
  assert.deepEqual(view.resultsShown, ['player1']);

  session.playAgain(); // a new round starts, nothing is re-scored
  session.restart();
  clock.tick(10_000);
  assert.equal(profile.statsSummary().totalGames, 1);
  assert.deepEqual(view.scores, { player1: 1, player2: 0 });
});

test('the Spirit\'s last move scores its round once', () => {
  const { session, clock, profile, view } = setup({ difficulty: 'hard' });
  session.enter('single');
  reachSpiritWinningReply({ session, clock });
  clock.tick(DELAYS.spiritMove);
  session.selectCell(5); // too late: the round is over
  clock.tick(10_000);
  assert.deepEqual(profile.statsSummary(), { wins: 0, losses: 1, draws: 0, totalGames: 1 });
  assert.deepEqual(view.scores, { player1: 0, player2: 1 });
});

test('rounds that are restarted or left before they end are not scored', () => {
  const { session, clock, profile, view } = setup();
  session.enter('single');
  session.selectCell(4);
  session.restart(); // during the Spirit's turn
  session.selectCell(0);
  clock.tick(DELAYS.spiritMove);
  session.leave(); // during the player's turn
  session.enter('two');
  for (const i of [0, 3, 1]) session.selectCell(i);
  session.leave();
  clock.tick(10_000);
  assert.equal(profile.statsSummary().totalGames, 0);
  assert.deepEqual(view.resultsShown, []);
});

test('the board is ready on the player\'s turn, waits for the Spirit, and locks when the round ends', () => {
  const { session, clock, view } = setup();
  session.enter('single');
  assert.equal(view.boardState, 'ready');
  session.selectCell(4);
  assert.equal(view.boardState, 'waiting');
  clock.tick(DELAYS.spiritMove);
  assert.equal(view.boardState, 'ready');

  session.leave();
  session.enter('two');
  view.boardStates.length = 0;
  for (const i of [0, 3, 1, 4, 2]) session.selectCell(i);
  assert.deepEqual(view.boardStates, ['ready', 'ready', 'ready', 'ready', 'over'], 'two players never wait');
  session.playAgain();
  assert.equal(view.boardState, 'ready');
  clock.tick(10_000);
});

test('each move says who made it', () => {
  const { session, clock, view } = setup();
  session.enter('single');
  session.selectCell(4);
  clock.tick(DELAYS.spiritMove);
  assert.deepEqual(view.moves.map(([, symbol, actor]) => [symbol, actor]), [['shell', 'you'], ['feather', 'spirit']]);

  session.leave();
  view.moves.length = 0;
  session.enter('two');
  session.selectCell(0);
  session.selectCell(1);
  assert.deepEqual(view.moves, [[0, 'shell', 'player1'], [1, 'feather', 'player2']]);
});

test('the match menu pauses the round: the Spirit\'s move and the result dialog wait for Resume', () => {
  const { session, clock, view } = setup({ difficulty: 'hard' });
  session.enter('single');
  session.selectCell(4);
  clock.tick(DELAYS.spiritMove / 2);
  session.pause();
  clock.tick(10_000);
  assert.equal(view.pieces, 1, 'no Spirit move while paused');
  session.selectCell(0);
  assert.equal(view.pieces, 1, 'and no pick');
  session.resume();
  clock.tick(DELAYS.spiritMove / 2 - 1);
  assert.equal(view.pieces, 1, 'the rest of its delay, not a fresh one');
  clock.tick(1);
  assert.equal(view.pieces, 2);

  // The Spirit's winning reply, then a pause before the result dialog.
  const { session: s2, clock: c2, view: v2 } = setup({ difficulty: 'hard' });
  s2.enter('single');
  reachSpiritWinningReply({ session: s2, clock: c2 });
  c2.tick(DELAYS.spiritMove);
  assert.equal(v2.result, null);
  s2.pause();
  c2.tick(10_000);
  assert.equal(v2.result, null, 'no result dialog behind the menu');
  s2.resume();
  c2.tick(DELAYS.resultModal);
  assert.notEqual(v2.result, null);
});
