import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { failure } from './config.mjs';

const decompress = promisify(gunzip);
const initialized = new WeakSet();
const automaticOwner = 'system:automatic-s01';

// Additive read indexes live outside the frozen runner/store fingerprint. Old
// coordinators can still use the season after a rollback; no result is rewritten.
export function initializePublicReads(store) {
  const { db } = store;
  if (initialized.has(db)) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS public_matches_recent ON matches(created DESC);
      CREATE INDEX IF NOT EXISTS public_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS public_jobs_owner_recent ON jobs(owner,seq DESC);
      CREATE INDEX IF NOT EXISTS public_jobs_owner_kind_created ON jobs(owner,kind,created);
      CREATE INDEX IF NOT EXISTS public_jobs_owner_status ON jobs(owner,status,finished);
      CREATE INDEX IF NOT EXISTS public_batches_owner_created ON batches(owner,created);
      CREATE INDEX IF NOT EXISTS public_audit_owner ON audit(owner,action,created);
      CREATE INDEX IF NOT EXISTS public_auto_anchors ON audit(action,target,created);
      CREATE TABLE IF NOT EXISTS public_auto_job_owners(
        owner TEXT NOT NULL, seq INTEGER NOT NULL REFERENCES jobs(seq),
        PRIMARY KEY(owner,seq)
      ) WITHOUT ROWID;
      CREATE TRIGGER IF NOT EXISTS public_auto_job_insert AFTER INSERT ON jobs
        WHEN new.owner='system:automatic-s01' AND new.kind='match'
        BEGIN
          INSERT OR IGNORE INTO public_auto_job_owners(owner,seq)
          SELECT w.owner,new.seq FROM json_each(new.task,'$.versions') seat
            JOIN versions v ON v.id=seat.value JOIN works w ON w.id=v.work;
        END;
    `);
    if (
      !db
        .prepare("SELECT 1 FROM settings WHERE key='public:read-model-v1'")
        .get()
    ) {
      db.prepare(`INSERT OR IGNORE INTO public_auto_job_owners(owner,seq)
        SELECT w.owner,j.seq FROM jobs j JOIN json_each(j.task,'$.versions') seat
          JOIN versions v ON v.id=seat.value JOIN works w ON w.id=v.work
        WHERE j.owner=? AND j.kind='match'`).run(automaticOwner);
      db.prepare(
        "INSERT INTO settings VALUES('public:read-model-v1','1')",
      ).run();
    }
    db.exec('COMMIT');
    initialized.add(db);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function automaticJobsFor(store, owner) {
  return store.db
    .prepare(`SELECT j.id,j.kind,j.batch,j.status,j.issue,j.created,j.finished,1 AS automatic
    FROM public_auto_job_owners p JOIN jobs j ON j.seq=p.seq
    WHERE p.owner=? ORDER BY p.seq DESC LIMIT 80`)
    .all(owner);
}

function acceptsGzip(value) {
  // Explicit gzip;q=0 wins over a wildcard. Never encode a client that opted out.
  const encodings = String(value || '')
    .toLowerCase()
    .split(',')
    .map((item) => {
      const [name, ...parameters] = item.trim().split(';');
      const q = parameters
        .map((part) => /^\s*q\s*=\s*(\d+(?:\.\d+)?)\s*$/.exec(part))
        .find(Boolean);
      return { name, quality: q ? Number(q[1]) : 1 };
    });
  const gzip = encodings.find((item) => item.name === 'gzip');
  return (gzip || encodings.find((item) => item.name === '*'))?.quality > 0;
}

// Replays are already stored as gzip. Pass those bytes through to browsers;
// legacy clients decode on the worker pool rather than blocking the HTTP loop.
export async function sendPublicReplay(store, req, res, id) {
  const row = store.db.prepare('SELECT replay FROM matches WHERE id=?').get(id);
  if (!row) throw failure('回放不存在。', 404);
  const compressed = acceptsGzip(req.headers['accept-encoding']);
  const payload = compressed ? row.replay : await decompress(row.replay);
  res.setHeader('Vary', 'Origin, Accept-Encoding');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="tank-match.json"',
  );
  if (compressed) res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Length', payload.byteLength);
  res.end(payload);
}
