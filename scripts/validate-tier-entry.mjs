// Built entry acceptance with read-only public fixtures and an isolated scene stub.
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createTierCatalog } from '../app/tier/catalog.mjs';
const topics = JSON.parse(await readFile('reference/tier-play/topics.json'));
const brands = JSON.parse(await readFile('reference/tier-play/brands.json'));
const read = async (path) => {
  const response = await fetch('https://api.arenaofbias.icu' + path);
  assert.equal(response.status, 200);
  return response.json();
};
const [{ works }, { prompts }] = await Promise.all([
  read('/api/playground/works'),
  read('/api/prompts'),
]);
const checks = [],
  errors = [],
  writes = [];
const check = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
};
let publicWorks = works;
const catalog = createTierCatalog({
  topics,
  brands,
  assetURL: (name) => '/brands/' + name,
  origin: 'https://game.arenaofbias.icu',
  readCatalog: async () => ({ works: publicWorks, prompts }),
});
const available = await catalog.topics();
check(available.length === 19, 'nineteen public topics available');
for (const topic of available) {
  const round = await catalog.round(topic.id);
  const names = await catalog.identities(topic.id);
  check(
    round.works.length >= 2 &&
      round.works.every((work) => names[work.id]?.model),
    `${topic.name}: actual identities and dynamic count`,
  );
  check(
    round.kind === 'text'
      ? round.works.every((work) => work.paragraphs.length)
      : round.works.every(
          (work) =>
            new URL(work.src).searchParams.get('parent') ===
            'https://game.arenaofbias.icu',
        ),
    `${topic.name}: native text or isolated content origin`,
  );
}
await catalog.round('004');
publicWorks = works.filter(
  (work) => work.id !== topics.find((t) => t.id === '004').workIds[0],
);
await assert.rejects(catalog.identities('004'), /下架/);
check(true, 'reveal rechecks live visibility');
publicWorks = [];
check(
  (await catalog.topics()).length === 0,
  'empty public catalog never falls back to cached works',
);
await assert.rejects(catalog.round('004'), /公开作品/);
check(true, 'empty round fails explicitly');
publicWorks = works;
const out = 'output/tier-entry';
await mkdir(out, { recursive: true });
const app = express();
app.use(express.static('dist'));
const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const [theme, motion, width, height] of [
    ['paper', 'no-preference', 1520, 691],
    ['ink', 'no-preference', 2560, 1240],
    ['paper', 'reduce', 390, 844],
    ['ink', 'reduce', 1280, 620],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: motion,
    });
    await context.addInitScript((theme) => {
      if (window === top) localStorage.setItem('aob-theme', theme);
    }, theme);
    await context.route('**/api/**', async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (!['GET', 'HEAD'].includes(req.method()) && !path.endsWith('/track'))
        writes.push(path);
      const body = path.endsWith('/works')
        ? { works: publicWorks }
        : path.endsWith('/prompts')
          ? { prompts }
          : path.endsWith('/me') || path.endsWith('/session')
            ? { user: null }
            : path.endsWith('/ratings')
              ? { ratings: {}, games: {} }
              : {};
      if (path.endsWith('/playground/works'))
        await new Promise((resolve) => setTimeout(resolve, 450));
      return route.fulfill({
        json: body,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    });
    await context.route('https://*.w.arenaofbias.icu/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<canvas width="800" height="600"></canvas><script>const host=${JSON.stringify(origin)};parent.postMessage('aob:work-ready',host);parent.postMessage({stage:'rendered'},host);parent.postMessage({stage:'camera-ready',available:false},host);setTimeout(()=>parent.postMessage({stage:'work-ready'},host),600);</script>`,
      }),
    );
    const p = await context.newPage();
    p.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error')
        console.log(message.text());
    });
    p.on('pageerror', (error) => errors.push(error.message));
    await p.goto(origin + '/#play');
    await p.locator('.slot[data-mode=tierlist]').click();
    check(
      (await p.locator('#mode-feature .enter-play').isVisible()) &&
        !(await p.locator('#mode-feature').textContent()).includes('暂未完成'),
      `${theme}/${width}: playable menu entry`,
    );
    await p.locator('#mode-feature .enter-play').click();
    await p.waitForURL('**/tier.html');
    check(
      (await p.locator('html').getAttribute('data-play-entry')) === 'covered',
      `${theme}/${width}: document swap stays covered while preparing`,
    );
    await p.locator('#tray .work-card').nth(7).waitFor();
    await p.waitForFunction(() => !window.PlaygroundEntry.active);
    check(
      (await p.locator('html').getAttribute('data-theme')) === theme,
      `${theme}/${width}: theme shared with menu`,
    );
    await p.locator('#tray .work-card').first().focus();
    await p.keyboard.press('Enter');
    await p.waitForTimeout(180);
    check(
      (await p.locator('#scene').getAttribute('data-ready')) === 'false',
      `${theme}/${width}: historical early probe cannot expose loading scene`,
    );
    await p.waitForFunction(
      () => document.querySelector('#scene').dataset.ready === 'true',
    );
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.querySelector('#viewer').open);
    check(
      (await p.locator('iframe').count()) === 0,
      `${theme}/${width}: close releases viewer`,
    );
    for (let index = 0; index < 8; index++) {
      await p.locator('#tray .work-card').first().focus();
      await p.keyboard.press(String((index % 3) + 1));
    }
    await p.locator('#reveal').click();
    await p.waitForFunction(() => document.body.dataset.revealed === 'true');
    check(
      await p
        .locator('.model-logo')
        .evaluateAll((images) =>
          images.every((img) => img.complete && img.naturalWidth),
        ),
      `${theme}/${width}: all real logos decode`,
    );
    check(
      await p.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
      `${theme}/${width}: one screen`,
    );
    const downloadEvent = p.waitForEvent('download');
    await p.locator('#export').click();
    const download = await downloadEvent;
    check(
      download.suggestedFilename() === '营造法式-偏好榜.png',
      `${theme}/${width}: share filename`,
    );
    if (width === 1520) {
      await download.saveAs(`${out}/share.png`);
      await p.screenshot({ path: `${out}/revealed.png` });
    }
    await p.reload();
    await p.locator('body[data-revealed=true]').waitFor();
    check(
      (await p.locator('#tray .work-card').count()) === 0,
      `${theme}/${width}: refresh keeps result`,
    );
    await p.locator('.brand').click();
    await p.waitForURL('**/#play');
    await p.waitForFunction(() => !window.PlaygroundEntry.active);
    check(
      (await p.locator('#preview').isVisible()) &&
        (await p.locator('.play-entry-wipe').count()) === 0,
      `${theme}/${width}: return clears wipe`,
    );
    await p.goto(origin + '/tier.html?topic=q-a71a7e7e4bcaadc7');
    await p.locator('#tray .work-card').nth(7).waitFor();
    check(
      (await p.locator('#topic-context').textContent()).includes('1900'),
      `${theme}/${width}: common text question visible`,
    );
    await p.locator('#tray .work-card').first().focus();
    await p.keyboard.press('Enter');
    check(
      (await p.locator('#text-story p').count()) > 0 &&
        (await p.locator('iframe').count()) === 0,
      `${theme}/${width}: native reader uses no work HTML`,
    );
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.querySelector('#viewer').open);
    const before = await p.locator('#topic').textContent();
    await p.locator('#change-topic').click();
    await p.waitForFunction(
      (before) => document.querySelector('#topic').textContent !== before,
      before,
    );
    check(
      (await p.locator('#tray .work-card').count()) >= 2,
      `${theme}/${width}: random change prepares a new anonymous round`,
    );
    await context.close();
  }
  check(!errors.length, `no browser errors: ${errors.join(';')}`);
  check(!writes.length, `no business writes: ${writes.join(';')}`);
  console.log(`Tier entry: ${checks.length} checks passed.`);
} finally {
  await writeFile(
    `${out}/checks.json`,
    JSON.stringify({ checks, errors, writes }, null, 2),
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
