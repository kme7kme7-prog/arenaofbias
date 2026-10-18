import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { startCoordinator, ENVIRONMENT } from '../coordinator.mjs';
import { runOnce } from '../runner.mjs';
import { RUNTIME_HASH, PROFILE, ENGINE_HASH } from '../config.mjs';

const key = () => randomBytes(32).toString('hex');
const manifest = { runtimeHash: RUNTIME_HASH, profile: PROFILE, engineHash: ENGINE_HASH };
async function setup(overrides = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tank-coordinator-'));
  const token = key(), operatorToken = key();
  const options = { directory, token, operatorToken, expectedRuntime: RUNTIME_HASH, port: 0, brokerPort: 0, leaseMs: 300, ...overrides };
  const app = await startCoordinator(options), url = `http://127.0.0.1:${app.port}`;
  const call = (route, value, auth = token, extra = {}) => fetch(url + route, { method: value === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json', ...extra }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  return { directory, token, operatorToken, options, app, url, call };
}

test('production entry refuses missing keys, wrong runtime and old unmarked data', async () => {
  await assert.rejects(startCoordinator({}), /keys/);
  await assert.rejects(startCoordinator({ token: key(), operatorToken: key(), directory: os.tmpdir(), expectedRuntime: 'wrong' }), /fingerprint/);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tank-old-calibration-'));
  writeFileSync(path.join(directory, 'ladder.sqlite'), 'old');
  await assert.rejects(startCoordinator({ directory, token: key(), operatorToken: key(), expectedRuntime: RUNTIME_HASH }), /unmarked/);
  assert.equal(readFileSync(path.join(directory, 'ladder.sqlite'), 'utf8'), 'old');
});

test('gateway delivers and settles a real replay from the external runner', { timeout: 150000 }, async () => {
  const { app, call, url, token, operatorToken } = await setup({ leaseMs: 180000 });
  try {
    assert.equal((await call('/ops/trial', { action: 'prepare' }, operatorToken)).status, 200);
    assert.equal(await runOnce({ url, token }), true);
    assert.equal(await runOnce({ url, token }), true);
    const state = await (await call('/status')).json();
    assert.equal(state.counts.matches, 1);
    assert.deepEqual(state.trial.jobs, { completed: 1, queued: 11 });
    assert.equal(state.completions, 2);
    const match = app.store.recent()[0];
    assert(match.frames > 0);
    assert.equal(JSON.parse(app.store.replay(match.id)).meta.ladder.runtimeHash, RUNTIME_HASH);
    assert.equal(app.store.db.prepare('SELECT sum(games) n FROM ratings').get().n, 4);
  } finally { await app.close(); }
});

test('node cannot enqueue trials; offline jobs stay queued; legacy runner connects without changing fingerprint', { timeout: 60000 }, async () => {
  const { app, options, call, url, token, operatorToken } = await setup();
  try {
    await assert.rejects(startCoordinator(options), /already running/);
    assert.equal((await call('/status', undefined, key())).status, 403);
    assert.equal((await call('/status', undefined, token, { Origin: 'https://game.arenaofbias.icu' })).status, 403);
    assert.equal((await call('/ops/trial', { action: 'prepare' })).status, 403);
    assert.equal((await call('/api/versions', {})).status, 404);
    assert.equal((await call('/claim', { ...manifest, runtimeHash: 'wrong' })).status, 409);
    assert.equal((await call('/claim', { x: 'x'.repeat(5000) })).status, 413);
    const first = await (await call('/ops/trial', { action: 'prepare' }, operatorToken)).json();
    const second = await (await call('/ops/trial', { action: 'prepare' }, operatorToken)).json();
    assert.deepEqual(first, second);
    await delay(900);
    assert.deepEqual(app.store.counts(), { matches: 0, queued: 1, running: 0 });
    assert.equal(app.status().nodeOnline, false);
    // Execute only on this developer test machine, never on the production server.
    assert.equal(await runOnce({ url, token }), true);
    const state = await (await call('/status')).json();
    assert.equal(state.mode, 'remote-only'); assert.equal(state.environment, ENVIRONMENT);
    assert.equal(state.nodeOnline, true); assert.equal(state.trial.probe.status, 'ready');
    assert.deepEqual(state.trial.jobs, { queued: 12 });
    const tasks = app.store.db.prepare("SELECT task FROM jobs WHERE kind='match'").all().map(row => JSON.parse(row.task));
    assert.equal(new Set(tasks.map(row => row.mapId)).size, 3);
    assert(tasks.every(task => task.versions.every(id => id.startsWith('official-'))));
    const lease = await (await call('/claim', manifest)).json();
    assert(lease.lease);
    await delay(350);
    const replacement = await (await call('/claim', manifest)).json();
    assert.notEqual(replacement.lease, lease.lease);
    assert.equal((await call('/complete', { lease: lease.lease, ok: true })).status, 409);
    assert.equal((await call('/complete', { lease: replacement.lease, ok: false })).status, 200);
    assert.equal((await call('/complete', { lease: replacement.lease, ok: false })).status, 409);
    await app.close();
    const restored = await startCoordinator(options);
    try {
      assert.equal(restored.status().trial.batch, state.trial.batch);
      assert.equal(restored.status().trial.jobs.failed, 1);
      assert.equal(restored.status().trial.jobs.queued, 11);
      assert.equal(restored.store.counts().matches, 0);
    } finally { await restored.close(); }
  } finally { await app.close(); }
});
