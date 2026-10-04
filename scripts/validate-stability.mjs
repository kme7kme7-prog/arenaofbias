// Isolated content and API fixtures: no live accounts, votes or database writes.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { chromium } from 'playwright-core';

const out = path.resolve('output/stability');
await mkdir(out, { recursive: true });
const app = express();
app.use(express.static(path.resolve('dist')));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const base = `http://127.0.0.1:${server.address().port}`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ executablePath: process.env.THUMB_BROWSER || (existsSync(edge) ? edge : undefined), headless: true });
const results = [];
async function scenario(name, test, options = {}) {
  if (process.env.STABILITY_CASE && !name.includes(process.env.STABILITY_CASE)) return;
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  const counters = { works: 0, images: new Set(), failVersion: options.expired ? 1 : 0 };
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('aob-theme', 'paper');
    localStorage.setItem('aob-test-pair', JSON.stringify({ promptId: '005', a: 'qa-0', b: 'qa-1', at: Date.now() }));
    window.__qaHidden = false;
    Object.defineProperty(document, 'hidden', { get: () => window.__qaHidden });
  });
  await page.route('**/api/**', async route => {
    const endpoint = new URL(route.request().url()).pathname;
    let payload = {};
    if (endpoint === '/api/works') {
      counters.works++;
      if (options.hang) {
        await new Promise(resolve => setTimeout(resolve, 14000));
        return route.fulfill({ json: { works: [] } }).catch(() => {});
      }
      payload = { works: Array.from({ length: 10 }, (_, i) => ({
        id: `qa-${i}`, promptId: '005', modelId: `qa-${i}`, modelName: `Fixture ${i}`, title: `作品 ${i}`, isDemo: 0,
        content: JSON.stringify(options.images
          ? { kind: 'image', src: `${base}/qa-image/${i}`, alt: 'Fixture' }
          : { kind: 'html', src: `https://c${(counters.works * 100 + i).toString(16).padStart(32, '0')}.w.arenaofbias.icu/` }),
      })) };
    } else if (endpoint === '/api/prompts') payload = { prompts: [{ id: '005', kind: options.images ? 'image' : 'text', name: '稳定性夹具', prompt: '比较作品', code: 'TEST' }] };
    else if (endpoint === '/api/auth/me') payload = { user: null };
    else if (endpoint === '/api/ratings') payload = { ratings: {}, games: {} };
    return route.fulfill({ json: payload });
  });
  await page.route('https://*.w.arenaofbias.icu/**', route => {
    const version = Math.floor(parseInt(new URL(route.request().url()).hostname.slice(1, 33), 16) / 100);
    const fail = version === counters.failVersion;
    return route.fulfill({ contentType: 'text/html', status: fail ? 410 : 200,
      body: fail ? '<body>作品已不可用</body>' : `<body>Fixture<script>parent.postMessage('aob:work-loading','*');${options.manualReady ? '' : "setTimeout(()=>parent.postMessage('aob:work-ready','*'),20);"}</script></body>` });
  });
  await page.route('**/qa-image/*', async route => {
    const index = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    counters.images.add(index);
    if (index >= 2) await new Promise(resolve => setTimeout(resolve, 11000));
    return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXfoAAAAASUVORK5CYII=', 'base64') }).catch(() => {});
  });
  try {
    await page.goto(`${base}/#arena/005`);
    await test(page, counters);
    assert.deepEqual(errors, []);
    results.push({ name, passed: true, requests: counters.works });
    console.log(`PASS ${name}`);
  } finally { await context.close(); }
}
try {
  await scenario('fifteen continuations keep only two frames and no retained curtain', async (page, counters) => {
    await page.waitForSelector('.phase-voting');
    for (let i = 0; i < 15; i++) {
      await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
      await page.waitForSelector('.phase-voting');
      assert.equal(await page.locator('.work-viewport iframe').count(), 2);
      assert.equal(await page.locator('.game-transition').count(), 0);
      await expectVoteEnabled(page);
    }
    assert.equal(counters.works, 1);
    await page.getByRole('link', { name: '回到首页', exact: true }).click();
    await page.waitForURL('**/#home');
    await page.waitForFunction(() => !document.querySelector('.game-transition'));
    assert.equal(await page.locator('iframe').count(), 0);
  });
  await scenario('new round receives a fresh retry after the previous round recovered', async (page, counters) => {
    await page.waitForSelector('.phase-voting', { timeout: 15000 });
    assert.equal(counters.works, 2);
    counters.failVersion = 2;
    await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
    await page.waitForSelector('.phase-voting', { timeout: 16000 });
    assert.equal(counters.works, 3);
    await expectVoteEnabled(page);
  }, { expired: true });
  await scenario('background suspension does not replace healthy work', async (page, counters) => {
    await page.waitForSelector('.phase-intro');
    await page.evaluate(() => { window.__qaHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(11500);
    assert.equal(counters.works, 1);
    assert.equal(await page.locator('.arena-unavailable').count(), 0);
    await page.evaluate(() => { window.__qaHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    for (const frame of page.frames().filter(frame => frame !== page.mainFrame())) await frame.evaluate(() => parent.postMessage('aob:work-ready', '*'));
    await page.waitForSelector('.phase-voting');
    assert.equal(counters.works, 1);
  }, { manualReady: true });
  await scenario('an unused slow cover does not block the selected image matchup', async (page, counters) => {
    await page.waitForSelector('.phase-voting', { timeout: 5000 });
    assert.deepEqual([...counters.images].sort((a, b) => a - b), [0, 1]);
  }, { images: true });
  await scenario('hanging initial roster leaves loading after its deadline', async page => {
    await page.waitForSelector('.prompt-library', { timeout: 14000 });
    assert.equal(await page.locator('.route-empty').count(), 0);
  }, { hang: true });
} finally {
  await writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
async function expectVoteEnabled(page) {
  assert.equal(await page.getByRole('button', { name: /我寻思这边能行/ }).isEnabled(), true);
}
