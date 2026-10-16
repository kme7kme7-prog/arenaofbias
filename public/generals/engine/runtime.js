import E from './core.js';
import {createBrowserWorker} from './browser-worker.js';
export const BUDGET_MS=500, FAULT_LIMIT=50;
const isNode=typeof process!=='undefined' && !!process.versions?.node;
const WorkerType=isNode ? (await import('node:worker_threads')).Worker : Worker;

export class BotSlot {
  constructor(entry,seed,budget) { this.entry=entry; this.seed=seed; this.budget=budget; this.faults=0; this.log=[]; this.calls=0; this.maxMs=0; this.pending=new Map(); this.seq=0; this.disposed=false; }
  async ready() {
    if(this.disposed) throw new Error('比赛已取消');
    this.worker=isNode?new WorkerType(new URL('./bot-worker.js',import.meta.url),{type:'module',resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16}}):createBrowserWorker(this.entry.code);
    const receive=data=>{const job=this.pending.get(data?.id); if(job){clearTimeout(job.timer);this.pending.delete(data.id);job.resolve(data);}};
    const current=this.worker;
    const fail=()=>{if(this.worker===current)this.kill('bot 进程退出');};
    if(isNode) {this.worker.on('message',receive);this.worker.on('error',fail);this.worker.on('exit',code=>{if(code)fail();});}
    else {this.worker.onmessage=e=>receive(e.data);this.worker.onerror=fail;this.worker.onmessageerror=fail;}
    const result=await this.request({type:'init',code:this.entry.code,seed:this.seed},5000);
    if(!result.ready) {this.record(result.error||'bot 加载失败'); this.faults=FAULT_LIMIT; this.kill('bot 加载失败');}
  }
  request(data,ms) {
    return new Promise(resolve=>{
      if(!this.worker || this.disposed) {resolve({error:'bot 不可用'});return;}
      const id=++this.seq;
      const timer=setTimeout(()=>this.kill('决策超时'),ms);
      this.pending.set(id,{resolve,timer});
      try{this.worker.postMessage({...data,id});}catch{this.kill('动作消息发送失败');}
    });
  }
  record(error) {this.faults++; if(this.log.length<12)this.log.push(error);}
  async ask(view) {
    if(this.disposed || this.faults>=FAULT_LIMIT)return null;
    if(!this.worker) await this.ready();
    if(this.disposed || this.faults>=FAULT_LIMIT)return null;
    const start=performance.now();
    const result=await this.request({type:'act',view,budget:this.budget},this.budget+25);
    this.calls++;this.maxMs=Math.max(this.maxMs,performance.now()-start);
    const error=result.error || E.actionError(result.move,{H:view.h,W:view.w});
    if(error){this.record(error);return null;}
    return result.move;
  }
  kill(reason) {
    const worker=this.worker;this.worker=null;
    if(worker){worker.terminate();worker.releaseURL?.();}
    for(const p of this.pending.values()){clearTimeout(p.timer);p.resolve({error:reason});} this.pending.clear();
  }
  dispose(){this.disposed=true;this.kill('比赛已取消');}
}

export class Match {
  constructor(entries,{size=18,seed=1,maxTurns=1200,budget=BUDGET_MS}={}) {
    if(!Array.isArray(entries)||entries.length<2||entries.length>4)throw new Error('需要2–4位选手');
    if(!Number.isInteger(budget)||budget<1||budget>500)throw new Error('决策预算须为1–500ms');
    if(new Set(entries.map(e=>e.id)).size!==entries.length)throw new Error('同一作品不能重复入场');
    if(entries.filter(e=>e.human).length>1)throw new Error('最多一位本地玩家');
    this.entries=entries.map(e=>({...e,model:e.model||(e.human?'本地玩家':'未知作者'),reasoningEffort:e.reasoningEffort||'unknown'}));this.game=E.createGame({n:entries.length,size,seed,maxTurns});
    this.seed=seed;this.budget=budget;this.frames=[E.snapshot(this.game)];this.moves=[];this.stopped=false;this.busy=false;this.pendingEvents=[];
    this.slots=entries.map((e,i)=>e.human?null:new BotSlot(e,(seed^Math.imul(i+1,0x9e3779b9))>>>0,budget));
  }
  async init(){await Promise.all(this.slots.map(s=>s?.ready()));if(this.stopped)throw new Error('比赛已取消');}
  async step(humanMove=null) {
    if(this.stopped || this.game.done)return false;
    if(this.busy)throw new Error('同一对局不允许并行推进');
    this.busy=true;
    try{
      const views=this.entries.map((_,i)=>E.viewFor(this.game,i));
      const actions=await Promise.all(this.slots.map((s,i)=>this.game.eliminated[i]?null:s?s.ask(views[i]):humanMove));
      if(this.stopped)return false;
      const forfeits=[];
      this.slots.forEach((s,i)=>{if(s?.faults>=FAULT_LIMIT&&!this.game.eliminated[i]){E.surrender(this.game,i);forfeits.push({type:'forfeit',target:i,t:this.game.time+1});}});
      E.tick(this.game,actions);this.game.events.push(...forfeits,...this.pendingEvents.splice(0));
      this.moves.push(actions);this.frames.push({...E.snapshot(this.game),faults:this.slots.map(s=>s?.faults||0)});
      if(this.game.done)this.slots.forEach(s=>s?.dispose());
      return true;
    }finally{this.busy=false;}
  }
  async run(onProgress=()=>{}) {
    await this.init();
    while(!this.stopped&&!this.game.done) {await this.step();if(this.game.time%32===0){onProgress(this.game.time,this.game.maxTurns);await new Promise(r=>setTimeout(r,0));}}
    if(this.stopped)throw new Error('比赛已取消');
    return this.replay();
  }
  cancel(){this.stopped=true;this.slots.forEach(s=>s?.dispose());}
  resignHuman(){const p=this.entries.findIndex(e=>e.human);if(p<0||this.game.done||this.game.eliminated[p])return;E.surrender(this.game,p);this.pendingEvents.push({type:'resign',target:p,t:this.game.time+1});}
  replay(){return {meta:{schema:'aob-generals-replay/2',rules:E.VERSION,n:this.game.N,h:this.game.H,w:this.game.W,seed:this.seed,turns:this.game.time,maxTurns:this.game.maxTurns,budgetMs:this.budget,faultLimit:FAULT_LIMIT,complete:this.game.done,reason:this.game.reason,winner:this.game.winner,winner_bot:this.game.winner>=0?this.entries[this.game.winner].name:null,bots:this.entries.map(e=>e.name),entrants:this.entries.map(({code,...e})=>e),faults:this.slots.map(s=>s?.faults||0),diagnostics:this.slots.map(s=>s?{calls:s.calls,maxMs:Math.round(s.maxMs),errors:s.log}:null),...this.game.initialTerrain},frames:this.frames,moves:this.moves};}
}
