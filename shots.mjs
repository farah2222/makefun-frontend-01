// Take the entry's 3 screenshots on live data: serve app/, open each route
// in Chromium, wait for window.__shotReady, capture a JPEG under 256 KiB.
//   node shots.mjs [--port 8091]
//
// The sandboxed browser cannot reach the egress proxy, so every request
// outside localhost is fulfilled here from live data fetched with node's
// own fetch (which uses the proxy): the app runs on real, current API
// answers, and the app's own code is untouched. ETags pass through, so the
// app's If-None-Match revalidation still answers 304.
//
// Serves app/ itself (Node standard library only) and needs the Playwright
// package from ~/workspace/makefun/node_modules.

import { createServer } from 'node:http';
import { createReadStream, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/makefun/node_modules/playwright');

const here = fileURLToPath(new URL('.', import.meta.url));
const appDir = resolve(join(here, 'app'));
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
const port = Number(process.argv.slice(2).find((a, i, arr) => arr[i - 1] === '--port') ?? 8091);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(appDir, normalize(pathname)));
  if (file !== appDir && !file.startsWith(appDir + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': stats.size });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end('not found');
  }
});

await new Promise((resolvePromise) => server.listen(port, '127.0.0.1', resolvePromise));
console.log(`serving app/ on http://localhost:${port}`);

/** Fetch a URL with node's proxy-aware fetch, passing If-None-Match through. */
async function fetchLive(url, headers) {
  const init = { headers: {} };
  const inm = headers['if-none-match'];
  if (inm) init.headers['If-None-Match'] = inm;
  const res = await fetch(url, init);
  const out = { status: res.status, headers: {}, body: null };
  for (const name of ['content-type', 'etag', 'cache-control']) {
    const v = res.headers.get(name);
    if (v) out.headers[name] = v;
  }
  if (res.status !== 304) out.body = Buffer.from(await res.arrayBuffer());
  return out;
}

const browser = await chromium.launch();
const outDir = join(here, 'screenshots');
mkdirSync(outDir, { recursive: true });

for (const shot of shots) {
  const page = await browser.newPage({ viewport: shot.viewport, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  // Fulfill every request outside localhost from live data fetched here.
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      await route.continue();
      return;
    }
    try {
      const live = await fetchLive(url, route.request().headers());
      await route.fulfill({ status: live.status, headers: live.headers, body: live.body ?? undefined });
    } catch (err) {
      await route.fulfill({ status: 502, body: `screenshot fetch failed: ${err.message}` });
    }
  });
  await page.goto(`http://localhost:${port}/${shot.path}`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => window.__shotReady === true, { timeout: 30000 });
  } catch {
    console.log(`${shot.file}: __shotReady never turned true`);
  }
  await page.waitForTimeout(1200);
  const file = join(outDir, shot.file);
  // JPEG quality 82 first; drop to 70 if the file would pass 256 KiB.
  await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
  let size = statSync(file).size;
  if (size > 262144) {
    await page.screenshot({ path: file, type: 'jpeg', quality: 70 });
    size = statSync(file).size;
  }
  const broken = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).length);
  console.log(`${shot.file}: ${size} bytes, broken images: ${broken}, console errors: ${errors.length}${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
  await page.close();
}

await browser.close();
server.close();
console.log('done');
