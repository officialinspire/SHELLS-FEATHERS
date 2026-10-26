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

test('service worker precaches the stamped app shell and falls back to it offline', async () => {
  const handlers = {};
  const entries = new Map();
  let offline = false;
  const localFile = (href) => {
    const target = new URL(href, base);
    assert.equal(target.origin, 'https://example.test');
    assert.ok(target.pathname.startsWith('/SHELLS-FEATHERS/'));
    const relative = target.pathname.slice('/SHELLS-FEATHERS/'.length) || 'index.html';
    const file = path.join(root, relative);
    assert.ok(existsSync(file), `missing precache file ${relative}`);
    return new Response(readFileSync(file));
  };
  const cache = {
    async put(href, response) { entries.set(href, response.clone()); },
    async addAll(hrefs) { for (const href of hrefs) entries.set(href, localFile(href)); }
  };
  const caches = {
    async open() { return cache; },
    async keys() { return ['spirit-woods-shell-v1']; },
    async match(href) { return entries.get(typeof href === 'string' ? href : href.url)?.clone(); },
    async delete() { return true; }
  };
  const self = {
    location: { origin: 'https://example.test' },
    registration: { scope: base },
    addEventListener(type, fn) { handlers[type] = fn; },
    async skipWaiting() {},
    clients: { async claim() {} }
  };
  const fetch = async (href) => {
    if (offline) throw new Error('offline');
    return localFile(typeof href === 'string' ? href : href.url);
  };
  vm.runInNewContext(readFileSync(path.join(root, 'sw.js'), 'utf8'), {
    self, caches, fetch, URL, Response, Error
  });
  let install;
  handlers.install({ waitUntil(promise) { install = promise; } });
  await install;
  assert.ok(entries.has(base), 'offline navigation shell');
  assert.ok(entries.has(base + 'src/main.js?' + /src\/main\.js\?([^"]+)/.exec(page)[1]));
  assert.ok(entries.has(base + 'assets/acorn-icon-512.png'));
  offline = true;
  let navigation;
  handlers.fetch({
    request: { method: 'GET', url: base, mode: 'navigate' },
    respondWith(promise) { navigation = promise; }
  });
  assert.match(await (await navigation).text(), /Spirit of the Woods/);
});
