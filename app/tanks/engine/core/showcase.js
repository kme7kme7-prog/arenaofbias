// 节目模式的战场节奏；经典 2.3 规则仍由原常量定义。
export const SHOWCASE_VERSION = '2.5.0';
export const SHOWCASE_RULES = Object.freeze({
  tankHp: 2, respawnTicks: 20, fireCooldown: 6, maxBullets: 2,
  hurtTicks: 4, rapidCooldown: 4, rapidTicks: 80,
  baseOpenTick: 200, finaleTick: 450, totalTicks: 600,
  firstAnnouncement: 30, dropEvery: 100, dropWarning: 20, dropLifetime: 80,
  pulseEvery: 80, pulseDuration: 18,
});
export const INTENTS = ['advance', 'flank', 'hold', 'pursue', 'retreat', 'resupply', 'defend', 'siege'];

const ev = (tick, kind, side, x, y, text) => ({ tick, kind, side, x, y, text });
const free = (map,x,y) => x >= 0 && y >= 0 && x <= 24 && y <= 24
  && [map[y][x],map[y][x+1],map[y+1][x],map[y+1][x+1]].every(t => t === 0 || t === 4);

export function createShowcase(map) {
  const sites = [4,12,20].map(wantX => {
    let best = null;
    for (let y=9;y<=15;y++) for(let x=1;x<=23;x++) if(free(map,x,y)) {
      const cost = Math.abs(x-wantX)+Math.abs(y-12)*2;
      if(!best || cost<best.cost) best={x,y,cost};
    }
    return {x:best.x,y:best.y};
  });
  return { sites, cycle: -1, supply: null };
}

export function arenaInfo(state) {
  if (!state.showcase) return null;
  const r = SHOWCASE_RULES, tick = state.tick;
  const phase = tick >= r.finaleTick ? 'finale' : tick >= r.baseOpenTick ? 'siege' : 'contest';
  const elapsed = tick-r.finaleTick;
  const radarPulse = elapsed >= 0 && elapsed % r.pulseEvery < r.pulseDuration;
  return { mode:'showcase', phase, totalTicks:r.totalTicks, baseOpenTick:r.baseOpenTick,
    phaseEndTick:phase==='contest'?r.baseOpenTick:phase==='siege'?r.finaleTick:r.totalTicks,
    radarPulse, nextDropTick:r.firstAnnouncement + (state.showcase.cycle+1)*r.dropEvery,
    supply:state.showcase.supply ? {...state.showcase.supply} : null };
}

export function beginShowcaseTick(state, events) {
  if (!state.showcase) return;
  const r=SHOWCASE_RULES, show=state.showcase, tick=state.tick;
  for(const t of Object.values(state.tanks)) {
    if(t.hurtTicks>0)t.hurtTicks--;
    if(t.rapidTicks>0)t.rapidTicks--;
  }
  if(tick===0)events.push(ev(tick,'phase','',12,12,'争夺阶段：先抢补给，20 秒后基地开放'));
  if(tick===r.baseOpenTick)events.push(ev(tick,'phase','',12,12,'基地开放：争夺优势现在可以转为攻城'));
  if(tick===r.finaleTick)events.push(ev(tick,'phase','',12,12,'最后 15 秒：周期雷达扫场，决胜开始'));
  if(tick>=r.finaleTick && (tick-r.finaleTick)%r.pulseEvery===0)
    events.push(ev(tick,'radarPulse','',12,12,'雷达扫场：双方位置短暂公开，草丛无法遮挡'));
  const cycle=Math.floor((tick-r.firstAnnouncement)/r.dropEvery);
  if(cycle>=0 && cycle!==show.cycle) {
    show.cycle=cycle;
    const site=show.sites[((state.seed||0)+cycle)%show.sites.length];
    const appearTick=r.firstAnnouncement+cycle*r.dropEvery+r.dropWarning;
    const type=cycle%2===0?'rapid':'repair';
    show.supply={id:cycle,...site,type,appearTick,expireTick:appearTick+r.dropLifetime,available:false};
    events.push(ev(tick,'supplyIncoming','',site.x,site.y,`${type==='rapid'?'速射':'维修'}补给 2 秒后抵达`));
  }
  const s=show.supply;
  if(s && tick>=s.expireTick) {
    events.push(ev(tick,'supplyExpired','',s.x,s.y,'无人领取，补给离场')); show.supply=null;
  } else if(s && !s.available && tick>=s.appearTick) {
    s.available=true;
    events.push(ev(tick,'supplyReady','',s.x,s.y,`${s.type==='rapid'?'速射':'维修'}补给已落地`));
  }
}

export function collectSupply(state, events) {
  const s=state.showcase?.supply;
  if(!s?.available) return;
  for(const [side,t] of Object.entries(state.tanks)) {
    if(!t.onField || !(t.x<s.x+2 && t.x+2>s.x && t.y<s.y+2 && t.y+2>s.y))continue;
    if(s.type==='repair') {
      if(t.hp>=t.maxHp)continue;
      t.hp=Math.min(t.maxHp,t.hp+1);
      events.push(ev(state.tick,'repair',side,t.x,t.y,`${side} 抢到维修：装甲恢复至 ${t.hp}/${t.maxHp}`));
    } else {
      t.rapidTicks=SHOWCASE_RULES.rapidTicks;
      events.push(ev(state.tick,'rapid',side,t.x,t.y,`${side} 抢到速射：未来 8 秒开火间隔缩短`));
    }
    state.showcase.supply=null;
    return;
  }
}

export function judgeShowcaseTime(state) {
  const a=state.tanks.A,b=state.tanks.B;
  for(const [left,right] of [[a.lives,b.lives],[state.bases.A.hp,state.bases.B.hp],[a.hp,b.hp]]) {
    if(left!==right)return {result:left>right?'A':'B',reason:'ticks'};
  }
  return {result:'draw',reason:'ticks'};
}
