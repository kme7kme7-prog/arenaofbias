// Run after build:check. This exercises the built main-site menu with fixture APIs.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright-core';
import { MODES } from '../reference/menu-demo/modes.mjs';
const out = 'output/play-menu-integration';
await mkdir(out, { recursive: true });
const app = express();
app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url))));
const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const checks = [],
  errors = [],
  layouts = [],
  writes = [];
const check = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
};
const context = await browser.newContext();
await context.route('**/api/**', (route) => {
  const request = route.request(),
    path = new URL(request.url()).pathname;
  if (!['GET', 'HEAD'].includes(request.method()) && !path.endsWith('/track'))
    writes.push(path);
  const body = path.endsWith('/guess/today')
    ? { models: [], dayKey: '2026-10-11', dayNumber: 1 }
    : path.endsWith('/prompts')
      ? { prompts: [] }
      : path.endsWith('/works')
        ? { works: [] }
        : path.endsWith('/ratings')
          ? { ratings: {}, games: {} }
          : path.endsWith('/me')
            ? { user: null }
            : {};
  return route.fulfill({
    json: body,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    },
  });
});
await context.route('https://gallery.arenaofbias.icu/**', (route) =>
  route.fulfill({
    contentType: 'text/html',
    body: '<title>Gallery fixture</title>',
  }),
);
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
async function settled() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((i) => i.decode().catch(() => {})),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .map((a) => a.finished.catch(() => {})),
    );
  });
}
async function select(id) {
  const mode = MODES.find((m) => m.id === id);
  const desiredPage = Math.floor((mode.number - 1) / 6) + 1;
  while (
    Number(await page.locator('#page-number').textContent()) !== desiredPage
  ) {
    const current = Number(await page.locator('#page-number').textContent());
    await page
      .locator(current < desiredPage ? '#next-page' : '#previous-page')
      .click();
  }
  await page.locator(`.slot[data-mode=${id}]`).click();
  await settled();
}
async function untranslated() {
  return page.evaluate(() => {
    const found = [],
      walker = document.createTreeWalker(
        document.querySelector('.collection-content'),
        NodeFilter.SHOW_TEXT,
      );
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (
        n.parentElement.closest(
          '#forum-question,.reply-text,.identity-revealed,[hidden]',
        )
      )
        continue;
      if (/[\u4e00-\u9fff]/u.test(n.textContent))
        found.push(n.textContent.trim());
    }
    return found;
  });
}
try {
  check(
    MODES.map((m) => m.id).join(',') ===
      'party,formal,guess,tierlist,tanks,werewolf,geoguess,generals,league,debate,event,ctf,reviewjury',
    'Requested order preserved',
  );
  for (const [width, height, language, theme] of [
    [1920, 880, 'zh', 'paper'],
    [2560, 1240, 'zh', 'paper'],
    [1280, 720, 'zh', 'paper'],
    [1024, 600, 'zh', 'paper'],
    [390, 844, 'zh', 'paper'],
    [320, 720, 'zh', 'paper'],
    [1920, 880, 'zh', 'ink'],
    [1280, 720, 'en', 'ink'],
    [390, 844, 'en', 'paper'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/#play`);
    await page.evaluate(
      ({ language, theme }) => {
        localStorage.setItem('arena-language', language);
        localStorage.setItem('aob-theme', theme);
      },
      { language, theme },
    );
    await page.reload();
    await page.locator('#preview').waitFor();
    await settled();
    check(
      await page.locator('.account-entry').isVisible(),
      `${width}/${language}: account available`,
    );
    check(
      await page.locator('.theme-toggle-options').isVisible(),
      `${width}/${language}: theme preferences available`,
    );
    for (const mode of MODES) {
      await select(mode.id);
      const geometry = await page.evaluate(() => {
        const active = document.querySelector('.feature:not([hidden])'),
          r = (e) => e.getBoundingClientRect();
        const title = active.querySelector('h1'),
          note = active.querySelector('.heading-note'),
          scene = active.querySelector('.mode-scene,.menu-forum-scene'),
          bottom = active.querySelector('.feature-bottom');
        const titleRange = document.createRange();
        titleRange.selectNodeContents(title);
        const b = titleRange.getBoundingClientRect();
        const controls = [
          ...document.querySelectorAll('.masthead .brand,.masthead-tools > *'),
        ].map(r);
        return {
          mode: document.querySelector('#preview').dataset.mode,
          wh: [
            document.documentElement.scrollWidth,
            document.documentElement.scrollHeight,
          ],
          header: controls.every(
            (a, i) =>
              a.x >= -1 &&
              a.right <= innerWidth + 1 &&
              controls
                .slice(i + 1)
                .every((b) => a.right <= b.left + 1 || b.right <= a.left + 1),
          ),
          images: [...document.images].every((i) => i.naturalWidth > 0),
          order:
            r(active.querySelector('.feature-heading')).bottom <=
              r(scene).top + 1 &&
            r(scene).bottom <= r(bottom).top + 1 &&
            r(bottom).bottom <=
              r(document.querySelector('.legal-footer')).top + 1,
          heading: b.right <= r(note).left + 2,
          labels: [
            ...active.querySelectorAll(
              '.mode-scene-head,.mode-scene-foot,.feature-copy p',
            ),
          ].every(
            (e) =>
              e.scrollWidth <= e.clientWidth + 1 &&
              e.scrollHeight <= e.clientHeight + 1,
          ),
          labelled:
            document
              .querySelector('#preview')
              .getAttribute('aria-labelledby') ===
            document.querySelector('.slot[aria-selected=true]').id,
          locked: !active.querySelector('.enter-play'),
        };
      });
      if (mode.progress !== undefined || mode.id === 'event') {
        const meter = page.locator('.mode-progress');
        check(await meter.isVisible(), `${mode.id}: static progress visible`);
        check(
          (await meter.locator('b').textContent()) ===
            `${mode.id === 'event' ? '？' : mode.progress}%`,
          `${mode.id}: requested percentage`,
        );
        if (mode.progress !== undefined) {
          check(
            (await meter.getAttribute('aria-valuenow')) ===
              String(mode.progress),
            `${mode.id}: accessible percentage`,
          );
          check(
            await meter
              .locator('.progress-rail')
              .evaluate(
                (rail, progress) =>
                  Math.abs(
                    (rail.firstElementChild.getBoundingClientRect().width /
                      rail.getBoundingClientRect().width) *
                      100 -
                      progress,
                  ) < 0.5,
                mode.progress,
              ),
            `${mode.id}: accurate fill`,
          );
        }
      }
      const label = `${width}/${language}/${mode.id}`;
      layouts.push({ label, ...geometry });
      check(
        geometry.wh[0] <= width && (width <= 900 || geometry.wh[1] <= height),
        `${label}: page fits ${geometry.wh.join('x')}`,
      );
      check(geometry.header, `${label}: header controls fit`);
      check(
        geometry.images &&
          geometry.order &&
          geometry.heading &&
          geometry.labels,
        `${label}: preview regions fit ${JSON.stringify(geometry)}`,
      );
      check(
        geometry.labelled && geometry.locked === mode.locked,
        `${label}: selected label and availability correct`,
      );
      if (language === 'en') {
        const missing = await untranslated();
        check(!missing.length, `${label}: translated ${missing.join(';')}`);
      }
      if (
        width === 1920 ||
        (['party', 'event'].includes(mode.id) && width !== 320)
      )
        await page.screenshot({
          path: `${out}/${width}-${language}-${theme}-${mode.id}.png`,
          fullPage: true,
        });
    }
  }
  await page.setViewportSize({ width: 1920, height: 880 });
  await page.evaluate(() => {
    localStorage.setItem('arena-language', 'zh');
    localStorage.setItem('aob-theme', 'paper');
  });
  await page.reload();
  await select('party');
  await page.locator('#slot-1').focus();
  await page.keyboard.press('ArrowDown');
  check(
    (await page.locator('#preview').getAttribute('data-mode')) === 'guess',
    'ArrowDown follows two-column grid',
  );
  await page.keyboard.press('End');
  check(
    (await page.locator('#preview').getAttribute('data-mode')) === 'werewolf',
    'End selects final row',
  );
  await page.keyboard.press('PageDown');
  await page.keyboard.press('Home');
  check(
    (await page.locator('#preview').getAttribute('data-mode')) === 'geoguess',
    'Paging moves focus to second page',
  );
  await page.keyboard.press('PageDown');
  check(
    (await page.locator('#preview').getAttribute('data-mode')) === 'reviewjury',
    'Third page selects review jury',
  );
  check(
    (await page.getByRole('tab').count()) === 1,
    'Third page has one accessible tab',
  );
  check(
    await page.locator('#next-page').isDisabled(),
    'Third page is last page',
  );
  for (const key of ['End', 'ArrowRight', 'ArrowUp', 'Home']) {
    await page.keyboard.press(key);
    check(
      await page
        .locator('#slot-13')
        .evaluate((e) => e === document.activeElement),
      `Sparse page ${key} keeps valid focus`,
    );
  }
  await page.keyboard.press('PageUp');
  check(
    (await page.locator('#preview').getAttribute('data-mode')) === 'geoguess',
    'Return from third page restores prior selection',
  );
  await select('event');
  check(
    (await page.locator('.event-mystery > span').textContent()) === '?' &&
      !(await page.locator('.event-poster').count()),
    'Pelican shows question mark, no invented rules',
  );
  check(
    !/[✳✴✺]/u.test(await page.locator('.play-collection').textContent()),
    'No radial flower ornaments',
  );
  await select('party');
  await page.locator('[data-choice=a]').click();
  check(
    (await page.locator('.menu-forum-scene').getAttribute('data-chosen')) ===
      'a',
    'Local sample reveals authors',
  );
  await page.locator('.reset-preview').click();
  check(
    (await page.locator('.menu-forum-scene').getAttribute('data-chosen')) ===
      '',
    'Sample resets',
  );
  await page.locator('.help-trigger').click();
  check(await page.locator('.help-dialog').isVisible(), 'Help works');
  await page.keyboard.press('Escape');
  await page.locator('.theme-toggle-options').click();
  check(
    (await page.getByRole('menuitemradio').count()) === 3,
    'System theme option retained',
  );
  await page.keyboard.press('Escape');
  await page.locator('.theme-toggle-main').click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === 'ink',
  );
  check(true, 'Theme toggles');
  await settled();
  await page.locator('.theme-toggle-main').click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === 'paper',
  );
  await settled();
  await page.locator('.language-switch').click();
  await settled();
  check(
    (await page.locator('#feature h1').textContent()) === 'Play Your Way',
    'Language switch remounts cleanly',
  );
  for (const id of [
    'guess',
    'tanks',
    'werewolf',
    'geoguess',
    'generals',
    'league',
    'debate',
    'ctf',
    'tierlist',
  ]) {
    await select(id);
    if (id === 'ctf')
      for (const button of await page.locator('[data-patch]').all())
        await button.click();
    else if (id === 'tierlist') {
      await page.locator('[data-card=A]').click();
      await page.locator('[data-tier-target="4"]').click();
    } else await page.locator(`[data-action=${id}]`).click();
    const missing = await untranslated();
    check(
      !missing.length,
      `${id}: dynamic interface translated ${missing.join(';')}`,
    );
  }
  await page.locator('.language-switch').click();
  await select('party');
  await page.locator('.account-entry').click();
  check(
    await page.getByRole('dialog').filter({ hasText: '登录' }).isVisible(),
    'Account dialog opens',
  );
  await page.keyboard.press('Escape');
  await page.locator('.brand').click();
  await page.waitForURL('**/#home');
  await page.locator('.next-header').waitFor();
  check(
    (await page.locator('html').getAttribute('data-play-menu')) === null,
    'Menu scale releases on exit',
  );
  await page.goto(`${origin}/#play`);
  await select('formal');
  await page.locator('#mode-feature .enter-play').click();
  await page.waitForURL('https://gallery.arenaofbias.icu/#/arena');
  check(true, 'Formal destination preserved');
  await page.goto(`${origin}/#play`);
  await select('party');
  await page.locator('#feature .enter-play').click();
  await page.waitForURL('**/playground.html');
  await page.getByRole('link', { name: '返回玩法菜单', exact: true }).click();
  await page.waitForURL('**/#play');
  check(true, 'Playground enter and return preserved');
  await select('guess');
  await page.locator('#mode-feature .enter-play').click();
  await page.waitForURL('**/#guess');
  await page.locator('#guess-difficulty-title').waitFor();
  await settled();
  check(true, 'Guess destination preserved');
  await page.locator('.guess-picker-back').click();
  await page.waitForURL('**/#play');
  await page.locator('#preview').waitFor();
  check(true, 'Guess returns to menu');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await select('event');
  check(
    (await page
      .locator('.collection-content')
      .evaluate((el) => el.getAnimations({ subtree: true }).length)) === 0,
    'Reduced motion respected',
  );
  check(!writes.length, `No preview business writes: ${writes.join(';')}`);
  check(!errors.length, `No browser exceptions: ${errors.join(';')}`);
  console.log(`Main menu: ${checks.length} checks passed.`);
} finally {
  await writeFile(
    `${out}/checks.json`,
    JSON.stringify({ checks, layouts, errors, writes }, null, 2),
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
