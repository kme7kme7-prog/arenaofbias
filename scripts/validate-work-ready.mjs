// 真浏览器回归：只运行本地静态构建和内存 fixture，不连接真库或已有浏览器。
// 先 npm run build，再 node scripts/validate-work-ready.mjs。
// --expect-bug 用旧构建确认 transition 期间的一次性通知确实会丢失。
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(root, 'output/playwright');
await mkdir(out, { recursive: true });
const app = express();
app.use(express.static(path.join(root, 'dist')));
const server = await new Promise(resolve => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const base = `http://127.0.0.1:${server.address().port}`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executablePath = process.env.THUMB_BROWSER || (existsSync(edge) ? edge : undefined);
let browser;
const results = [];
try {
  browser = await chromium.launch({ executablePath, headless: true });
  async function scenario(name, { delay = 40, changeCanvas = false, count = 4, reducedMotion = 'no-preference', theme = 'paper' } = {}) {
    const context = await browser.newContext({ reducedMotion });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => {
      localStorage.setItem('aob-theme', theme);
      localStorage.setItem('arena-language', 'zh');
      localStorage.setItem('aob-test-pair', JSON.stringify({
        promptId: '005', a: '005-ready-0', b: '005-ready-1', at: Date.now(),
      }));
    }, theme);
    const works = Array.from({ length: count }, (_, i) => ({
      id: `005-ready-${i}`, promptId: '005', modelId: `ready-${i}`, modelName: `Ready ${i}`,
      title: `Ready fixture ${i}`, isDemo: 0,
      content: JSON.stringify({ kind: 'html', src: `/ready-fixture/${i}.html`,
        ...(changeCanvas && i < 2 ? { framing: { width: 1280, height: 720 } } : {}),
      }),
    }));
    await page.route('**/api/**', route => {
      const endpoint = new URL(route.request().url()).pathname;
      const payload = endpoint === '/api/works' ? { works }
        : endpoint === '/api/prompts' ? { prompts: [{ id: '005', kind: 'web', name: '就绪时序回归', prompt: '比较两份作品', code: 'READY' }] }
        : endpoint === '/api/auth/me' ? { user: null }
        : endpoint === '/api/ratings' ? { ratings: [], games: {} }
        : endpoint === '/api/reactions' ? { counts: {}, mine: {} } : {};
      return route.fulfill({ json: payload });
    });
    await page.route('**/ready-fixture/*', route => {
      const id = Number(new URL(route.request().url()).pathname.match(/(\d+)\.html$/)[1]);
      const wait = id < 2 ? 40 : delay;
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body data-work="${id}">
        <h1>Ready fixture ${id}</h1><script data-aob-probe>
        ${wait === null ? '' : `setTimeout(() => { document.body.dataset.sent = 'true'; parent.postMessage('aob:work-ready', '*'); }, ${wait});`}
        </script></body></html>` });
    });
    await page.goto(`${base}/#arena/005`);
    await page.waitForSelector('.phase-voting');
    const before = await page.locator('iframe').evaluateAll(frames => frames.map(frame => frame.contentDocument.body.dataset.work));
    await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
    if (count > 2) await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(frame =>
      frame.contentDocument?.body?.dataset.work && Number(frame.contentDocument.body.dataset.work) >= 2));
    const state = () => page.evaluate(() => ({
      phase: document.querySelector('.arena-shell').className,
      frames: [...document.querySelectorAll('iframe')].map(frame => ({
        work: frame.contentDocument?.body?.dataset.work,
        sent: frame.contentDocument?.body?.dataset.sent === 'true',
      })),
    }));
    if (process.argv.includes('--expect-bug')) {
      await page.waitForTimeout(1400);
      const stalled = await state();
      assert.match(stalled.phase, /phase-intro.*works-hold/);
      assert.ok(stalled.frames.every(frame => frame.sent));
      await page.screenshot({ path: path.join(out, 'work-ready-before.png'), fullPage: true });
      results.push({ name, reproduced: true, state: stalled });
    } else {
      if (delay === null || delay >= 1500) {
        // 2026-09-25 快门重构：慢作品加载期整个钉在 transition 盖满位
        // （换稿在盖满后、退场等就绪），不再先进 intro 由加载遮罩接手
        await page.waitForTimeout(900);
        const waiting = await state();
        assert.match(waiting.phase, /phase-transition/, 'new slow work must not inherit old readiness');
        assert.ok(waiting.frames.every(frame => !frame.sent));
        const cover = await page.locator('.transition-shutter').evaluate(el => {
          const style = getComputedStyle(el, '::before');
          return { transform: style.transform, background: style.backgroundColor, visible: getComputedStyle(el).visibility };
        });
        assert.ok(['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(cover.transform), `${theme}: waiting curtain must stay at full cover`);
        assert.equal(cover.visible, 'visible');
        assert.equal(cover.background, theme === 'ink' ? 'rgb(13, 13, 12)' : 'rgb(28, 36, 35)');
      }
      if (delay === null) {
        await page.getByRole('button', { name: '跳过此题', exact: true }).waitFor({ timeout: 12000 });
        assert.match((await state()).phase, /works-hold/, 'timeout must not force reveal');
      } else {
        await page.waitForSelector('.phase-voting', { timeout: 6000 });
        const ready = await state();
        assert.ok(ready.frames.every(frame => frame.sent));
        if (count > 2) assert.ok(ready.frames.every(frame => !before.includes(frame.work)));
        assert.equal(new URL(page.url()).hash, '#arena/005');
      }
      assert.deepEqual(errors, []);
      results.push({ name, passed: true });
    }
    await context.close();
    console.log(`PASS ${name}`);
  }
  for (const theme of process.argv.includes('--expect-bug') ? ['paper'] : ['paper', 'ink']) {
  await scenario(`${theme}: 快作品在620ms切换期发出一次通知`, { changeCanvas: true, theme });
  if (!process.argv.includes('--expect-bug')) {
    await scenario(`${theme}: 慢作品不能复用上一件的就绪状态`, { delay: 1600, theme });
    await scenario(`${theme}: 原对局重播不要求作品重发一次性通知`, { count: 2, theme });
    await scenario(`${theme}: 减少动态效果下同题换组`, { changeCanvas: true, reducedMotion: 'reduce', theme });
    await scenario(`${theme}: 未就绪作品超时仍保持遮挡并给跳过出口`, { delay: null, theme });
  }
  }
} finally {
  await writeFile(path.join(out, process.argv.includes('--expect-bug') ? 'work-ready-before.json' : 'work-ready-after.json'), JSON.stringify(results, null, 2));
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
