import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { MAPS, SIDES, PROFILE, ENGINE_HASH, RUNTIME_HASH } from './config.mjs';
import { assertPublicCapacity, assertMatchCapacity } from './public-api.mjs';
import { initializePublicReads, automaticJobsFor } from './public-reads.mjs';

export const AUTO_OWNER = 'system:automatic-s01';
const pending = "status IN ('queued','running','held')";

// Only sealed jobs are created here. The remote node remains the sole executor.
export function createAutoScheduler({ store, directory, enabled = false, online, now = Date.now }) {
  const { db } = store;
  initializePublicReads(store);
  const get = key => db.prepare('SELECT value FROM settings WHERE key=?').get(`auto:${key}`)?.value;
  const set = (key, value) => db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(`auto:${key}`, String(value));
  if (get('enabled') === undefined) set('enabled', enabled ? '1' : '0');
  let current = { enabled: get('enabled') === '1', state: 'waiting' };
  const state = (name, extra = {}) => (current = { enabled: get('enabled') === '1', state: name, ...extra });
  const pump = () => {
    if (get('enabled') !== '1') return state('paused');
    if (!online()) return state('offline');
    const autoPending = db.prepare(`SELECT count(*) n FROM jobs WHERE owner=? AND ${pending}`).get(AUTO_OWNER).n;
    if (autoPending) return state('playing', { remaining: autoPending });
    // User requests and code validation take precedence; never build an unbounded backlog.
    if (db.prepare(`SELECT count(*) n FROM jobs WHERE ${pending} AND status<>'held'`).get().n) return state('waiting');
    try { assertMatchCapacity(store, 12); }
    catch { return state('season-limit'); }
    const failed = db.prepare("SELECT max(finished) at FROM jobs WHERE owner=? AND status='failed'").get(AUTO_OWNER).at;
    if (failed && now() < failed + 300000) return state('cooldown', { nextAt: failed + 300000 });
    try { assertPublicCapacity(store, directory, 12); }
    catch { return state('capacity'); }
    const lastAnchors = new Map(db.prepare("SELECT target,max(created) at FROM audit WHERE action='auto-anchor' GROUP BY target").all().map(r => [r.target, r.at]));
    const entrants = store.rankings().map(p => ({ ...p, lastAnchor: lastAnchors.get(p.id) || 0, tie: randomInt(0, 0x7fffffff) }));
    if (new Set(entrants.map(p => p.owner)).size < 4) return state('entrants');
    entrants.sort((a, b) => a.games - b.games || a.lastAnchor - b.lastAnchor || a.tie - b.tie);
    const anchor = entrants[0], id = randomUUID(), created = now();
    // Credit planned appearances within this group so each map can include other underplayed bots.
    const planned = new Map();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO batches VALUES(?,?,?,12)').run(id, AUTO_OWNER, created);
      for (const map of MAPS) {
        const pool = entrants.filter(p => p.owner !== anchor.owner).map(p => ({ ...p, tie: randomInt(0, 0x7fffffff) }))
          .sort((a, b) => (a.games + (planned.get(a.id) || 0)) - (b.games + (planned.get(b.id) || 0)) || a.tie - b.tie);
        const picked = [anchor], owners = new Set([anchor.owner]);
        for (const p of pool) if (!owners.has(p.owner)) {
          picked.push(p); owners.add(p.owner); if (picked.length === 4) break;
        }
        const seed = randomBytes(4).readUInt32LE(), start = randomInt(4);
        for (let rotation = 0; rotation < 4; rotation++) {
          const task = { mapId: map.id, seed, versions: picked.map(p => p.id),
            seats: Object.fromEntries(SIDES.map((side, i) => [side, (i + rotation + start) % 4])),
            profile: PROFILE, engineHash: ENGINE_HASH, runtimeHash: RUNTIME_HASH };
          db.prepare('INSERT INTO jobs(id,kind,owner,batch,task,created) VALUES(?,?,?,?,?,?)')
            .run(randomUUID(), 'match', AUTO_OWNER, id, JSON.stringify(task), created);
        }
        for (const p of picked) planned.set(p.id, (planned.get(p.id) || 0) + 4);
      }
      db.prepare('INSERT INTO audit(created,owner,action,target) VALUES(?,?,?,?)').run(created, AUTO_OWNER, 'auto-anchor', anchor.id);
      set('lastBatch', id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return state('playing', { remaining: 12 });
  };
  return {
    pump: () => { try { return pump(); } catch { console.error('Automatic scheduling deferred; no partial batch committed.'); return state('error'); } },
    status: () => ({ ...current }),
    jobsFor: owner => [...store.jobs(owner), ...automaticJobsFor(store, owner)].sort((a, b) => b.created - a.created).slice(0, 80),
    control: action => {
      if (!['pause', 'resume'].includes(action)) throw Object.assign(Error('Unsupported automatic scheduling action'), { status: 400 });
      set('enabled', action === 'resume' ? '1' : '0');
      // Pausing stops future groups; already sealed matches finish normally.
      return state(action === 'resume' ? 'waiting' : 'paused');
    },
  };
}
