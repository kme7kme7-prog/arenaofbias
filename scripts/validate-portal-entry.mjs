// Synthetic APIs/images; actual portal + built game + Gallery source across three origins.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';

const gallery = resolve(process.env.GALLERY_SOURCE ?? '../Show2/ArenaGalleri-intake-20261001');
const origins = { portal:'https://arenaofbias.icu', game:'https://game.arenaofbias.icu', gallery:'https://gallery.arenaofbias.icu' };
const data = { title:'亿模亿样', subtitle:'模型前端效果对比', description:'测试档案', repo:'https://example.com/repo', models:[{ id:'test', name:'测试模型', vendor:'测试厂商' }], tasks:[{ id:'test', title:'测试题', prompt:'测试提示词', results:Array.from({ length:6 }, (_, i) => ({ id:`r${i}`, model:'test', title:'测试作品', status:'verified', addedAt:'2026-10-01', captures:{ desktop:`captures/${i}.svg` }, gallery:[] })) }] };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#43696e"/><circle cx="800" cy="260" r="140" fill="#e3be78"/></svg>';
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.webp':'image/webp', '.woff2':'font/woff2' };
const browser = await chromium.launch({ channel:'msedge', headless:true });
await mkdir('output/portal-entry', { recursive:true });

async function setup({ width=1440, reduced=false, target='game', mode='success', theme='paper' } = {}) {
  const context = await browser.newContext({ viewport:{ width, height:1000 }, reducedMotion:reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  await context.addInitScript(({ mode, theme }) => {
    if (window !== window.top) return;
    localStorage.setItem('aob-theme', theme);
    localStorage.setItem('aob-beta-notice', 'v3');
    if (mode === 'timeout') {
      const original = window.setTimeout;
      window.setTimeout = (fn, ms, ...args) => original(fn, ms === 25000 ? 1200 : ms, ...args);
    }
  }, { mode, theme });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith('/api/')) {
      const status = mode === 'data-fail' ? 503 : url.host.startsWith('gallery.') ? 503 : 200;
      return route.fulfill({ status, json:{ works:[], prompts:[], user:null, ratings:{} } });
    }
    if (path === '/data.json') return route.fulfill({ status:mode === 'data-fail' ? 503 : 200, json:data });
    if (path === '/runtime-config.js') return route.fulfill({ contentType:'text/javascript', body:'' });
    if (path.startsWith('/art/') || path.startsWith('/captures/')) {
      await hold;
      if (mode === 'image-fail') return route.fulfill({ status:404, body:'' });
      if (path.startsWith('/captures/')) return route.fulfill({ contentType:'image/svg+xml', body:svg });
    }
    if (mode === 'module-fail' && (path.startsWith('/assets/index-') && path.endsWith('.js') || path === '/app.js')) return route.fulfill({ status:503, body:'' });
    if (mode === 'css-fail' && path.endsWith('.css')) return route.fulfill({ status:503, body:'' });
    const dir = url.origin === origins.portal ? (process.env.PORTAL_ROOT ?? 'portal') : url.origin === origins.game ? 'dist' : url.origin === origins.gallery ? `${gallery}/site` : null;
    if (!dir) return route.abort();
    try { return await route.fulfill({ contentType:path === '/' ? 'text/html' : mime[extname(path)] ?? 'application/octet-stream', body:await readFile(resolve(dir, `.${path === '/' ? '/index.html' : path}`)) }); }
    catch { return route.fulfill({ status:404, body:'' }); }
  });
  return { context, page, errors, release, target };
}
try {
  for (const target of ['game', 'gallery']) for (const width of [1440, 390, 2048]) for (const reduced of [false, true]) {
    const run = await setup({ target, width, reduced });
    const { page, release, errors, context } = run;
    await page.goto(origins.portal);
    const click = page.locator(target === 'game' ? '.arena .go' : '.gallery .go').click();
    if (!reduced) {
      await page.locator('.portal-cover').waitFor();
      const start = await page.locator('.portal-cover').boundingBox();
      assert.ok(start.width <= width && start.height <= 1000, 'outgoing block starts inside the viewport');
      assert.equal(new URL(page.url()).origin, origins.portal, 'navigation waits for the outgoing cover');
      if (width === 1440) await page.screenshot({ path:`output/portal-entry/${target}-outgoing.png` });
    }
    await page.waitForURL(`${origins[target]}/?entry=portal`, { waitUntil:'domcontentloaded' });
    await page.locator('#site-entry-cover').waitFor();
    await page.waitForTimeout(400);
    const box = await page.locator('#site-entry-cover').boundingBox();
    assert.ok(Math.abs(box.width - width) < 1 && Math.abs(box.height - 1000) < 1, 'arrival covers entire physical viewport');
    assert.notEqual(await page.evaluate(() => window.ArenaEntry.phase), 'done');
    if (!reduced && width !== 2048) await page.screenshot({ path:`output/portal-entry/${target}-${width}-hold.png` });
    release();
    await page.waitForFunction(() => window.ArenaEntry.phase === 'done');
    await click;
    assert.equal(new URL(page.url()).searchParams.has('entry'), false);
    assert.equal(await page.locator('#site-entry-cover').count(), 0);
    assert.equal(await page.locator(target === 'game' ? '#root' : '#app').evaluate(el => el.inert), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'no horizontal overflow');
    if (target === 'game') {
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).zoom), '0.8');
      const footer = await page.locator('.legal-footer').boundingBox();
      assert.ok(footer.y + footer.height >= 900, 'footer stays near page bottom');
    }
    if (!reduced && width !== 2048) await page.screenshot({ path:`output/portal-entry/${target}-${width}-ready.png` });
    assert.deepEqual(errors, []);
    await page.goBack({ waitUntil:'domcontentloaded' });
    assert.equal(await page.locator('main').evaluate(el => el.inert), false);
    assert.equal(await page.locator('.portal-cover').count(), 0);
    await context.close();
    console.log(`${target} ${width} reduced=${reduced}: hold → ready → reveal → back passed`);
  }
  for (const target of ['game', 'gallery']) for (const mode of ['timeout', 'data-fail', 'image-fail', 'module-fail', 'css-fail']) {
    const { context, page, release } = await setup({ target, mode });
    await page.goto(`${origins[target]}/?entry=portal`, { waitUntil:'domcontentloaded' });
    if (mode !== 'timeout') release();
    await page.locator('#site-entry-cover[data-failed]').waitFor();
    assert.equal(await page.locator('#site-entry-cover a').getAttribute('href'), `${origins.portal}/`);
    release();
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.ArenaEntry.phase), 'failed', 'late assets cannot unveil failure');
    if (mode === 'timeout') await page.screenshot({ path:`output/portal-entry/${target}-failure.png` });
    // Retry preserves the arrival marker; failure UI remains independent of app modules.
    await page.locator('#site-entry-cover button').click();
    await page.waitForURL(`${origins[target]}/?entry=portal`, { waitUntil:'domcontentloaded' });
    await context.close();
    console.log(`${target} ${mode}: custom failure and retry passed`);
  }
  const direct = await setup({ theme:'ink' });
  direct.release();
  await direct.page.goto(origins.game);
  await direct.page.locator('.next-header').waitFor();
  assert.equal(await direct.page.locator('#site-entry-cover').count(), 0, 'direct visits keep normal startup');
  assert.equal(await direct.page.evaluate(() => document.documentElement.dataset.theme), 'ink');
  await direct.page.goto(`${origins.game}/#play`);
  const footer = await direct.page.locator('.legal-footer').boundingBox();
  assert.ok(Math.abs(footer.y + footer.height - 1000) < 2, 'menu footer reaches bottom at 80%');
  await direct.context.close();
} finally { await browser.close(); }
