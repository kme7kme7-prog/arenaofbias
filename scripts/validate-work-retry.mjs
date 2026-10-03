// Isolated browser fixtures: no production API writes or live votes.
// Run npm run build:check first.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(root, 'output/work-retry');
await mkdir(out, { recursive: true });
const app = express();
app.use(express.static(path.join(root, 'dist')));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const base = `http://127.0.0.1:${server.address().port}`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let browser;
const results = [];
try {
  browser = await chromium.launch({ executablePath: process.env.THUMB_BROWSER || (existsSync(edge) ? edge : undefined), headless: true });
  async function scenario(name, { count = 10, permanent = false, empty = false, networkFail = false, normal = false, leave = false, curtain = false, underfilled = false, otherReady = false, slowDocument = false, startSpam = false, stalledNetwork = false, legacyProbe = false } = {}) {
    if (process.env.RETRY_CASE && !name.includes(process.env.RETRY_CASE)) return;
    const context = await browser.newContext({ reducedMotion: normal ? 'no-preference' : 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let requests = 0;
    let refreshedAt = 0;
    const start = Date.now();
    await page.addInitScript(() => {
      if (window !== window.top) return;
      localStorage.setItem('aob-theme', 'paper');
      localStorage.setItem('arena-language', 'zh');
      localStorage.setItem('aob-test-pair', JSON.stringify({ promptId: '005', a: '005-ready-0', b: '005-ready-1', at: Date.now() }));
    });
    const works = generation => Array.from({ length: count }, (_, i) => ({
      id: `005-ready-${i}`, promptId: '005', modelId: `ready-${i}`, modelName: `Ready ${i}`, title: `作品 ${i}`, isDemo: 0,
      content: JSON.stringify({ kind: 'html', src: `https://${generation ? 'c' : 'p'}${i.toString(16).padStart(32, '0')}.w.arenaofbias.icu/` }),
    }));
    await page.route('**/api/**', async route => {
      const endpoint = new URL(route.request().url()).pathname;
      let payload = {};
      if (endpoint === '/api/works') {
        requests++;
        if (requests > 1) {
          refreshedAt = Date.now();
          // Keep the pending request observable across Playwright's locator backoff.
          await new Promise(resolve => setTimeout(resolve, leave ? 1800 : 1200));
          if (networkFail) return route.fulfill({ status: 503, json: { error: 'fixture' } });
        }
        const list = works(requests > 1);
        payload = { works: empty && requests > 1 ? [] : [...(underfilled && requests > 1 ? list.slice(0, 9) : list), ...((normal || otherReady) ? list.map(row => ({ ...row, id: row.id.replace('005', '006'), promptId: '006', ...(otherReady ? { content: JSON.stringify({ kind: 'html', src: `https://c${(100 + Number(row.id.split('-').at(-1))).toString(16).padStart(32, '0')}.w.arenaofbias.icu/` }) } : {}) })) : [])] };
      } else if (endpoint === '/api/prompts') payload = { prompts: ['005', ...((normal || otherReady) ? ['006'] : [])].map(id => ({ id, kind: 'web', name: '就绪回归', prompt: '比较', code: 'READY' })) };
      else if (endpoint === '/api/auth/me') payload = { user: null };
      else if (endpoint === '/api/ratings') payload = { ratings: [], games: {} };
      else if (endpoint === '/api/reactions') payload = { counts: {}, mine: {} };
      return route.fulfill({ json: payload });
    });
    await page.route('https://*.w.arenaofbias.icu/**', async route => {
      const url = new URL(route.request().url());
      if (stalledNetwork) {
        await new Promise(resolve => setTimeout(resolve, 31000));
        return route.abort().catch(() => {});
      }
      if (startSpam) return route.fulfill({ status: 200, contentType: 'text/html', body: '<body>未就绪<script>parent.postMessage("aob:work-loading","*");setInterval(()=>parent.postMessage("aob:work-loading","*"),100)</script></body>' });
      const failing = !normal && !slowDocument && (permanent || url.hostname[0] === 'p') && !(otherReady && parseInt(url.hostname.slice(1, 33), 16) >= 100);
      if (slowDocument) await new Promise(resolve => setTimeout(resolve, 12000));
      return route.fulfill({ status: failing ? 410 : 200, contentType: 'text/html', body: failing
        ? '<html><body>作品已不可用</body></html>'
        : `<html><body>就绪 ${url.hostname}<script>${legacyProbe ? '' : "parent.postMessage('aob:work-loading', '*');"}setTimeout(() => parent.postMessage('aob:work-ready', '*'), ${slowDocument ? 4500 : 20})</script></body></html>` });
    });
    if (curtain) {
      await page.goto(`${base}/#play`);
      await page.getByText('娱乐测评', { exact: true }).click();
      await page.waitForFunction(() => window.location.hash === '#arena/005');
    } else await page.goto(`${base}/#arena/005`);
    if (slowDocument) {
      await page.waitForSelector('.phase-voting', { timeout: 20000 });
      assert.equal(requests, 1, 'slow but healthy documents are not refreshed before their own readiness deadline');
    } else if (normal) {
      await page.waitForSelector('.phase-voting');
      await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
      await page.waitForFunction(() => window.location.hash === '#arena/006');
      await page.waitForSelector('.phase-voting');
      await page.getByRole('button', { name: /我寻思这边能行/ }).click();
      await page.waitForSelector('.phase-result');
      await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
      await page.waitForSelector('.phase-voting');
      assert.equal(requests, 1);
    } else {
      try {
        await (curtain ? page.locator('.game-transition output.gt-recovery') : page.getByText('作品接入失败，正在换一组…', { exact: true })).waitFor({ timeout: stalledNetwork ? 25000 : 15000 });
      } catch (error) {
        console.log(JSON.stringify({ name, requests, errors, text: (await page.locator('body').innerText()).slice(0, 2000), frames: page.frames().map(frame => frame.url()) }));
        await page.screenshot({ path: path.join(out, 'retry-failure.png') });
        throw error;
      }
      const budget = stalledNetwork ? 20000 : 10000;
      assert.ok(refreshedAt - start >= budget - 200 && refreshedAt - start < budget + 3500, `${name}: retry timing ${refreshedAt - start}`);
      if (curtain) assert.equal(await page.locator('.game-transition.gt-match').count(), 1, 'retry stays covered');
      if (leave) {
        await page.evaluate(() => { window.location.hash = '#prompts'; });
        await page.waitForTimeout(2200);
        assert.equal(await page.locator('.arena-shell').count(), 0);
      } else if (permanent || empty || networkFail || underfilled) {
        try {
          // A truly empty roster routes to the existing prompt preview empty state.
          await page.getByText(empty ? '结果待接入' : underfilled ? '作品收集中（9/10）' : '这个竞技场还未就绪。', { exact: true }).waitFor({ timeout: stalledNetwork ? 23000 : 13000 });
        } catch (error) {
          console.log(await page.locator('body').innerText());
          await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
          throw error;
        }
        await page.waitForTimeout(1500);
        assert.equal(await page.locator('iframe').count(), 0);
        assert.equal(await page.locator('.game-transition').count(), 0);
        if (permanent || networkFail) {
          assert.equal(await page.getByRole('link', { name: '回到首页', exact: true }).count(), 2, 'empty state retains header and manual home exits');
          assert.ok(await page.locator('.arena-empty-content').isVisible());
          if (otherReady) {
            await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
            await page.waitForURL('**/#arena/006');
            await page.waitForSelector('.phase-voting');
          } else {
            await page.getByRole('link', { name: '回到首页', exact: true }).last().click();
            await page.waitForURL('**/#home');
          }
        }
      } else {
        await page.waitForSelector('.phase-voting', { timeout: 8000 });
        const sources = await page.locator('.work-viewport iframe').evaluateAll(frames => frames.map(frame => frame.src));
        assert.equal(sources.length, 2);
        assert.ok(sources.every(src => new URL(src).hostname.startsWith('c')));
        if (count > 2) assert.ok(sources.every(src => !/c0{31}[01]\./.test(src)), 'prefer works other than both failed ids');
        assert.equal(new URL(page.url()).hash, '#arena/005');
        await page.screenshot({ path: path.join(out, `${count === 2 ? 'same-ids' : 'recovered'}.png`), fullPage: true });
      }
      assert.equal(requests, 2, 'one initial request and only one recovery refresh');
    }
    assert.deepEqual(errors, []);
    results.push({ name, requests, retryAtMs: refreshedAt ? refreshedAt - start : null, passed: true });
    await context.close();
    console.log(`PASS ${name}`);
  }
  await scenario('normal voting, reveal, same-prompt and other-prompt continuation', { normal: true });
  await scenario('late document startup receives a full readiness window', { slowDocument: true });
  await scenario('legacy ready-only probe can arrive after a slow document load', { slowDocument: true, legacyProbe: true });
  await scenario('stalled navigation has a finite budget and only one retry', { permanent: true, stalledNetwork: true });
  await scenario('expired p keys refresh and avoid failed works');
  // A two-work public pool is now closed by the ten-work admission rule.
  await scenario('second failure reaches empty state without looping', { permanent: true });
  await scenario('repeated document-start signals cannot prolong two failed attempts', { permanent: true, startSpam: true });
  await scenario('empty state can switch to an available other prompt', { permanent: true, otherReady: true });
  await scenario('empty refreshed roster remains empty', { empty: true });
  await scenario('refreshed pool below ten exits to collection preview', { underfilled: true });
  await scenario('refresh HTTP failure reaches manual empty flow', { networkFail: true });
  await scenario('leaving during refresh discards late results', { leave: true });
  await scenario('menu curtain stays closed through both failures then exits to empty', { curtain: true, permanent: true });
} finally {
  await writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
