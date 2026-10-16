// One isolated lifetime per entrant; the host owns all deadlines and fault totals.
const node = typeof process !== 'undefined' && !!process.versions?.node;
const channel = node ? (await import('node:worker_threads')).parentPort : self;
const send = data => channel.postMessage(data);
const listen = fn => node ? channel.on('message', fn) : self.addEventListener('message', e => fn(e.data));
let decide, context, vm;
function rng(seed) {
  let a=seed>>>0;
  return ()=>{ a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
}
listen(async msg => {
  const {id}=msg;
  try {
    if (msg.type==='init') {
      if(typeof msg.code!=='string' || msg.code.length>262144) throw new Error('bot 文件大小超出限制');
      const random=rng(msg.seed);
      if(node) {
        vm=await import('node:vm');
        context=vm.createContext(Object.create(null),{codeGeneration:{strings:false,wasm:false}});
        // Build the seeded Math in the new realm, without exposing host functions.
        vm.runInContext(`Math.random=(${rng.toString()})(${msg.seed>>>0}); Date=undefined; console=undefined;`,context);
        vm.runInContext(msg.code+'\n;globalThis.__decide=typeof act==="function"?act:null;',context,{timeout:1000});
        if(!vm.runInContext('typeof __decide === "function"',context)) throw new Error('缺少同步 act(view) 函数');
      } else {
        for(const key of ['fetch','XMLHttpRequest','WebSocket','WebTransport','EventSource','importScripts','Worker','SharedWorker','indexedDB','caches']) {
          try { Object.defineProperty(self,key,{value:undefined,writable:false,configurable:false}); } catch {}
        }
        const math=Object.create(Math); Object.defineProperty(math,'random',{value:random}); Object.freeze(math);
        decide=new Function('Math','Date','console','"use strict";\n'+msg.code+'\n;return typeof act==="function"?act:null;')(math,undefined,undefined);
        if(typeof decide!=='function') throw new Error('缺少同步 act(view) 函数');
      }
      send({id,ready:true});
    } else if(msg.type==='act') {
      let move;
      if(node) {
        // JSON creates the observation in the guest realm (no host prototypes).
        vm.runInContext('globalThis.__view='+JSON.stringify(msg.view),context,{timeout:100});
        move=vm.runInContext('__decide(__view)',context,{timeout:msg.budget});
      } else move=decide(msg.view);
      if(move && typeof move.then==='function') throw new Error('act 必须同步返回');
      send({id,move});
    }
  } catch(err) { send({id,error:String(err?.message || err).slice(0,240)}); }
});
