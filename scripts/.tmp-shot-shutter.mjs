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
const PROBE = `<script data-aob-probe>(function(){var p=false;function post(){if(p)return;p=true;document.body.dataset.sent='true';parent.postMessage('aob:work-ready','*');}function arm(){var f=0;function t(){f+=1;if(f>=3)setTimeout(post,300);else requestAnimationFrame(t);}requestAnimationFrame(t);}if(document.readyState==='complete')arm();else addEventListener('load',arm);setTimeout(post,5000);})();</script>`;
const works = ['a1','b1','a2','b2'].map(id => ({ id: 'fx-' + id, promptId: '005', modelId: 'm-' + id, modelName: id.toUpperCase(), title: id, isDemo: 0,
  content: JSON.stringify({ kind: 'html', src: `/fx/${id}.html` }) }));
await page.route('**/api/**', route => {
  const ep = new URL(route.request().url()).pathname;
  if (ep === '/api/works') return route.fulfill({ json: { works } });
  if (ep === '/api/prompts') return route.fulfill({ json: { prompts: [{ id: '005', kind: 'web', name: '快门帧', prompt: 'x', code: 'FX', category: '3D 场景' }] } });
  if (ep === '/api/auth/me') return route.fulfill({ json: { user: null } });
  if (ep === '/api/ratings') return route.fulfill({ json: { ratings: [], games: {} } });
  if (ep === '/api/reactions') return route.fulfill({ json: { counts: {}, mine: {} } });
  return route.fulfill({ json: {} });
});
const delays = { a1: 250, b1: 250, a2: 250, b2: 2600 };
await page.route('**/fx/**', route => {
  const id = new URL(route.request().url()).pathname.match(/(\w+)\.html/)[1];
  return new Promise(r => setTimeout(r, delays[id] ?? 300)).then(() =>
    route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head>${PROBE}</head><body data-work="${id}" style="margin:0;background:${id[0]==='a'?'#5a2d2d':'#2d3a5a'};font:26px monospace;color:#fff;padding:40px">${id} · delay ${delays[id]}ms</body></html>` }));
});
await page.addInitScript(() => { localStorage.setItem('arena-language', 'zh'); });
await page.goto(`${base}/#arena/005`);
await page.waitForFunction(() => document.querySelector('.arena-shell')?.className.includes('phase-voting'), null, { timeout: 20000 });
await page.click('.continue-same');
// 等快门盖满（A 侧条已 done、B 侧还在跑）——2600ms 的大作品保证窗口足够
await page.waitForFunction(() => {
  const s = document.querySelector('.transition-shutter');
  return s && getComputedStyle(s).clipPath.replace(/\s/g, '').match(/^inset\(0(px|%)0(px|%)0(px|%)0(px|%)\)$/);
}, null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(500);
const truth = await page.evaluate(() => {
  const r = el => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.top), Math.round(b.bottom)]; };
  const sh = document.querySelector('.transition-shutter');
  return {
    parent: sh.parentElement.className,
    shutter: r(sh),
    stage: r(document.querySelector('.arena-stage')),
    clip: getComputedStyle(sh).clipPath,
    zIndex: getComputedStyle(sh).zIndex,
    position: getComputedStyle(sh).position,
    panel: r(document.querySelector('.work-panel')),
    panelZ: getComputedStyle(document.querySelector('.work-panel')).zIndex,
    panelTransform: getComputedStyle(document.querySelector('.work-panel')).transform,
    panelOpacity: getComputedStyle(document.querySelector('.work-panel')).opacity,
  };
});
console.log(JSON.stringify(truth, null, 1));
await page.screenshot({ path: 'output/playwright/fx-shutter-mid.png' });
console.log('shutter frame saved');
await browser.close();
server.close();
