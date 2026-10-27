// The application shell is cached on install, while large music and the intro
// video remain network resources. Bump this name when changing the offline shell.
const CACHE_NAME = 'spirit-woods-shell-v2';
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
    await cache.addAll([...new Set([...SHELL.filter((path) => path !== './'), ...dependencies])].map(url));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('spirit-woods-shell-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const target = new URL(request.url);
  if (target.origin !== self.location.origin || !target.href.startsWith(SCOPE)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () =>
      (await caches.match(url('./'))) || Response.error()));
    return;
  }
  // Video and long-running music stream normally; short sound effects are
  // precached above. Do not cache partial/range responses as full files.
  if (request.headers.has('range') || /(?:gameplay\.mp3|inspiresoftwareintro\.mp4)$/.test(target.pathname)) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
