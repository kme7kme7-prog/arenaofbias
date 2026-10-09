import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { channelGroups, textPresentation } from '../lib/text-presentations.ts';

const snapshot = JSON.parse(await readFile('.local/text-themes-review/snapshot.json', 'utf8'));
const valid = snapshot.works.filter(w => ['id', 'promptId', 'modelId', 'modelName', 'title', 'content'].every(k => typeof w[k] === 'string' && w[k]));
const scenes = [
  ['forest', '013'], ['letter', 'q-1b9d4f59c2d7b31e'], ['channels', 'q-200d4b7f9c69b79c'],
  ['blackout', 'q-b23ef619e82dec65'], ['waiting', 'q-bfea3f9d2135205c'], ['reading', 'q-1b9d4f59c2d7b31e'],
];
const base = 'http://127.0.0.1:5444', out = 'output/text-themes-review';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], writes = [], layouts = [], timings = [], checked = new Set();
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (/\/api\//.test(r.url()) && r.method() !== 'GET' && !r.url().endsWith('/api/track')) writes.push(r.url()); });
await page.addInitScript(() => {
  if (window !== window.top) return;
  localStorage.setItem('aob-theme', 'paper');
  if (window.name.startsWith('text-review-pair:')) {
    const mark = JSON.parse(window.name.slice('text-review-pair:'.length));
    localStorage.setItem('aob-test-pair', JSON.stringify({ ...mark, at: Date.now() }));
    window.name = '';
  }
});
await page.addInitScript(() => {
  if (window !== window.top) return;
  window.__recordText = (theme) => {
    const generation = window.__textRecordingGeneration = (window.__textRecordingGeneration ?? 0) + 1;
    window.__textMotion = []; window.__motionDone = false;
    let started, playing;
    const sample = now => {
      if (generation !== window.__textRecordingGeneration) return;
      const shell = document.querySelector(`.text-arena${theme ? `[data-text-theme="${theme}"]` : ''}.works-reveal:not(.phase-transition)`);
      if (shell) {
        started ??= now;
        const phase = document.querySelector('.game-transition')?.dataset.gtPhase;
        if (phase !== 'entry') playing ??= now;
        window.__textMotion.push({ phase, layers: [...shell.querySelectorAll('.text-masthead,.contender,.text-originals')].map(el => {
          const s = getComputedStyle(el), m = new DOMMatrixReadOnly(s.transform);
          const paper = el.classList.contains('contender') && ['forest','blackout','letter','waiting'].includes(shell.dataset.textTheme);
          return { y: m.m42, x: m.m41, sx: m.a, sy: m.d, paper, unitX: Math.hypot(m.m11,m.m12,m.m13), unitY: Math.hypot(m.m21,m.m22,m.m23), unitZ: Math.hypot(m.m31,m.m32,m.m33), opacity: +s.opacity, state: s.animationPlayState };
        }) });
      }
      if (!started || (!playing || now - playing < 1100) && now - started < 6000) requestAnimationFrame(sample);
      else window.__motionDone = true;
    };
    requestAnimationFrame(sample);
  };
  window.__recordText();
});
async function ready() {
  await page.waitForSelector('.phase-voting');
  await page.waitForFunction(() => !document.querySelector('.game-transition'));
}
function original(work) {
  const story = JSON.parse(work.content).story;
  return [story.heading, ...story.paragraphs, story.ending].filter(p => p !== undefined);
}
async function originals() {
  const replies = await page.locator('.text-reading:not(.text-reading-embedded)').evaluateAll(els => els.map(el => ({ id: el.dataset.workId, paragraphs: [...el.querySelectorAll('.text-original')].map(p => p.textContent) })));
  for (const reply of replies) {
    assert.deepEqual(reply.paragraphs, original(valid.find(w => w.id === reply.id)));
    checked.add(reply.id);
  }
}
async function force(work, query = '') {
  const other = valid.find(w => w.promptId === work.promptId && w.modelId !== work.modelId && JSON.parse(w.content).kind === 'text');
  const url = `${base}/${query}#arena/${work.promptId}`;
  if (page.url() !== url) await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(mark => window.name = `text-review-pair:${JSON.stringify(mark)}`, { promptId: work.promptId, a: work.id, b: other.id });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  assert.equal(await page.locator(`.text-reading[data-work-id="${work.id}"]`).count(), 1, `forced work ${work.id} in ${work.promptId}`);
}
function motionCheck(frames) {
  assert.ok(frames.length > 8);
  assert.ok(frames.some(f => f.layers.some(l => l.y > 1 && l.opacity > 0 && l.opacity < 1)));
  assert.ok(frames.every(f => f.layers.every(l => (l.paper ? [l.unitX,l.unitY,l.unitZ].every(v => Math.abs(v-1)<.025) : l.sx === 1 && l.sy === 1) && l.y >= -.01)), 'paper may rotate in 3D; type and paper must never scale or bounce');
  assert.ok(frames.filter(f => f.phase === 'entry').every(f => f.layers.every(l => l.state === 'paused')));
  assert.ok(frames.at(-1).layers.every(l => Math.abs(l.y) < .01 && Math.abs(l.x) < .01 && l.opacity === 1));
  for (let i = 1; i < frames.length; i++) if (frames[i].layers.length === frames[i - 1].layers.length)
    assert.ok(frames[i].layers.every((l, n) => l.y <= frames[i - 1].layers[n].y + .01), 'no bounce or late reset');
}
try {
  for (const work of snapshot.works) assert.equal(createHash('sha256').update(work.content).digest('hex'), snapshot.hashes[work.id]);
  for (const file of Object.values(snapshot.htmlFiles)) assert.equal(createHash('sha256').update(await readFile(`.local/text-themes-review/html/${file.file}`)).digest('hex'), file.sha256);
  for (const work of valid.filter(w => w.promptId === scenes[2][1])) assert.deepEqual(channelGroups(original(work)).flatMap(g => g.paragraphs), original(work));
  assert.equal(textPresentation({ id: 'q-new-future-topic' }).id, 'reading');
  await page.goto(base);
  if (!process.argv.includes('--all-originals')) {
    for (const [scene, id] of scenes.filter(([scene]) => !process.argv.includes('--reading-only') || scene === 'reading')) {
      const work = valid.find(w => w.promptId === id && JSON.parse(w.content).kind === 'text');
      await force(work, scene === 'reading' ? '?presentation=reading' : '');
      assert.equal(await page.locator('.arena-shell').getAttribute('data-text-theme'), scene);
      await originals();
      await page.waitForFunction(() => window.__motionDone);
      motionCheck(await page.evaluate(() => window.__textMotion));
      for (const theme of ['paper', 'ink']) for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        await page.waitForTimeout(250);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${scene} ${theme} ${width} horizontal overflow`);
        const bounds = await page.locator('.text-reading').evaluateAll(els => els.map(el => ({ w: el.clientWidth, scroll: el.scrollWidth, h: el.clientHeight })));
        assert.ok(bounds.every(b => b.scroll <= b.w + 1 && b.h > 150));
        await page.screenshot({ path: `${out}/${scene}-${theme}-${width}.png`, fullPage: true });
        layouts.push({ scene, theme, width, noOverflow: true });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.evaluate(() => document.documentElement.dataset.theme = 'paper');
      await page.locator('.vote-a').click();
      await page.waitForSelector('.phase-result');
      assert.ok((await page.locator('.panel-heading').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor))).every(color => color === 'rgba(0, 0, 0, 0)'), 'revealed identity keeps the scene paper');
      await originals();
      assert.ok((await page.locator('.model-identity').allTextContents()).every(name => !name.includes('匿名稿')));
      await page.screenshot({ path: `${out}/${scene}-result.png`, fullPage: true });
      const now = Date.now();
      await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
      await page.waitForSelector('.phase-transition');
      await page.evaluate(() => window.__recordText());
      await ready();
      timings.push({ scene, ms: Date.now() - now });
      await page.waitForFunction(() => window.__motionDone);
      motionCheck(await page.evaluate(() => window.__textMotion));
      const geometry = () => page.locator('.contender').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
      const before = await geometry();
      await page.waitForTimeout(250);
      assert.deepEqual(await geometry(), before, 'final geometry stable');
      console.log(`${scene}: paper/ink, desktop/mobile, originals, reveal, continue and motion OK`);
    }
    await page.locator('.vote-b').click(); await page.waitForSelector('.phase-result');
    await page.getByRole('button', { name: '同一题库继续', exact: true }).click(); await ready();
    await page.locator('.vote-draw').click(); await page.waitForSelector('.phase-result');
    await page.getByRole('button', { name: '重播入场', exact: true }).click(); await ready();
    await page.goto(`${base}/#arena/${scenes[1][1]}`); await ready();
    await page.evaluate(() => { window.__originalRandom = Math.random; Math.random = () => .8; window.__recordText('blackout'); });
    await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
    await page.waitForURL(`**/#arena/${scenes[3][1]}`); await ready();
    await page.waitForFunction(() => window.__motionDone);
    const routeFrames = await page.evaluate(() => window.__textMotion);
    await writeFile(`${out}/route-motion.json`, JSON.stringify(routeFrames));
    motionCheck(routeFrames);
    assert.ok(routeFrames.some(f => f.phase === 'entry'), 'covered route holds the scene');
    assert.ok(routeFrames.some(f => f.phase === 'exit' && f.layers.some(l => l.y > .1)), 'scene moves during curtain exit');
    await page.evaluate(() => Math.random = window.__originalRandom);
    for (const [id, selector] of [['008', '.wechat-arena'], ['q-5ebd7c84dff7cd8f', '.orange-arena'], ['q-a71a7e7e4bcaadc7', '.forum-arena']]) {
      await page.goto(`${base}/#arena/${id}`); await ready();
      assert.equal(await page.locator(selector).count(), 1);
      assert.equal(await page.locator('.text-arena').count(), 0);
    }
    await page.goto(`${base}/?presentation=classic#arena/${scenes[1][1]}`); await ready();
    assert.equal(await page.locator('.text-arena').count(), 0);
    assert.equal(await page.locator('.story-work').count(), 2);
    // A genuinely unregistered topic takes the default automatically, without a query override.
    const future = { ...snapshot.prompts.find(p => p.id === scenes[1][1]), id: 'q-aaaaaaaaaaaaaaaa', name: '通用界面回归样本' };
    const futureWorks = valid.filter(w => w.promptId === scenes[1][1]).slice(0, 10).map((w, i) => ({ ...w, id: `future-sample-${i}`, promptId: future.id }));
    futureWorks[0].content = JSON.stringify({ kind: 'text', story: { heading: '短回答', paragraphs: ['<script>这是一段需要按原文显示的测试文本</script>'], ending: '结束。' } });
    const longParagraph = original(valid.find(w => w.promptId === scenes[1][1]))[0];
    futureWorks[1].content = JSON.stringify({ kind: 'text', story: { heading: '长回答', paragraphs: Array(30).fill(longParagraph), ending: '长文结束。' } });
    await page.route('**/api/prompts', r => r.fulfill({ json: { prompts: [...snapshot.prompts, future] } }));
    await page.route('**/api/works', r => r.fulfill({ json: { works: [...snapshot.works, ...futureWorks] } }));
    await page.goto(`${base}/#arena/${future.id}`);
    await page.evaluate(mark => window.name = `text-review-pair:${JSON.stringify(mark)}`, { promptId: future.id, a: futureWorks[0].id, b: futureWorks[1].id });
    await page.reload(); await ready();
    assert.equal(await page.locator('.arena-shell').getAttribute('data-text-theme'), 'reading');
    for (const work of futureWorks.slice(0, 2)) {
      assert.deepEqual(await page.locator(`.text-reading[data-work-id="${work.id}"] .text-original`).allTextContents(), original(work));
    }
    assert.equal(await page.locator('.text-original script').count(), 0);
    const long = page.locator(`.text-reading[data-work-id="${futureWorks[1].id}"]`);
    assert.ok(await long.evaluate(el => el.scrollHeight > el.clientHeight));
    await long.evaluate(el => el.scrollTop = el.scrollHeight);
    assert.ok(await long.evaluate(el => Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 2));
    await page.unroute('**/api/works');
    await page.route('**/api/works', r => r.fulfill({ json: { works: [...snapshot.works, ...futureWorks.slice(0, 9)] } }));
    await page.reload();
    await page.getByText('暂未开放娱乐盲测，至少需要 10 件作品。', { exact: true }).waitFor();
    assert.equal(await page.locator('.text-arena').count(), 0, 'nine works remain outside the entertainment pool');
    await page.route('**/api/auth/me', r => r.fulfill({ json: { user: { id: 'local-theme-admin', username: 'review', role: 'admin', email: null } } }));
    await page.goto(`${base}/#formal/${scenes[1][1]}`); await page.reload(); await ready();
    assert.equal(await page.locator('.text-arena').count(), 0);
    assert.equal(await page.locator('.story-work').count(), 2);
  } else {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const work of valid.filter(w => scenes.some(([, id]) => id === w.promptId))) {
      await force(work);
      await originals();
      if (JSON.parse(work.content).kind === 'html') {
        const frame = page.locator(`.text-reading[data-work-id="${work.id}"] iframe`);
        assert.ok(await frame.isVisible());
        assert.ok((await frame.contentFrame().locator('body').innerText()).length > 100);
        checked.add(work.id);
      }
    }
    assert.equal(checked.size, valid.filter(w => scenes.some(([, id]) => id === w.promptId)).length);
  }
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  const report = { layouts, timings, originalWorks: checked.size, ignoredInvalidRosterRows: snapshot.works.filter(w => !valid.includes(w)).map(w => w.id), errors, writes };
  await writeFile(`${out}/${process.argv.includes('--all-originals') ? 'originals' : process.argv.includes('--reading-only') ? 'reading-checks' : 'checks'}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
