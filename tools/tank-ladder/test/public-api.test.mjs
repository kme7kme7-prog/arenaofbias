import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { startCoordinator } from '../coordinator.mjs';
import { RUNTIME_HASH } from '../config.mjs';

test('public accounts, private source, CSRF, quota and remote-only queue', async () => {
  let revoked = false, unavailable = false;
  const auth = http.createServer((req, res) => {
    if (unavailable) { res.writeHead(503); return res.end(); }
    const id = req.headers.cookie?.includes('a'.repeat(64)) ? 'alice' : 'bob';
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ user: revoked ? null : { id, username: id } }));
  });
  await new Promise(resolve => auth.listen(0, '127.0.0.1', resolve));
  const key = () => randomBytes(32).toString('hex'), origin = 'https://game.arenaofbias.icu';
  const operatorToken = key(), token = key();
  const app = await startCoordinator({ directory: mkdtempSync(path.join(os.tmpdir(), 'tank-public-')), token, operatorToken,
    expectedRuntime: RUNTIME_HASH, port: 0, brokerPort: 0, web: { secret: key(), origin, authUrl: `http://127.0.0.1:${auth.address().port}/api/auth/me`, authHost: 'api.arenaofbias.icu' } });
  const url = `http://127.0.0.1:${app.port}/api/tank-ladder`;
  const call = (route, input, user = '', csrf = '', extra = {}) => fetch(url + route, { method: input === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, ...(user ? { Cookie: `__Host-sp_session=${user.repeat(64)}` } : {}), 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...extra },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  try {
    const anon = await (await call('/state')).json(); assert.equal(anon.user, null); assert.deepEqual(anon.mine, []); assert.equal(anon.rankings.length, 22);
    assert(!JSON.stringify(anon).includes('source')); assert(!JSON.stringify(anon.rankings).includes('owner'));
    assert.equal((await call('/versions', {})).status, 401);
    const a = await (await call('/session', undefined, 'a')).json(), b = await (await call('/session', undefined, 'b')).json();
    assert(a.csrf && b.csrf && a.csrf !== b.csrf);
    assert.equal((await call('/versions', {}, 'a', b.csrf)).status, 403);
    assert.equal((await call('/versions', {}, 'a', a.csrf, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await call('/versions', {}, 'a', a.csrf, { Cookie: `__Host-sp_session=${'a'.repeat(64)}; __Host-sp_session=${'b'.repeat(64)}` })).status, 401);
    const source = 'function decide(){/* PRIVATE_SENTINEL */ return {move:"stay",fire:true}}';
    const payload = { name: 'Public QA', model: 'Neutral', effort: 'default', source };
    const uploaded = await call('/versions', payload, 'a', a.csrf); assert.equal(uploaded.status, 201);
    const version = await uploaded.json();
    assert.equal((await call('/versions', { ...payload, workId: version.work }, 'b', b.csrf)).status, 404);
    assert.equal((await call('/activate', { id: version.id }, 'b', b.csrf)).status, 404);
    assert.equal((await call('/batches', { version: anon.rankings[0].id, exhibition: true }, 'a', a.csrf)).status, 403);
    const mine = await (await call('/state', undefined, 'a')).json(); assert.equal(mine.mine.length, 1); assert.equal(mine.jobs[0].status, 'queued');
    assert.equal((await (await call('/state', undefined, 'b')).json()).mine.length, 0);
    assert.equal(app.status().counts.running || 0, 0); assert.equal(app.status().counts.matches, 0);
    for (const route of ['/state', '/export', '/preview']) { const response = await call(route, undefined, 'a'); assert.equal(response.status, 200); assert(!(await response.text()).includes('PRIVATE_SENTINEL')); }
    assert.equal((await call('/source/' + version.id)).status, 404);
    const operator = await fetch(`http://127.0.0.1:${app.port}/ops/trial`, { method:'POST', headers:{Authorization:`Bearer ${operatorToken}`,'Content-Type':'application/json'},body:'{"action":"prepare"}' });
    assert.equal(operator.status, 403);
    const autoControl = (action, bearer, extra = {}) => fetch(`http://127.0.0.1:${app.port}/ops/automatic`, {
      method:'POST', headers:{ Authorization:`Bearer ${bearer}`, 'Content-Type':'application/json', ...extra }, body:JSON.stringify({ action }) });
    assert.equal((await autoControl('resume', token)).status, 403);
    assert.equal((await autoControl('resume', operatorToken, { Origin: origin })).status, 403);
    assert.equal((await autoControl('delete', operatorToken)).status, 400);
    assert.equal((await (await autoControl('resume', operatorToken)).json()).enabled, true);
    assert.equal((await (await call('/state')).json()).automatic.enabled, true);
    assert.equal((await (await autoControl('pause', operatorToken)).json()).state, 'paused');
    assert.equal((await call('/versions', { ...payload, source: 'a'.repeat(300001) }, 'a', a.csrf)).status, 413);
    // Ready is a fixture here; no evaluator is present in the web coordinator.
    app.store.db.prepare("UPDATE versions SET status='ready' WHERE id=?").run(version.id); app.store.activate('site:alice', version.id);
    const batch = await call('/batches', { version: version.id }, 'a', a.csrf); assert.equal(batch.status, 201);
    assert.equal((await call('/batches', { version: version.id }, 'b', b.csrf)).status, 403);
    await call('/queue', { action: 'cancel' }, 'a', a.csrf);
    assert.equal((await call('/batches', { version: version.id }, 'a', a.csrf)).status, 201);
    await call('/queue', { action: 'cancel' }, 'a', a.csrf);
    assert.equal((await call('/batches', { version: version.id }, 'a', a.csrf)).status, 429);
    revoked = true; assert.equal((await call('/activate', { id: version.id }, 'a', a.csrf)).status, 401);
    unavailable = true; assert.equal((await call('/state', undefined, 'a')).status, 503);
  } finally { await app.close(); await new Promise(resolve => auth.close(resolve)); }
});
