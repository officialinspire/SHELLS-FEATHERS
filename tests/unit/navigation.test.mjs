// Hash routing and keyboard movement on both boards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, pathFromHash, resolveRoute, createRouter, documentTitle } from '../../src/app/router.js';
import { nextCellIndex } from '../../src/games/shells-feathers/view.js';
import { nextSquare, squareLabel } from '../../src/games/acorns-leaves/view.js';
import { squareAt } from '../../src/games/acorns-leaves/engine.js';

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

test('resolveRoute keeps known paths and sends unknown ones to the hub', () => {
  assert.deepEqual(resolveRoute('/settings'), { path: '/settings', route: ROUTES['/settings'], redirected: false });
  assert.deepEqual(resolveRoute('/acorns-leaves'), { path: '/acorns-leaves', route: ROUTES['/acorns-leaves'], redirected: false });
  assert.equal(ROUTES['/acorns-leaves'].screen, 'al-setup-screen');
  for (const unknown of ['/nope', '/acorns-leaves/play', '/shells-feathers/play/three', '/acorns-leaves/play/three']) {
    assert.deepEqual(resolveRoute(unknown), { path: '/', route: ROUTES['/'], redirected: true }, unknown);
  }
});

test('every route names a screen and a title; both games have a play route per mode', () => {
  const playRoutes = Object.keys(ROUTES).filter((p) => p.includes('/play'));
  assert.deepEqual(playRoutes, [
    '/shells-feathers/play/single', '/shells-feathers/play/two', '/acorns-leaves/play/single', '/acorns-leaves/play/two',
  ]);
  for (const path of playRoutes) assert.deepEqual(ROUTES[path].args, [path.endsWith('single') ? 'single' : 'two'], path);
  for (const [path, route] of Object.entries(ROUTES)) {
    assert.ok(route.screen && route.title, path);
  }
  assert.equal(documentTitle(ROUTES['/acorns-leaves/play/two']), 'Acorns & Leaves: Two Players · Spirit of the Woods');
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

  const deep = setup('#/acorns-leaves/play/two/');
  assert.deepEqual(deep.shown, ['/acorns-leaves/play/two']);
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

test('checkers: arrow keys move between dark squares, as seen on screen, and stop at the edges', () => {
  const sq = (row, col) => squareAt(row, col);
  // Acorns at the bottom: (7,0) is a1, bottom-left.
  const moves = [
    [sq(7, 0), 'ArrowRight', sq(7, 2)], [sq(7, 0), 'ArrowLeft', sq(7, 0)], [sq(7, 0), 'ArrowDown', sq(7, 0)],
    [sq(7, 0), 'ArrowUp', sq(6, 1)], [sq(6, 1), 'ArrowUp', sq(5, 0)], [sq(6, 7), 'ArrowUp', sq(5, 6)],
    [sq(5, 2), 'ArrowDown', sq(6, 3)], [sq(0, 1), 'ArrowUp', sq(0, 1)], [sq(0, 7), 'ArrowRight', sq(0, 7)],
    [sq(3, 4), 'Home', sq(3, 0)], [sq(3, 0), 'End', sq(3, 6)], [sq(2, 3), 'Home', sq(2, 1)],
  ];
  for (const [from, key, to] of moves) assert.equal(nextSquare(from, key), to, `${from} ${key}`);
  // Turned round (Leaves at the bottom): screen directions are reversed on the board.
  const turned = [
    [sq(0, 7), 'ArrowUp', sq(1, 6)], [sq(0, 7), 'ArrowRight', sq(0, 5)], [sq(0, 7), 'ArrowDown', sq(0, 7)],
    [sq(2, 1), 'ArrowDown', sq(1, 0)], [sq(4, 3), 'Home', sq(4, 7)],
  ];
  for (const [from, key, to] of turned) assert.equal(nextSquare(from, key, 'leaf'), to, `turned ${from} ${key}`);
  // Every dark square is reachable, and the keys only ever land on dark squares.
  for (const orientation of ['acorn', 'leaf']) {
    const seen = new Set([sq(7, 0)]);
    const queue = [sq(7, 0)];
    while (queue.length) {
      const at = queue.shift();
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
        const next = nextSquare(at, key, orientation);
        assert.equal((Math.floor(next / 8) + (next % 8)) % 2, 1, 'dark squares only');
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    assert.equal(seen.size, 32, orientation);
  }
  assert.equal(nextSquare(sq(7, 0), 'Enter'), null);
});

test('checkers squares are named by place, contents and purpose', () => {
  const sq = (row, col) => squareAt(row, col);
  const acorn = { side: 'acorn', king: false };
  assert.equal(squareLabel({ square: sq(5, 2), piece: acorn, movable: true }), 'c3: acorn, can move');
  assert.equal(squareLabel({ square: sq(5, 2), piece: acorn, movable: true, selected: true }), 'c3: acorn, selected');
  assert.equal(squareLabel({ square: sq(4, 3), piece: null, destination: true }), 'd4: empty, move here');
  assert.equal(squareLabel({ square: sq(3, 0), piece: null, destination: true, capture: true }), 'a5: empty, jump here');
  assert.equal(squareLabel({ square: sq(5, 2), piece: acorn, movable: true, mustJump: true }), 'c3: acorn, must capture');
  assert.equal(squareLabel({ square: sq(4, 1), piece: { side: 'leaf', king: true }, jumped: true }), 'b4: leaf king, being captured');
  assert.equal(squareLabel({ square: sq(4, 1), piece: null, onLastMove: true, capturedLastMove: true }), 'b4: empty, captured in the last move');
  assert.equal(squareLabel({ square: sq(3, 2), piece: acorn, onLastMove: true }), 'c5: acorn, last move');
});
