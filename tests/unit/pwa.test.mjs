import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const page = readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const base = 'https://example.test/SHELLS-FEATHERS/';

test('social card and install icons refer to real, correctly sized project assets', () => {
  assert.match(page, /property="og:image" content="https:\/\/officialinspire\.github\.io\/SHELLS-FEATHERS\/assets\/spirit-of-the-woods-social\.jpg"/);
  assert.match(page, /name="twitter:card" content="summary_large_image"/);
  assert.ok(existsSync(path.join(root, 'assets/spirit-of-the-woods-social.jpg')));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}`);
    assert.ok(icon, `missing ${size} icon`);
    const bytes = readFileSync(path.join(root, icon.src));
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

// sw.js run against a fake Cache Storage, network and worker scope.
function loadWorker({ source = readFileSync(path.join(root, 'sw.js'), 'utf8'), existing = {} } = {}) {
  const handlers = {};
  const stores = new Map(Object.entries(existing).map(([name, entries]) => [name, new Map(entries)]));
  const net = { offline: false, page: null, fetched: [] };
  const keyOf = (request) => (typeof request === 'string' ? request : request.url);
  const localFile = (href) => {
    const target = new URL(href, base);
    assert.equal(target.origin, 'https://example.test');
    assert.ok(target.pathname.startsWith('/SHELLS-FEATHERS/'));
    const relative = target.pathname.slice('/SHELLS-FEATHERS/'.length) || 'index.html';
    if (relative === 'index.html' && net.page) return new Response(net.page);
    const file = path.join(root, relative);
    assert.ok(existsSync(file), `missing precache file ${relative}`);
    return new Response(readFileSync(file));
  };
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async put(request, response) { entries.set(keyOf(request), await response.clone().text()); },
      async addAll(requests) { for (const request of requests) entries.set(keyOf(request), await localFile(keyOf(request)).text()); },
      async match(request) {
        const hit = entries.get(keyOf(request));
        return hit === undefined ? undefined : new Response(hit);
      },
    };
  };
  const caches = {
    async open(name) { return cacheFor(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    // A worker must not read other releases' caches through this.
    async match() { throw new Error('caches.match reads every release: use this release\'s cache'); },
  };
  const calls = { skipWaiting: 0, claim: 0 };
  const self = {
    location: { origin: 'https://example.test' },
    registration: { scope: base },
    addEventListener(type, fn) { handlers[type] = fn; },
    async skipWaiting() { calls.skipWaiting += 1; },
    clients: { async claim() { calls.claim += 1; } },
  };
  const fetch = async (request) => {
    net.fetched.push(keyOf(request));
    if (net.offline) throw new Error('offline');
    return localFile(keyOf(request));
  };
  vm.runInNewContext(source, {
    self, caches, fetch, URL, Request, Response, Error,
  });
  const run = async (type, event = {}) => {
    let done;
    handlers[type]({ ...event, waitUntil(promise) { done = promise; } });
    await done;
  };
  // What the worker answers for a request: a response, or null when it
  // leaves the request to the browser (the network).
  const request = async (url, { mode = 'no-cors', headers = {} } = {}) => {
    let answer = null;
    handlers.fetch({
      request: {
        method: 'GET', url, mode, headers: new Map(Object.entries(headers)),
      },
      respondWith(promise) { answer = promise; },
    });
    return answer && (await answer);
  };
  return {
    handlers, stores, net, calls, run, request,
  };
}

const releaseOf = (source) => /const RELEASE = '([0-9a-f]+)';/.exec(source)[1];

test('service worker: each release precaches the stamped shell into its own cache and waits', async () => {
  const sw = loadWorker();
  const name = `spirit-woods-shell-${releaseOf(readFileSync(path.join(root, 'sw.js'), 'utf8'))}`;
  await sw.run('install');
  assert.deepEqual([...sw.stores.keys()], [name]);
  const entries = sw.stores.get(name);
  assert.ok(entries.has(base), 'the page');
  assert.ok(entries.has(base + 'src/main.js?' + /src\/main\.js\?([^"]+)/.exec(page)[1]), 'the stamped modules');
  assert.ok(entries.has(base + 'styles.css?' + /styles\.css\?([^"]+)/.exec(page)[1]));
  assert.ok(entries.has(base + 'assets/acorn-icon-512.png'));
  // Short effects are cached; the long music and the intro video are not.
  for (const effect of ['sounds/capture.wav', 'sounds/select.wav', 'newgame.mp3', 'victory.mp3']) assert.ok(entries.has(base + effect), effect);
  for (const streamed of ['gameplay.mp3', 'inspiresoftwareintro.mp4']) assert.ok(!entries.has(base + streamed), streamed);
  assert.equal(sw.calls.skipWaiting, 0, 'install never takes over by itself');
  // The page's Reload asks it to take over; anything else doesn't.
  sw.handlers.message({ data: { type: 'something else' } });
  assert.equal(sw.calls.skipWaiting, 0);
  sw.handlers.message({ data: { type: 'SKIP_WAITING' } });
  assert.equal(sw.calls.skipWaiting, 1);
});

test('service worker: activating removes older shells only, and takes the pages', async () => {
  const sw = loadWorker({
    existing: {
      'spirit-woods-shell-v2': [[base, 'old page']],
      'spirit-woods-shell-0123456789ab': [[base, 'older page']],
      'someone-else': [['x', 'y']],
    },
  });
  await sw.run('install');
  await sw.run('activate');
  const name = `spirit-woods-shell-${releaseOf(readFileSync(path.join(root, 'sw.js'), 'utf8'))}`;
  assert.deepEqual([...sw.stores.keys()].sort(), [name, 'someone-else'].sort());
  assert.equal(sw.calls.claim, 1);
});

test('service worker: the page comes from its own release, online or off; music, video and ranges stream', async () => {
  const sw = loadWorker({ existing: { 'spirit-woods-shell-v2': [[`${base}sounds/only-old.wav`, 'old']] } });
  await sw.run('install');
  // Online, with a newer page on the server: this release's page still.
  sw.net.page = '<!doctype html><title>a newer release</title>';
  for (const url of [base, `${base}index.html`, `${base}?utm=1`]) {
    const answer = await sw.request(url, { mode: 'navigate' });
    assert.match(await answer.text(), /Spirit of the Woods/, url);
  }
  // Offline: the page, a stamped module and an effect, all from the cache.
  sw.net.offline = true;
  assert.match(await (await sw.request(base, { mode: 'navigate' })).text(), /Spirit of the Woods/);
  const main = base + 'src/main.js?' + /src\/main\.js\?([^"]+)/.exec(page)[1];
  assert.match(await (await sw.request(main)).text(), /createApp/);
  assert.ok(await sw.request(`${base}sounds/capture.wav`));
  // Never another release's files.
  await assert.rejects(async () => (await sw.request(`${base}sounds/only-old.wav`)), /offline/);
  // Left to the browser: the music, the video, any range request, other
  // pages and other sites.
  sw.net.offline = false;
  assert.equal(await sw.request(`${base}gameplay.mp3`), null);
  assert.equal(await sw.request(`${base}inspiresoftwareintro.mp4`), null);
  assert.equal(await sw.request(`${base}sounds/capture.wav`, { headers: { range: 'bytes=0-' } }), null);
  assert.equal(await sw.request(`${base}docs/assets.md`, { mode: 'navigate' }), null);
  assert.equal(await sw.request('https://fonts.example/x.css'), null);
});
