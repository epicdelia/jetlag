#!/usr/bin/env node
/**
 * Static server for the web export (app/dist) with an SPA fallback: any path that is not a file
 * gets index.html, so deep links like /trip/abc reach the app's router (and its not-found screen).
 * Used by playwright.config.ts as the webServer. Usage: node e2e/serve.mjs [port] [distDir]
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8099);
const root = path.resolve(process.argv[3] ?? path.join(here, '..', 'dist'));
const index = path.join(root, 'index.html');
if (!fs.existsSync(index)) {
  console.error(`No ${index}. Run "npx expo export --platform web" in app/ first.`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

http
  .createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
    } catch {
      rel = '/';
    }
    let file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = index;
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
