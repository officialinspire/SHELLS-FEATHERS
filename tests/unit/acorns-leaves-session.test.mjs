// The Acorns & Leaves session with a fake view, audio and clock: picking
// moves, the Spirit's turns (and cancelling them), stray input, results
// recorded once, rematch, and settings. Positions are drawn top row first
// (a/A acorn, l/L leaf, '.' empty); Acorns move up the board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, DELAYS } from '../../src/games/acorns-leaves/session.js';
import { createInitialState, positionFromRows, legalMoves, squareAt, rowsFromBoard } from '../../src/games/acorns-leaves/engine.js';
import { createProfile } from '../../src/shared/profile.js';
import { openStorage } from '../../src/shared/storage.js';
import { createFakeClock, createFakeAudio, createFakeCheckersView, createMemoryStorage } from '../helpers/fakes.mjs';

const sq = (row, col) => squareAt(row, col);
const SPIRIT_STEP = DELAYS.spiritStep;
const SPIRIT_THINK = DELAYS.spiritThink;

function setup({ side = 'acorn', difficulty = 'easy', position, chooseMove } = {}) {
  const clock = createFakeClock();
  const view = createFakeCheckersView();
  const audio = createFakeAudio();
  const profile = createProfile(openStorage(() => createMemoryStorage()));
  profile.updateAcornsLeavesSettings({ side, difficulty });
  const spiritMoves = [];
  const session = createSession({
    view, audio, profile, clock,
    rng: () => 0.5,
    // Deterministic unless a test brings its own: the Spirit's first legal move.
    chooseMove: (state, options) => {
      const move = chooseMove ? chooseMove(state, options) : legalMoves(state)[0];
      spiritMoves.push(move);
      return move;
    },
    initialState: position ? () => positionFromRows(position.rows, position.options) : createInitialState,
  });
  const records = () => profile.acornsLeavesStats();
  const total = () => {
    const { single, twoPlayer } = records();
    return Object.values(single).reduce((n, r) => n + r.wins + r.losses + r.draws, 0)
      + twoPlayer.acornWins + twoPlayer.leafWins + twoPlayer.draws;
  };
  const tap = (...squares) => squares.forEach((square) => session.selectSquare(square));
  return { clock, view, audio, profile, session, spiritMoves, records, total, tap };
}

// The Spirit (leaves) gets a forced double jump after any quiet acorn move.
const DOUBLE_JUMP = {
  rows: [
    '.l......',
    '..l.....',
    '...a....',
    '........',
    '...a....',
    '........',
    '........',
    '......a.',
  ],
};
// The acorn on (5,2) can take the last leaf.
const LAST_CAPTURE = { rows: ['........', '........', '........', '........', '.l......', '..a.....', '........', '....a...'] };
// Whatever the lone acorn does, the leaf takes it.
const ACORN_LOSES = { rows: ['........', '........', '........', '..l.....', '........', '..a.....', '........', '........'] };

test('two players: pick a piece, see its squares, move; the turn passes and the move is announced', () => {
  const { view, audio, session, tap } = setup();
  session.enter('two');
  assert.equal(view.orientation, 'acorn');
  assert.deepEqual(view.matchInfo, { mode: 'two', difficulty: 'easy', humanSide: null, variant: 'classic' });
  assert.equal(view.model.phase, 'ready');
  assert.equal(view.model.turnLabel, "Acorns' Turn");
  assert.equal(view.said, "New game. Acorns' turn.");
  assert.deepEqual(view.model.movable, [sq(5, 0), sq(5, 2), sq(5, 4), sq(5, 6)]);
  assert.deepEqual(view.model.mustJump, []);
  assert.equal(view.model.hint, 'Choose a piece to move.');

  tap(sq(5, 2));
  assert.equal(view.model.selected, sq(5, 2));
  assert.deepEqual([...view.model.destinations].sort(), [sq(4, 1), sq(4, 3)].sort());
  assert.match(view.said, /^Acorn on c3 picked up\. It can move to (b4 or d4|d4 or b4)\.$/);

  tap(sq(4, 3));
  assert.equal(view.model.turn, 'leaf');
  assert.equal(view.model.turnLabel, "Leaves' Turn");
  assert.deepEqual(view.model.lastMove, { path: [sq(5, 2), sq(4, 3)], captures: [] });
  assert.equal(view.model.selected, null);
  assert.deepEqual(view.model.board[sq(4, 3)], { side: 'acorn', king: false });
  assert.equal(view.said, "Acorns moved from c3 to d4. Leaves' turn.");
  assert.equal(audio.calls.at(-1), 'sfx:player-select');

  tap(sq(2, 3), sq(3, 4));
  assert.equal(view.model.turn, 'acorn');
  assert.equal(audio.calls.at(-1), 'sfx:opponent-select', 'the second side has its own sound');
});

test('picks that do nothing say why, and Escape puts a piece back', () => {
  const { view, session, tap } = setup({
    position: { rows: ['.......l', '........', '........', '........', '.l......', '..a.....', '.....a..', '........'] },
  });
  session.enter('two');
  assert.deepEqual(view.model.mustJump, [sq(5, 2)], 'the piece that must capture is marked');
  assert.match(view.model.hint, /must capture/);
  assert.equal(view.said, "New game. Acorns' turn. Acorns must capture.");

  tap(sq(6, 5));
  assert.equal(view.said, 'You must capture: choose a ringed piece instead.');
  assert.equal(view.model.hint, view.said);
  assert.equal(view.model.feedback, true);

  tap(sq(5, 2));
  assert.deepEqual(view.model.destinations, [sq(3, 0)]);
  assert.match(view.said, /It can jump to a5/);
  tap(sq(4, 3));
  assert.match(view.said, /can't go there/);
  session.cancelSelection();
  assert.equal(view.model.selected, null);
  assert.equal(view.said, 'Piece put back.');
  tap(sq(5, 2), sq(5, 2));
  assert.equal(view.said, 'Piece put back.');
});

test('a chain of jumps: the piece moves on, jumped pieces are marked, it must keep jumping, captures are counted', () => {
  const { view, audio, session, tap } = setup({
    position: { rows: ['.l......', '......l.', '........', '..l.l...', '........', '..l.....', '.a......', '....a...'] },
  });
  session.enter('two');
  tap(sq(6, 1), sq(4, 3));
  assert.deepEqual(view.model.trail, [sq(6, 1), sq(4, 3)]);
  assert.deepEqual(view.model.jumped, [sq(5, 2)]);
  assert.equal(view.model.selected, sq(4, 3));
  assert.equal(view.model.board[sq(6, 1)], null);
  assert.deepEqual(view.model.movable, [], 'no other piece can be picked mid-chain');
  assert.match(view.model.hint, /^Keep jumping/);
  assert.match(view.said, /^Jumped to d4\. Keep jumping: (b6 or f6|f6 or b6)\.$/);
  assert.equal(audio.calls.at(-1), 'sfx:player-select');
  assert.equal(view.model.turn, 'acorn', 'still the same turn');

  tap(sq(7, 4));
  assert.match(view.said, /^Keep jumping with the same piece/);
  session.cancelSelection();
  assert.equal(view.model.selected, sq(4, 3), 'a jump already made stays made');

  tap(sq(2, 5), sq(0, 7));
  assert.equal(view.model.turn, 'leaf');
  assert.deepEqual(view.model.captured, { acorn: 3, leaf: 0 });
  assert.deepEqual(view.model.board[sq(0, 7)], { side: 'acorn', king: true });
  assert.deepEqual(view.model.jumped, []);
  assert.equal(view.said, "Acorns jumped from b2 to d4 to f6 to h8, capturing 3 leaves. The acorn on h8 is now a king. Leaves' turn.");
});

test('the Spirit waits, then shows its move a square at a time; every pick meanwhile is ignored', () => {
  const { clock, view, session, tap, spiritMoves } = setup({ position: DOUBLE_JUMP });
  session.enter('single');
  assert.equal(view.model.turnLabel, 'Your Turn');
  tap(sq(7, 6), sq(6, 7));
  assert.equal(view.model.phase, 'waiting');
  assert.equal(view.model.turnLabel, "Spirit's Turn");
  assert.equal(view.model.hint, 'The Spirit is thinking…');
  assert.deepEqual(view.model.destinations, []);
  assert.equal(view.said, "You moved from g1 to h2. The Spirit's turn. The Spirit must capture.");

  // Stray input while the Spirit acts: nothing is picked, nothing redrawn.
  const before = view.models.length;
  for (const square of [sq(2, 3), sq(4, 3), sq(1, 4), sq(6, 7)]) session.selectSquare(square);
  session.cancelSelection();
  assert.equal(view.models.length, before);
  assert.equal(spiritMoves.length, 0, 'the Spirit has not chosen yet');

  clock.tick(SPIRIT_THINK);
  assert.equal(spiritMoves.length, 1);
  assert.equal(view.model.phase, 'waiting');
  assert.equal(view.model.selected, sq(1, 2), 'the Spirit picks up its piece');
  clock.tick(SPIRIT_STEP);
  assert.deepEqual(view.model.trail, [sq(1, 2), sq(3, 4)]);
  assert.deepEqual(view.model.jumped, [sq(2, 3)]);
  tap(sq(4, 3));
  assert.equal(view.model.phase, 'waiting', 'still ignored mid-chain');
  clock.tick(SPIRIT_STEP);
  assert.equal(view.model.phase, 'ready');
  assert.equal(view.model.turn, 'acorn');
  assert.deepEqual(view.model.captured, { acorn: 0, leaf: 2 });
  assert.deepEqual(view.model.lastMove.captures, [sq(2, 3), sq(4, 3)]);
  assert.equal(view.said, 'The Spirit jumped from c7 to e5 to c3, capturing 2 acorns. Your turn.');
  clock.tick(10_000);
  assert.equal(spiritMoves.length, 1, 'the Spirit moved exactly once');
});

test('playing the Leaves: the board turns round and the Spirit opens', () => {
  const { clock, view, session, spiritMoves, tap } = setup({ side: 'leaf' });
  session.enter('single');
  assert.equal(view.orientation, 'leaf');
  assert.equal(view.model.phase, 'waiting');
  assert.equal(view.said, "New game. The Spirit's turn.");
  tap(sq(2, 1));
  clock.tick(SPIRIT_THINK - 1);
  assert.equal(spiritMoves.length, 0);
  clock.tick(1 + SPIRIT_STEP);
  assert.equal(spiritMoves.length, 1);
  assert.equal(view.model.turn, 'leaf');
  assert.equal(view.model.phase, 'ready');
  assert.match(view.said, /^The Spirit moved from [a-h]3 to [a-h]4\. Your turn\.$/);
  tap(sq(2, 1), sq(3, 0));
  assert.equal(view.model.turn, 'acorn');
});

for (const [when, ticks] of [['while the Spirit thinks', 100], ['in the middle of its chain of jumps', SPIRIT_THINK + SPIRIT_STEP]]) {
  for (const how of ['restart', 'leave', 'playAgain']) {
    test(`${how} ${when} cancels the Spirit's move; nothing is recorded`, () => {
      const { clock, view, session, spiritMoves, total, tap } = setup({ position: DOUBLE_JUMP });
      session.enter('single');
      tap(sq(7, 6), sq(6, 7));
      clock.tick(ticks);
      const chosen = spiritMoves.length;
      session[how]();
      clock.tick(10_000);
      assert.equal(spiritMoves.length, chosen, 'no Spirit move after cancelling');
      assert.equal(total(), 0);
      assert.equal(view.result, null);
      if (how === 'leave') {
        assert.equal(clock.pending, 0, 'no timer left behind');
        session.selectSquare(sq(4, 3)); // a stray click after leaving
      } else {
        assert.equal(view.model.phase, 'ready');
        assert.equal(view.model.turn, 'acorn');
        assert.deepEqual(rowsFromBoard(view.model.board), DOUBLE_JUMP.rows, 'a fresh board');
        assert.deepEqual(view.model.captured, { acorn: 0, leaf: 0 });
      }
    });
  }
}

test('the last capture wins: recorded once, announced, the dialog follows after its delay; later picks are ignored', () => {
  const { clock, view, audio, session, records, total, tap } = setup({ position: LAST_CAPTURE, difficulty: 'medium' });
  session.enter('single');
  tap(sq(5, 2), sq(3, 0));
  assert.equal(view.model.phase, 'over');
  assert.equal(view.model.turnLabel, 'Victory!');
  assert.equal(view.model.winner, 'acorn');
  assert.equal(view.model.hint, 'You captured every leaf.');
  assert.equal(view.said, 'You jumped from c3 to a5, capturing 1 leaf. Victory! You captured every leaf.');
  assert.ok(audio.calls.includes('sfx:victory-sound'));
  assert.equal(view.result, null, 'the dialog waits');
  for (const square of [sq(3, 0), sq(7, 4), sq(6, 5)]) session.selectSquare(square);
  clock.tick(DELAYS.resultModal);
  assert.deepEqual(view.result, { outcome: 'win', title: 'Victory!', message: 'You captured every leaf.' });
  assert.deepEqual(records().single.medium, { wins: 1, losses: 0, draws: 0 });
  clock.tick(10_000);
  assert.equal(view.results.length, 1);
  assert.equal(total(), 1);

  // Rematch: a new game, the victory sound stops, music returns after 300 ms.
  const before = audio.calls.length;
  session.playAgain();
  assert.equal(view.result, null);
  assert.equal(view.model.phase, 'ready');
  assert.deepEqual(audio.calls.slice(before), ['music:stop', 'sfx:newgame-sound', 'stop:victory-sound']);
  clock.tick(DELAYS.musicRestart);
  assert.equal(audio.calls.at(-1), 'music:start');
  assert.equal(total(), 1, 'the rematch scored nothing yet');
});

test('a restart before the dialog opens keeps it closed; the finished game still counts once', () => {
  const { clock, view, session, total, tap } = setup({ position: LAST_CAPTURE });
  session.enter('two');
  tap(sq(5, 2), sq(3, 0));
  session.restart();
  clock.tick(10_000);
  assert.equal(view.results.length, 0);
  assert.equal(total(), 1);
  assert.equal(view.model.phase, 'ready');
});

test('the Spirit winning is a loss for the player, with no victory fanfare', () => {
  const { clock, view, audio, session, records, tap } = setup({ position: ACORN_LOSES, difficulty: 'hard' });
  session.enter('single');
  tap(sq(5, 2), sq(4, 3));
  clock.tick(SPIRIT_THINK + SPIRIT_STEP * 2);
  assert.equal(view.model.phase, 'over');
  assert.equal(view.model.turnLabel, 'Wisdom Gained');
  assert.match(view.said, /^The Spirit jumped from c5 to e3, capturing 1 acorn\. Wisdom Gained The Spirit captured every acorn\.$/);
  assert.ok(!audio.calls.includes('sfx:victory-sound'));
  clock.tick(DELAYS.resultModal);
  assert.equal(view.result.outcome, 'loss');
  assert.deepEqual(records().single.hard, { wins: 0, losses: 1, draws: 0 });
});

test('two players: wins go to the side that won, draws to draws', () => {
  const win = setup({ position: LAST_CAPTURE });
  win.session.enter('two');
  win.tap(sq(5, 2), sq(3, 0));
  assert.equal(win.view.model.turnLabel, 'Acorns Win!');
  assert.deepEqual(win.records().twoPlayer, { acornWins: 1, leafWins: 0, draws: 0 });

  // Kings only, one quiet move from the draw count.
  const draw = setup({ position: { rows: ['.......L', '........', '........', '........', '........', '........', '........', 'A.......'], options: { quietPlies: 79 } } });
  draw.session.enter('two');
  draw.tap(sq(7, 0), sq(6, 1));
  assert.equal(draw.view.model.turnLabel, 'Balance Achieved');
  assert.equal(draw.view.model.winner, null);
  assert.deepEqual(draw.records().twoPlayer, { acornWins: 0, leafWins: 0, draws: 1 });
});

test('side and difficulty apply from the next game; the Spirit is told its difficulty', () => {
  const seen = [];
  const { clock, view, profile, session, tap } = setup({
    chooseMove: (state, options) => { seen.push(options.difficulty); return legalMoves(state)[0]; },
  });
  session.enter('single');
  profile.updateAcornsLeavesSettings({ side: 'leaf', difficulty: 'hard' });
  assert.equal(view.orientation, 'acorn', 'the game in progress keeps its settings');
  tap(sq(5, 0), sq(4, 1));
  clock.tick(SPIRIT_THINK + SPIRIT_STEP);
  assert.deepEqual(seen, ['easy']);
  session.restart();
  assert.equal(view.orientation, 'leaf');
  assert.deepEqual(view.matchInfo, { mode: 'single', difficulty: 'hard', humanSide: 'leaf', variant: 'classic' });
  clock.tick(SPIRIT_THINK + SPIRIT_STEP);
  assert.deepEqual(seen, ['easy', 'hard']);
});

test('a whole game against the real Spirit ends, and is recorded once', async () => {
  const { chooseMove } = await import('../../src/games/acorns-leaves/ai.js');
  const { clock, view, session, total, tap } = setup({
    difficulty: 'medium',
    chooseMove: (state, options) => chooseMove(state, { ...options, maxNodes: 600, now: () => 0 }),
  });
  session.enter('single');
  let turns = 0;
  while (view.model.phase !== 'over') {
    assert.ok(turns++ < 400, 'the game ends');
    if (view.model.phase === 'waiting') {
      clock.tick(SPIRIT_STEP);
      continue;
    }
    // The player always takes the first piece and the first square offered.
    tap(view.model.movable[0] ?? view.model.selected);
    while (view.model.phase === 'ready' && view.model.destinations.length) tap(view.model.destinations[0]);
  }
  clock.tick(DELAYS.resultModal);
  assert.ok(['win', 'loss', 'draw'].includes(view.result.outcome));
  assert.equal(total(), 1);
});
