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

test('pause() holds pending callbacks with the time they had left; resume() runs them on from there', () => {
  const clock = createFakeClock();
  const scope = createTimerScope(clock);
  const fired = [];
  scope.after(500, () => fired.push('spirit'));
  clock.tick(300);
  scope.pause();
  scope.after(100, () => fired.push('added while paused'));
  clock.tick(5_000);
  assert.deepEqual(fired, [], 'nothing fires while paused');
  assert.equal(scope.pendingCount, 2);
  assert.equal(clock.pending, 0, 'no timers run while paused');
  scope.resume();
  clock.tick(99);
  assert.deepEqual(fired, []);
  clock.tick(1);
  assert.deepEqual(fired, ['added while paused']);
  clock.tick(100);
  assert.deepEqual(fired, ['added while paused', 'spirit'], 'the 200ms the Spirit had left');

  scope.pause();
  scope.after(10, () => fired.push('late'));
  scope.dispose();
  scope.resume();
  clock.tick(1_000);
  assert.equal(fired.length, 2, 'dispose() drops held callbacks too');
});

// Settles pending promise callbacks (play() refusals are asynchronous).
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setupAudio({ musicEnabled = true, unlocked = true, ...options } = {}) {
  const clock = createFakeClock();
  const elements = { music: createFakeAudioElement(), victory: createFakeAudioElement(), click: createFakeAudioElement() };
  const doc = { getElementById: (id) => elements[id] ?? null };
  const audio = createAudio({ doc, clock, musicId: 'music', musicEnabled, ...options });
  if (unlocked) audio.unlock();
  return { clock, audio, music: elements.music, elements };
}

test('nothing plays before the first user gesture; music asked for earlier starts then', () => {
  const { clock, audio, music, elements } = setupAudio({ unlocked: false });
  audio.startMusic();
  audio.playSfx('click');
  clock.tick(2_000);
  assert.equal(music.plays + elements.click.plays, 0, 'play() never called');
  assert.equal(clock.pending, 0, 'no fade running either');
  audio.unlock();
  assert.equal(music.paused, false);
  clock.tick(1_000);
  assert.equal(music.volume, 0.3);
  audio.unlock(); // later gestures change nothing
  assert.equal(music.plays, 1);
});

test('music asked to stop before the first gesture stays off after it', () => {
  const { audio, music } = setupAudio({ unlocked: false });
  audio.startMusic();
  audio.stopMusic(); // e.g. a result before the player ever tapped
  audio.unlock();
  assert.equal(music.plays, 0);
});

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

test('overlapping fades: rapid start/stop/mute changes never run two fades at once and end where the last call says', () => {
  const { clock, audio, music } = setupAudio();
  const calls = [
    () => audio.startMusic(), () => audio.stopMusic(), () => audio.setMusicEnabled(false),
    () => audio.setMusicEnabled(true), () => audio.setMusicVolume(80), () => audio.stopMusic(), () => audio.startMusic(),
  ];
  for (let round = 0; round < 40; round++) {
    calls[(round * 5) % calls.length]();
    assert.ok(clock.pending <= 1, `${clock.pending} fades at once`);
    clock.tick(70);
  }
  audio.startMusic();
  clock.tick(3_000);
  assert.equal(music.paused, false);
  assert.equal(music.volume, 0.8);
  assert.equal(clock.pending, 0);
  audio.stopMusic();
  clock.tick(3_000);
  assert.equal(music.paused, true);
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

test('music stays off while disabled; sound effects respect their toggle and volume', () => {
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
  audio.setSfxEnabled(true);
  audio.setSfxVolume(20);
  audio.playSfx('click');
  assert.equal(elements.click.volume, 0.2);
  elements.click.pause();
  audio.setSfxVolume(0);
  audio.playSfx('click');
  assert.equal(elements.click.paused, true, 'volume 0 plays nothing');
});

test('turning effects off, or their volume to 0, stops one already playing (the victory theme is long)', () => {
  const { audio, elements } = setupAudio();
  audio.playSfx('victory');
  audio.setSfxVolume(70);
  assert.equal(elements.victory.volume, 0.7, 'a playing effect follows the volume');
  audio.setSfxEnabled(false);
  assert.equal(elements.victory.paused, true);
  assert.equal(elements.victory.currentTime, 0);
  audio.setSfxEnabled(true);
  audio.playSfx('victory');
  audio.setSfxVolume(0);
  assert.equal(elements.victory.paused, true);
  audio.setSfxVolume(50);
  audio.playSfx('victory');
  audio.stopEffects();
  assert.equal(elements.victory.paused, true);
});

test('music volume: set at once while playing, retargets a fade-in, 0 pauses, and coming back from 0 fades in', () => {
  const { clock, audio, music } = setupAudio({ musicVolume: 60 });
  audio.startMusic();
  clock.tick(400);
  audio.setMusicVolume(40); // mid fade-in
  clock.tick(2_000);
  assert.equal(music.volume, 0.4);
  audio.setMusicVolume(90);
  assert.equal(music.volume, 0.9, 'no fade needed while steady');
  audio.setMusicVolume(0);
  assert.equal(music.paused, true);
  assert.equal(clock.pending, 0);
  audio.setMusicVolume(25);
  assert.equal(music.paused, false);
  clock.tick(2_000);
  assert.equal(music.volume, 0.25);
  // Volume 0 while the game wants no music changes nothing; neither does a
  // new volume.
  audio.stopMusic();
  clock.tick(2_000);
  audio.setMusicVolume(50);
  assert.equal(music.paused, true);
});

test('a refused play() (no user gesture yet) locks sound again; the next gesture retries the music', async () => {
  const { clock, audio, music } = setupAudio();
  music.refuse('NotAllowedError');
  audio.startMusic();
  await flush();
  assert.equal(audio.unlocked, false);
  assert.equal(clock.pending, 0, 'the fade-in was cancelled');
  assert.equal(music.volume, 0);
  audio.unlock();
  clock.tick(1_000);
  assert.equal(music.paused, false);
  assert.equal(music.volume, 0.3);
  assert.equal(music.plays, 2);
});

test('an AbortError (pause() overtaking play()) is expected and ignored', async () => {
  const { clock, audio, music } = setupAudio();
  const pending = music.hold();
  audio.startMusic();
  audio.stopMusic();
  clock.tick(1_000);
  pending.reject('AbortError');
  await flush();
  assert.equal(audio.unlocked, true, 'still unlocked');
  audio.startMusic();
  clock.tick(1_000);
  assert.equal(music.volume, 0.3);
});

test('a late refusal cannot undo a newer request', async () => {
  const { clock, audio, music } = setupAudio();
  const first = music.hold();
  audio.startMusic();
  audio.stopMusic();
  clock.tick(1_000); // faded out and paused
  audio.startMusic(); // a new play() that succeeds
  first.reject('NotAllowedError'); // the old request's refusal arrives late
  await flush();
  assert.equal(audio.unlocked, true);
  clock.tick(1_000);
  assert.equal(music.paused, false);
  assert.equal(music.volume, 0.3);
});

test('play() that throws, or returns nothing (older browsers), is handled', async () => {
  const { audio, elements } = setupAudio();
  elements.click.play = () => { throw Object.assign(new Error('x'), { name: 'NotSupportedError' }); };
  assert.doesNotThrow(() => audio.playSfx('click'));
  elements.click.play = function play() { this.paused = false; return undefined; };
  assert.doesNotThrow(() => audio.playSfx('click'));
  assert.equal(elements.click.paused, false);
  await flush();
  assert.equal(audio.unlocked, true, 'NotSupportedError is not a missing gesture');
});

test('a refused effect locks sound until the next gesture', async () => {
  const { audio, elements } = setupAudio();
  elements.click.refuse('NotAllowedError');
  audio.playSfx('click');
  await flush();
  assert.equal(audio.unlocked, false);
  audio.playSfx('click');
  assert.equal(elements.click.plays, 1, 'not retried until a gesture');
  audio.unlock();
  audio.playSfx('click');
  assert.equal(elements.click.plays, 2);
});

test('a hidden page pauses the music at once; showing it again fades back in only if music is still wanted', () => {
  const { clock, audio, music } = setupAudio();
  audio.startMusic();
  clock.tick(1_000);
  audio.suspend();
  assert.equal(music.paused, true);
  assert.equal(clock.pending, 0);
  audio.startMusic(); // a game asking for music while hidden waits
  assert.equal(music.paused, true);
  audio.resume();
  clock.tick(1_000);
  assert.equal(music.volume, 0.3);
  audio.suspend();
  audio.stopMusic(); // e.g. a result while hidden
  audio.resume();
  assert.equal(music.paused, true);
});

test('stopSfx stops and rewinds a playing effect', () => {
  const { audio, elements } = setupAudio();
  audio.playSfx('victory');
  elements.victory.currentTime = 12;
  audio.stopSfx('victory');
  assert.equal(elements.victory.paused, true);
  assert.equal(elements.victory.currentTime, 0);
});
