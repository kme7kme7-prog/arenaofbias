import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createBrowserWorker} from '../public/generals/engine/browser-worker.js';
import E from '../public/generals/engine/core.js';

function worker(source){
  const messages=[];let released=false;
  class TestWorker{
    constructor(script){
      this.self={postMessage:data=>messages.push(data)};
      vm.runInNewContext(script,{self:this.self},{contextCodeGeneration:{strings:false,wasm:false},timeout:1000});
    }
    postMessage(data){this.self.onmessage({data});return messages.shift();}
  }
  const instance=vm.runInNewContext(`(${createBrowserWorker.toString()})(source)`,{
    source,Worker:TestWorker,Blob:class{constructor(parts){this.script=parts.join('');}},
    URL:{createObjectURL:blob=>blob.script,revokeObjectURL:()=>{released=true;}},
  });
  return {instance,released:()=>released};
}

const randomBot='function act(view){return [Math.random(),typeof Date,typeof console,view.t];}';
const a=worker(randomBot),b=worker(randomBot);
for(const item of [a,b])assert.equal(item.instance.postMessage({type:'init',id:1,seed:42}).ready,true);
const first=a.instance.postMessage({type:'act',id:2,view:{t:17}}).move;
assert.equal(JSON.stringify(first),JSON.stringify(b.instance.postMessage({type:'act',id:2,view:{t:17}}).move));
assert.equal(first[1],'undefined');assert.equal(first[2],'undefined');assert.equal(first[3],17);
a.instance.releaseURL();assert.equal(a.released(),true);
for(const source of ['function act(){return Promise.resolve(null);}','function act(){throw Error("invalid");}']){
  const {instance}=worker(source);assert.equal(instance.postMessage({type:'init',id:1,seed:42}).ready,true);
  assert.ok(instance.postMessage({type:'act',id:2,view:{}}).error);
}
const roster=JSON.parse(await readFile('public/generals/roster.json','utf8'));
for(const entry of roster){
  const {instance}=worker(await readFile(`public/generals/bots/${entry.id}.js`,'utf8'));
  assert.equal(instance.postMessage({type:'init',id:1,seed:42}).ready,true,entry.id);
  const game=E.createGame({n:2,size:14,seed:42,maxTurns:80});
  const result=instance.postMessage({type:'act',id:2,view:E.viewFor(game,0)});
  assert.equal(result.error,undefined,entry.id);assert.equal(E.actionError(result.move,{H:14,W:14}),null,entry.id);
  instance.releaseURL();
}
console.log('Browser worker: all 12 sources run with string compilation disabled; seeded RNG, errors and URL cleanup passed.');
