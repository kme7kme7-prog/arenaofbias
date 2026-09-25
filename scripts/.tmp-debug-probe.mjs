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
page.on('console', m => console.log('[console]', m.text().slice(0, 200)));
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
const PROBE = `<script data-aob-probe>(function(){
var posted=false;function post(){if(posted)return;posted=true;
document.body.dataset.sent='true';
try{parent.postMessage('aob:work-ready','*');}catch(e){}}
function arm(){var f=0;function tick(){f+=1;if(f>=3)setTimeout(post,300);else requestAnimationFrame(tick);}requestAnimationFrame(tick);}
if(document.readyState==='complete')arm();else window.addEventListener('load',arm);
setTimeout(post,5000);})();</script>`;
await page.route('**/fx/*.html', route => route.fulfill({ contentType: 'text/html',
  body: `<!doctype html><html><head>${PROBE}</head><body style="background:#333">w</body></html>` }));
await page.goto(`${base}/#arena/005`);
await page.waitForFunction(() => document.querySelector('.arena-shell')?.className.includes('phase-voting'), null, { timeout: 20000 });
const state = await page.evaluate(() => [...document.querySelectorAll('iframe.html-work')].map(f => {
  const d = f.contentDocument;
  return {
    src: f.getAttribute('src'),
    href: d.location.href,
    ready: d.readyState,
    sent: d.body?.dataset.sent ?? null,
    probe: !!d.querySelector('script[data-aob-probe]'),
  };
}));
console.log('[dbg] iframe docs:', JSON.stringify(state, null, 1));
await browser.close();
server.close();
