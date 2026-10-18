import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createSandbox } from './sandbox.mjs';
import { ROOT, MAPS, SIDES, PROFILE, ENGINE_HASH, RUNTIME_HASH, LIMITS } from './config.mjs';
import { createBrawl, buildBrawlPlayerState } from '../../app/tanks/engine/core/brawl.js';

// Deliberately bounded admission sample; this is not a full tournament or a
// statement that every late-game path fits this budget.
const registry=JSON.parse(readFileSync(path.join(ROOT,'app/tanks/provenance.json'),'utf8'));
const entries=[];
for(const entry of registry.bots){
  const source=readFileSync(path.join(ROOT,'app/tanks/bots',entry.id+'.js'),'utf8');
  const samples=[],failures=[];
  for(const map of MAPS)for(const side of SIDES){
    let bot;
    try{
      bot=await createSandbox(source,2);
      for(const tick of [0,100,250,500]){
        const state=createBrawl(map.id,2);state.tick=tick;
        const started=performance.now();
        bot.decide(buildBrawlPlayerState(state,side));samples.push(performance.now()-started);
      }
    }catch(error){failures.push({map:map.id,side,error:error.message});}
    finally{bot?.dispose();}
  }
  samples.sort((a,b)=>a-b);
  const percentile=p=>samples.length?Number(samples[Math.min(samples.length-1,Math.floor(samples.length*p))].toFixed(3)):null;
  entries.push({id:entry.id,model:entry.model,name:entry.name,sha:entry.sha256,samples:samples.length,p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:percentile(1),failures});
}
const directory=path.join(ROOT,'.local/tank-ladder-calibration');mkdirSync(directory,{recursive:true});
const output=path.join(directory,`sample-${Date.now()}.json`);
writeFileSync(output,JSON.stringify({profile:PROFILE,engineHash:ENGINE_HASH,runtimeHash:RUNTIME_HASH,limits:LIMITS,platform:process.platform,node:process.version,created:new Date().toISOString(),scope:'48 fixed observations per bot; not full-match calibration',entries},null,2));
console.log(JSON.stringify({output,samples:entries.reduce((n,e)=>n+e.samples,0),failures:entries.reduce((n,e)=>n+e.failures.length,0),maxMs:Math.max(...entries.map(e=>e.maxMs||0))}));
