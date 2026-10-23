// Hash routing and board keyboard movement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, pathFromHash, resolveRoute, createRouter, documentTitle } from '../../src/app/router.js';
import { nextCellIndex } from '../../src/games/shells-feathers/view.js';

// A window with just enough history for the router. back() fires popstate
// synchronously (browsers do it a moment later).
function createFakeWindow(initialHash = '') {
  const listeners = {};
  const entries = [{ hash: initialHash, state: null }];
  let index = 0;
  const fire = (type) => (listeners[type] ?? []).forEach((fn) => fn());
  return {
    entries,
    get index() { return index; },
    location: { get hash() { return entries[index].hash; } },
    history: {
      get state() { return entries[index].state; },
      pushState(state, _title, url) {
        entries.splice(index + 1);
        entries.push({ hash: url, state });
        index++;
      },
      replaceState(state, _title, url) { entries[index] = { hash: url, state }; },
      back() {
        if (index === 0) return;
        index--;
        fire('popstate');
        fire('hashchange');
      },
    },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    typeUrl(hash) {
      entries.splice(index + 1);
      entries.push({ hash, state: null });
      index++;
      fire('popstate');
      fire('hashchange');
    },
  };
}

function setup(initialHash) {
  const win = createFakeWindow(initialHash);
  const shown = [];
  const router = createRouter({ win, onChange: (route, path) => shown.push(path) });
  router.start();
  return { win, router, shown };
}

test('pathFromHash normalizes hashes; anything else is the hub', () => {
  const cases = [
    ['', '/'], ['#', '/'], ['#/', '/'], ['#/settings', '/settings'], ['#/settings/', '/settings'],
    ['#/shells-feathers/play/two', '/shells-feathers/play/two'], ['#main', '/'], ['#settings', '/'],
  ];
  for (const [hash, path] of cases) assert.equal(pathFromHash(hash), path, hash);
});

test('resolveRoute follows redirects and sends unknown paths to the hub', () => {
  assert.deepEqual(resolveRoute('/settings'), { path: '/settings', route: ROUTES['/settings'], redirected: false });
  assert.equal(resolveRoute('/acorns-leaves').path, '/acorns-leaves/how-to-play');
  assert.equal(resolveRoute('/acorns-leaves').redirected, true);
  for (const unknown of ['/nope', '/acorns-leaves/play', '/shells-feathers/play/three']) {
    assert.deepEqual(resolveRoute(unknown), { path: '/', route: ROUTES['/'], redirected: true }, unknown);
  }
});

test('every route names an existing kind of screen; only Shells & Feathers has play routes', () => {
  const playRoutes = Object.keys(ROUTES).filter((p) => p.includes('/play'));
  assert.deepEqual(playRoutes, ['/shells-feathers/play/single', '/shells-feathers/play/two']);
  for (const [path, route] of Object.entries(ROUTES)) {
    assert.ok(route.redirect || (route.screen && route.title), path);
  }
  assert.equal(documentTitle(ROUTES['/']), 'Spirit of the Woods');
  assert.equal(documentTitle(ROUTES['/settings']), 'Settings · Spirit of the Woods');
});

test('start() shows the current URL; unknown and redirected URLs are rewritten in place', () => {
  assert.deepEqual(setup('').shown, ['/']);
  assert.deepEqual(setup('#/your-path').shown, ['/your-path']);

  const unknown = setup('#/nope');
  assert.deepEqual(unknown.shown, ['/']);
  assert.equal(unknown.win.location.hash, '#/');
  assert.equal(unknown.win.entries.length, 1, 'replaced, not pushed');

  const alias = setup('#/acorns-leaves');
  assert.deepEqual(alias.shown, ['/acorns-leaves/how-to-play']);
  assert.equal(alias.win.location.hash, '#/acorns-leaves/how-to-play');
});

test('go() adds a history entry that remembers where it came from; going to the same place is a no-op', () => {
  const { win, router, shown } = setup('');
  router.go('/shells-feathers');
  router.go('/shells-feathers/play/two');
  router.go('/shells-feathers/play/two');
  assert.deepEqual(shown, ['/', '/shells-feathers', '/shells-feathers/play/two']);
  assert.equal(win.entries.length, 3);
  assert.equal(win.history.state.prev, '/shells-feathers');
});

test('up() steps back when the parent is the previous entry, otherwise opens it', () => {
  const { win, router, shown } = setup('');
  router.go('/shells-feathers');
  router.go('/shells-feathers/play/single');
  router.up('/shells-feathers'); // "Change Mode"
  assert.equal(win.index, 1, 'went back instead of adding an entry');
  assert.equal(win.entries.length, 3, 'Forward still leads to the match');
  router.up('/'); // "All games": the hub is the previous entry
  assert.equal(win.index, 0);
  assert.deepEqual(shown, ['/', '/shells-feathers', '/shells-feathers/play/single', '/shells-feathers', '/']);

  // Deep link straight into a match: there is no previous entry, so up() pushes.
  const deep = setup('#/shells-feathers/play/two');
  deep.router.up('/shells-feathers');
  assert.equal(deep.win.entries.length, 2);
  assert.deepEqual(deep.shown, ['/shells-feathers/play/two', '/shells-feathers']);
});

test('back() returns to the previous screen of this visit, or the fallback on a fresh visit', () => {
  const { win, router, shown } = setup('');
  router.go('/shells-feathers');
  router.go('/shells-feathers/how-to-play');
  router.back('/');
  assert.equal(shown.at(-1), '/shells-feathers');
  assert.equal(win.index, 1);

  const fresh = setup('#/settings');
  fresh.router.back('/');
  assert.deepEqual(fresh.shown, ['/settings', '/']);
});

test('browser Back/Forward and typed URLs are followed', () => {
  const { win, router, shown } = setup('');
  router.go('/settings');
  win.history.back();
  win.typeUrl('#/your-path');
  win.typeUrl('#/your-path/');
  assert.deepEqual(shown, ['/', '/settings', '/', '/your-path']);
});

test('arrow keys move around the 3×3 board and stop at the edges', () => {
  const moves = [
    [0, 'ArrowRight', 1], [0, 'ArrowDown', 3], [0, 'ArrowLeft', 0], [0, 'ArrowUp', 0],
    [4, 'ArrowUp', 1], [4, 'ArrowDown', 7], [4, 'ArrowLeft', 3], [4, 'ArrowRight', 5],
    [8, 'ArrowRight', 8], [8, 'ArrowDown', 8], [5, 'Home', 3], [3, 'End', 5],
  ];
  for (const [from, key, to] of moves) assert.equal(nextCellIndex(from, key), to, `${from} ${key}`);
  assert.equal(nextCellIndex(4, 'Enter'), null);
  assert.equal(nextCellIndex(4, 'a'), null);
});
