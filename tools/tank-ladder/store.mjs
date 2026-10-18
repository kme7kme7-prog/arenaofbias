import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, randomInt } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { ROOT, MAPS, SIDES, SEASON, PROFILE, ENGINE_HASH, RUNTIME_HASH, LIMITS, sha, metadata, failure } from './config.mjs';
import { skill, updateRatings } from './rating.mjs';

export function openStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'ladder.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,owner TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS works(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,official INTEGER NOT NULL DEFAULT 0,active TEXT,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,work TEXT NOT NULL REFERENCES works(id),number INTEGER NOT NULL,model TEXT NOT NULL,effort TEXT NOT NULL,note TEXT NOT NULL,
      sha TEXT NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL,issue TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL,UNIQUE(work,number));
    CREATE TABLE IF NOT EXISTS ratings(version TEXT PRIMARY KEY REFERENCES versions(id),mu REAL NOT NULL DEFAULT 25,sigma REAL NOT NULL DEFAULT 8.333333333333334,
      games INTEGER NOT NULL DEFAULT 0,wins REAL NOT NULL DEFAULT 0,points REAL NOT NULL DEFAULT 0,kills INTEGER NOT NULL DEFAULT 0,faults INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY,owner TEXT NOT NULL,created INTEGER NOT NULL,total INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,owner TEXT NOT NULL,batch TEXT,
      task TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',issue TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL,finished INTEGER);
    CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,job TEXT NOT NULL UNIQUE,created INTEGER NOT NULL,map TEXT NOT NULL,seed INTEGER NOT NULL,summary TEXT NOT NULL,replay BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,created INTEGER NOT NULL,owner TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL);`);
  const profile = `${SEASON}:${PROFILE}:${ENGINE_HASH}:${RUNTIME_HASH}`;
  const saved = db.prepare("SELECT value FROM settings WHERE key='profile'").get()?.value;
  if (saved && saved !== profile) { db.close(); throw Error('规则或执行器版本已改变，请使用新的试赛数据目录，不能混算旧成绩。'); }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS one_active_per_owner ON works(owner) WHERE official=0 AND active IS NOT NULL');
  db.prepare("INSERT OR IGNORE INTO settings VALUES('profile',?)").run(profile);
  db.prepare("UPDATE jobs SET status='queued' WHERE status='running'").run();
  const tx = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const audit = (owner, action, target) => db.prepare('INSERT INTO audit(created,owner,action,target) VALUES(?,?,?,?)').run(Date.now(), owner, action, target);
  const ownerWork = (owner, id) => {
    const work = db.prepare('SELECT * FROM works WHERE id=? AND owner=? AND official=0').get(id, owner);
    if (!work) throw failure('找不到你的这件作品。', 404);
    return work;
  };
  const queue = (kind, owner, task, batch = null) => {
    const id = randomUUID();
    db.prepare('INSERT INTO jobs(id,kind,owner,batch,task,created) VALUES(?,?,?,?,?,?)').run(id, kind, owner, batch, JSON.stringify(task), Date.now());
    return id;
  };
  const publicRow = row => {
    const { source: _source, ...safe } = row;
    return { ...safe, rating: skill(row), winRate: row.games ? row.wins / row.games : 0,
      avgPoints: row.games ? row.points / row.games : 0, avgKills: row.games ? row.kills / row.games : 0,
      provisional: row.games < LIMITS.placements };
  };
  const select = `SELECT v.id,v.work,v.number,v.model,v.effort,v.note,v.sha,v.status,v.issue,v.created,w.name,w.owner,w.official,w.active,
    r.mu,r.sigma,r.games,r.wins,r.points,r.kills,r.faults FROM versions v JOIN works w ON w.id=v.work JOIN ratings r ON r.version=v.id`;
  const store = {
    db,
    bootstrap() {
      const registry = JSON.parse(readFileSync(path.join(ROOT, 'app/tanks/provenance.json'), 'utf8'));
      tx(() => {
        for (const bot of registry.bots) {
          const source = readFileSync(path.join(ROOT, 'app/tanks/bots', `${bot.id}.js`), 'utf8');
          if (sha(source) !== bot.sha256) throw Error('现有作品哈希校验失败');
          const work = `official-${bot.id}`, version = `${work}-v1`;
          const existing = db.prepare('SELECT sha FROM versions WHERE id=?').get(version);
          if (existing && existing.sha !== bot.sha256) throw Error('现有作品已更新，需使用新赛季或显式导入新版本。');
          db.prepare('INSERT OR IGNORE INTO works VALUES(?,?,?,?,?,?)').run(work, work, bot.name, 1, version, Date.now());
          db.prepare(`INSERT OR IGNORE INTO versions(id,work,number,model,effort,note,sha,source,status,created) VALUES(?,?,1,?,?,?,?,?,'ready',?)`)
            .run(version, work, bot.model, bot.reasoningEffort || 'default', '现有坦克库 · 本地试赛', bot.sha256, source, Date.now());
          db.prepare('INSERT OR IGNORE INTO ratings(version) VALUES(?)').run(version);
        }
      });
    },
    session(token) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
      return db.prepare('SELECT s.owner,s.csrf,u.name FROM sessions s JOIN users u ON u.id=s.owner WHERE hash=? AND expires>?').get(sha(token), Date.now()) || null;
    },
    createSession() {
      db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
      if (db.prepare('SELECT count(*) n FROM sessions').get().n >= 100) throw failure('本地会话过多，请稍后再试。', 429);
      const owner = randomUUID(), token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
      const name = `试玩者 ${owner.slice(0, 4)}`;
      tx(() => {
        db.prepare('INSERT INTO users VALUES(?,?)').run(owner, name);
        db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(sha(token), owner, csrf, Date.now() + 7 * 86400000);
      });
      return { token, owner, name, csrf };
    },
    upload(owner, input) {
      const data = metadata(input), now = Date.now();
      return tx(() => {
        if (db.prepare("SELECT count(*) n FROM audit WHERE owner=? AND action='upload' AND created>?").get(owner, now - 86400000).n >= LIMITS.dailyUploads) throw failure('今天的上传次数已用完。', 429);
        if (db.prepare("SELECT count(*) n FROM jobs WHERE status IN ('queued','running')").get().n >= 300) throw failure('队列已满，请稍后提交。', 429);
        let work;
        if (input.workId) work = ownerWork(owner, input.workId);
        else {
          if (db.prepare('SELECT count(*) n FROM works WHERE owner=?').get(owner).n >= 20) throw failure('试玩身份最多保存 20 件作品。', 429);
          work = { id: randomUUID() };
          db.prepare('INSERT INTO works VALUES(?,?,?,0,NULL,?)').run(work.id, owner, data.name, now);
        }
        const hash = sha(data.source);
        if (db.prepare('SELECT id FROM versions WHERE work=? AND sha=?').get(work.id, hash)) throw failure('这份代码已经提交过，没有创建重复版本。', 409);
        const id = randomUUID(), number = (db.prepare('SELECT max(number) n FROM versions WHERE work=?').get(work.id).n || 0) + 1;
        db.prepare('INSERT INTO versions(id,work,number,model,effort,note,sha,source,status,created) VALUES(?,?,?,?,?,?,?,?,?,?)')
          .run(id, work.id, number, data.model, data.effort, data.note, hash, data.source, 'checking', now);
        db.prepare('INSERT INTO ratings(version) VALUES(?)').run(id);
        queue('validate', owner, { version: id }); audit(owner, 'upload', id);
        return { id, work: work.id, number };
      });
    },
    activate(owner, id) {
      return tx(() => {
        const version = db.prepare('SELECT * FROM versions WHERE id=?').get(id);
        if (!version) throw failure('版本不存在。', 404);
        const work = ownerWork(owner, version.work);
        if (version.status !== 'ready') throw failure('请先通过运行检查。');
        db.prepare('UPDATE works SET active=NULL WHERE owner=? AND official=0 AND id<>?').run(owner, work.id);
        db.prepare('UPDATE works SET active=? WHERE id=?').run(id, work.id); audit(owner, 'activate', id);
      });
    },
    myVersions(owner) { return db.prepare(`${select} WHERE w.owner=? ORDER BY v.created DESC,v.number DESC`).all(owner).map(publicRow); },
    rankings() { return db.prepare(`${select} WHERE w.active=v.id AND v.status='ready'`).all().map(publicRow).sort((a, b) => (a.provisional - b.provisional) || b.rating - a.rating || b.games - a.games || a.id.localeCompare(b.id)); },
    getVersion(id) { return db.prepare(`${select} WHERE v.id=?`).get(id); },
    source(id) { const row = db.prepare('SELECT source FROM versions WHERE id=?').get(id); if (!row) throw Error('Missing immutable version'); return row.source; },
    createBatch(owner, versionId, exhibition = false) {
      return tx(() => {
        const player = store.getVersion(versionId);
        if (!player || player.status !== 'ready' || player.active !== player.id) throw failure('请选择已通过检查的参赛版本。');
        if (exhibition ? !player.official : player.owner !== owner || player.official) throw failure('不能代替其他用户安排比赛。', 403);
        if (db.prepare("SELECT count(*) n FROM jobs WHERE owner=? AND status IN ('queued','running','held') AND kind='match'").get(owner).n) throw failure('你的上一组对局还未完成，请先继续或取消。', 409);
        if (db.prepare("SELECT count(*) n FROM jobs WHERE owner=? AND kind='match' AND created>?").get(owner, Date.now() - 86400000).n + 12 > LIMITS.dailyMatches) throw failure('今日 120 场试赛额度已用完。', 429);
        if (db.prepare("SELECT count(*) n FROM jobs WHERE status IN ('queued','running')").get().n + 12 > 300) throw failure('队列已满，请稍后再试。', 429);
        const candidates = store.rankings().filter(p => p.owner !== player.owner);
        if (new Set(candidates.map(p => p.owner)).size < 3) throw failure('目前还不足四位不同作者。');
        const id = randomUUID(); db.prepare('INSERT INTO batches VALUES(?,?,?,12)').run(id, owner, Date.now());
        for (const map of MAPS) {
          // Mix near-rating opponents and exploration; same author cannot share a match.
          const pool = candidates.map(p => ({ ...p, distance: Math.abs(p.mu - player.mu) + randomInt(0, 1600) / 100 })).sort((a, b) => a.distance - b.distance);
          const picked = [player], owners = new Set([player.owner]);
          for (const candidate of pool) if (!owners.has(candidate.owner)) {
            picked.push(candidate); owners.add(candidate.owner); if (picked.length === 4) break;
          }
          const seed = randomBytes(4).readUInt32LE();
          const start = randomInt(4);
          for (let rotation = 0; rotation < 4; rotation++) queue('match', owner, {
            mapId: map.id, seed, versions: picked.map(p => p.id),
            seats: Object.fromEntries(SIDES.map((side, i) => [side, (i + rotation + start) % 4])), profile: PROFILE, engineHash: ENGINE_HASH,
            runtimeHash: RUNTIME_HASH,
          }, id);
        }
        audit(owner, 'batch', id); return { id, total: 12 };
      });
    },
    claim() {
      return tx(() => {
        const job = db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY CASE kind WHEN 'validate' THEN 0 ELSE 1 END,seq LIMIT 1").get();
        if (!job) return null;
        db.prepare("UPDATE jobs SET status='running' WHERE id=?").run(job.id);
        return { ...job, task: JSON.parse(job.task) };
      });
    },
    validate(job, issue = '') {
      tx(() => {
        db.prepare('UPDATE versions SET status=?,issue=? WHERE id=?').run(issue ? 'rejected' : 'ready', issue, job.task.version);
        if (!issue) db.prepare(`UPDATE works SET active=? WHERE id=(SELECT work FROM versions WHERE id=?) AND active IS NULL
          AND NOT EXISTS (SELECT 1 FROM works current WHERE current.owner=works.owner AND current.official=0 AND current.active IS NOT NULL)`)
          .run(job.task.version, job.task.version);
        db.prepare('UPDATE jobs SET status=?,issue=?,finished=? WHERE id=?').run(issue ? 'failed' : 'completed', issue, Date.now(), job.id);
      });
    },
    settle(job, replay) {
      // The trusted engine produced these ranks. HTTP clients cannot submit results.
      if (replay.meta.ladder.profile !== PROFILE || replay.meta.ladder.engineHash !== ENGINE_HASH || replay.meta.ladder.runtimeHash !== RUNTIME_HASH || replay.ranking.length !== 4) throw Error('Wrong execution profile');
      if (replay.meta.mapId !== job.task.mapId || replay.meta.seed !== job.task.seed ||
          JSON.stringify(replay.meta.ladder.versions) !== JSON.stringify(job.task.versions) ||
          SIDES.some(side => replay.meta.seatSlots[side] !== job.task.seats[side])) throw Error('Wrong match manifest');
      const rows = SIDES.map(side => {
        const row = replay.ranking.find(r => r.id === side);
        return { ...row, version: job.task.versions[job.task.seats[side]] };
      });
      const fault = row => ['error', 'timeout'].includes(row.status);
      const ranks = rows.map(row => row.rank);
      if (rows.every(fault)) throw Error('四位选手全部运行失败，本场不计分。');
      return tx(() => {
        if (db.prepare('SELECT id FROM matches WHERE job=?').get(job.id)) return false;
        const players = rows.map(row => db.prepare('SELECT * FROM ratings WHERE version=?').get(row.version));
        const updated = updateRatings(players, ranks);
        const changes = rows.map((row, i) => {
          const won = replay.winners.includes(row.id), credit = won ? 1 / replay.winners.length : 0;
          db.prepare('UPDATE ratings SET mu=?,sigma=?,games=games+1,wins=wins+?,points=points+?,kills=kills+?,faults=faults+? WHERE version=?')
            .run(updated[i].mu, updated[i].sigma, credit, row.points, row.kills, Number(fault(row)), row.version);
          const entrant = store.getVersion(row.version);
          return { ...row, name: entrant.name, model: entrant.model, effort: entrant.effort, number: entrant.number,
            before: skill(players[i]), after: skill(updated[i]), delta: skill(updated[i]) - skill(players[i]), sha: entrant.sha };
        });
        const id = job.id, summary = { id, mapId: job.task.mapId, seed: job.task.seed, created: Date.now(), rows: changes,
          reason: replay.reason, frames: replay.frames.length, profile: PROFILE, engineHash: ENGINE_HASH, runtimeHash: RUNTIME_HASH, seats: job.task.seats };
        replay.meta.ladder.entries = changes;
        db.prepare('INSERT INTO matches VALUES(?,?,?,?,?,?,?)').run(id, job.id, summary.created, summary.mapId, summary.seed, JSON.stringify(summary), gzipSync(JSON.stringify(replay)));
        db.prepare("UPDATE jobs SET status='completed',finished=? WHERE id=?").run(Date.now(), job.id);
        return true;
      });
    },
    fail(job, issue) { db.prepare("UPDATE jobs SET status='failed',issue=?,finished=? WHERE id=?").run(issue.slice(0, 240), Date.now(), job.id); },
    recent() { return db.prepare('SELECT summary FROM matches ORDER BY created DESC LIMIT 60').all().map(r => JSON.parse(r.summary)); },
    replay(id) { const row = db.prepare('SELECT replay FROM matches WHERE id=?').get(id); if (!row) throw failure('回放不存在。', 404); return gunzipSync(row.replay); },
    jobs(owner) { return db.prepare('SELECT id,kind,batch,status,issue,created,finished FROM jobs WHERE owner=? ORDER BY seq DESC LIMIT 80').all(owner); },
    control(owner, action) {
      if (!['pause','resume','cancel'].includes(action)) throw failure('未知队列操作。');
      tx(() => {
        if (action === 'pause') db.prepare("UPDATE jobs SET status='held' WHERE owner=? AND kind='match' AND status='queued'").run(owner);
        if (action === 'resume') db.prepare("UPDATE jobs SET status='queued' WHERE owner=? AND kind='match' AND status='held'").run(owner);
        if (action === 'cancel') db.prepare("UPDATE jobs SET status='cancelled' WHERE owner=? AND kind='match' AND status IN ('queued','held')").run(owner);
        audit(owner, action, 'queue');
      });
    },
    counts() { return { ...db.prepare('SELECT count(*) matches FROM matches').get(), ...db.prepare("SELECT count(*) queued FROM jobs WHERE status='queued'").get(), ...db.prepare("SELECT count(*) running FROM jobs WHERE status='running'").get() }; },
    close() { db.close(); },
  };
  return store;
}
