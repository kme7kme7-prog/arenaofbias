import {BRAWL_SIDES,rankBrawl,brawlZone} from '../core/brawl.js';
import {BRAWL_MAPS} from '../core/brawl-maps.js';
import {INTENTS} from '../core/showcase.js';
import {validateStage} from '../core/stage.js';

export function validateBrawlReplay(r){
  const fail=()=>{throw new Error('四人回放格式不正确，或数据不完整');};
  const num=(n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b;
  const side=s=>BRAWL_SIDES.includes(s);
  const cell=p=>p&&num(p.x,-1,26)&&num(p.y,-1,26);
  const m=r?.meta;
  if(m?.stage)validateStage(m.stage);
  if(!m||!['2.5.0','2.6.0'].includes(m.engineVersion)||m.mode!=='brawl'||m.totalTicks!==600||m.initialLives!==3||m.tankHp!==2
    ||!(BRAWL_MAPS.some(x=>x.id===m.mapId)||(m.mapId==='custom'&&m.stage))||!num(m.seed,0,4294967295)||!BRAWL_SIDES.every(id=>num(m.seatSlots?.[id],0,3))
    ||new Set(Object.values(m.seatSlots)).size!==4)fail();
  if(!Array.isArray(r.frames)||r.frames.length<1||r.frames.length>600||r.frames.length!==m.tickEnd)fail();
  for(const [i,f] of r.frames.entries()){
    if(!f||f.tick!==i||!Array.isArray(f.map)||f.map.length!==26||!f.map.every(row=>Array.isArray(row)&&row.length===26&&row.every(t=>num(t,0,4))))fail();
    for(const id of BRAWL_SIDES){const t=f.tanks?.[id],s=f.scores?.[id];
      if(!t||!num(t.x,0,24)||!num(t.y,0,24)||!num(t.dir,0,3)||!num(t.lives,0,3)||!num(t.hp,0,2)||t.maxHp!==2
        ||!num(t.onField,0,1)||!num(t.respawnTicks,0,20)||!num(t.invincibleTicks,0,16)||!num(t.fireCooldown,0,6)
        ||!num(t.hurtTicks,0,4)||!num(t.rapidTicks,0,80)||!['unknown',...INTENTS].includes(t.intent))fail();
      if(t.onField&&(!t.lives||!t.hp||t.respawnTicks))fail();
      if(!s||!num(s.damage,0,1000)||!num(s.kills,0,9)||!num(s.deaths,0,3)||s.points!==s.damage+s.kills*2||!['active','eliminated','error','timeout'].includes(s.status))fail();
    }
    const a=f.arena;
    const radarPulse=m.engineVersion==='2.5.0'?i>=450&&(i-450)%50<20:i>=500||(i>=450&&i<470);
    if(!a||a.mode!=='brawl'||a.totalTicks!==600||a.phase!==(i>=450?'finale':i>=200?'collapse':'skirmish')
      ||JSON.stringify(a.safeZone)!==JSON.stringify(brawlZone(i))||a.radarPulse!==radarPulse||!num(a.nextDropTick,30,630))fail();
    if(a.supply!==null){const b=a.supply;if(!b||!num(b.id,0,5)||!num(b.x,0,24)||!num(b.y,0,24)||!['rapid','repair'].includes(b.type)
      ||!num(b.appearTick,45,545)||!num(b.expireTick,b.appearTick+1,625)||typeof b.available!=='boolean')fail();}
    if(!Array.isArray(f.bullets)||f.bullets.length>8||!f.bullets.every(b=>cell(b)&&side(b.owner)&&num(b.dir,0,3)))fail();
    if(!Array.isArray(f.brickBreaks)||f.brickBreaks.length>8||!f.brickBreaks.every(cell))fail();
    if(!Array.isArray(f.traces)||f.traces.length>8||!f.traces.every(t=>side(t.owner)&&num(t.dir,0,3)&&Array.isArray(t.cells)&&t.cells.length<=4&&t.cells.every(cell)))fail();
  }
  const kinds=['phase','zone','radarPulse','supplyIncoming','supplyReady','supplyExpired','fire','protectionEnd','armorHit','frag','hit','brick','death','zoneHit','eliminated','respawn','rapid','repair','end','timeout','error'];
  let prev=-1;
  if(!Array.isArray(r.events)||r.events.length>24000)fail();
  for(const e of r.events){if(!e||!num(e.tick,0,m.tickEnd-1)||e.tick<prev||!kinds.includes(e.kind)||!(e.side===''||side(e.side))||!cell(e)
    ||typeof e.text!=='string'||e.text.length>500||(e.target!==undefined&&!side(e.target)))fail();prev=e.tick;}
  if(!r.events.some(e=>e.kind==='end')||!['ticks','survivor'].includes(r.reason))fail();
  const last=r.frames.at(-1),ranking=rankBrawl(last);
  const winners=ranking.filter(x=>x.rank===1&&!['timeout','error'].includes(x.status)).map(x=>x.id);
  if(JSON.stringify(r.ranking)!==JSON.stringify(ranking)||JSON.stringify(r.winners)!==JSON.stringify(winners)||r.result!==(winners.length===1?winners[0]:'draw'))fail();
  const alive=Object.values(last.tanks).filter(t=>t.lives>0).length;
  if(r.reason==='ticks'&&(m.tickEnd!==600||alive<=1)||r.reason==='survivor'&&alive>1)fail();
  if(r.names&&!BRAWL_SIDES.every(id=>typeof r.names[id]==='string'&&r.names[id].length<=80))fail();
  return r;
}
