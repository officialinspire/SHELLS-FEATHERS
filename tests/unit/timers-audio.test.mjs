// Timer scopes and music fades: the two places stale callbacks used to live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimerScope } from '../../src/shared/timers.js';
import { createAudio } from '../../src/shared/audio.js';
import { createFakeClock, createFakeAudioElement } from '../helpers/fakes.mjs';

test('dispose() cancels pending callbacks and ignores later ones', () => {
  const clock = createFakeClock();
  const scope = createTimerScope(clock);
  const fired = [];
  scope.after(100, () => fired.push('a'));
  scope.after(200, () => fired.push('b'));
  clock.tick(150);
  assert.deepEqual(fired, ['a']);
  assert.equal(scope.pendingCount, 1);

  scope.dispose();
  scope.after(10, () => fired.push('c'));
  clock.tick(1_000);
  assert.deepEqual(fired, ['a']);
  assert.equal(clock.pending, 0);
});

test('disposing one scope leaves another untouched', () => {
  const clock = createFakeClock();
  const oldMatch = createTimerScope(clock);
  const newMatch = createTimerScope(clock);
  const fired = [];
  oldMatch.after(800, () => fired.push('old'));
  newMatch.after(800, () => fired.push('new'));
  oldMatch.dispose();
  clock.tick(800);
  assert.deepEqual(fired, ['new']);
});

function setupAudio({ musicEnabled = true } = {}) {
  const clock = createFakeClock();
  const elements = { music: createFakeAudioElement(), victory: createFakeAudioElement(), click: createFakeAudioElement() };
  const doc = { getElementById: (id) => elements[id] ?? null };
  const audio = createAudio({ doc, clock, musicId: 'music', musicEnabled });
  return { clock, audio, music: elements.music, elements };
}

test('music fades in to 0.3 over one second', () => {
  const { clock, audio, music } = setupAudio();
  audio.startMusic();
  assert.equal(music.paused, false);
  assert.equal(music.volume, 0);
  clock.tick(500);
  assert.ok(music.volume > 0.1 && music.volume < 0.2, String(music.volume));
  clock.tick(500);
  assert.equal(music.volume, 0.3);
  assert.equal(clock.pending, 0, 'fade timer cleared');
});

test('restarting music during a fade-out keeps it playing (v1 left it paused)', () => {
  const { clock, audio, music } = setupAudio();
  audio.startMusic();
  clock.tick(1_000);
  audio.stopMusic(); // e.g. draw -> "Play Again"
  clock.tick(300);
  audio.startMusic(); // the 300ms music restart
  clock.tick(3_000);
  assert.equal(music.paused, false);
  assert.equal(music.volume, 0.3);
  assert.equal(clock.pending, 0);
});

test('turning music off and on quickly leaves it playing', () => {
  const { clock, audio, music } = setupAudio();
  audio.startMusic();
  clock.tick(1_000);
  audio.setMusicEnabled(false);
  clock.tick(200);
  audio.setMusicEnabled(true);
  clock.tick(3_000);
  assert.equal(music.paused, false);
  assert.equal(music.volume, 0.3);
});

test('stopMusic fades out and then pauses; startMusic while playing is a no-op', () => {
  const { clock, audio, music } = setupAudio();
  audio.startMusic();
  clock.tick(1_000);
  audio.startMusic();
  clock.tick(100);
  assert.equal(music.volume, 0.3, 'no dip back to 0');
  audio.stopMusic();
  clock.tick(1_000);
  assert.equal(music.paused, true);
  assert.equal(music.volume, 0);
});

test('music stays off while disabled; sound effects respect their toggle', () => {
  const { clock, audio, music, elements } = setupAudio({ musicEnabled: false });
  audio.startMusic();
  clock.tick(1_000);
  assert.equal(music.paused, true);

  audio.playSfx('click');
  assert.equal(elements.click.paused, false);
  assert.equal(elements.click.volume, 0.5);
  elements.click.pause();
  audio.setSfxEnabled(false);
  audio.playSfx('click');
  assert.equal(elements.click.paused, true);
});

test('stopSfx stops and rewinds a playing effect', () => {
  const { audio, elements } = setupAudio();
  audio.playSfx('victory');
  elements.victory.currentTime = 12;
  audio.stopSfx('victory');
  assert.equal(elements.victory.paused, true);
  assert.equal(elements.victory.currentTime, 0);
});
