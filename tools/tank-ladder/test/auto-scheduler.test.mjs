import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../store.mjs';
import { createAutoScheduler, AUTO_OWNER } from '../auto-scheduler.mjs';
import { MAPS, SIDES, PROFILE, ENGINE_HASH, RUNTIME_HASH } from '../config.mjs';

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tank-auto-'));
  const store = openStore(directory); store.bootstrap(); t.after(() => store.close());
  let connected = true, clock = Date.now();
  const options = { store, directory, enabled: true, online: () => connected, now: () => clock };
  return { store, options, auto: createAutoScheduler(options), offline: () => { connected = false; }, online: () => { connected = true; },
    advance: ms => { clock += ms; }, tasks: () => store.db.prepare("SELECT * FROM jobs WHERE status='queued' AND kind='match'").all().map(j => ({ ...j, task: JSON.parse(j.task) })),
    finish: () => {
      // Scheduler-only fixture: simulate completed appearances, not engine results.
      for (const j of store.db.prepare("SELECT task FROM jobs WHERE kind='match' AND status='queued'").all())
        for (const id of JSON.parse(j.task).versions) store.db.prepare('UPDATE ratings SET games=games+1 WHERE version=?').run(id);
      store.db.prepare("UPDATE jobs SET status='completed',finished=? WHERE status='queued'").run(clock);
    } };
}

test('automatic groups preserve all maps, rotated seats and frozen runtime; queue remains bounded', t => {
  const f = fixture(t); assert.equal(f.auto.pump().state, 'playing');
  const jobs = f.tasks(); assert.equal(jobs.length, 12);
  assert(jobs.every(j => j.owner === AUTO_OWNER));
  for (const map of MAPS) {
    const group = jobs.filter(j => j.task.mapId === map.id).map(j => j.task);
    assert.equal(group.length, 4); assert.equal(new Set(group.map(g => g.seed)).size, 1);
    for (const task of group) {
      assert.equal(new Set(task.versions.map(id => f.store.getVersion(id).owner)).size, 4);
      assert.equal(task.profile, PROFILE); assert.equal(task.engineHash, ENGINE_HASH); assert.equal(task.runtimeHash, RUNTIME_HASH);
      assert.deepEqual(task.versions, group[0].versions);
    }
    for (const side of SIDES) assert.equal(new Set(group.map(g => g.seats[side])).size, 4);
  }
  for (let i = 0; i < 20; i++) f.auto.pump();
  createAutoScheduler(f.options).pump(); assert.equal(f.tasks().length, 12);
  f.finish(); f.auto.pump(); assert.equal(f.store.db.prepare('SELECT count(*) n FROM batches').get().n, 2);
});

test('fewest completed games wins priority; new accepted main enters automatically without charging manual quota', t => {
  const f = fixture(t);
  f.store.db.prepare('UPDATE ratings SET games=40').run();
  const v = f.store.upload('site:newcomer', { name: 'Newcomer', model: 'Test', effort: 'default', source: 'function decide(){return {move:"stay",fire:false}}' });
  assert.equal(f.auto.pump().state, 'waiting');
  const validation = f.store.claim(); assert.equal(validation.kind, 'validate'); f.store.validate(validation);
  f.auto.pump(); assert(f.tasks().every(j => j.task.versions.includes(v.id)));
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM batches WHERE owner=?').get('site:newcomer').n, 0);
  const own = f.auto.jobsFor('site:newcomer'); assert.equal(own.filter(j => j.automatic).length, 12);
  assert(own.every(j => !('task' in j) && !('source' in j)));
  assert.equal(f.auto.jobsFor('site:other').length, 0);
  f.store.control('site:newcomer', 'cancel'); assert.equal(f.tasks().length, 12);
  assert.equal(f.store.createBatch('site:newcomer', v.id).total, 12);
  assert.equal(f.tasks().length, 24);
  // A later version is ineligible until its author switches the active work.
  f.finish();
  const later = f.store.upload('site:newcomer', { workId: v.work, name:'Newcomer', model:'Test', effort:'default', source:'function decide(){return {move:"up",fire:false}}' });
  f.store.validate(f.store.claim());
  f.auto.pump(); assert(!f.tasks().some(j => j.task.versions.includes(later.id)));
  f.finish(); f.store.activate('site:newcomer', later.id); f.auto.pump();
  assert(f.tasks().every(j => j.task.versions.includes(later.id)));
});

test('all library entrants receive games across groups; no single underplayed anchor monopolizes opponents', t => {
  const f = fixture(t);
  for (let i = 0; i < 12; i++) { f.auto.pump(); f.finish(); }
  const games = f.store.rankings().map(r => r.games);
  assert(Math.min(...games) >= 12); assert(Math.max(...games) - Math.min(...games) <= 16);
});

test('offline, manual work, persistent pause, capacity and failed-job cooldown block replenishment safely', t => {
  const f = fixture(t); f.offline(); assert.equal(f.auto.pump().state, 'offline'); assert.equal(f.tasks().length, 0);
  f.online(); f.store.createBatch('manual', f.store.rankings()[0].id, true);
  assert.equal(f.auto.pump().state, 'waiting'); assert.equal(f.tasks().length, 12); f.finish();
  f.auto.control('pause'); const restarted = createAutoScheduler(f.options);
  assert.equal(restarted.pump().state, 'paused'); assert.equal(f.tasks().length, 0);
  restarted.control('resume'); restarted.pump();
  restarted.control('pause'); assert.equal(f.tasks().length, 12); // Drain instead of interrupting computation.
  f.store.db.prepare("UPDATE jobs SET status='failed',finished=? WHERE owner=?").run(f.options.now(), AUTO_OWNER);
  restarted.control('resume'); assert.equal(restarted.pump().state, 'cooldown');
  f.advance(300001); restarted.pump(); assert.equal(f.tasks().length, 12); f.finish();
  for (let i = 0; i < 90; i++) f.store.db.prepare("INSERT INTO jobs(id,kind,owner,task,status,created) VALUES(?,'match','held-user','{}','held',?)").run(`held-${i}`, f.options.now());
  assert.equal(restarted.pump().state, 'capacity'); assert.equal(f.tasks().length, 0);
  assert.throws(() => restarted.control('delete'));
});

test('failed transaction creates neither partial jobs nor phantom batch', t => {
  const f = fixture(t);
  f.store.db.exec("CREATE TRIGGER reject_auto BEFORE INSERT ON jobs WHEN new.owner='system:automatic-s01' BEGIN SELECT RAISE(ABORT,'fixture'); END");
  assert.equal(f.auto.pump().state, 'error'); assert.equal(f.tasks().length, 0);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM batches').get().n, 0);
  f.store.db.exec('DROP TRIGGER reject_auto'); assert.equal(f.auto.pump().state, 'playing');
});
