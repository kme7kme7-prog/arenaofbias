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
const page = await browser.newPage({ viewport: { width: 1747, height: 838 } });
const works = ['a1','b1','a2','b2'].map(id => ({ id: 'fx-' + id, promptId: '005', modelId: 'm-' + id, modelName: id.toUpperCase(), title: id, isDemo: 0,
  content: JSON.stringify({ kind: 'html', src: `/fx/${id}.html` }) }));
await page.route('**/api/**', route => {
  const ep = new URL(route.request().url()).pathname;
  if (ep === '/api/works') return route.fulfill({ json: { works } });
  if (ep === '/api/prompts') return route.fulfill({ json: { prompts: [{ id: '005', kind: 'web', name: 'x', prompt: 'x', code: 'FX', category: 'c' }] } });
  if (ep === '/api/auth/me') return route.fulfill({ json: { user: null } });
  if (ep === '/api/ratings') return route.fulfill({ json: { ratings: [], games: {} } });
  if (ep === '/api/reactions') return route.fulfill({ json: { counts: {}, mine: {} } });
  return route.fulfill({ json: {} });
});
await page.route('**/fx/**', route => route.fulfill({ contentType: 'text/html',
  body: `<!doctype html><html><head><script data-aob-probe>setTimeout(()=>{document.body.dataset.sent='true';parent.postMessage('aob:work-ready','*');},800);</script></head><body style="background:#5a2d2d">w</body></html>` }));
await page.goto(`${base}/#arena/005`);
await page.waitForFunction(() => document.querySelector('.arena-shell')?.className.includes('phase-voting'), null, { timeout: 20000 });
await page.click('.continue-same');
await page.waitForFunction(() => document.querySelector('.arena-shell')?.className.includes('phase-transition'), null, { timeout: 5000 });
await page.waitForTimeout(700);
  await page.addStyleTag({ content: '.transition-shutter { z-index: 60 !important; transform: translateZ(0); } .work-inner, .work-viewport { transform: none !important; }' });
const stack = await page.evaluate(() => document.elementsFromPoint(170, 400).map(el => el.tagName + '.' + (el.className && el.className.toString().split(' ').join('.')) ).slice(0, 6));
  const m = await page.evaluate(() => {
  const r = el => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };
  const shutter = document.querySelector('.transition-shutter');
  const shell = document.querySelector('.arena-shell');
  const stage = document.querySelector('.arena-stage');
  const iframe = document.querySelector('iframe.html-work');
  const panel = document.querySelector('.work-panel');
  const contender = document.querySelector('.contender');
  const terminal = document.querySelector('.main-terminal');
  return {
    shell: r(shell), terminal: r(terminal), stage: r(stage), shutter: r(shutter),
    iframe: r(iframe), panel: r(panel), contender: r(contender),
    shutterClip: getComputedStyle(shutter).clipPath,
  };
});
console.log("stack@170,400:", stack);console.log(JSON.stringify(m, null, 1));
await browser.close();
server.close();
// 追加：elementsFromPoint 看红条上到底是什么
