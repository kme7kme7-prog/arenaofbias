// npm run build:check first. Real clicks with isolated fixtures, including no-motion navigation.
import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const app = express();
app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url))));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const loadedBoard = process.argv.includes('--loaded-board');
try {
  for (const theme of ['paper', 'ink']) for (const width of [1440, 390]) for (const reducedMotion of loadedBoard ? ['no-preference'] : ['no-preference', 'reduce']) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => {
      if (window !== window.top) return;
      localStorage.setItem('aob-theme', theme);
      localStorage.setItem('arena-language', 'zh');
      localStorage.setItem('aob-beta-notice', 'v3');
      window.__routeFrames = [];
      const sample = () => {
        const layer = document.querySelector('.game-transition');
        if (layer) {
          const plate = layer.querySelector('.gt-material-plate');
          const r = plate?.getBoundingClientRect();
          const copy = layer.querySelector('.gt-static-copy');
          const style = copy && getComputedStyle(copy);
          window.__routeFrames.push({ hash: location.hash, full: r && r.left <= 0 && r.right >= innerWidth && r.top <= 0 && r.bottom >= innerHeight,
            copyHidden: copy?.hidden, copyBackground: style?.backgroundColor, copyBorder: style?.borderTopWidth,
            copyText: copy?.textContent, x: r?.x, y: r?.y,
            push: layer.classList.contains('gt-push') });
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, theme);
    await page.route('**/api/**', route => {
      const endpoint = new URL(route.request().url()).pathname;
      if (endpoint === '/api/show1/leaderboard') {
        if (!loadedBoard) return route.fulfill({ status: 503, json: { error: 'fixture' } });
        const query = new URL(route.request().url()).searchParams;
        const board = { rows: ['a', 'b'].map((id, i) => ({ modelId: id, name: `Fixture ${id}`, sigil: id,
          rating: 1250 - i * 50, games: 40, wins: 25 - i * 10, losses: 15 + i * 10, draws: 0,
          winrate: (25 - i * 10) / 40, topics: 1, trial: false, retired: false })),
          totalVotes: 40, modelCount: 2, promptCount: 1 };
        return route.fulfill({ json: { scope: query.get('scope'), category: query.get('category'), board, allBoard: board,
          radar: { profiles: { a: [60, 50, 40, 50, 60, 50], b: [40, 50, 60, 50, 40, 50] }, average: [50, 50, 50, 50, 50, 50] }, scopedPromptCount: 1 } });
      }
      const json = endpoint === '/api/works' ? { works: ['a', 'b'].map(side => ({
        id: `005-${side}`, promptId: '005', modelId: side, modelName: side, title: side, isDemo: 0,
        content: JSON.stringify({ kind: 'html', html: '<!doctype html><body>Ready</body>' }),
      })) } : endpoint === '/api/prompts' ? { prompts: [{ id: '005', kind: 'web', name: '回场验证', prompt: '验证', code: 'RETURN' }] }
        : endpoint === '/api/auth/me' ? { user: null } : {};
      return route.fulfill({ json });
    });
    for (const source of ['#play', '#arena/005']) {
      await page.goto(`http://127.0.0.1:${server.address().port}/${source}`);
      if (source.startsWith('#arena')) await page.waitForSelector('.phase-voting');
      await page.evaluate(() => { window.__routeFrames = []; });
      await page.getByRole('link', { name: '回到首页', exact: true }).click();
      await page.waitForURL('**/#home');
      await page.waitForFunction(() => !document.querySelector('.game-transition'));
      await page.locator('.next-home').waitFor();
      const frames = await page.evaluate(() => window.__routeFrames);
      if (reducedMotion === 'no-preference') {
        assert.ok(frames.every(f => f.push && !f.copyText), 'every tested home return uses the plain push');
        assert.ok(frames.some(f => f.x > 20) && frames.some(f => f.x < -20), 'home return pushes right to left');
        assert.ok(frames.some(f => f.hash === source), 'source stays mounted during entry');
        const firstNew = frames.find(f => f.hash === '#home');
        assert.ok(firstNew?.full, 'home route must first appear behind full cover');
        assert.ok(frames.some(f => f.hash === '#home' && !f.full), 'curtain must sweep out over the home page');
      }
    }
    await page.evaluate(() => { window.__routeFrames = []; });
    await page.getByRole('link', { name: '偏好榜', exact: true }).click();
    await page.waitForURL('**/#rank');
    await page.waitForFunction(() => !document.querySelector('.game-transition'));
    if (loadedBoard) assert.equal(await page.locator('.rank-row').count(), 2);
    const frames = await page.evaluate(() => window.__routeFrames);
    if (reducedMotion === 'no-preference') {
      assert.ok(frames.some(f => f.push && f.full));
      assert.ok(frames.every(f => f.push && !f.copyText && Math.abs(f.y + 1) < 1),
        'ranking entry is a plain horizontal block in both themes');
      assert.ok(frames.some(f => f.x < -20) && frames.some(f => f.x > 20), 'block sweeps from left to right');
      assert.ok(frames.find(f => f.hash === '#rank')?.full, 'ranking first mounts behind full cover');
    }
    await page.evaluate(() => { window.__routeFrames = []; });
    await page.getByRole('link', { name: '回到首页', exact: true }).click();
    await page.waitForURL('**/#home');
    await page.waitForFunction(() => !document.querySelector('.game-transition'));
    if (reducedMotion === 'no-preference') {
      const back = await page.evaluate(() => window.__routeFrames);
      assert.ok(back.every(f => f.push && !f.copyText), 'ranking return must not fall back to bands');
      assert.ok(back.find(f => f.hash === '#home')?.full);
      assert.ok(back.some(f => f.x > 20) && back.some(f => f.x < -20));
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${theme}/${width}/${reducedMotion}: menu + arena return, ranking ${loadedBoard ? 'loaded' : 'failure'} entry`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
