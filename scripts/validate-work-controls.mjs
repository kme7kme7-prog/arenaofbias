// Local-only browser regression; shared content server must run at 5190/5191.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const base = process.env.CONTROLS_BASE || 'http://127.0.0.1:5441';
const api = process.env.CONTROLS_API || 'http://127.0.0.1:5190';
if (![base, api].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw new Error('Local test servers only');
const { works } = await (await fetch(`${api}/api/works`)).json();
const planes = works.filter(work => work.promptId === '011').map(work => ({ ...work, content: JSON.parse(work.content) })).filter(work => work.content.kind === 'html');
const tagWork = planes.find(work => work.id === 'dp-011-deepseek-v4.1-flash-xhigh');
assert.ok(tagWork, 'real projected-label regression work');
const scriptUrl = new URL('/__aob_fold.js', planes[0].content.src);
const contentHost = scriptUrl.host;
scriptUrl.hostname = '127.0.0.1';
const script = await new Promise((resolve, reject) => {
  http.get(scriptUrl, { headers: { host: contentHost } }, response => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', chunk => { body += chunk; });
    response.on('end', () => resolve(body));
  }).on('error', reject);
});
assert.ok(script.includes('data-aob-fold-panel'), 'restart local backend before running');
const browser = await chromium.launch({ executablePath: process.env.THUMB_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const out = new URL('../.local/work-controls/', import.meta.url);
await mkdir(out, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const fixture = async (body) => {
    await page.goto('about:blank');
    await page.setContent(`<style>body{margin:0}canvas{position:fixed;inset:0;width:100%;height:100%}aside{position:fixed;right:0;top:20px;width:340px;height:650px}</style>${body}`);
    await page.addScriptTag({ content: script });
  };
  await fixture('<canvas></canvas><aside><input type="range" value="37"><button>起落架</button></aside>');
  assert.equal(await page.locator('[data-aob-fold-panel]').count(), 1, 'overflowing panel folded as a whole');
  await page.evaluate(() => { window.savedCanvas = document.querySelector('canvas'); window.savedInput = document.querySelector('input'); });
  await page.evaluate(() => postMessage({ source: 'sp-arena', fold: false }, '*'));
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-aob-fold'));
  assert.equal(await page.locator('input').inputValue(), '37');
  assert.ok(await page.locator('aside').isVisible());
  assert.ok(await page.evaluate(() => window.savedCanvas === document.querySelector('canvas') && window.savedInput === document.querySelector('input')));
  await page.evaluate(() => { const panel = document.createElement('div'); panel.id = 'late'; panel.style.cssText = 'position:fixed;left:0;bottom:0;width:120px;height:80px'; panel.innerHTML = '<input type="range">'; document.body.append(panel); });
  await page.waitForFunction(() => document.querySelector('#late').hasAttribute('data-aob-fold-panel'));
  assert.ok(await page.locator('#late').isVisible(), 'late detection preserves user choice');
  await page.evaluate(() => dispatchEvent(new MessageEvent('message', { source: null, data: { source: 'sp-arena', fold: true } })));
  assert.ok(await page.locator('aside').isVisible(), 'foreign sender ignored');
  for (const [name, body] of [
    ['no canvas', '<aside><input type="range"></aside>'],
    ['entry gate', '<canvas></canvas><aside><button>开始体验</button><button>设置</button></aside>'],
    ['form', '<canvas></canvas><form style="position:fixed"><input type="email"><button>提交</button></form>'],
    ['prose', '<canvas></canvas><aside aria-live="polite"><p>建筑介绍</p><button>前进</button><button>后退</button></aside>'],
    ['layout sidebar', '<canvas></canvas><section><input type="range"><button>设置</button></section>'],
  ]) {
    await fixture(body);
    assert.equal(await page.locator('[data-aob-fold-panel]').count(), 0, name);
  }
  console.log('PASS fixtures: full panel, restore identity/value, late controls, sender validation, five protected cases');

  const labelLayer = '<div id="labels" style="position:fixed;inset:0;pointer-events:none">' +
    ['机头', '机翼', '尾翼', '起落架'].map((label, index) => `<div class="tag" style="position:absolute;left:${index * 80}px;top:40px;pointer-events:none">${label}</div>`).join('') + '</div>';
  await fixture(`<canvas></canvas>${labelLayer}`);
  assert.equal(await page.locator('[data-aob-fold-labels]').count(), 1);
  assert.equal(await page.locator('#labels').isVisible(), false);
  await page.evaluate(() => postMessage({ source: 'sp-arena', fold: false }, '*'));
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-aob-fold'));
  assert.ok(await page.locator('#labels').isVisible(), 'restore intact annotations');
  await fixture(labelLayer);
  assert.equal(await page.locator('[data-aob-fold-labels]').count(), 0, 'ordinary tags without a scene remain');
  await fixture('<canvas></canvas><div style="position:fixed;inset:0;pointer-events:none"><h1>作品标题</h1><span class="tag">分类标签</span></div>');
  assert.equal(await page.locator('[data-aob-fold-labels]').count(), 0, 'mixed title layer remains');
  await fixture('<canvas></canvas>');
  await page.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), labelLayer);
  await page.waitForSelector('[data-aob-fold-labels]', { state: 'attached' });
  assert.equal(await page.locator('#labels').isVisible(), false, 'late labels fold without user action');
  console.log('PASS projected labels, restore, late labels and ordinary tag/title protection');

  // Sample real uploaded and curated work roots, with the actual browser DOM and CSS.
  const samples = [];
  for (const work of [...planes.slice(0, 9), tagWork]) {
    await page.setViewportSize({ width: 797, height: 492 });
    await page.goto(`${work.content.src}?aob=arena-fold`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    samples.push({ id: work.id, ...await page.evaluate(() => ({
      canvases: document.querySelectorAll('canvas').length,
      panels: [...document.querySelectorAll('[data-aob-fold-panel]')].map(el => `${el.tagName}#${el.id}.${el.className}`),
      labels: document.querySelectorAll('[data-aob-fold-labels]').length,
    })) });
  }
  await writeFile(new URL('samples.json', out), JSON.stringify(samples, null, 2));
  console.log('REAL SAMPLES', JSON.stringify(samples));

  await page.setViewportSize({ width: 1800, height: 1050 });
  await page.addInitScript(({ origin, a, b }) => {
    if (location.origin === origin) localStorage.setItem('aob-test-pair', JSON.stringify({ promptId: '011', a, b, at: Date.now() }));
  }, { origin: base, a: tagWork.id, b: planes[8].id });
  await page.goto(`${base}/#arena/011`);
  await page.waitForSelector('.phase-voting', { timeout: 35000 });
  assert.equal(await page.locator('.work-controls-toggle').count(), 0, 'preview has no manual show toggle');
  const frames = page.frames().filter(frame => frame.url().includes('aob=arena-fold'));
  assert.equal(frames.length, 2);
  for (const frame of frames) await frame.evaluate(() => { window.savedCanvas = document.querySelector('canvas'); window.savedTime = performance.timeOrigin; });
  const sources = await page.locator('.arena-stage iframe').evaluateAll(nodes => nodes.map(node => node.src));
  const tagged = frames.find(frame => new URL(frame.url()).origin === new URL(tagWork.content.src).origin);
  assert.ok(tagged, `requested label work must remain in the pair: ${JSON.stringify({ target: tagWork.content.src, frames: frames.map(frame => frame.url()) })}`);
  await tagged.waitForSelector('[data-aob-fold-labels]', { state: 'attached' });
  assert.equal(await tagged.locator('#labels').isVisible(), false);
  await page.screenshot({ path: fileURLToPath(new URL('clean-preview.png', out)) });
  await page.getByRole('button', { name: /放大查看作品/ }).first().click();
  const expanded = page.locator('.expanded-work iframe');
  await expanded.waitFor();
  const expandedFrame = await expanded.elementHandle().then(handle => handle.contentFrame());
  assert.ok(!expandedFrame.url().includes('arena-fold'));
  await expandedFrame.waitForSelector('#labels .tag');
  assert.ok(await expandedFrame.locator('#labels').isVisible());
  assert.ok(await expandedFrame.locator('#ctl').isVisible());
  assert.equal(await expandedFrame.locator('[data-aob-fold]').count(), 0);
  await page.screenshot({ path: fileURLToPath(new URL('expanded-original.png', out)) });
  await page.getByRole('button', { name: '关闭作品预览' }).click();
  assert.deepEqual(await page.locator('.arena-stage iframe').evaluateAll(nodes => nodes.map(node => node.src)), sources);
  for (const frame of frames) assert.ok(await frame.evaluate(() => window.savedCanvas === document.querySelector('canvas') && window.savedTime === performance.timeOrigin));
  assert.equal(await tagged.locator('#labels').isVisible(), false, 'closing expanded view keeps previews clean');
  console.log('PASS real preview hides labels/panels; expanded restores original; closing keeps preview document and Canvas');
  await page.goto(`${base}/#arena/010`);
  await page.locator('.arena-stage iframe').first().waitFor({ timeout: 25000 });
  assert.ok((await page.locator('.arena-stage iframe').evaluateAll(nodes => nodes.map(node => node.src))).every(src => src.includes('arena-fold')), 'all entertainment topics opt in');
  console.log('PASS opt-in no longer depends on topic category');

  // Client-only fixture identity; no real login, vote, or database write.
  const formalPage = await browser.newPage({ viewport: { width: 1800, height: 1050 } });
  await formalPage.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'fixture-admin', username: 'fixture-admin', role: 'admin' } } }));
  await formalPage.route('**/api/works', route => route.fulfill({ json: { works: works.filter(work => [tagWork.id, planes[8].id].includes(work.id)) } }));
  await formalPage.goto(`${base}/#formal/011`);
  await formalPage.waitForSelector('.phase-voting', { timeout: 35000 });
  const formalFrames = formalPage.frames().filter(frame => frame.url().includes('.localhost:5191'));
  assert.equal(formalFrames.length, 2);
  for (const frame of formalFrames) {
    assert.ok(!frame.url().includes('arena-fold'));
    assert.equal(await frame.locator('[data-aob-fold]').count(), 0);
  }
  const formalTags = formalFrames.find(frame => new URL(frame.url()).origin === new URL(tagWork.content.src).origin);
  assert.ok(await formalTags.locator('#labels').isVisible());
  assert.ok(await formalTags.locator('#ctl').isVisible());
  await formalPage.screenshot({ path: fileURLToPath(new URL('formal-original.png', out)) });
  console.log('PASS formal preview retains original controls and labels with no Arena folding script');
} finally { await browser.close(); }
