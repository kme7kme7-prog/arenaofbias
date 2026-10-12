import {applyMove,applyFire,runBulletPhase} from './sim.js';
import {createPrng} from './prng.js';
import {normalizeAction} from './judge.js';
import {tankTouchesGrass,chebyshev} from './radar.js';
import {SHOWCASE_RULES} from './showcase.js';
import {loadBrawlMap,freeBrawlCell,BRAWL_SPAWNS} from './brawl-maps.js';
import {validateStage,validateSeats} from './stage.js';

export const BRAWL_VERSION='2.6.0';
export const BRAWL_SIDES=['A','B','C','D'];
export const BRAWL_RULES=Object.freeze({...SHOWCASE_RULES,
  lives:3,totalTicks:600,shrinkTick:200,finaleTick:450,shrinkEvery:50,maxMargin:9,
  firstAnnouncement:30,dropWarning:15,dropEvery:100,dropLifetime:80,
  pulseEvery:50,pulseDuration:20,finalRadarTick:500,closeRevealRange:2,shotRevealTicks:8,zoneDamageEvery:10,
});
const ev=(s,kind,side,text,x=-1,y=-1)=>({tick:s.tick,kind,side,text,x,y});
const overlap=(a,b)=>a.x<b.x+2&&a.x+2>b.x&&a.y<b.y+2&&a.y+2>b.y;
const copyMap=map=>map.map(row=>row.slice());
const stay=()=>({move:'stay',fire:false});

export function brawlZone(tick){
  const r=BRAWL_RULES;
  const margin=tick<r.shrinkTick?0:Math.min(r.maxMargin,2+Math.floor((tick-r.shrinkTick)/r.shrinkEvery));
  const nextShrinkTick=margin===r.maxMargin?null:tick<r.shrinkTick?r.shrinkTick:r.shrinkTick+(Math.floor((tick-r.shrinkTick)/r.shrinkEvery)+1)*r.shrinkEvery;
  return {min:margin,max:25-margin,nextShrinkTick,nextMin:margin===0?2:Math.min(r.maxMargin,margin+1)};
}
export function insideBrawlZone(tank,zone){return tank.x>=zone.min&&tank.y>=zone.min&&tank.x+1<=zone.max&&tank.y+1<=zone.max;}
function pulse(tick){
  const r=BRAWL_RULES;
  return tick>=r.finalRadarTick||(tick>=r.finaleTick&&(tick-r.finaleTick)%r.pulseEvery<r.pulseDuration);
}
function order(s){const k=s.tick%4;return [...BRAWL_SIDES.slice(k),...BRAWL_SIDES.slice(0,k)];}
export function createBrawl(mapId='crossroads',seed=2,stage=null){
  const setup=stage?validateStage(stage):null;
  const map=setup?setup.map:loadBrawlMap(mapId);
  const spawns=setup?setup.spawns:BRAWL_SPAWNS;
  return {tick:0,mapId,seed:seed>>>0,map,spawns,bases:{},bullets:[],combatRules:BRAWL_RULES,
    tanks:Object.fromEntries(BRAWL_SIDES.map(id=>[id,{...spawns[id],lives:3,hp:2,maxHp:2,onField:1,
      respawnTicks:0,invincibleTicks:0,fireCooldown:0,hurtTicks:0,rapidTicks:0,hitThisTick:0,intent:'unknown'}])),
    scores:Object.fromEntries(BRAWL_SIDES.map(id=>[id,{points:0,damage:0,kills:0,deaths:0,status:'active'}])),
    exposedUntil:Object.fromEntries(BRAWL_SIDES.map(id=>[id,-1])),
    supply:null,cycle:-1,lastMargin:0};
}
function arena(s){return {mode:'brawl',totalTicks:600,phase:s.tick>=450?'finale':s.tick>=200?'collapse':'skirmish',
  safeZone:brawlZone(s.tick),radarPulse:pulse(s.tick),supply:s.supply?{...s.supply}:null,
  nextDropTick:BRAWL_RULES.firstAnnouncement+(s.cycle+1)*BRAWL_RULES.dropEvery};}
function publicScore(s,id){return {id,...s.scores[id],lives:s.tanks[id].lives,respawnTicks:s.tanks[id].respawnTicks};}
export function buildBrawlPlayerState(s,id){
  const t=s.tanks[id],reveal=pulse(s.tick);
  return {mode:'brawl',tick:s.tick,mapId:s.mapId,map:copyMap(s.map),
    random:createPrng(s.seed^Math.imul(s.tick+1,0x9e3779b9)^Math.imul(BRAWL_SIDES.indexOf(id)+1,0x1234567)).next(),
    self:{id,x:t.x,y:t.y,dir:t.dir,lives:t.lives,hp:t.hp,maxHp:t.maxHp,onField:t.onField,
      respawnTicks:t.respawnTicks,invincibleTicks:t.invincibleTicks,fireCooldown:t.fireCooldown,hurtTicks:t.hurtTicks,rapidTicks:t.rapidTicks},
    opponents:BRAWL_SIDES.filter(side=>side!==id).map(side=>publicScore(s,side)),
    scoreboard:BRAWL_SIDES.map(side=>publicScore(s,side)),
    radar:{tanks:BRAWL_SIDES.filter(side=>side!==id).filter(side=>{
      const e=s.tanks[side],dist=chebyshev(t.x,t.y,e.x,e.y);
      return e.onField&&(reveal||s.exposedUntil[side]>=s.tick||(dist<=6&&(dist<=BRAWL_RULES.closeRevealRange||!tankTouchesGrass(s.map,e))));
    })
      .map(side=>{const e=s.tanks[side];return {id:side,x:e.x,y:e.y,dir:e.dir,hp:e.hp,maxHp:e.maxHp,invincibleTicks:e.invincibleTicks,hurtTicks:e.hurtTicks,rapidTicks:e.rapidTicks};}),
      bullets:s.bullets.filter(b=>chebyshev(t.x,t.y,b.x,b.y)<=6).map(b=>({x:b.x,y:b.y,dir:b.dir}))},arena:arena(s)};
}
function tankSnapshot(t){const {hitThisTick:_hitThisTick,...rest}=t;return {...rest};}
export function snapshotBrawl(s,brickBreaks=[],traces=[]){return {tick:s.tick,map:copyMap(s.map),
  tanks:Object.fromEntries(BRAWL_SIDES.map(id=>[id,tankSnapshot(s.tanks[id])])),
  scores:Object.fromEntries(BRAWL_SIDES.map(id=>[id,{...s.scores[id]}])),arena:arena(s),
  bullets:s.bullets.map(({x,y,dir,owner})=>({x,y,dir,owner})),brickBreaks,traces};}
function closestFree(s,target,zone,avoidTanks=false){
  let best=null;
  for(let y=zone.min;y<zone.max;y++)for(let x=zone.min;x<zone.max;x++){
    if(!freeBrawlCell(s.map,x,y))continue;
    const p={x,y};if(avoidTanks&&Object.values(s.tanks).some(t=>t.onField&&overlap(p,t)))continue;
    const cost=Math.abs(x-target.x)+Math.abs(y-target.y);
    if(!best||cost<best.cost)best={x,y,cost};
  }
  return best;
}
function begin(s,events){
  const r=BRAWL_RULES,zone=brawlZone(s.tick);
  for(const t of Object.values(s.tanks)){if(t.hurtTicks)t.hurtTicks--;if(t.rapidTicks)t.rapidTicks--;}
  if(s.tick===0)events.push(ev(s,'phase','','四人开场：争夺补给，20 秒后开始缩圈'));
  if(zone.min!==s.lastMargin){s.lastMargin=zone.min;events.push(ev(s,'zone','',`安全区缩小：边界移至第 ${zone.min} 格`));}
  if(s.tick===450)events.push(ev(s,'phase','','最后 15 秒：持续缩圈，50 秒后全场雷达常亮'));
  if(s.tick===450)events.push(ev(s,'radarPulse','','雷达扫场：所有在场坦克暂时可见'));
  if(s.tick===r.finalRadarTick)events.push(ev(s,'radarPulse','','终局雷达常亮：所有在场坦克持续可见'));
  const cycle=Math.floor((s.tick-r.firstAnnouncement)/r.dropEvery);
  if(cycle>=0&&cycle!==s.cycle){
    s.cycle=cycle;
    const sites=[{x:12,y:12},{x:8,y:12},{x:12,y:8},{x:16,y:12},{x:12,y:16}];
    const p=closestFree(s,sites[(cycle+s.seed)%sites.length],zone);
    if(p){const appearTick=r.firstAnnouncement+cycle*r.dropEvery+r.dropWarning;
      s.supply={id:cycle,x:p.x,y:p.y,type:cycle%2?'repair':'rapid',appearTick,expireTick:appearTick+r.dropLifetime,available:false};
      events.push(ev(s,'supplyIncoming','',`${s.supply.type==='rapid'?'速射':'维修'}补给 1.5 秒后落地`,p.x,p.y));}
  }
  const box=s.supply;
  if(box&&(s.tick>=box.expireTick||!insideBrawlZone(box,zone))){events.push(ev(s,'supplyExpired','','补给离场',box.x,box.y));s.supply=null;}
  else if(box&&!box.available&&s.tick>=box.appearTick){box.available=true;events.push(ev(s,'supplyReady','',`${box.type==='rapid'?'速射':'维修'}补给已落地`,box.x,box.y));}
}
function finishDeathsAndRespawns(s,events){
  const zone=brawlZone(s.tick);
  for(const id of order(s)){
    const t=s.tanks[id];
    if(t.hitThisTick){
      t.hitThisTick=0;t.hurtTicks=0;t.rapidTicks=0;t.invincibleTicks=0;s.scores[id].deaths++;
      if(t.lives>0)t.respawnTicks=BRAWL_RULES.respawnTicks;
      else{t.respawnTicks=0;s.scores[id].status='eliminated';events.push(ev(s,'eliminated',id,`${id} 生命耗尽，出局`,t.x,t.y));}
      continue;
    }
    if(t.respawnTicks>0&&--t.respawnTicks===0){
      const origin=s.spawns?.[id]||BRAWL_SPAWNS[id];
      const p=closestFree(s,origin,zone,true);
      if(!p){t.respawnTicks=1;continue;}
      Object.assign(t,{x:p.x,y:p.y,dir:origin.dir,onField:1,hp:2,hurtTicks:0,rapidTicks:0,fireCooldown:0,invincibleTicks:16,intent:'advance'});
      events.push(ev(s,'respawn',id,`${id} 在安全区内复活`,t.x,t.y));
    }else if(t.onField&&t.invincibleTicks>0)t.invincibleTicks--;
  }
}
function collect(s,events){
  const box=s.supply;if(!box?.available)return;
  for(const id of order(s)){
    const t=s.tanks[id];if(!t.onField||!overlap(t,box))continue;
    if(box.type==='repair'){
      if(t.hp===t.maxHp)continue;t.hp++;events.push(ev(s,'repair',id,`${id} 抢到维修，装甲恢复`,t.x,t.y));
    }else{t.rapidTicks=80;events.push(ev(s,'rapid',id,`${id} 抢到速射，持续 8 秒`,t.x,t.y));}
    s.supply=null;break;
  }
}
export function rankBrawl(s){
  // 出局者不能凭早期刷分压过仍有生命的选手；同分不使用槽位强行决胜。
  const key=id=>{const t=s.tanks[id],sc=s.scores[id];return [Number(!['timeout','error'].includes(sc.status)),Number(t.lives>0),sc.points,sc.kills,t.lives,t.hp];};
  const compare=(a,b)=>{const ka=key(a),kb=key(b);for(let i=0;i<ka.length;i++)if(ka[i]!==kb[i])return kb[i]-ka[i];return 0;};
  const ids=BRAWL_SIDES.toSorted(compare);
  let rank=1;
  return ids.map((id,i)=>{if(i&&compare(id,ids[i-1])!==0)rank=i+1;return {...publicScore(s,id),hp:s.tanks[id].hp,rank};});
}
export function stepBrawl(s,actions){
  const events=[];begin(s,events);
  const turnOrder=order(s);
  for(const id of turnOrder){
    const a=normalizeAction(actions[id]);s.tanks[id].intent=a.intent||'unknown';
    const before=events.length;applyFire(s,id,a.fire,events);
    if(events.length>before&&events.at(-1).kind==='fire')s.exposedUntil[id]=s.tick+BRAWL_RULES.shotRevealTicks;
  }
  for(const id of turnOrder)applyMove(s,id,normalizeAction(actions[id]).move);
  const bullet=runBulletPhase(s);events.push(...bullet.events);
  const zone=brawlZone(s.tick);
  if(s.tick>=BRAWL_RULES.shrinkTick&&s.tick%BRAWL_RULES.zoneDamageEvery===0){
    for(const id of turnOrder){const t=s.tanks[id];if(!t.onField||insideBrawlZone(t,zone))continue;
      t.hp=Math.max(0,t.hp-1);events.push(ev(s,'zoneHit',id,`${id} 位于危险区，装甲 -1`,t.x,t.y));
      if(t.hp===0){t.lives--;t.onField=0;t.hitThisTick=1;events.push(ev(s,'death',id,`${id} 被危险区击毁，剩余 ${t.lives} 命`,t.x,t.y));}
    }
  }
  for(const t of Object.values(s.tanks))if(t.fireCooldown>0)t.fireCooldown--;
  finishDeathsAndRespawns(s,events);collect(s,events);
  const alive=BRAWL_SIDES.filter(id=>s.tanks[id].lives>0);
  const reason=alive.length<=1?'survivor':s.tick>=599?'ticks':null;
  const ranking=reason?rankBrawl(s):null,winners=ranking?.filter(row=>row.rank===1&&!['timeout','error'].includes(row.status)).map(row=>row.id);
  if(reason)events.push(ev(s,'end',winners.length===1?winners[0]:'',winners.length?`${winners.join('、')} ${winners.length>1?'并列获胜':'获胜'} · ${reason==='survivor'?'生存结算':'60 秒到时结算'}`:'全部 bot 运行失败，无有效胜者'));
  return {frame:snapshotBrawl(s,bullet.brickBreaks,bullet.traces),events,end:reason?{reason,ranking,winners,result:winners.length===1?winners[0]:'draw'}:null};
}
export async function runBrawl({mapId='crossroads',seed=2,botSources,adapterFactory,signal,onProgress,stage=null,seatSlots:fixedSeats=null}){
  if(!Array.isArray(botSources)||botSources.length!==4||botSources.some(s=>typeof s!=='string'))throw new Error('四人场需要四份 bot 源码');
  const setup=stage?validateStage(stage):null;
  const s=createBrawl(mapId,seed,setup),rng=createPrng(s.seed),slots=[0,1,2,3];
  for(let i=3;i>0;i--){const j=rng.next()%(i+1);[slots[i],slots[j]]=[slots[j],slots[i]];}
  const seatSlots=fixedSeats?validateSeats(fixedSeats):Object.fromEntries(BRAWL_SIDES.map((id,i)=>[id,slots[i]]));
  const adapters={},frames=[],events=[];
  const cancelled=()=>{if(signal?.aborted)throw Object.assign(new Error('对局已取消'),{code:'cancelled'});};
  const dispose=()=>{for(const a of Object.values(adapters))a?.dispose?.();};
  const disqualify=(id,e)=>{
    const t=s.tanks[id],why=e?.code==='timeout'?'timeout':'error';
    Object.assign(t,{lives:0,hp:0,onField:0,respawnTicks:0,invincibleTicks:0});s.scores[id].status=why;
    s.bullets=s.bullets.filter(b=>b.owner!==id);adapters[id]?.dispose?.();
    events.push(ev(s,why,id,`${id} ${why==='timeout'?'超时':'异常'}出局：${String(e.message||e).slice(0,160)}`));
  };
  signal?.addEventListener('abort',dispose,{once:true});
  try{
    cancelled();
    for(const id of BRAWL_SIDES){try{adapters[id]=await adapterFactory(botSources[seatSlots[id]]);await adapters[id].ready;}catch(e){cancelled();disqualify(id,e);}cancelled();}
    let end;
    while(s.tick<600){
      cancelled();const actions={};
      for(const id of order(s)){
        actions[id]=stay();if(!s.tanks[id].onField)continue;
        try{actions[id]=normalizeAction(await adapters[id].decide(buildBrawlPlayerState(s,id)));cancelled();}
        catch(e){cancelled();disqualify(id,e);}
      }
      cancelled();const stepped=stepBrawl(s,actions);events.push(...stepped.events);frames.push(stepped.frame);onProgress?.(s.tick);
      if(stepped.end){end=stepped.end;break;}s.tick++;
    }
    return {...end,frames,events,meta:{engineVersion:BRAWL_VERSION,mode:'brawl',mapId,seed:s.seed,seatSlots,tickEnd:frames.length,totalTicks:600,initialLives:3,tankHp:2,...(setup?{stage:setup}:{})}};
  }finally{signal?.removeEventListener('abort',dispose);dispose();}
}
