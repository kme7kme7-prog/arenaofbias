import { createHmac, timingSafeEqual } from 'node:crypto';
import { statfsSync, readFileSync } from 'node:fs';
import { MAPS, PROFILE, ENGINE_HASH, RUNTIME_HASH, LIMITS, failure } from './config.mjs';

export const PUBLIC_SEASON = 's01-i5-linux-quickjs';
export const PUBLIC_LIMITS = Object.freeze({ placements: 12, dailyUploads: 6, dailyMatches: 24, queue: 96 });
export const PUBLIC_MAX_MATCHES = 100000;
export const PUBLIC_MAX_DATABASE_BYTES = 6 * 1024 ** 3;
export const PUBLIC_MIN_FREE_BYTES = 4 * 1024 ** 3;
const safeRow = ({ owner: _owner, note: _note, issue: _issue, ...row }) => row;
const prefix = '/api/tank-ladder';

export function assertPublicCapacity(store, directory, added) {
  const pending = store.db.prepare("SELECT count(*) n FROM jobs WHERE status IN ('queued','running','held')").get().n;
  if (pending + added > PUBLIC_LIMITS.queue) throw failure('计算队列已满，请稍后再试。', 429);
  const pages = store.db.prepare('PRAGMA page_count').get().page_count;
  const pageSize = store.db.prepare('PRAGMA page_size').get().page_size;
  const free = statfsSync(directory);
  if (pages * pageSize >= PUBLIC_MAX_DATABASE_BYTES || free.bavail * free.bsize < PUBLIC_MIN_FREE_BYTES)
    throw failure('赛季存储保护已触发，暂缓新投稿和排赛；已有成绩仍可查看。', 503);
}

export function assertMatchCapacity(store, matches = 12) {
  if (store.counts().matches + matches > PUBLIC_MAX_MATCHES)
    throw failure('本赛季场次接近 10 万场上限，无法再安排完整的 12 场批次。', 429);
}

// Identity comes only from the existing website's authenticated session endpoint.
// No submitted JavaScript, evaluator or host API is imported by this module.
export function publicApi({ store, directory, secret, origin, authUrl, authHost, status, jobsFor = owner => store.jobs(owner) }) {
  if (!/^[a-f0-9]{64}$/.test(secret || '')) throw Error('Public CSRF signing key required');
  if (!/^https:\/\/[^/]+$/.test(origin) && !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('An exact browser origin is required');
  const endpoint = new URL(authUrl);
  if (endpoint.hostname !== '127.0.0.1' || endpoint.protocol !== 'http:') throw Error('Auth bridge must use a fixed loopback endpoint');
  const rates = new Map();
  let inFlight = 0;
  store.db.exec('CREATE INDEX IF NOT EXISTS public_audit_owner ON audit(owner,action,created); CREATE INDEX IF NOT EXISTS public_jobs_status ON jobs(status);');
  const rate = (key, limit) => {
    const now = Date.now();
    if (rates.size > 2000) for (const [k, v] of rates) if (v.until < now) rates.delete(k);
    if (!rates.has(key) && rates.size > 4000) throw failure('赛场繁忙，请稍后再试。', 429);
    let row = rates.get(key);
    if (!row || row.until < now) { row = { n: 0, until: now + 60000 }; rates.set(key, row); }
    if (++row.n > limit) throw failure('操作过于频繁，请稍后再试。', 429);
  };
  const identity = async req => {
    const cookies = (req.headers.cookie || '').split(';').map(s => s.trim()).filter(s => s.startsWith('__Host-sp_session='));
    if (!cookies.length) return null;
    if (cookies.length !== 1 || !/^__Host-sp_session=[a-zA-Z0-9_-]{20,256}$/.test(cookies[0])) throw failure('登录凭据无效，请重新登录。', 401);
    let result;
    try {
      const response = await fetch(authUrl, { headers: { Cookie: cookies[0], Host: authHost }, redirect: 'error', signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw Error('Auth unavailable');
      result = await response.json();
    } catch { throw failure('账号服务暂时不可用，请稍后重试。', 503); }
    const user = result.user;
    if (!user) return null;
    if (typeof user.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(user.id) || typeof user.username !== 'string') throw failure('账号校验失败。', 503);
    const owner = `site:${user.id}`;
    const csrf = createHmac('sha256', secret).update(`tank-ladder-v1\0${owner}\0${cookies[0]}`).digest('hex');
    return { owner, name: user.username.slice(0, 80), csrf };
  };
  const body = async req => {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw failure('只接受 JSON 提交。', 415);
    if (Number(req.headers['content-length']) > LIMITS.bodyBytes) throw failure('文件过大。', 413);
    const chunks = []; let bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > LIMITS.bodyBytes) throw failure('文件过大。', 413); chunks.push(chunk); }
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw failure('JSON 格式不正确。'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('提交格式不正确。');
    return input;
  };
  const capacity = added => assertPublicCapacity(store, directory, added);
  const json = (res, value, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  return async (req, res) => {
    if (!req.url.startsWith(`${prefix}/`)) return false;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Vary', 'Origin');
    let acquired = false;
    try {
      if (req.headers.origin && req.headers.origin !== origin) throw failure('访问来源不受支持。', 403);
      if (req.headers.origin === origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); }
      if (req.method === 'OPTIONS') {
        if (req.headers.origin !== origin) throw failure('访问来源不受支持。', 403);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
        res.writeHead(204); res.end(); return true;
      }
      if (!['GET', 'POST'].includes(req.method)) throw failure('不支持的请求方法。', 405);
      rate('all', 900); rate(`ip:${req.headers['x-real-ip'] || req.socket.remoteAddress}`, 180);
      if (inFlight >= 8) throw failure('赛场繁忙，请稍后再试。', 429);
      inFlight++; acquired = true;
      const route = new URL(req.url, origin).pathname.slice(prefix.length);
      const user = (req.method === 'POST' || ['/state', '/session'].includes(route)) ? await identity(req) : null;
      if (req.method === 'POST') {
        if (req.headers.origin !== origin) throw failure('提交来源不正确。', 403);
        if (!user) throw failure('请先登录主站账号。', 401);
        const supplied = String(req.headers['x-csrf-token'] || '');
        if (!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(user.csrf))) throw failure('登录状态已变化，请刷新重试。', 403);
        rate(`write:${user.owner}`, 20);
        const input = await body(req);
        if (route === '/versions') {
          capacity(1);
          if (store.db.prepare('SELECT count(*) n FROM versions').get().n >= 2000) throw failure('本赛季作品容量已满。', 503);
          const count = store.db.prepare("SELECT count(*) n FROM audit WHERE owner=? AND action='upload' AND created>?").get(user.owner, Date.now() - 86400000).n;
          if (count >= PUBLIC_LIMITS.dailyUploads) throw failure('过去 24 小时的 6 次上传额度已用完。', 429);
          if (store.db.prepare("SELECT count(*) n FROM jobs WHERE owner=? AND kind='validate' AND status IN ('queued','running')").get(user.owner).n >= 2) throw failure('你还有代码等待检查，请完成后再上传。', 429);
          store.db.prepare('INSERT INTO users VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run(user.owner, user.name);
          json(res, store.upload(user.owner, input), 201);
        } else if (route === '/activate') { store.activate(user.owner, input.id); json(res, { ok: true }); }
        else if (route === '/batches') {
          if (input.exhibition) throw failure('只能为自己的主力安排比赛。', 403);
          capacity(12);
          assertMatchCapacity(store, 12);
          const used = store.db.prepare('SELECT coalesce(sum(total),0) n FROM batches WHERE owner=? AND created>?').get(user.owner, Date.now() - 86400000).n;
          if (used + 12 > PUBLIC_LIMITS.dailyMatches) throw failure('过去 24 小时的 24 场排赛额度已用完。', 429);
          json(res, store.createBatch(user.owner, input.version, false), 201);
        } else if (route === '/queue') { store.control(user.owner, input.action); json(res, { ok: true }); }
        else throw failure('接口不存在。', 404);
      } else if (route === '/session') json(res, { user: user ? { name: user.name } : null, csrf: user?.csrf || '' });
      else if (route === '/state') json(res, { local: false, season: PUBLIC_SEASON, profile: PROFILE, engineHash: ENGINE_HASH, runtimeHash: RUNTIME_HASH,
        user: user ? { name: user.name } : null, csrf: user?.csrf || '', nodeOnline: status().nodeOnline, automatic: status().automatic, maps: MAPS, limits: PUBLIC_LIMITS,
        rankings: store.rankings().map(safeRow), matches: store.recent(), counts: store.counts(), mine: user ? store.myVersions(user.owner) : [], jobs: user ? jobsFor(user.owner) : [],
        limits: { ...PUBLIC_LIMITS, seasonMatches: PUBLIC_MAX_MATCHES } });
      else if (route === '/preview') { res.setHeader('Content-Type', 'application/json'); res.end(readFileSync(new URL('./public/preview.json', import.meta.url))); }
      else if (route === '/export') {
        res.setHeader('Content-Disposition', 'attachment; filename="tank-ladder-s01.json"');
        json(res, { schema: 'tank-ladder-export-v1', season: PUBLIC_SEASON, profile: PROFILE, engineHash: ENGINE_HASH, runtimeHash: RUNTIME_HASH,
          exportedAt: new Date().toISOString(), rankings: store.rankings().map(safeRow), recentMatches: store.recent(), scope: 'active versions and latest 60 matches; no source' });
      } else {
        const match = /^\/matches\/([a-zA-Z0-9-]{1,80})\/replay$/.exec(route);
        if (!match) throw failure('接口不存在。', 404);
        res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="tank-match.json"'); res.end(store.replay(match[1]));
      }
    } catch (error) { if (!res.headersSent) json(res, { error: error.status ? error.message : '服务暂时不可用，请稍后重试。' }, error.status || 503); else res.end(); }
    finally { if (acquired) inFlight--; }
    return true;
  };
}
