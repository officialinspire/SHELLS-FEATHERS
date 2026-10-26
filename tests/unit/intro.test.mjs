// The INSPIRE intro and the start screen (adapted from Bird Mahjong's intro
// tests): once per browser session, it ends exactly once whatever happens,
// Skip is ignored right after the start tap, errors, refusals, stalls and a
// hidden page never trap the player, and the start screen leads to the game
// with or without it.
import { test } from 'node:test';
/* global EventTarget, Event */
import assert from 'node:assert/strict';
import {
  createIntro, GUARD_MS, MAX_MS, STALL_MS, INTRO_SEEN_KEY,
} from '../../src/app/intro.js';
import { createStartGate, INTRO_SRC } from '../../src/app/start-gate.js';

class FakeVideo extends EventTarget {
  constructor(playResult = () => Promise.resolve()) {
    super();
    this.paused = true;
    this.muted = false;
    this.volume = 1;
    this.currentTime = 0;
    this.attrs = {};
    this.plays = [];
    this.playResult = playResult;
  }

  getAttribute(name) { return this.attrs[name] ?? null; }

  setAttribute(name, value) { this.attrs[name] = value; }

  play() {
    this.plays.push(this.muted);
    this.paused = false;
    return this.playResult(this);
  }

  pause() { this.paused = true; }
}

function fakeTime() {
  let clock = 1000;
  let id = 0;
  const pending = new Map();
  return {
    now: () => clock,
    timers: {
      setTimeout: (fn, ms) => { pending.set(++id, { fn, at: clock + ms }); return id; },
      clearTimeout: (t) => pending.delete(t),
    },
    advance(ms) {
      clock += ms;
      for (const [t, { fn, at }] of [...pending]) {
        if (at <= clock) {
          pending.delete(t);
          fn();
        }
      }
    },
    get pending() { return pending.size; },
  };
}

function setup({ playResult, store = new Map() } = {}) {
  const time = fakeTime();
  const video = new FakeVideo(playResult);
  const skipButton = new EventTarget();
  const done = [];
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const intro = createIntro({
    video, skipButton, src: INTRO_SRC, onDone: (r) => done.push(r), now: time.now, timers: time.timers, store: storage,
  });
  return {
    intro, video, skipButton, done, store, ...time, advance: time.advance,
  };
}

const flush = () => new Promise((resolve) => { setImmediate(resolve); });

test('once per browser session: counted as soon as it starts, so a reload never replays it', () => {
  const store = new Map();
  const a = setup({ store });
  assert.equal(a.intro.pending(), true);
  assert.equal(a.video.getAttribute('src'), null, 'not fetched before it is needed');
  assert.equal(a.intro.play(), true);
  assert.equal(a.video.getAttribute('src'), 'inspiresoftwareintro.mp4');
  assert.equal(store.get(INTRO_SEEN_KEY), '1');
  const b = setup({ store });
  assert.equal(b.intro.pending(), false);
  assert.equal(b.intro.play(), false);
  // Storage blocked: remembered for this page.
  const blocked = createIntro({
    video: new FakeVideo(), skipButton: new EventTarget(), src: INTRO_SRC, onDone: () => {}, store: null, timers: fakeTime().timers,
  });
  blocked.play();
  assert.equal(blocked.pending(), false);
});

test('it ends exactly once, whatever happens after', () => {
  const { intro, video, done, advance } = setup();
  intro.play({ volume: 0.3 });
  assert.equal(video.volume, 0.3, 'at the music volume');
  video.dispatchEvent(new Event('ended'));
  video.dispatchEvent(new Event('error'));
  advance(MAX_MS);
  assert.deepEqual(done, ['ended']);
  assert.equal(video.paused, true);
});

test('Skip is ignored right after the start tap, then works', () => {
  const { intro, skipButton, done, advance } = setup();
  intro.play();
  skipButton.dispatchEvent(new Event('click'));
  assert.equal(intro.skip(), false);
  assert.deepEqual(done, []);
  advance(GUARD_MS);
  skipButton.dispatchEvent(new Event('click'));
  assert.deepEqual(done, ['skipped']);
});

test('an error, a refusal, a stall, a hidden page or the time limit never trap the player', async () => {
  let s = setup();
  s.intro.play();
  s.video.dispatchEvent(new Event('error'));
  assert.deepEqual(s.done, ['error']);

  s = setup({ playResult: () => Promise.reject(Object.assign(new Error('no'), { name: 'NotSupportedError' })) });
  s.intro.play();
  await flush();
  assert.deepEqual(s.done, ['failed']);

  // Sound refused: tried again silently, and it plays.
  s = setup({ playResult: (v) => (v.muted ? Promise.resolve() : Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }))) });
  s.intro.play();
  await flush();
  assert.deepEqual(s.video.plays, [false, true]);
  assert.deepEqual(s.done, []);

  s = setup();
  s.intro.play();
  s.advance(STALL_MS);
  assert.deepEqual(s.done, ['stalled'], 'nothing playing yet');

  s = setup();
  s.intro.play();
  s.video.currentTime = 1;
  s.advance(STALL_MS);
  assert.deepEqual(s.done, [], 'playing: not a stall');
  s.advance(MAX_MS);
  assert.deepEqual(s.done, ['timeout']);

  s = setup();
  s.intro.play();
  s.intro.finish('hidden');
  assert.deepEqual(s.done, ['hidden']);
  assert.equal(s.pending, 0, 'no timer left behind');
});

// ------------------------------------------------------------ start gate

function fakePage() {
  const listeners = {};
  const el = (extra = {}) => Object.assign(new EventTarget(), {
    hidden: false, inert: false, focus() { this.focused = true; }, ...extra,
  });
  const nodes = {
    'start-gate': el(),
    'intro-gate': el({ hidden: true }),
    'game-container': el(),
    'start-button': el(),
    'intro-skip': el(),
    'intro-video': new FakeVideo(),
  };
  const doc = {
    hidden: false,
    documentElement: { dataset: {} },
    getElementById: (id) => nodes[id],
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    key(key, extra = {}) {
      const event = {
        key, repeat: false, preventDefault() {}, stopPropagation() {}, ...extra,
      };
      for (const fn of listeners.keydown ?? []) fn(event);
    },
    hide() {
      doc.hidden = true;
      for (const fn of listeners.visibilitychange ?? []) fn();
    },
  };
  return { doc, nodes, win: { requestAnimationFrame: (fn) => fn() } };
}

test('the start screen: the page behind waits; the first tap opens the intro, its end the game', () => {
  const { doc, nodes, win } = fakePage();
  const time = fakeTime();
  const store = new Map();
  let ready = 0;
  const gate = createStartGate({
    doc, win, onReady: () => { ready += 1; }, introOptions: () => ({ muted: true, volume: 0.3 }),
    introDeps: { now: time.now, timers: time.timers, store: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } },
  });
  gate.show();
  assert.equal(nodes['game-container'].inert, true);
  assert.equal(nodes['start-button'].focused, true);
  doc.key('Tab');
  doc.key('r', { ctrlKey: true });
  assert.equal(gate.state, 'start', 'Tab and shortcuts are not a start');
  nodes['start-gate'].dispatchEvent(new Event('click'));
  assert.equal(gate.state, 'intro');
  assert.equal(nodes['intro-gate'].hidden, false);
  assert.deepEqual(nodes['intro-video'].plays, [true], 'muted with music off');
  assert.equal(ready, 0, 'no music under the intro');
  doc.key('Enter');
  assert.equal(gate.state, 'intro', 'the start key can\'t also skip it');
  time.advance(GUARD_MS);
  doc.key('Escape');
  assert.equal(gate.state, 'ready');
  assert.equal(ready, 1);
  assert.equal(nodes['game-container'].inert, false);
  assert.equal(nodes['intro-gate'].hidden, true);

  // The next load this session: the start screen, then straight to the game.
  const next = fakePage();
  let readyAgain = 0;
  const again = createStartGate({
    doc: next.doc, win: next.win, onReady: () => { readyAgain += 1; },
    introDeps: { now: time.now, timers: time.timers, store: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } },
  });
  again.show();
  next.doc.key('a');
  assert.equal(again.state, 'ready');
  assert.equal(readyAgain, 1);
  assert.deepEqual(next.nodes['intro-video'].plays, []);
});

test('the start screen: a page hidden during the intro goes on to the game', () => {
  const { doc, win } = fakePage();
  const time = fakeTime();
  let ready = 0;
  const gate = createStartGate({
    doc, win, onReady: () => { ready += 1; }, introDeps: { now: time.now, timers: time.timers, store: null },
  });
  gate.show();
  gate.start();
  doc.hide();
  assert.equal(gate.state, 'ready');
  assert.equal(ready, 1);
});
