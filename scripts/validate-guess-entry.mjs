// Build first; isolated API fixtures exercise the menu entry without a live game.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import ts from 'typescript';
import { chromium } from 'playwright-core';

const source = await readFile(new URL('../lib/game-transitions.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const app = express();
app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url))));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
await mkdir('output/guess-entry', { recursive: true });
try {
  for (const theme of ['paper', 'ink']) for (const width of [1440, 390]) for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(theme => {
      if (window !== window.top) return;
      localStorage.setItem('aob-theme', theme);
      localStorage.setItem('arena-language', 'zh');
      localStorage.setItem('aob-beta-notice', 'v3');
      window.__guessFrames = [];
      const sample = () => {
        const shell = document.querySelector('.gt-deal-shell');
        if (shell) {
          const r = shell.getBoundingClientRect();
          window.__guessFrames.push({ hash: location.hash, full: r.left <= 0 && r.right >= innerWidth && r.top <= 0 && r.bottom >= innerHeight });
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, theme);
    await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/guess/today'
      ? { dayKey: '2026-10-01', dayNumber: 1, attributes: ['vendor', 'released', 'openWeights', 'contextK', 'modalities', 'reasoning', 'priceTier'], models: [] }
      : { user: null, prompts: [], works: [] } }));
    await page.goto(`http://127.0.0.1:${server.address().port}/#play`);
    await page.locator('a[href="#guess"]').click();
    await page.waitForURL('**/#guess');
    await page.waitForFunction(() => !document.querySelector('.game-transition'));
    if (reducedMotion === 'no-preference') {
      const frames = await page.evaluate(() => window.__guessFrames);
      assert.ok(frames.some(f => f.hash === '#play' && !f.full), 'card flies in before changing routes');
      assert.ok(frames.find(f => f.hash === '#guess')?.full, 'guess first mounts behind the full card');
      // Freeze the shared factory at the historical display beat for visual review.
      await page.evaluate(async moduleUrl => {
        const { createGameTransition } = await import(moduleUrl);
        window.__guessReview = createGameTransition('deal');
        window.__guessReview.seek(1200);
      }, moduleUrl);
      assert.equal(await page.locator('.gt-deal-clue').count(), 7);
      const contrast = await page.locator('.gt-deal-copy').evaluate(node => ({ color: getComputedStyle(node).color, background: getComputedStyle(document.querySelector('.gt-deal-half')).backgroundColor }));
      assert.notEqual(contrast.color, contrast.background);
      await page.screenshot({ path: `output/guess-entry/${theme}-${width}.png` });
      await page.evaluate(() => window.__guessReview.dispose());
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${theme}/${width}/${reducedMotion}: restored card, covered routing, cleanup`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
