// Browser invariants against the actual application served by preview-hero-arrival.mjs.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const origin = process.env.HERO_REVIEW_ORIGIN ?? 'http://127.0.0.1:5436';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
await mkdir('output/hero-arrival', { recursive: true });
const settled = async page => {
  await page.getByRole('button', { name: '登录 / 注册', exact: true }).waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('.hr-file img')].map(i => i.decode()));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
};
const composition = page => page.locator('.hr-main, .hr-field, .hr-files, .hr-file, .hr-file-cover, .hr-file-back, .hr-archive-bottom, .hr-stage-cross').evaluateAll(elements => elements.map(el => {
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  return { class: el.className, rect: [r.x, r.y, r.width, r.height].map(n => Math.round(n * 100) / 100), transform: s.transform, opacity: s.opacity, shadow: s.boxShadow, background: s.background, mask: s.maskImage };
}));
try {
  for (const width of [1440, 2048, 390]) for (const theme of ['paper', 'ink']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(theme => localStorage.setItem('aob-theme', theme), theme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.mouse.move(0, 0);
    await page.goto(`${origin}/#home`);
    await settled(page);
    const baseline = await composition(page);
    const beforeImage = await page.screenshot({ path: `output/hero-arrival/${theme}-${width}-baseline.png` });
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (window.entryStart || document.querySelector('.hero-home')?.dataset.heroArrival !== 'running') return;
        window.entryStart = { phase: window.ArenaEntry.phase, progress: document.getElementById('site-entry-cover')?.getAnimations()[0]?.effect.getComputedTiming().progress };
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-hero-arrival'] });
    });
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    await page.route('**/prompt-cover-*.webp', async route => { await hold; await route.continue(); });
    await page.goto(`${origin}/?entry=portal#home`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-hero-arrival="waiting"]').waitFor();
    const before = await page.locator('.hr-file').first().evaluate(el => getComputedStyle(el).transform);
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.hr-file').first().evaluate(el => getComputedStyle(el).transform), before, 'no animation runs under the cover');
    assert.notEqual(await page.evaluate(() => window.ArenaEntry.phase), 'done');
    release();
    await page.locator('[data-hero-arrival="running"]').waitFor();
    const start = await page.evaluate(() => window.entryStart);
    assert.equal(start.phase, 'revealing', 'unfold overlaps the outgoing cover');
    assert.ok(start.progress >= .25 && start.progress < .45, `start follows the cover quarter point: ${start.progress}`);
    const approach = await page.locator('.hr-file').evaluateAll(cards => cards.map(card => {
      const animation = card.getAnimations().find(a => a.id.startsWith('hero-arrival'));
      animation.pause();
      const { duration, delay } = animation.effect.getTiming();
      const target = new DOMMatrix(animation.effect.getKeyframes().at(-1).transform).toFloat64Array();
      const distances = [.7, .85, .95, .999999].map(progress => {
        animation.currentTime = delay + duration * progress;
        const current = new DOMMatrix(getComputedStyle(card).transform).toFloat64Array();
        return Math.hypot(...current.map((value, i) => value - target[i]));
      });
      const r = card.getBoundingClientRect();
      return { distances, rect: [r.x, r.y, r.width, r.height] };
    }));
    for (const { distances } of approach) {
      assert.ok(distances.every((distance, i) => i === 0 || distance <= distances[i - 1]), 'cards approach the final pose without a late overshoot');
      assert.ok(distances.at(-1) < .01, 'animation endpoint reaches the resting matrix');
    }
    await page.locator('.hr-file').evaluateAll(cards => cards.forEach(card => {
      const animation = card.getAnimations().find(a => a.id.startsWith('hero-arrival'));
      animation.currentTime = 0;
      animation.play();
    }));
    if (width === 1440 && theme === 'paper') {
      await page.evaluate(() => {
        window.reviewAnimations = document.getAnimations().filter(a => a.id.startsWith('hero-arrival'));
        window.reviewAnimations.forEach(a => a.pause());
      });
      for (const time of [0, 350, 700, 1050]) {
        await page.evaluate(time => window.reviewAnimations.forEach(a => { a.currentTime = time; }), time);
        await page.screenshot({ path: `output/hero-arrival/frame-${time}.png` });
      }
      await page.evaluate(() => window.reviewAnimations.forEach(a => a.play()));
    }
    await page.screenshot({ path: `output/hero-arrival/${theme}-${width}-start.png` });
    await page.locator('[data-hero-arrival="done"]').waitFor();
    await settled(page);
    const finalRects = await page.locator('.hr-file').evaluateAll(cards => cards.map(card => {
      const r = card.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height];
    }));
    finalRects.forEach((rect, i) => rect.forEach((value, axis) => assert.ok(Math.abs(value - approach[i].rect[axis]) < .05, 'releasing the animation does not resize or reposition the card')));
    assert.deepEqual(await composition(page), baseline, 'settled card geometry, opacity, masks and shadows match the static original');
    const afterImage = await page.screenshot({ path: `output/hero-arrival/${theme}-${width}-settled.png` });
    console.log(`${theme} ${width}: static screenshot byte equality=${beforeImage.equals(afterImage)}`);
    assert.equal(await page.locator('.hr-archive').evaluate(el => el.inert), false);
    assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.id.startsWith('hero-arrival')).length), 0, 'no retained animation overrides');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.getByRole('button', { name: '下一个题目', exact: true }).click();
    await page.getByRole('heading', { name: '桌面微缩铁路小镇', exact: true }).waitFor();
    await page.screenshot({ path: `output/hero-arrival/${theme}-${width}-done.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${theme} ${width}: hold / reveal / unfold / cleanup / browse passed`);
  }
  const reduced = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await reduced.newPage();
  await page.goto(`${origin}/?entry=portal#home`);
  await page.waitForFunction(() => window.ArenaEntry.phase === 'done');
  assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.id.startsWith('hero-arrival')).length), 0);
  await page.goto('about:blank');
  await page.goto(`${origin}/#home`);
  await page.locator('.hero-home').waitFor();
  assert.equal(await page.locator('[data-hero-arrival]').count(), 0, 'direct visits retain normal startup');
  await reduced.close();
  console.log('Reduced motion / direct visit passed');
  const context = await browser.newContext();
  const early = await context.newPage();
  await early.goto(`${origin}/?entry=portal#home`, { waitUntil: 'domcontentloaded' });
  await early.locator('[data-hero-arrival="running"]').waitFor();
  await early.getByRole('button', { name: '开始评测', exact: true }).click();
  await early.waitForURL('**/#play');
  await early.evaluate(() => { location.hash = '#home'; });
  await early.locator('.hero-home').waitFor();
  assert.equal(await early.locator('[data-hero-arrival]').count(), 0, 'route return does not replay arrival');
  assert.equal(await early.locator('.hr-archive').evaluate(el => el.inert), false, 'unmount releases archive');
  await early.goto(`${origin}/?entry=portal#home`, { waitUntil: 'domcontentloaded' });
  await early.locator('[data-hero-arrival="running"]').waitFor();
  await early.emulateMedia({ reducedMotion: 'reduce' });
  await early.locator('[data-hero-arrival="done"]').waitFor();
  assert.equal(await early.evaluate(() => document.getAnimations().filter(a => a.id.startsWith('hero-arrival')).length), 0);
  await context.close();
  const failure = await browser.newContext();
  await failure.route('**/prompt-cover-*.webp', route => route.fulfill({ status: 404, body: '' }));
  const failed = await failure.newPage();
  await failed.goto(`${origin}/?entry=portal#home`, { waitUntil: 'domcontentloaded' });
  await failed.locator('#site-entry-cover[data-failed]').waitFor();
  assert.equal(await failed.locator('.hero-home').getAttribute('data-hero-arrival'), 'waiting', 'load failure never starts the Hero');
  await failure.close();
  console.log('Early exit / return / live reduced-motion change / failed cover passed');
} finally { await browser.close(); }
