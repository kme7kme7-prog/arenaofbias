import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:5444';
const snapshot = JSON.parse(await readFile('.local/text-themes-review/snapshot.json', 'utf8'));
const forest = snapshot.works.filter(w => w.promptId === '013' && w.modelId);
const oldPapers = forest.filter(w => JSON.parse(w.content).kind === 'html');
assert.equal(oldPapers.length, 6);
const native = forest.find(w => JSON.parse(w.content).kind === 'text');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], views = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  if (window !== top) return;
  localStorage.setItem('aob-theme', 'paper');
  if (window.name.startsWith('text-review-pair:')) {
    localStorage.setItem('aob-test-pair', JSON.stringify({ ...JSON.parse(window.name.slice(17)), at: Date.now() }));
    window.name = '';
  }
});
const ready = async () => {
  await page.waitForSelector('.phase-voting');
  await page.waitForFunction(() => !document.querySelector('.game-transition'));
};
try {
  await page.goto(`${base}/#arena/013`); await ready();
  for (const work of oldPapers) {
    await page.evaluate(mark => window.name = `text-review-pair:${JSON.stringify(mark)}`, { promptId: '013', a: work.id, b: native.id });
    await page.reload(); await ready();
    const reading = page.locator(`.text-reading[data-work-id="${work.id}"]`);
    const iframe = reading.locator('iframe');
    assert.equal(await reading.getAttribute('data-paper-embed'), '');
    assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts allow-same-origin');
    assert.ok(await iframe.evaluate(el => el.contentDocument === null), 'legacy document remains isolated');
    const frame = iframe.contentFrame();
    const originalText = await frame.locator('main').textContent();
    assert.ok(originalText.length > 100);
    // The served HTML is still byte-for-byte the archived original, including its styles.
    const response = await page.request.get(new URL(await iframe.getAttribute('src'), base).href);
    assert.ok(response.headers()['content-security-policy'].includes('sandbox allow-scripts'));
    const received = createHash('sha256').update(await response.body()).digest('hex');
    assert.equal(received, snapshot.htmlFiles[work.id].sha256);
    for (const width of [1440, 390]) for (const tone of ['paper', 'ink']) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.evaluate(t => document.documentElement.dataset.theme = t, tone);
      assert.ok(await frame.locator('html').evaluate(() => matchMedia('(prefers-color-scheme: light)').matches), 'iframe stays light in both parent page themes');
      const style = await iframe.evaluate(el => { const s = getComputedStyle(el); return { blend: s.mixBlendMode, filter: s.filter }; });
      assert.equal(style.blend, tone === 'paper' ? 'multiply' : 'screen');
      assert.equal(await frame.locator('main').textContent(), originalText);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `output/text-themes-review/paper-${work.id}-${tone}-${width}.png`, fullPage: true });
      views.push({ work: work.id, tone, width, ...style });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.contender-a .expand-control').click();
  const expanded = page.locator('.expanded-work iframe');
  await expanded.waitFor();
  assert.equal(await expanded.evaluate(el => getComputedStyle(el).mixBlendMode), 'normal');
  assert.equal(await expanded.evaluate(el => getComputedStyle(el).filter), 'none');
  // Browser dark mode (rather than a DevTools override of every frame's media)
  // must still inherit the light-only embedding element's color scheme.
  const darkBrowser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--force-dark-mode'] });
  try {
    const dark = await darkBrowser.newPage({ colorScheme: null });
    await dark.addInitScript(mark => {
      if (window !== top) return;
      localStorage.setItem('aob-test-pair', JSON.stringify({ ...mark, at: Date.now() }));
    }, { promptId: '013', a: oldPapers[0].id, b: native.id });
    await dark.goto(`${base}/#arena/013`); await dark.waitForSelector('.phase-voting');
    assert.ok(await dark.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches));
    assert.ok(await dark.locator('[data-paper-embed] iframe').contentFrame().locator('html').evaluate(() => matchMedia('(prefers-color-scheme: light)').matches));
  } finally { await darkBrowser.close(); }
  assert.deepEqual(errors, []);
  await writeFile('output/text-themes-review/paper-checks.json', JSON.stringify({ views, errors, expandedOriginal: true }, null, 2));
  console.log(`Verified ${oldPapers.length} untouched HTML works, ${views.length} paper/ink and desktop/mobile views, and original expanded view.`);
} finally { await browser.close(); }
