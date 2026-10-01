// npm run build && node scripts/validate-arena-entry.mjs
// In-memory API/work fixtures; no production votes or model calls.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright-core';
const app = express();
app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url))));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const stalled = process.argv.includes('--stalled');
const layout = process.argv.includes('--layout');
try {
  for (const theme of stalled ? ['paper'] : ['paper', 'ink']) for (const reducedMotion of stalled ? ['no-preference'] : ['no-preference', 'reduce']) {
    const context = await browser.newContext({ reducedMotion, viewport: process.argv.includes('--mobile')
      ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => {
      if (window !== window.top) return;
      localStorage.setItem('aob-theme', theme);
      localStorage.setItem('arena-language', 'zh');
      localStorage.setItem('aob-arena-tour', 'off');
      localStorage.setItem('aob-test-pair', JSON.stringify({ promptId: '005', a: 'entry-a', b: 'entry-b', at: Date.now() }));
      window.__entryLeaks = [];
      window.__layoutFrames = [];
      function sample() {
        const layer = document.querySelector('.gt-match');
        const shell = document.querySelector('.arena-shell');
        const stage = shell?.querySelector('.arena-stage');
        if (stage?.dataset.layoutMoving === 'true') {
          window.__layoutFrames.push({ height: stage.querySelector('.work-viewport').getBoundingClientRect().height,
            exiting: layer?.dataset.gtPhase === 'exit' });
        }
        if (shell && layer?.dataset.gtPhase === 'exit') {
          const loader = shell.querySelector('.loading-overlay');
          if (window.__entryLeaks.length < 3 && (shell.classList.contains('works-hold') || (loader && Number(getComputedStyle(loader).opacity) > 0.01)))
            window.__entryLeaks.push({ shell: shell.className, loader: loader && getComputedStyle(loader).opacity });
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }, theme);
    const works = (layout ? ['005', '006'] : ['005']).flatMap(promptId => ['a', 'b'].map(side => ({ id: promptId === '005' ? `entry-${side}` : `layout-${side}`, promptId, modelId: side,
      modelName: side, title: side, isDemo: 0,
      content: JSON.stringify({ kind: 'html', src: `/entry/${promptId}-${side}.html`, sandboxed: true,
        ...(promptId === '006' ? { framing: { width: 1280, height: 720 } } : {}) }) })));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const json = path === '/api/works' ? { works }
        : path === '/api/prompts' ? { prompts: (layout ? ['005', '006'] : ['005']).map(id => ({ id, kind: 'web', name: '过场门控', prompt: '门控', code: 'ENTRY' })) }
        : path === '/api/auth/me' ? { user: null } : {};
      await route.fulfill({ json });
    });
    await page.route('**/entry/*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
      <style>body{margin:0;background:#345865}</style><script data-aob-probe>
      ${stalled ? '' : "setTimeout(()=>{parent.postMessage('aob:work-ready','*');},2200);"}</script>` }));
    if (layout) {
      await page.goto(`http://127.0.0.1:${server.address().port}/#arena/005`);
      await page.waitForSelector('.phase-voting');
      for (const destination of ['006', '005']) {
        const start = await page.locator('.work-viewport').first().evaluate(node => node.clientHeight);
        await page.evaluate(() => { window.__layoutFrames = []; });
        await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
        await page.waitForURL(`**/#arena/${destination}`);
        await page.waitForSelector('.phase-voting');
        await page.waitForFunction(() => !document.querySelector('.gt-match'));
        const end = await page.locator('.work-viewport').first().evaluate(node => node.clientHeight);
        assert.ok(await page.locator('.work-viewport').evaluateAll(nodes => nodes.every(node => !node.style.height && !node.style.transition)),
          'completed stretch must restore native responsive sizing');
        const frames = await page.evaluate(() => window.__layoutFrames);
        assert.ok(Math.abs(start - end) > 30);
        if (reducedMotion === 'reduce') assert.equal(frames.length, 0);
        else {
          assert.ok(new Set(frames.map(frame => Math.round(frame.height))).size > 5, 'height must pass through intermediate sizes');
          assert.ok(frames.every(frame => !frame.exiting), 'curtain must cover the entire layout animation');
          assert.ok(frames.every(frame => frame.height >= Math.min(start, end) - 1 && frame.height <= Math.max(start, end) + 1));
        }
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${theme}/${reducedMotion}: shrink and grow across keyed arena routes`);
      await context.close();
      continue;
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/#play`);
    await page.getByRole('link', { name: /娱乐测评/ }).click();
    await page.waitForSelector('.gt-match[data-gt-hold="1"]');
    assert.equal(await page.locator('.gt-match').count(), 1);
    if (stalled) {
      await page.getByRole('button', { name: /加载较慢/ }).waitFor({ timeout: 18000 });
      assert.equal(await page.locator('.gt-match').getAttribute('data-gt-phase'), 'entry');
      await page.getByRole('button', { name: /加载较慢/ }).click();
      await page.waitForURL('**/#prompts');
    } else await page.waitForSelector('.arena-shell.phase-voting', { timeout: 12000 });
    await page.waitForFunction(() => !document.querySelector('.gt-match'));
    assert.deepEqual(await page.evaluate(() => window.__entryLeaks), [], `${theme}/${reducedMotion}: loader leaked under exiting curtain`);
    assert.deepEqual(errors, []);
    console.log(`PASS ${theme}/${reducedMotion}: ${stalled ? 'stalled curtain retains a recovery exit' : 'slow works reveal under the upstream curtain'}`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
