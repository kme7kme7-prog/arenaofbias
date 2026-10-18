import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../server.mjs';
import { runOnce } from '../runner.mjs';
import { openStore } from '../store.mjs';
import { PROFILE, ENGINE_HASH, RUNTIME_HASH } from '../config.mjs';

const profile = { profile: PROFILE, engineHash: ENGINE_HASH, runtimeHash: RUNTIME_HASH };
const source = 'function decide(){return {move:"stay",fire:true}}';
async function setup(options = {}) {
  const token = randomBytes(32).toString('hex');
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ladder-runner-'));
  const app = await startServer({ port: 0, directory, runner: { token, port: 0, ...options } });
  const url = `http://127.0.0.1:${app.runnerPort}`;
  const call = (route, value, headers = {}) => fetch(url + route, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });
  return { app, token, url, call, directory };
}
test('private runner requires key, rejects browser origin, profile mismatch and expired leases', async () => {
  const { app, call } = await setup({ leaseMs: 50, slots: 1 });
  try {
    const owner = app.store.createSession().owner;
    const version = app.store.upload(owner, { name: 'Test', model: 'Test', source });
    assert.equal((await call('/claim', profile, { Authorization: 'Bearer wrong' })).status, 403);
    assert.equal((await call('/claim', profile, { Origin: 'https://bad.example' })).status, 403);
    assert.equal((await call('/claim', {})).status, 409);
    const first = await (await call('/claim', profile)).json();
    assert(first.lease); assert.equal(first.payload.source, source);
    assert.equal((await (await call('/claim', profile)).json()).lease, null);
    await delay(65);
    const second = await (await call('/claim', profile)).json();
    assert.notEqual(second.lease, first.lease);
    assert.equal((await call('/complete', { lease: first.lease, ok: true })).status, 409);
    assert.equal(app.store.getVersion(version.id).status, 'checking');
    assert.equal((await call('/complete', { lease: second.lease, ok: true })).status, 200);
    assert.equal((await call('/complete', { lease: second.lease, ok: true })).status, 409);
    assert.equal(app.store.getVersion(version.id).status, 'ready');
  } finally { await app.close(); }
});
test('remote runner validates in child process and completes a real sealed match exactly once', { timeout: 150000 }, async () => {
  const { app, call, url, token, directory } = await setup();
  try {
    const owner = app.store.createSession().owner;
    const version = app.store.upload(owner, { name: 'Test', model: 'Test', source });
    assert.equal(await runOnce({ url, token }), true);
    assert.equal(app.store.getVersion(version.id).status, 'ready');
    app.store.createBatch(owner, version.id);
    const lease = await (await call('/claim', profile)).json();
    assert.equal((await call('/complete', { lease: lease.lease, ok: true, result: {} })).status, 400);
    // Report a failed match, then compute the next real task through the client.
    assert.equal((await call('/complete', { lease: lease.lease, ok: false })).status, 200);
    assert.equal(await runOnce({ url, token }), true);
    const matches = app.store.recent();
    assert.equal(matches.length, 1);
    assert(matches[0].frames > 0);
    assert.equal(matches[0].rows.length, 4);
    assert.equal(app.store.db.prepare('SELECT SUM(games) AS n FROM ratings').get().n, 4);
    const outstanding = await (await call('/claim', profile)).json();
    assert(outstanding.lease);
    // Graceful coordinator shutdown returns its outstanding task to the queue.
    await app.close();
    const restored = openStore(directory);
    try {
      assert.equal(restored.counts().running, 0);
      assert.equal(restored.recent().length, 1);
      assert.equal(restored.claim().kind, 'match');
    } finally { restored.close(); }
  } finally { await app.close(); }
});
