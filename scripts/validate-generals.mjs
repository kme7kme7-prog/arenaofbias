import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MODES} from '../reference/menu-demo/modes.mjs';
import {Match} from '../public/generals/engine/runtime.js';
import {validateReplay} from '../public/generals/engine/replay.js';

const roster=JSON.parse(await readFile('public/generals/roster.json','utf8'));
const entries=roster.filter(e=>e.kind==='entry'),training=roster.filter(e=>e.kind==='training');
assert.equal(entries.length,5);assert.equal(training.length,7);
assert.equal(new Set(roster.map(e=>e.id)).size,12);
assert.deepEqual(entries.map(e=>[e.model,e.reasoningEffort]),[
  ['GPT-6 Astra','high'],['GPT-6.1 Sol','high'],['GPT-6 Luna','max'],
  ['GPT-5.6 Terra','high'],['GPT-5.6 Sol','high'],
]);
assert.ok(training.every(e=>e.model==='baseline'&&/^baseline-0[1-7]$/.test(e.name)));
for(const entry of roster){
  const bytes=await readFile(`public/generals/bots/${entry.id}.js`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.id);
  entry.code=new TextDecoder().decode(bytes);
}
const mode=MODES.find(e=>e.id==='generals');
assert.equal(mode.href,'/generals.html');assert.equal(mode.locked,false);assert.equal(mode.progress,undefined);
const menu=await readFile('app/play-menu.tsx','utf8'),html=await readFile('generals.html','utf8'),app=await readFile('public/generals/web/app.js','utf8');
assert.ok(menu.includes("id === 'generals') playgroundNavigate('/generals.html')"));
assert.ok(html.includes('/playground-entry-boot.js')&&html.includes('href="/#play"'));
assert.ok(app.includes("navigate('/#play',true)")&&app.includes('PlaygroundEntry?.ready()'));
assert.ok(!app.includes('/api/entries')&&!app.includes('aob-generals-theme'));
const match=new Match(training.slice(0,2),{size:14,seed:42,maxTurns:80});
try{
  const replay=validateReplay(await match.run());
  assert.deepEqual(replay.meta.faults,[0,0]);assert.ok(replay.meta.complete);
}finally{match.cancel();}
console.log('Generals: 5 entries, 7 baselines, original source hashes, menu/transition/theme and real worker/replay checks passed.');
