import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Poster entrances share the existing curtain: no extra ready gate, scaling or loops.
const base = 'http://127.0.0.1:5444', out = 'output/text-themes-review/posters';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  if (window !== top) return;
  localStorage.setItem('aob-theme', 'paper');
  window.__posterFrames = [];
  let started;
  const sample = now => {
    const el = document.querySelector('.works-reveal:not(.phase-transition) .poster-title-line > span');
    if (el) {
      started ??= now;
      const s = getComputedStyle(el), m = new DOMMatrixReadOnly(s.transform);
      window.__posterFrames.push({ phase: document.querySelector('.game-transition')?.dataset.gtPhase, y: m.m42, scale: m.a, state: s.animationPlayState });
    }
    if (!started || now - started < 2500) requestAnimationFrame(sample);
    else window.__posterDone = true;
  };
  requestAnimationFrame(sample);
});
try {
  for (const [scene, url] of [
    ['blackout', '/#arena/q-b23ef619e82dec65'], ['channels', '/#arena/q-200d4b7f9c69b79c'],
    ['letter', '/#arena/q-1b9d4f59c2d7b31e'], ['forest', '/#arena/013'],
    ['waiting', '/#arena/q-bfea3f9d2135205c'], ['reading', '/?presentation=reading#arena/q-1b9d4f59c2d7b31e'],
  ]) {
    await page.goto(base + url);
    await page.waitForSelector('.phase-voting');
    await page.waitForFunction(() => window.__posterDone && !document.querySelector('.game-transition'));
    const frames = await page.evaluate(() => window.__posterFrames);
    assert.ok(frames.length > 8 && frames.some(f => f.y > 1));
    assert.ok(frames.every(f => f.scale === 1 && f.y >= -.01));
    assert.ok(frames.filter(f => f.phase === 'entry').every(f => f.state === 'paused'));
    assert.ok(frames.at(-1).y < .01);
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.waitForFunction(() => [...document.querySelectorAll('.poster-title-line > span')].every(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 === 0));
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        titles: [...document.querySelectorAll('.poster-title-line')].map(el => ({ w: el.clientWidth, scroll: el.scrollWidth })),
        columns: [...document.querySelectorAll('.contender')].map(el => ({ width: el.clientWidth, bg: getComputedStyle(el).backgroundColor })),
        motionLoops: document.querySelector('.arena-stage').getAnimations({ subtree: true }).some(a => a.effect.getTiming().iterations === Infinity),
      }));
      assert.equal(layout.overflow, false, `${scene}/${width}: horizontal overflow`);
      assert.ok(layout.titles.every(t => t.scroll <= t.w + 1), `${scene}/${width}: clipped poster title`);
      assert.ok(layout.columns.every(c => c.width > 210), `${scene}/${width}: readable columns`);
      assert.equal(layout.motionLoops, false);
      await page.screenshot({ path: `${out}/${scene}-${width}.png`, fullPage: true });
      checks.push({ scene, width, ...layout });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.goto(`${base}/#arena/q-200d4b7f9c69b79c`); await page.waitForSelector('.phase-voting');
  await page.waitForFunction(() => !document.querySelector('.game-transition'));
  await page.evaluate(() => {
    window.__lensFrames = [];
    const sample = () => {
      window.__lensFrames.push(getComputedStyle(document.querySelector('.text-arena')).backgroundColor);
      if (window.__lensFrames.length < 50) requestAnimationFrame(sample);
    }; requestAnimationFrame(sample);
  });
  const preference = await page.evaluate(() => localStorage.getItem('aob-theme'));
  await page.getByRole('button', { name: /王家卫/ }).click();
  await page.waitForFunction(() => window.__lensFrames.length === 50);
  assert.ok(new Set(await page.evaluate(() => window.__lensFrames)).size > 3, 'lens palette has intermediate colors');
  const controlColors = await page.evaluate(() => {
    const luma = css => {
      const [r,g,b] = css.match(/[\d.]+/g).slice(0,3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
      return r * .2126 + g * .7152 + b * .0722;
    };
    const background = luma(getComputedStyle(document.body).backgroundColor);
    return ['.prompt-toggle','.arena-mode-label','.field-status','.text-button','.continue-other','.arena-context summary','.site-share-footer .share-trigger'].map(selector => {
      const color = luma(getComputedStyle(document.querySelector(selector)).color);
      return { selector, contrast: (Math.max(color,background) + .05) / (Math.min(color,background) + .05) };
    });
  });
  assert.ok(controlColors.every(c => c.contrast >= 4.5), JSON.stringify(controlColors));
  await page.screenshot({ path: `${out}/cinema-final.png`, fullPage: true });
  await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
  await page.waitForSelector('.phase-voting'); await page.waitForFunction(() => !document.querySelector('.game-transition'));
  assert.equal(await page.locator('.text-arena').getAttribute('data-reading-channel'), 'prose');
  assert.equal(await page.evaluate(() => localStorage.getItem('aob-theme')), preference);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload(); await page.waitForSelector('.phase-voting');
  assert.equal(await page.locator('.poster-title-line > span').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/checks.json`, JSON.stringify({ checks, controlColors, errors }, null, 2));
  console.log(`Poster entrances, 18 responsive layouts, no looping effects, reduced motion: passed`);
} finally { await browser.close(); }
