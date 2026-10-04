// Isolated public-route fixtures; no production accounts, API writes or votes.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import express from 'express';
import { chromium } from 'playwright-core';

const app = express();
app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const base = `http://127.0.0.1:${server.address().port}`;
const evidence = fileURLToPath(new URL('../output/community-prompts/', import.meta.url));
await mkdir(evidence, { recursive: true });
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.THUMB_BROWSER || (existsSync(edge) ? edge : undefined), headless: true });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let count = 9;
  let promptId = '022';
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('arena-language', 'zh');
  });
  await page.route('**/api/**', route => {
    const endpoint = new URL(route.request().url()).pathname;
    const works = Array.from({ length: count }, (_, i) => ({
      id: `${promptId}-work-${i}`, promptId, modelId: `model-${i % 2}`, modelName: `Model ${i % 2}`,
      title: `作品 ${i}`, isDemo: 0, content: JSON.stringify({ kind: 'html', src: `/pool-fixture/${i}` }),
    }));
    const payload = endpoint === '/api/works' ? { works }
      : endpoint === '/api/prompts' ? { prompts: [{ id: promptId, kind: 'web', name: '收集边界', prompt: '比较', code: 'POOL' }] }
        : endpoint === '/api/auth/me' ? { user: null }
          : endpoint === '/api/ratings' ? { ratings: [], games: {} } : {};
    return route.fulfill({ json: payload });
  });
  await page.route('**/pool-fixture/*', route => route.fulfill({ contentType: 'text/html', body: `<html><body>作品<script>parent.postMessage('aob:work-ready', '*')</script></body></html>` }));
  const closed = async () => {
    await page.getByText('作品收集中（9/10）', { exact: true }).waitFor();
    assert.equal(await page.locator('.arena-shell').count(), 0);
  };
  for (const id of ['022', 'q-48c3b43eeb284f6d', 'new-season']) {
  promptId = id;
  count = 9;
  await page.goto(`${base}/#arena/${id}`);
  await closed();
  console.log('PASS direct entertainment route closes at nine');
  await page.goto(`${base}/?duel=${encodeURIComponent(JSON.stringify([id, `${id}-work-0`, `${id}-work-1`]))}#arena/${id}`);
  await closed();
  console.log('PASS shared duel cannot bypass admission');
  await page.goto(`${base}/#random`);
  await page.waitForFunction(() => location.hash === '#prompts');
  await page.getByText('作品收集中（9/10），暂未开放娱乐盲测', { exact: true }).waitFor();
  console.log('PASS random route excludes incomplete prompts; library preserves them');
  if (id.startsWith('q-')) {
    await page.screenshot({ path: `${evidence}/library.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('.archive-option-number').first().getAttribute('title'), id);
    assert.equal(await page.locator('.archive-dossier-number').evaluate(el => getComputedStyle(el).fontSize), '12px');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${evidence}/library-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    console.log('PASS community library preserves its full ID without mobile overflow');
  }
  count = 10;
  await page.goto(`${base}/?duel=${encodeURIComponent(JSON.stringify([id, `${id}-work-0`, `${id}-work-1`]))}#arena/${id}`);
  await page.reload();
  await page.waitForSelector('.phase-voting');
  assert.equal(await page.locator('iframe').count(), 2);
  if (id.startsWith('q-')) {
    await page.screenshot({ path: `${evidence}/arena.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('.round-tag').getAttribute('title'), id);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${evidence}/arena-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    console.log('PASS community arena keeps long IDs compact on mobile');
  }
  assert.equal(await page.getByRole('button', { name: '换个题库继续', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
  await page.waitForSelector('.phase-voting');
  console.log('PASS tenth work opens matching and same-prompt continuation');
  count = 9;
  await page.reload();
  await closed();
  assert.deepEqual(errors, []);
  console.log('PASS later public roster below ten closes the prompt again');
  }
  count = 10;
  await page.route('**/api/prompts', async route => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    return route.fulfill({ json: { prompts: [{ id: promptId, kind: 'web', name: '收集边界', prompt: '比较', code: 'POOL' }] } });
  });
  await page.goto(`${base}/#random`);
  await page.waitForFunction(id => location.hash === `#arena/${id}`, promptId);
  await page.waitForSelector('.phase-voting');
  assert.deepEqual(errors, []);
  console.log('PASS random entry waits for the public catalog when works arrive first');
  await page.goto(`${base}/#arena/${promptId}`);
  await page.reload();
  await page.locator('output.route-empty').waitFor();
  assert.equal(await page.getByText('这个竞技场还未就绪。', { exact: true }).count(), 0);
  await page.waitForSelector('.phase-voting');
  assert.deepEqual(errors, []);
  console.log('PASS direct entry waits for the public catalog before deciding availability');
  await context.close();
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
