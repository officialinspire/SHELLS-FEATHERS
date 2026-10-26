// Both games through the real feedback service, with a recording vibration
// API and animator: which events sound, vibrate and animate, that the
// Spirit's moves never vibrate, that Fog gives nothing away (no hidden
// square animated, nothing but one tap per move with two players), and that
// pausing, leaving and restarting cancel what is queued or playing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession as createCheckers, DELAYS as AL_DELAYS } from '../../src/games/acorns-leaves/session.js';
import { createSession as createShellsFeathers, DELAYS as SF_DELAYS } from '../../src/games/shells-feathers/session.js';
import { squareAt, positionFromRows, createInitialState } from '../../src/games/acorns-leaves/engine.js';
import { createFeedback, CUES } from '../../src/shared/feedback.js';
import { createHaptics, HAPTICS } from '../../src/shared/haptics.js';
import { createProfile } from '../../src/shared/profile.js';
import { openStorage } from '../../src/shared/storage.js';
import {
  createFakeClock, createFakeAudio, createFakeCheckersView, createFakeView, createMemoryStorage,
} from '../helpers/fakes.mjs';

const sq = (row, col) => squareAt(row, col);
// b2 jumps c3, e5 and g7, landing on h8 and crowned.
const CHAIN = { rows: ['.l......', '......l.', '........', '..l.l...', '........', '..l.....', '.a......', '....a...'] };

function rig({ variant = 'classic', side = 'acorn', difficulty = 'easy', rows } = {}) {
  const clock = createFakeClock();
  const audio = createFakeAudio();
  const vibrations = [];
  const nav = { vibrate: (pattern) => { vibrations.push(pattern); return true; } };
  const haptics = createHaptics({ nav, doc: {}, clock, enabled: true });
  const animations = [];
  const feedback = createFeedback({ audio, haptics, clock });
  feedback.setAnimator('al', { play: (motion, at) => animations.push(`${motion}@${at.square}`), clear: () => {} });
  feedback.setAnimator('sf', { play: (motion, at) => animations.push(`${motion}@${at.index}`), clear: () => {} });
  const profile = createProfile(openStorage(() => createMemoryStorage()));
  profile.updateAcornsLeavesSettings({ side, difficulty, variant });
  const view = createFakeCheckersView();
  const session = createCheckers({
    view, audio, profile, clock, feedback, rng: () => 0.5,
    initialState: rows ? () => positionFromRows(rows) : createInitialState,
  });
  // Lets the haptics rate limit pass between taps, as a person's would.
  const tap = (...squares) => squares.forEach((s) => { session.selectSquare(s); clock.tick(HAPTICS.MIN_GAP_MS); });
  const sounds = () => audio.calls.filter((c) => c.startsWith('sfx:')).map((c) => c.slice(4));
  return { clock, audio, vibrations, animations, feedback, session, view, tap, sounds, profile };
}

test('checkers: pick, refuse, jump, multi-jump and crowning each have their own feedback', () => {
  const { session, tap, sounds, vibrations, animations, clock } = rig({ rows: CHAIN.rows });
  session.enter('two');
  tap(sq(7, 4)); // e1 can't capture, but a capture is compulsory
  assert.deepEqual([sounds().at(-1), vibrations.at(-1), animations.at(-1)], ['invalid-sound', 8, `refuse@${sq(7, 4)}`]);
  tap(sq(6, 1));
  assert.deepEqual([sounds().at(-1), vibrations.at(-1)], ['select-sound', 6], 'a shell click when a piece is picked up');
  tap(sq(4, 3));
  assert.deepEqual([sounds().at(-1), vibrations.at(-1), animations.at(-1)], ['capture-sound', 12, `land@${sq(4, 3)}`], 'each jump of a chain');
  tap(sq(2, 5), sq(0, 7));
  const end = sounds().slice(-2);
  assert.deepEqual(end, ['capture-sound', 'crown-sound']);
  assert.deepEqual(vibrations.at(-1), CUES.crown.haptic, 'a crowning vibrates as a crowning (the move itself does not as well)');
  assert.deepEqual(animations.slice(-2), [`capture@${sq(0, 7)}`, `crown@${sq(0, 7)}`]);
  clock.tick(CUES.multi.delay);
  assert.equal(sounds().at(-1), 'multi-sound', 'then a short chirp for the multi-jump');
});

test('checkers against the Spirit: your moves vibrate, the Spirit\'s never do; results do once', () => {
  const { session, tap, vibrations, sounds, clock } = rig();
  session.enter('single');
  tap(sq(5, 2), sq(4, 3));
  const mine = vibrations.length;
  assert.deepEqual(vibrations.slice(-1), [10]);
  clock.tick(AL_DELAYS.spiritThink + 10 * AL_DELAYS.spiritStep);
  assert.equal(sounds().at(-1), 'piece-move-other');
  assert.equal(vibrations.length, mine, 'no vibration for the Spirit\'s move');
});

test('Fog against the Spirit: its moves animate no square and its crowning is silent', () => {
  const { session, tap, animations, clock, view } = rig({ variant: 'fog', difficulty: 'medium' });
  session.enter('single', 'fog');
  for (let turns = 0; turns < 30 && view.model.phase !== 'over'; turns++) {
    if (view.model.phase === 'waiting') {
      const before = animations.length;
      clock.tick(AL_DELAYS.spiritThink + AL_DELAYS.spiritStep);
      assert.equal(animations.length, before, 'nothing of the Spirit\'s move is drawn');
      continue;
    }
    const before = animations.length;
    if (view.model.selected === null) tap(view.model.movable[0]);
    else tap(view.model.destinations[0]);
    // Each animation, when it happens, is on a square in view (or one the
    // player just tapped, or a hidden piece their try just found).
    const fogged = new Set(view.model.fog);
    const found = new Set(view.model.found);
    for (const a of animations.slice(before)) {
      const square = Number(a.split('@')[1]);
      assert.ok(!fogged.has(square) || found.has(square) || a.startsWith('refuse'), `${a} is in view`);
    }
  }
});

test('Fog with two players: every move is the same tap, and picks and refusals give nothing at all', () => {
  const { session, tap, sounds, vibrations, animations } = rig({ variant: 'fog' });
  session.enter('two', 'fog');
  session.takeControl();
  const start = { s: sounds().length, v: vibrations.length, a: animations.length };
  tap(sq(6, 1)); // a piece with no move: refused, silently
  tap(sq(5, 2)); // picked up, silently
  assert.deepEqual([sounds().length, vibrations.length, animations.length], [start.s, start.v, start.a]);
  tap(sq(4, 3));
  assert.deepEqual(sounds().slice(start.s), ['piece-move']);
  assert.equal(animations.length, start.a, 'no square animated');
  session.takeControl();
  tap(sq(2, 5), sq(3, 4));
  assert.deepEqual(sounds().slice(start.s), ['piece-move', 'piece-move'], 'the other side\'s move sounds the same');
});

test('pausing holds feedback; restarting and leaving cancel what is queued and stop what plays', () => {
  const { session, tap, sounds, vibrations, feedback, clock, audio } = rig({ rows: CHAIN.rows });
  session.enter('two');
  tap(sq(6, 1), sq(4, 3), sq(2, 5));
  session.selectSquare(sq(0, 7)); // the multi-jump: its chirp is queued
  assert.equal(feedback.queuedCount, 1);
  session.restart();
  assert.equal(feedback.queuedCount, 0);
  clock.tick(1000);
  assert.ok(!sounds().includes('multi-sound'), 'the chirp never plays after Restart');
  assert.ok(audio.calls.includes('stop:crown-sound') && audio.calls.includes('stop:capture-sound'));
  assert.deepEqual(vibrations.at(-1), 0, 'a vibration in progress is stopped');

  session.pause('menu');
  const heard = sounds().length;
  feedback.cue('select', { key: 'probe' });
  assert.equal(sounds().length, heard, 'nothing while paused');
  session.resume('menu');
  tap(sq(6, 1));
  assert.equal(sounds().at(-1), 'select-sound');
  session.leave();
  assert.ok(audio.calls.at(-1).startsWith('stop:'));
});

test('Shells & Feathers: placements settle and sound; only a person\'s vibrate; a taken square refuses', () => {
  const clock = createFakeClock();
  const audio = createFakeAudio();
  const vibrations = [];
  const haptics = createHaptics({ nav: { vibrate: (p) => vibrations.push(p) }, doc: {}, clock, enabled: true });
  const animations = [];
  const feedback = createFeedback({ audio, haptics, clock });
  feedback.setAnimator('sf', { play: (motion, at) => animations.push(`${motion}@${at.index}`), clear: () => {} });
  const profile = createProfile(openStorage(() => createMemoryStorage()));
  const session = createShellsFeathers({
    view: createFakeView(), audio, profile, clock, feedback, rng: () => 0,
  });
  session.enter('single');
  session.selectCell(4);
  assert.deepEqual([audio.calls.at(-1), vibrations.at(-1), animations.at(-1)], ['sfx:player-select', 10, 'place@4']);
  clock.tick(SF_DELAYS.spiritMove);
  assert.equal(audio.calls.at(-1), 'sfx:opponent-select');
  assert.equal(vibrations.length, 1, 'the Spirit\'s placement doesn\'t vibrate');
  assert.match(animations.at(-1), /^place@/);
  session.selectCell(4);
  assert.deepEqual([audio.calls.at(-1), vibrations.at(-1), animations.at(-1)], ['sfx:invalid-sound', 8, 'refuse@4']);
});
