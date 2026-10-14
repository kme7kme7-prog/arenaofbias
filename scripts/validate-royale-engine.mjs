import assert from 'node:assert/strict';
import { createRoyale, zoneAt, inside, playerState, step, runRoyale, free, rank } from '../app/tanks/royale/engine.mjs';
import { applyMove, applyFire, runBulletPhase } from '../app/tanks/royale/combat.mjs';
import * as legacy from '../app/tanks/engine/core/sim.js';
import { createBrawl } from '../app/tanks/engine/core/brawl.js';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`ok ${checks} ${name}`); }
const overlap = (a,b) => a.x < b.x+2 && a.x+2 > b.x && a.y < b.y+2 && a.y+2 > b.y;
for (const count of [2, 4, 21, 40, 100]) for (const terrain of ['ruins','grove','open']) check(`legal distributed spawns ${count}/${terrain}`, () => {
  const s = createRoyale({count,terrain,seed:27});
  const tanks = Object.values(s.tanks);
  assert.equal(tanks.length,count);
  tanks.forEach((t,i) => { assert(free(s.map,t.x,t.y)); tanks.slice(i+1).forEach(b=>assert(!overlap(t,b))); });
  assert.deepEqual(s,createRoyale({count,terrain,seed:27}));
});
check('circle reaches empty and does not reopen', () => {
  for (const n of [42,58,80]) { let last=0; for(let tick=0;tick<2000;tick++) { const z=zoneAt(tick,n); assert(z.min>=last); last=z.min; } assert.equal(last,n/2); assert(!inside({x:n/2,y:n/2},zoneAt(2000,n))); }
});
check('legacy combat remains equivalent at 26x26', () => {
  const a=createBrawl(),b=structuredClone(a);
  for(let tick=0;tick<100;tick++) {
    a.tick=b.tick=tick;
    for(const id of ['A','B','C','D']) {
      const ae=[],be=[];legacy.applyFire(a,id,true,ae);applyFire(b,id,true,be);assert.deepEqual(ae,be);
      const move=['up','right','down','left'][tick%4];legacy.applyMove(a,id,move);applyMove(b,id,move);
    }
    assert.deepEqual(legacy.runBulletPhase(a),runBulletPhase(b));assert.deepEqual(a,b);
    for(const t of Object.values(a.tanks))t.fireCooldown=0;
    for(const t of Object.values(b.tanks))t.fireCooldown=0;
  }
});
check('movement and bullets cross old grid boundary', () => {
  const s=createRoyale({count:2,terrain:'open'});s.map.forEach(r=>r.fill(0));Object.assign(s.tanks.A,{x:32,y:32,dir:1});Object.assign(s.tanks.B,{x:39,y:32});
  applyMove(s,'A','right');assert.equal(s.tanks.A.x,33);const events=[];applyFire(s,'A',true,events);assert(s.bullets[0].x>26);runBulletPhase(s);runBulletPhase(s);assert.equal(s.tanks.B.hp,1);
});
check('grass beyond old 26 boundary remains hidden', () => {
  const s=createRoyale({count:2});Object.assign(s.tanks.A,{x:30,y:30});Object.assign(s.tanks.B,{x:34,y:30});s.map[30][34]=4;
  assert.equal(playerState(s,'A').radar.tanks.length,0);s.tanks.A.radarTicks=20;assert.equal(playerState(s,'A').radar.tanks.length,1);
});
for(const type of ['repair','rapid','shield','radar'])check(`automatic ${type}`,()=>{
  const s=createRoyale({count:2});s.tick=1;const t=s.tanks.A;t.hp=1;s.supplies=[{id:'test',x:t.x,y:t.y,type,available:true,expireTick:100}];step(s,{});
  assert.equal(s.supplies.length,0);assert(type==='repair'?t.hp===2:type==='rapid'?t.rapidTicks===80:type==='shield'?t.shield===1:t.radarTicks===80);
});
check('shield absorbs bullet once and does not absorb storm',()=>{
  const s=createRoyale({count:2});s.map.forEach(r=>r.fill(0));Object.assign(s.tanks.A,{x:30,y:30,dir:1});Object.assign(s.tanks.B,{x:34,y:30,shield:1});applyFire(s,'A',true,[]);runBulletPhase(s);assert.equal(s.tanks.B.hp,2);assert.equal(s.tanks.B.shield,0);
  s.tick=200;Object.assign(s.tanks.B,{x:0,y:0,shield:1});step(s,{});assert.equal(s.tanks.B.hp,1);assert.equal(s.tanks.B.shield,1);
});
check('two lives, natural end, no 60-second score settlement',()=>{
  const s=createRoyale({count:2});s.map.forEach(r=>r.fill(0));Object.assign(s.tanks.A,{x:19,y:19});Object.assign(s.tanks.B,{x:22,y:22});s.tick=600;
  assert.equal(step(s,{}).end,null);
  for(s.tick=601;s.tick<1200;s.tick++){const result=step(s,{});if(result.end){assert(s.tick>600);assert(Object.values(s.tanks).filter(t=>t.onField).length<=1);return;}}
  assert.fail('did not end naturally');
});
check('same-tick eliminations tie without fictitious winner',()=>{
  const s=createRoyale({count:2});s.tick=1000;Object.values(s.tanks).forEach(t=>{t.hp=1;t.lives=1;});const r=step(s,{});assert.deepEqual(r.end.winners,[]);assert.equal(rank(s)[0].rank,rank(s)[1].rank);
});
check('first shell death respawns, second death eliminates',()=>{
  const s=createRoyale({count:2,terrain:'open'});s.map.forEach(r=>r.fill(0));s.tick=1;
  assert.equal(s.tanks.B.lives,2);
  Object.assign(s.tanks.A,{x:2,y:2});Object.assign(s.tanks.B,{x:10,y:10,hp:1,shield:0,rapidTicks:20,radarTicks:20});
  const shoot=()=>{const t=s.tanks.B;s.bullets=[{x:t.x,y:t.y,dir:1,owner:'A',alive:1,immune:0}];return step(s,{});};
  const first=shoot();assert.equal(first.end,null);assert.equal(s.tanks.B.lives,1);assert.equal(s.tanks.B.hp,2);assert.equal(s.tanks.B.onField,1);
  assert.equal(s.scores.B.status,'active');assert.equal(s.scores.B.deaths,1);assert.equal(s.scores.A.kills,1);assert(first.events.some(e=>e.kind==='respawn'));
  assert(inside(s.tanks.B,zoneAt(s.tick,s.size)));assert(!overlap(s.tanks.A,s.tanks.B));assert.equal(s.tanks.B.rapidTicks,0);assert.equal(s.tanks.B.radarTicks,0);
  s.tick++;s.tanks.B.hp=1;const second=shoot();assert.equal(s.tanks.B.lives,0);assert.equal(s.scores.B.deaths,2);assert.equal(s.scores.A.kills,2);assert.deepEqual(second.end.winners,['A']);
});
check('storm consumes both lives even after safe zone disappears',()=>{
  const s=createRoyale({count:2});s.tick=1000;Object.values(s.tanks).forEach(t=>t.hp=1);
  assert.equal(step(s,{}).end,null);assert(Object.values(s.tanks).every(t=>t.lives===1&&t.hp===2));
  s.tick=1010;assert.equal(step(s,{}).end,null);
  s.tick=1020;assert.deepEqual(step(s,{}).end.winners,[]);assert(Object.values(s.scores).every(t=>t.deaths===2));
});
let disposals=0;
const adapter=()=>({ready:Promise.resolve(),decide:async()=>({move:'stay',fire:false}),dispose(){disposals++;}});
const result=await runRoyale({sources:['a','b','c'],entrants:[],seed:4,terrain:'open',scale:'auto',adapterFactory:adapter});
check('runner finishes and releases all workers',()=>{assert(result.frames.length>1);assert.equal(disposals,3);assert(result.winners.length<=1);assert.equal(result.frames[0].map,undefined);});
const abort=new AbortController();abort.abort();
await assert.rejects(runRoyale({sources:['a','b'],seed:2,terrain:'open',scale:'auto',adapterFactory:adapter,signal:abort.signal}),{code:'cancelled'});
check('aborted before startup',()=>assert.equal(disposals,3));
const failed=await runRoyale({sources:['a','b'],seed:2,terrain:'open',scale:'auto',adapterFactory:()=>{throw Error('broken');}});
check('failed bots do not win',()=>{assert.deepEqual(failed.winners,[]);assert(failed.ranking.every(r=>r.status==='error'));});
console.log(`Royale engine: ${checks} checks passed`);
