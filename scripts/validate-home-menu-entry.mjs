// Built entry, real clicks and per-frame geometry; no live votes or model calls.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import express from 'express';
import ts from 'typescript';
import { chromium } from 'playwright-core';

const output = 'output/home-menu-entry';
await mkdir(output, { recursive: true });
const source = await readFile('lib/game-transitions.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const moduleUrl = '/__transition-review.js';
const app = express();
app.get(moduleUrl, (_req, res) =>
  res.type('application/javascript').send(compiled),
);
app.use(express.static('dist'));
const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const theme of ['paper', 'ink'])
    for (const [width, height] of [
      [1920, 880],
      [2560, 1240],
      [390, 844],
    ])
      for (const reducedMotion of ['no-preference', 'reduce']) {
        const context = await browser.newContext({
          viewport: { width, height },
          reducedMotion,
        });
        const page = await context.newPage(),
          errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript((theme) => {
          localStorage.setItem('aob-theme', theme);
          localStorage.setItem('arena-language', 'zh');
          localStorage.setItem('aob-beta-notice', 'v3');
          window.__homeFrames = [];
          const sample = () => {
            const layer = document.querySelector('.gt-frame');
            if (layer) {
              const veil = layer
                .querySelector('.gt-veil')
                .getBoundingClientRect();
              const title = layer
                .querySelector('.gt-wordmark,.gt-static-title')
                ?.getBoundingClientRect();
              const r = layer.getBoundingClientRect();
              window.__homeFrames.push({
                hash: location.hash,
                count: document.querySelectorAll('.game-transition').length,
                full:
                  veil.left <= 1 &&
                  veil.right >= innerWidth - 1 &&
                  veil.top <= 1 &&
                  veil.bottom >= innerHeight - 1,
                layer: { x: r.x, y: r.y, width: r.width, height: r.height },
                title: title && { width: title.width, height: title.height },
                time: layer.getAnimations({ subtree: true })[0]?.currentTime,
                archive: !!layer.querySelector('.gt-sheet'),
                corners: !!layer.querySelector('.gt-material-corners'),
              });
            }
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        }, theme);
        await page.route('**/api/**', (route) =>
          route.fulfill({ json: { user: null, works: [], prompts: [] } }),
        );
        await page.goto(`http://127.0.0.1:${server.address().port}/#home`);
        await page.locator('.hr-enter').click();
        await page.waitForURL('**/#play');
        await page.waitForFunction(
          () => !document.querySelector('.game-transition'),
        );
        await page.locator('.slot[data-mode="party"]').waitFor();
        if (reducedMotion === 'no-preference') {
          const frames = await page.evaluate(() => window.__homeFrames);
          await writeFile(
            `${output}/${theme}-${width}-frames.json`,
            JSON.stringify(frames),
          );
          assert.ok(
            frames.length > 12,
            'entry and reveal are visible across multiple frames',
          );
          assert.ok(
            frames.every(
              (f) =>
                f.count === 1 &&
                f.archive === (theme === 'paper') &&
                f.corners === (theme === 'ink'),
            ),
          );
          assert.ok(
            frames.some((f) => f.hash === '#home' && !f.full),
            'home stays visible while the cover enters',
          );
          assert.ok(
            frames.find((f) => f.hash === '#play')?.full,
            'menu mounts under an opaque full cover',
          );
          assert.ok(
            frames.some((f) => f.hash === '#play' && !f.full),
            'sheet visibly leaves over the new menu',
          );
          assert.ok(
            frames.every(
              (f) =>
                Math.abs(f.layer.width - width) < 2 &&
                Math.abs(f.layer.height - height) < 2,
            ),
            'cover geometry is stable across the menu scale change',
          );
          const nearSwap = frames.filter(
            (f) => f.time >= 400 && f.time <= 450 && f.title?.width,
          );
          if (nearSwap.length > 1)
            assert.ok(
              Math.max(...nearSwap.map((f) => f.title.width)) /
                Math.min(...nearSwap.map((f) => f.title.width)) <
                1.02,
              'title scale must not jump at route swap',
            );
          await page.evaluate(async (moduleUrl) => {
            const { createGameTransition } = await import(moduleUrl);
            window.__review = createGameTransition('frame');
            window.__review.seek(950);
          }, moduleUrl);
          await page.screenshot({
            path: `${output}/${theme}-${width}-hold.png`,
          });
          await page.evaluate(() => window.__review.dispose());
        }
        assert.deepEqual(errors, []);
        console.log(`PASS home → menu: ${theme}/${width}/${reducedMotion}`);
        await context.close();
      }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
