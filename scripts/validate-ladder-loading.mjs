// Isolated HTTPS APIs + real scoped ladder bundles; never contact production accounts or write APIs.
// Build: npx vite build --config vite.ladder.config.ts --outDir .local/round5-ladder-dist
// Run: AOB_CHROMIUM=/absolute/chromium node scripts/validate-ladder-loading.mjs
// --baseline uses the saved round3 scoped ladder (the unchanged production UI before round5).
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';

const baseline = process.argv.includes('--baseline');
const out = `.local/round5-${baseline ? 'baseline' : 'candidate'}-browser`;
await mkdir(out, { recursive: true });
const preview = JSON.parse(readFileSync('tools/tank-ladder/public/preview.json', 'utf8'));
const account = suffix => ({ id: `member-${suffix}`, username: `Member ${suffix}`, role: null, email: `${suffix}@example.test` });
const contender = (i, suffix = '') => ({ id: `version-${suffix || i}`, work: `work-${suffix || i}`, name: suffix ? `Private ${suffix}` : `Tank ${i}`,
  model: 'Fixture', effort: 'default', number: 1, active: `version-${suffix || i}`, games: 12, wins: 4, winRate: 1 / 3, avgKills: 2,
  avgPoints: 4, faults: 0, sha: '0'.repeat(64), rating: 10, official: 1, provisional: false, status: 'ready',
  rank: i + 1, kills: 2, points: 4, delta: 1, after: 10 });
const rows = Array.from({ length: 8 }, (_, i) => contender(i));
const match = { id: 'fixture-match', mapId: 'crossroads', created: 1, rows: rows.slice(0, 4) };
let fixture;
const state = owner => ({ rankings: rows.slice(0, owner.rankCount), matches: [match], mine: owner.user ? [contender(0, owner.user.id.slice(-1))] : [],
  jobs: owner.queueStatus ? [{ id: 'manual-job', kind: 'match', status: owner.queueStatus, created: 1, automatic: false }] : [],
  counts: { matches: 1, queued: 0, running: 0 }, maps: [{ id: 'crossroads', name: '十字猎场' }],
  user: owner.user ? { id: owner.user.id, name: owner.user.username } : null, csrf: owner.user ? `csrf-${owner.user.id}` : '', limits: {}, nodeOnline: true });
const app = express(); app.use(express.json());
app.use('/api', (req, res) => {
  const owned = fixture, path = req.path;
  res.setHeader('Access-Control-Allow-Origin', owned.origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  owned.calls.push({ path, method: req.method, owner: owned.user?.id ?? null, ...(req.method === 'POST' ? { body: req.body } : {}) });
  res.on('close', () => { if (!res.writableEnded) owned.aborted.push(path); });
  const hold = (mode, data) => {
    owned.held.push({ path, res, data });
    if (mode === 'body') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); }
  };
  if (path === '/auth/me') return res.json({ user: owned.user });
  if (req.method === 'POST') {
    if (owned.nextPostMode) { const mode = owned.nextPostMode; owned.nextPostMode = ''; return hold(mode, { saved: true }); }
    if (path === '/tank-ladder/queue') owned.queueStatus = req.body.action === 'pause' ? 'held' : req.body.action === 'resume' ? 'queued' : '';
    return res.json({ saved: true });
  }
  if (path === '/tank-ladder/state') {
    const mode = owned.nextStateMode || owned.stateMode; owned.nextStateMode = '';
    if (mode === 'headers' || mode === 'body') return hold(mode, state(owned));
    if (mode === 'error') return res.status(500).json({ error: 'fixture state unavailable' });
    return res.json(state(owned));
  }
  if (path === '/tank-ladder/preview') {
    if (owned.previewMode === 'headers' || owned.previewMode === 'body') return hold(owned.previewMode, preview);
    if (owned.previewMode === 'error') return res.status(500).json({ error: 'fixture preview unavailable' });
    if (owned.previewMode === 'invalid') return res.type('application/json').send('not JSON');
    return res.json(preview);
  }
  if (path.endsWith('/replay')) return res.json({ ...preview, meta: { mapId: 'crossroads', seed: 42, ladder: { entries: rows.slice(0, 4) } } });
  return res.json({});
});
app.use(express.static(baseline ? '.local/round3-ladder-dist' : '.local/round5-ladder-dist'));
app.use(express.static('dist')); // Unchanged public boot scripts; the scoped build deliberately does not copy them.
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', `${out}/test-key.pem`, '-out', `${out}/test-cert.pem`, '-days', '1', '-nodes', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const server = await new Promise(resolve => { const s = createServer({ key: readFileSync(`${out}/test-key.pem`), cert: readFileSync(`${out}/test-cert.pem`) }, app).listen(0, '127.0.0.1', () => resolve(s)); });
const origin = `https://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.AOB_CHROMIUM ? { executablePath: process.env.AOB_CHROMIUM } : { channel: 'msedge' }) });
const checks = [], records = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 120));
async function until(check) { for (let i = 0; i < 60; i++) { if (check()) return; await tick(); } assert(check(), 'fixture request did not arrive'); }
async function setup(options = {}, width = 390) {
  const owned = fixture = { origin, user: account('A'), rankCount: 8, calls: [], aborted: [], held: [], stateMode: '', previewMode: '', nextStateMode: '', nextPostMode: '', ...options };
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.route('https://api.arenaofbias.icu/**', route => { const u = new URL(route.request().url()); return route.continue({ url: origin + u.pathname + u.search }); });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const close = async name => {
    await page.screenshot({ path: `${out}/${name}-${width}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await context.close(); for (const { res } of owned.held) res.destroy();
    records.push({ name, width, calls: owned.calls, aborted: owned.aborted, errors, overflow });
    assert.deepEqual(errors, []); assert.equal(overflow, false);
    assert.equal(owned.calls.some(c => c.method !== 'GET'), Boolean(owned.allowWrites));
  };
  return { page, owned, close };
}
const visibility = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const finish = row => { if (!row.res.destroyed) row.res.end(JSON.stringify(row.data).slice(1)); };
const count = (owned, path) => owned.calls.filter(c => c.path === `/tank-ladder/${path}`).length;
async function loaded(f) {
  await f.page.goto(origin + '/ladder.html');
  await f.page.waitForFunction(() => document.querySelector('#identity').textContent.includes('Member A'));
  await tick();
}
async function file(page, name = 'bot.js', code = 'function decide(){return {move:"stay",fire:false}}') {
  await page.locator('#bot-file').setInputFiles({ name, mimeType: 'text/javascript', buffer: Buffer.from(code) });
}
async function fillUpload(page, name = 'Draft') {
  await page.locator('#upload-open').click();
  await page.locator('#upload-form [name=name]').fill(name);
  await page.locator('#upload-form [name=model]').fill('Fixture');
}
try {
  const race = await setup(); await race.page.goto(origin + '/ladder.html');
  await race.page.locator('#my-works h3').filter({ hasText: 'Private A' }).waitFor({ state: 'attached' }); await tick();
  race.owned.nextStateMode = 'body'; await visibility(race.page);
  await until(() => race.owned.held.length > 0);
  race.owned.user = account('B'); await race.page.evaluate(() => dispatchEvent(new Event('focus')));
  await race.page.waitForFunction(() => document.querySelector('#identity').textContent.includes('Member B'));
  finish(race.owned.held[0]); await tick();
  assert.match(await race.page.locator('#identity').textContent(), baseline ? /Member A/ : /Member B/);
  assert.equal(await race.page.locator('#my-works h3').textContent(), baseline ? 'Private A' : 'Private B');
  checks.push(baseline ? 'baseline late A state overwrites current B identity and private works' : 'late A body is cancelled and cannot overwrite B identity or private works');
  await race.close('identity-race');
  const recovery = await setup({ previewMode: 'error' }, 1440); await recovery.page.goto(origin + '/ladder.html');
  await until(() => recovery.owned.calls.some(c => c.path === '/tank-ladder/preview')); await tick();
  recovery.owned.previewMode = ''; const before = recovery.owned.calls.filter(c => c.path === '/tank-ladder/preview').length;
  await visibility(recovery.page); await tick();
  if (baseline) {
    assert.equal(recovery.owned.calls.filter(c => c.path === '/tank-ladder/preview').length, before);
    assert.equal(await recovery.page.locator('#featured-info').textContent(), '');
    checks.push('baseline first preview error never retries while the state signature is unchanged');
  } else {
    await recovery.page.waitForFunction(() => document.querySelector('#watch-overlay').textContent.includes('观看最新'));
    assert(recovery.owned.calls.filter(c => c.path === '/tank-ladder/preview').length > before);
    assert.equal(recovery.owned.calls.filter(c => c.path.endsWith('/replay')).length, 0);
    await recovery.page.locator('#featured-watch').click(); await recovery.page.locator('#replay-dialog[open]').waitFor();
    await recovery.page.keyboard.press('Escape'); await recovery.page.locator('#featured-watch').click(); await recovery.page.locator('#replay-dialog[open]').waitFor();
    assert.equal(recovery.owned.calls.filter(c => c.path.endsWith('/replay')).length, 1);
    checks.push('a failed preview retries on the next state read; full replay still loads only on click and reuses one read');
  }
  await recovery.close('preview-recovery');
  if (!baseline) {
    const same = await setup(); await loaded(same); await fillUpload(same.page, 'Keep my draft');
    const states = count(same.owned, 'state'), auth = same.owned.calls.filter(c => c.path === '/auth/me').length;
    await same.page.evaluate(() => dispatchEvent(new Event('focus')));
    await until(() => same.owned.calls.filter(c => c.path === '/auth/me').length > auth); await tick();
    assert.equal(count(same.owned, 'state'), states);
    assert.equal(await same.page.locator('#upload-dialog').evaluate(d => d.open), true);
    assert.equal(await same.page.locator('#upload-form [name=name]').inputValue(), 'Keep my draft');
    checks.push('refreshing the same account does not re-read state or close its draft');
    await same.close('same-account');
    const shared = await setup(); await loaded(shared);
    const before = count(shared.owned, 'state'); shared.owned.nextStateMode = 'body'; await visibility(shared.page);
    await until(() => shared.owned.held.length > 0);
    for (let i = 0; i < 5; i++) await visibility(shared.page);
    assert.equal(count(shared.owned, 'state'), before + 1); finish(shared.owned.held[0]); await tick();
    checks.push('repeated visibility refreshes share the same pending state body'); await shared.close('shared-state');
    const clear = await setup(); await loaded(clear); await fillUpload(clear.page, 'A private draft');
    clear.owned.user = account('B'); clear.owned.stateMode = 'body';
    await clear.page.evaluate(() => dispatchEvent(new Event('focus')));
    await until(() => clear.owned.held.length > 0);
    assert.equal(await clear.page.locator('#upload-dialog').evaluate(d => d.open), false);
    assert.equal(await clear.page.locator('#my-works .work-card').count(), 0);
    assert.equal(await clear.page.locator('#queue-pause').isVisible(), false);
    finish(clear.owned.held[0]); await clear.page.waitForFunction(() => document.querySelector('#identity').textContent.includes('Member B'));
    checks.push('a real account change clears private works, controls and dialogs while B state is still loading'); await clear.close('clear-private');
    for (const mode of ['headers', 'body']) {
      const timeout = await setup({ stateMode: mode }); await timeout.page.clock.install();
      await timeout.page.goto(origin + '/ladder.html'); await until(() => count(timeout.owned, 'state') > 0); await tick();
      await timeout.page.clock.fastForward(13000); await tick();
      assert.match(await timeout.page.locator('#queue-label').textContent(), /暂时无法连接/);
      timeout.owned.stateMode = ''; await visibility(timeout.page);
      await timeout.page.waitForFunction(() => document.querySelector('#identity').textContent.includes('Member A'));
      checks.push(`state ${mode} deadline covers JSON, then a fresh read recovers`); await timeout.close(`state-${mode}`);
    }
    for (const mode of ['headers', 'body', 'invalid']) {
      const timeout = await setup({ previewMode: mode }); await timeout.page.clock.install();
      await timeout.page.goto(origin + '/ladder.html'); await until(() => count(timeout.owned, 'preview') > 0); await tick();
      if (mode !== 'invalid') { await timeout.page.clock.fastForward(13000); await tick(); }
      timeout.owned.previewMode = ''; await visibility(timeout.page);
      await timeout.page.waitForFunction(() => document.querySelector('#watch-overlay').textContent.includes('观看最新'));
      assert.equal(count(timeout.owned, 'matches/fixture-match/replay'), 0);
      checks.push(`preview ${mode} recovers through a later state read, with zero full replay fetches`); await timeout.close(`preview-${mode}`);
    }
    const upload = await setup({ allowWrites: true }); await loaded(upload);
    await fillUpload(upload.page, 'A upload'); await file(upload.page);
    await upload.page.waitForFunction(() => document.querySelector('#file-name').textContent.includes('bot.js ·'));
    upload.owned.nextPostMode = 'body'; await upload.page.locator('#submit-bot').click();
    await until(() => upload.owned.held.some(c => c.path.endsWith('/versions')));
    upload.owned.user = account('B'); await upload.page.evaluate(() => dispatchEvent(new Event('focus')));
    await upload.page.waitForFunction(() => document.querySelector('#identity').textContent.includes('Member B'));
    await fillUpload(upload.page, 'B new draft'); await file(upload.page, 'B.js', 'function decide(){return {move:"stay",fire:true}}'); await tick();
    finish(upload.owned.held.find(c => c.path.endsWith('/versions'))); await tick();
    assert.equal(await upload.page.locator('#upload-dialog').evaluate(d => d.open), true);
    assert.equal(await upload.page.locator('#upload-form [name=name]').inputValue(), 'B new draft');
    assert.equal(await upload.page.locator('#submit-bot').isDisabled(), false);
    assert.match(await upload.page.locator('#file-name').textContent(), /B.js/);
    assert.equal(upload.owned.calls.filter(c => c.method === 'POST').length, 1);
    checks.push('a late A upload completion never closes/resets B draft, changes B submit state or automatically sends it'); await upload.close('late-upload');
    const delayed = await setup({ allowWrites: true });
    await delayed.page.addInitScript(() => {
      // oxlint-disable-next-line typescript/unbound-method -- The fixture invokes the saved native method with its original File as this.
      const original = File.prototype.text; File.prototype.text = function () {
      if (this.name === 'slow-A.js') return new Promise(resolve => { window.finishOldFile = () => original.call(this).then(resolve); });
      return original.call(this);
    }; });
    await loaded(delayed); await fillUpload(delayed.page, 'Slow A'); await file(delayed.page, 'slow-A.js', 'old A source');
    await delayed.page.waitForFunction(() => typeof window.finishOldFile === 'function');
    delayed.owned.user = account('B'); await delayed.page.evaluate(() => dispatchEvent(new Event('focus')));
    await delayed.page.waitForFunction(() => document.querySelector('#identity').textContent.includes('Member B'));
    await fillUpload(delayed.page, 'B upload'); await file(delayed.page, 'B.js', 'new B source'); await tick();
    await delayed.page.evaluate(() => window.finishOldFile()); await tick();
    assert.match(await delayed.page.locator('#file-name').textContent(), /B.js/);
    await delayed.page.locator('#submit-bot').click(); await delayed.page.waitForFunction(() => !document.querySelector('#upload-dialog').open);
    const post = delayed.owned.calls.find(c => c.path.endsWith('/versions') && c.method === 'POST');
    assert.equal(post.owner, 'member-B'); assert.equal(post.body.source, 'new B source');
    checks.push('late A file.text cannot overwrite B source; B upload succeeds once and closes its own dialog'); await delayed.close('late-file');
    const queue = await setup({ allowWrites: true, queueStatus: 'queued' }); await loaded(queue);
    await queue.page.locator('#queue-pause').click(); await queue.page.locator('#queue-resume').waitFor();
    await queue.page.locator('#queue-resume').click(); await queue.page.locator('#queue-pause').waitFor();
    await queue.page.locator('[data-tab=mine]').click(); await queue.page.locator('#queue-cancel').click();
    await queue.page.waitForFunction(() => document.querySelector('#jobs').textContent.includes('没有待计算'));
    const actions = queue.owned.calls.filter(c => c.path === '/tank-ladder/queue' && c.method === 'POST');
    assert.deepEqual(actions.map(c => c.body.action), ['pause', 'resume', 'cancel']);
    checks.push('normal pause/resume/cancel writes each run once and force a fresh state read'); await queue.close('queue-success');
    const paging = await setup({}, 1440); await loaded(paging);
    await paging.page.locator('#rank-pages [data-page="2"]').first().click(); assert.equal(await paging.page.locator('#rankings tr').count(), 2);
    paging.owned.rankCount = 2; await visibility(paging.page); await tick();
    assert.equal(await paging.page.locator('#rankings tr').count(), 2); assert.match(await paging.page.locator('#rank-pages').textContent(), /1–2 \/ 2/);
    checks.push('desktop ranking pagination clamps after a fresh smaller snapshot'); await paging.close('pagination');
  }
  console.log(JSON.stringify({ baseline, checks, records }, null, 2));
} finally {
  await writeFile(`${out}/result.json`, JSON.stringify({ baseline, checks, records }, null, 2));
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
