// The Acorns & Leaves session in Fog of War (docs/fog-rules.md), with a fake
// view, audio and clock: what the player is drawn and told (never a hidden
// piece), blocked tries, the Spirit deciding from its own view and moving
// unseen, the two-player handoff, restarts, the fog lifting at the end, and
// Fog records kept apart. Positions are drawn top row first (a/A acorn,
// l/L leaf, '.' empty); Acorns move up the board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, DELAYS } from '../../src/games/acorns-leaves/session.js';
import { createInitialState, positionFromRows, squareAt, isDarkSquare, rowOf, colOf } from '../../src/games/acorns-leaves/engine.js';
import { observe } from '../../src/games/acorns-leaves/fog.js';
import { chooseFogStep } from '../../src/games/acorns-leaves/fog-ai.js';
import { createProfile } from '../../src/shared/profile.js';
import { openStorage } from '../../src/shared/storage.js';
import { createFakeClock, createFakeAudio, createFakeCheckersView, createMemoryStorage } from '../helpers/fakes.mjs';

const sq = (row, col) => squareAt(row, col);
const SPIRIT_TURN = DELAYS.spiritThink + DELAYS.spiritStep;
const nextTo = (a, b) => Math.abs(rowOf(a) - rowOf(b)) === 1 && Math.abs(colOf(a) - colOf(b)) === 1;
const DARK = Array.from({ length: 64 }, (_, s) => s).filter(isDarkSquare);

function setup({ side = 'acorn', difficulty = 'easy', rows, decide } = {}) {
  const clock = createFakeClock();
  const view = createFakeCheckersView();
  const audio = createFakeAudio();
  const profile = createProfile(openStorage(() => createMemoryStorage()));
  profile.updateAcornsLeavesSettings({ side, difficulty, variant: 'fog' });
  const seenBySpirit = [];
  const session = createSession({
    view, audio, profile, clock,
    rng: () => 0.5,
    chooseFogStep: (seen, options) => {
      seenBySpirit.push(JSON.parse(JSON.stringify(seen)));
      return decide ? decide(seen, options) : seen.steps[0];
    },
    chooseMove: () => { throw new Error('the Classic Spirit must not play in Fog'); },
    initialState: rows ? () => positionFromRows(rows) : createInitialState,
  });
  const tap = (...squares) => squares.forEach((square) => session.selectSquare(square));
  return { clock, view, audio, profile, session, tap, seenBySpirit };
}

// Every model drawn before the game ends: no piece on a fogged square, and
// every opponent piece next to one of the viewer's pieces (or found).
function assertNoLeak(model) {
  if (model.phase === 'over') return;
  const viewer = model.mode === 'single' ? model.humanSide : model.turn;
  const fog = new Set(model.fog);
  const found = new Set(model.found);
  model.board.forEach((piece, square) => {
    if (!piece) return;
    assert.ok(!fog.has(square), `a piece is drawn on fogged square ${square}`);
    if (piece.side !== viewer) {
      assert.ok(found.has(square) || model.board.some((p, s) => p?.side === viewer && nextTo(s, square)),
        `an opponent piece is drawn out of range on ${square}`);
    }
  });
  for (const square of DARK) {
    if (!model.board[square] && !fog.has(square) && model.phase !== 'handoff') {
      assert.ok(model.board.some((p, s) => p?.side === viewer && nextTo(s, square)) || found.has(square),
        `square ${square} is shown as known-empty but is out of range`);
    }
  }
  // Marks never point into fog, except the landing squares the player may try.
  for (const list of ['movable', 'mustJump', 'jumped']) {
    for (const square of model[list]) assert.ok(!fog.has(square) && model.board[square], `${list} ${square}`);
  }
  if (model.selected !== null) assert.ok(!fog.has(model.selected));
  // The panel's rule note names no square; behind the handoff there is
  // neither a note nor a last move.
  assert.doesNotMatch(model.note, /\b[a-h][1-8]\b/, `rule note "${model.note}"`);
  if (model.phase === 'handoff') assert.deepEqual([model.lastText, model.note, model.hint], ['', '', '']);
}

// The panel's "last move" line is always something the player now looking
// was told: its own move, or the other side's as far as it could see it.
function assertLastToldOnly(view) {
  for (const [i, model] of view.models.entries()) {
    if (!model.lastText || model.phase === 'over') continue;
    assert.ok(view.announcements.some((a) => a.includes(model.lastText)), `model ${i}: "${model.lastText}" was never said`);
    if (model.mode === 'single' && model.lastText.startsWith('The Spirit')) {
      assert.doesNotMatch(model.lastText, /from [a-h][1-8]|king/, 'the Spirit\'s route and crownings stay hidden');
    }
  }
}

test('Fog against the Spirit: the player is drawn only their view, offered only what looks possible', () => {
  const { view, session } = setup();
  session.enter('single', 'fog');
  assert.deepEqual(view.matchInfo, { mode: 'single', difficulty: 'easy', humanSide: 'acorn', variant: 'fog' });
  const { model } = view;
  assert.equal(model.variant, 'fog');
  assert.equal(model.board.filter((p) => p?.side === 'leaf').length, 0, 'no leaf in view at the start');
  assert.equal(model.fog.length, 16);
  assert.deepEqual(model.movable, [sq(5, 0), sq(5, 2), sq(5, 4), sq(5, 6)]);
  assert.equal(view.said, 'New game. Your turn.');
  view.models.forEach(assertNoLeak);
});

test('the Spirit decides from its own view only, and its move appears unseen after a fixed pause; the player hears only what they can see', () => {
  // Leaves far away on b8 and d8; acorns on a1 and b2.
  const rows = ['.l.l....', '........', '........', '........', '........', '........', '.a......', 'a.......'];
  const { clock, view, session, tap, seenBySpirit } = setup({ rows, decide: (seen) => seen.steps.find((s) => s.to === sq(1, 0)) ?? seen.steps[0] });
  session.enter('single', 'fog');
  tap(sq(6, 1), sq(5, 2));
  assert.equal(view.model.phase, 'waiting');
  assert.equal(seenBySpirit.length, 1, 'it decides as its turn starts');
  const waiting = view.models.filter((m) => m.phase === 'waiting');
  clock.tick(SPIRIT_TURN - 1);
  assert.equal(view.model.phase, 'waiting', 'its move appears after the same pause, however long it thought');
  clock.tick(1);
  assert.equal(view.model.phase, 'ready');

  // What the Spirit was handed: its own view, nothing more.
  const [seen] = seenBySpirit;
  assert.deepEqual(Object.keys(seen).sort(), ['board', 'capture', 'opponentCount', 'path', 'side', 'steps']);
  const real = positionFromRows(['.l.l....', '........', '........', '........', '........', '..a.....', '........', 'a.......'], { turn: 'leaf' });
  assert.deepEqual(seen.board, JSON.parse(JSON.stringify(observe(real.board, 'leaf'))));
  assert.ok(seen.board.filter((c) => c?.fog).length > 0 && seen.board.every((c) => !c || c.fog || c.side === 'leaf'),
    'the acorns are all under fog for the Spirit');

  // No selection, route or step was shown while it moved.
  for (const m of [...waiting, view.model]) assert.deepEqual([m.selected, m.trail, m.jumped, m.destinations], [null, [], [], []]);
  assert.equal(view.model.phase, 'ready');
  assert.equal(view.said, 'The Spirit moved. Your turn.', 'its hidden move is not described');
  assert.deepEqual(view.model.lastMove, { path: [], captures: [] }, 'and not highlighted');
  view.models.forEach(assertNoLeak);
});

test('a blocked try shows the player only the blocker; with nothing left to try, ordinary moves open', () => {
  // c3 may jump b4 to a5, but a hidden leaf stands on a5.
  const rows = ['.......l', '........', '........', 'l.......', '.l......', '..a.....', '.....a..', '........'];
  const { view, session, tap, audio } = setup({ rows });
  session.enter('single', 'fog');
  assert.deepEqual(view.model.mustJump, [sq(5, 2)]);
  assert.equal(view.model.hint, 'A capture may be possible: try a ringed piece first.');
  assert.equal(view.said, 'New game. Your turn. A capture may be possible.');
  assert.equal(view.model.board[sq(3, 0)], null);
  assert.ok(view.model.fog.includes(sq(3, 0)));
  tap(sq(6, 5));
  assert.equal(view.said, 'A capture may be possible: try a ringed piece first.');
  tap(sq(5, 2));
  assert.match(view.said, /^Acorn on c3 picked up\. It may be able to jump to a5\.$/);
  tap(sq(3, 0));
  assert.equal(view.said, 'Blocked: a hidden leaf is on a5. No capture is left to try, so any move is open.');
  assert.equal(audio.calls.at(-1), 'sfx:reveal-sound', 'a revealed piece has its own sound (against the Spirit)');
  assert.deepEqual(view.model.found, [sq(3, 0)]);
  assert.deepEqual(view.model.board[sq(3, 0)], { side: 'leaf', king: false }, 'the blocker is now drawn');
  assert.ok(!view.model.fog.includes(sq(3, 0)));
  assert.equal(view.model.turn, 'acorn', 'still the player\'s turn');
  assert.deepEqual(view.model.destinations, [sq(4, 3)], 'c3 now offers its ordinary move');
  tap(sq(6, 5), sq(5, 6));
  assert.equal(view.model.phase, 'waiting');
  assert.deepEqual(view.model.found, [], 'found pieces are shown for that turn only');
  view.models.forEach(assertNoLeak);
});

test('a chain whose next jump is blocked ends there, and says so', () => {
  const rows = ['.l......', '........', '.....l..', '....l...', '........', '..l.....', '.a......', '........'];
  const { view, session, tap } = setup({ rows });
  session.enter('single', 'fog');
  tap(sq(6, 1), sq(4, 3));
  assert.deepEqual(view.model.trail, [sq(6, 1), sq(4, 3)]);
  assert.deepEqual(view.model.destinations, [sq(2, 5)]);
  assert.equal(view.model.hint, 'Keep jumping: try the next ring.');
  tap(sq(2, 5));
  assert.equal(view.said, "Blocked: a hidden leaf is on f6. The jump ends here. You jumped from b2 to d4, capturing 1 leaf. The Spirit's turn.");
  assert.equal(view.model.phase, 'waiting');
  view.models.forEach(assertNoLeak);
});

test('the fog lifts when the game ends; the result is kept with the Fog records', () => {
  // The hidden leaf on c5 takes the last acorn once it steps to d4; another leaf hides on h8.
  const rows = ['.......l', '........', '........', '..l.....', '........', '..a.....', '........', '........'];
  const { clock, view, session, tap, profile } = setup({ rows, difficulty: 'hard' });
  session.enter('single', 'fog');
  assert.equal(view.model.board[sq(0, 7)], null, 'h8 starts hidden');
  tap(sq(5, 2), sq(4, 3));
  clock.tick(SPIRIT_TURN);
  assert.equal(view.model.phase, 'over');
  assert.deepEqual(view.model.board[sq(0, 7)], { side: 'leaf', king: false }, 'the whole board is shown');
  assert.deepEqual(view.model.fog, []);
  assert.equal(view.said, 'The Spirit jumped from c5 to e3, capturing 1 acorn. The fog lifts. Wisdom Gained The Spirit captured every acorn.');
  clock.tick(DELAYS.resultModal);
  assert.equal(view.result.outcome, 'loss');
  const stats = profile.acornsLeavesStats();
  assert.deepEqual(stats.fog.single.hard, { wins: 0, losses: 1, draws: 0 });
  assert.deepEqual(stats.single.hard, { wins: 0, losses: 0, draws: 0 }, 'Classic records untouched');
});

test('two players in Fog: a handoff before every turn, with no piece behind it, and each player told only their view', () => {
  const { view, session, tap } = setup();
  session.enter('two', 'fog');
  assert.deepEqual(view.handoff, { title: "Acorns' turn", text: 'Pass the device to the Acorns player. The board stays hidden until they are ready.', button: "Show the Acorns' board" });
  assert.equal(view.said, "New game. Acorns' turn: pass the device.");
  assert.equal(view.model.phase, 'handoff');
  assert.equal(view.model.board.filter(Boolean).length, 0, 'no piece of either side behind the handoff');
  assert.deepEqual(view.model.fog, DARK);
  assert.deepEqual([view.model.movable, view.model.lastMove], [[], null]);
  tap(sq(5, 2)); // a tap behind the handoff does nothing
  session.cancelSelection();
  assert.equal(view.model.phase, 'handoff');

  session.takeControl();
  assert.equal(view.handoff, null);
  assert.equal(view.model.phase, 'ready');
  assert.equal(view.model.board.filter((p) => p?.side === 'acorn').length, 12);
  assert.equal(view.model.board.filter((p) => p?.side === 'leaf').length, 0);
  assert.equal(view.said, "Acorns' turn.");
  tap(sq(5, 2), sq(4, 3));
  assert.equal(view.announcements.at(-1), "Move made. Leaves' turn: pass the device.", 'nothing about the move is left for the next player');
  assert.equal(view.handoff.title, "Leaves' turn");
  assert.equal(view.model.board.filter(Boolean).length, 0);

  session.takeControl();
  assert.equal(view.model.board.filter((p) => p?.side === 'leaf').length, 12);
  assert.equal(view.model.board.filter((p) => p?.side === 'acorn').length, 0, 'd4 is out of the Leaves\' sight');
  assert.equal(view.said, "Acorns moved. Leaves' turn.", 'the Leaves are not told where');
  tap(sq(2, 5), sq(3, 4));
  session.takeControl();
  assert.equal(view.said, "Leaves moved. In view now: leaf on e5. Acorns' turn. A capture may be possible.");
  assert.deepEqual(view.model.mustJump, [sq(4, 3)]);
  assert.equal(view.model.lastText, 'Leaves moved. In view now: leaf on e5.', 'the panel shows what the Acorns were told');
  assert.match(view.model.note, /^A capture may be hiding in the fog/);
  view.models.forEach(assertNoLeak);
  assertLastToldOnly(view);
});

test('restarting or leaving in Fog: the Spirit\'s pending move and the handoff are cancelled', () => {
  const single = setup();
  single.session.enter('single', 'fog');
  single.tap(sq(5, 2), sq(4, 3));
  single.clock.tick(100);
  single.session.restart();
  single.clock.tick(10_000);
  assert.equal(single.seenBySpirit.length, 1, 'it had decided, but its move was never played');
  assert.equal(single.view.model.phase, 'ready');
  assert.equal(single.view.model.turn, 'acorn');
  assert.equal(single.view.model.board.filter((p) => p?.side === 'acorn').length, 12);
  assert.deepEqual(single.view.model.movable, [sq(5, 0), sq(5, 2), sq(5, 4), sq(5, 6)], 'a fresh board');
  single.session.leave();
  assert.equal(single.clock.pending, 0);

  const two = setup();
  two.session.enter('two', 'fog');
  two.session.takeControl();
  two.tap(sq(5, 2), sq(4, 3));
  assert.equal(two.view.handoff.title, "Leaves' turn");
  two.session.restart();
  assert.equal(two.view.handoff.title, "Acorns' turn", 'a new game starts with the handoff to the Acorns');
  assert.equal(two.view.model.board.filter(Boolean).length, 0);
  two.session.leave();
  assert.equal(two.view.handoff, null, 'leaving closes the handoff');
  two.session.takeControl(); // a stray press after leaving
});

test('Classic is unchanged: full view, no fog, no handoff', () => {
  const { view, session, tap } = setup();
  session.enter('two');
  assert.equal(view.model.variant, 'classic');
  assert.deepEqual(view.model.fog, []);
  assert.equal(view.model.board.filter(Boolean).length, 24);
  assert.equal(view.handoffs.length, 0);
  tap(sq(5, 2), sq(4, 3));
  assert.equal(view.model.turn, 'leaf');
  assert.equal(view.handoffs.length, 0);
});

test('two real boards that look the same to the player draw and say the same', () => {
  // Same acorns; the leaf on f8 or h8 (both hidden from the acorns).
  const make = (row0) => {
    const s = setup({ rows: [row0, '........', '........', '........', '........', 'a.a.....', '.a......', '........'] });
    s.session.enter('single', 'fog');
    s.tap(sq(5, 2), sq(5, 0), sq(5, 0));
    s.session.cancelSelection();
    return s;
  };
  const a = make('.....l..');
  const b = make('.......l');
  assert.deepEqual(a.view.models, b.view.models);
  assert.deepEqual(a.view.announcements, b.view.announcements);
});

test('a whole Fog game against the real Spirit ends, with every model leak-free, and is recorded once', () => {
  const { clock, view, session, tap, profile } = setup({
    difficulty: 'medium',
    decide: (seen, options) => chooseFogStep(seen, { ...options, maxNodes: 600, now: () => 0 }),
  });
  session.enter('single', 'fog');
  for (let turns = 0; view.model.phase !== 'over'; turns++) {
    assert.ok(turns < 600, 'the game ends');
    if (view.model.phase === 'waiting') {
      clock.tick(SPIRIT_TURN);
      continue;
    }
    // The player takes the first piece and the first square offered, trying again when blocked.
    if (!view.model.selected) tap(view.model.movable[0]);
    else tap(view.model.destinations[0]);
  }
  view.models.forEach(assertNoLeak);
  assertLastToldOnly(view);
  assert.ok(view.models.some((m) => m.lastText.startsWith('The Spirit moved')), 'its moves are listed as told');
  assert.ok(view.models.some((m) => m.phase === 'waiting' && /imagines 4 ways/.test(m.note)), 'the panel says how it thinks');
  clock.tick(DELAYS.resultModal);
  const { fog } = profile.acornsLeavesStats();
  const total = Object.values(fog.single).reduce((n, r) => n + r.wins + r.losses + r.draws, 0);
  assert.equal(total, 1);
  assert.ok(view.announcements.some((a) => a.includes('The fog lifts.')));
});
