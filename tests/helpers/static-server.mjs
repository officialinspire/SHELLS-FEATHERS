// Minimal static file server for the repo root, used by the browser tests.
// Runs on Linux in CI, so paths are case-sensitive like GitHub Pages.
// `/__blank` is an empty same-origin page for seeding localStorage before the
// game loads.
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { pipeline } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
};

export function serveRepo() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (urlPath === '/__blank') {
      res.writeHead(200, { 'Content-Type': TYPES['.html'] }).end('<!doctype html><title>blank</title>');
      return;
    }
    const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    let stat;
    try {
      stat = file.startsWith(ROOT + path.sep) ? statSync(file) : null;
    } catch {
      stat = null;
    }
    if (!stat?.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': stat.size,
    });
    pipeline(createReadStream(file), res, () => {});
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
