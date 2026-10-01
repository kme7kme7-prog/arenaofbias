// Real Chromium verification against `npm run dev:web` + a local API/fixtures.
// No production credentials or data. Screenshots go to the existing output folder.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const base = process.env.THEME_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const out = 'output/playwright';
fs.mkdirSync(out, { recursive: true });
const errors = [];
const setup = async (options) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ...options,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page };
};
const expectTheme = (page, theme) =>
  page.waitForFunction(
    (value) =>
      document.documentElement.dataset.theme === value &&
      !document.querySelector('.theme-curtain'),
    theme,
  );
try {
  const { context, page } = await setup({
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/src/main.tsx', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(base, { waitUntil: 'commit' });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === 'paper',
  );
  assert.equal(
    await page.locator('#root').innerHTML(),
    '',
    'theme must precede React',
  );
  assert.equal(
    await page
      .locator('html')
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgb(217, 221, 218)',
  );
  release();
  await page.locator('.theme-toggle-main').waitFor();
  await page.unroute('**/src/main.tsx');
  console.log(
    'PASS paper first paint on a dark system before the application module',
  );
  assert.equal(await page.locator('.beta-notice-card').count(), 0, 'new visitors have no beta notice');
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, 'paper');
  await page.locator('.theme-toggle-main').click();
  await expectTheme(page, 'ink');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('aob-theme')),
    'ink',
  );
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, 'ink');
  await page.reload();
  await expectTheme(page, 'ink');
  const options = page.getByRole('button', { name: '主题偏好', exact: true });
  await options.focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('menu').waitFor();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expectTheme(page, 'paper');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('aob-theme')),
    'system',
  );
  assert.equal(
    await options.evaluate((el) => el === document.activeElement),
    true,
  );
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, 'ink');
  await page.reload();
  await expectTheme(page, 'ink');
  await options.click();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('menu').count(), 0);
  assert.equal(
    await options.evaluate((el) => el === document.activeElement),
    true,
  );
  console.log(
    'PASS manual priority, reload persistence, keyboard menu, Escape and system reset',
  );
  const other = await context.newPage();
  await other.goto(base);
  await other.evaluate(() => localStorage.setItem('aob-theme', 'paper'));
  await expectTheme(page, 'paper');
  await other.evaluate(() => localStorage.removeItem('aob-theme'));
  await expectTheme(page, 'paper');
  await other.evaluate(() => localStorage.setItem('aob-theme', 'system'));
  await expectTheme(page, 'ink');
  await other.close();
  console.log('PASS cross-tab manual preference, clearing to paper and explicit system');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.theme-toggle-main').click();
  await page.waitForSelector('.theme-curtain');
  // Last intention wins during the same sweep; never stack full-screen layers.
  await page.locator('.theme-toggle-main').click();
  await page.locator('.theme-toggle-main').click();
  assert.equal(await page.locator('.theme-curtain').count(), 1);
  await expectTheme(page, 'paper');
  await page.locator('.theme-toggle-main').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectTheme(page, 'ink');
  assert.equal(
    await page.locator('html').getAttribute('data-theme-changing'),
    null,
  );
  console.log(
    'PASS repeated input, single curtain, live reduced motion and cleanup',
  );

  await page.goto(base + '/reference/theme-review.html');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Production controller, deliberately slow work gate. Turning reduce on must not release it.
  await page.evaluate(async () => {
    const { createGameTransition } = await import('/lib/game-transitions.ts');
    window.__themeGate = false;
    window.__themeCovered = 0;
    window.__themeFinished = 0;
    window.__themeRun = createGameTransition('match', {
      holdGate: () => window.__themeGate,
      onCovered: () => window.__themeCovered++,
      onFinish: () => window.__themeFinished++,
    });
    window.__themeRun.play();
  });
  await page.waitForFunction(() => window.__themeCovered === 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.game-transition').count(), 1);
  assert.equal(await page.evaluate(() => window.__themeFinished), 0);
  await page.evaluate(() => {
    window.__themeGate = true;
  });
  await page.waitForFunction(() => window.__themeFinished === 1);
  assert.equal(await page.locator('.game-transition').count(), 0);
  console.log(
    'PASS reducing motion during a waiting match preserves the work-ready gate',
  );

  await page.goto(base);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const measurements = await page.evaluate(async () => {
    const target = document.querySelector('.hr-copy');
    const original = target.getBoundingClientRect();
    const frames = [];
    let previous;
    let stable = true;
    const phases = [];
    const start = performance.now();
    document.querySelector('.theme-toggle-main').click();
    await new Promise((resolve) => {
      const tick = (now) => {
        if (previous !== undefined) {
          frames.push(now - previous);
          phases.push(
            document
              .querySelector('.theme-curtain')
              ?.getAttribute('data-phase') || 'idle',
          );
        }
        previous = now;
        const rect = target.getBoundingClientRect(),
          style = getComputedStyle(target);
        stable &&=
          rect.x === original.x &&
          rect.y === original.y &&
          style.transform === 'none' &&
          style.opacity === '1';
        if (now - start < 1000 || document.querySelector('.theme-curtain'))
          requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return {
      stable,
      frames: frames.length,
      max: Math.max(...frames),
      over50ms: frames.filter((ms) => ms > 50).length,
      samples: frames.map((ms, i) => ({ ms, phase: phases[i] })),
    };
  });
  assert.equal(
    measurements.stable,
    true,
    'large copy must not move or fade in any theme frame',
  );
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  fs.writeFileSync(
    out + '/theme-performance.json',
    JSON.stringify(measurements, null, 2),
  );
  console.log(
    'MEASURE 6× CPU theme switch:',
    JSON.stringify({
      ...measurements,
      samples: undefined,
      phases: Object.fromEntries(
        [...new Set(measurements.samples.map((s) => s.phase))].map((phase) => {
          const samples = measurements.samples
            .filter((s) => s.phase === phase)
            .map((s) => s.ms);
          return [
            phase,
            {
              frames: samples.length,
              maxMs: Math.round(Math.max(...samples)),
              over50ms: samples.filter((ms) => ms > 50).length,
            },
          ];
        }),
      ),
    }),
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const theme of ['paper', 'ink']) {
    await page.evaluate(async (theme) => {
      const m = await import('/lib/theme.ts');
      m.setThemePreference(theme);
    }, theme);
    await expectTheme(page, theme);
    const contrastFailures = await page.evaluate(() => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px';
      host.innerHTML =
        '<div class="guess-page"><button class="guess-primary" data-check="guess action">Action</button><button class="guess-submit" data-check="guess submit">Guess</button><div class="guess-attempts"><span class="is-win" data-check="win counter">01</span></div><div class="guess-result"><button class="share-trigger" data-check="guess share">Share</button></div><div class="sheet-front" data-check="mystery card">?</div></div><div class="lobby"><article class="lobby-exhibit"><footer data-check="red card footer">Choice</footer></article></div><div class="duel-home"><div class="duel-side-bar"><b data-check="duel identity">A</b></div></div><div class="account-sheet"><div class="account-success-mark" data-check="account success">✓</div></div><div class="rank-board"><div class="rank-row first"><span class="rank-count" data-check="rank count">12</span></div></div>';
      document.body.append(host);
      const rgba = (c) => {
        const v = c.match(/[\d.]+/g).map(Number);
        return [...v.slice(0, 3), v[3] ?? 1];
      };
      const blend = (a, b) =>
        a
          .slice(0, 3)
          .map((v, i) => v * a[3] + b[i] * (1 - a[3]))
          .concat(1);
      const lum = (c) =>
        c
          .slice(0, 3)
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const failures = [];
      for (const el of host.querySelectorAll('[data-check]')) {
        const parents = [];
        for (let p = el; p; p = p.parentElement) parents.unshift(p);
        let bg = [255, 255, 255, 1],
          opacity = 1;
        for (const p of parents) {
          const s = getComputedStyle(p);
          bg = blend(rgba(s.backgroundColor), bg);
          opacity *= Number(s.opacity);
        }
        const fg = rgba(getComputedStyle(el).color);
        fg[3] *= opacity;
        const a = lum(blend(fg, bg)),
          b = lum(bg);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < 4.5) failures.push({ control: el.dataset.check, ratio });
      }
      host.remove();
      return failures;
    });
    assert.deepEqual(
      contrastFailures,
      [],
      theme +
        ' production CSS signal surfaces must retain dark readable labels',
    );
  }
  console.log(
    'PASS production CSS: both themes retain ≥4.5:1 on accent controls and inset text',
  );
  await context.close();

  const blocked = await browser.newContext({
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  await blocked.addInitScript(() => {
    if (window.top === window)
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
  });
  const restricted = await blocked.newPage();
  await restricted.goto(base + '/#play');
  await restricted.locator('.theme-toggle-main').waitFor();
  await expectTheme(restricted, 'paper');
  await restricted.locator('.theme-toggle-main').click();
  await expectTheme(restricted, 'ink');
  await restricted.emulateMedia({ colorScheme: 'light' });
  await restricted.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(restricted, 'ink');
  await blocked.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS denied storage defaults to paper and retains this tab’s manual override',
  );
} finally {
  await browser.close();
}
