// The shared feedback service and optional haptics: what each cue plays,
// vibrates and animates; duplicates counted once; the queue, holds and
// cancelling; reduced motion; and vibration that is feature-detected,
// opt-in, short, rate limited and safe when the browser refuses or throws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHaptics, HAPTICS } from '../../src/shared/haptics.js';
import { createFeedback, CUES, DEDUPE_MS } from '../../src/shared/feedback.js';
import { createFakeClock, createFakeAudio } from '../helpers/fakes.mjs';

function fakeNavigator({ result = true, throws = false } = {}) {
  const calls = [];
  return {
    calls,
    vibrate(pattern) {
      calls.push(pattern);
      if (throws) throw new Error('blocked');
      return result;
    },
  };
}

function setup({ nav = fakeNavigator(), enabled = true, reduced = false } = {}) {
  const clock = createFakeClock();
  const audio = createFakeAudio();
  const haptics = createHaptics({ nav, doc: {}, clock, enabled });
  const animations = [];
  const feedback = createFeedback({ audio, haptics, clock, reducedMotion: () => reduced });
  feedback.setAnimator('al', { play: (motion, at) => animations.push([motion, at.square]), clear: () => animations.push(['clear']) });
  return { clock, audio, haptics, feedback, nav, animations };
}

test('haptics: no vibrate() means unsupported, and every pulse is a no-op', () => {
  const haptics = createHaptics({ nav: {}, doc: {}, enabled: true });
  assert.equal(haptics.supported, false);
  assert.equal(haptics.status, 'unsupported');
  assert.equal(haptics.pulse(10), false);
  haptics.cancel(); // safe
  const blockedByPolicy = createHaptics({ nav: fakeNavigator(), doc: { featurePolicy: { features: () => ['vibrate'], allowsFeature: () => false } }, enabled: true });
  assert.equal(blockedByPolicy.status, 'unsupported', 'a page the browser may not let vibrate');
  // Chromium lists no vibrate policy and says false to it: still supported.
  const chromium = createHaptics({ nav: fakeNavigator(), doc: { featurePolicy: { features: () => ['camera'], allowsFeature: () => false } }, enabled: true });
  assert.equal(chromium.status, 'on');
});

test('haptics: off until turned on; short patterns only; rate limited; per-kind gaps', () => {
  const nav = fakeNavigator();
  const clock = createFakeClock();
  const haptics = createHaptics({ nav, doc: {}, clock, enabled: false });
  assert.equal(haptics.status, 'off');
  assert.equal(haptics.pulse(10), false);
  assert.deepEqual(nav.calls, []);
  haptics.setEnabled(true);
  assert.equal(haptics.pulse(10), true);
  assert.equal(haptics.pulse(10), false, 'too soon after the last');
  clock.tick(HAPTICS.MIN_GAP_MS);
  assert.equal(haptics.pulse([60, 40, 70]), false, 'more than MAX_TOTAL_MS of vibration is never asked for');
  assert.equal(haptics.pulse([10, 40, 16]), true);
  clock.tick(HAPTICS.MIN_GAP_MS);
  assert.equal(haptics.pulse(8, { key: 'invalid', every: 900 }), true);
  clock.tick(HAPTICS.MIN_GAP_MS);
  assert.equal(haptics.pulse(8, { key: 'invalid', every: 900 }), false, 'a repeated refusal buzzes once');
  clock.tick(900);
  assert.equal(haptics.pulse(8, { key: 'invalid', every: 900 }), true);
  assert.deepEqual(nav.calls, [10, [10, 40, 16], 8, 8]);
  haptics.setEnabled(false);
  assert.deepEqual(nav.calls.at(-1), 0, 'turning it off stops a vibration in progress');
});

test('haptics: a refusal or an exception is caught and reported, never thrown', () => {
  const refused = createHaptics({ nav: fakeNavigator({ result: false }), doc: {}, enabled: true });
  assert.equal(refused.pulse(10), false);
  assert.equal(refused.status, 'refused');
  const throwing = createHaptics({ nav: fakeNavigator({ throws: true }), doc: {}, enabled: true });
  assert.doesNotThrow(() => throwing.pulse(10));
  assert.equal(throwing.status, 'refused');
  assert.doesNotThrow(() => throwing.cancel());
});

test('haptics: held (paused, hidden) means no vibration, and the current one stops', () => {
  const nav = fakeNavigator();
  const clock = createFakeClock();
  const haptics = createHaptics({ nav, doc: {}, clock, enabled: true });
  haptics.hold('menu');
  assert.deepEqual(nav.calls, [], 'nothing to stop: the browser isn\'t asked');
  haptics.release('menu');
  haptics.pulse(10);
  haptics.hold('menu');
  assert.deepEqual(nav.calls, [10, 0], 'right after a pulse it is stopped');
  clock.tick(HAPTICS.MIN_GAP_MS);
  assert.equal(haptics.pulse(10), false);
  haptics.release('menu');
  assert.equal(haptics.pulse(10), true);
});

test('feedback: each cue plays its sound, vibration and animation; the Spirit\'s moves are not felt', () => {
  const { feedback, audio, nav, animations, clock } = setup();
  feedback.cue('capture', { at: { game: 'al', square: 19 }, key: 1 });
  assert.deepEqual(audio.calls, ['sfx:capture-sound']);
  assert.deepEqual(nav.calls, [16]);
  assert.deepEqual(animations, [['capture', 19]]);
  clock.tick(200);
  feedback.cue('moveOther', { at: { game: 'al', square: 28 }, key: 2, felt: false });
  assert.equal(audio.calls.at(-1), 'sfx:piece-move-other');
  assert.deepEqual(nav.calls, [16], 'no vibration for the Spirit\'s move');
  assert.deepEqual(animations.at(-1), ['land', 28]);
  // Every cue's sound is one of the page's own effects.
  for (const [name, def] of Object.entries(CUES)) assert.match(def.sfx, /-(select|sound|move|other)$|^piece-move/, name);
});

test('feedback: the same event reported twice counts once; the next event plays', () => {
  const { feedback, audio, clock } = setup();
  assert.equal(feedback.cue('move', { key: 5 }), true);
  assert.equal(feedback.cue('move', { key: 5 }), false, 'a second listener for the same move');
  assert.deepEqual(audio.calls, ['sfx:piece-move']);
  assert.equal(feedback.cue('move', { key: 6 }), true, 'the next move');
  clock.tick(DEDUPE_MS);
  assert.equal(feedback.cue('move', { key: 6 }), true);
  assert.equal(audio.calls.length, 3);
});

test('feedback: rapid refusals rustle at most every 250 ms and buzz at most every 900 ms', () => {
  const { feedback, audio, nav, clock } = setup();
  for (let i = 0; i < 10; i++) {
    feedback.cue('invalid', { key: i });
    clock.tick(100);
  }
  assert.equal(audio.calls.filter((c) => c === 'sfx:invalid-sound').length, 4);
  assert.equal(nav.calls.length, 2);
});

test('feedback: queued parts wait their delay; cancel and hold drop them and stop what plays', () => {
  const { feedback, audio, nav, animations, clock } = setup();
  feedback.cue('capture', { key: 1 });
  feedback.cue('multi', { key: 1 });
  assert.equal(feedback.queuedCount, 1);
  clock.tick(CUES.multi.delay);
  assert.deepEqual(audio.calls, ['sfx:capture-sound', 'sfx:multi-sound']);

  feedback.cue('multi', { key: 2 });
  feedback.cancel();
  clock.tick(1000);
  assert.ok(!audio.calls.slice(2).includes('sfx:multi-sound'), 'cancelled before it played');
  assert.ok(audio.calls.includes('stop:capture-sound'), 'the effects it started are stopped');
  assert.equal(nav.calls.at(-1), 0, 'and any vibration');
  assert.deepEqual(animations.at(-1), ['clear']);

  feedback.hold('hidden');
  assert.equal(feedback.cue('win', { key: 1 }), false, 'nothing while held');
  feedback.release('hidden');
  assert.equal(feedback.cue('win', { key: 1 }), true);
  // A button click is not a match effect: leaving a match doesn't cut it off.
  feedback.cue('button');
  feedback.cancel();
  assert.ok(!audio.calls.includes('stop:button-select'));
});

test('feedback: reduced motion skips animations, but sounds and vibration still come', () => {
  const { feedback, audio, nav, animations } = setup({ reduced: true });
  feedback.cue('crown', { at: { game: 'al', square: 3 }, key: 1 });
  assert.deepEqual(animations, []);
  assert.deepEqual(audio.calls, ['sfx:crown-sound']);
  assert.deepEqual(nav.calls, [[10, 40, 16]]);
});

test('feedback: without haptics (unsupported) everything else still works', () => {
  const { feedback, audio, animations } = setup({ nav: {} });
  feedback.cue('place', { at: { game: 'al', square: 4 }, key: 4 });
  assert.deepEqual(audio.calls, ['sfx:player-select']);
  assert.deepEqual(animations, [['place', 4]]);
});
