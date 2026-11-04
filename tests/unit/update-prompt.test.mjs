// The page's side of an update (src/app/update-prompt.js), against fake
// service-worker objects: no prompt on a first install; Reload or Later for
// an installation that has a release waiting (found at startup or later);
// Later keeps going and the hub offers it again; Reload waits for a half-made
// move, saves, hands over to the waiting worker and refreshes exactly once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUpdatePrompt, UPDATE } from '../../src/app/update-prompt.js';

class Emitter {
  constructor() { this.listeners = {}; }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  emit(type) { for (const fn of this.listeners[type] ?? []) fn({ type }); }
}

class Worker extends Emitter {
  constructor(state) {
    super();
    this.state = state;
    this.messages = [];
  }

  postMessage(message) { this.messages.push(message); }

  become(state) {
    this.state = state;
    this.emit('statechange');
  }
}

function setup({
  controller = null, active = null, waiting = null, installing = null, busy = () => false,
} = {}) {
  const el = (extra = {}) => ({
    hidden: true, dataset: {}, disabled: false, textContent: '', ...extra,
  });
  const reloadButton = el();
  const laterButton = el();
  const rows = [el(), el()];
  const banner = el({
    offsetHeight: 64,
    offsetTop: 8,
    querySelectorAll: () => [reloadButton, laterButton],
    querySelector: () => reloadButton,
    contains: (node) => node === reloadButton || node === laterButton,
  });
  const text = el();
  const root = {
    classes: new Set(),
    style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
    classList: { toggle(name, on) { if (on) root.classes.add(name); else root.classes.delete(name); } },
  };
  const doc = new Emitter();
  Object.assign(doc, {
    readyState: 'complete',
    hidden: false,
    activeElement: null,
    documentElement: root,
    getElementById: (id) => ({ 'update-banner': banner, 'update-banner-text': text })[id],
    querySelectorAll: () => rows,
  });
  const reg = new Emitter();
  Object.assign(reg, {
    active, waiting, installing, updates: 0, update() { this.updates += 1; return Promise.resolve(); },
  });
  const sw = new Emitter();
  Object.assign(sw, {
    controller,
    registered: [],
    register(url, options) { this.registered.push([url, options]); return Promise.resolve(reg); },
  });
  const timers = [];
  const clock = {
    setTimeout(fn, ms) { timers.push({ fn, ms, once: true }); return timers.length; },
    setInterval(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    clearInterval(id) { if (timers[id - 1]) timers[id - 1].cleared = true; },
    // Runs every timer due within `ms` (intervals as often as they fit).
    run(ms) {
      for (const timer of [...timers]) {
        if (timer.cleared) continue;
        const times = timer.once ? Number(timer.ms <= ms) : Math.floor(ms / timer.ms);
        for (let i = 0; i < times && !timer.cleared; i++) timer.fn();
        if (timer.once && times) timer.cleared = true;
      }
    },
  };
  const log = [];
  const win = {
    isSecureContext: true,
    location: { reload: () => log.push('reload') },
    addEventListener() {},
  };
  const prompt = createUpdatePrompt({
    doc,
    win,
    sw,
    clock,
    busy,
    beforeReload: () => log.push('saved'),
    onLaterFocus: () => log.push('focus'),
  });
  return {
    prompt, banner, text, rows, root, doc, reg, sw, clock, log, reloadButton,
  };
}

test('first install: no prompt, and its taking control is not an update', async () => {
  const installing = new Worker('installing');
  const t = setup({ installing });
  await t.prompt.register();
  assert.deepEqual(t.sw.registered, [['./sw.js', { updateViaCache: 'none' }]]);
  installing.become('installed'); // no active release: a first install
  installing.become('activated');
  t.sw.emit('controllerchange'); // clients.claim()
  assert.equal(t.prompt.state, 'none');
  assert.equal(t.banner.hidden, true);
  assert.ok(t.rows.every((row) => row.hidden));
  assert.deepEqual(t.log, []);
});

test('no registration where service workers cannot run', async () => {
  const t = setup();
  const insecure = createUpdatePrompt({
    doc: t.doc, win: { isSecureContext: false }, sw: t.sw, clock: t.clock,
  });
  assert.equal(await insecure.register(), null);
  const none = createUpdatePrompt({ doc: t.doc, win: { isSecureContext: true }, sw: undefined });
  assert.equal(await none.register(), null);
  assert.deepEqual(t.sw.registered, []);
});

test('an update already waiting at startup is offered; Later keeps going; the hub offers it again', async () => {
  const waiting = new Worker('installed');
  const t = setup({ controller: {}, active: new Worker('activated'), waiting });
  await t.prompt.register();
  assert.equal(t.prompt.state, 'offered');
  assert.equal(t.banner.hidden, false);
  assert.match(t.text.textContent, /update is ready/i);
  assert.ok(t.root.classes.has('has-update'));
  assert.equal(t.root.style.props['--update-room'], '72px', 'room kept for the banner');
  assert.ok(t.rows.every((row) => !row.hidden), 'the match menus offer it too');
  t.doc.activeElement = t.reloadButton;
  t.prompt.later();
  assert.equal(t.prompt.state, 'declined');
  assert.equal(t.banner.hidden, true);
  assert.equal(t.root.style.props['--update-room'], '0px');
  assert.ok(!t.root.classes.has('has-update'));
  assert.ok(t.rows.every((row) => !row.hidden), 'still in the match menus');
  assert.deepEqual(t.log, ['focus'], 'nothing saved or reloaded; focus back on the screen');
  assert.deepEqual(waiting.messages, []);
  t.prompt.hubShown();
  assert.equal(t.prompt.state, 'offered');
  assert.equal(t.banner.hidden, false);
});

test('an update found while playing is offered once installed', async () => {
  const t = setup({ controller: {}, active: new Worker('activated') });
  await t.prompt.register();
  assert.equal(t.prompt.state, 'none');
  const next = new Worker('installing');
  t.reg.installing = next;
  t.reg.emit('updatefound');
  assert.equal(t.prompt.state, 'none', 'not while it installs');
  next.become('installed');
  assert.equal(t.prompt.state, 'offered');
});

test('Reload: saves, hands over to the waiting worker, refreshes once on controllerchange', async () => {
  const waiting = new Worker('installed');
  const t = setup({ controller: {}, active: new Worker('activated'), waiting });
  await t.prompt.register();
  t.prompt.reload();
  assert.equal(t.prompt.state, 'reloading');
  assert.deepEqual(t.log, ['saved']);
  assert.deepEqual(waiting.messages, [{ type: 'SKIP_WAITING' }]);
  assert.ok(t.reloadButton.disabled);
  t.sw.emit('controllerchange');
  t.sw.emit('controllerchange');
  t.clock.run(UPDATE.FALLBACK_MS);
  t.prompt.reload();
  assert.deepEqual(t.log, ['saved', 'reload'], 'one refresh, however many signals');
});

test('Reload: if the worker never takes over, one fallback refresh', async () => {
  const waiting = new Worker('installed');
  const t = setup({ controller: {}, active: new Worker('activated'), waiting });
  await t.prompt.register();
  t.prompt.reload();
  t.clock.run(UPDATE.FALLBACK_MS - 1);
  assert.deepEqual(t.log, ['saved']);
  t.clock.run(UPDATE.FALLBACK_MS);
  t.clock.run(UPDATE.FALLBACK_MS);
  assert.deepEqual(t.log, ['saved', 'reload']);
});

test('Reload waits for a half-made move to end; Later cancels the wait', async () => {
  let midMove = true;
  const waiting = new Worker('installed');
  const t = setup({
    controller: {}, active: new Worker('activated'), waiting, busy: () => midMove,
  });
  await t.prompt.register();
  assert.equal(t.prompt.reload(), 'after-move');
  assert.match(t.text.textContent, /when this move ends/);
  t.clock.run(UPDATE.POLL_MS * 5);
  assert.deepEqual(t.log, [], 'nothing saved or refreshed mid-move');
  assert.deepEqual(waiting.messages, []);
  midMove = false;
  t.clock.run(UPDATE.POLL_MS);
  assert.deepEqual(t.log, ['saved']);
  assert.deepEqual(waiting.messages, [{ type: 'SKIP_WAITING' }]);

  const u = setup({
    controller: {}, active: new Worker('activated'), waiting: new Worker('installed'), busy: () => true,
  });
  await u.prompt.register();
  u.prompt.reload();
  u.prompt.later();
  u.clock.run(UPDATE.POLL_MS * 5);
  assert.equal(u.prompt.state, 'declined');
  assert.deepEqual(u.log, []);
});

test('another tab took the update: offered here too, and Reload just refreshes', async () => {
  const t = setup({ controller: {}, active: new Worker('activated') });
  await t.prompt.register();
  t.sw.emit('controllerchange');
  assert.equal(t.prompt.state, 'offered');
  t.prompt.reload();
  assert.deepEqual(t.log, ['saved', 'reload']);
});

test('a long session checks for a new release when it comes back into view', async () => {
  const t = setup({ controller: {}, active: new Worker('activated') });
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    await t.prompt.register();
    t.doc.emit('visibilitychange');
    assert.equal(t.reg.updates, 0, 'not straight away');
    now += UPDATE.CHECK_EVERY_MS + 1;
    t.doc.emit('visibilitychange');
    t.doc.emit('visibilitychange');
    assert.equal(t.reg.updates, 1);
  } finally {
    Date.now = realNow;
  }
});
