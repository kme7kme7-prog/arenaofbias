// Run after build:check. Use real HTTP caching, with no Playwright routes (they disable it).
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright-core';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const covers = ['016', '009', '019'];
const assets = await readdir(new URL('../dist/assets/', import.meta.url));
for (const id of covers) {
  const names = assets.filter(name => new RegExp(`^prompt-cover-${id}-[\\w-]+\\.webp$`).test(name));
  assert.equal(names.length, 1, `${id}: a single content-hashed build asset`);
  assert.deepEqual(await readFile(`${dist}/assets/${names[0]}`),
    await readFile(new URL(`../public/art/prompt-cover-${id}.webp`, import.meta.url)), `${id}: original pixels preserved`);
}

const app = express();
const hits = [];
// Mirror the current game Nginx: /assets/ 30 days immutable; other static files no-cache.
app.use((req, res, next) => {
  if (/^\/assets\/prompt-cover-(016|009|019)-[\w-]+\.webp$/.test(req.path)) hits.push(req.path);
  if (!req.path.startsWith('/api/')) return next();
  if (req.method !== 'GET') return res.status(405).json({});
  return res.json(req.path === '/api/auth/me' ? { user: null }
    : req.path === '/api/works' ? { works: [] }
      : req.path === '/api/prompts' ? { prompts: [] }
        : req.path === '/api/ratings' ? { ratings: {}, games: {} } : {});
});
app.use(express.static(dist, {
  setHeaders(res, file) {
    res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(file)
      ? 'public, max-age=2592000, immutable' : 'no-cache');
  },
}));
const server = await new Promise(resolve => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const settled = async page => {
  await page.waitForFunction(() => document.querySelectorAll('.hr-file-image img').length === 3
    && [...document.querySelectorAll('.hr-file-image img')].every(image => image.complete && image.naturalWidth));
};
const timings = page => page.evaluate(() => performance.getEntriesByType('resource')
  .filter(entry => /\/assets\/prompt-cover-/.test(entry.name))
  .map(entry => ({ url: entry.name, transferred: entry.transferSize, duration: entry.duration })));
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/#home`);
  await settled(page);
  const cold = await timings(page);
  assert.equal(cold.length, 3);
  assert.equal(hits.length, 3, 'cold visit fetches the three covers');
  assert.ok(cold.every(entry => entry.transferred > 250000));
  console.log('PASS three content-hashed covers load with unchanged image bytes');

  await page.reload();
  await settled(page);
  const warm = await timings(page);
  assert.equal(hits.length, 3, 'normal reload does not contact the server for covers');
  assert.ok(warm.length === 3 && warm.every(entry => entry.transferred === 0));
  console.log('PASS normal reload reuses the covers without network validation', warm);

  await page.getByRole('button', { name: '开始评测', exact: true }).click();
  await page.waitForURL('**/#play');
  await page.evaluate(() => performance.clearResourceTimings());
  await page.getByRole('link', { name: '回到首页', exact: true }).click();
  await page.waitForURL('**/#home');
  await settled(page);
  assert.equal(hits.length, 3, 'returning home does not fetch or validate covers');
  assert.ok((await timings(page)).every(entry => entry.transferred === 0));
  console.log('PASS returning from play menu uses cached covers');

  const secondPage = await context.newPage();
  await secondPage.goto(`${base}/#home`);
  await settled(secondPage);
  assert.equal(hits.length, 3, 'a second tab reuses the covers');
  assert.ok((await timings(secondPage)).every(entry => entry.transferred === 0));
  console.log('PASS a second tab uses cached covers');
  assert.deepEqual(errors, []);
  console.log('PASS no page errors; HTML and APIs keep their independent cache policy');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
