import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const snapshot = JSON.parse(await readFile('.local/forum-review/snapshot.json', 'utf8'));
const presentation = JSON.parse(await readFile('lib/forum-presentation.json', 'utf8'));
const base = 'http://127.0.0.1:5443', url = `${base}/#arena/${snapshot.prompt.id}`;
const out = 'output/forum-review';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], writes = [], timings = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/\/api\//.test(request.url()) && request.method() !== 'GET' && !request.url().endsWith('/api/track')) writes.push(request.url()); });
await page.addInitScript(() => localStorage.setItem('aob-theme', 'paper'));
await page.addInitScript(() => {
  window.__forumMotion = [];
  window.__recordForum = (selector = '.forum-arena.works-reveal') => {
    window.__forumMotion = [];
    let started, playingAt;
    const sample = now => {
      const shell = document.querySelector('.forum-arena.works-reveal');
      if (shell) {
        started ??= now;
        const phase = document.querySelector('.game-transition')?.dataset.gtPhase;
        if (phase !== 'entry') playingAt ??= now;
        window.__forumMotion.push({ phase,
          details: [...shell.querySelectorAll('.forum-op-profile, .panel-identity, .forum-op-body, .forum-reply-content')].map(el => {
            const style = getComputedStyle(el), m = new DOMMatrixReadOnly(style.transform);
            return { x: m.m41, opacity: +style.opacity, state: style.animationPlayState };
          }),
          floors: [...shell.querySelectorAll('.contender')].map(el => {
            const style = getComputedStyle(el), m = new DOMMatrixReadOnly(style.transform);
            return { y: m.m42, sx: m.a, sy: m.d, opacity: +style.opacity, state: style.animationPlayState };
          }) });
      }
      // Include the full reveal after the curtain's variable hold, with a hard stop for failures.
      if (started === undefined || ((playingAt === undefined || now - playingAt < 1100) && now - started < 6000)) requestAnimationFrame(sample);
    };
    if (document.querySelector(selector)) requestAnimationFrame(sample);
    else {
      const observer = new MutationObserver(() => {
        if (!document.querySelector(selector)) return;
        observer.disconnect();
        requestAnimationFrame(sample);
      });
      observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    }
  };
  window.__recordForum();
});
const ready = async () => {
  await page.waitForSelector('.forum-arena.phase-voting');
  await page.waitForFunction(() => !document.querySelector('.game-transition'));
};
async function originalCheck() {
  assert.equal(await page.locator('h1[data-swap]').innerText(), presentation.title);
  assert.equal(await page.locator('.forum-arena .aigc-label').count(), 0);
  assert.equal(await page.locator('.forum-post-question').innerText(), snapshot.prompt.prompt);
  const replies = await page.locator('.forum-reply').evaluateAll(els => els.map(el => ({ id: el.dataset.workId, paragraphs: [...el.querySelectorAll('.forum-original')].map(p => p.textContent) })));
  assert.equal(replies.length, 2);
  for (const reply of replies) {
    const story = JSON.parse(snapshot.works.find(w => w.id === reply.id).content).story;
    assert.deepEqual(reply.paragraphs, [story.heading, ...story.paragraphs, story.ending].filter(p => p !== undefined));
  }
  assert.equal(await page.locator('.forum-arena iframe').count(), 0);
}
async function avatarCheck(revealed = false) {
  await page.waitForFunction(revealed => [...document.querySelectorAll('.contender .forum-avatar')].every(el => {
    const face = el.querySelector('.forum-avatar-brand');
    return getComputedStyle(face).opacity === (revealed ? '1' : '0');
  }), revealed);
  const avatars = await page.locator('.contender').evaluateAll(els => els.map(el => ({
    id: el.querySelector('.forum-reply').dataset.workId,
    src: el.querySelector('.forum-avatar-brand img').getAttribute('src'),
    loaded: el.querySelector('.forum-avatar-brand img').naturalWidth > 0,
    anonymous: getComputedStyle(el.querySelector('.forum-avatar-anonymous')).opacity,
  })));
  for (const avatar of avatars) {
    const work = snapshot.works.find(work => work.id === avatar.id);
    assert.equal(avatar.src, presentation.models[work.modelId].logo);
    assert.ok(avatar.loaded, 'logo is available locally');
    assert.equal(avatar.anonymous, revealed ? '0' : '1');
  }
}
async function next() {
  const started = Date.now();
  await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
  await page.waitForSelector('.phase-transition');
  await ready();
  timings.push(Date.now() - started);
  await originalCheck();
}
function checkMotion(motion) {
  assert.ok(motion.length >= 8);
  assert.ok(motion.some(frame => frame.floors.some(f => f.y > .1)));
  assert.ok(motion.every((frame, index) => frame.floors.every((f, side) => f.sx === 1 && f.sy === 1 && f.y >= -.01 &&
    (index === 0 || f.y <= motion[index - 1].floors[side].y + .01))), 'unit scale, monotonic motion');
  assert.ok(motion.filter(frame => frame.phase === 'entry').every(frame => frame.floors.every(f => f.state === 'paused')));
  assert.ok(motion.filter(frame => frame.phase === 'entry').every(frame => frame.details.every(f => f.state === 'paused')));
  assert.ok(motion.some(frame => frame.details.some(f => Math.abs(f.x) > .1 && f.opacity > 0 && f.opacity < 1)), 'nested layers animate');
  assert.ok(motion.at(-1).floors.every(f => Math.abs(f.y) < .01 && f.opacity === 1));
  assert.ok(motion.at(-1).details.every(f => Math.abs(f.x) < .01 && f.opacity === 1));
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await ready();
  await originalCheck();
  await page.waitForTimeout(1400);
  const motion = await page.evaluate(() => window.__forumMotion);
  checkMotion(motion);
  assert.equal(await page.locator('.forum-arena .versus-spine').isVisible(), false);
  const geometry = () => page.locator('.forum-arena .contender').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
  const rest = await geometry();
  await page.waitForTimeout(300);
  assert.deepEqual(await geometry(), rest, 'no final size adjustment');
  const layouts = [];
  for (const theme of ['paper', 'ink']) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.waitForTimeout(350);
    const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(overflow.scroll <= width + 1, JSON.stringify(overflow));
    await page.screenshot({ path: `${out}/${theme}-${width}.png`, fullPage: true });
    layouts.push({ theme, width, noOverflow: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.documentElement.dataset.theme = 'paper');
  let swapFrames = 0;
  for (const choice of ['a', 'b', 'draw']) {
    const profileStyle = () => page.locator('.panel-heading').evaluateAll(els => els.map(el => ({
      background: getComputedStyle(el).backgroundColor,
      nameSize: getComputedStyle(el.querySelector('.model-identity')).fontSize,
    })));
  const anonymousStyle = await profileStyle();
    await avatarCheck();
    await page.locator(choice === 'draw' ? '.vote-draw' : `.vote-${choice}`).click();
    await page.waitForSelector('.phase-result');
    await avatarCheck(true);
    assert.deepEqual(await profileStyle(), anonymousStyle, 'reveal keeps the forum profile styling');
    assert.ok((await page.locator('.model-identity').allTextContents()).every(name => !name.startsWith('吧友')));
    assert.match(await page.locator('.vote-note').innerText(), /票未计入/);
    await originalCheck();
    if (choice === 'a') await page.screenshot({ path: `${out}/result.png`, fullPage: true });
    await page.evaluate(() => window.__recordForum('.forum-arena.shutter-exit.works-reveal'));
    await next();
    await avatarCheck();
    await page.waitForTimeout(550);
    const swap = await page.evaluate(() => window.__forumMotion);
    checkMotion(swap);
    swapFrames += swap.length;
  }
  await page.getByRole('button', { name: '重播入场', exact: true }).click();
  await page.waitForSelector('.phase-intro');
  await ready();
  await originalCheck();
  // Deterministic selection only in this isolated browser: exercise the actual covered route.
  await page.evaluate(() => { window.__originalRandom = Math.random; Math.random = () => 0; });
  await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
  await page.waitForURL('**/#arena/q-5ebd7c84dff7cd8f');
  await page.waitForSelector('.orange-arena.phase-voting');
  await page.waitForFunction(() => !document.querySelector('.game-transition'));
  assert.equal(await page.locator('.orange-sign-rig').count(), 2);
  assert.equal(await page.locator('.forum-arena').count(), 0);
  await page.evaluate(() => window.__recordForum());
  await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
  await page.waitForURL(`**/#arena/${snapshot.prompt.id}`);
  await ready();
  await page.waitForTimeout(1300);
  const routeMotion = await page.evaluate(() => window.__forumMotion);
  checkMotion(routeMotion);
  assert.ok(routeMotion.some(frame => frame.phase === 'entry'), 'sample held route curtain');
  assert.ok(routeMotion.some(frame => frame.phase === 'exit' && frame.floors.some(f => f.y > .1)), 'floor entrance starts during curtain exit');
  await originalCheck();
  await page.evaluate(() => Math.random = window.__originalRandom);
  await page.goto(`${base}/#arena/008`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wechat-arena.phase-voting');
  assert.equal(await page.locator('.wechat-thread').count(), 2);
  assert.equal(await page.locator('.forum-arena').count(), 0);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await ready();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const work of snapshot.works) {
    const other = snapshot.works.find(w => w.modelId !== work.modelId);
    await page.evaluate(mark => localStorage.setItem('aob-test-pair', JSON.stringify(mark)), { promptId: snapshot.prompt.id, a: work.id, b: other.id, at: Date.now() });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready();
    assert.equal(await page.locator(`.forum-reply[data-work-id="${work.id}"]`).count(), 1);
    await originalCheck();
    await avatarCheck();
    await page.locator('.vote-a').click();
    await page.waitForSelector('.phase-result');
    await avatarCheck(true);
  }
  assert.equal(await page.locator('.forum-arena .contender').evaluateAll(els => els.flatMap(el => el.getAnimations()).length), 0);
  await page.route('**/forum-brands/*', route => route.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  await page.locator('.vote-a').click();
  await page.waitForSelector('.phase-result');
  assert.equal(await page.locator('.contender .forum-avatar.is-revealed').count(), 0, 'failed logos keep the anonymous avatar without blocking the round');
  assert.ok((await page.locator('.model-identity').allTextContents()).every(name => !name.startsWith('吧友')));
  await page.unroute('**/forum-brands/*');
  await page.getByRole('link', { name: '返回题库' }).click();
  await page.waitForURL('**/#prompts');
  await page.waitForFunction(() => !document.querySelector('.game-transition'));
  assert.equal(await page.locator('.forum-arena').count(), 0);
  await page.goto(`${base}/?presentation=classic#arena/${snapshot.prompt.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.phase-voting');
  assert.equal(await page.locator('.forum-arena').count(), 0);
  assert.equal(await page.locator('.story-work').count(), 2);
  assert.equal(await page.locator('.panel-heading .aigc-label').count(), 2);
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'local-forum-admin', username: 'review', role: 'admin', email: null } } }));
  await page.goto(`${base}/#formal/${snapshot.prompt.id}`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.phase-voting');
  assert.equal(await page.locator('.forum-arena').count(), 0);
  assert.equal(await page.locator('.story-work').count(), 2);
  assert.equal(await page.locator('.panel-heading .aigc-label').count(), 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  const report = { originalAnswers: snapshot.works.length, layouts, entryFrames: motion.length, swapFrames, routeFrames: routeMotion.length,
    brandModels: Object.keys(presentation.models).length, anonymousAndRevealVerified: true, failedLogoFallbackVerified: true,
    curtainSyncVerified: true, revealStyleStable: true, returnToLibrary: true, otherSkinsUnchanged: true, timingsMs: timings, errors, writes };
  await writeFile(`${out}/checks.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
