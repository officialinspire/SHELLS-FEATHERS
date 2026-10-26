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
//   node tools/stamp-assets.mjs           # rewrite index.html
//   node tools/stamp-assets.mjs --check   # exit 1 if index.html is stale
//
// Run it after changing any file in src/ or styles.css; the unit test
// tests/unit/asset-versions.test.mjs fails until you do.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const START = '<!-- asset versions (tools/stamp-assets.mjs) -->';
const END = '<!-- /asset versions -->';

const hash = (file) => createHash('sha256').update(readFileSync(path.join(ROOT, file))).digest('hex').slice(0, 10);

function modules(dir = 'src') {
  return readdirSync(path.join(ROOT, dir)).sort().flatMap((name) => {
    const file = `${dir}/${name}`;
    if (statSync(path.join(ROOT, file)).isDirectory()) return modules(file);
    return name.endsWith('.js') ? [file] : [];
  });
}

// index.html as it should be, given the files on disk.
// `html` defaults to the index.html on disk.
export function stampedIndex(root = ROOT, html = readFileSync(path.join(root, 'index.html'), 'utf8')) {
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { current, expected } = stampedIndex();
  if (process.argv.includes('--check')) {
    if (current !== expected) {
      console.error('index.html asset versions are stale: run node tools/stamp-assets.mjs');
      process.exit(1);
    }
    console.log('index.html asset versions are current');
  } else if (current === expected) {
    console.log('index.html already current');
  } else {
    writeFileSync(path.join(ROOT, 'index.html'), expected);
    console.log('index.html stamped');
  }
}
