import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openStore } from '../store.mjs';
import { updateRatings, skill } from '../rating.mjs';
import { PROFILE, ENGINE_HASH, RUNTIME_HASH, SIDES } from '../config.mjs';

const source='function decide(){return {move:"stay",fire:false}}';
const input={name:'试验坦克',model:'测试模型',effort:'high',source};
test('immutable versions, owner checks, balance, idempotent settlement and restart', () => {
  const directory=mkdtempSync(path.join(os.tmpdir(),'tank-ladder-store-'));
  let s=openStore(directory);s.bootstrap();
  assert.equal(s.rankings().length,22);
  const owner=s.createSession().owner,other=s.createSession().owner;
  const v=s.upload(owner,input);const validation=s.claim();s.validate(validation);
  assert.throws(()=>s.activate(other,v.id),/找不到/);
  assert.throws(()=>s.upload(other,{...input,workId:v.work}),/找不到/);
  assert.throws(()=>s.upload(owner,{...input,workId:v.work}),/重复/);
  const v2=s.upload(owner,{...input,workId:v.work,source:source+'\n// v2'});s.validate(s.claim());
  assert.equal(s.getVersion(v.id).active,v.id);s.activate(owner,v2.id);assert.equal(s.getVersion(v.id).active,v2.id);
  s.createBatch(owner,v2.id);const jobs=s.db.prepare("SELECT * FROM jobs WHERE kind='match'").all().map(r=>({...r,task:JSON.parse(r.task)}));
  assert.equal(jobs.length,12);for(const map of ['crossroads','islands','ruins']){
    const four=jobs.filter(j=>j.task.mapId===map);assert.equal(four.length,4);assert.equal(new Set(four.map(j=>j.task.seed)).size,1);
    assert.equal(new Set(four.map(j=>SIDES.find(side=>j.task.seats[side]===0))).size,4);
    assert.equal(new Set(four[0].task.versions.map(id=>s.getVersion(id).owner)).size,4);
  }
  assert.throws(()=>s.createBatch(owner,v2.id),/上一组/);
  s.control(owner,'pause');assert.equal(s.claim(),null);s.control(owner,'resume');
  const job=s.claim();const ranking=SIDES.map((id,i)=>({id,rank:i+1,kills:3-i,points:6-i,status:'active'}));
  const replay={meta:{mapId:job.task.mapId,seed:job.task.seed,seatSlots:job.task.seats,ladder:{profile:PROFILE,engineHash:ENGINE_HASH,runtimeHash:RUNTIME_HASH,versions:job.task.versions}},ranking,winners:['A'],frames:[{}],events:[],reason:'ticks'};
  assert.throws(()=>s.settle(job,{...replay,meta:{...replay.meta,seed:job.task.seed+1}}),/manifest/);
  assert.equal(s.settle(job,replay),true);assert.equal(s.settle(job,replay),false);
  assert.equal(s.db.prepare('SELECT sum(games) n FROM ratings').get().n,4);
  assert(!JSON.stringify(s.rankings()).includes('function decide'));assert(!JSON.stringify(s.recent()).includes('function decide'));
  const first=s.recent()[0];assert.equal(JSON.parse(s.replay(first.id)).meta.ladder.entries.length,4);
  const interrupted=s.claim();s.close();s=openStore(directory);assert.equal(s.claim().id,interrupted.id);
  assert.equal(s.recent().length,1);s.close();
});
test('a changed runtime cannot reuse an existing season', () => {
  const directory=mkdtempSync(path.join(os.tmpdir(),'tank-ladder-profile-'));
  const s=openStore(directory);
  s.db.prepare("UPDATE settings SET value='a-different-engine' WHERE key='profile'").run();s.close();
  assert.throws(()=>openStore(directory),/不能混算/);
});
test('one account has one ranked contender while all works, versions and queued snapshots survive', () => {
  const s=openStore(mkdtempSync(path.join(os.tmpdir(),'tank-ladder-slot-')));s.bootstrap();
  try {
    const owner=s.createSession().owner,other=s.createSession().owner;
    const first=s.upload(owner,input);s.validate(s.claim());
    const second=s.upload(owner,{...input,name:'第二辆坦克',source:source+'\n// second'});s.validate(s.claim());
    const own=()=>s.rankings().filter(r=>r.owner===owner);
    assert.deepEqual(own().map(r=>r.id),[first.id]);
    s.createBatch(owner,first.id);const queued=s.db.prepare("SELECT task FROM jobs WHERE kind='match' ORDER BY seq").all();
    s.activate(owner,second.id);
    assert.deepEqual(own().map(r=>r.id),[second.id]);assert.equal(s.getVersion(first.id).active,null);
    assert.deepEqual(s.db.prepare("SELECT task FROM jobs WHERE kind='match' ORDER BY seq").all(),queued);
    assert.throws(()=>s.createBatch(owner,first.id),/参赛版本/);
    assert.throws(()=>s.createBatch(owner,second.id),/上一组/);
    assert.throws(()=>s.activate(other,first.id),/找不到/);
    const next=s.upload(owner,{...input,workId:first.work,source:source+'\n// first v2'});s.validate(s.claim());
    assert.deepEqual(own().map(r=>r.id),[second.id]);
    const bad=s.upload(owner,{...input,name:'坏的候选',source:source+'\n// rejected'});s.validate(s.claim(),'检查失败');
    assert.throws(()=>s.activate(owner,bad.id),/运行检查/);assert.deepEqual(own().map(r=>r.id),[second.id]);
    // The database also prevents a second active work if an application path regresses.
    assert.throws(()=>s.db.prepare('UPDATE works SET active=? WHERE id=?').run(next.id,first.work),/UNIQUE/);
    s.activate(owner,next.id);assert.deepEqual(own().map(r=>r.id),[next.id]);
    s.activate(owner,first.id);assert.deepEqual(own().map(r=>r.id),[first.id]);
    assert.equal(s.myVersions(owner).length,4);assert.equal(s.rankings().filter(r=>r.official).length,22);
  } finally {s.close();}
});
test('ratings support ties without seat advantage and react to stronger opposition', () => {
  const ratings=Array.from({length:4},()=>({mu:25,sigma:8.333333333333334}));
  const ties=updateRatings(ratings,[1,1,3,3]);assert(Math.abs(ties[0].mu-ties[1].mu)<1e-9);assert(Math.abs(ties[2].mu-ties[3].mu)<1e-9);
  assert(ties[0].mu>ties[2].mu);const result=updateRatings(ratings,[1,2,3,4]);assert(skill(result[0])>skill(result[3]));
});
