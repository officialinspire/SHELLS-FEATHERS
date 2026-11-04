// The site as GitHub Pages serves it (from a sub-folder, case-sensitive, with
// ten-minute caching): every file the page references exists under exactly
// that name and is linked by a relative path, and index.html carries the
// current content hash of the stylesheet and of every module
// (tools/stamp-assets.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync, readdirSync, existsSync, mkdtempSync, cpSync, writeFileSync, rmSync,
} from 'node:fs';
import os from 'node:os';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampedIndex, stampedServiceWorker, shellFiles } from '../../tools/stamp-assets.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// True when `file` exists with exactly this spelling, folder by folder.
function existsExactly(file) {
  let dir = ROOT;
  for (const part of file.split('/')) {
    if (!readdirSync(dir).includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}

const hashOf = (file) => createHash('sha256').update(readFileSync(path.join(ROOT, file))).digest('hex').slice(0, 10);
const modules = (dir = 'src') => readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? modules(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));

test('index.html carries the current asset versions (run npm run stamp after changing src/ or styles.css)', () => {
  // Checked against the files themselves, not through the tool.
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(Object.keys(map.imports).sort(), modules().map((f) => `./${f}`).sort(), 'every module is in the import map');
  for (const file of modules()) {
    assert.equal(map.imports[`./${file}`], `./${file}?v=${hashOf(file)}`, `${file} is stale: run npm run stamp`);
  }
  assert.ok(html.includes(`href="styles.css?v=${hashOf('styles.css')}"`), 'styles.css is stale: run npm run stamp');
  assert.ok(html.includes(`src="src/main.js?v=${hashOf('src/main.js')}"`), 'src/main.js is stale: run npm run stamp');
  // And the tool agrees.
  const { current, expected } = stampedIndex(ROOT);
  assert.ok(current === expected, 'tools/stamp-assets.mjs would change index.html');
});

test('sw.js carries the current release (run npm run stamp)', () => {
  const { current, expected, release } = stampedServiceWorker(ROOT);
  assert.ok(current === expected, 'tools/stamp-assets.mjs would change sw.js');
  assert.match(current, new RegExp(`const RELEASE = '${release}';`));
  assert.match(release, /^[0-9a-f]{12}$/);
  for (const file of shellFiles(current)) assert.ok(existsExactly(file), `sw.js precaches ${file}, which is missing`);
});

// A copy of the site (the files the stamp reads) in a temporary folder.
function siteCopy() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sotw-stamp-'));
  for (const item of ['index.html', 'sw.js', 'styles.css', 'src', ...shellFiles(readFileSync(path.join(ROOT, 'sw.js'), 'utf8'))]) {
    cpSync(path.join(ROOT, item), path.join(dir, item), { recursive: true });
  }
  return dir;
}

test('every changed release gets its own release id, and so its own cache: a change to one module only too', (t) => {
  const dir = siteCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = stampedServiceWorker(ROOT).release;
  assert.equal(stampedServiceWorker(dir).release, before, 'the same files, the same release');
  const releaseAfter = (file, change) => {
    writeFileSync(path.join(dir, file), change(readFileSync(path.join(dir, file))));
    const index = stampedIndex(dir);
    return stampedServiceWorker(dir, index.expected).release;
  };
  const seen = new Set([before]);
  // Only an app module, deep in the import graph.
  const moduleOnly = releaseAfter('src/app/toast.js', (b) => `${b}\n// changed\n`);
  assert.ok(!seen.has(moduleOnly), 'a module-only change is a new release');
  seen.add(moduleOnly);
  // Only the stylesheet; only a short sound effect.
  const styleOnly = releaseAfter('styles.css', (b) => `${b}\n/* changed */\n`);
  assert.ok(!seen.has(styleOnly));
  seen.add(styleOnly);
  const soundOnly = releaseAfter('sounds/select.wav', (b) => Buffer.concat([b, Buffer.from([0])]));
  assert.ok(!seen.has(soundOnly));
});

test('the stamp tool replaces an existing stamp (not only the first one)', () => {
  const stale = html.replace(/\?v=[0-9a-f]{10}/g, '?v=0000000000');
  assert.notEqual(stale, html);
  const restamped = stampedIndex(ROOT, stale).expected;
  assert.equal(restamped, html);
});

test('every file the page and stylesheet reference exists, under that exact name, at a relative path', () => {
  const css = readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const refs = [
    ...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g),
    ...css.matchAll(/url\("?(?!data:)([^")]+)"?\)/g),
  ].map((m) => m[1]).filter((ref) => !/^https:\/\/(?:fonts\.(?:googleapis|gstatic)\.com|officialinspire\.github\.io)(?:\/|$)/.test(ref));
  assert.ok(refs.length > 15);
  for (const ref of refs) {
    assert.ok(!/^(\/|https?:)/.test(ref), `${ref} must be relative (the site lives in a sub-folder on GitHub Pages)`);
    assert.ok(existsExactly(ref.split('?')[0]), `${ref} is missing (names are case-sensitive on Pages)`);
  }
});

test('every module import is relative and resolves to a file with that exact name', () => {
  const walk = (dir) => readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));
  for (const file of walk('src')) {
    for (const [, spec] of readFileSync(path.join(ROOT, file), 'utf8').matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)) {
      assert.match(spec, /^\.\.?\//, `${file} imports ${spec}`);
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      assert.ok(existsExactly(target), `${file} imports ${spec}`);
    }
  }
});

test('Jekyll is off, so Pages serves every file as it is', () => {
  assert.ok(existsSync(path.join(ROOT, '.nojekyll')));
});
