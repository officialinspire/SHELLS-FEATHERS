#!/usr/bin/env node
// Stamps index.html with a content hash for the stylesheet and every
// JavaScript module, so browsers never mix old and new files after a deploy.
//
// GitHub Pages serves every file with `Cache-Control: max-age=600` and no way
// to change it. Without versions, a browser could load a new index.html with
// up to ten-minute-old modules, or new modules with old markup. With them:
// - styles.css and src/main.js are linked as `…?v=<hash>`;
// - an import map sends every other module (imported by plain relative
//   paths) to `…?v=<hash>` too, so a changed file always has a new URL;
// - a modulepreload link for every module, so the browser fetches them all
//   at once instead of one level of imports at a time (six round trips on a
//   slow phone network before; see docs/upgrade-plan.md §0.1). The block
//   stays at the end of <body>: in <head> the fetches competed with the
//   stylesheet and delayed the first paint (measured: 1.8 s against 1.2 s).
// Browsers without import maps (Safari before 16.4) ignore the map and load
// the plain paths, as before.
//
// Then sw.js gets the release: a hash of the stamped index.html (which
// carries every module's and the stylesheet's hash) and of every file in the
// service worker's SHELL list. Any change to the offline shell, even to one
// module only, gives sw.js new bytes, so browsers install the new worker,
// and a cache of its own (spirit-woods-shell-<release>).
//
//   node tools/stamp-assets.mjs                 # rewrite index.html and sw.js
//   node tools/stamp-assets.mjs --check         # exit 1 if either is stale
//   node tools/stamp-assets.mjs --root <dir>    # another copy of the site
//
// Run it after changing any file in src/, styles.css, index.html or a file
// sw.js precaches; the unit test tests/unit/asset-versions.test.mjs fails
// until you do.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const START = '<!-- asset versions (tools/stamp-assets.mjs) -->';
const END = '<!-- /asset versions -->';

const RELEASE_LINE = /const RELEASE = '[a-z0-9]*'; \/\/ stamped by tools\/stamp-assets\.mjs/;

const hashOf = (root, file) => createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex').slice(0, 10);

function modulesIn(root, dir = 'src') {
  return readdirSync(path.join(root, dir)).sort().flatMap((name) => {
    const file = `${dir}/${name}`;
    if (statSync(path.join(root, file)).isDirectory()) return modulesIn(root, file);
    return name.endsWith('.js') ? [file] : [];
  });
}

// index.html as it should be, given the files on disk.
// `html` defaults to the index.html on disk.
export function stampedIndex(root = ROOT, html = readFileSync(path.join(root, 'index.html'), 'utf8')) {
  const hash = (file) => hashOf(root, file);
  const modules = () => modulesIn(root);
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const imports = Object.fromEntries(modules().map((file) => [`./${file}`, `./${file}?v=${hash(file)}`]));
  const map = JSON.stringify({ imports }, null, 2).split('\n').map((line) => `  ${line}`).join(eol);
  const block = [
    START,
    '  <script type="importmap">',
    map,
    '  </script>',
    ...modules().map((file) => `  <link rel="modulepreload" href="${file}?v=${hash(file)}" />`),
    `  <script type="module" src="src/main.js?v=${hash('src/main.js')}"></script>`,
    `  ${END}`,
  ].join(eol);
  let out = html.replace(/<link rel="stylesheet" href="styles\.css(\?v=\w+)?" \/>/, `<link rel="stylesheet" href="styles.css?v=${hash('styles.css')}" />`);
  const from = out.indexOf(START);
  if (from !== -1) {
    // Plain string slicing: the markers contain characters regexes treat specially.
    const to = out.indexOf(END, from) + END.length;
    out = out.slice(0, from) + block + out.slice(to);
  } else {
    out = out.replace(/<script type="module" src="src\/main\.js"><\/script>/, block);
  }
  return { current: html, expected: out };
}

// The files sw.js precaches (its SHELL list), as paths from the site root.
export function shellFiles(swSource) {
  const list = /const SHELL = \[([\s\S]*?)\];/.exec(swSource);
  if (!list) throw new Error('sw.js has no SHELL list');
  return [...list[1].matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter((file) => file && file !== 'index.html');
}

// The release: everything the shell is made of, with index.html as stamped.
export function releaseOf(root, indexHtml, swSource) {
  const digest = createHash('sha256').update(indexHtml);
  for (const file of shellFiles(swSource)) digest.update(`\0${file}\0`).update(readFileSync(path.join(root, file)));
  return digest.digest('hex').slice(0, 12);
}

// sw.js as it should be, given the stamped index.html (default: as
// stampedIndex would leave it).
export function stampedServiceWorker(root = ROOT, indexHtml = stampedIndex(root).expected) {
  const current = readFileSync(path.join(root, 'sw.js'), 'utf8');
  if (!RELEASE_LINE.test(current)) throw new Error('sw.js has no stamped RELEASE line');
  const release = releaseOf(root, indexHtml, current);
  return { current, expected: current.replace(RELEASE_LINE, `const RELEASE = '${release}'; // stamped by tools/stamp-assets.mjs`), release };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--root');
  const root = at === -1 ? ROOT : path.resolve(process.argv[at + 1]);
  const index = stampedIndex(root);
  const worker = stampedServiceWorker(root, index.expected);
  if (process.argv.includes('--check')) {
    const stale = [index.current !== index.expected && 'index.html', worker.current !== worker.expected && 'sw.js'].filter(Boolean);
    if (stale.length) {
      console.error(`${stale.join(' and ')} asset versions are stale: run node tools/stamp-assets.mjs`);
      process.exit(1);
    }
    console.log('index.html and sw.js asset versions are current');
  } else {
    if (index.current !== index.expected) writeFileSync(path.join(root, 'index.html'), index.expected);
    if (worker.current !== worker.expected) writeFileSync(path.join(root, 'sw.js'), worker.expected);
    const changed = [index.current !== index.expected && 'index.html', worker.current !== worker.expected && 'sw.js'].filter(Boolean);
    console.log(changed.length ? `${changed.join(' and ')} stamped (release ${worker.release})` : `already current (release ${worker.release})`);
  }
}
