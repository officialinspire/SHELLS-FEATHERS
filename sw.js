// The offline shell: the page, its stamped modules and stylesheet, the icons
// and the short sound effects, cached per release. The long music and the
// intro video always stream from the network.
//
// Releases: tools/stamp-assets.mjs stamps RELEASE from index.html (which
// carries every module's hash) and every SHELL file, so any change to the
// shell, even one module, gives this file new bytes and its own cache.
//
// Updates are handed over, never forced:
// - a first install takes control at once (there is nothing to replace);
// - a later release installs into its own cache and then waits, while the
//   page keeps running the release it started with. The page offers Reload
//   or Later (src/app/update-prompt.js) and, on Reload, sends SKIP_WAITING;
//   the new worker then takes over, deletes older shells, and the page
//   refreshes once.
// - The page itself is served from this worker's own cache first, so an
//   open installation always runs the release its worker belongs to, online
//   or off, until the player accepts the update.
const RELEASE = 'd2343175e458'; // stamped by tools/stamp-assets.mjs
const CACHE_PREFIX = 'spirit-woods-shell-';
const CACHE_NAME = CACHE_PREFIX + RELEASE;
const SCOPE = self.registration.scope;
const url = (path) => new URL(path, SCOPE).href;
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './assets/acorn-icon-192.png', './assets/acorn-icon-512.png',
  './assets/acorn-icon.svg', './inspire-logo.png',
  './button_select.mp3', './player_select.mp3',
  './opponent_select.mp3', './newgame.mp3', './victory.mp3',
  './sounds/piece-move.wav', './sounds/piece-move-other.wav',
  './sounds/capture.wav', './sounds/crown.wav', './sounds/reveal.wav',
  './sounds/result-draw.wav', './sounds/result-loss.wav',
  './sounds/achievement.wav', './sounds/select.wav',
  './sounds/invalid.wav', './sounds/multi.wav'
];
// Streamed, never cached: the long music and the intro video.
const STREAMED = /(?:gameplay\.mp3|inspiresoftwareintro\.mp4)$/;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(url('./'), { cache: 'reload' });
    if (!response.ok) throw new Error('Cannot cache the game page');
    const html = await response.text();
    // The repository stamps every module URL in index.html. Cache that exact
    // set so installed clients can play immediately after going offline.
    const dependencies = [...html.matchAll(/(?:href|src)="((?:styles\.css|src\/[^"]+\.js)\?v=[a-f0-9]+)"/g)]
      .map((match) => './' + match[1]);
    await cache.put(url('./'), new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }));
    // Past the HTTP cache (Pages keeps files ten minutes): this release's
    // bytes, not a copy left from the last one.
    await cache.addAll([...new Set([...SHELL.filter((path) => path !== './'), ...dependencies])]
      .map((path) => new Request(url(path), { cache: 'reload' })));
    // No skipWaiting here: an update waits for the player (see above).
  })());
});

// The page's Reload: take over now.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

const fromShell = async (request) => (await caches.open(CACHE_NAME)).match(request);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const target = new URL(request.url);
  if (target.origin !== self.location.origin || !target.href.startsWith(SCOPE)) return;
  if (request.mode === 'navigate') {
    // The game page: this release's copy first (hash routes don't change
    // the URL the page is loaded from); anything else under the scope, or
    // no copy yet, from the network.
    const isGame = target.pathname === new URL(SCOPE).pathname || target.href.startsWith(url('./index.html'));
    if (!isGame) return;
    event.respondWith((async () => (await fromShell(url('./'))) || fetch(request))());
    return;
  }
  // Video and long music stream; partial (range) requests never come from
  // or go into the cache.
  if (request.headers.has('range') || STREAMED.test(target.pathname)) return;
  event.respondWith((async () => (await fromShell(request)) || fetch(request))());
});
