import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createSandbox } from '../sandbox.mjs';
import { ROOT, MAPS, SIDES } from '../config.mjs';
import { createBrawl, buildBrawlPlayerState } from '../../../app/tanks/engine/core/brawl.js';
import { adapter } from '../../tank-bench/match.mjs';

test('22 original bots: persistent decision parity on three maps and four seats', async () => {
  const registry=JSON.parse(readFileSync(path.join(ROOT,'app/tanks/provenance.json'),'utf8'));
  let observations=0; const differences=[];
  for(const bot of registry.bots){
    const source=readFileSync(path.join(ROOT,'app/tanks/bots',bot.id+'.js'),'utf8');
    for(const map of MAPS) for(const side of SIDES){
      const wasm=await createSandbox(source,2),native=adapter(source,2000);
      try{
        for(const tick of [0,100,250,500]){
          const s=createBrawl(map.id,2);s.tick=tick;const state=buildBrawlPlayerState(s,side);
          const expected=native.decide(state),actual=wasm.decide(state);observations++;
          if(expected.move!==actual.move||expected.fire!==actual.fire)differences.push({bot:bot.id,map:map.id,side,tick,expected,actual});
        }
      }finally{wasm.dispose();native.dispose();}
    }
  }
  assert.equal(differences.length,0,JSON.stringify(differences.slice(0,10)));
  assert.equal(observations,22*3*4*4);
});
