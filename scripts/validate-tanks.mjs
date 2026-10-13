import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import express from 'express';
import { chromium } from 'playwright-core';
const out = 'output/tanks';
const registry = JSON.parse(
  await readFile('app/tanks/provenance.json', 'utf8'),
);
const modelFor = (record) =>
  registry.bots.find((b) => b.id === record.id && b.sha256 === record.sha256)
    ?.model;
await mkdir(out, { recursive: true });
const app = express();
app.get('/__test-worker.mjs', async (_req, res) =>
  res
    .type('application/javascript')
    .send(await readFile('app/tanks/worker.mjs', 'utf8')),
);
app.use((req, res, next) => {
  if (req.path === '/tanks.html')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https:",
    );
  next();
});
app.use(express.static('dist'));
const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const checks = [],
  errors = [],
  writes = [],
  failed = [];
const check = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
};
await context.route('**/api/**', (route) => {
  const p = new URL(route.request().url()).pathname;
  return route.fulfill({
    json: p.endsWith('/me') ? { user: null } : {},
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    },
  });
});
await context.addInitScript(() => {
  const Native = window.Worker;
  window.__workers = 0;
  window.Worker = class extends Native {
    constructor(...args) {
      super(...args);
      window.__workers++;
      this.__live = true;
    }
    terminate() {
      if (this.__live) {
        window.__workers--;
        this.__live = false;
      }
      return super.terminate();
    }
  };
});
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (!['GET', 'HEAD'].includes(r.method()) && !r.url().includes('/api/track'))
    writes.push(r.url());
});
page.on('requestfailed', (r) => {
  if (!r.failure()?.errorText?.includes('ERR_ABORTED')) failed.push(r.url());
});
const draft = () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem('aob-tank-workbench-v2')),
  );
async function settled() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document.getAnimations().map((a) => a.finished.catch(() => {})),
    );
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.entrant').length === 4,
  );
}
async function reset() {
  await page.goto(origin + '/tanks.html');
  await page.evaluate(() => localStorage.removeItem('aob-tank-workbench-v2'));
  await page.reload();
  await settled();
}
async function point(x, y) {
  await page.locator('#board').scrollIntoViewIfNeeded();
  const b = await page.locator('#board').boundingBox();
  return {
    x: b.x + ((x + 0.5) * b.width) / 26,
    y: b.y + ((y + 0.5) * b.height) / 26,
  };
}
async function clickCell(x, y) {
  const p = await point(x, y);
  await page.mouse.click(p.x, p.y);
}
async function dragCell(x, y, xx, yy) {
  const a = await point(x, y),
    b = await point(xx, yy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}
async function download(button, file) {
  const pending = page.waitForEvent('download');
  await page.locator(button).click();
  const d = await pending;
  await d.saveAs(`${out}/${file}`);
  return JSON.parse(await readFile(`${out}/${file}`));
}
async function runRound(label) {
  const started = Date.now();
  await page.locator('#start').click();
  await page.waitForFunction(
    () => document.body.dataset.state === 'watch',
    {},
    { timeout: 120000 },
  );
  await page.locator('#play').click();
  check(
    await page.evaluate(() => window.__workers === 0),
    `${label}: all four workers disposed after calculation`,
  );
  const replay = await download('#save-replay', `${label}.json`);
  check(replay.frames.length > 1, `${label}: real replay frames`);
  check(
    !replay.ranking.some((r) => ['timeout', 'error'].includes(r.status)),
    `${label}: all registered bots completed`,
  );
  console.log(
    `${label}: ${replay.frames.length} frames in ${Date.now() - started}ms`,
  );
  return replay;
}
async function walkTour(width) {
  await page.setViewportSize({ width, height: 900 });
  const before = JSON.stringify(await draft());
  await page.locator('#help').click();
  for (let i = 1; i <= 6; i++) {
    await page.waitForFunction(
      (n) => document.querySelector('#tank-tour').dataset.step === String(n),
      i,
    );
    await settled();
    const g = await page.evaluate(() => {
      const b = document.querySelector('.tour-card').getBoundingClientRect(),
        s = document.querySelector('.tour-spot').getBoundingClientRect();
      return {
        fits:
          b.left >= 0 &&
          b.top >= 0 &&
          b.right <= innerWidth + 1 &&
          b.bottom <= innerHeight + 1,
        spot: s.width > 5 && s.height > 5,
        apart:
          b.right <= s.left ||
          b.left >= s.right ||
          b.bottom <= s.top ||
          b.top >= s.bottom,
      };
    });
    check(
      g.fits && g.spot,
      `${width}: guide step ${i} anchored within viewport`,
    );
    check(
      g.apart,
      `${width}: guide step ${i} does not cover highlighted control`,
    );
    if (i === 3) {
      await page.locator('#tour-prev').click();
      check(
        (await page.locator('#tank-tour').getAttribute('data-step')) === '2',
        `${width}: guide back`,
      );
      await page.locator('#tour-next').click();
    }
    if (i === 2 || i === 4)
      await page.screenshot({ path: `${out}/guide-${width}-${i}.png` });
    await page.locator('#tour-next').click();
  }
  check(
    !(await page.locator('#tank-tour').evaluate((d) => d.open)),
    `${width}: guide finishes cleanly`,
  );
  check(
    JSON.stringify(await draft()) === before,
    `${width}: guide does not change draft`,
  );
  await page.locator('#help').click();
  await page.keyboard.press('Escape');
  check(
    !(await page.locator('#tank-tour').evaluate((d) => d.open)),
    `${width}: guide Escape`,
  );
}
try {
  await reset();
  for (const [width, height, theme] of [
    [1920, 920, 'paper'],
    [2560, 1280, 'paper'],
    [1366, 768, 'paper'],
    [1280, 620, 'paper'],
    [1024, 900, 'paper'],
    [390, 844, 'paper'],
    [320, 720, 'ink'],
    [1920, 920, 'ink'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((t) => localStorage.setItem('aob-theme', t), theme);
    await page.reload();
    await settled();
    const g = await page.evaluate(() => {
      const b = document.querySelector('#board').getBoundingClientRect(),
        hint = document.querySelector('.arena-bottom').getBoundingClientRect(),
        start = document.querySelector('#start').getBoundingClientRect(),
        foot = document.querySelector('.foot').getBoundingClientRect();
      return {
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
        board: [b.width, b.height],
        overlap: b.bottom > hint.top + 1,
        startBottom: start.bottom,
        footerTop: foot.top,
      };
    });
    check(g.w <= width, `${width}/${theme}: no horizontal overflow`);
    check(
      Math.abs(g.board[0] - g.board[1]) < 1,
      `${width}/${theme}: square battlefield`,
    );
    check(!g.overlap, `${width}/${theme}: controls clear of board`);
    check(
      await page.locator('#board').evaluate((c) => c.width === c.height),
      `${width}/${theme}: canvas buffer is also square`,
    );
    if (width > 1080) {
      check(g.h <= height, `${width}/${theme}: one screen`);
      check(
        g.startBottom <= g.footerTop + 1,
        `${width}/${theme}: launch above footer`,
      );
    }
    await page.screenshot({
      path: `${out}/${width}-${height}-${theme}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1520, height: 900 });
  await page.locator('#theme').click();
  check(
    (await page.locator('.vacant').count()) === 4,
    'initial battlefield has four empty seats',
  );
  check(
    await page.locator('#start').isDisabled(),
    'cannot run before choosing four contestants',
  );
  check(
    await page.locator('#empty-arena').isVisible(),
    'empty battlefield invites contestants',
  );
  check(
    (await page.locator('#save-map,#open-map,#map-file').count()) === 0,
    'setup file controls removed',
  );
  check(
    (await page.locator('#edit-map').textContent()).includes('实验功能'),
    'editor explicitly marked experimental',
  );
  await walkTour(1520);
  await walkTour(390);
  await page.setViewportSize({ width: 1520, height: 900 });
  await page.locator('#open-library').click();
  await page.locator('#library-search').fill('not-a-model');
  check(
    await page.locator('#library-empty').isVisible(),
    'garage search empty state',
  );
  await page.locator('#library-search').fill('GLM');
  check(
    (await page.locator('.library-card').count()) === 2,
    'garage searches models',
  );
  await page.locator('[data-bot=harrier]').click();
  check(
    (await page.locator('.vacant').count()) === 3,
    'choosing one program adds one tank',
  );
  check(
    await page.locator('#start').isDisabled(),
    'partial roster cannot start',
  );
  await page.locator('#open-library').click();
  check(
    await page.locator('[data-bot=harrier]').isDisabled(),
    'same program cannot occupy two seats',
  );
  await page.locator('#close-library').click();
  for (const id of ['tank26', 'vector', 'astra-knife']) {
    await page.locator('#open-library').click();
    await page.locator(`[data-bot="${id}"]`).click();
  }
  check(
    !(await page.locator('#start').isDisabled()),
    'full roster unlocks start',
  );
  await page
    .getByRole('button', { name: '更换 A 席颜色', exact: true })
    .click();
  await page.getByRole('button', { name: '青碧', exact: true }).click();
  check((await draft()).colors.A === '#438c87', 'seat color choice recorded');
  check(
    await page
      .locator('.entrant[data-side=A]')
      .evaluate(
        (e) => getComputedStyle(e).getPropertyValue('--c').trim() === '#438c87',
      ),
    'seat card reflects chosen color',
  );
  await page
    .getByRole('button', { name: '移出 B 席选手', exact: true })
    .click();
  check(
    await page.locator('#start').isDisabled(),
    'removing contestant relocks start',
  );
  await page.locator('#open-library').click();
  await page.locator('[data-bot=tank26]').click();
  const beforeReset = await draft();
  await page.locator('#edit-map').click();
  await page.locator('#clear-map').click();
  await dragCell(2, 22, 5, 20);
  await page.locator('#reset-all').click();
  const resetState = await draft();
  check(
    JSON.stringify(resetState.stage) === JSON.stringify(beforeReset.stage),
    'undo all restores the active base map and origins',
  );
  check(
    JSON.stringify(resetState.seats) === JSON.stringify(beforeReset.seats) &&
      JSON.stringify(resetState.colors) === JSON.stringify(beforeReset.colors),
    'undo all preserves contestants and colors',
  );
  check(!resetState.experimental, 'reset returns to standard map');
  await page.locator('#edit-map').click();
  await page.locator('#clear-map').click();
  await dragCell(2, 22, 5, 20);
  let d = await draft();
  check(
    d.stage.spawns.A.x === 5 && d.stage.spawns.A.y === 20,
    'drag places the selected AI exactly',
  );
  check(d.experimental, 'manual setup is an experiment');
  await page.locator('#rotate').click();
  d = await draft();
  check(d.stage.spawns.A.dir === 1, 'rotate initial direction');
  await page.getByRole('button', { name: '钢墙画笔', exact: true }).click();
  await page.locator('#mirror').check();
  await clickCell(7, 7);
  d = await draft();
  check(
    [
      [7, 7],
      [18, 7],
      [18, 18],
      [7, 18],
    ].every(([x, y]) => d.stage.map[y][x] === 2),
    'symmetric map brush',
  );
  await page.locator('#undo').click();
  d = await draft();
  check(d.stage.map[7][7] === 0, 'undo restores the whole stroke');
  await page.locator('#mirror').uncheck();
  await page.getByRole('button', { name: '砖墙画笔', exact: true }).click();
  await dragCell(8, 9, 14, 9);
  d = await draft();
  check(
    d.stage.map[9].slice(8, 15).every((t) => t === 1),
    'continuous brush stroke',
  );
  const config = await draft();
  await page.reload();
  await settled();
  check((await draft()).stage.spawns.A.x === 5, 'draft survives reload');
  check(
    JSON.stringify((await draft()).seats) === JSON.stringify(config.seats),
    'stable roster IDs survive reload',
  );
  const custom = await runRound('experiment');
  check(
    JSON.stringify(custom.meta.stage.spawns) ===
      JSON.stringify(config.stage.spawns),
    'custom spawn preserved in replay',
  );
  check(
    Object.keys(config.seats).every(
      (id) =>
        custom.meta.website.entrants[custom.meta.seatSlots[id]].id ===
        config.seats[id],
    ),
    'AI identity not shuffled after placement',
  );
  check(
    custom.meta.website.decisionBudgetMs === 500,
    'entertainment budget recorded',
  );
  await page.locator('#board').focus();
  await page.keyboard.press('End');
  await page.locator('#result').waitFor({ state: 'visible' });
  check((await page.locator('.standing').count()) === 4, 'four result rows');
  check(
    JSON.stringify(
      await page.locator('.standing > span:nth-child(2)').allTextContents(),
    ) ===
      JSON.stringify(
        custom.ranking.map((row) =>
          modelFor(custom.meta.website.entrants[custom.meta.seatSlots[row.id]]),
        ),
      ),
    'result rows display model names, not tank names',
  );
  await settled();
  await page.screenshot({ path: `${out}/result.png` });
  check(
    JSON.stringify(custom.meta.website.colors) ===
      JSON.stringify(config.colors),
    'replay retains custom colors',
  );
  const firstName = await page.locator('#winner').textContent();
  await page.locator('#replay-file').setInputFiles(`${out}/experiment.json`);
  await page.locator('#board').focus();
  await page.keyboard.press('End');
  await page.locator('#result').waitFor({ state: 'visible' });
  check(
    (await page.locator('#winner').textContent()) === firstName,
    'round-trip replay keeps result',
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await settled();
    check(
      await page
        .locator('.result-sheet')
        .evaluate(
          (e) =>
            e.getBoundingClientRect().top >=
            e.parentElement.getBoundingClientRect().top,
        ),
      `${width}: small-screen result starts inside the overlay`,
    );
    await page.locator('#close-result').scrollIntoViewIfNeeded();
    const buttonBox = await page.locator('#close-result').boundingBox();
    check(
      await page.evaluate(
        ({ x, y }) =>
          !!document.elementFromPoint(x, y)?.closest('#close-result'),
        {
          x: buttonBox.x + buttonBox.width / 2,
          y: buttonBox.y + buttonBox.height / 2,
        },
      ),
      `${width}: result close button remains reachable`,
    );
    await page.screenshot({
      path: `${out}/result-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1520, height: 900 });
  await page.locator('#close-result').click();
  await page.locator('#back-setup').click();
  for (const [map, label] of [
    ['crossroads', 'stock-crossroads'],
    ['islands', 'stock-islands'],
    ['ruins', 'stock-ruins'],
  ]) {
    await page.locator(`[data-map="${map}"]`).click();
    await page.locator('#seed').fill('2');
    const r = await runRound(label);
    check(!r.meta.stage, `${label}: standard-map metadata`);
    await page.locator('#back-setup').click();
  }
  const selectRoster = async (ids) => {
    for (const side of ['A', 'B', 'C', 'D']) {
      await page.locator(`.entrant[data-side=${side}] .seat-remove`).click();
    }
    for (const id of ids) {
      await page.locator('#open-library').click();
      await page.locator(`[data-bot="${id}"]`).click();
    }
  };
  for (const incoming of [
    ['shrike-deepseek', 'shrike26-glm', 'kestrel-kimi', 'harrier'],
    ['sidecut-grok', 'ghostline-haiku', 'parallax-opus', 'harrier'],
  ]) {
    await selectRoster(incoming);
    for (const map of ['crossroads', 'islands', 'ruins']) {
      await page.locator(`[data-map="${map}"]`).click();
      const r = await runRound(`incoming-${map}`);
      check(
        JSON.stringify(r.meta.website.entrants.map((e) => e.id)) ===
          JSON.stringify(incoming),
        `${map}: three new programs and their stable identities`,
      );
      await page.locator('#board').focus();
      await page.keyboard.press('End');
      await page.locator('#result').waitFor({ state: 'visible' });
      const expected = r.ranking.map((row) =>
        modelFor(r.meta.website.entrants[r.meta.seatSlots[row.id]]),
      );
      check(
        JSON.stringify(
          await page.locator('.standing > span:nth-child(2)').allTextContents(),
        ) === JSON.stringify(expected),
        `${map}: incoming result model names`,
      );
      check(
        (await page.locator('#winner').textContent()).includes(
          modelFor(r.meta.website.entrants[r.meta.seatSlots[r.winners[0]]]),
        ),
        `${map}: winner uses model name`,
      );
      await page.locator('#close-result').click();
      await page.locator('#back-setup').click();
    }
  }
  await selectRoster(['harrier', 'tank26', 'vector', 'astra-knife']);
  await page.locator('#start').click();
  await page.locator('#cancel').click();
  await page.waitForFunction(() => document.body.dataset.state === 'setup');
  check(
    await page.evaluate(() => window.__workers === 0),
    'cancel disposes live workers',
  );
  await page.locator('#rules').click();
  check(
    await page.locator('#help-dialog').evaluate((e) => e.open),
    'help dialog',
  );
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: '选中坦克 A：GLM-5.3 Flash', exact: true })
    .click();
  await clickCell(0, 18);
  check((await draft()).stage.spawns.A.x === 0, 'phone tap-to-place');
  await page.screenshot({
    path: `${out}/phone-experiment.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1520, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('link', { name: '返回玩法菜单', exact: true }).click();
  await page.waitForURL('**/#play');
  await page.waitForFunction(() => !document.documentElement.dataset.playEntry);
  await page.locator('.slot[data-mode=tanks]').click();
  check(
    (await page.getByRole('button', { name: /开始乱斗/ }).isVisible()) ||
      (await page.getByRole('link', { name: /开始乱斗/ }).isVisible()),
    'main menu enabled tank entry',
  );
  await page.locator('.feature .enter-play[href="/tanks.html"]').click();
  await page.waitForURL('**/tanks.html');
  await settled();
  await page.waitForFunction(() => !document.documentElement.dataset.playEntry);
  check(true, 'menu and reduced-motion wipe round trip');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('link', { name: '返回玩法菜单', exact: true }).click();
  await page
    .locator('.play-entry-wipe[data-phase=closing]')
    .waitFor({ state: 'visible' });
  check(true, 'return uses the existing horizontal color wipe');
  await page.waitForURL('**/#play');
  await page.waitForFunction(() => !document.querySelector('.play-entry-wipe'));
  await page.locator('.slot[data-mode=tanks]').click();
  await page.locator('.feature .enter-play[href="/tanks.html"]').click();
  await page
    .locator('.play-entry-wipe[data-phase=closing]')
    .waitFor({ state: 'visible' });
  await page.waitForURL('**/tanks.html');
  await settled();
  await page.waitForFunction(() => !document.querySelector('.play-entry-wipe'));
  check(true, 'normal horizontal wipe enters and fully releases the game');
  const adapterChecks = await page.evaluate(async () => {
    const { createBrowserAdapter } = await import('/__test-worker.mjs');
    const result = [];
    const test = async (source, expected, options = {}) => {
      const a = createBrowserAdapter(source, { watchdog: 250, ...options });
      let code;
      try {
        await a.ready;
        await a.decide({});
      } catch (e) {
        code = e.code || 'error';
      } finally {
        a.dispose();
      }
      result.push(code === expected);
    };
    await test('function decide(){throw Error("fixture error");}', 'error');
    await test('function decide(){while(true){}}', 'timeout');
    await test(
      'while(true){}; function decide(){return {move:"stay"};}',
      'timeout',
    );
    await test(
      'function decide(){const t=performance.now();while(performance.now()-t<30){};return {move:"stay"};}',
      'timeout',
      { budget: 5 },
    );
    return { result, workers: window.__workers };
  });
  check(
    adapterChecks.result.every(Boolean),
    'real Worker error, stalled boot, infinite decision and CPU budget handled',
  );
  check(adapterChecks.workers === 0, 'failed Workers are terminated');
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const touch = await phone.newPage();
  await touch.goto(origin + '/tanks.html');
  await touch.locator('#board').waitFor();
  await touch.locator('#open-library').tap();
  await touch.locator('[data-bot=harrier]').tap();
  await touch
    .getByRole('button', { name: '选中坦克 A：GLM-5.3 Flash', exact: true })
    .tap();
  await touch.locator('#board').scrollIntoViewIfNeeded();
  const tb = await touch.locator('#board').boundingBox();
  await touch.touchscreen.tap(
    tb.x + (tb.width * 0.5) / 26,
    tb.y + (tb.height * 18.5) / 26,
  );
  check(
    await touch.evaluate(
      () =>
        JSON.parse(localStorage.getItem('aob-tank-workbench-v2')).stage.spawns.A
          .y === 18,
    ),
    'real touch input places selected tank',
  );
  await phone.close();
  check(errors.length === 0, `no page errors: ${errors.join(';')}`);
  check(writes.length === 0, 'no business writes');
  check(failed.length === 0, `no failed requests: ${failed.join(';')}`);
  console.log(`${checks.length} tank browser checks passed`);
} finally {
  await writeFile(
    `${out}/checks.json`,
    JSON.stringify({ checks, errors, writes, failed }, null, 2),
  );
  await browser.close();
  server.close();
}
