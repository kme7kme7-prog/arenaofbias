// ghostline：两拍前瞻 + 启发式评分。只读合法 state；本局记忆存在顶层变量里。
const DX=[0,1,0,-1],DY=[-1,0,1,0],MOVE=['up','right','down','left'];
const W={hit:1,death:4,zone:2,zdist:0.5,threat:0.5,expose:0.15,protect:0.6,later:0.85};
let memo={lastFire:-99,lastTick:-1,seenTick:-99,seenX:12,seenY:12};
let GRID_N=26,POS_N=25;
const centerPos=()=> (GRID_N-2)/2;

const passable=t=>t===0||t===4;
const covers=(tx,ty,x,y)=>x>=tx&&x<tx+2&&y>=ty&&y<ty+2;
const cheb=(ax,ay,bx,by)=>Math.max(Math.abs(ax-bx),Math.abs(ay-by));
const manhattan=(ax,ay,bx,by)=>Math.abs(ax-bx)+Math.abs(ay-by);
const inZone=(z,x,y)=>x>=z.min&&y>=z.min&&x+1<=z.max&&y+1<=z.max;
const overlap=(ax,ay,bx,by)=>ax<bx+2&&ax+2>bx&&ay<by+2&&ay+2>by;
function touchesGrass(map,x,y){return map[y][x]===4||map[y][x+1]===4||map[y+1][x]===4||map[y+1][x+1]===4;}

// 炮口：0 上 1 右 2 下 3 左，取正面两格里较小的那格
function muzzle(x,y,d){return [x+(d===1?2:d===3?-1:0),y+(d===2?2:d===0?-1:0)];}

// 移动一格：四个进入格必须是空地或草且不被车占住；失败则原地不动（转向由调用方处理）
function advance(map,x,y,m,tanks){
  if(m<0)return {x,y};
  const cells=m===0?[[x,y-1],[x+1,y-1]]:m===1?[[x+2,y],[x+2,y+1]]:m===2?[[x,y+2],[x+1,y+2]]:[[x-1,y],[x-1,y+1]];
  for(const [cx,cy] of cells){
    if(cx<0||cy<0||cx>=GRID_N||cy>=GRID_N||!passable(map[cy][cx]))return {x,y};
    if(tanks.some(t=>covers(t.x,t.y,cx,cy)))return {x,y};
  }
  return {x:x+DX[m],y:y+DY[m]};
}

// 炮弹未来路径：第 0 格是当前格，之后每拍 3 格；遇砖、钢或出界即止
function lane(map,b,n){
  const out=[];let x=b.x,y=b.y;
  for(let j=0;j<=n;j++){
    if(x<0||y<0||x>=GRID_N||y>=GRID_N)break;
    if(j>0&&(map[y][x]===1||map[y][x]===2))break;
    out.push([x,y]);x+=DX[b.dir];y+=DY[b.dir];
  }
  return out;
}

// 从 (x,y) 沿 d 射出，先碰到的车返回 {j,tank}（j 从炮口起算）；墙或出界返回 null
function firstHit(map,x,y,d,tanks){
  let [cx,cy]=muzzle(x,y,d);
  for(let j=0;j<GRID_N;j++){
    if(cx<0||cy<0||cx>=GRID_N||cy>=GRID_N)return null;
    if(map[cy][cx]===1||map[cy][cx]===2)return null;
    const tank=tanks.find(t=>covers(t.x,t.y,cx,cy));
    if(tank)return {j,tank};
    cx+=DX[d];cy+=DY[d];
  }
  return null;
}

// 地形上到达安全区的最少拍数：从安全区反向 BFS，忽略车体（车会移动）；不可达为 Infinity
function zoneField(map,z){
  const N=GRID_N,P=POS_N,dist=new Array(P*P).fill(Infinity),pred=Array.from({length:P*P},()=>[]);
  for(let y=0;y<P;y++)for(let x=0;x<P;x++)for(let m=0;m<4;m++){
    const cells=m===0?[[x,y-1],[x+1,y-1]]:m===1?[[x+2,y],[x+2,y+1]]:m===2?[[x,y+2],[x+1,y+2]]:[[x-1,y],[x-1,y+1]];
    const nx=x+DX[m],ny=y+DY[m];
    if(nx>=0&&ny>=0&&nx<P&&ny<P&&cells.every(([cx,cy])=>cx>=0&&cy>=0&&cx<GRID_N&&cy<GRID_N&&passable(map[cy][cx])))pred[ny*P+nx].push(y*P+x);
  }
  const queue=[];
  for(let y=0;y<P;y++)for(let x=0;x<P;x++)if(inZone(z,x,y)){dist[y*P+x]=0;queue.push(y*P+x);}
  for(let h=0;h<queue.length;h++){const c=queue[h];for(const p of pred[c])if(dist[p]===Infinity){dist[p]=dist[c]+1;queue.push(p);}}
  return (x,y)=>dist[y*P+x];
}

function decide(s){
  GRID_N=s.map.length;POS_N=GRID_N-1;
  const me=s.self,tick=s.tick,map=s.map,zone=s.arena.safeZone;
  if(!me.onField)return {move:'stay',fire:false,intent:'hold'};
  if(tick<memo.lastTick)memo={lastFire:-99,lastTick:-1,seenTick:-99,seenX:centerPos(),seenY:centerPos()};
  memo.lastTick=tick;

  const hp=me.hp,inv=me.invincibleTicks,hurt=me.hurtTicks,cd=me.fireCooldown;
  const foes=s.radar.tanks,solid=foes.filter(t=>!(t.invincibleTicks>0));
  const nearest=foes.reduce((b,t)=>!b||cheb(me.x,me.y,t.x,t.y)<cheb(me.x,me.y,b.x,b.y)?t:b,null);
  if(nearest){memo.seenTick=tick;memo.seenX=nearest.x;memo.seenY=nearest.y;}
  const alive=s.opponents.filter(o=>o.lives>0).length;
  const exposedNow=tick-memo.lastFire<=8;
  const open=s.arena.radarPulse;
  const nextZone={min:zone.nextMin,max:GRID_N-1-zone.nextMin};
  const zoneAt=k=>zone.nextShrinkTick!==null&&zone.nextShrinkTick<=tick+k?nextZone:zone;
  const fieldNow=zoneField(map,zone),fieldNext=zoneField(map,nextZone);
  // 出区代价：固定一拍伤害 + 按地形距离回撤的梯度，避免被墙挡住时没有方向感
  const zcost=(x,y,k)=>{
    if(inZone(zoneAt(k),x,y))return 0;
    const f=zoneAt(k)===zone?fieldNow:fieldNext;
    return W.zone+W.zdist*Math.min(f(x,y),30);
  };
  const lanes=s.radar.bullets.map(b=>lane(map,b,6));
  // 第 k 拍（0 或 1）炮弹能否打到 (fx,fy)：该拍的 4 个格子
  const hitAt=(fx,fy,k)=>lanes.some(L=>{
    for(let j=3*k;j<=3*k+3&&j<L.length;j++)if(covers(fx,fy,L[j][0],L[j][1]))return true;
    return false;
  });
  // 敌人能否看见我方车身
  const seesUs=(e,fx,fy,exposed)=>open||exposed||(cheb(e.x,e.y,fx,fy)<=6&&(cheb(e.x,e.y,fx,fy)<=2||!touchesGrass(map,fx,fy)));
  // 能用当前朝向打到 (fx,fy) 的可见敌车数
  // 朝向即可开火记 1；同线但需先转向一拍的记 0.5
  const threats=(fx,fy,exposed)=>{
    let n=0;
    for(const e of foes){
      if(!seesUs(e,fx,fy,exposed))continue;
      const blockers=solid.filter(o=>o!==e).concat([{x:fx,y:fy,me:true}]);
      for(let d=0;d<4;d++){
        const h=firstHit(map,e.x,e.y,d,blockers);
        if(h&&h.tank.me)n+=d===e.dir?1:0.5;
      }
    }
    return n;
  };
  const shotHit=(x,y,d)=>firstHit(map,x,y,d,solid);
  const shotValue=h=>{
    if(!h)return 0;
    const p=h.j<=3?0.8:h.j<=6?0.5:0.25;
    return p*(1+(h.tank.hp<=1?2.5:0));
  };
  // 终局位置的倾向：追击、补给、隐蔽、准备开火
  const place=(x,y,d,exposed)=>{
    let v=0;
    const see=foes.filter(e=>seesUs(e,x,y,exposed)).length;
    v-=0.04*see;
    if(nearest)v-=0.03*cheb(x,y,nearest.x,nearest.y);
    else if(tick-memo.seenTick<=40)v-=0.02*manhattan(x,y,memo.seenX,memo.seenY);
    else v-=0.01*manhattan(x,y,centerPos(),centerPos());
    if(shotHit(x,y,d))v+=0.3;
    if(touchesGrass(map,x,y)&&see===0&&foes.length)v+=0.1;
    const box=s.arena.supply;
    if(box){
      if(box.available){
        if(overlap(x,y,box.x,box.y))v+=box.type==='repair'?(hp<2?1.5:0.1):1.0;
        else v-=0.03*manhattan(x,y,box.x,box.y);
      }else v-=0.02*manhattan(x,y,box.x,box.y);
    }
    if(zone.nextShrinkTick!==null&&zone.nextShrinkTick-tick<=25&&!inZone(nextZone,x,y))v-=0.8;
    if(!inZone(zone,x,y))v-=W.zdist*Math.min(fieldNow(x,y),30);
    return v;
  };

  const acts=[];
  for(let m=-1;m<4;m++){acts.push({m,f:false});if(cd===0)acts.push({m,f:true});}

  let best=null;
  for(const a0 of acts){
    const inv0=inv>0&&!a0.f;
    const hurt0=Math.max(0,hurt-1);
    const p0=advance(map,me.x,me.y,a0.m,foes);
    const d0=a0.m>=0?a0.m:me.dir;
    const dmg0=hitAt(p0.x,p0.y,0)&&!inv0&&hurt0===0?1:0;
    const hurtEnd0=dmg0?4:hurt0;
    const hp1=hp-dmg0;
    let v0=-W.hit*dmg0-zcost(p0.x,p0.y,0);
    if(a0.f){
      const h=shotHit(me.x,me.y,me.dir);
      v0+=shotValue(h)-W.expose*alive-(inv>0?W.protect:0);
    }
    if(hp1<=0){
      v0-=W.death;
      if(!best||v0>best.total)best={a0,total:v0};
      continue;
    }
    const exp0=exposedNow;
    if(!inv0&&hurt0===0){
      const t0=threats(p0.x,p0.y,exp0)*W.threat;
      v0-=t0*(hp1===1?W.death+W.hit:W.hit);
    }
    const f1ok=!a0.f&&cd<=1;
    let bestTail=-Infinity;
    for(const a1 of acts){
      if(a1.f&&!f1ok)continue;
      const p1=advance(map,p0.x,p0.y,a1.m,foes);
      const d1=a1.m>=0?a1.m:d0;
      const inv1pre=a0.f?0:Math.max(0,inv-1);
      const inv1=inv1pre>0&&!a1.f;
      const hurt1=Math.max(0,hurtEnd0-1);
      const dmg1=hitAt(p1.x,p1.y,1)&&!inv1&&hurt1===0?1:0;
      const hp2=hp1-dmg1;
      const exp1=exposedNow||a0.f;
      let v1=0;
      if(a1.f){
        const h=shotHit(p0.x,p0.y,d0);
        v1+=shotValue(h)-W.expose*alive-(inv1pre>0?W.protect:0);
      }
      v1-=W.hit*dmg1+zcost(p1.x,p1.y,1);
      if(hp2<=0){
        v1-=W.death;
      }else{
        if(!inv1&&hurt1===0&&!dmg1){
          const t1=threats(p1.x,p1.y,exp1)*W.threat*0.8;
          v1-=t1*(hp2===1?W.death+W.hit:W.hit);
        }
        v1+=place(p1.x,p1.y,d1,exp1);
      }
      if(v1>bestTail)bestTail=v1;
    }
    const total=v0+W.later*bestTail;
    if(!best||total>best.total)best={a0,total};
  }

  const a0=best.a0;
  if(a0.f&&cd===0)memo.lastFire=tick;
  const p0=advance(map,me.x,me.y,a0.m,foes);
  let intent='hold';
  if(!inZone(zone,p0.x,p0.y))intent='retreat';
  else if(hitAt(me.x,me.y,0))intent='retreat';
  else if(a0.m>=0)intent=nearest?'pursue':'advance';
  return {move:a0.m<0?'stay':MOVE[a0.m],fire:a0.f,intent};
}
