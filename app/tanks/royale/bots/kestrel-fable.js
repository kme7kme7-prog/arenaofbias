'use strict';
// =====================================================================
// kestrel — four-player tank brawl bot (rules 2.6.0)
//
// Main line: offset-aligned opportunist. The engine fires vertical shots down the
// tank's LEFT column and horizontal shots along its TOP row, so a position whose
// lane covers the target while the target's own lane cannot cover me exists for
// every duel (x == tx+1 for vertical duels, y == ty+1 for horizontal ones). I hold
// such positions at medium range, take shots whose hit chance is high, dodge with a
// time-expanded search over every hostile bullet lane, stay ahead of the safe zone,
// contest supplies only when I arrive first, and shift between hunting and
// preserving according to score lead, lives and phase.
//
// Written independently from the rules and engine source only. Uses only the legal
// state plus my own per-match history.
// =====================================================================

let W=26,P=25;
const DX=[0,1,0,-1],DY=[-1,0,1,0],MV=['up','right','down','left'];
const HZ=5;               // evade horizon in ticks
const LANE_MAX=12;        // longest lane I care about for aiming / exposure
let M=null;

function fresh(){
  return {tick:-1,lives:3,hp:2,seen:Object.create(null),shots:[],target:null,targetTick:-99,
    lastX:-1,lastY:-1,prevX:-1,prevY:-1,stuck:0,osc:0,plan:-1,goal:null,goalTick:-99,firedAt:-99,hurtAt:-99,spawnTick:0};
}
function inB(x,y){return x>=0&&y>=0&&x<W&&y<W;}
function cellOk(map,x,y){if(!inB(x,y))return false;const t=map[y][x];return t===0||t===4;}
function bodyOk(map,x,y){return x>=0&&y>=0&&x<=(W-2)&&y<=(W-2)&&cellOk(map,x,y)&&cellOk(map,x+1,y)&&cellOk(map,x,y+1)&&cellOk(map,x+1,y+1);}
function touches(x,y,cx,cy){return cx>=x&&cx<=x+1&&cy>=y&&cy<=y+1;}
function overlap(ax,ay,bx,by){return ax<bx+2&&ax+2>bx&&ay<by+2&&ay+2>by;}
function cheb(ax,ay,bx,by){const dx=ax>bx?ax-bx:bx-ax,dy=ay>by?ay-by:by-ay;return dx>dy?dx:dy;}
function manhattan(ax,ay,bx,by){return (ax>bx?ax-bx:bx-ax)+(ay>by?ay-by:by-ay);}
function inZone(x,y,z){return x>=z.min&&y>=z.min&&x+1<=z.max&&y+1<=z.max;}
function muzX(x,d){return d===1?x+2:d===3?x-1:x;}
function muzY(y,d){return d===2?y+2:d===0?y-1:y;}
// lane cell index -> tick offset at which the bullet settles that cell
function offsetOf(i){return i<=3?0:((i-1)/3)|0;}
// flat [x0,y0,x1,y1,...] from (x,y) inclusive along d; stops before steel/brick/out of bounds
function lane(map,x,y,d,max){const out=[];for(let i=0;i<max;i++){if(!inB(x,y))break;const t=map[y][x];if(t===1||t===2)break;out.push(x,y);x+=DX[d];y+=DY[d];}return out;}
function laneHit(ln,tx,ty,maxIdx){const n=Math.min(ln.length>>1,maxIdx+1);for(let i=0;i<n;i++){if(touches(tx,ty,ln[2*i],ln[2*i+1]))return i;}return -1;}
function hasGrass(map,x,y){return map[y][x]===4||map[y][x+1]===4||map[y+1][x]===4||map[y+1][x+1]===4;}

// ---------------------------------------------------------------- BFS over 2x2 placements
function bfs(map,sx,sy,blocked,allow){
  const dist=new Int16Array(P*P).fill(-1),first=new Int8Array(P*P).fill(-1),q=new Int16Array(P*P);
  let head=0,tail=0;const s=sy*P+sx;dist[s]=0;q[tail++]=s;
  while(head<tail){const k=q[head++],x=k%P,y=(k/P)|0,dk=dist[k];
    for(let d=0;d<4;d++){const nx=x+DX[d],ny=y+DY[d];if(nx<0||ny<0||nx>(W-2)||ny>(W-2))continue;const nk=ny*P+nx;
      if(dist[nk]>=0||!bodyOk(map,nx,ny)||blocked(nx,ny)||(allow&&!allow(nx,ny)))continue;
      dist[nk]=dk+1;first[nk]=dk===0?d:first[k];q[tail++]=nk;}}
  return {dist,first,q,n:tail};
}

// ---------------------------------------------------------------- evade solver
// grids[tau] marks cells hostile bullets settle during the bullet phase of tick now+tau-1.
function buildDanger(map,bullets){
  const grids=new Array(HZ+1).fill(null);
  for(let b=0;b<bullets.length;b++){const bl=bullets[b];const ln=lane(map,bl.x,bl.y,bl.dir,3*HZ+1);const n=ln.length>>1;
    for(let i=0;i<n;i++){const tau=offsetOf(i)+1;if(tau>HZ)break;(grids[tau]||(grids[tau]=new Uint8Array(W*W)))[ln[2*i+1]*W+ln[2*i]]=1;}}
  return grids;
}
function bodyHits(g,x,y){return !!g&&(g[y*W+x]||g[y*W+x+1]||g[(y+1)*W+x]||g[(y+1)*W+x+1])!==0;}
// returns survival depth (0..HZ) for first moves 0..3 and stay (index 4)
function evade(map,sx,sy,grids,blocked){
  const depth=[0,0,0,0,0];
  let cur=new Map();cur.set(sy*W+sx,0);
  for(let tau=1;tau<=HZ;tau++){const g=grids[tau];const nxt=new Map();
    for(const [k,mask] of cur){const px=k%W,py=(k/W)|0;
      for(let m=0;m<5;m++){let nx=px,ny=py;
        if(m<4){nx+=DX[m];ny+=DY[m];if(!bodyOk(map,nx,ny)||blocked(nx,ny)){nx=px;ny=py;}}
        if(bodyHits(g,nx,ny))continue;
        const f=tau===1?(1<<m):mask;const nk=ny*W+nx;nxt.set(nk,(nxt.get(nk)||0)|f);}}
    if(!nxt.size)break;
    let all=0;for(const v of nxt.values())all|=v;
    for(let m=0;m<5;m++)if(all&(1<<m))depth[m]=tau;
    cur=nxt;}
  return depth;
}

// ---------------------------------------------------------------- main
function think(s){
  W=s.map.length;P=W-1;
  const t=s.tick,me=s.self,map=s.map;
  if(!M||t<M.tick)M=fresh();
  if(me.lives<M.lives||t-M.tick>1){M.shots.length=0;M.target=null;M.plan=-1;M.stuck=0;M.goal=null;M.spawnTick=t;}
  M.lives=me.lives;
  if(me.hp<M.hp)M.hurtAt=t;
  M.hp=me.hp;
  if(me.x===M.lastX&&me.y===M.lastY)M.stuck++;else M.stuck=0;
  // oscillation: back on the cell I left two ticks ago
  if(me.x===M.prevX&&me.y===M.prevY&&(me.x!==M.lastX||me.y!==M.lastY))M.osc++;else if(M.stuck===0)M.osc=0;
  M.prevX=M.lastX;M.prevY=M.lastY;
  M.lastX=me.x;M.lastY=me.y;M.tick=t;
  const sx=me.x,sy=me.y,sd=me.dir;
  const zone=s.arena.safeZone;
  const enemies=s.radar.tanks||[];
  const board=s.scoreboard||[];
  const opp=s.opponents||[];

  // ---- memory of sightings with 1-tick velocity
  for(let i=0;i<enemies.length;i++){const e=enemies[i];const o=M.seen[e.id];let vx=0,vy=0;
    if(o&&t-o.tick===1){vx=e.x-o.x;vy=e.y-o.y;if(vx>1||vx<-1||vy>1||vy<-1||(vx!==0&&vy!==0)){vx=0;vy=0;}}
    const near=cheb(e.x,e.y,me.x,me.y)<=3?(o&&t-o.tick===1?o.near+1:1):0;
    M.seen[e.id]={x:e.x,y:e.y,dir:e.dir,hp:e.hp,tick:t,vx,vy,near,firedAt:o?o.firedAt:-99};}
  for(let i=0;i<opp.length;i++){const o=opp[i];if(M.seen[o.id]&&(o.lives<=0||o.respawnTicks>0||o.status!=='active'))delete M.seen[o.id];}

  // ---- my bullets in flight vs hostile bullets
  const radarB=s.radar.bullets||[];
  const used=new Uint8Array(radarB.length);
  let inFlight=0;
  const keep=[];
  for(let i=0;i<M.shots.length;i++){const sh=M.shots[i];if(sh.dieAt<t)continue;
    const k=t-sh.tick;const ex=sh.x+DX[sh.d]*3*k,ey=sh.y+DY[sh.d]*3*k;let found=-1;
    for(let j=0;j<radarB.length;j++){if(!used[j]&&radarB[j].x===ex&&radarB[j].y===ey&&radarB[j].dir===sh.d){found=j;break;}}
    if(found>=0){used[found]=1;inFlight++;keep.push(sh);}
    else if(cheb(sx,sy,ex,ey)<=6)continue;           // should be visible but is gone: hit something
    else{inFlight++;keep.push(sh);}}
  M.shots=keep;
  const hostile=[];for(let j=0;j<radarB.length;j++)if(!used[j])hostile.push(radarB[j]);
  // infer who just fired: a hostile bullet right in front of an enemy's muzzle moving its way
  for(let j=0;j<hostile.length;j++){const b=hostile[j];for(let i=0;i<enemies.length;i++){const e=enemies[i];if(e.dir!==b.dir)continue;
    const mx=muzX(e.x,e.dir),my=muzY(e.y,e.dir);const along=(b.x-mx)*DX[e.dir]+(b.y-my)*DY[e.dir],cross=(b.x-mx)*DY[e.dir]-(b.y-my)*DX[e.dir];
    if(cross===0&&along>=2&&along<=4){M.seen[e.id].firedAt=t-1;}}}

  // ---- scoreboard posture
  let myPts=0,maxOther=0,leaderId=null,aliveOthers=0;
  for(let i=0;i<board.length;i++){const r=board[i];if(r.id===me.id){myPts=r.points;continue;}if(r.lives>0&&r.status==='active'){aliveOthers++;if(r.points>=maxOther){maxOther=r.points;leaderId=r.id;}}}
  const lead=myPts-maxOther;
  const lastLife=me.lives===1;
  let aggr=0.5;
  if(lead<0)aggr+=0.25;else if(lead>=3&&t>=400)aggr-=0.3;else if(lead>0&&t>=480)aggr-=0.15;
  if(me.hp===1)aggr-=lastLife?0.45:0.25;
  if(me.rapidTicks>8)aggr+=0.2;
  if(t<60)aggr-=0.1;
  if(aggr<0.1)aggr=0.1;if(aggr>1)aggr=1;
  const careful=me.hp===1||(lastLife&&lead>=0&&t>=450);
  const immuneNow=me.hurtTicks>=2;           // bullets are absorbed by my hurt buffer this tick
  const invNow=me.invincibleTicks>0;          // bullets pass through me this tick unless I fire

  // ---- obstacles: visible enemies plus very fresh memories
  const obs=[];
  for(let i=0;i<enemies.length;i++)obs.push(enemies[i].x,enemies[i].y);
  for(const id in M.seen){const o=M.seen[id];if(t-o.tick>0&&t-o.tick<=3){let vis=false;for(let i=0;i<enemies.length;i++)if(enemies[i].id===id)vis=true;if(!vis)obs.push(o.x,o.y);}}
  const blocked=(x,y)=>{for(let i=0;i<obs.length;i+=2)if(overlap(x,y,obs[i],obs[i+1]))return true;return false;};

  // ---- zone planning
  const nextMin=zone.nextShrinkTick===null?zone.min:zone.nextMin;
  const zoneNext={min:nextMin,max:W-1-nextMin};
  const shrinkIn=zone.nextShrinkTick===null?9999:zone.nextShrinkTick-t;
  const inNow=inZone(sx,sy,zone),inNext=inZone(sx,sy,zoneNext);
  const full=bfs(map,sx,sy,blocked,null);
  let distNext=inNext?0:9999;
  if(!inNext){for(let i=0;i<full.n;i++){const k=full.q[i];const x=k%P,y=(k/P)|0;if(inZone(x,y,zoneNext)&&full.dist[k]<distNext)distNext=full.dist[k];}}
  // hard zone: cells my body must be inside after this move
  const hardZone=(!inNow&&t>=195)?zone:(shrinkIn<=distNext+4||shrinkIn<=20)?zoneNext:zone;
  const useHard=t>=195;
  const wantNext=shrinkIn<=30;
  // zone retreat field: multi-source distance to the zone I must reach, with the number of moves I still have
  let zd=null,zdCur=-1,movesAvail=999,zdOut=false;
  {
    let need=null;
    if(!inNow)need=zone;else if(!inZone(sx,sy,hardZone))need=hardZone;else if(wantNext&&!inNext)need=zoneNext;
    if(need){
      if(!inNow)movesAvail=t<200?201-t:(t%10===0?1:11-t%10);
      else movesAvail=shrinkIn+1;
      const mk=(block,keepIn)=>{const d=new Int16Array(P*P).fill(-1),q=new Int16Array(P*P);let head=0,tail=0;
        for(let y=need.min;y<=need.max-1;y++)for(let x=need.min;x<=need.max-1;x++){if(!bodyOk(map,x,y)||block(x,y))continue;const k=y*P+x;d[k]=0;q[tail++]=k;}
        while(head<tail){const k=q[head++],x=k%P,y=(k/P)|0;for(let dd=0;dd<4;dd++){const nx=x-DX[dd],ny=y-DY[dd];if(nx<0||ny<0||nx>(W-2)||ny>(W-2))continue;const nk=ny*P+nx;if(d[nk]>=0||!bodyOk(map,nx,ny)||block(nx,ny)||(keepIn&&!inZone(nx,ny,zone)&&!(nx===sx&&ny===sy)))continue;d[nk]=d[k]+1;q[tail++]=nk;}}
        return d;};
      // Route preference: inside the current zone avoiding tanks; inside ignoring tanks (they move, so wait for the
      // corridor); outside detour avoiding tanks only if I can survive the damage ticks it crosses; last resort anything.
      const keepIn=t>=199;
      zd=mk(blocked,keepIn);zdCur=zd[sy*P+sx];
      if(keepIn&&(zdCur<0||zdCur>movesAvail)){
        const zf=mk(()=>false,true),cf=zf[sy*P+sx];
        if(cf>=0&&cf+2<=movesAvail){zd=zf;zdCur=cf;}
        else{const z2=mk(blocked,false),c2=z2[sy*P+sx];
          const dmgTicks=c2<0?99:Math.floor((t+c2)/10)-Math.floor(t/10)+(t%10===0?1:0);
          if(c2>=0&&c2<movesAvail&&dmgTicks<me.hp){zd=z2;zdCur=c2;zdOut=true;}
          else if(cf>=0){zd=zf;zdCur=cf;}}}
      if(zdCur<0){zd=mk(()=>false,false);zdCur=zd[sy*P+sx];zdOut=true;}
    }
  }

  // ---- enemy lanes (current facing) and firing windows
  const foes=[];
  for(let i=0;i<enemies.length;i++){const e=enemies[i];
    const ln=lane(map,muzX(e.x,e.dir),muzY(e.y,e.dir),e.dir,LANE_MAX);
    // truncate at the first other tank body that would absorb the bullet
    let cut=ln.length>>1;
    for(let k=0;k<(ln.length>>1);k++){let hit=false;for(let j=0;j<enemies.length;j++){if(j!==i&&enemies[j].invincibleTicks===0&&touches(enemies[j].x,enemies[j].y,ln[2*k],ln[2*k+1])){hit=true;break;}}if(hit){cut=k;break;}}
    const o=M.seen[e.id];const cooling=o&&t-o.firedAt<=4;
    const row=board.find(r=>r.id===e.id)||{points:0,lives:3};
    foes.push({e,ln,cut,cooling,pts:row.points,lives:row.lives,vx:o?o.vx:0,vy:o?o.vy:0});}

  // threat of standing at (x,y): sum over foes of how likely a shot lands before I can react.
  // A shot from <=3 cells lands the same tick it is fired, so being aligned with a close enemy
  // (one turn away from a shot) is nearly as bad as being in its facing lane right now.
  function exposure(x,y,skipId){let thr=0;
    for(let i=0;i<foes.length;i++){const f=foes[i];if(f.e.id===skipId)continue;const w=f.cooling?0.3:1;const e=f.e;
      const h=laneHit(f.ln,x,y,Math.min(f.cut-1,9));
      if(h>=0){thr+=w*(h<=3?1:h<=6?0.4:0.15);continue;}
      let hv=-1;
      if(e.x===x||e.x===x+1){const d=y<e.y?0:2;hv=laneHit(lane(map,muzX(e.x,d),muzY(e.y,d),d,10),x,y,9);}
      else if(e.y===y||e.y===y+1){const d=x<e.x?3:1;hv=laneHit(lane(map,muzX(e.x,d),muzY(e.y,d),d,10),x,y,9);}
      if(hv>=0){thr+=w*(hv<=3?0.75:hv<=6?0.32:0.12);continue;}
      // one sidestep away from alignment at close range
      const dd=cheb(x,y,e.x,e.y);
      if(dd<=4&&((e.x===x-1||e.x===x+2)||(e.y===y-1||e.y===y+2)))thr+=w*0.2;
    }
    return thr;}

  // ---- target selection
  let target=null,tScore=-1e9;
  for(let i=0;i<foes.length;i++){const f=foes[i],e=f.e;
    let v=12-cheb(sx,sy,e.x,e.y)*0.9+(e.hp===1?6:0)+(e.id===M.target&&t-M.targetTick<=10?3:0)-(e.invincibleTicks>2?9:0)-(e.rapidTicks>0?1:0);
    if(lead<0&&e.id===leaderId)v+=2;
    if(f.lives===1&&e.hp===1)v+=2;
    // facing me and able to shoot soon is a reason to pick it (resolve the duel) only if I am healthy
    const h=laneHit(f.ln,sx,sy,9);if(h>=0)v+=me.hp===2?1:-3;
    if(v>tScore){tScore=v;target=f;}}
  // hunted: an enemy has stayed within 3 cells for several ticks. Running from a same-speed chaser only
  // gets me pinned against walls, so fight it for the one-way aligned shot instead.
  let hunter=null;
  for(let i=0;i<foes.length;i++){const o=M.seen[foes[i].e.id];if(o&&o.near>=3&&(!hunter||o.near>M.seen[hunter.e.id].near))hunter=foes[i];}
  if(hunter&&foes.length<=2&&hunter.e.invincibleTicks===0)target=hunter;
  const duel=!!hunter&&target===hunter;
  if(target){M.target=target.e.id;M.targetTick=t;}
  let ghost=null;
  if(!target&&M.target&&M.seen[M.target]&&t-M.seen[M.target].tick<=12){const o=M.seen[M.target];if(cheb(sx,sy,o.x,o.y)<=11)ghost=o;}
  if(!ghost&&!target){let best=null;for(const id in M.seen){const o=M.seen[id];if(t-o.tick<=25&&(!best||o.tick>best.tick))best=o;}ghost=best;}

  // ---- fire decision (uses pre-move position and facing)
  const canFire=me.fireCooldown===0&&inFlight<2;
  let fire=false,fireValue=0;
  const myLane=lane(map,muzX(sx,sd),muzY(sy,sd),sd,LANE_MAX);
  if(canFire&&myLane.length){
    // first non-invincible enemy body along my lane
    let victim=null,hitIdx=-1;
    for(let k=0;k<(myLane.length>>1)&&!victim;k++){for(let i=0;i<foes.length;i++){const e=foes[i].e;if(e.invincibleTicks>0)continue;if(touches(e.x,e.y,myLane[2*k],myLane[2*k+1])){victim=foes[i];hitIdx=k;break;}}}
    if(victim){const e=victim.e;
      if(e.hurtTicks>=2)fireValue=0;
      else{
        // The target moves after my shot is placed but before it resolves. Every opponent here steps out of a
        // lane it sees me facing, so enumerate its five moves: escape step weighted highest, then its velocity.
        const reach=hitIdx<=3?3:hitIdx<=6?6:hitIdx<=9?9:12;
        let pStay=0,total=0;
        for(let m=0;m<5;m++){
          let nx=e.x,ny=e.y;
          if(m<4){nx+=DX[m];ny+=DY[m];if(!bodyOk(map,nx,ny)||overlap(nx,ny,sx,sy)){nx=e.x;ny=e.y;}
            for(let j=0;j<foes.length;j++)if(foes[j]!==victim&&overlap(nx,ny,foes[j].e.x,foes[j].e.y)){nx=e.x;ny=e.y;}}
          const inLane=laneHit(myLane,nx,ny,reach)>=0;
          const moved=nx!==e.x||ny!==e.y;
          let w;
          if(m===4)w=0.15;
          else if(!moved)w=0.04;                       // blocked moves collapse into standing still
          else if(!inLane)w=0.8;                       // the one escape step: what a lane-aware bot takes
          else w=0.12;
          if(m<4&&DX[m]===victim.vx&&DY[m]===victim.vy&&(victim.vx||victim.vy))w+=0.2;
          if(m<4&&m===e.dir&&!moved)w+=0.02;
          total+=w;if(inLane)pStay+=w;}
        let p=total>0?pStay/total:0;
        if(hitIdx>3)p*=hitIdx<=6?0.55:hitIdx<=9?0.35:0.2;   // it also sees the bullet coming next tick
        fireValue=p*(e.hp===1?3:1);
        let need=0.42;
        if(e.hp===1)need=0.6;                              // value is tripled for a kill, so this is p>=0.2
        if(careful&&victim.ln&&laneHit(victim.ln,sx,sy,6)>=0&&e.hp===2&&hitIdx>=2)need+=0.15; // trading shots at 1 hp is bad
        if(invNow)need=me.invincibleTicks<=1?need:Math.max(need,1.4);
        if(fireValue>=need)fire=true;
      }}
    // intercept a bullet coming straight at me along my own lane
    if(!fire){for(let j=0;j<hostile.length;j++){const b=hostile[j];if(b.dir!==(sd+2)%4)continue;
      const mx=myLane[0],my=myLane[1];const along=(b.x-mx)*DX[sd]+(b.y-my)*DY[sd],cross=(b.x-mx)*DY[sd]-(b.y-my)*DX[sd];
      if(cross===0&&along>=0&&along<=6&&(myLane.length>>1)>along){fire=true;break;}}}
    // clear a brick that blocks my planned route when nothing else is going on
    if(!fire&&!foes.length&&M.stuck>=4&&inB(muzX(sx,sd),muzY(sy,sd))&&map[muzY(sy,sd)][muzX(sx,sd)]===1)fire=true;
  }

  // ---- supply valuation
  const box=s.arena.supply;
  let boxWant=0,boxCells=null;
  if(box&&t+1<box.expireTick&&inZone(box.x,box.y,wantNext?zoneNext:zone)){
    if(box.type==='repair'&&me.hp<me.maxHp)boxWant=lastLife?18:13;
    else if(box.type==='rapid'&&me.rapidTicks<20)boxWant=6;
    if(boxWant>0){
      let eta=9999;boxCells=[];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=box.x+dx,y=box.y+dy;if(x<0||y<0||x>(W-2)||y>(W-2))continue;const k=y*P+x;if(full.dist[k]>=0){boxCells.push(k);if(full.dist[k]<eta)eta=full.dist[k];}}
      const arrive=Math.max(t+eta,box.appearTick);
      if(eta>=9999||arrive>=box.expireTick)boxWant=0;
      else{
        let rival=9999,crowd=0;
        for(let i=0;i<enemies.length;i++){const d=manhattan(enemies[i].x,enemies[i].y,box.x,box.y);if(d<rival)rival=d;if(d<=5)crowd++;}
        for(const id in M.seen){const o=M.seen[id];if(t-o.tick>8)continue;const d=manhattan(o.x,o.y,box.x,box.y);if(d<rival)rival=d;}
        const myArrive=arrive-t;
        if(rival<=myArrive+1&&!(box.type==='repair'&&me.hp===1&&myArrive<=rival+2))boxWant*=0.5;
        if(crowd>=2&&me.hp===1&&box.type!=='repair')boxWant=0;
        if(eta>14)boxWant-=(eta-14)*0.5;
        if(boxWant<0)boxWant=0;
      }}}

  // ---- goal selection over reachable placements
  const tgt=target?target.e:null;
  const band=duel?2.5:careful?7:(aggr>=0.8?3.5:5.5);
  const keepAway=careful&&!duel;
  let goalK=-1,goalS=-1e9;
  const hunt=ghost?{x:ghost.x,y:ghost.y}:{x:Math.floor((W-2)/2),y:Math.floor((W-2)/2)};
  const prevGoal=M.goal&&t-M.goalTick<=6?M.goal:null;
  for(let i=0;i<full.n;i++){const k=full.q[i];const x=k%P,y=(k/P)|0,d0=full.dist[k];
    if(useHard&&!inZone(x,y,hardZone))continue;
    if(d0>22)continue;
    let sc=-d0*0.55;
    const edge=Math.min(x-zoneNext.min,y-zoneNext.min,zoneNext.max-1-x,zoneNext.max-1-y);
    if(wantNext&&!inZone(x,y,zoneNext))sc-=10+(30-shrinkIn)*0.6;
    // walls and zone edges are where a chaser pins me; keep a margin, strongly once the shrink is near
    if(edge<=0)sc-=t>=150?12:4;else if(edge===1)sc-=t>=150?5:1.5;
    const pen=(careful?1.6:1)*(1-aggr*0.3);
    sc-=exposure(x,y,null)*8*pen;
    if(tgt){
      let bestH=99,oneWay=false,bestD=-1;
      for(let d=0;d<4;d++){
        if(d===0||d===2){if(x!==tgt.x&&x!==tgt.x+1)continue;if((d===0)!==(y>tgt.y))continue;}
        else{if(y!==tgt.y&&y!==tgt.y+1)continue;if((d===3)!==(x>tgt.x))continue;}
        const ln=lane(map,muzX(x,d),muzY(y,d),d,LANE_MAX);const h=laneHit(ln,tgt.x,tgt.y,LANE_MAX);
        if(h>=0&&h<bestH){bestH=h;bestD=d;}}
      const dd=cheb(x,y,tgt.x,tgt.y);
      if(bestH<99){
        const canHitMe=(bestD===0||bestD===2)?(tgt.x===x||tgt.x===x+1):(tgt.y===y||tgt.y===y+1);
        oneWay=!canHitMe;
        let gain=(bestH<=6?9:bestH<=9?5:2)*(0.5+aggr*0.6);
        if(tgt.hp===1)gain*=1.35;
        if(oneWay)gain+=4.5;
        if(bestD===sd)gain+=1.2;
        sc+=gain;}
      sc-=Math.abs(dd-band)*0.7;
      if(dd<=1&&!(tgt.hp===1&&me.hp===2))sc-=6;
      if(keepAway&&dd<4)sc-=(4-dd)*1.5;
    }else if(!boxWant){
      sc-=manhattan(x,y,hunt.x,hunt.y)*0.35;
    }
    for(let i2=0;i2<foes.length;i2++){const o=foes[i2].e;if(tgt&&o.id===tgt.id)continue;const dd=cheb(x,y,o.x,o.y);if(dd<=2)sc-=5;else if(dd<=4)sc-=1.5;if(keepAway&&dd<4)sc-=(4-dd)*1.5;}
    if(t<500&&hasGrass(map,x,y))sc+=careful?2.5:0.8;
    if(boxWant&&boxCells){let on=false;for(let b=0;b<boxCells.length;b++)if(boxCells[b]===k){on=true;break;}if(on)sc+=boxWant;}
    if(prevGoal&&prevGoal.x===x&&prevGoal.y===y)sc+=1.5;
    if(sc>goalS){goalS=sc;goalK=k;}}
  let goal=null;
  if(goalK>=0){goal={x:goalK%P,y:(goalK/P)|0};M.goal=goal;M.goalTick=t;}

  // ---- immediate move choice
  let grids=null;
  if(hostile.length){grids=buildDanger(map,hostile);
    // hurt buffer absorbs bullets while hurtTicks-tau>=1; respawn protection passes them while invincibleTicks>=tau (unless I fire now)
    const safeTau=Math.max(me.hurtTicks-1,fire?0:me.invincibleTicks);
    for(let tau=1;tau<=Math.min(HZ,safeTau);tau++)grids[tau]=null;
    let any=false;for(let tau=1;tau<=HZ;tau++)if(grids[tau]){any=true;break;}
    if(!any)grids=null;}
  const depth=grids?evade(map,sx,sy,grids,blocked):[HZ,HZ,HZ,HZ,HZ];
  let rev=null;
  if(goal&&!(goal.x===sx&&goal.y===sy))rev=bfs(map,goal.x,goal.y,blocked,null);
  let bestM=4,bestS=-1e9;
  const rnd=s.random>>>0;
  const MS=[null,null,null,null,null];
  for(let m=0;m<5;m++){
    let nx=sx,ny=sy,turnOnly=false;
    if(m<4){nx+=DX[m];ny+=DY[m];if(!bodyOk(map,nx,ny)||blocked(nx,ny)){nx=sx;ny=sy;turnOnly=true;}} // a blocked move still turns the tank
    let sc=turnOnly?-0.6:0;
    // bullets
    const dp=depth[m];
    if(dp<HZ)sc-=(HZ-dp)*18;
    if(dp===0)sc-=120;
    // zone: never step out of the current zone on a damage tick; otherwise only when the retreat route needs the detour
    if(t>=199&&inNow&&!inZone(nx,ny,zone)){
      if(t%10===0||!zdOut)sc-=250;
      else{const left=zd?zd[ny*P+nx]:99;const dmg=left<0?9:Math.floor((t+left)/10)-Math.floor(t/10);sc-=dmg>=me.hp?250:12+dmg*20;}}
    if(useHard&&inZone(sx,sy,hardZone)&&!inZone(nx,ny,hardZone))sc-=70;
    if(zd&&zdCur>0){const zn=zd[ny*P+nx];const prog=zn<0?-2:zdCur-zn;const slack=movesAvail-zdCur;const hp1=me.hp===1?2.5:1;
      if(slack<=1)sc+=prog>0?0:prog===0?-200:-260;
      else if(slack<=4)sc+=prog>0?0:(prog===0?-50:-80)*hp1;
      else if(slack<=10)sc+=prog>0?0:(prog===0?-12:-20)*hp1;
      else if(prog<0)sc-=3;}
    // enemy guns
    const shield=(immuneNow||(invNow&&!fire))?0.05:1;
    const w=(careful?1.6:1)*shield;
    sc-=exposure(nx,ny,null)*12*w;
    // progress
    if(rev){const dk=rev.dist[ny*P+nx];if(dk<0)sc-=25;else sc-=dk*2.2;}
    // walls and the coming zone edge: a chaser pins me there, and the shrink kills me there
    {const ed=Math.min(nx-zoneNext.min,ny-zoneNext.min,zoneNext.max-1-nx,zoneNext.max-1-ny);
      if(ed<=0)sc-=t>=150?8:2;else if(ed===1)sc-=t>=150?3:0.5;}
    // alignment after the move: can I fire next tick from here?
    if(tgt){const f=m<4?m:sd;const px=tgt.x+(target?target.vx:0),py=tgt.y+(target?target.vy:0);
      if(((f===0||f===2)&&(nx===px||nx===px+1))||((f===1||f===3)&&(ny===py||ny===py+1))){
        const ln=lane(map,muzX(nx,f),muzY(ny,f),f,LANE_MAX);const h=laneHit(ln,px,py,9);
        if(h>=0&&tgt.hurtTicks<=2){let g=h<=3?5.5:h<=6?3.5:1.5;const canHitMe=(f===0||f===2)?(px===nx||px===nx+1):(py===ny||py===ny+1);if(!canHitMe)g+=duel?4:2;if(tgt.hp===1)g*=1.4;sc+=g;}}}
    // shoot and scoot: after firing, leave my own line
    if(fire&&m<4&&m!==sd&&m!==(sd+2)%4)sc+=1.5;
    // anti-stutter: do not keep bouncing between two cells, do not keep pushing into a wall
    if(M.stuck>=3&&(m===4||m===M.plan))sc-=4;
    if(turnOnly&&m===sd)sc-=3;
    if(M.osc>=2&&m<4&&M.plan>=0&&m===(M.plan+2)%4)sc-=6;
    if(m===M.plan)sc+=0.4;
    if(m===4&&me.fireCooldown>0&&!tgt)sc-=0.3;
    sc+=((rnd>>>(m*5))&7)*0.02;
    MS[m]=Math.round(sc*10)/10;
    if(sc>bestS){bestS=sc;bestM=m;}}

  // if the chosen move is a turn away from a shot I am taking now, that is fine: fire resolves first.
  let intent='advance';
  if(fire)intent='pursue';
  else if(depth[bestM]<HZ&&grids)intent='defend';
  else if(!inNow||(useHard&&!inZone(sx,sy,hardZone)))intent='retreat';
  else if(boxWant&&goal&&boxCells&&boxCells.indexOf(goal.y*P+goal.x)>=0)intent='resupply';
  else if(careful)intent='retreat';
  else if(tgt)intent=bestM===4?'hold':'flank';
  else if(bestM===4)intent='hold';
  if(fire){M.shots.push({tick:t,x:muzX(sx,sd),y:muzY(sy,sd),d:sd,dieAt:t+offsetOf(myLane.length>>1)});M.firedAt=t;}
  // offline debugging hook (undefined inside the match sandbox)
  if(typeof KDBG==='function')KDBG({t,sx,sy,sd,inNow,inNext,shrinkIn,hardZone,zdCur,movesAvail,duel,zdOut,zone:{min:zone.min,max:zone.max},downIn:inZone(sx,sy+1,zone),zd:zd?[0,1,2,3,4].map(m=>{const nx=sx+(m<4?DX[m]:0),ny=sy+(m<4?DY[m]:0);return nx<0||ny<0||nx>(W-2)||ny>(W-2)?null:zd[ny*P+nx];}):null,goal,goalS,bestM,bestS,fire,fireValue,depth,careful,aggr,lead,target:tgt?tgt.id:null,boxWant,hostile:hostile.length,moveScores:MS});
  M.plan=bestM;
  return {move:bestM<4?MV[bestM]:'stay',fire,intent};
}

function decide(state){
  try{const a=think(state);if(a&&(MV.indexOf(a.move)>=0||a.move==='stay'))return {move:a.move,fire:a.fire===true,intent:a.intent};}catch(e){}
  return {move:'stay',fire:false,intent:'hold'};
}
