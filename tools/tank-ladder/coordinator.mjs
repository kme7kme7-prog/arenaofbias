import http from 'node:http';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { startBroker, RESULT_BYTES } from './runner-broker.mjs';
import { PROFILE, ENGINE_HASH, RUNTIME_HASH } from './config.mjs';
import { publicApi, PUBLIC_SEASON } from './public-api.mjs';

// This entry point never imports an executor or evaluates submitted JavaScript.
// Keep the installed runner's source fingerprint unchanged during connection setup.
export const ENVIRONMENT = 'i5-9400-debian13-node22.23.1-quickjs032-calibration-v1';
const manifest = { profile: PROFILE, engineHash: ENGINE_HASH, runtimeHash: RUNTIME_HASH };
const validKey = key => /^[a-f0-9]{64}$/.test(key || '');
const matchesKey = (header, key) => {
  const a = Buffer.from(header || ''), b = Buffer.from(`Bearer ${key}`);
  return a.length === b.length && timingSafeEqual(a, b);
};
const atomicJson = (file, value) => {
  writeFileSync(`${file}.next`, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(`${file}.next`, file);
};
function ownDirectory(directory, expectedRuntime, environment) {
  if (!directory || !path.isAbsolute(directory)) throw Error('An absolute, dedicated calibration data directory is required.');
  if (expectedRuntime !== RUNTIME_HASH) throw Error('Installed runner fingerprint must match the reviewed coordinator package.');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const marker = path.join(directory, 'environment.json');
  const expected = { schema: 1, environment, ...manifest, compute: 'remote-only', slots: 1 };
  if (existsSync(marker)) {
    if (JSON.stringify(JSON.parse(readFileSync(marker))) !== JSON.stringify(expected)) throw Error('Environment changed; do not mix calibration results.');
  } else {
    if (existsSync(path.join(directory, 'ladder.sqlite'))) throw Error('Existing unmarked database will not be reused.');
    atomicJson(marker, expected);
  }
  const lock = path.join(directory, '.coordinator-lock');
  if (existsSync(lock)) {
    const pid = JSON.parse(readFileSync(lock)).pid;
    try { process.kill(pid, 0); throw Error('Coordinator already running for this directory.'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    unlinkSync(lock);
  }
  writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 });
  return () => unlinkSync(lock);
}

export async function startCoordinator({ directory, token, operatorToken, expectedRuntime, port = 5474, brokerPort = 5473, leaseMs = 180000, web = null } = {}) {
  if (!validKey(token) || !validKey(operatorToken) || token === operatorToken) throw Error('Separate node and operator keys are required; there is no local compute fallback.');
  const environment = web ? PUBLIC_SEASON : ENVIRONMENT;
  const unlock = ownDirectory(directory, expectedRuntime, environment);
  let store, broker, server, ticker, closed = false, activeRequests = 0;
  const observed = { lastClaimAt: null, lastCompletionAt: null, claims: 0, completions: 0 };
  const observationFile = path.join(directory, 'node-status.json');
  if (existsSync(observationFile)) Object.assign(observed, JSON.parse(readFileSync(observationFile)));
  const startedAt = new Date().toISOString();
  const setting = key => store.db.prepare('SELECT value FROM settings WHERE key=?').get(`connection:${key}`)?.value;
  const set = (key, value) => store.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(`connection:${key}`, String(value));
  const trial = () => {
    const version = setting('probe');
    const probe = version ? store.getVersion(version) : null;
    const batch = setting('batch');
    const rows = batch ? store.db.prepare('SELECT status,count(*) n FROM jobs WHERE batch=? GROUP BY status').all(batch) : [];
    return { probe: probe ? { status: probe.status, issue: probe.issue } : null, batch: batch || null,
      jobs: Object.fromEntries(rows.map(row => [row.status, row.n])), requestedMatches: setting('matches') === '12' ? 12 : 0 };
  };
  const advanceTrial = () => {
    if (web || setting('matches') !== '12' || setting('batch')) return;
    const version = setting('probe');
    if (!version || store.getVersion(version)?.status !== 'ready') return;
    const owner = setting('owner');
    // The neutral connectivity probe must never enter the real bot pool.
    store.db.prepare('UPDATE works SET active=NULL WHERE owner=? AND official=0').run(owner);
    // Recover after a crash between createBatch's transaction and its marker.
    const existing = store.db.prepare('SELECT id FROM batches WHERE owner=? ORDER BY created LIMIT 1').get(owner);
    const anchor = store.rankings().filter(row => row.official).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!anchor) throw Error('No verified library entrants available for calibration.');
    const batch = existing || store.createBatch(owner, anchor.id, true);
    set('batch', batch.id);
  };
  const prepareTrial = () => {
    if (web) throw Object.assign(Error('Calibration is disabled in a public season'), { status: 403 });
    let owner = setting('owner');
    if (!owner) { owner = store.createSession().owner; set('owner', owner); }
    if (!setting('probe')) {
      const existing = store.myVersions(owner)[0];
      const version = existing || store.upload(owner, { name: 'Connection probe', model: 'Operator self-check', effort: 'default',
        source: 'function decide(){return {move:"stay",fire:false}}', note: 'Connection validation only; excluded from match participants.' });
      set('probe', version.id);
    }
    set('matches', '12');
    advanceTrial();
    return trial();
  };
  const snapshot = () => ({ schema: 1, environment, environmentVerification: 'operator-provisioned; legacy runner does not attest OS',
    ...manifest, mode: 'remote-only', slots: 1, startedAt, nodeOnline: !!observed.lastClaimAt && Date.now() - Date.parse(observed.lastClaimAt) < 150000,
    ...observed, counts: store.counts(), trial: trial() });
  const reply = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Connection': 'close' });
    res.end(JSON.stringify(value));
  };
  const body = async (req, max) => {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw Object.assign(Error('JSON required'), { status: 415 });
    if (Number(req.headers['content-length']) > max) throw Object.assign(Error('Payload too large'), { status: 413 });
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) throw Object.assign(Error('Payload too large'), { status: 413 });
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);
    try { JSON.parse(raw); } catch { throw Object.assign(Error('Invalid JSON'), { status: 400 }); }
    return raw;
  };
  try {
    store = openStore(directory);
    store.db.exec('PRAGMA max_page_count=262144');
    store.bootstrap();
    advanceTrial();
    broker = await startBroker(store, { token, port: brokerPort, slots: 1, leaseMs });
    const handlePublic = web ? publicApi({ ...web, store, directory, status: snapshot }) : null;
    server = http.createServer(async (req, res) => {
      if (handlePublic && await handlePublic(req, res)) return;
      const operator = req.url === '/ops/trial';
      if (req.headers.origin || !matchesKey(req.headers.authorization, operator ? operatorToken : token)) return reply(res, 403, { error: 'Unauthorized' });
      if (++activeRequests > 2) { activeRequests--; return reply(res, 429, { error: 'Busy' }); }
      try {
        if (req.method === 'GET' && req.url === '/status') return reply(res, 200, snapshot());
        if (operator && req.method === 'POST') {
          const input = JSON.parse(await body(req, 256));
          if (input.action !== 'prepare') return reply(res, 400, { error: 'Unsupported operator action' });
          return reply(res, 200, prepareTrial());
        }
        if (req.method !== 'POST' || !['/claim', '/complete'].includes(req.url)) return reply(res, 404, { error: 'Not found' });
        const raw = await body(req, req.url === '/claim' ? 4096 : RESULT_BYTES);
        const upstream = await fetch(`http://127.0.0.1:${broker.port}${req.url}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(35000),
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: raw });
        const result = await upstream.json();
        if (upstream.ok) {
          if (req.url === '/claim') { observed.lastClaimAt = new Date().toISOString(); observed.claims++; }
          else { observed.lastCompletionAt = new Date().toISOString(); observed.completions++; advanceTrial(); }
        }
        return reply(res, upstream.status, result);
      } catch (error) {
        if (!res.headersSent && !res.destroyed) reply(res, error.status || 500, { error: error.status ? error.message : 'Coordinator request failed' });
      } finally { activeRequests--; }
    });
    server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxHeadersCount = 24; server.maxConnections = 16;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    ticker = setInterval(() => {
      try { atomicJson(observationFile, observed); }
      catch { console.error('Could not persist node observation.'); }
    }, 10000);
    return { port: server.address().port, store, status: snapshot, close: async () => {
      if (closed) return; closed = true;
      clearInterval(ticker);
      await new Promise(resolve => server.close(resolve));
      await broker.close();
      atomicJson(observationFile, observed);
      store.close(); unlock();
    } };
  } catch (error) {
    if (ticker) clearInterval(ticker);
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await broker?.close(); store?.close(); unlock(); throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.TANK_COORDINATOR_MODE !== 'remote-only') throw Error('TANK_COORDINATOR_MODE=remote-only is mandatory.');
  const credentials = process.env.CREDENTIALS_DIRECTORY;
  if (!credentials) throw Error('Start with systemd credentials; no implicit credential or local executor fallback.');
  const app = await startCoordinator({ directory: process.env.TANK_COORDINATOR_DATA,
    token: readFileSync(path.join(credentials, 'node-token'), 'utf8').trim(), operatorToken: readFileSync(path.join(credentials, 'operator-token'), 'utf8').trim(),
    expectedRuntime: process.env.TANK_EXPECTED_RUNTIME,
    web: process.env.TANK_PUBLIC_ORIGIN ? { origin: process.env.TANK_PUBLIC_ORIGIN,
      authUrl: 'http://127.0.0.1:5273/api/auth/me', authHost: 'api.arenaofbias.icu',
      secret: readFileSync(path.join(credentials, 'web-secret'), 'utf8').trim() } : null,
    port: Number(process.env.TANK_GATEWAY_PORT || 5474), brokerPort: Number(process.env.TANK_BROKER_PORT || 5473) });
  console.log(JSON.stringify({ service: 'tank-coordinator', mode: 'remote-only', environment: ENVIRONMENT, port: app.port }));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
