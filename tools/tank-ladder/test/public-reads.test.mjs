import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../store.mjs';
import { initializePublicReads, automaticJobsFor } from '../public-reads.mjs';
import { startCoordinator } from '../coordinator.mjs';
import { RUNTIME_HASH } from '../config.mjs';
import { AUTO_OWNER } from '../auto-scheduler.mjs';

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tank-public-reads-'));
  const store = openStore(directory);
  store.bootstrap();
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, store };
}

test('read migration backfills exact owners, indexes history, stays atomic and survives restart', (t) => {
  const { directory, store } = fixture(t),
    { db } = store;
  const entrants = store.rankings().slice(0, 4);
  const insert = db.prepare(
    "INSERT INTO jobs(id,kind,owner,task,status,created) VALUES(?,'match',?,?,'completed',?)",
  );
  const task = JSON.stringify({ versions: entrants.map((row) => row.id) });
  db.exec('BEGIN');
  for (let i = 0; i < 2000; i++)
    insert.run(`historic-${i}`, AUTO_OWNER, task, i);
  insert.run('manual', entrants[0].owner, task, 2001);
  db.exec('COMMIT');
  initializePublicReads(store);
  const expected =
    db.prepare(`SELECT j.id FROM jobs j WHERE j.owner=? AND EXISTS (
    SELECT 1 FROM json_each(j.task,'$.versions') seat JOIN versions v ON v.id=seat.value
      JOIN works w ON w.id=v.work WHERE w.owner=?) ORDER BY j.seq DESC LIMIT 80`);
  for (const entrant of entrants) {
    const rows = automaticJobsFor(store, entrant.owner);
    assert.deepEqual(
      rows.map((row) => row.id),
      expected.all(AUTO_OWNER, entrant.owner).map((row) => row.id),
    );
    assert(
      rows.every(
        (row) => row.automatic === 1 && !('task' in row) && !('source' in row),
      ),
    );
  }
  assert.deepEqual(automaticJobsFor(store, 'site:unrelated'), []);
  assert.equal(
    db.prepare('SELECT count(*) n FROM public_auto_job_owners').get().n,
    8000,
  );
  db.exec('BEGIN');
  insert.run('rolled-back', AUTO_OWNER, task, 2002);
  db.exec('ROLLBACK');
  assert.equal(
    db.prepare('SELECT count(*) n FROM public_auto_job_owners').get().n,
    8000,
  );
  insert.run('new-auto', AUTO_OWNER, task, 2003);
  assert.equal(automaticJobsFor(store, entrants[0].owner)[0].id, 'new-auto');
  initializePublicReads(store);
  assert.equal(
    db.prepare('SELECT count(*) n FROM public_auto_job_owners').get().n,
    8004,
  );
  const plan = (sql) =>
    db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all()
      .map((row) => row.detail)
      .join('\n');
  assert.match(
    plan('SELECT summary FROM matches ORDER BY created DESC LIMIT 60'),
    /USING INDEX public_matches_recent/,
  );
  assert.doesNotMatch(
    plan(
      "SELECT j.id FROM public_auto_job_owners p JOIN jobs j ON j.seq=p.seq WHERE p.owner='missing' ORDER BY p.seq DESC LIMIT 80",
    ),
    /SCAN|TEMP B-TREE/,
  );
  // A separate connection models restart, without rebuilding the projection.
  const restarted = openStore(directory);
  try {
    initializePublicReads(restarted);
    assert.equal(
      automaticJobsFor(restarted, entrants[0].owner)[0].id,
      'new-auto',
    );
  } finally {
    restarted.close();
  }
});

test('failed read migration rolls back its indexes and marker without changing match jobs', (t) => {
  const { store } = fixture(t),
    { db } = store;
  const version = store.rankings()[0];
  db.prepare(
    "INSERT INTO jobs(id,kind,owner,task,created) VALUES('existing','match',?,?,1)",
  ).run(AUTO_OWNER, JSON.stringify({ versions: [version.id] }));
  db.exec(`CREATE TABLE public_auto_job_owners(owner TEXT,seq INTEGER,PRIMARY KEY(owner,seq)) WITHOUT ROWID;
    CREATE TRIGGER reject_projection BEFORE INSERT ON public_auto_job_owners BEGIN SELECT RAISE(ABORT,'fixture'); END;`);
  assert.throws(() => initializePublicReads(store), /fixture/);
  assert.equal(
    db.prepare("SELECT 1 FROM settings WHERE key='public:read-model-v1'").get(),
    undefined,
  );
  assert.equal(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE name='public_matches_recent'")
      .get(),
    undefined,
  );
  assert.equal(db.prepare('SELECT count(*) n FROM jobs').get().n, 1);
  db.exec('DROP TRIGGER reject_projection');
  initializePublicReads(store);
  assert.equal(automaticJobsFor(store, version.owner).length, 1);
});

test('public replay negotiates stored gzip, respects opt-out and retains CORS and missing replay errors', async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tank-public-replay-'));
  const auth = http.createServer((_req, res) => res.end('{"user":null}'));
  await new Promise((resolve) => auth.listen(0, '127.0.0.1', resolve));
  const origin = 'https://game.arenaofbias.icu';
  const app = await startCoordinator({
    directory,
    token: 'a'.repeat(64),
    operatorToken: 'b'.repeat(64),
    expectedRuntime: RUNTIME_HASH,
    port: 0,
    brokerPort: 0,
    web: {
      secret: 'c'.repeat(64),
      origin,
      authUrl: `http://127.0.0.1:${auth.address().port}/api/auth/me`,
      authHost: 'api.arenaofbias.icu',
    },
  });
  t.after(async () => {
    await app.close();
    await new Promise((resolve) => auth.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });
  const replay = Buffer.from(
    JSON.stringify({
      frames: Array.from({ length: 2000 }, (_, tick) => ({
        tick,
        cells: 'fixture'.repeat(200),
      })),
    }),
  );
  const zipped = gzipSync(replay);
  app.store.db
    .prepare(
      "INSERT INTO matches VALUES('fixture','fixture',1,'crossroads',1,'{}',?)",
    )
    .run(zipped);
  const request = (id, encoding, from = origin) =>
    new Promise((resolve, reject) => {
      http
        .get(
          `http://127.0.0.1:${app.port}/api/tank-ladder/matches/${id}/replay`,
          { headers: { Origin: from, 'Accept-Encoding': encoding } },
          (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () =>
              resolve({
                status: res.statusCode,
                headers: res.headers,
                data: Buffer.concat(chunks),
              }),
            );
          },
        )
        .on('error', reject);
    });
  for (const encoding of ['gzip', 'br, gzip;q=0.8', '*']) {
    const result = await request('fixture', encoding);
    assert.equal(result.status, 200);
    assert.equal(result.headers['content-encoding'], 'gzip');
    assert.deepEqual(result.data, zipped);
    assert.deepEqual(gunzipSync(result.data), replay);
    assert.equal(result.headers['access-control-allow-origin'], origin);
    assert.match(result.headers.vary, /Accept-Encoding/);
  }
  for (const encoding of ['identity', 'gzip;q=0, *;q=1', 'br']) {
    const result = await request('fixture', encoding);
    assert.equal(result.status, 200);
    assert.equal(result.headers['content-encoding'], undefined);
    assert.deepEqual(result.data, replay);
  }
  assert.equal((await request('missing', 'gzip')).status, 404);
  assert.equal(
    (await request('fixture', 'gzip', 'https://evil.example')).status,
    403,
  );
});
