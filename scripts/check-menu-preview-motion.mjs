import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createMenuDemoApp } from './serve-menu-demo.mjs';

const server = createMenuDemoApp().listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = 'output/menu-preview-motion';
await mkdir(output, { recursive: true });
const checks = [],
  errors = [],
  writes = [];
const check = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
};
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  context.on('request', (r) => {
    if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.url());
  });
  const select = (mode) => page.locator(`.slot[data-mode="${mode}"]`).click();
  const done = () =>
    page.waitForFunction(
      () =>
        document.querySelector('[data-preview-motion]')?.dataset.playback ===
        'done',
    );
  const seek = (time) =>
    page.locator('[data-preview-motion]').evaluate((scene, value) => {
      scene.getAnimations({ subtree: true }).forEach((a) => {
        a.pause();
        a.currentTime = value;
      });
    }, time * 0.5);
  for (const [width, height] of [
    [1920, 880],
    [2560, 1240],
    [1280, 720],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/reference/menu-demo/?mode=tanks`);
    await page.locator('.tank-map').scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-playback]')?.dataset.playback ===
        'playing',
    );
    await seek(0);
    const start = await page.locator('.tank-a').boundingBox();
    for (const time of [0, 800, 1300, 2000, 3500]) {
      await seek(time);
      check(
        await page.locator('.tank-map').evaluate((map) => {
          const obstacles = [...map.querySelectorAll('.brick,.water')].map(
            (e) => e.getBoundingClientRect(),
          );
          return [...map.querySelectorAll('.pixel-tank')].every((tank) => {
            const r = tank.getBoundingClientRect(),
              x = r.x + r.width / 2,
              y = r.y + r.height / 2;
            return obstacles.every(
              (tile) =>
                x < tile.left ||
                x > tile.right ||
                y < tile.top ||
                y > tile.bottom,
            );
          });
        }),
        `${width}: tank paths avoid bricks and water at ${time}ms`,
      );
    }
    await seek(2200);
    const middle = await page.locator('.tank-a').boundingBox();
    check(
      middle.x > start.x,
      `${width}: automatic tank timeline moves forward`,
    );
    check(
      await page
        .locator('.shot-one')
        .evaluate((e) => Number(getComputedStyle(e).opacity) > 0.9),
      `${width}: bullet visible during flight`,
    );
    await seek(2450);
    check(
      await page
        .locator('.preview-impact')
        .first()
        .evaluate((e) => Number(getComputedStyle(e).opacity) > 0),
      `${width}: impact follows the first shot`,
    );
    await page.screenshot({
      path: `${output}/tanks-${width}.png`,
      fullPage: true,
    });
    await seek(4000);
    check(
      await page
        .locator('.tank-shot,.preview-impact,.preview-chip')
        .evaluateAll((nodes) =>
          nodes.every((e) => Number(getComputedStyle(e).opacity) === 0),
        ),
      `${width}: particles clear before ending`,
    );
    check(
      await page.locator('.tank-map').evaluate((map) => {
        const bounds = map.getBoundingClientRect();
        return [...map.querySelectorAll('.pixel-tank')].every((tank) => {
          const r = tank.getBoundingClientRect();
          return (
            r.left >= bounds.left &&
            r.right <= bounds.right &&
            r.top >= bounds.top &&
            r.bottom <= bounds.bottom
          );
        });
      }),
      `${width}: tanks stay inside map`,
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}: no horizontal overflow`,
    );
  }
  await page.setViewportSize({ width: 390, height: 400 });
  await page.goto(`${origin}/reference/menu-demo/?mode=guess`);
  await page.waitForFunction(
    () => document.querySelector('.scene-guess').dataset.playback === 'paused',
  );
  check(true, 'offscreen preview waits for visibility');
  await page.locator('.guess-sheet').scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    document
      .querySelector('.scene-guess')
      .getAnimations({ subtree: true })
      .some((a) => a.playState === 'running' && a.currentTime > 900),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(
    () => document.querySelector('.scene-guess').dataset.playback === 'paused',
  );
  const firstClueTime = await page
    .locator('.clue-cell')
    .first()
    .evaluate((e) => e.getAnimations()[0].currentTime);
  await page.locator('.guess-sheet').scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => document.querySelector('.scene-guess').dataset.playback === 'playing',
  );
  check(
    (await page
      .locator('.clue-cell')
      .first()
      .evaluate((e) => e.getAnimations()[0].currentTime)) === firstClueTime,
    'returning to view does not restart completed clues',
  );
  await page.setViewportSize({ width: 1920, height: 880 });
  await select('formal');
  await select('guess');
  await seek(0);
  const initial = await page.locator('.guess-sheet').boundingBox();
  await seek(750);
  const revealed = await page
    .locator('.clue-cell')
    .evaluateAll((cells) =>
      cells.map((e) => getComputedStyle(e).color !== 'rgba(0, 0, 0, 0)'),
    );
  check(
    revealed[0] && !revealed[6] && !revealed[14],
    'clues reveal in order with later rows concealed',
  );
  await seek(3350);
  await page.screenshot({ path: `${output}/guess-midway.png`, fullPage: true });
  await page.locator('[data-action=guess]').click();
  await done();
  check(
    (await page.locator('.guess-sheet').boundingBox()).height ===
      initial.height,
    'clue reveal never changes panel height',
  );
  check(
    await page
      .locator('.clue-cell')
      .evaluateAll((cells) =>
        cells.every((e) => getComputedStyle(e).color !== 'rgba(0, 0, 0, 0)'),
      ),
    'all sample clues visible at end',
  );
  await page.screenshot({
    path: `${output}/guess-finished.png`,
    fullPage: true,
  });
  await select('tanks');
  await done();
  const endPose = await page.locator('.tank-a').boundingBox();
  await select('tanks');
  check(
    (await page.locator('.scene-tanks').getAttribute('data-playback')) ===
      'done',
    'reselecting active tab does not reset a completed preview',
  );
  check(
    Math.abs((await page.locator('.tank-a').boundingBox()).x - endPose.x) < 1,
    'no final pose jump after cleanup',
  );
  await page.locator('[data-action=tanks]').click();
  check(
    (await page.locator('.tank-a').boundingBox()).x < endPose.x,
    'replay resets to opening position',
  );
  await page.locator('[data-action=tanks]').click();
  check(
    (await page.locator('.preview-impact').count()) === 2,
    'rapid replay does not duplicate effects',
  );
  for (let i = 0; i < 4; i++) {
    await select('guess');
    await select('tanks');
  }
  check(
    (await page.locator('[data-preview-motion]').count()) === 1,
    'rapid tab changes keep only current preview',
  );
  await select('formal');
  check(
    await page.evaluate(() =>
      document
        .getAnimations()
        .every((a) => !a.effect?.target.closest('[data-preview-motion]')),
    ),
    'changing mode cancels old timelines',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const mode of ['tanks', 'guess']) {
    await select(mode);
    await done();
    check(
      await page.evaluate(() => document.getAnimations().length === 0),
      `${mode}: reduced motion uses a static finished preview`,
    );
    await page.locator(`[data-action=${mode}]`).click();
    check(
      await page.evaluate(() => document.getAnimations().length === 0),
      `${mode}: reduced-motion replay stays static`,
    );
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await select('formal');
  await select('tanks');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await done();
  check(
    await page.evaluate(() => document.getAnimations().length === 0),
    'changing motion preference during playback finishes cleanly',
  );
  check(errors.length === 0, 'no page errors');
  check(writes.length === 0, 'no business writes');
  console.log(`${checks.length} menu preview motion checks passed`);
} finally {
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify({ checks, errors, writes }, null, 2),
  );
  await browser.close();
  server.close();
}
