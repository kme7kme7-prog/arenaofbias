import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createMenuDemoApp } from './serve-menu-demo.mjs';
import { MODES } from '../reference/menu-demo/modes.mjs';

const server = createMenuDemoApp().listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const url = `${origin}/reference/menu-demo/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = 'output/menu-collection';
await mkdir(output, { recursive: true });
const results = [];
const errors = [];
const writes = [];
const forumSources = JSON.parse(
  await readFile('reference/menu-demo/assets/forum.json', 'utf8'),
);
function check(condition, label) {
  assert.ok(condition, label);
  results.push(label);
}
async function settled(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
    await Promise.all(
      document.getAnimations().map((motion) => motion.finished.catch(() => {})),
    );
  });
}
try {
  const context = await browser.newContext();
  await context.route('**/*', (route) => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method()))
      writes.push(request.method() + ' ' + request.url());
    if (!request.url().startsWith(origin)) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const sizes = [
    ['desktop', 1920, 880],
    ['large', 2560, 1240],
    ['large-scaled', 2048, 1050],
    ['wide-short', 2560, 900],
    ['laptop', 1280, 720],
    ['compact', 1024, 600],
    ['tablet', 768, 1024],
    ['phone', 390, 844],
    ['small-phone', 320, 720],
  ];
  for (const [name, width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto(url);
    await settled(page);
    const measure = await page.evaluate(() => {
      const box = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          height: r.height,
        };
      };
      return {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        header: box('.masthead'),
        heading: box('.feature-heading'),
        scene: box('.menu-forum-scene'),
        bottom: box('.feature-bottom'),
        footer: box('.footer'),
        rows: [...document.querySelectorAll('.forum-post')].map((e) => {
          const r = e.getBoundingClientRect();
          const main = e.querySelector('.post-main');
          return {
            top: r.top,
            bottom: r.bottom,
            height: r.height,
            fits:
              main.scrollHeight <= main.clientHeight + 1 &&
              main.scrollWidth <= main.clientWidth + 1,
          };
        }),
        images: [...document.images].every((i) => i.naturalWidth > 0),
      };
    });
    check(measure.width <= width, name + ': no horizontal scroll');
    if (width > 900)
      check(measure.height <= height, name + ': one desktop screen');
    check(measure.images, name + ': dialogue cover decoded');
    check(
      measure.header.bottom <= measure.heading.top &&
        measure.heading.bottom < measure.scene.top &&
        measure.scene.bottom < measure.bottom.top &&
        measure.bottom.bottom <= measure.footer.top,
      name + ': heading, preview and entry do not overlap',
    );
    check(
      measure.rows.every(
        (row, i) =>
          row.fits && (!i || row.top >= measure.rows[i - 1].bottom - 1),
      ),
      name + ': three readable vertical floors without overlap',
    );
    check(
      (await page.locator('#forum-question').textContent()).trim() ===
        forumSources.displayQuestion,
      name + ': real prompt uses recorded display copy',
    );
    check(
      (await page.locator('.reply-text').allTextContents())
        .map((text) => text.trim())
        .join('|') === forumSources.works.map((w) => w.text).join('|'),
      name + ': both replies match actual works',
    );
    check(
      await page
        .locator('.identity-revealed')
        .evaluateAll((elements) =>
          elements.every(
            (e) =>
              getComputedStyle(e).opacity === '0' &&
              e.getAttribute('aria-hidden') === 'true',
          ),
        ),
      name + ': model identities start concealed',
    );
    check(
      await page.locator('.reply-choice').evaluateAll((elements) =>
        elements.every((e) => {
          const r = e.getBoundingClientRect();
          const p = e.closest('.forum-post').getBoundingClientRect();
          return r.top >= p.top && r.bottom <= p.bottom;
        }),
      ),
      name + ': choice controls remain inside their reply',
    );
    await page.screenshot({
      path: output + '/' + name + '.png',
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 1920, height: 880 });
  await page.goto(url);
  await settled(page);
  const unique = new Set();
  for (const pageNumber of [1, 2]) {
    if (pageNumber === 2) await page.locator('#next-page').click();
    for (const tab of await page.getByRole('tab').all()) {
      const number = Number(await tab.getAttribute('data-slot'));
      const mode = MODES[number - 1];
      unique.add(number);
      await tab.click();
      await settled(page);
      check(
        (await tab.getAttribute('aria-selected')) === 'true',
        `${mode.id}: selectable`,
      );
      check(
        (await page.locator('#preview').getAttribute('data-mode')) === mode.id,
        `${mode.id}: correct preview`,
      );
      const panel = page.locator(
        mode.id === 'party' ? '#feature' : '#mode-feature',
      );
      check(await panel.isVisible(), `${mode.id}: preview visible`);
      check(
        (await panel.locator('.enter-play').count()) === (mode.locked ? 0 : 1),
        `${mode.id}: only available games have entry links`,
      );
      if (mode.locked)
        check(
          await panel.getByText('暂未完成', { exact: true }).isVisible(),
          `${mode.id}: clearly unfinished`,
        );
      else
        check(
          (await panel.locator('.enter-play').getAttribute('href')) ===
            mode.href,
          `${mode.id}: real destination preserved`,
        );
    }
  }
  check(unique.size === 12, '12 designed modes across two pages');
  check(
    MODES.filter((mode) => !mode.locked).length === 3,
    '3 available games, 9 previews',
  );
  await page.locator('#previous-page').click();
  check(
    (await page.locator('#slot-6').getAttribute('aria-selected')) === 'true',
    'page remembers selection',
  );
  await page.locator('#slot-2').focus();
  await page.keyboard.press('ArrowDown');
  check(
    await page.locator('#slot-4').evaluate((e) => e === document.activeElement),
    'keyboard grid navigation',
  );
  await page.keyboard.press('PageDown');
  check(
    await page
      .locator('#slot-12')
      .evaluate((e) => e === document.activeElement),
    'keyboard page navigation remembers focus',
  );
  await page.keyboard.press('Home');
  check(
    (await page.locator('#slot-7').getAttribute('aria-selected')) === 'true',
    'keyboard Home',
  );
  await page.locator('#previous-page').click();
  await page.evaluate(() => {
    for (let i = 0; i < 24; i++)
      document.querySelectorAll('.slot')[i % 6].click();
    document.querySelector('#slot-1').click();
  });
  await settled(page);
  check(
    (await page.locator('#feature').isVisible()) &&
      (await page.locator('#mode-feature').isHidden()),
    'rapid switching settles on correct content',
  );
  check(
    (await page.evaluate(() => document.getAnimations().length)) === 0,
    'rapid switching leaves no animations behind',
  );

  await page
    .getByRole('button', { name: '选回复 A，这句更绝', exact: true })
    .click();
  await settled(page);
  check(
    (await page.locator('.menu-forum-scene').getAttribute('data-chosen')) === 'a',
    'A choice updates selected state',
  );
  check(
    (await page.locator('.identity-revealed').allTextContents()).join('|') ===
      forumSources.works.map((w) => w.modelName).join('|'),
    'verified authors revealed beside each reply',
  );
  check(
    await page
      .locator('.identity-revealed')
      .evaluateAll((elements) =>
        elements.every(
          (e) =>
            getComputedStyle(e).opacity === '1' &&
            !e.hasAttribute('aria-hidden'),
        ),
      ),
    'authors visible and accessible after choosing',
  );
  check(
    await page
      .locator('.identity-anonymous')
      .evaluateAll((elements) =>
        elements.every((e) => e.getAttribute('aria-hidden') === 'true'),
      ),
    'anonymous labels no longer read twice',
  );
  await page.screenshot({ path: output + '/chosen.png', fullPage: true });
  await page.locator('[data-choice=b]').click();
  check(
    (await page.locator('.menu-forum-scene').getAttribute('data-chosen')) === 'b',
    'switch choice to B',
  );
  check(
    (await page.locator('[data-choice=a]').getAttribute('aria-pressed')) ===
      'false' &&
      (await page.locator('[data-choice=b]').getAttribute('aria-pressed')) ===
        'true',
    'only current choice is pressed',
  );
  await page.getByRole('button', { name: /再选一次/ }).click();
  await settled(page);
  check(
    (await page.locator('.menu-forum-scene').getAttribute('data-chosen')) === '',
    'reset restores anonymous preview',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-choice=b]').click();
  await settled(page);
  check(
    await page.locator('.reply-post').evaluateAll((elements) =>
      elements.every((e) => {
        const label = e.querySelector('.post-identity');
        return label.scrollWidth <= label.clientWidth + 1;
      }),
    ),
    'mobile revealed authors are not clipped',
  );
  await page.screenshot({ path: output + '/chosen-phone.png', fullPage: true });
  await page.setViewportSize({ width: 1920, height: 880 });
  await page.getByRole('button', { name: /再选一次/ }).click();
  await page.getByRole('button', { name: '怎么玩', exact: true }).click();
  check(await page.getByRole('dialog').isVisible(), 'help opens');
  await page.keyboard.press('Escape');
  check(await page.getByRole('dialog').isHidden(), 'Escape dismisses help');
  check(
    await page
      .locator('.help-trigger')
      .evaluate((e) => e === document.activeElement),
    'dialog returns focus',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#slot-1').click();
  check(
    (await page.evaluate(() => document.getAnimations().length)) === 0,
    'reduced motion respected',
  );
  await page.locator('#slot-2').click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  for (const [name, width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const mode of MODES) {
      if (mode.id === 'party') continue;
      await page.goto(`${url}?mode=${mode.id}`);
      await settled(page);
      const geometry = await page.evaluate(() => {
        const panel = document.querySelector('#mode-feature');
        const rect = (e) => e.getBoundingClientRect();
        const scene = panel.querySelector('.mode-scene');
        const heading = panel.querySelector('.feature-heading');
        const bottom = panel.querySelector('.feature-bottom');
        const h1 = heading.querySelector('h1');
        const note = heading.querySelector('.heading-note');
        return {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          images: [...document.images].every((image) => image.naturalWidth > 0),
          navFits: [...document.querySelectorAll('.slot')].every((slot) => {
            const title = slot.querySelector('.slot-title');
            const picture = slot.querySelector('.slot-picture');
            const description = slot.querySelector('.slot-description');
            return (
              slot.scrollHeight <= slot.clientHeight + 1 &&
              title.scrollWidth <= title.clientWidth + 1 &&
              rect(picture).bottom <= rect(title).top + 2 &&
              rect(title).bottom <= rect(description).top + 2
            );
          }),
          headerFits:
            h1.scrollWidth <= h1.clientWidth + 1 &&
            rect(h1).right <= rect(note).left + 1,
          regions:
            rect(heading).bottom <= rect(scene).top &&
            rect(scene).bottom <= rect(bottom).top + 1 &&
            rect(bottom).bottom <=
              rect(document.querySelector('.footer')).top + 1,
          labels: [
            ...panel.querySelectorAll(
              '.mode-scene-head, .mode-scene-foot, .feature-copy p',
            ),
          ].every(
            (e) =>
              e.scrollWidth <= e.clientWidth + 1 &&
              e.scrollHeight <= e.clientHeight + 1,
          ),
          actionFits: [...panel.querySelectorAll('button')].every(
            (e) =>
              rect(e).left >= rect(scene).left - 1 &&
              rect(e).right <= rect(scene).right + 1 &&
              rect(e).top >= rect(scene).top - 1 &&
              rect(e).bottom <= rect(scene).bottom + 1,
          ),
        };
      });
      const label = `${name}/${mode.id}`;
      check(
        geometry.width <= width && (width <= 900 || geometry.height <= height),
        `${label}: page fits`,
      );
      check(geometry.images, `${label}: images decoded`);
      check(geometry.navFits, `${label}: all six covers and labels fit`);
      check(geometry.headerFits, `${label}: title and note do not overlap`);
      check(
        geometry.regions && geometry.labels && geometry.actionFits,
        `${label}: preview, descriptions and controls fit ${JSON.stringify(geometry)}`,
      );
      if (['desktop', 'large', 'compact', 'phone'].includes(name))
        await page.screenshot({
          path: `${output}/${name}-${mode.id}.png`,
          fullPage: true,
        });
    }
  }

  await page.setViewportSize({ width: 1920, height: 880 });
  async function visitMode(id) {
    await page.goto(`${url}?mode=${id}`);
    await settled(page);
    check(
      (await page.locator('#preview').getAttribute('data-mode')) === id,
      `${id}: direct URL restores mode`,
    );
  }
  await visitMode('guess');
  await page.locator('[data-action=guess]').click();
  check(
    await page
      .locator('.scene-guess')
      .evaluate((e) => e.classList.contains('is-demonstrating')),
    'guess: reveals next sample clue',
  );
  await visitMode('tierlist');
  await page.locator('[data-card=A]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-tier-target="4"]').focus();
  await page.keyboard.press('Enter');
  check(
    (await page.locator('[data-tier="4"] [data-card=A]').count()) === 1,
    'tier list: keyboard moves card',
  );
  await page.locator('[data-card=B]').dragTo(page.locator('[data-tier="0"]'));
  check(
    (await page.locator('[data-tier="0"] [data-card=B]').count()) === 1,
    'tier list: actual drag moves card',
  );
  await visitMode('tanks');
  const tankBefore = await page.locator('.tank-a').boundingBox();
  await page.locator('[data-action=tanks]').click();
  await settled(page);
  check(
    (await page.locator('.tank-a').boundingBox()).x > tankBefore.x,
    'tanks: preview step moves tank',
  );
  await visitMode('werewolf');
  check(
    (await page.locator('.wolf-seat').count()) === 12,
    'werewolf: twelve seats',
  );
  await page.locator('[data-action=werewolf]').click();
  check(
    (await page.locator('.role-front[aria-hidden=false]').count()) === 12,
    'werewolf: sample roles reveal',
  );
  await visitMode('geoguess');
  await page.locator('[data-action=geoguess]').click();
  check(
    (await page.locator('[data-answer]').allTextContents()).join('|') ===
      '日本|河口湖 · 富士山|2014',
    'geoguess: source-verified answer',
  );
  await visitMode('generals');
  await page.locator('[data-action=generals]').click();
  check(
    (await page
      .locator('.scene-generals')
      .evaluate((e) => e.classList.contains('is-demonstrating'))) &&
      (await page.locator('.territory.path.mountain').count()) === 0,
    'generals: sample path avoids mountains',
  );
  await visitMode('league');
  const notes = await page.locator('.private-notebook').textContent();
  await page.locator('[data-action=league]').click();
  check(
    (await page.locator('.league-games h3').textContent()) === '信任市场' &&
      (await page.locator('.private-notebook').textContent()) === notes,
    'league: game changes, memory persists',
  );
  await visitMode('debate');
  await page.locator('[data-action=debate]').click();
  check(
    (await page.locator('.debate-round').allTextContents()).every((text) =>
      text.startsWith('第二轮'),
    ),
    'debate: advances both sample positions',
  );
  await visitMode('ctf');
  for (const patch of await page.locator('[data-patch]').all())
    await patch.click();
  check(
    (await page.locator('.patch:disabled').count()) === 3 &&
      (await page.locator('.site-health').textContent()) ===
        '这一轮，防线补好了',
    'ctf: three local patches update status',
  );
  await visitMode('party');

  await page.route('**/playground.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>Existing playground destination</title><h1>Existing playground</h1>',
    }),
  );
  await page.getByRole('link', { name: '进入随心玩' }).click();
  await page.waitForURL(`${origin}/playground.html#home`);
  check(
    page.url().endsWith('/playground.html#home'),
    'CTA navigates to existing game',
  );
  await page.goBack();
  await page.waitForSelector('.slot-mode');
  check(
    (await page.locator('#feature .enter-play').getAttribute('aria-busy')) ===
      null,
    'history return clears busy state',
  );
  check(
    (await page.locator('.arrival-wipe').getAttribute('data-active')) ===
      'false',
    'history return clears transition cover',
  );
  check(writes.length === 0, 'demo never submits votes or other writes');
  check(errors.length === 0, `no browser errors: ${errors.join(';')}`);
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify(
      { checks: results.length, results, errors, writes },
      null,
      2,
    ),
  );
  console.log(
    `Menu demo: ${results.length} checks passed. Screenshots: ${output}/`,
  );
} finally {
  await browser.close();
  server.close();
}
