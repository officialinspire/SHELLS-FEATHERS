// Hash routes ("#/shells-feathers/play/two"). GitHub Pages can't rewrite URLs,
// so the hash keeps every screen on index.html while still giving each one a
// real URL: Back/Forward, reload and bookmarks all work.

const APP_TITLE = 'Spirit of the Woods';

export const ROUTES = {
  '/': { screen: 'hub-screen', title: APP_TITLE },
  '/shells-feathers': { screen: 'sf-setup-screen', title: 'Shells & Feathers' },
  '/shells-feathers/play/single': { screen: 'game-screen', args: ['single'], title: 'Shells & Feathers: vs the Spirit' },
  '/shells-feathers/play/two': { screen: 'game-screen', args: ['two'], title: 'Shells & Feathers: Two Players' },
  '/shells-feathers/how-to-play': { screen: 'sf-howto-screen', title: 'How to Play Shells & Feathers' },
  '/acorns-leaves': { redirect: '/acorns-leaves/how-to-play' },
  '/acorns-leaves/how-to-play': { screen: 'al-howto-screen', title: 'Acorns & Leaves (Preview)' },
  '/settings': { screen: 'settings-screen', title: 'Settings' },
  '/your-path': { screen: 'path-screen', title: 'Your Path' },
};

export const documentTitle = (route) => (route.title === APP_TITLE ? APP_TITLE : `${route.title} · ${APP_TITLE}`);

// "#/a/b/" -> "/a/b". Anything that isn't a "#/..." route means the hub.
export function pathFromHash(hash) {
  const path = String(hash).replace(/^#/, '');
  if (!path.startsWith('/')) return '/';
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : '/';
}

// Follows redirects; unknown paths resolve to the hub.
export function resolveRoute(path) {
  let target = path;
  if (ROUTES[target]?.redirect) target = ROUTES[target].redirect;
  if (!ROUTES[target]) target = '/';
  return { path: target, route: ROUTES[target], redirected: target !== path };
}

// onChange(route, path) runs whenever the shown route changes: after go(),
// after Back/Forward (popstate), and after a typed or linked hash change.
export function createRouter({ win, onChange }) {
  let current = null;

  function show(path) {
    const resolved = resolveRoute(path);
    if (resolved.redirected) win.history.replaceState(win.history.state, '', `#${resolved.path}`);
    if (resolved.path === current) return;
    current = resolved.path;
    onChange(resolved.route, current);
  }

  const sync = () => show(pathFromHash(win.location.hash));

  const router = {
    get current() { return current; },
    start() {
      win.addEventListener('popstate', sync);
      win.addEventListener('hashchange', sync);
      sync();
    },
    // Opens a screen as a new history entry. Each entry remembers the one it
    // came from, so up() and back() can step back instead of piling up entries.
    go(path) {
      const target = resolveRoute(path).path;
      if (target === current) return;
      win.history.pushState({ prev: current }, '', `#${target}`);
      show(target);
    },
    // To a parent screen: reuse the previous entry when that is where we came from.
    up(path) {
      if (win.history.state?.prev === resolveRoute(path).path) win.history.back();
      else router.go(path);
    },
    // "Back" link: previous screen of this visit, or `fallback` on a fresh visit.
    back(fallback) {
      if (win.history.state?.prev) win.history.back();
      else router.go(fallback);
    },
  };
  return router;
}
