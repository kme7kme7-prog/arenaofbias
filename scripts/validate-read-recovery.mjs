// Real built pages against isolated streaming/error responses. No production writes.
// Prepare: npm run build && npx vite build --config vite.ladder.config.ts --outDir .local/round3-ladder-dist
// Run: AOB_CHROMIUM=/absolute/path/to/chromium node scripts/validate-read-recovery.mjs
// --baseline uses the separately saved, unmodified .local/round3-baseline-dist for the five fault reproductions.
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';

const baseline = process.argv.includes('--baseline');
const out = `.local/round3-${baseline ? 'baseline' : 'candidate'}-browser`;
await mkdir(out, { recursive: true });
let fixture;
const app = express();
app.use(express.json());
app.use('/api', (req, res) => {
  const owner = fixture;
  res.setHeader('Access-Control-Allow-Origin', fixture.origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  const path = req.originalUrl;
  fixture.calls.push({ path, method: req.method });
  res.on('close', () => { if (!res.writableEnded) owner.aborted.push(path); });
  const hold = (mode) => {
    fixture.held.push(res);
    if (mode === 'body') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); }
  };
  if (path.startsWith('/api/show1/leaderboard')) {
    const query = new URL(path, 'http://fixture').searchParams;
    const mode = fixture.boardByCategory?.[query.get('category')] ?? fixture.board;
    if (mode === 'headers' || mode === 'body') return hold(mode);
    if (mode === 'error') return res.status(500).json({ error: 'Unavailable' });
    if (mode === 'invalid') return res.type('application/json').send('not JSON');
    return res.json({ scope: query.get('scope'), category: query.get('category'), board: { rows: [], totalVotes: 0 },
      allBoard: { rows: [], totalVotes: 0 }, radar: { profiles: {}, average: Array(6).fill(50) }, scopedPromptCount: 0 });
  }
  if (path === '/api/auth/turnstile') {
    if (fixture.config === 'headers' || fixture.config === 'body') return hold(fixture.config);
    if (fixture.config === 'error') return res.status(500).json({ error: 'Unavailable' });
    if (fixture.config === 'invalid') return res.json({ enabled: false });
    return res.json({ siteKey: fixture.siteKey });
  }
  if (path === '/api/auth/me') return res.json({ user: fixture.user });
  if (path === '/api/auth/login') return res.json({ user: { id: 'fixture-member', username: 'Fixture', role: null, email: 'f@example.test' } });
  if (path === '/api/tank-ladder/state') return res.json({ season: 'public-s01', rankings: [], matches: [], mine: [], jobs: [],
    counts: { matches: 0, queued: 0, running: 0 }, maps: [], user: null, csrf: '', limits: {}, nodeOnline: false });
  if (path === '/api/tank-ladder/preview') return res.json(JSON.parse(readFileSync('tools/tank-ladder/public/preview.json', 'utf8')));
  return res.json({});
});
app.use(express.static(baseline ? '.local/round3-baseline-dist' : 'dist'));
if (!baseline) app.use(express.static('.local/round3-ladder-dist'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', `${out}/test-key.pem`, '-out', `${out}/test-cert.pem`, '-days', '1', '-nodes', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const server = await new Promise(resolve => { const s = createServer({ key: readFileSync(`${out}/test-key.pem`), cert: readFileSync(`${out}/test-cert.pem`) }, app).listen(0, '127.0.0.1', () => resolve(s)); });
const origin = `https://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.AOB_CHROMIUM ? { executablePath: process.env.AOB_CHROMIUM } : { channel: 'msedge' }) });
const records = [], checks = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 80));
const sdk = `window.__gateOptions ||= []; window.__gateRemoved ||= []; window.turnstile={render(host,options){const id='widget-'+window.__gateOptions.length;window.__gateOptions.push(options);host.dataset.fixtureWidget=id;return id},remove(id){window.__gateRemoved.push(id)}};`;
async function setup(options = {}) {
  fixture = { origin, calls: [], aborted: [], held: [], config: 'ready', siteKey: null, user: null, ...options };
  const owned = fixture;
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', recordVideo: { dir: out, size: { width: 390, height: 844 } } });
  await context.route('https://api.arenaofbias.icu/**', route => route.continue({ url: origin + new URL(route.request().url()).pathname + new URL(route.request().url()).search }));
  owned.sdkRequests = [];
  await context.route('https://challenges.cloudflare.com/turnstile/**', async route => {
    owned.sdkRequests.push(route);
    if (owned.sdk === 'hold') return;
    if (owned.sdk === 'error') return route.abort('failed');
    return route.fulfill({ contentType: 'text/javascript', body: sdk });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  const close = async name => {
    await page.screenshot({ path: `${out}/${name}.png` });
    records.push({ name, calls: [...owned.calls], aborted: [...owned.aborted], sdkRequests: owned.sdkRequests.length, errors, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
    await context.close();
    for (const response of owned.held) response.destroy();
    assert.deepEqual(errors, []);
    assert.equal(records.at(-1).overflow, false);
  };
  return { page, owned, close };
}
async function account(page) {
  await page.goto(origin + '/#home');
  await page.locator('.account-entry:not(:disabled)').first().click();
  await page.locator('.account-dialog').waitFor();
}
try {
  for (const mode of ['headers', 'body']) {
    const f = await setup({ board: mode });
    await f.page.goto(origin + '/#rank');
    await f.page.locator('.rank-empty-code').waitFor();
    await tick();
    await f.page.clock.fastForward(13000);
    await tick();
    if (baseline) {
      assert.equal(await f.page.locator('.rank-empty-action').count(), 0);
      assert.equal(await f.page.locator('.rank-empty-code').textContent(), '正在读取投票');
      checks.push(`baseline board hanging ${mode}: still loading after 13s, no recovery control`);
    } else {
      await f.page.locator('.rank-empty-action').waitFor();
      f.owned.board = 'ready';
      await f.page.locator('.rank-empty-action').click();
      await f.page.getByText('等待第一票', { exact: true }).waitFor();
      assert.equal(f.owned.calls.filter(row => row.path.startsWith('/api/show1/leaderboard')).length, 2);
      checks.push(`board hanging ${mode}: 12s cutoff covers response body; manual retry succeeds once`);
    }
    await f.close(`board-${mode}`);
  }
  for (const mode of ['headers', 'body']) {
    const f = await setup({ config: mode });
    await account(f.page);
    await tick();
    await f.page.clock.fastForward(13000);
    await tick();
    if (baseline) {
      assert.equal(await f.page.locator('.account-gate-retry').count(), 0);
      checks.push(`baseline gate config hanging ${mode}: no cutoff or local retry`);
    } else {
      await f.page.locator('.account-gate-retry').waitFor();
      assert.equal(f.owned.sdkRequests.length, 0, 'failed configuration cannot disable a required challenge');
      f.owned.config = 'ready';
      await f.page.locator('.account-gate-retry').click();
      await tick();
      assert.equal(f.owned.calls.filter(row => row.path === '/api/auth/turnstile').length, 2);
      assert.equal(await f.page.locator('.account-gate-retry').count(), 0);
      checks.push(`gate config hanging ${mode}: bounded, fails closed and retries without reload`);
    }
    await f.close(`gate-${mode}`);
  }
  const f = await setup({ siteKey: 'fixture-public-key', sdk: 'hold' });
  await account(f.page);
  await tick();
  await f.page.clock.fastForward(13000);
  await tick();
  if (baseline) {
    assert.equal(await f.page.locator('script[src*="challenges.cloudflare.com"]').count(), 1);
    assert.equal(await f.page.locator('.account-gate-retry').count(), 0);
    checks.push('baseline hanging SDK: script and pending shared promise remain after 13s');
  } else {
    await f.page.locator('.account-gate-retry').waitFor();
    assert.equal(await f.page.locator('script[src*="challenges.cloudflare.com"]').count(), 0);
    await f.owned.sdkRequests[0].fulfill({ contentType: 'text/javascript', body: sdk }).catch(() => {});
    await tick();
    assert.equal(await f.page.evaluate(() => window.__gateOptions?.length ?? 0), 0, 'a late SDK cannot render the timed-out owner');
    f.owned.sdk = 'ready';
    await f.page.locator('.account-gate-retry').click();
    await f.page.locator('[data-fixture-widget]').waitFor();
    await f.page.fill('#account-name', 'fixture');
    await f.page.fill('#account-password', 'fixture-pass');
    await f.page.locator('.account-submit').click();
    assert.equal(f.owned.calls.filter(row => row.path === '/api/auth/login').length, 0, 'the SDK retry cannot skip its token');
    await f.page.keyboard.press('Escape');
    await f.page.locator('.account-entry').first().click();
    await f.page.locator('[data-fixture-widget]').waitFor();
    await f.page.evaluate(() => window.__gateOptions[0].callback('stale-token'));
    await f.page.fill('#account-name', 'fixture');
    await f.page.fill('#account-password', 'fixture-pass');
    await f.page.locator('.account-submit').click();
    assert.equal(f.owned.calls.filter(row => row.path === '/api/auth/login').length, 0, 'a disposed widget token cannot authorize the new dialog');
    await f.page.evaluate(() => window.__gateOptions.at(-1).callback('current-token'));
    await f.page.locator('.account-submit').click();
    await tick();
    assert.equal(f.owned.calls.filter(row => row.path === '/api/auth/login').length, 1);
    checks.push('SDK cutoff removes old script; late loading does not render; local retry still needs a current widget token');
  }
  await f.close('sdk');
  if (!baseline) {
    const switched = await setup({ boardByCategory: { all: 'headers', text: 'ready', web: 'body' } });
    await switched.page.goto(origin + '/#rank');
    await switched.page.locator('.rank-tabs').waitFor();
    await tick();
    await switched.page.locator('.rank-tab').nth(1).click();
    await switched.page.getByText('等待第一票', { exact: true }).waitFor();
    await tick();
    assert(switched.owned.aborted.some(path => path.includes('category=all')));
    await switched.page.locator('.rank-tab').nth(2).click();
    await tick();
    await switched.page.evaluate(() => location.hash = '#terms');
    await switched.page.locator('.legal-page').waitFor();
    await tick();
    assert(switched.owned.aborted.some(path => path.includes('category=web')));
    for (const response of switched.owned.held) response.end('}');
    assert.equal(await switched.page.locator('.rank-page').count(), 0);
    checks.push('fast category changes and route departure abort old header/body reads; stale responses stay off the new page');
    await switched.close('fast-routes');
    for (const mode of ['error', 'invalid']) {
      const failed = await setup({ board: mode });
      await failed.page.goto(origin + '/#rank');
      await failed.page.locator('.rank-empty-action').waitFor();
      assert.equal(failed.owned.calls.filter(row => row.path.startsWith('/api/show1/leaderboard')).length, 1);
      failed.owned.board = 'ready';
      await failed.page.locator('.rank-empty-action').click();
      await failed.page.getByText('等待第一票', { exact: true }).waitFor();
      checks.push(`board ${mode}: explicit recovery without automatic retries`);
      await failed.close(`board-${mode}`);
    }
    for (const mode of ['error', 'invalid']) {
      const failed = await setup({ config: mode });
      await account(failed.page);
      await failed.page.locator('.account-gate-retry').waitFor();
      await failed.page.fill('#account-name', 'fixture');
      await failed.page.fill('#account-password', 'fixture-pass');
      await failed.page.locator('.account-submit').click();
      assert.equal(failed.owned.calls.filter(row => row.path === '/api/auth/login').length, 0);
      failed.owned.config = 'ready';
      await failed.page.locator('.account-gate-retry').click();
      await tick();
      assert.equal(failed.owned.calls.filter(row => row.path === '/api/auth/turnstile').length, 2);
      checks.push(`gate ${mode}: does not infer that challenges are disabled and recovers locally`);
      await failed.close(`gate-${mode}`);
    }
    const closed = await setup({ config: 'body' });
    await account(closed.page);
    await tick();
    await closed.page.keyboard.press('Escape');
    await tick();
    assert(closed.owned.aborted.includes('/api/auth/turnstile'));
    closed.owned.config = 'ready'; closed.owned.siteKey = 'fixture-key';
    await closed.page.locator('.account-entry').first().click();
    await closed.page.locator('[data-fixture-widget]').waitFor();
    for (const response of closed.owned.held) response.end('"siteKey":null}');
    await closed.page.fill('#account-name', 'fixture');
    await closed.page.fill('#account-password', 'fixture-pass');
    await closed.page.locator('.account-submit').click();
    assert.equal(closed.owned.calls.filter(row => row.path === '/api/auth/login').length, 0);
    checks.push('closing aborts config body; fast reopen and stale disabled-config response cannot bypass the new required challenge');
    await closed.close('fast-account');
    const sdkError = await setup({ siteKey: 'fixture-key', sdk: 'error' });
    await account(sdkError.page);
    await sdkError.page.locator('.account-gate-retry').waitFor();
    sdkError.owned.sdk = 'ready';
    await sdkError.page.locator('.account-gate-retry').click();
    await sdkError.page.locator('[data-fixture-widget]').waitFor();
    await sdkError.page.clock.fastForward(13000);
    assert.equal(await sdkError.page.locator('.account-gate-retry').count(), 0, 'a successful SDK clears its failure timer');
    checks.push('SDK network error permits explicit retry; success clears deadline and leaves one active widget');
    await sdkError.close('sdk-network');
    const member = await setup({ user: { id: 'fixture-member', username: 'Fixture', role: null, email: null } });
    await account(member.page);
    assert.equal(member.owned.calls.filter(row => row.path === '/api/auth/turnstile').length, 0);
    assert.equal(member.owned.sdkRequests.length, 0);
    await member.page.getByRole('button', { name: '绑定', exact: true }).click();
    await tick();
    assert.equal(member.owned.calls.filter(row => row.path === '/api/auth/turnstile').length, 1);
    checks.push('member overview does not request challenge configuration; choosing email binding requests it on demand');
    await member.close('member');
    const ladder = await setup({ config: 'body' });
    await ladder.page.goto(origin + '/ladder.html');
    await ladder.page.locator('#ladder-account .account-entry:not(:disabled)').click();
    await ladder.page.locator('.account-dialog').waitFor();
    await tick();
    await ladder.page.clock.fastForward(13000);
    await ladder.page.locator('.account-gate-retry').waitFor();
    ladder.owned.config = 'ready'; ladder.owned.siteKey = 'fixture-key';
    await ladder.page.locator('.account-gate-retry').click();
    await ladder.page.locator('[data-fixture-widget]').waitFor();
    await ladder.page.fill('#account-name', 'fixture');
    await ladder.page.fill('#account-password', 'fixture-pass');
    await ladder.page.locator('.account-submit').click();
    assert.equal(ladder.owned.calls.filter(row => row.path === '/api/auth/login').length, 0);
    assert.equal(ladder.owned.calls.filter(row => row.path === '/api/auth/turnstile').length, 2);
    assert.equal(ladder.owned.calls.filter(row => row.path.endsWith('/replay')).length, 0);
    checks.push('separate scoped ladder build shares bounded account configuration and explicit retry; challenge remains required and no full replay is fetched');
    await ladder.close('ladder-account');
  }
  console.log(JSON.stringify({ baseline, checks, records }, null, 2));
} finally {
  await writeFile(`${out}/result.json`, JSON.stringify({ baseline, checks, records }, null, 2));
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
