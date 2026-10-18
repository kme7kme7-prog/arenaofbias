import http from 'node:http';
import path from 'node:path';
import { readFileSync, mkdirSync, openSync, closeSync, writeFileSync, unlinkSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { HERE, ROOT, MAPS, LIMITS, PROFILE, ENGINE_HASH, RUNTIME_HASH, failure } from './config.mjs';
import { openStore } from './store.mjs';
import { execute } from './executor.mjs';
import { startBroker } from './runner-broker.mjs';
import { createBrawl, snapshotBrawl } from '../../app/tanks/engine/core/brawl.js';

export async function startServer({ port = Number(process.env.TANK_LADDER_PORT || 5472), directory = process.env.TANK_LADDER_DATA || path.join(ROOT, '.local/tank-ladder'),
  runner = process.env.TANK_RUNNER_TOKEN_FILE ? { token: readFileSync(process.env.TANK_RUNNER_TOKEN_FILE, 'utf8').trim(), port: Number(process.env.TANK_RUNNER_PORT || 5473), slots: Number(process.env.TANK_RUNNER_SLOTS || 2) } : null,
  compute = !runner } = {}) {
  if (runner && compute) throw Error('远程计算与本地计算不能同时启用。');
  // This preview intentionally has no public bind switch. Production needs the
  // existing site's identity adapter and an isolated runner host first.
  mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, '.lock');
  try {
    const old = JSON.parse(readFileSync(lock, 'utf8'));
    try { process.kill(old.pid, 0); throw Error(`这个数据目录已在使用（进程 ${old.pid}）。`); }
    catch (e) { if (e.code !== 'ESRCH') throw e; }
    unlinkSync(lock);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const fd = openSync(lock, 'wx'); writeFileSync(fd, JSON.stringify({ pid: process.pid })); closeSync(fd);
  let store;
  try { store = openStore(directory); store.bootstrap(); } catch (e) { store?.close(); unlinkSync(lock); throw e; }
  let running = false, stopped = false, currentController;
  const pump = async () => {
    if (running || stopped || !compute) return;
    const job = store.claim(); if (!job) return;
    running = true; currentController = new AbortController();
    try {
      if (job.kind === 'validate') {
        await execute({ kind: 'validate', source: store.source(job.task.version) }, { signal: currentController.signal, timeout: 15000 });
        store.validate(job);
      } else {
        const replay = await execute({ kind: 'match', task: job.task, sources: job.task.versions.map(id => store.source(id)) }, { signal: currentController.signal });
        store.settle(job, replay);
      }
    } catch (e) {
      if (!stopped) {
        if (job.kind === 'validate') store.validate(job, e.message);
        else store.fail(job, e.message);
      }
    } finally { running = false; if (!stopped) setImmediate(pump); }
  };
  const files = new Map([
    ['/', ['public/index.html', 'text/html; charset=utf-8']],
    ['/ui.js', ['public/ui.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
    ['/starter.js', ['public/starter.js', 'text/javascript; charset=utf-8']],
    ['/render.mjs', [path.join(ROOT, 'app/tanks/render.mjs'), 'text/javascript; charset=utf-8']],
    ['/presentation.mjs', [path.join(ROOT, 'app/tanks/presentation.mjs'), 'text/javascript; charset=utf-8']],
  ]);
  const requests = new Map();
  const rateLimit = (key, max) => {
    const now = Date.now(); let r = requests.get(key);
    if (!r || now - r.start > 60000) { r = { start: now, n: 0 }; requests.set(key, r); }
    if (++r.n > max) throw failure('操作过于频繁，请一分钟后再试。', 429);
    if (requests.size > 500) for (const [k, v] of requests) if (now - v.start > 60000) requests.delete(k);
  };
  const json = (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  const body = async req => {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw failure('只接受 JSON 提交。', 415);
    if (Number(req.headers['content-length']) > LIMITS.bodyBytes) throw failure('文件过大。', 413);
    const chunks = []; let bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > LIMITS.bodyBytes) throw failure('文件过大。', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw failure('JSON 格式不正确。'); }
  };
  let actualPort = port;
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try {
      const origin = `http://127.0.0.1:${actualPort}`;
      if (req.headers.host !== `127.0.0.1:${actualPort}` && req.headers.host !== `localhost:${actualPort}`) throw failure('访问地址不受支持。', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw failure('跨站访问被拒绝。', 403);
      const url = new URL(req.url, origin);
      if (!['GET', 'POST'].includes(req.method)) throw failure('不支持的请求方法。', 405);
      const token = /(?:^|;\s*)ladder_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      let session = store.session(token);
      if (req.method === 'POST') {
        if (![origin, `http://localhost:${actualPort}`].includes(req.headers.origin)) throw failure('提交来源不正确。', 403);
        rateLimit(session?.owner || req.socket.remoteAddress, 40);
        if (url.pathname !== '/api/session') {
          if (!session) throw failure('请刷新页面建立本地试玩身份。', 401);
          const supplied = String(req.headers['x-csrf-token'] || '');
          if (!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(session.csrf))) throw failure('请求校验失败，请刷新页面。', 403);
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/session') {
        await body(req);
        if (!session) {
          rateLimit('new-sessions', 10); const created = store.createSession(); session = created;
          res.setHeader('Set-Cookie', `ladder_session=${created.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
        }
        return json(res, { owner: session.owner, name: session.name, csrf: session.csrf });
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, {
        local: true, profile: PROFILE, engineHash: ENGINE_HASH, runtimeHash: RUNTIME_HASH, maps: MAPS, limits: { placements: LIMITS.placements, dailyMatches: LIMITS.dailyMatches, dailyUploads: LIMITS.dailyUploads },
        rankings: store.rankings(), matches: store.recent(), counts: store.counts(), mine: session ? store.myVersions(session.owner) : [], jobs: session ? store.jobs(session.owner) : [],
      });
      if (req.method === 'GET' && url.pathname === '/api/preview') return json(res, { frames: [snapshotBrawl(createBrawl('crossroads', 2))], events: [] });
      if (req.method === 'POST' && url.pathname === '/api/versions') { const result = store.upload(session.owner, await body(req)); void pump(); return json(res, result, 201); }
      if (req.method === 'POST' && url.pathname === '/api/activate') { const input = await body(req); store.activate(session.owner, input.id); return json(res, { ok: true }); }
      if (req.method === 'POST' && url.pathname === '/api/batches') {
        const input = await body(req); const result = store.createBatch(session.owner, input.version, input.exhibition === true); void pump(); return json(res, result, 201);
      }
      if (req.method === 'POST' && url.pathname === '/api/queue') { const input = await body(req); store.control(session.owner, input.action); void pump(); return json(res, { ok: true }); }
      const replay = /^\/api\/matches\/([a-zA-Z0-9-]{1,80})\/replay$/.exec(url.pathname);
      if (req.method === 'GET' && replay) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(store.replay(replay[1])); }
      if (req.method === 'GET' && url.pathname === '/api/export') {
        res.setHeader('Content-Disposition', 'attachment; filename="tank-ladder-local.json"');
        return json(res, { schema: 'tank-ladder-export-v1', profile: PROFILE, engineHash: ENGINE_HASH, runtimeHash: RUNTIME_HASH, exportedAt: new Date().toISOString(), rankings: store.rankings(), recentMatches: store.recent(), scope: 'active versions and latest 60 matches; no source' });
      }
      const entry = files.get(url.pathname);
      if (req.method === 'GET' && entry) {
        const [file, type] = entry; res.setHeader('Content-Type', type);
        if (url.pathname === '/starter.js') res.setHeader('Content-Disposition', 'attachment; filename="bot.js"');
        return res.end(readFileSync(path.resolve(HERE, file)));
      }
      throw failure('页面或接口不存在。', 404);
    } catch (error) {
      if (!res.headersSent) json(res, { error: error.status ? error.message : '服务处理失败，原有结果已保留。' }, error.status || 500);
      else res.end();
      if (!error.status) console.error(error);
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
  catch (error) { stopped = true; store.close(); unlinkSync(lock); throw error; }
  actualPort = server.address().port;
  let broker;
  try { if (runner) broker = await startBroker(store, runner); }
  catch (error) { await new Promise(resolve => server.close(resolve)); store.close(); unlinkSync(lock); throw error; }
  const ticker = setInterval(pump, 750);
  const close = async () => {
    if (stopped) return; stopped = true; clearInterval(ticker); currentController?.abort();
    await new Promise(resolve => server.close(resolve));
    await broker?.close();
    while (running) await new Promise(resolve => setTimeout(resolve, 20));
    store.close(); unlinkSync(lock);
  };
  return { port: actualPort, runnerPort: broker?.port, store, close, pump };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await startServer();
  console.log(`坦克排位 · 本地试赛 http://127.0.0.1:${app.port}`);
  process.once('SIGINT', async () => { await app.close(); process.exit(0); });
  process.once('SIGTERM', async () => { await app.close(); process.exit(0); });
}
