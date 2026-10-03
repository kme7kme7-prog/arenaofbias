// Production curtain CSS/DOM through the local review page, including CSS zoom.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:5441';
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
await mkdir('.local/curtain-copy', { recursive: true });
try {
  const page = await browser.newPage();
  await page.goto(`${base}/reference/arena-cover-review.html`);
  await page.waitForFunction(() => !!window.__coverReview);
  for (const width of [1920, 1366, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const zoom of [.8, 1, 1.25]) for (const theme of ['paper', 'ink']) {
      await page.evaluate(({ zoom, theme }) => {
        document.documentElement.style.zoom = zoom;
        document.documentElement.dataset.theme = theme;
        window.__coverReview.cover();
      }, { zoom, theme });
      await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.gt-static-title')).fontSize) > 20);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const layout = await page.evaluate(() => {
        const layer = document.querySelector('.game-transition');
        const title = layer.querySelector('.gt-static-title');
        const bounds = layer.getBoundingClientRect();
        const text = title.getBoundingClientRect();
        const upper = getComputedStyle(layer.querySelector('.gt-match-upper'), '::before');
        const lower = getComputedStyle(layer.querySelector('.gt-match-lower'), '::before');
        const caption = getComputedStyle(layer.querySelector('.gt-static-caption'));
        const note = getComputedStyle(layer.querySelector('.gt-match-holdnote'));
        return {
          innerBorders: [parseFloat(upper.borderBottomWidth), parseFloat(lower.borderTopWidth)],
          fits: text.left >= bounds.left && text.right <= bounds.right && text.top > bounds.top + 30 && text.bottom < bounds.bottom - 30,
          captionFont: caption.fontFamily, noteFont: note.fontFamily,
          noteSpacing: parseFloat(note.letterSpacing), noteSize: parseFloat(note.fontSize),
        };
      });
      assert.deepEqual(layout.innerBorders, [0, 0], `no frame rules across copy: ${width}/${zoom}/${theme}`);
      assert.ok(layout.fits, `long title inside curtain: ${width}/${zoom}/${theme}`);
      assert.ok(layout.captionFont.includes('Microsoft YaHei') && layout.noteFont.includes('Microsoft YaHei'), 'Chinese copy uses the site sans stack');
      assert.ok(layout.noteSpacing < layout.noteSize * .1, 'loading copy is not widely spaced');
      if (width === 1920 && zoom === .8) await page.screenshot({ path: `.local/curtain-copy/${theme}.png` });
    }
  }
  console.log('PASS long title/frame separation and caption typography: 18 width/zoom/theme combinations');
} finally { await browser.close(); }
