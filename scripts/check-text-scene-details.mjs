import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:5444';
const out = 'output/text-themes-review';
const snapshot = JSON.parse(await readFile('.local/text-themes-review/snapshot.json', 'utf8'));
const id = 'q-200d4b7f9c69b79c';
const valid = snapshot.works.filter(w => w.promptId === id && w.modelId && JSON.parse(w.content).kind === 'text');
const original = work => { const s = JSON.parse(work.content).story; return [s.heading, ...s.paragraphs, s.ending].filter(p => p !== undefined); };
const fontRoot = 'public/fonts/lxgw-wenkai-lite-1.7.0';
const css = await readFile(`${fontRoot}/regular.css`, 'utf8');
const shards = [...css.matchAll(/url\('\.\/([^']+)'\)/g)].map(m => m[1]);
assert.equal(shards.length, 97);
for (const file of shards) assert.ok((await stat(`${fontRoot}/${file}`)).size > 1000);
assert.ok(css.includes('font-display: swap'));

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], fontRequests = [], views = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (r.url().includes('lxgw-wenkai')) fontRequests.push(r.url()); });
await page.addInitScript(() => {
  if (window !== top) return;
  localStorage.setItem('aob-theme', 'paper');
  if (window.name.startsWith('text-review-pair:')) {
    localStorage.setItem('aob-test-pair', JSON.stringify({ ...JSON.parse(window.name.slice(17)), at: Date.now() }));
    window.name = '';
  }
});
const ready = async () => { await page.waitForSelector('.phase-voting'); await page.waitForFunction(() => !document.querySelector('.game-transition')); };
const settled = async () => page.waitForFunction(() => [...document.querySelectorAll('.text-passage:not([hidden])')].every(el => +getComputedStyle(el).opacity === 1));
async function readbacks() {
  const all = await page.locator('.text-reading').evaluateAll(els => els.map(el => ({ id: el.dataset.workId, paragraphs: [...el.querySelectorAll('.text-original')].map(p => p.textContent) })));
  for (const r of all) assert.deepEqual(r.paragraphs, original(valid.find(w => w.id === r.id)));
}
try {
  await page.goto(`${base}/#arena/${id}`); await ready();
  for (const work of valid) {
    const other = valid.find(w => w.modelId !== work.modelId);
    await page.evaluate(mark => window.name = `text-review-pair:${JSON.stringify(mark)}`, { promptId: id, a: work.id, b: other.id });
    await page.reload(); await ready();
    assert.equal(await page.locator(`.text-reading[data-work-id="${work.id}"]`).count(), 1);
    await readbacks();
    for (const label of ['张爱玲', '王家卫', '业主群大妈']) {
      await page.getByRole('button', { name: new RegExp(label) }).click(); await settled();
      assert.ok((await page.locator('.text-reading').allInnerTexts()).every(s => !s.includes(`【${label}】`)));
    }
    await page.getByRole('button', { name: '看全篇', exact: true }).click();
    await readbacks();
  }
  for (const width of [1440, 390]) for (const tone of ['paper', 'ink']) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(value => document.documentElement.dataset.theme = value, tone);
    let columnTops;
    for (const [label, channel] of [['张爱玲', 'prose'], ['王家卫', 'cinema'], ['业主群大妈', 'voice']]) {
      await page.getByRole('button', { name: new RegExp(label) }).click(); await settled();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const rects = await page.locator('.contender').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return [r.y, r.height]; }));
      // Content determines height now; paired columns and controls stay aligned.
      if (width === 1440) {
        assert.deepEqual(rects[0], rects[1]);
        if (columnTops) assert.deepEqual(rects.map(r => r[0]), columnTops);
        columnTops = rects.map(r => r[0]);
      }
      const leadingSpace = await page.locator('.text-reading').evaluateAll(els => els.map(el => {
        const first = [...el.querySelectorAll('.text-original')].find(p => p.getClientRects().length);
        return first.getBoundingClientRect().top - el.getBoundingClientRect().top;
      }));
      assert.ok(leadingSpace.every(space => space >= 0 && space < 60), 'short answers start near the reading area top');
      await page.screenshot({ path: `${out}/details-${channel}-${tone}-${width}.png`, fullPage: true });
      views.push({ channel, tone, width });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/#arena/q-1b9d4f59c2d7b31e`); await ready();
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(() => [...document.fonts].some(f => f.family.includes('WenKai') && f.status === 'loaded')));
  assert.ok((await page.locator('.text-original').first().evaluate(el => getComputedStyle(el).fontFamily)).includes('LXGW WenKai Lite'));
  assert.ok(fontRequests.every(url => url.startsWith(base)));
  for (const scene of ['013', 'q-b23ef619e82dec65']) {
    await page.goto(`${base}/#arena/${scene}`); await ready();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      const gaps = await page.locator('.contender').evaluateAll(els => els.map(el => el.querySelector('.vote-button').getBoundingClientRect().top - el.querySelector('.text-reading').getBoundingClientRect().bottom));
      assert.ok(gaps.every(gap => gap >= 15), `${scene}: reading area must end before the vote footer`);
      for (const reading of await page.locator('.text-reading:not(.text-reading-embedded)').all()) {
        await reading.evaluate(el => el.scrollTop = el.scrollHeight);
        assert.ok(await reading.evaluate(el => Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 2));
      }
    }
  }
  assert.deepEqual(errors, []);
  const report = { channelsChecked: valid.length, views, fontRequests: new Set(fontRequests).size, localFontsOnly: true, readingFooters: 'desktop/mobile separated and scrollable', errors };
  await writeFile(`${out}/details-checks.json`, JSON.stringify(report, null, 2));
  console.log(report);
} finally { await browser.close(); }
