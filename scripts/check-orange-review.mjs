import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:5442';
const snapshot = JSON.parse(await readFile('.local/orange-review/snapshot.json', 'utf8'));
const destination = `${base}/#arena/${snapshot.prompt.id}`;
const out = path.resolve('output/orange-review');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const votes = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/\/api\/(votes|reactions|comments)/.test(request.url()) && request.method() !== 'GET') votes.push(request.url()); });
await page.addInitScript(() => {
  localStorage.setItem('aob-theme', 'paper');
  window.__orangeFrames = [];
  window.__orangeLongTasks = [];
  let previous = performance.now();
  function frame(now) { window.__orangeFrames.push(now - previous); previous = now; requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  new PerformanceObserver(list => { window.__orangeLongTasks.push(...list.getEntries().map(entry => entry.duration)); }).observe({ type: 'longtask', buffered: true });
});
const timings = [];
const ready = () => page.waitForSelector('.phase-voting', { timeout: 10000 });
async function clean() {
  assert.equal(await page.locator('.orange-pitch').count(), 2);
  assert.equal(await page.locator('.orange-sign-rig').count(), 2);
  assert.equal(await page.locator('iframe').count(), 0);
  assert.equal(await page.locator('.game-transition').count(), 0);
  assert.equal(await page.locator('.vote-a').isEnabled(), true);
  assert.equal(await page.locator('.vote-b').isEnabled(), true);
}
try {
  await page.goto(destination, { waitUntil: 'domcontentloaded' });
  await ready();
  await clean();
  await page.waitForTimeout(650);
  const stableSigns = await page.locator('.orange-signboards .contender').evaluateAll(signs => signs.map(sign => ({
    transform: getComputedStyle(sign).transform,
    activeAnimations: sign.getAnimations().filter(animation => animation.playState === 'running').length,
  })));
  assert.ok(stableSigns.every(sign => ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(sign.transform) && sign.activeAnimations === 0), JSON.stringify(stableSigns));
  assert.equal(await page.locator('.work-arrival-veil').first().evaluate(el => getComputedStyle(el).display), 'none', 'the sign must not reveal its copy a second time');
  const stableGeometry = await page.locator('.orange-signboards .contender').evaluateAll(signs => signs.map(sign => ({ x: sign.getBoundingClientRect().x, width: sign.getBoundingClientRect().width, height: sign.getBoundingClientRect().height })));
  await page.waitForTimeout(500);
  assert.deepEqual(await page.locator('.orange-signboards .contender').evaluateAll(signs => signs.map(sign => ({ x: sign.getBoundingClientRect().x, width: sign.getBoundingClientRect().width, height: sign.getBoundingClientRect().height }))), stableGeometry);
  // Assert the source words survive the new layout, independent of selected side.
  const copies = await page.locator('.orange-pitch').evaluateAll(elements => elements.map(el => ({ id: el.dataset.workId, lines: [...el.querySelectorAll('.orange-line-text')].map(p => p.textContent) })));
  for (const copy of copies) {
    const original = snapshot.works.find(work => work.id === copy.id);
    assert.deepEqual(copy.lines, JSON.parse(original.content).story.paragraphs.map(line => line.replace(/^[1-3][.、．]\s*/, '')));
  }
  await page.screenshot({ path: path.join(out, 'desktop-paper.png') });
  for (const side of ['a', 'b', 'draw']) {
    await page.locator(side === 'draw' ? '.vote-draw' : `.vote-${side}`).click();
    await page.waitForSelector('.phase-result');
    assert.equal(await page.locator('.orange-product').getAttribute('data-choice'), side);
    assert.ok((await page.locator('.model-identity').allTextContents()).every(name => !name.includes('匿名')));
    assert.match(await page.locator('.vote-note').innerText(), /票未计入/);
    assert.equal(await page.locator('.audience-verdict').count(), 0);
    assert.equal(await page.locator('.orange-sale-stamp.is-stamped').count(), side === 'draw' ? 0 : 1);
    assert.equal(await page.locator('.panel-heading').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    if (side === 'a') await page.screenshot({ path: path.join(out, 'result.png') });
    const start = performance.now();
    await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
    await ready();
    timings.push(performance.now() - start);
    await clean();
  }
  for (let run = 0; run < 10; run++) {
    const start = performance.now();
    await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
    await ready();
    timings.push(performance.now() - start);
    await clean();
  }
  await page.getByRole('button', { name: '重播入场', exact: true }).click();
  await ready();
  await clean();
  // Same route controller, but a different topic and a different layout.
  await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
  await page.waitForURL('**/#arena/008');
  await ready();
  assert.equal(await page.locator('.orange-arena').count(), 0);
  await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
  await page.waitForURL(`**/#arena/${snapshot.prompt.id}`);
  await ready();
  await page.waitForFunction(() => !document.querySelector('.game-transition'));
  await clean();
  const perf = await page.evaluate(() => ({ frames: window.__orangeFrames, longTasks: window.__orangeLongTasks }));
  const layouts = [];
  for (const theme of ['paper', 'ink']) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(1100);
      const bounds = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth,
        lines: [...document.querySelectorAll('.orange-line-text')].map(el => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, height: r.height }; }) }));
      assert.ok(bounds.lines.every(r => r.x >= 0 && r.right <= width + 1), JSON.stringify(bounds));
      assert.ok(bounds.scroll <= width + 1, JSON.stringify(bounds));
      if (width === 390) {
        const signs = await page.locator('.orange-signboards .contender').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { width: r.width, top: r.top, bottom: r.bottom }; }));
        assert.ok(signs.every(sign => sign.width > 300) && signs[1].top >= signs[0].bottom, 'mobile signs must remain readable and not overlap');
      }
      const colors = await page.evaluate(() => ({ button: getComputedStyle(document.querySelector('.vote-a strong')).color, text: getComputedStyle(document.querySelector('.arena-stage')).color }));
      assert.equal(colors.button, colors.text, `${theme} outlined button text must remain legible`);
      assert.ok(await page.locator('.vote-a').isEnabled());
      layouts.push({ theme, width, ...bounds });
      await page.screenshot({ path: path.join(out, `${theme}-${width}.png`), fullPage: false });
    }
  }
  // Reduced-motion mounting checks every downloaded answer, including the longest one.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const work of snapshot.works) {
    const other = snapshot.works.find(item => item.modelId !== work.modelId);
    await page.evaluate(mark => localStorage.setItem('aob-test-pair', JSON.stringify(mark)), { promptId: snapshot.prompt.id, a: work.id, b: other.id, at: Date.now() });
    await page.reload();
    await ready();
    const rendered = await page.locator(`.orange-pitch[data-work-id="${work.id}"] .orange-line-text`).allTextContents();
    assert.deepEqual(rendered, JSON.parse(work.content).story.paragraphs.map(line => line.replace(/^[1-3][.、．]\s*/, '')));
  }
  // Formal keeps its regular presentation and anonymous identities even in this review server.
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'local-review-admin', username: 'review', role: 'admin', email: null } } }));
  await page.goto(`${base}/#formal/${snapshot.prompt.id}`);
  await page.reload();
  await ready();
  assert.equal(await page.locator('.orange-arena').count(), 0);
  assert.equal(await page.locator('.story-work').count(), 2);
  await page.locator('.vote-a').click();
  await page.waitForSelector('.phase-result');
  assert.ok((await page.locator('.model-identity').allTextContents()).every(name => name === '未知模型'));
  await page.goto(`${base}/?presentation=counter#arena/${snapshot.prompt.id}`);
  await ready();
  assert.equal(await page.locator('.orange-arena').count(), 1);
  assert.equal(await page.locator('.orange-sign-rig').count(), 0);
  assert.deepEqual(votes, []);
  assert.deepEqual(errors, []);
  const report = { downloaded: snapshot.works.length, allAnswersVerified: true, continuations: timings.length, timingsMs: timings.map(Math.round),
    meanContinuationMs: Math.round(timings.reduce((a, b) => a + b, 0) / timings.length),
    frameP95Ms: [...perf.frames].sort((a, b) => a - b)[Math.floor(perf.frames.length * .95)],
    longTasksMs: perf.longTasks.map(Math.round), layouts, votes, errors };
  await writeFile(path.join(out, 'checks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
