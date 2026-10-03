// Isolated public-route fixtures; no production accounts, API writes or votes.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright-core';

const app = express();
app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const base = `http://127.0.0.1:${server.address().port}`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.THUMB_BROWSER || (existsSync(edge) ? edge : undefined), headless: true });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let count = 9;
  await page.addInitScript(() => { localStorage.setItem('arena-language', 'zh'); });
  await page.route('**/api/**', route => {
    const endpoint = new URL(route.request().url()).pathname;
    const works = Array.from({ length: count }, (_, i) => ({
      id: `022-work-${i}`, promptId: '022', modelId: `model-${i % 2}`, modelName: `Model ${i % 2}`,
      title: `作品 ${i}`, isDemo: 0, content: JSON.stringify({ kind: 'html', src: `/pool-fixture/${i}` }),
    }));
    const payload = endpoint === '/api/works' ? { works }
      : endpoint === '/api/prompts' ? { prompts: [{ id: '022', kind: 'web', name: '收集边界', prompt: '比较', code: 'POOL' }] }
        : endpoint === '/api/auth/me' ? { user: null }
          : endpoint === '/api/ratings' ? { ratings: [], games: {} } : {};
    return route.fulfill({ json: payload });
  });
  await page.route('**/pool-fixture/*', route => route.fulfill({ contentType: 'text/html', body: `<html><body>作品<script>parent.postMessage('aob:work-ready', '*')</script></body></html>` }));
  const closed = async () => {
    await page.getByText('作品收集中（9/10）', { exact: true }).waitFor();
    assert.equal(await page.locator('.arena-shell').count(), 0);
  };
  await page.goto(`${base}/#arena/022`);
  await closed();
  console.log('PASS direct entertainment route closes at nine');
  await page.goto(`${base}/?duel=${encodeURIComponent(JSON.stringify(['022', '022-work-0', '022-work-1']))}#arena/022`);
  await closed();
  console.log('PASS shared duel cannot bypass admission');
  await page.goto(`${base}/#random`);
  await page.waitForFunction(() => location.hash === '#prompts');
  await page.getByText('作品收集中（9/10），暂未开放娱乐盲测', { exact: true }).waitFor();
  console.log('PASS random route excludes incomplete prompts; library preserves them');
  count = 10;
  await page.goto(`${base}/#arena/022`);
  await page.reload();
  await page.waitForSelector('.phase-voting');
  assert.equal(await page.locator('iframe').count(), 2);
  assert.equal(await page.getByRole('button', { name: '换个题库继续', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
  await page.waitForSelector('.phase-voting');
  console.log('PASS tenth work opens matching and same-prompt continuation');
  count = 9;
  await page.reload();
  await closed();
  assert.deepEqual(errors, []);
  console.log('PASS later public roster below ten closes the prompt again');
  await context.close();
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
