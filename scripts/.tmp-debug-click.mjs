import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright-core';
const root = fileURLToPath(new URL('..', import.meta.url));
const app = express();
app.use(express.static(path.join(root, 'dist')));
const server = await new Promise(r => { const i = app.listen(0, '127.0.0.1', () => r(i)); });
const base = `http://127.0.0.1:${server.address().port}`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ executablePath: existsSync(edge) ? edge : undefined, headless: true });
const page = await browser.newPage();
page.on('console', m => { if (m.text().includes('[dbg]')) console.log(m.text()); });
await page.route('**/api/**', route => {
  const ep = new URL(route.request().url()).pathname;
  if (ep === '/api/works') return route.fulfill({ json: { works: [
    { id: 'fx-a1', promptId: '005', modelId: 'm1', modelName: 'A1', title: 'A1', isDemo: 0, content: JSON.stringify({ kind: 'html', src: '/fx/a1.html' }) },
    { id: 'fx-b1', promptId: '005', modelId: 'm2', modelName: 'B1', title: 'B1', isDemo: 0, content: JSON.stringify({ kind: 'html', src: '/fx/b1.html' }) },
  ] } });
  if (ep === '/api/prompts') return route.fulfill({ json: { prompts: [{ id: '005', kind: 'web', name: '调试', prompt: 'x', code: 'FX', category: 'c' }] } });
  if (ep === '/api/auth/me') return route.fulfill({ json: { user: null } });
  if (ep === '/api/ratings') return route.fulfill({ json: { ratings: [], games: {} } });
  if (ep === '/api/reactions') return route.fulfill({ json: { counts: {}, mine: {} } });
  return route.fulfill({ json: {} });
});
await page.route('**/fx/*.html', route => route.fulfill({ contentType: 'text/html',
  body: `<!doctype html><html><head><script data-aob-probe>setTimeout(()=>{document.body.dataset.sent='true';parent.postMessage('aob:work-ready','*');},900);</script></head><body style="background:#333">w</body></html>` }));
await page.goto(`${base}/#arena/005`);
await page.waitForFunction(() => document.querySelector('.arena-shell')?.className.includes('phase-voting'), null, { timeout: 20000 });
console.log('[dbg] voting reached, clicking continue-same');
const info = await page.evaluate(() => {
  const btn = document.querySelector('.continue-same');
  return { found: !!btn, disabled: btn?.disabled, cls: btn?.className, rect: btn?.getBoundingClientRect().toJSON() };
});
console.log('[dbg] button:', JSON.stringify(info));
await page.click('.continue-same');
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(150);
  const phase = await page.evaluate(() => document.querySelector('.arena-shell')?.className.match(/phase-(\w+)/)?.[1]);
  console.log(`[dbg] t+${(i + 1) * 150}ms phase=${phase}`);
}
await browser.close();
server.close();
