// Local fixture regression: iframe viewport must follow its responsive arena slot.
// Run after npm run build; --expect-bug reproduces the old fixed-height iframe.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright-core';

const out = new URL('../output/work-sizing/', import.meta.url);
await mkdir(out, { recursive: true });
const app = express();
app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url))));
const server = await new Promise(resolve => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  for (const theme of ['paper', 'ink']) {
    for (const mode of process.argv.includes('--web-only') ? ['web'] : ['responsive', 'fixed', 'web']) {
      const fixed = mode === 'fixed';
      const web = mode === 'web';
      const context = await browser.newContext({ viewport: { width: 2048, height: 1200 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(theme => {
        if (window !== window.top) return;
        localStorage.setItem('aob-theme', theme);
        localStorage.setItem('arena-language', 'zh');
        localStorage.setItem('aob-test-pair', JSON.stringify({ promptId: '005', a: 'size-0', b: 'size-1', at: Date.now() }));
      }, theme);
      const works = [0, 1].map(i => ({
        id: `size-${i}`, promptId: '005', modelId: `size-${i}`, modelName: `Size ${i}`, title: 'Size fixture', isDemo: 0,
        content: JSON.stringify(web ? { kind: 'web', template: i === 0 ? 'b' : 'a' } : { kind: 'html', src: `/size-fixture/${i}.html`,
          ...(fixed ? { framing: { width: 1280, height: 720 } } : {}),
        }),
      }));
      await page.route('**/api/**', route => {
        const endpoint = new URL(route.request().url()).pathname;
        const payload = endpoint === '/api/works' ? { works }
          : endpoint === '/api/prompts' ? { prompts: [{ id: '005', kind: 'web', name: '窗口适配回归', prompt: '窗口尺寸', code: 'SIZE' }] }
          : endpoint === '/api/auth/me' ? { user: null }
          : endpoint === '/api/ratings' ? { ratings: [], games: {} }
          : endpoint === '/api/reactions' ? { counts: {}, mine: {} } : {};
        return route.fulfill({ json: payload });
      });
      await page.route('**/size-fixture/*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
        <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#456c77}canvas{display:block;width:100%;height:100%}</style>
        <canvas></canvas><script>
          const canvas=document.querySelector('canvas');
          function resize(){canvas.width=innerWidth;canvas.height=innerHeight;const c=canvas.getContext('2d');
          c.fillStyle='#456c77';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#d9fb51';c.fillRect(0,canvas.height-12,canvas.width,12);}
          addEventListener('resize',resize);resize();parent.postMessage('aob:work-ready','*');
        </script>` }));
      await page.goto(`http://127.0.0.1:${server.address().port}/#arena/005`);
      await page.waitForSelector('.phase-voting');
      for (const [width, height] of [[2048, 1200], [1440, 900], [390, 844], [390, 600], [1440, 1200]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(1200);
        const slots = await page.locator('.work-viewport').evaluateAll(elements => elements.map(slot => {
          const web = slot.querySelector('.web-work');
          if (web) {
            const hero = web.querySelector('.web-hero');
            const footer = web.querySelector('.web-bottom');
            const nav = web.querySelector('nav');
            return { slotHeight: slot.clientHeight, contentHeight: web.clientHeight,
              unusedHeight: Math.max(web.clientHeight, web.scrollHeight) - nav.offsetHeight - hero.offsetHeight - footer.offsetHeight,
              minimumHeight: nav.offsetHeight + 360 + footer.offsetHeight,
              footerBottom: (footer.getBoundingClientRect().bottom - web.getBoundingClientRect().top) / (web.getBoundingClientRect().height / web.offsetHeight),
              heroHeight: hero.offsetHeight };
          }
          const frame = slot.querySelector('iframe');
          const rect = slot.getBoundingClientRect();
          const fr = frame.getBoundingClientRect();
          return { slotWidth: slot.clientWidth, slotHeight: slot.clientHeight, frameWidth: frame.clientWidth,
            frameHeight: frame.clientHeight, bottomGap: rect.bottom - fr.bottom, topGap: fr.top - rect.top,
            canvasHeight: frame.contentDocument.querySelector('canvas').height, canvasViewportHeight: frame.contentWindow.innerHeight };
        }));
        assert.equal(slots.length, 2);
        for (const slot of slots) {
          if (web) {
            if (process.argv.includes('--expect-bug')) {
              if (height === 1200) assert.ok(slot.unusedHeight > 100);
            } else {
              assert.ok(Math.abs(slot.unusedHeight) < 1);
              assert.ok(slot.heroHeight >= 360);
              assert.ok(Math.abs(slot.footerBottom - Math.max(slot.slotHeight, slot.minimumHeight)) < 2);
            }
          } else if (fixed) {
            assert.equal(slot.frameWidth, 1280);
            assert.equal(slot.frameHeight, 720);
            assert.ok(Math.abs(slot.slotWidth / slot.slotHeight - 16 / 9) < 0.02);
          } else if (process.argv.includes('--expect-bug')) {
            assert.equal(slot.frameHeight, 560);
            if (height === 1200) assert.ok(slot.bottomGap > 50);
          } else {
            assert.equal(slot.frameHeight, slot.slotHeight);
            assert.equal(slot.frameWidth, slot.slotWidth);
            assert.ok(Math.abs(slot.bottomGap) < 1);
            assert.ok(Math.abs(slot.topGap) < 1);
            assert.equal(slot.canvasHeight, slot.canvasViewportHeight);
            // CSS zoom may round iframe clientHeight and its inner viewport in opposite directions.
            assert.ok(Math.abs(slot.canvasViewportHeight - slot.frameHeight) <= 1);
          }
        }
        results.push({ theme, mode, width, height, slots });
        if (width === 2048) await page.screenshot({ path: fileURLToPath(new URL(`${theme}-${mode}-${process.argv.includes('--expect-bug') ? 'before' : 'after'}.png`, out)) });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
  console.log(`PASS ${results.length} viewport cases, both panels, HTML and built-in web layouts`);
} finally {
  await writeFile(new URL(process.argv.includes('--expect-bug') ? 'before.json' : 'after.json', out), JSON.stringify(results, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

