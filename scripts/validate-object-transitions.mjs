// Actual local read-only content service; cartons must cover every pair replacement.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { PACK_DURATION } from '../app/playground/object-stage-motion.mjs';
const base = process.argv[2] || 'http://127.0.0.1:5452';
const output = 'output/playground/object-transitions';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 880 } });
const checks = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
};
const phase = (value) =>
  page.waitForFunction(
    (value) => window.__objectStageReview?.snapshot().phase === value,
    value,
    { timeout: 60000 },
  );
const finish = async () => {
  await page.evaluate(() => window.__objectStageReview.play());
  await phase('exploring');
};
let release = () => {};
try {
  await page.addInitScript(() => {
    window.__objectFrames = [];
    const sample = () => {
      const phase = document.body?.dataset.phase,
        cover = document.querySelector('.stage-entry-cover');
      window.__objectFrames.push({
        phase,
        opacity: cover && Number(getComputedStyle(cover).opacity),
        frames: document.querySelectorAll('.frame-mount iframe').length,
      });
      if (window.__objectFrames.length < 4000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.goto(`${base}/objects.html?topic=keyboards&motion-review=rounds`);
  await phase('entering');
  const frames = await page.evaluate(() =>
    window.__objectFrames.filter((f) => f.phase === 'arriving'),
  );
  check(
    frames.length > 8 && frames.every((f) => !f.frames),
    'arrival visibly runs before expensive work mounting',
  );
  check(
    frames.some((f) => f.opacity > 0.9) && frames.some((f) => f.opacity < 0.3),
    'arrival reveals the room gradually',
  );
  const positions = [];
  for (const time of [200, 600, 1000, 1400]) {
    await page.evaluate((time) => window.__objectStageReview.seek(time), time);
    positions.push(
      await page.locator('.parcel').evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { x: r.x, y: r.y };
        }),
      ),
    );
    if (time === 600) await page.screenshot({ path: `${output}/lift.png` });
  }
  check(
    positions.every((p) =>
      p.every((r, i) => Math.abs(r.x - positions[0][i].x) < 1),
    ),
    'both cartons lift vertically without sideways drift',
  );
  check(
    positions.at(-1).every((r, i) => r.y < positions[0][i].y - 200),
    'cartons visibly leave upward',
  );
  await finish();
  await page.evaluate(() => {
    window.__oldWorks = [...document.querySelectorAll('.frame-mount iframe')];
  });
  let held = true;
  const gate = new Promise((resolve) => {
    release = () => {
      held = false;
      resolve();
    };
  });
  await page.route(/http:\/\/[^/]+\.localhost:\d+\//, async (route) => {
    if (held && route.request().isNavigationRequest()) await gate;
    await route.continue();
  });
  await page.locator('#continue').click();
  await phase('leaving');
  for (const time of [280, PACK_DURATION - 1]) {
    await page.evaluate((time) => window.__objectStageReview.seek(time), time);
    check(
      await page.evaluate(() =>
        [...document.querySelectorAll('.frame-mount iframe')].every(
          (n, i) => n === window.__oldWorks[i],
        ),
      ),
      `old pair stays mounted through closing at ${time}`,
    );
  }
  await page.evaluate(() => window.__objectStageReview.play());
  await phase('loading');
  check(
    await page.evaluate(() =>
      [...document.querySelectorAll('.exhibit')].every((n) => {
        const box = n.querySelector('.carton-front').getBoundingClientRect(),
          work = n.querySelector('.work-window').getBoundingClientRect();
        return (
          Number(getComputedStyle(n.querySelector('.parcel')).opacity) === 1 &&
          box.left <= work.left + 1 &&
          box.right >= work.right - 1 &&
          box.top <= work.top + 1 &&
          box.bottom >= work.bottom - 1
        );
      }),
    ),
    'slow replacement remains fully covered',
  );
  check(
    await page.locator('#continue').isDisabled(),
    'loading holds the controls',
  );
  await page.screenshot({ path: `${output}/loading.png` });
  release();
  await phase('entering');
  await finish();
  await page.locator('#next').click();
  await phase('leaving');
  check(
    (await page.locator('.parcel-topic').allTextContents()).every(
      (t) => t === '桌面台灯',
    ),
    'next topic is printed before the cartons descend',
  );
  await page.evaluate(() => window.__objectStageReview.play());
  await phase('entering');
  await finish();
  const state = await page.evaluate(() =>
    window.__objectStageReview.snapshot(),
  );
  check(
    state.topic === 'lamps' &&
      state.frames.every((f) => f.ready && f.rendered && f.cameraSettled),
    'next pair renders and settles before opening',
  );
  check(
    state.activeTracks === 0 && (await page.locator('iframe').count()) === 2,
    'round changes release old animations and iframes',
  );
  await page.screenshot({ path: `${output}/lamps.png` });
  check(errors.length === 0, 'no browser runtime errors');
  console.log(`PASS ${checks.length} production 3D transition checks`);
} finally {
  release();
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  await browser.close();
}
