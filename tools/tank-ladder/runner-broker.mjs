import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { PROFILE, ENGINE_HASH, RUNTIME_HASH, LIMITS } from './config.mjs';

const manifest = { profile: PROFILE, engineHash: ENGINE_HASH, runtimeHash: RUNTIME_HASH };
export const RESULT_BYTES = 32 * 1024 * 1024;

// Private operator-only endpoint. Bind remains loopback: use SSH forwarding.
export async function startBroker(store, { token, port = 5473, slots = 2, leaseMs = 180000 } = {}) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) throw Error('计算节点密钥必须是随机生成的 64 位十六进制字符串。');
  if (!Number.isInteger(slots) || slots < 1 || slots > 8) throw Error('并发场数必须为 1–8。');
  const leases = new Map();
  const reclaim = lease => {
    store.db.prepare("UPDATE jobs SET status='queued' WHERE id=? AND status='running'").run(lease.job.id);
    leases.delete(lease.id);
  };
  const sweep = () => { for (const lease of leases.values()) if (lease.expires <= Date.now()) reclaim(lease); };
  const reply = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    try {
      const auth = req.headers.authorization || '';
      const expected = `Bearer ${token}`;
      if (req.headers.origin || Buffer.byteLength(auth) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) return reply(res, 403, { error: 'Unauthorized runner' });
      if (req.method !== 'POST' || !['/claim', '/complete'].includes(req.url)) return reply(res, 404, { error: 'Not found' });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(res, 415, { error: 'JSON required' });
      const max = req.url === '/claim' ? 4096 : RESULT_BYTES;
      if (Number(req.headers['content-length']) > max) return reply(res, 413, { error: 'Payload too large' });
      let size = 0; const chunks = [];
      for await (const part of req) { size += part.length; if (size > max) { reply(res, 413, { error: 'Payload too large' }); return; } chunks.push(part); }
      let input; try { input = JSON.parse(Buffer.concat(chunks)); } catch { return reply(res, 400, { error: 'Invalid JSON' }); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return reply(res, 400, { error: 'Invalid request' });
      sweep();
      if (req.url === '/claim') {
        if (Object.entries(manifest).some(([key, value]) => input[key] !== value)) return reply(res, 409, { error: 'Runner version mismatch' });
        if (leases.size >= slots) return reply(res, 200, { lease: null });
        const job = store.claim(); if (!job) return reply(res, 200, { lease: null });
        const lease = { id: randomBytes(32).toString('hex'), job, expires: Date.now() + leaseMs };
        leases.set(lease.id, lease);
        const payload = job.kind === 'validate' ? { kind: 'validate', source: store.source(job.task.version) }
          : { kind: 'match', task: job.task, sources: job.task.versions.map(id => store.source(id)) };
        return reply(res, 200, { lease: lease.id, expires: lease.expires, payload, timeout: job.kind === 'validate' ? 15000 : LIMITS.matchMs });
      }
      const lease = leases.get(input.lease);
      // A stale result cannot settle a re-assigned task, even after restart.
      if (!lease) return reply(res, 409, { error: 'Lease expired or already consumed' });
      const { job } = lease;
      if (typeof input.ok !== 'boolean') return reply(res, 400, { error: 'Invalid result' });
      if (!input.ok) {
        if (job.kind === 'validate') store.validate(job, '运行检查失败或超出计算预算。');
        else store.fail(job, '计算节点报告失败，本场未计分。');
      } else if (job.kind === 'validate') store.validate(job);
      else {
        const r = input.result;
        if (!r || !Array.isArray(r.frames) || !r.frames.length || r.frames.length > 10000 || !Array.isArray(r.ranking) || r.ranking.length !== 4
          || new Set(r.ranking.map(row => row.id)).size !== 4 || !r.ranking.every(row => ['A','B','C','D'].includes(row.id) && Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= 4 && Number.isFinite(row.points) && Number.isInteger(row.kills) && row.kills >= 0)
          || !Array.isArray(r.winners) || !r.winners.every(id => ['A','B','C','D'].includes(id))) return reply(res, 400, { error: 'Invalid replay' });
        try { store.settle(job, r); } catch { return reply(res, 400, { error: 'Replay does not match sealed task' }); }
      }
      leases.delete(lease.id);
      return reply(res, 200, { ok: true });
    } catch { if (!res.headersSent) reply(res, 500, { error: 'Runner request failed' }); else res.end(); }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxHeadersCount = 20;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const ticker = setInterval(sweep, 1000);
  return { port: server.address().port, close: async () => {
    clearInterval(ticker); await new Promise(resolve => server.close(resolve));
    for (const lease of [...leases.values()]) reclaim(lease);
  } };
}
