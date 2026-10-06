import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:5442';
const works = JSON.parse(await readFile('.local/orange-review/comparison-works.json', 'utf8'));
const prompt = JSON.parse(await readFile('.local/orange-review/comparison-prompts.json', 'utf8'))[0];
const out = 'output/night-chat-review';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], writes = [], timings = [], rejectedTracking = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/\/api\//.test(request.url()) && request.method() !== 'GET' && !request.url().endsWith('/api/track')) writes.push(request.url()); });
page.on('response', response => { if (response.request().method() !== 'GET' && response.url().endsWith('/api/track')) rejectedTracking.push(response.status()); });
await page.addInitScript(() => localStorage.setItem('aob-theme', 'paper'));
await page.addInitScript(() => {
  window.__startChatMotion = (selector = '.wechat-arena.works-reveal') => {
  window.__chatMotion = [];
  let started = null;
  function sample(now) {
    const shell = document.querySelector('.wechat-arena.works-reveal');
    if (shell) {
      started ??= now;
      window.__chatMotion.push([...shell.querySelectorAll('.contender')].map(el => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        const panel = el.querySelector('.work-panel');
        const curtain = document.querySelector('.game-transition');
        return { y: matrix.m42, x: matrix.m41, scaleX: matrix.a, scaleY: matrix.d, panelAnimation: getComputedStyle(panel).animationName,
          curtainPhase: curtain?.dataset.gtPhase ?? null, playState: getComputedStyle(el).animationPlayState,
          time: Math.round(now - started), messages: [...el.querySelectorAll('.chat-replies > .chat-message')].map(message => {
            const style = getComputedStyle(message);
            return { opacity: Number(style.opacity), y: new DOMMatrixReadOnly(style.transform).m42,
              delay: parseFloat(style.animationDelay) * 1000, duration: parseFloat(style.animationDuration) * 1000, state: style.animationPlayState };
          }) };
      }));
    }
    if (started !== null && now - started < 2400) requestAnimationFrame(sample);
  }
  const observer = new MutationObserver(() => {
    if (!document.querySelector(selector)) return;
    observer.disconnect();
    requestAnimationFrame(sample);
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  };
  window.__startChatMotion();
});
const ready = async () => {
  await page.waitForSelector('.phase-voting');
  await page.waitForFunction(() => !document.querySelector('.game-transition'));
};
function checkMessages(motion) {
  for (let side = 0; side < 2; side++) {
    const frames = motion.map(pair => pair[side]);
    const first = frames[0].messages;
    assert.ok(first.length > 0 && first.every(message => message.opacity === 0), 'messages start hidden in their reserved positions');
    assert.ok(first.at(-1).delay + first.at(-1).duration <= 731, 'even long replies finish within the short entry beat');
    assert.ok(frames.some(frame => frame.messages.length === 1 || frame.messages.some((message, index) => index > 0 && message.opacity < frame.messages[index - 1].opacity)), 'messages actually appear in sequence');
    assert.ok(frames.every(frame => frame.messages.every((message, index) => index === 0 || message.opacity <= frame.messages[index - 1].opacity + .001)), 'reading order is preserved throughout entry');
    assert.ok(frames.at(-1).messages.every(message => message.opacity === 1 && Math.abs(message.y) < .01), 'every original message is visible at rest');
  }
}
async function sourceCheck() {
  const shown = await page.locator('.wechat-thread').evaluateAll(elements => elements.map(el => ({ id: el.dataset.workId, paragraphs: [...el.querySelectorAll('.chat-response')].map(p => p.textContent) })));
  assert.equal(shown.length, 2);
  for (const answer of shown) {
    const story = JSON.parse(works.find(work => work.id === answer.id).content).story;
    assert.deepEqual(answer.paragraphs, [story.heading, ...story.paragraphs, story.ending].filter(text => text !== undefined));
  }
  const questions = await page.locator('.chat-question').allTextContents();
  assert.equal(questions.length, 2);
  assert.ok(questions.every(text => prompt.prompt.includes(text) && text.endsWith('？')));
  assert.equal(await page.locator('iframe').count(), 0);
}
async function next() {
  const start = performance.now();
  await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
  await page.waitForSelector('.phase-transition');
  await ready();
  timings.push(Math.round(performance.now() - start));
  assert.ok(await page.locator('.vote-a').isEnabled());
  assert.ok((await page.locator('.wechat-thread').evaluateAll(elements => elements.map(el => el.scrollTop))).every(top => top === 0));
  await sourceCheck();
}
try {
  await page.goto(`${base}/#arena/008`, { waitUntil: 'domcontentloaded' });
  await ready();
  await sourceCheck();
  assert.deepEqual(await page.locator('.model-identity').allTextContents(), ['联系人 A', '联系人 B']);
  await page.waitForTimeout(1800);
  assert.equal(await page.locator('.chat-backdrop-review').count(), 0, 'selected background has no review toolbar');
  const settled = async () => page.locator('.contender').evaluateAll(elements => elements.map(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, transform: getComputedStyle(el).transform };
  }));
  const geometryAtRest = await settled();
  await page.waitForTimeout(350);
  assert.deepEqual(await settled(), geometryAtRest, 'chat windows do not resize after entry completes');
  const motion = await page.evaluate(() => window.__chatMotion);
  checkMessages(motion);
  assert.ok(motion.length >= 8, `entry sampled ${motion.length} frames`);
  for (let side = 0; side < 2; side++) {
    const frames = motion.map(pair => pair[side]);
    assert.ok(frames.some(frame => frame.y > .2), 'entry is visible motion');
    assert.ok(frames.every((frame, index) => frame.scaleX === 1 && frame.scaleY === 1 && frame.panelAnimation === 'none' && frame.y >= -.01 && (index === 0 || frame.y <= frames[index - 1].y + .01)), 'entry has no scaling, overshoot or nested panel animation');
    assert.ok(Math.abs(frames.at(-1).y) < .01, 'entry ends at the final position');
    assert.ok(frames.filter(frame => frame.curtainPhase === 'entry').every(frame => frame.playState === 'paused'), 'held route curtain does not consume chat entry');
  }
  await page.screenshot({ path: `${out}/desktop-paper.png` });
  const layouts = [];
  for (const theme of ['paper', 'ink']) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.waitForTimeout(550);
      const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        bubbles: [...document.querySelectorAll('.chat-bubble')].map(el => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right }; }) }));
      assert.ok(geometry.scroll <= width + 1 && geometry.bubbles.every(r => r.x >= 0 && r.right <= width + 1), JSON.stringify(geometry));
      assert.equal(await page.locator('.vote-a').evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)');
      const scrollable = await page.locator('.wechat-thread').first().evaluate(el => { el.scrollTop = el.scrollHeight; return { at: el.scrollTop, max: Math.max(0, el.scrollHeight - el.clientHeight) }; });
      assert.ok(Math.abs(scrollable.at - scrollable.max) <= 2, `every response remains reachable at CSS zoom 80%: ${JSON.stringify(scrollable)}`);
      await page.locator('.wechat-thread').evaluateAll(elements => elements.forEach(el => el.scrollTop = 0));
      layouts.push({ theme, width, noOverflow: true, scrollable });
      await page.screenshot({ path: `${out}/${theme}-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.documentElement.dataset.theme = 'paper');
  let swapMotion = [];
  for (const side of ['a', 'b', 'draw']) {
    await page.locator(side === 'draw' ? '.vote-draw' : `.vote-${side}`).click();
    await page.waitForSelector('.phase-result');
    assert.ok((await page.locator('.model-identity').allTextContents()).every(name => !name.startsWith('联系人')));
    assert.match(await page.locator('.vote-note').innerText(), /票未计入/);
    await sourceCheck();
    if (side === 'a') await page.screenshot({ path: `${out}/result.png` });
    assert.equal(await page.locator('.panel-heading').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(249, 250, 247)');
    if (side === 'a') await page.evaluate(() => window.__startChatMotion('.wechat-arena.shutter-exit.works-reveal'));
    await next();
    if (side === 'a') {
      await page.waitForTimeout(2100);
      swapMotion = await page.evaluate(() => window.__chatMotion);
      checkMessages(swapMotion);
      assert.ok(swapMotion.length >= 8 && swapMotion[0].every(frame => frame.y > 1), 'same-topic swap restarts entry under the shutter');
      for (let index = 0; index < swapMotion.length; index++) {
        assert.ok(swapMotion[index].every((frame, side) => frame.scaleX === 1 && frame.scaleY === 1 && frame.y >= -.01 && (index === 0 || frame.y <= swapMotion[index - 1][side].y + .01)), 'swap entry is monotonic at unit scale');
      }
      assert.ok(swapMotion.at(-1).every(frame => Math.abs(frame.y) < .01), 'swap lands without a final adjustment');
    }
  }
  for (let run = 0; run < 5; run++) await next();
  await page.locator('.wechat-thread').evaluateAll(elements => elements.forEach(el => el.scrollTop = el.scrollHeight));
  await page.getByRole('button', { name: '重播入场', exact: true }).click();
  await page.waitForSelector('.phase-intro');
  await ready();
  assert.ok((await page.locator('.wechat-thread').evaluateAll(elements => elements.map(el => el.scrollTop))).every(top => top === 0));
  await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
  await page.waitForURL('**/#arena/q-5ebd7c84dff7cd8f');
  await ready();
  assert.equal(await page.locator('.orange-sign-rig').count(), 2);
  assert.equal(await page.locator('.wechat-thread').count(), 0);
  await page.evaluate(() => window.__startChatMotion());
  await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
  await page.waitForURL('**/#arena/008');
  await ready();
  await sourceCheck();
  await page.waitForTimeout(1800);
  const routeMotion = await page.evaluate(() => window.__chatMotion);
  checkMessages(routeMotion);
  assert.ok(routeMotion.flat().some(frame => frame.curtainPhase === 'entry'), 'cross-topic entry sampled under the real route curtain');
  assert.ok(routeMotion.flat().filter(frame => frame.curtainPhase === 'entry').every(frame => frame.playState === 'paused'), 'entry remains prepared while the route curtain is held');
  assert.ok(routeMotion.flat().some(frame => frame.curtainPhase === 'exit' && frame.y > 1), 'chat moves during the real route curtain exit');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const work of works) {
    const other = works.find(candidate => candidate.modelId !== work.modelId);
    await page.evaluate(mark => localStorage.setItem('aob-test-pair', JSON.stringify(mark)), { promptId: '008', a: work.id, b: other.id, at: Date.now() });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready();
    assert.equal(await page.locator(`.wechat-thread[data-work-id="${work.id}"]`).count(), 1, `requested answer ${work.id} is actually rendered`);
    await sourceCheck();
  }
  assert.ok((await page.locator('.contender').evaluateAll(elements => elements.flatMap(el => el.getAnimations().filter(animation => animation.playState === 'running')))).length === 0);
  assert.ok(await page.locator('.chat-replies > .chat-message').evaluateAll(elements => elements.every(el => getComputedStyle(el).opacity === '1' && el.getAnimations().length === 0)), 'reduced motion shows all messages immediately');
  await page.goto(`${base}/?presentation=classic#arena/008`, { waitUntil: 'domcontentloaded' });
  await ready();
  assert.equal(await page.locator('.wechat-thread').count(), 0);
  assert.equal(await page.locator('.conversation-reply').count(), 2);
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'local-review-admin', username: 'review', role: 'admin', email: null } } }));
  await page.goto(`${base}/#formal/008`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  assert.equal(await page.locator('.wechat-arena').count(), 0);
  assert.equal(await page.locator('.story-work').count(), 2);
  assert.deepEqual(await page.locator('.model-identity').allTextContents(), ['未知模型', '未知模型']);
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  assert.ok(rejectedTracking.length > 0 && rejectedTracking.every(status => status === 403), 'review telemetry is rejected locally');
  const report = { allAnswersVerified: works.length, continuations: timings.length, timingsMs: timings,
    meanContinuationMs: Math.round(timings.reduce((sum, value) => sum + value, 0) / timings.length), entryFrames: motion.length,
    routeEntryFrames: routeMotion.length, swapEntryFrames: swapMotion.length, curtainSyncVerified: true, layouts, errors, writes, rejectedTrackingRequests: rejectedTracking.length };
  await writeFile(`${out}/checks.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
