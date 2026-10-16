// Parse trusted bot source as a Worker script, so production CSP needs no eval.
export function createBrowserWorker(source) {
  if(typeof source!=='string'||source.length>262144)throw Error('bot 文件大小超出限制');
  const script=`(() => {
    const send=self.postMessage.bind(self);
    const load=(Math,Date,console)=>{
      "use strict";
      ${source}
      ;return typeof act==='function'?act:null;
    };
    let decide;
    function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}
    self.onmessage=({data:msg})=>{
      const {id}=msg;
      try{
        if(msg.type==='init'){
          for(const key of ['fetch','XMLHttpRequest','WebSocket','WebTransport','EventSource','importScripts','Worker','SharedWorker','indexedDB','caches']){
            try{Object.defineProperty(self,key,{value:undefined,writable:false,configurable:false});}catch{}
          }
          const math=Object.create(Math);Object.defineProperty(math,'random',{value:rng(msg.seed)});Object.freeze(math);
          decide=load(math,undefined,undefined);
          if(typeof decide!=='function')throw Error('缺少同步 act(view) 函数');
          send({id,ready:true});
        }else if(msg.type==='act'){
          const move=decide(msg.view);
          if(move&&typeof move.then==='function')throw Error('act 必须同步返回');
          send({id,move});
        }
      }catch(error){send({id,error:String(error?.message||error).slice(0,240)});}
    };
  })();`;
  const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
  try{
    const worker=new Worker(url);
    worker.releaseURL=()=>URL.revokeObjectURL(url);
    return worker;
  }catch(error){URL.revokeObjectURL(url);throw error;}
}
