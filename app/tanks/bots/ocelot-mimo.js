// Ocelot 机会猎手 —— 四人乱斗 2.6
// 主线：保命优先的机会收割。打冷却空档与残血目标，抢高价值补给，
// 终盘按实时排名切换攻守；受伤或落后时借地形与草丛脱离。
const DX=[0,1,0,-1],DY=[-1,0,1,0],MV=['up','right','down','left'];
let MEM=null;

function mem0(){
  return {tick:-9999,lives:9,px:-1,py:-1,stuck:0,seen:{},own:[],tgt:''};
}

function fits(map,x,y){
  if(x<0||y<0||x>24||y>24)return false;
  const a=map[y][x],b=map[y][x+1],c=map[y+1][x],d=map[y+1][x+1];
  return (a===0||a===4)&&(b===0||b===4)&&(c===0||c===4)&&(d===0||d===4);
}
function ov(a,b){return a.x<b.x+2&&a.x+2>b.x&&a.y<b.y+2&&a.y+2>b.y;}
function inZ(x,y,z){return x>=z.min&&y>=z.min&&x+1<=z.max&&y+1<=z.max;}
function cheb(ax,ay,bx,by){const dx=ax>bx?ax-bx:bx-ax,dy=ay>by?ay-by:by-ay;return dx>dy?dx:dy;}
function man(a,b){return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);}
function muz(x,y,d){return {x:x+(d===1?2:d===3?-1:0),y:y+(d===2?2:d===0?-1:0)};}

// 从 (x,y,d) 的逻辑炮口射出，命中 (tx,ty) 车身返回步数，否则 -1。
// blockers 里的其他车身会先挡弹。
function raySteps(map,x,y,d,tx,ty,blockers,skipId){
  const m=muz(x,y,d),dx=DX[d],dy=DY[d];
  let cx=m.x,cy=m.y;
  for(let k=0;k<26;k++){
    if(cx<0||cy<0||cx>25||cy>25)return -1;
    const c=map[cy][cx];
    if(c===1||c===2)return -1;
    if(cx>=tx&&cx<=tx+1&&cy>=ty&&cy<=ty+1)return k;
    if(blockers)for(let i=0;i<blockers.length;i++){
      const b=blockers[i];
      if(b.id!==skipId&&cx>=b.x&&cx<=b.x+1&&cy>=b.y&&cy<=b.y+1)return -1;
    }
    cx+=dx;cy+=dy;
  }
  return -1;
}

// 子弹占据格的时间偏移（0=本拍结算路径），99=安全。
function threatGrid(map,bullets,horizon){
  const g=new Int8Array(676);g.fill(99);
  for(let i=0;i<bullets.length;i++){
    const b=bullets[i];
    let cx=b.x,cy=b.y;const dx=DX[b.dir],dy=DY[b.dir];let dead=false;
    for(let t=0;t<=horizon&&!dead;t++){
      for(let st=0;st<4;st++){
        if(cx<0||cy<0||cx>25||cy>25){dead=true;break;}
        const k=cy*26+cx;if(g[k]>t)g[k]=t;
        const c=map[cy][cx];
        if(c===1||c===2){dead=true;break;}
        if(st<3){cx+=dx;cy+=dy;}
      }
    }
  }
  return g;
}

function bfsField(map,sx,sy,blocked){
  const dist=new Int16Array(625);dist.fill(-1);
  const first=new Int8Array(625);first.fill(-1);
  const q=new Int32Array(625);let head=0,tail=0;
  if(sx<0||sy<0||sx>24||sy>24)return {dist,first};
  const s0=sy*25+sx;
  dist[s0]=0;q[tail++]=s0;
  while(head<tail){
    const cur=q[head++],x=cur%25,y=(cur/25)|0;
    for(let d=0;d<4;d++){
      const nx=x+DX[d],ny=y+DY[d];
      if(nx<0||ny<0||nx>24||ny>24)continue;
      const ni=ny*25+nx;
      if(dist[ni]>=0||!fits(map,nx,ny))continue;
      let hit=false;
      if(blocked)for(let i=0;i<blocked.length;i++)if(ov({x:nx,y:ny},blocked[i])){hit=true;break;}
      if(hit)continue;
      dist[ni]=dist[cur]+1;
      first[ni]=dist[cur]===0?d:first[cur];
      q[tail++]=ni;
    }
  }
  return {dist,first};
}

// 我在 (x,y) 的子弹危险分：近拍权重大。
function bulletRisk(tg,x,y){
  let r=0;
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){
    const t=tg[(y+j)*26+(x+i)];
    if(t===0)r+=60;else if(t===1)r+=22;else if(t===2)r+=9;else if(t===3)r+=4;else if(t===4)r+=2;
  }
  return r;
}

// 敌方炮线威胁：当前朝向的射线权重大，其余朝向需要先转身。
function laneRisk(map,x,y,enemies,now){
  let r=0;
  for(let i=0;i<enemies.length;i++){
    const e=enemies[i];
    if(e.inv>0)continue;
    // 他刚开火：冷却没好，这一两拍打不出子弹。
    if(e.fs>=0&&now-e.fs<(e.rapid>0?3:5))continue;
    for(let d=0;d<4;d++){
      const k=raySteps(map,e.x,e.y,d,x,y,null,null);
      if(k<0)continue;
      const w=d===e.d?7:2.6;
      r+=w*(k<=2?1.6:1)*(e.rapid>0?1.35:1);
    }
  }
  return r;
}

function standing(s){
  const me=s.scoreboard.find(r=>r.id===s.self.id);
  if(!me)return 2;
  let better=0;
  for(const r of s.scoreboard){
    if(r.id===me.id||r.lives<=0||r.status==='error'||r.status==='timeout')continue;
    if(r.points>me.points||(r.points===me.points&&(r.kills>me.kills||(r.kills===me.kills&&(r.lives>me.lives||(r.lives===me.lives&&r.hp>me.hp))))))better++;
  }
  return better+1;
}

function decide(state){
  try{return think(state);}
  catch(e){return {move:'stay',fire:false,intent:'hold'};}
}

function think(s){
  const me=s.self,now=s.tick,map=s.map;
  if(!MEM||now<MEM.tick||now-MEM.tick>2||me.lives<MEM.lives)MEM=mem0();
  if(me.x===MEM.px&&me.y===MEM.py)MEM.stuck++;else MEM.stuck=0;
  MEM.px=me.x;MEM.py=me.y;MEM.tick=now;MEM.lives=me.lives;

  // ---- 记忆：目击、速度、开火痕迹 ----
  const vis=s.radar.tanks;
  for(const o of s.opponents)if(o.lives<=0||o.respawnTicks>0)delete MEM.seen[o.id];
  for(const e of vis){
    const old=MEM.seen[e.id];
    const dt=old?now-old.t:99;
    const vx=(old&&dt===1&&Math.abs(e.x-old.x)<=1)?e.x-old.x:0;
    const vy=(old&&dt===1&&Math.abs(e.y-old.y)<=1)?e.y-old.y:0;
    const rec=MEM.seen[e.id]||{fs:-999};
    MEM.seen[e.id]={x:e.x,y:e.y,d:e.dir,hp:e.hp,inv:e.invincibleTicks,hurt:e.hurtTicks,
      rapid:e.rapidTicks,t:now,vx,vy,fs:rec.fs};
  }
  // 雷达弹与敌方炮口方向对上，说明他刚开火，进入冷却空档。
  for(const b of s.radar.bullets){
    for(const id in MEM.seen){
      const e=MEM.seen[id];
      if(b.dir!==e.d)continue;
      const m=muz(e.x,e.y,e.d);
      const k=(b.x-m.x)*DX[e.d]+(b.y-m.y)*DY[e.d];
      const px=b.x-m.x-DX[e.d]*k,py=b.y-m.y-DY[e.d]*k;
      if(px===0&&py===0&&k>=0&&k<=3&&now-e.fs>6)e.fs=now-(k>0?1:0);
    }
  }
  // 自己的弹三拍后可能自伤，纳入威胁。
  MEM.own=MEM.own.filter(o=>now-o.t<=9);
  const threatBullets=s.radar.bullets.slice();
  for(const o of MEM.own){
    const age=now-o.t;
    if(age<3)continue;
    const cx=o.x+DX[o.d]*3*age,cy=o.y+DY[o.d]*3*age;
    if(cx>=0&&cy>=0&&cx<=25&&cy<=25)threatBullets.push({x:cx,y:cy,dir:o.d});
  }
  const tg=threatGrid(map,threatBullets,4);

  // ---- 安全区：临近收缩按下一圈限制目标格 ----
  const z=s.arena.safeZone;
  const shrinkIn=z.nextShrinkTick===null?999:z.nextShrinkTick-now;
  const nextZ=z.nextShrinkTick===null?null:{min:z.nextMin,max:25-z.nextMin};
  const hardZ=(nextZ&&shrinkIn<=32)?nextZ:z;
  const softZ=hardZ;

  // ---- 记忆里的对手列表（可见 + 幽灵）----
  const live=[];
  for(const e of vis)live.push({...MEM.seen[e.id],id:e.id,ghost:false});
  const ghosts=[];
  for(const id in MEM.seen){
    if(live.some(e=>e.id===id))continue;
    const g=MEM.seen[id];
    if(now-g.t<=6)ghosts.push({...g,id,ghost:true});
  }
  ghosts.sort((a,b)=>(now-a.t)-(now-b.t)||cheb(me.x,me.y,a.x,a.y)-cheb(me.x,me.y,b.x,b.y));

  const rank=standing(s);
  const leading=rank===1;
  const trailing=rank>=2;
  const phaseEnd=now>=440;
  // 只有第 1 名算赢：落后时回避等于放弃，宁可带伤追分。
  const chase=trailing&&now>=360;
  const topPoints=Math.max(...s.scoreboard.map(r=>r.points));

  // ---- 目标选择 ----
  let target=null,best=-1e9;
  for(const e of live){
    if(e.inv>0)continue;
    let v=30-cheb(me.x,me.y,e.x,e.y)*3;
    if(e.hp===1)v+=55;
    if(e.hurt>=2)v-=30;
    const row=s.opponents.find(o=>o.id===e.id);
    if(row&&row.points>=topPoints-1)v+=14;
    if(e.fs>=0&&now-e.fs<(e.rapid>0?3:5))v+=10;
    if(e.id===MEM.tgt)v+=12;
    if(phaseEnd&&trailing)v+=8;
    if(v>best){best=v;target=e;}
  }
  if(!target&&ghosts.length)target=ghosts[0];
  if(target&&!target.ghost)MEM.tgt=target.id;
  else if(!target)MEM.tgt='';

  // ---- 开火判断：只打当前拍真能扣甲的目标 ----
  let fire=false;
  if(me.fireCooldown===0&&target&&!target.ghost&&target.inv===0&&target.hurt<2){
    // 弹速三格：目标在弹到之前还能走 arr 步。横穿弹道的只信预判线，
    // 沿弹道走或静止时当前线就够。
    const moving=!!(target.vx||target.vy);
    const range=cheb(me.x,me.y,target.x,target.y);
    const arr=Math.min(2,Math.max(1,Math.ceil((range-1)/3)));
    const curHit=raySteps(map,me.x,me.y,me.dir,target.x,target.y,live,target.id)>=0;
    let hit=curHit;
    if(moving){
      const px=Math.max(0,Math.min(24,target.x+target.vx*arr));
      const py=Math.max(0,Math.min(24,target.y+target.vy*arr));
      const predHit=raySteps(map,me.x,me.y,me.dir,px,py,live,target.id)>=0;
      const parallel=me.dir%2===0?target.vx===0:target.vy===0;
      hit=predHit||(curHit&&parallel);
    }
    if(hit){
      let v=8;
      if(target.hp===1)v+=26;
      const row=s.opponents.find(o=>o.id===target.id);
      if(row&&row.points>=topPoints-1)v+=6;
      if(target.fs>=0&&now-target.fs<(target.rapid>0?3:5))v+=5;
      if(me.invincibleTicks>0)v+=2;
      if(me.hurt>=2)v+=3;
      if(leading&&phaseEnd)v-=9;
      if(me.hp===1&&!chase)v-=7;
      if(chase)v+=3;
      if(v>=(chase?4:8))fire=true;
    }
  }

  // ---- 补给价值 ----
  const box=s.arena.supply;
  let wantBox=null;
  if(box&&(box.available||now+3>=box.appearTick)&&now<box.expireTick-2){
    let crowd=0;
    for(const e of live)if(cheb(e.x,e.y,box.x,box.y)<=6)crowd++;
    for(const id in MEM.seen){const g=MEM.seen[id];if(now-g.t<=6&&cheb(g.x,g.y,box.x,box.y)<=6)crowd++;}
    const myD=cheb(me.x,me.y,box.x,box.y);
    let near=99;
    for(const e of live)near=Math.min(near,cheb(e.x,e.y,box.x,box.y));
    let val=0;
    if(box.type==='rapid')val=me.rapidTicks>25?2:9;
    else val=me.hp===1?9:me.hp<me.maxHp?5:1;
    if(crowd<=1&&myD<=near+1&&val>=5&&myD<=14)wantBox=box;
  }

  // ---- 模式：躲弹 > 进圈 > 领先保命 > 抢补给 > 交战 > 搜猎 ----
  const curDanger=bulletRisk(tg,me.x,me.y);
  const weak=me.hp===1&&!chase;
  const mode=(curDanger>=22&&me.invincibleTicks===0)?'dodge'
    :(!inZ(me.x,me.y,hardZ)?'zone'
    :((phaseEnd&&leading)||(weak&&!(target&&target.hp===1&&curDanger<22))?'evade'
    :(wantBox?'box':(target?'fight':'stage'))));

  const blocked=live;
  const field=bfsField(map,me.x,me.y,blocked);

  let goal=null,gDir=-1;
  let bestScore=-1e9;
  const mid=(hardZ.min+hardZ.max)/2;
  const wasInHard=inZ(me.x,me.y,hardZ);
  for(let y=hardZ.min;y<=hardZ.max-1;y++)for(let x=hardZ.min;x<=hardZ.max-1;x++){
    if(!fits(map,x,y))continue;
    const reach=field.dist[y*25+x];
    if(reach<0)continue;
    if(blocked.some(b=>ov({x,y},b)))continue;
    let sc=-reach*0.9;
    sc-=bulletRisk(tg,x,y)*(mode==='dodge'?5:1.6);
    sc-=laneRisk(map,x,y,live,now)*(mode==='evade'||mode==='dodge'?1.5:me.hp===1?1.8:1);
    // 边缘留出退路，按软圈提前向内挪
    const margin=Math.min(x-softZ.min,y-softZ.min,softZ.max-(x+1),softZ.max-(y+1));
    sc+=Math.min(margin,3)*(mode==='evade'?2.2:1.1);
    // 草丛与掩体
    let grass=0;
    for(let j=0;j<2;j++)for(let i=0;i<2;i++)if(map[y+j][x+i]===4)grass++;
    sc+=grass*(now<500&&mode!=='fight'?2.4:0.6);
    if(mode==='evade'){
      let sep=99;
      for(const e of live)sep=Math.min(sep,cheb(x,y,e.x,e.y));
      for(const id in MEM.seen){const g=MEM.seen[id];if(now-g.t<=12)sep=Math.min(sep,cheb(x,y,g.x,g.y));}
      sc+=Math.min(sep,10)*2.6;
      sc-=Math.abs(x-mid)+Math.abs(y-mid);
    }else if(mode==='box'&&wantBox){
      sc-=man({x,y},wantBox)*2.2;
    }else if(mode==='fight'&&target){
      const tx=target.x+(target.vx||0),ty=target.y+(target.vy||0);
      if(target.ghost){sc-=cheb(x,y,tx,ty)*1.8;}
      else{
        let angle=-1;
        for(let d=0;d<4;d++){
          const k=raySteps(map,x,y,d,tx,ty,live,target.id);
          if(k>=0&&(angle<0||k<angle))angle=k;
        }
        if(angle>=0){
          sc+=24-Math.abs(angle-5)*2;
          if(target.hp===1)sc-=angle*0.3;
          if(me.hp===1)sc-=angle*0.8;
          if(leading&&phaseEnd)sc-=14;
        }else sc-=cheb(x,y,tx,ty)*1.1;
        // 不贴脸：保留弹道与撤离空间
        if(cheb(x,y,target.x,target.y)<=2)sc-=10;
      }
      let sep=99;
      for(const e of live)if(e.id!==target.id)sep=Math.min(sep,cheb(x,y,e.x,e.y));
      sc+=Math.min(sep,6)*1.2;
    }else{
      // 搜猎/躲弹：朝最近目击点靠拢，离威胁留出距离
      sc-=Math.abs(x-mid)+Math.abs(y-mid);
      let sep=99;
      for(const e of live)sep=Math.min(sep,cheb(x,y,e.x,e.y));
      sc+=Math.min(sep,8)*(mode==='dodge'?0.8:1.4);
      if(mode==='stage'){
        let recent=null;
        for(const id in MEM.seen){const g=MEM.seen[id];if(!recent||g.t>recent.t)recent=g;}
        if(recent&&now-recent.t<=25&&!leading)sc-=cheb(x,y,recent.x,recent.y)*0.9;
      }
    }
    if(x===me.x&&y===me.y&&mode!=='dodge')sc+=2.2;
    if(sc>bestScore){bestScore=sc;goal={x,y};}
  }
  if(!goal)goal={x:me.x,y:me.y};

  // ---- 动作：BFS 首步 + 即时威胁复核 ----
  let plan=goal.x===me.x&&goal.y===me.y?-1:field.first[goal.y*25+goal.x];
  // 需要转向开火时优先把炮口摆正
  if(mode==='fight'&&target&&!target.ghost&&!fire){
    const tx=target.x+(target.vx||0),ty=target.y+(target.vy||0);
    for(let d=0;d<4;d++){
      if(d===me.dir)continue;
      if(raySteps(map,me.x,me.y,d,tx,ty,live,target.id)>=0){gDir=d;break;}
    }
    if(gDir>=0&&plan===-1)plan=gDir;
  }
  // 复核：候选动作落地后的即时危险
  let bestA=plan>=0?plan:4,bestA2=1e9;
  for(let a=0;a<5;a++){
    const d=a<4?a:-1;
    const nx=d>=0?me.x+DX[d]:me.x,ny=d>=0?me.y+DY[d]:me.y;
    if(d>=0&&!fits(map,nx,ny))continue;
    if(d>=0&&blocked.some(b=>ov({x:nx,y:ny},b)))continue;
    let v=bulletRisk(tg,nx,ny)*4+laneRisk(map,nx,ny,live,now)*(me.hp===1?2.8:1.6);
    if(d>=0&&wasInHard&&!inZ(nx,ny,hardZ))v+=200;
    if(d>=0&&!wasInHard&&!inZ(nx,ny,hardZ))v+=25;
    if(d===plan)v-=7;
    if(gDir>=0&&d===gDir)v-=3;
    if(nx===goal.x&&ny===goal.y)v-=2;
    if(d<0&&plan>=0)v+=1.2;
    if(v<bestA2){bestA2=v;bestA=a;}
  }
  let move=bestA<4?MV[bestA]:'stay';
  if(MEM.stuck>=3){
    let pick=-1,pv=1e9;
    for(let d=0;d<4;d++){
      const nx=me.x+DX[d],ny=me.y+DY[d];
      if(!fits(map,nx,ny)||!inZ(nx,ny,hardZ)||blocked.some(b=>ov({x:nx,y:ny},b)))continue;
      const v=bulletRisk(tg,nx,ny)*4+laneRisk(map,nx,ny,live,now)*2+((d+((s.random>>>3)%4))%4)*0.4;
      if(v<pv){pv=v;pick=d;}
    }
    if(pick>=0&&(move==='stay'||MEM.stuck>=4))move=MV[pick];
  }

  // ---- 意图如实上报 ----
  let intent='hold';
  if(mode==='dodge'||mode==='zone')intent='retreat';
  else if(mode==='evade')intent=fire?'pursue':'defend';
  else if(mode==='box')intent='resupply';
  else if(mode==='fight')intent=target&&target.ghost?'advance':fire?'pursue':'flank';
  else intent='hold';

  if(fire){
    const m=muz(me.x,me.y,me.dir);
    MEM.own.push({x:m.x,y:m.y,d:me.dir,t:now});
    if(MEM.own.length>12)MEM.own.shift();
  }
  return {move,fire,intent};
}
