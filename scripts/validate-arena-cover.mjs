// Uses the production modules through Vite; APIs/work content are isolated fixtures.
// Start dev:web on COVER_BASE (default http://127.0.0.1:5441) first.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const base = process.env.COVER_BASE || 'http://127.0.0.1:5441';
const out = new URL('../output/arena-cover/', import.meta.url);
await mkdir(out, { recursive: true });
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ executablePath: process.env.THUMB_BROWSER || (existsSync(edge) ? edge : undefined), headless: true });
const results = [];
const geometry = page => page.evaluate(() => {
  const layer = document.querySelector('.game-transition');
  const parts = [...document.querySelectorAll('.arena-shell .field-meta,.arena-shell .arena-stage,.arena-shell .round-console')].map(el => el.getBoundingClientRect());
  const rect = layer.getBoundingClientRect();
  const target = { left: Math.min(...parts.map(r => r.left)), right: Math.max(...parts.map(r => r.right)), top: Math.min(...parts.map(r => r.top)), bottom: Math.max(...parts.map(r => r.bottom)) };
  const cover = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  const points = [
    [target.left + 3, Math.max(0, target.top) + 3],
    [target.right - 3, Math.min(innerHeight, target.bottom) - 3],
  ].filter(([x, y]) => x > 0 && x < innerWidth && y > 0 && y < innerHeight);
  return { target, cover, pixelsCovered: points.every(([x, y]) => document.elementFromPoint(x, y)?.closest('.game-transition') === layer) };
});
const check = async (page, name) => {
  const state = await geometry(page);
  for (const edge of ['left', 'right', 'top', 'bottom']) assert.ok(Math.abs(state.cover[edge] - state.target[edge]) < .6, `${name}: ${edge} ${JSON.stringify(state)}`);
  assert.equal(state.pixelsCovered, true, `${name}: material covers visible corners`);
  results.push({ name, ...state });
  console.log(`PASS ${name}`);
};
try {
  const page = await browser.newPage();
  await page.goto(`${base}/reference/arena-cover-review.html`);
  await page.waitForFunction(() => !!window.__coverReview);
  for (const width of [1920, 1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const zoom of [.8, 1, .67, 1.25]) {
      await page.evaluate(zoom => { window.__coverReview.clear(); document.documentElement.style.zoom = zoom; window.scrollTo(0, 0); window.__coverReview.cover(); }, zoom);
      await check(page, `review ${width}px zoom ${zoom}`);
      await page.evaluate(() => { scrollTo(0, 160); window.__coverReview.align(); });
      await check(page, `scrolled ${width}px zoom ${zoom}`);
    }
  }
  await page.evaluate(() => { document.documentElement.style.zoom = '.8'; window.__coverReview.cover(); });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => window.__coverReview.align());
  await check(page, 'active curtain follows viewport resize');
  await page.evaluate(() => { document.querySelector('.arena-stage').style.height = '900px'; window.__coverReview.align(); });
  await check(page, 'active curtain follows changed stage height');
  await page.close();
  for (const theme of ['paper', 'ink']) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const live = await context.newPage();
    const errors = [];
    live.on('pageerror', error => errors.push(error.message));
    await live.addInitScript(theme => { localStorage.setItem('aob-theme', theme); localStorage.setItem('arena-language', 'zh'); }, theme);
    await live.route('**/api/**', route => {
      const endpoint = new URL(route.request().url()).pathname;
      const prompts = ['005', '006'].map(id => ({ id, kind: 'web', name: `题目 ${id}`, prompt: '比较', code: 'COVER' }));
      const works = prompts.flatMap(prompt => Array.from({ length: 10 }, (_, i) => ({ id: `${prompt.id}-${i}`, promptId: prompt.id, modelId: `m${i}`, modelName: `Model ${i}`, title: `作品 ${i}`, isDemo: 0, content: JSON.stringify({ kind: 'html', src: `https://c${(Number(prompt.id) * 100 + i).toString(16).padStart(32, '0')}.w.arenaofbias.icu/` }) })));
      const payload = endpoint === '/api/works' ? { works } : endpoint === '/api/prompts' ? { prompts } : endpoint === '/api/auth/me' ? { user: null } : endpoint === '/api/ratings' ? { ratings: [], games: {} } : {};
      return route.fulfill({ json: payload });
    });
    await live.route('https://*.w.arenaofbias.icu/**', route => route.fulfill({ contentType: 'text/html', body: `<html><body style="margin:0;background:#6b8795">Fixture<script>setTimeout(() => parent.postMessage('aob:work-ready','*'),1800)</script></body></html>` }));
    await live.goto(`${base}/#arena/005`);
    await live.waitForSelector('.phase-voting');
    await live.getByRole('button', { name: '换个题库继续', exact: true }).click();
    await live.waitForSelector('.game-transition[data-gt-hold="1"]');
    await check(live, `${theme} real next-prompt held curtain at 80%`);
    await live.screenshot({ path: fileURLToPath(new URL(`${theme}-covered.png`, out)) });
    await live.waitForFunction(() => location.hash === '#arena/006');
    await live.waitForSelector('.phase-voting');
    await live.waitForSelector('.game-transition', { state: 'detached' });
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await writeFile(new URL('results.json', out), JSON.stringify(results, null, 2));
  await browser.close();
}
