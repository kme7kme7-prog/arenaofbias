// Built-page regression with isolated APIs; no production session or writes.
// Prepare npm run build, then AOB_CHROMIUM=/absolute/chromium node scripts/validate-on-demand-reads.mjs.
// --baseline reads the saved unmodified .local/round4-baseline-dist.
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';

const baseline = process.argv.includes('--baseline');
const out = `.local/round4-${baseline ? 'baseline' : 'candidate'}-browser`;
await mkdir(out, { recursive: true });
const member = { id: 'member-a', username: 'Member A', role: null, email: 'a@example.test' };
const models = [{ id: 'test-model', name: 'Test Model', vendor: 'Fixture', released: '2026-10', openWeights: false, contextK: 128,
  modalities: ['text'], reasoning: true, priceOut: 1, priceTier: 1, difficulty: 1, dailyEligible: true }];
const prompt = { id: '001', kind: 'text', name: '隔离验证命题', prompt: '阅读两件作品。', category: '文字', code: 'TEST', commentary: '', detail: '' };
const works = Array.from({ length: 10 }, (_, i) => ({ id: `test-${i}`, promptId: '001', modelId: `test-model-${i}`, modelName: `Fixture ${i}`,
  title: `Fixture ${i}`, isDemo: 0, content: JSON.stringify({ kind: 'text', story: { paragraphs: ['隔离验证正文。'] } }) }));
const room = (version = 1) => ({ code: 'ABCDEFGH', version, catalogVersion: 'fixture-v1', self: 0, difficulty: 1, status: 'playing', round: 1,
  roundEndsAt: Date.now() + 120000, nextAt: null, serverNow: Date.now(), expiresAt: Date.now() + 3600000,
  players: [{ seat: 0, name: 'Member A', ready: true, score: 0, connected: true, reconnectUntil: 0, left: false, guesses: [] },
    { seat: 1, name: 'Member B', ready: true, score: 0, connected: true, reconnectUntil: 0, left: false, guesses: [] }],
  rules: { attempts: 8, roundMs: 120000, graceMs: 30000, wins: 2, intermissionMs: 5000 }, result: null, answer: null });
let fixture;
const app = express(); app.use(express.json());
app.use('/api', (req, res) => {
  const owner = fixture, path = req.path, query = req.query;
  res.setHeader('Access-Control-Allow-Origin', owner.origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  owner.calls.push({ path, query, method: req.method, user: owner.user?.id ?? null, ...(req.method === 'POST' ? { body: req.body } : {}) });
  res.on('close', () => { if (!res.writableEnded) owner.aborted.push(path); });
  const mode = owner.modes[path];
  if (mode === 'headers' || mode === 'body') {
    owner.held.push({ path, res });
    if (mode === 'body') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); }
    return;
  }
  if (mode === 'error') return res.status(500).json({ error: 'fixture unavailable' });
  if (mode === 'invalid') return res.json({ unexpected: true });
  if (path.endsWith('/events')) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(`event: room\ndata: ${JSON.stringify(owner.room)}\n\n`);
    owner.events.push(res); return;
  }
  const data = path === '/auth/me' ? { user: owner.user }
    : path === '/guess/friends/current' || path.endsWith('/state') ? { room: owner.room }
    : path === '/guess/friends/catalog' ? { models, catalogVersion: owner.room?.catalogVersion }
    : path === '/guess/today' ? { models, attributes: [], dayKey: '2026-10-23', dayNumber: 53, catalogVersion: 'fixture-v1' }
    : path === '/prompts' ? { prompts: [prompt] }
    : path === '/works' ? { works }
    : path === '/ratings' ? { ratings: {}, games: {} }
    : path === '/reactions' ? { counts: Object.fromEntries(works.map(w => [w.modelId, { up: 3, down: 0, laugh: 0 }])), mine: owner.user?.id === 'member-a' ? Object.fromEntries(works.map(w => [w.modelId, 'up'])) : {} }
    : {};
  owner.bytes[path] = (owner.bytes[path] ?? 0) + Buffer.byteLength(JSON.stringify(data));
  res.json(data);
});
app.use(express.static(baseline ? '.local/round4-baseline-dist' : 'dist'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', `${out}/test-key.pem`, '-out', `${out}/test-cert.pem`, '-days', '1', '-nodes', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const server = await new Promise(resolve => { const s = createServer({ key: readFileSync(`${out}/test-key.pem`), cert: readFileSync(`${out}/test-cert.pem`) }, app).listen(0, '127.0.0.1', () => resolve(s)); });
const origin = `https://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.AOB_CHROMIUM ? { executablePath: process.env.AOB_CHROMIUM } : { channel: 'msedge' }) });
const checks = [], records = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 120));
async function waitFor(check) {
  for (let n = 0; n < 50; n++) { if (check()) return; await tick(); }
  assert(check(), 'expected fixture request did not arrive');
}
async function setup(options = {}, width = 390) {
  const owned = fixture = { origin, user: member, room: null, calls: [], aborted: [], held: [], events: [], bytes: {}, modes: {}, ...options };
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.route('https://api.arenaofbias.icu/**', route => { const u = new URL(route.request().url()); return route.continue({ url: origin + u.pathname + u.search }); });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const close = async name => {
    await page.screenshot({ path: `${out}/${name}-${width}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    records.push({ name, width, calls: owned.calls, aborted: owned.aborted, bytes: owned.bytes, errors, overflow });
    await context.close(); for (const { res } of owned.held) res.destroy(); for (const res of owned.events) res.destroy();
    assert.deepEqual(errors, []); assert.equal(overflow, false);
  };
  return { page, owned, close };
}
async function reveal(f) {
  await f.page.goto(origin + '/#arena/001');
  await f.page.locator('.phase-voting').waitFor(); await f.page.locator('.vote-a').click();
  await f.page.locator('.reaction-bar').nth(1).waitFor(); await tick();
}
try {
  const lobby = await setup(); await lobby.page.goto(origin + '/#guess-friends');
  await lobby.page.locator('.gf-lobby').waitFor(); await tick();
  assert.equal(lobby.owned.calls.filter(c => c.path === '/guess/friends/catalog').length, baseline ? 1 : 0);
  checks.push(`${baseline ? 'baseline' : 'candidate'} empty friend lobby catalog requests: ${baseline ? 1 : 0}`);
  await lobby.close('friend-lobby');
  const restored = await setup({ room: room() }); await restored.page.goto(origin + '/#guess-friends');
  await restored.page.locator('.gf-room').waitFor(); await tick();
  const restoredReads = restored.owned.calls.filter(c => c.path === '/guess/friends/catalog').length;
  if (baseline) assert(restoredReads > 2, 'the unstable translation callback repeats the catalog effect');
  else assert.equal(restoredReads, 1);
  checks.push(`${baseline ? 'baseline' : 'candidate'} restored room catalog requests: ${restoredReads}`);
  await restored.close('friend-restore');
  const leaving = await setup({ modes: { '/guess/today': 'body' } }); await leaving.page.goto(origin + '/#guess'); await tick();
  await waitFor(() => leaving.owned.calls.some(c => c.path === '/guess/today'));
  await leaving.page.evaluate(() => location.hash = '#terms'); await leaving.page.locator('.legal-page').waitFor(); await tick();
  assert.equal(leaving.owned.aborted.includes('/guess/today'), !baseline);
  checks.push(`${baseline ? 'baseline keeps' : 'candidate aborts'} the departed single-player catalog body`);
  await leaving.close('guess-leave');
  const reaction = await setup(); await reveal(reaction);
  assert.equal(reaction.owned.calls.filter(c => c.path === '/reactions').length, baseline ? 2 : 1);
  checks.push(`${baseline ? 'baseline' : 'candidate'} same-prompt two reaction bars reads: ${baseline ? 2 : 1}`);
  await reaction.close('reactions');
  if (!baseline) {
    const stable = await setup({ room: room() }, 1440);
    await stable.page.goto(origin + '/#guess-friends'); await stable.page.locator('.gf-search input:not(:disabled)').waitFor();
    await stable.page.locator('.language-switch').click(); await stable.page.locator('.language-switch').click();
    await tick(); assert.equal(stable.owned.calls.filter(c => c.path === '/guess/friends/catalog').length, 1);
    const updated = { ...stable.owned.room, version: 2, round: 2 };
    stable.owned.events[0].write(`event: room\ndata: ${JSON.stringify(updated)}\n\n`);
    await tick(); assert.equal(stable.owned.calls.filter(c => c.path === '/guess/friends/catalog').length, 1);
    checks.push('desktop room re-renders, language changes and same-catalog next round keep one catalog read');
    await stable.close('friend-stable');
    for (const mode of ['headers', 'body', 'error', 'invalid']) {
      const failed = await setup({ room: room(), modes: { '/guess/friends/catalog': mode } });
      await failed.page.clock.install(); await failed.page.goto(origin + '/#guess-friends');
      await failed.page.locator('.gf-room').waitFor(); await tick();
      if (mode === 'headers' || mode === 'body') { await failed.page.clock.fastForward(13000); await tick(); }
      await failed.page.locator('.gf-catalog-error').waitFor();
      assert.equal(await failed.page.locator('.gf-search input').isDisabled(), true);
      assert.equal(failed.owned.calls.filter(c => c.path === '/guess/friends/catalog').length, 1);
      delete failed.owned.modes['/guess/friends/catalog'];
      await failed.page.locator('.gf-catalog-error button').click();
      await failed.page.locator('.gf-search input:not(:disabled)').waitFor();
      assert.equal(failed.owned.calls.filter(c => c.path === '/guess/friends/current').length, 1);
      assert.equal(failed.owned.calls.filter(c => c.path === '/guess/friends/catalog').length, 2);
      checks.push(`room catalog ${mode}: bounded/fail closed, explicit retry keeps the current room`);
      await failed.close(`friend-${mode}`);
    }
    const revision = await setup({ room: room(), modes: { '/guess/friends/catalog': 'body' } });
    await revision.page.goto(origin + '/#guess-friends'); await revision.page.locator('.gf-room').waitFor(); await tick();
    revision.owned.room = { ...revision.owned.room, version: 2, catalogVersion: 'fixture-v2' };
    delete revision.owned.modes['/guess/friends/catalog'];
    revision.owned.events[0].write(`event: room\ndata: ${JSON.stringify(revision.owned.room)}\n\n`);
    await revision.page.locator('.gf-search input:not(:disabled)').waitFor(); await tick();
    assert(revision.owned.aborted.includes('/guess/friends/catalog'));
    for (const { res } of revision.owned.held) res.end('"models":[],"catalogVersion":"fixture-v1"}');
    await revision.page.locator('.gf-search input').fill('Test');
    await revision.page.locator('.gf-options [role=option]').waitFor();
    assert.equal(await revision.page.locator('.gf-catalog-error').count(), 0);
    checks.push('a new frozen catalog version aborts the old body; its late response cannot replace current candidates');
    await revision.close('friend-version');
    const depart = await setup({ room: room(), modes: { '/guess/friends/catalog': 'body' } });
    await depart.page.goto(origin + '/#guess-friends'); await depart.page.locator('.gf-room').waitFor(); await tick();
    await depart.page.evaluate(() => location.hash = '#terms'); await depart.page.locator('.legal-page').waitFor(); await tick();
    assert(depart.owned.aborted.includes('/guess/friends/catalog'));
    assert(depart.owned.aborted.some(p => p.endsWith('/events')));
    checks.push('leaving a friend room page closes its SSE and aborts the pending catalog body');
    await depart.close('friend-leave');
    const counts = await setup({}, 1440); await reveal(counts);
    assert.equal(counts.owned.calls.filter(c => c.path === '/reactions').length, 1);
    counts.owned.user = { ...member, id: 'member-b', username: 'Member B' };
    counts.owned.modes['/reactions'] = 'body';
    await counts.page.evaluate(() => dispatchEvent(new Event('focus'))); await tick();
    assert.equal(await counts.page.locator('.reaction-chip[aria-pressed=true]').count(), 0, 'A selections disappear while B is loading');
    await counts.page.locator('.reaction-up').first().click();
    assert.equal(await counts.page.locator('.reaction-up').first().getAttribute('aria-pressed'), 'true');
    for (const { path, res } of counts.owned.held) if (path === '/reactions') res.end('"counts":{},"mine":{}}');
    await tick(); assert.equal(await counts.page.locator('.reaction-up').first().getAttribute('aria-pressed'), 'true', 'late reads preserve B local intention');
    await counts.page.evaluate(() => location.hash = '#terms'); await counts.page.locator('.legal-page').waitFor(); await tick();
    const posts = counts.owned.calls.filter(c => c.path === '/reactions' && c.method === 'POST');
    assert.equal(posts.length, 1); assert.equal(posts[0].body.userId, 'member-b');
    checks.push('desktop identity refresh clears old selections; late reads preserve only B intention, sent once under B');
    await counts.close('reactions-owner');
    for (const mode of ['headers', 'body']) {
      const slow = await setup({ modes: { '/reactions': mode } });
      await reveal(slow);
      await slow.page.evaluate(() => location.hash = '#terms'); await slow.page.locator('.legal-page').waitFor(); await tick();
      assert(slow.owned.aborted.includes('/reactions'));
      assert.equal(slow.owned.calls.filter(c => c.path === '/reactions').length, 1);
      checks.push(`reaction ${mode}: both bars share one read, final departure cancels it`);
      await slow.close(`reactions-${mode}`);
    }
    const visitor = await setup({ user: null }); await visitor.page.goto(origin + '/#guess-friends');
    await visitor.page.locator('.gf-signin').waitFor();
    assert.equal(visitor.owned.calls.filter(c => c.path.startsWith('/guess/friends')).length, 0);
    checks.push('anonymous friend-room entry does not request member state or catalogs');
    await visitor.close('friend-visitor');
  }
  console.log(JSON.stringify({ baseline, checks, records }, null, 2));
} finally {
  await writeFile(`${out}/result.json`, JSON.stringify({ baseline, checks, records }, null, 2));
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
