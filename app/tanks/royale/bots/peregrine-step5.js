// peregrine · 四人坦克乱斗 2.6 参赛作品
// 主线：机会收割 + 弹道/射线风险控制 + 缩圈预走 + 终局取舍。
// 只读取合法输入与自身历史；全部同步执行，无外部依赖。

var DX=[0,1,0,-1],DY=[-1,0,1,0],MVN=['up','right','down','left'];
var N=26,P=25;
var MEM={gridSize:25,tick:-999,lives:-1,seen:{},shotAt:{},cad:{},bullets:[],prevB:null,goal:null,
  target:'',lastX:-1,lastY:-1,lastAct:-1,stuck:0,lastFire:-999};
var _d=new Int16Array(P*P),_f=new Int8Array(P*P),_qx=new Int16Array(P*P),_qy=new Int16Array(P*P);
var _tb={x:0,y:0,dir:0};
var _tk=[];          // 复用的在场敌方坦克数组
var _nz={min:0,max:25}; // 复用的下一安全区
function nextZoneOf(z){
  if(z.nextShrinkTick===null)return null;
  _nz.min=z.nextMin;_nz.max=z.nextMax ?? N-1-z.nextMin;return _nz;
}

function decide(state){
  if(state&&state.map){N=state.map.length;P=N-1;_d=new Int16Array(P*P);_f=new Int8Array(P*P);_qx=new Int16Array(P*P);_qy=new Int16Array(P*P);_nz.max=N-1;if(MEM.gridSize!==P)MEM={gridSize:P,tick:-999,lives:-1,seen:{},shotAt:{},cad:{},bullets:[],prevB:null,goal:null,target:'',lastX:-1,lastY:-1,lastAct:-1,stuck:0,lastFire:-999};}
  try{return core(state);}catch(e){return {move:'stay',fire:false,intent:'hold'};}
}
// 装载预热：用一份最小合法战场把整条决策链路跑一遍。
// 函数首次被调用才会编译，若不预热，编译成本会落在第一拍的 50 毫秒预算里。
;(function(){
  try{
    var fm=[],i,j;
    for(i=0;i<26;i++){fm.push([]);for(j=0;j<26;j++)fm[i].push(0);}
    fm[13][13]=2;
    core({mode:'brawl',tick:0,mapId:'crossroads',map:fm,random:1,
      self:{id:'A',x:2,y:22,dir:0,lives:3,hp:2,maxHp:2,onField:1,respawnTicks:0,
        invincibleTicks:0,fireCooldown:0,hurtTicks:0,rapidTicks:0},
      opponents:[{id:'B',points:0,damage:0,kills:0,deaths:0,status:'active',lives:3,respawnTicks:0}],
      scoreboard:[],radar:{tanks:[],bullets:[]},
      arena:{mode:'brawl',totalTicks:600,phase:'skirmish',radarPulse:false,
        safeZone:{min:0,max:25,nextShrinkTick:200,nextMin:2},nextDropTick:30,supply:null}});
  }catch(e){}
  MEM.tick=-999;MEM.lives=-1;MEM.seen={};MEM.shotAt={};MEM.cad={};MEM.bullets=[];MEM.prevB=null;
  MEM.target='';MEM.lastX=-1;MEM.lastY=-1;MEM.lastAct=-1;MEM.stuck=0;MEM.lastFire=-999;MEM.goal=null;
})();
function clamp1(v){return v>1?1:(v<0?-1:v);}
function inZone(x,y,z){return x>=z.min&&y>=z.min&&x+1<=z.max&&y+1<=z.max;}
function pass(map,x,y){
  if(x<0||y<0||x>N-2||y>N-2)return false;
  var a=map[y][x],b=map[y][x+1],c=map[y+1][x],d=map[y+1][x+1];
  return (a===0||a===4)&&(b===0||b===4)&&(c===0||c===4)&&(d===0||d===4);
}
function tanksOf(s){
  _tk.length=0;
  for(var i=0;i<s.radar.tanks.length;i++)if(s.radar.tanks[i].id!==s.self.id)_tk.push(s.radar.tanks[i]);
  return _tk;
}
function freeCell(map,x,y,tk){
  if(!pass(map,x,y))return false;
  for(var i=0;i<tk.length;i++){var t=tk[i];if(x<t.x+2&&x+2>t.x&&y<t.y+2&&y+2>t.y)return false;}
  return true;
}
function muzzleOf(x,y,d){
  return d===0?[x,y-1]:(d===1?[x+2,y]:(d===2?[x,y+2]:[x-1,y]));
}
// 从 (x,y) 朝 d 的射线（含炮口偏移、最多 4 格）首个被击中的敌人下标；无敌者穿透。
function shotFirst(map,x,y,d,list){
  var mx,my;
  if(d===0){mx=x;my=y-1;}else if(d===1){mx=x+2;my=y;}else if(d===2){mx=x;my=y+2;}else{mx=x-1;my=y;}
  for(var k=0;k<4;k++){
    var cx=mx+DX[d]*k,cy=my+DY[d]*k;
    if(cx<0||cy<0||cx>=N||cy>=N)return -1;
    var t=map[cy][cx];
    if(t===1||t===2)return -1;
    for(var i=0;i<list.length;i++){
      var e=list[i];
      if(cx>=e.x&&cx<=e.x+1&&cy>=e.y&&cy<=e.y+1){
        if(e.inv>0)break;
        return i;
      }
    }
  }
  return -1;
}
// 预测各联系人下一拍位置（预测格被占或不可通行则视为留在原地）。
var _pp=[];
function predictPositions(map,list){
  var out=_pp,i,j,cn=0;
  for(i=0;i<list.length;i++){
    var e=list[i],px=e.x,py=e.y;
    if(e.vx||e.vy){
      var qx=e.x+e.vx,qy=e.y+e.vy,blocked=false;
      for(j=0;j<list.length;j++){
        if(j===i)continue;
        var o=list[j];
        if(qx<o.x+2&&qx+2>o.x&&qy<o.y+2&&qy+2>o.y){blocked=true;break;}
      }
      if(!blocked&&pass(map,qx,qy)){px=qx;py=qy;}
    }
    var ps=out[cn]||(out[cn]={});
    ps.x=px;ps.y=py;ps.inv=e.inv;ps.vx=e.vx;ps.vy=e.vy;ps.moved=(px!==e.x||py!==e.y);
    cn++;
  }
  out.length=cn;
  return out;
}
// 沿射线找第一个会被击中的联系人：0 无 / 1 现位 / 2 预测位。无敌者穿透。
function rayVictim(map,x,y,d,list,preds){
  var mx,my;
  if(d===0){mx=x;my=y-1;}else if(d===1){mx=x+2;my=y;}else if(d===2){mx=x;my=y+2;}else{mx=x-1;my=y;}
  for(var k=0;k<4;k++){
    var cx=mx+DX[d]*k,cy=my+DY[d]*k;
    if(cx<0||cy<0||cx>=N||cy>=N)return -1;
    var t=map[cy][cx];
    if(t===1||t===2)return -1;
    for(var i=0;i<list.length;i++){
      if(list[i].inv>0)continue;
      if(cx>=list[i].x&&cx<=list[i].x+1&&cy>=list[i].y&&cy<=list[i].y+1)return i;
    }
    for(i=0;i<preds.length;i++){
      if(preds[i].inv>0)continue;
      if(cx>=preds[i].x&&cx<=preds[i].x+1&&cy>=preds[i].y&&cy<=preds[i].y+1)return i;
    }
  }
  return -1;
}
// 该射线是否覆盖车身 (bx,by)（2x2）。
function shotReaches(map,x,y,d,bx,by){
  var mx,my;
  if(d===0){mx=x;my=y-1;}else if(d===1){mx=x+2;my=y;}else if(d===2){mx=x;my=y+2;}else{mx=x-1;my=y;}
  for(var k=0;k<4;k++){
    var cx=mx+DX[d]*k,cy=my+DY[d]*k;
    if(cx<0||cy<0||cx>=N||cy>=N)return false;
    var t=map[cy][cx];
    if(t===1||t===2)return false;
    if(cx>=bx&&cx<=bx+1&&cy>=by&&cy<=by+1)return true;
  }
  return false;
}
// 子弹本拍飞行的 4 格是否覆盖车身。
function bulletReaches(map,b,bx,by){
  for(var k=0;k<4;k++){
    var cx=b.x+DX[b.dir]*k,cy=b.y+DY[b.dir]*k;
    if(cx<0||cy<0||cx>=N||cy>=N)return false;
    var t=map[cy][cx];
    if(t===1||t===2)return false;
    if(cx>=bx&&cx<=bx+1&&cy>=by&&cy<=by+1)return true;
  }
  return false;
}
function grassAt(map,x,y){
  var n=0,i,j;
  for(j=0;j<2;j++)for(i=0;i<2;i++)if(map[y+j][x+i]===4)n++;
  return n;
}
// 新出现子弹的归属反推：只用于估计对手装填节奏，不读取任何隐藏字段。
function detectShots(s,vis,tick){
  var bs=s.radar.bullets,prev=MEM.prevB,i,j;
  if(prev){
    for(i=0;i<bs.length;i++){
      var b=bs[i],isNew=true;
      for(j=0;j<prev.length;j++)if(prev[j]===b.x*128+b.y*4+b.dir){isNew=false;break;}
      if(!isNew)continue;
      var mine=false;
      for(j=0;j<MEM.bullets.length;j++){var m=MEM.bullets[j];if(m.cx===b.x&&m.cy===b.y&&m.dir===b.dir){mine=true;break;}}
      if(mine)continue;
      var px,py;
      if(b.dir===0){px=b.x;py=b.y+4;}
      else if(b.dir===1){px=b.x-5;py=b.y;}
      else if(b.dir===2){px=b.x;py=b.y-5;}
      else{px=b.x+4;py=b.y;}
      for(j=0;j<vis.length;j++){
        var e=vis[j];
        if(e.dir!==b.dir)continue;
        var d1=Math.max(Math.abs(e.x-px),Math.abs(e.y-py));
        var d2=Math.abs(e.x+DX[b.dir]-px)+Math.abs(e.y+DY[b.dir]-py);
        if(d1<=1||d2<=1){
          var last=MEM.shotAt[e.id];
          if(last!==undefined){
            var gap=(tick-1)-last;
            if(gap>=4&&gap<=16)MEM.cad[e.id]=MEM.cad[e.id]?Math.round((MEM.cad[e.id]+gap)/2):gap;
          }
          MEM.shotAt[e.id]=tick-1;
          break;
        }
      }
    }
  }
  MEM.prevB=[];
  for(i=0;i<bs.length;i++)MEM.prevB.push(bs[i].x*128+bs[i].y*4+bs[i].dir);
}
function loadedAt(id,tick){
  var last=MEM.shotAt[id];
  if(last===undefined)return true;
  var cad=MEM.cad[id]||6;
  return tick-last>=cad-1;
}
// 我的在场子弹追踪：推进、地形消亡、可见性校验，用于两枚上限与自伤规避。
function trackBullets(s,me,map,tick){
  var bs=s.radar.bullets,keep=[],i,j;
  for(i=0;i<MEM.bullets.length;i++){
    var m=MEM.bullets[i],age=tick-m.born,dead=false;
    if(age>12)dead=true;
    var cx=m.sx,cy=m.sy;
    if(!dead){
      for(var k=0;k<age*3;k++){
        cx+=DX[m.dir];cy+=DY[m.dir];
        if(cx<0||cy<0||cx>=N||cy>=N){dead=true;break;}
        var t=map[cy][cx];
        if(t===1||t===2){dead=true;break;}
        var hit=false,inv=false;
        for(j=0;j<s.radar.tanks.length;j++){
          var e=s.radar.tanks[j];
          if(e.id===me.id)continue;
          if(cx>=e.x&&cx<=e.x+1&&cy>=e.y&&cy<=e.y+1){
            if(e.invincibleTicks>0){inv=true;break;}
            hit=true;break;
          }
        }
        if(hit){dead=true;break;}
        if(inv)continue;
      }
    }
    if(!dead){
      m.cx=cx;m.cy=cy;
      var dd=Math.max(Math.abs(cx-me.x),Math.abs(cy-me.y));
      if(dd<=6){
        var seen=false;
        for(j=0;j<bs.length;j++)if(bs[j].x===cx&&bs[j].y===cy&&bs[j].dir===m.dir){seen=true;break;}
        if(!seen)dead=true;
      }
    }
    if(!dead&&keep.length<4)keep.push(m);
  }
  MEM.bullets=keep;
}
function myBulletYoung(b,tick){
  for(var i=0;i<MEM.bullets.length;i++){
    var m=MEM.bullets[i];
    if(m.dir===b.dir&&tick-m.born<=2&&m.cx===b.x&&m.cy===b.y)return true;
  }
  return false;
}
// 联系人：雷达可见敌人 + 近期鬼影（草丛/超出视野前的最后目击）。
var _pool=[];
function contactsOf(s,me,tick){
  var list=_pool,i,cn=0;
  for(i=0;i<s.radar.tanks.length;i++){
    var c=s.radar.tanks[i];
    if(c.id===me.id)continue;
    var o=MEM.seen[c.id];
    var slot=list[cn]||(list[cn]={});
    slot.id=c.id;slot.x=c.x;slot.y=c.y;slot.dir=c.dir;slot.hp=c.hp;slot.rapid=c.rapidTicks;
    slot.inv=c.invincibleTicks;slot.hurt=c.hurtTicks;
    slot.vx=o?o.vx:0;slot.vy=o?o.vy:0;slot.steady=o?o.steady:false;slot.ghost=false;slot.age=0;
    cn++;
  }
  for(var id in MEM.seen){
    var g=MEM.seen[id],found=false;
    for(i=0;i<list.length;i++)if(list[i].id===id)found=true;
    if(found)continue;
    var age=tick-g.tick;
    if(age<=0||age>10)continue;
    var ok=true;
    for(i=0;i<s.opponents.length;i++){
      var op=s.opponents[i];
      if(op.id===id&&(op.lives<=0||op.status!=='active'||op.respawnTicks>0))ok=false;
    }
    if(!ok)continue;
    var slot2=list[cn]||(list[cn]={});
    slot2.id=id;slot2.x=g.x;slot2.y=g.y;slot2.dir=g.dir;slot2.hp=g.hp;slot2.rapid=g.rapid;
    slot2.inv=g.inv;slot2.hurt=g.hurt;slot2.vx=g.vx;slot2.vy=g.vy;slot2.steady=false;
    slot2.ghost=true;slot2.age=age;
    cn++;
  }
  list.length=cn;
  for(i=0;i<cn;i++)list[i].loaded=loadedAt(list[i].id,tick);
  return list;
}
// 车位 (x,y) 承受的威胁分值：子弹（本拍与下一拍）+ 敌方射线 + 同轴预警。
function threatAt(s,me,map,x,y,tick,cons,w,skipId,hotId){
  var th=0,i,j;
  var safeNow=(me.invincibleTicks>0||me.hurtTicks>=2);
  var safeNext=(me.invincibleTicks>1||me.hurtTicks>=2);
  var bs=s.radar.bullets;
  for(i=0;i<bs.length;i++){
    var b=bs[i];
    if(myBulletYoung(b,tick))continue;
    if(!safeNow&&bulletReaches(map,b,x,y))th+=120;
    if(!safeNext){
      _tb.x=b.x+DX[b.dir]*3;_tb.y=b.y+DY[b.dir]*3;_tb.dir=b.dir;
      if(bulletReaches(map,_tb,x,y))th+=30;
    }
  }
  for(i=0;i<cons.length;i++){
    var e=cons[i];
    if(skipId&&e.id===skipId)continue;
    if(e.inv>0)continue;
    var gw=e.ghost?0.75:1;
    if(!safeNow&&shotReaches(map,e.x,e.y,e.dir,x,y)){
      // 贴脸时子弹出生在车身格内，一格位移常常救不回来，权重按接近度放大。
      var prox=Math.max(Math.abs(e.x-x),Math.abs(e.y-y));
      var lw=(e.loaded?58:20);
      if(prox<=2)lw*=2.4;else if(prox<=4)lw*=1.35;
      th+=lw*gw;
    }else if(me.invincibleTicks>0&&me.hurtTicks<2&&shotReaches(map,e.x,e.y,e.dir,x,y)){
      // 无敌期内子弹穿身，但保护即将结束时不应停在敌人射线里
      th+=14*gw;
    }else{
      var cd=Math.max(Math.abs(e.x-x),Math.abs(e.y-y));
      // 同轴预警：对方下一拍可能转身射击
      if(cd<=5&&((e.y>=y-1&&e.y<=y+1)||(e.x>=x-1&&e.x<=x+1)))th+=(me.hp===1?12:4)*gw;
      // 热区：第三方可开火敌人临近时任何一格都可能被转身打到
      if(e.loaded&&hotId!==e.id){
        if(cd<=3)th+=11*gw;
        else if(cd<=5)th+=5*gw;
      }
      // 鬼影位置不确定：近距内按最坏情况补一份平坦威胁
      if(e.ghost&&cd<=3)th+=10*gw;
    }
  }
  return th*w;
}
// 领先/落后判定与终局姿态。
function leadState(s,me,tick){
  var myPts=0,myKills=0,i;
  for(i=0;i<s.scoreboard.length;i++){
    if(s.scoreboard[i].id===me.id){myPts=s.scoreboard[i].points;myKills=s.scoreboard[i].kills;}
  }
  var best=-1,bestLives=0,bestKills=0,alive=0;
  for(i=0;i<s.opponents.length;i++){
    var o=s.opponents[i];
    if(o.lives<=0||o.status!=='active')continue;
    alive++;
    if(o.points>best||(o.points===best&&o.kills>bestKills)){best=o.points;bestKills=o.kills;bestLives=o.lives;}
  }
  var leading=myPts>best||(myPts===best&&(myKills>bestKills||(myKills===bestKills&&me.lives>bestLives)));
  var behind=myPts+2<=best;
  var conserve=(tick>=430&&leading&&alive>=2)||(tick>=470&&leading&&me.lives===1);
  var urgent=(tick>=400&&behind&&alive>=2);
  return {myPts:myPts,best:best,alive:alive,leading:leading,behind:behind,conserve:conserve,urgent:urgent};
}
// 目标选择：残血优先、领先者优先、距离与无敌状态加权，带粘性。
function pickTarget(s,me,tick,cons,st){
  var best=null,bs=-1e9,i,j;
  for(i=0;i<cons.length;i++){
    var e=cons[i],row=null;
    for(j=0;j<s.opponents.length;j++)if(s.opponents[j].id===e.id)row=s.opponents[j];
    if(row&&(row.lives<=0||row.status!=='active'||row.respawnTicks>0))continue;
    var cd=Math.max(Math.abs(me.x-e.x),Math.abs(me.y-e.y));
    var sc=-cd*1.0;
    if(e.hp===1)sc+=34;
    if(e.inv>0)sc-=60;
    if(e.hurt>=2)sc-=10;
    if(row&&row.points>=st.best)sc+=7;
    if(e.rapid>0)sc+=3;
    if(e.ghost)sc-=16;
    if(me.hp===1&&cd<=3)sc-=25;
    if(st.conserve&&e.hp!==1)sc-=22;
    if(st.urgent&&e.hp===1)sc+=10;
    if(e.id===MEM.target)sc+=4;
    if(sc>bs){bs=sc;best=e;}
  }
  if(best)MEM.target=best.id;
  return best;
}
// 补给计划：速射提输出、维修补残甲；竞争不利或风险过高时放弃。
function planSupply(s,me,tick,cons,st){
  var box=s.arena.supply,z=s.arena.safeZone;
  if(!box){
    if(z.nextDropTick!==null&&z.nextDropTick-tick<=1)return {pending:true};
    return null;
  }
  if(!inZone(box.x,box.y,z))return null;
  var dist=Math.abs(me.x-box.x)+Math.abs(me.y-box.y);
  var eta=tick+dist;
  // 只要能在消失前赶到就值得去；不要求刚好踩中落地拍
  if(eta>box.expireTick-2)return null;
  var want=(box.type==='rapid')?true:(me.hp<me.maxHp);
  var priority=(box.type==='repair'&&me.hp===1);
  if(!want)return null;
  if(st.conserve&&!priority)return null;
  var closer=0,near=0;
  for(var i=0;i<cons.length;i++){
    var e=cons[i],ed=Math.max(Math.abs(e.x-box.x),Math.abs(e.y-box.y));
    if(ed+3<dist)closer++;
    if(ed<=4)near++;
  }
  if(near>=2&&!priority)return null;
  if(box.type==='rapid'&&closer>=1&&dist>9)return null;
  if(box.type==='repair'&&closer>=1&&me.hp>1)return null;
  if(box.type==='repair'&&priority&&closer>=2)return null;
  return {x:box.x,y:box.y,type:box.type,want:true,priority:priority,contested:closer>=1};
}
function bfs(map,sx,sy,zone,tk){
  var i;
  for(i=0;i<P*P;i++){_d[i]=-1;_f[i]=-1;}
  var head=0,tail=0,si=sy*P+sx;
  _d[si]=0;_qx[tail]=sx;_qy[tail]=sy;tail++;
  while(head<tail){
    var x=_qx[head],y=_qy[head++],di=_d[y*P+x];
    for(var dd=0;dd<4;dd++){
      var nx=x+DX[dd],ny=y+DY[dd];
      if(nx<0||ny<0||nx>N-2||ny>N-2)continue;
      var ni=ny*P+nx;
      if(_d[ni]>=0)continue;
      if(zone&&!inZone(nx,ny,zone))continue;
      if(!freeCell(map,nx,ny,tk))continue;
      _d[ni]=di+1;_f[ni]=(di===0?dd:_f[y*P+x]);
      _qx[tail]=nx;_qy[tail]=ny;tail++;
    }
  }
}
// 目标格：优先射位（有射线、距离合适、威胁低），其次补给，最后安全锚点。
function goalStillGood(s,me,map,tick,zone,target,supply,tk){
  var g=MEM.goal;
  if(!g||MEM.goalTick===undefined)return false;
  if(tick-MEM.goalTick>(g.mode==='siege'?4:2))return false;
  if(!freeCell(map,g.x,g.y,tk))return false;
  var nextZone=nextZoneOf(zone);
  var zPlan=(nextZone&&zone.nextShrinkTick-tick<=18)?nextZone:zone;
  if(!inZone(g.x,g.y,zPlan))return false;
  if(g.mode==='siege'){
    if(!target||target.ghost)return false;
    if(Math.max(Math.abs(target.x-g.x),Math.abs(target.y-g.y))>9)return false;
    if(g.tx===undefined)return false;
    if(shotFirst(map,g.x,g.y,g.dir,[{x:g.tx,y:g.ty,inv:0}])!==0)return false;
  }
  if(g.mode==='resupply'){
    if(!supply||!supply.want||supply.x!==g.x||supply.y!==g.y)return false;
  }
  return true;
}
function pickGoal(s,me,map,tick,zone,target,supply,cons,st,tk){
  if(goalStillGood(s,me,map,tick,zone,target,supply,tk))return MEM.goal;
  var nextZone=nextZoneOf(zone);
  var imminent=(nextZone&&zone.nextShrinkTick-tick<=18);
  var zPlan=imminent?nextZone:zone;
  var best=null,bestScore=1e9,i;
  var sticky=(MEM.goal&&MEM.goalTick!==undefined&&tick-MEM.goalTick<=2)?MEM.goal:null;
  // 身处危险区：最近安全格优先，其他目标一律让位。
  if(!inZone(me.x,me.y,zone)){
    var bz=null,bzs=1e9;
    for(var y3=zone.min;y3<=zone.max-1;y3++)for(var x3=zone.min;x3<=zone.max-1;x3++){
      if(!freeCell(map,x3,y3,tk))continue;
      var dz=y3*P+x3;
      if(_d[dz]<0||_d[dz]>=bzs)continue;
      bzs=_d[dz];bz={x:x3,y:y3,dir:-1,mode:'retreat'};
    }
    if(bz){MEM.goalTick=tick;return bz;}
  }
  if(target&&!target.ghost){
    var tx=target.x,ty=target.y,list=[target];
    for(var y=Math.max(0,ty-7);y<=Math.min(N-2,ty+7);y++){
      for(var x=Math.max(0,tx-7);x<=Math.min(N-2,tx+7);x++){
        var cd=Math.max(Math.abs(x-tx),Math.abs(y-ty));
        if(cd<3||cd>6)continue;
        if(!freeCell(map,x,y,tk))continue;
        if(!inZone(x,y,zPlan))continue;
        var di=y*P+x;
        if(_d[di]<0||_d[di]>12)continue;
        var bd=-1;
        for(var d=0;d<4;d++)if(shotFirst(map,x,y,d,list)===0){bd=d;break;}
        if(bd<0)continue;
        var sc=_d[di]+threatAt(s,me,map,x,y,tick,cons,2.0,null,target.id);
        // 单挑闸门：第三方从此格能打到我时，不在这里开团（残局或追分时放宽）
        var gate=(tick>=430||st.urgent)?18:70;
        for(var q2=0;q2<cons.length;q2++){
          var t3=cons[q2];
          if(t3.id===target.id||t3.inv>0||!t3.loaded)continue;
          var t3d=Math.max(Math.abs(t3.x-x),Math.abs(t3.y-y));
          if(t3d<=6&&shotReaches(map,t3.x,t3.y,t3.dir,x,y)){sc+=gate;break;}
        }
        var mzx,mzy;
        if(bd===0){mzx=x;mzy=y-1;}else if(bd===1){mzx=x+2;mzy=y;}else if(bd===2){mzx=x;mzy=y+2;}else{mzx=x-1;mzy=y;}
        if((mzx===tx||mzx===tx+1)&&(mzy===ty||mzy===ty+1))sc+=2.5;
        var ax=Math.abs(x-me.x),ay=Math.abs(y-me.y);
        var appr=(ax>=ay)?(x>me.x?1:3):(y>me.y?2:0);
        if(appr===bd)sc-=1.2;
        if(x===me.x&&y===me.y)sc-=2.5;
        if(sticky&&sticky.x===x&&sticky.y===y)sc-=0.8;
        if(sc<bestScore){bestScore=sc;best={x:x,y:y,dir:bd,mode:'siege',tx:tx,ty:ty};}
      }
    }
  }
  if(supply&&supply.want){
    var sx2=supply.x,sy2=supply.y;
    if(freeCell(map,sx2,sy2,tk)&&inZone(sx2,sy2,zPlan)){
      var di2=sy2*P+sx2;
      if(_d[di2]>=0){
        var sc2=_d[di2]+threatAt(s,me,map,sx2,sy2,tick,cons,1.6,null,target?target.id:'')+(supply.contested?30:0);
        if(sticky&&sticky.x===sx2&&sticky.y===sy2)sc2-=0.8;
        if(supply.priority||sc2<bestScore+5){bestScore=sc2;best={x:sx2,y:sy2,dir:-1,mode:'resupply'};}
      }
    }
  }
  if(!best){
    var cx=(zPlan.min+zPlan.max-1)/2,cy=cx;
    var sepW=st.conserve?0.95:0.45;
    var tw=st.conserve?1.5:1.0;
    for(var y2=zPlan.min;y2<=zPlan.max-1;y2++){
      for(var x2=zPlan.min;x2<=zPlan.max-1;x2++){
        if(!freeCell(map,x2,y2,tk))continue;
        var di3=y2*P+x2;
        if(_d[di3]<0||_d[di3]>12)continue;
        var th=threatAt(s,me,map,x2,y2,tick,cons,tw,null,target?target.id:'');
        var sep=99;
        for(i=0;i<cons.length;i++){
          var dd=Math.max(Math.abs(cons[i].x-x2),Math.abs(cons[i].y-y2));
          if(dd<sep)sep=dd;
        }
        var sc3=th*2.2+Math.abs(x2-cx)*0.35+Math.abs(y2-cy)*0.35-(cons.length?sep*sepW:0);
        if(grassAt(map,x2,y2)&&cons.length)sc3-=1.0;
        if(sticky&&sticky.x===x2&&sticky.y===y2)sc3-=0.8;
        if(sc3<bestScore){bestScore=sc3;best={x:x2,y:y2,dir:-1,mode:'hold'};}
      }
    }
  }
  if(!best)best={x:me.x,y:me.y,dir:me.dir,mode:'hold'};
  MEM.goalTick=tick;
  return best;
}
// 逐拍评估五个动作：威胁、区域、计划步、瞄准对齐。
function chooseAction(s,me,map,tick,zone,target,goal,cons,st){
  var tk=tanksOf(s);
  var planned=-1;
  if(goal){var gi=goal.y*P+goal.x;planned=_f[gi];}
  var hpW=(me.hp===1?2.2:1.0)*(st.conserve?1.35:1.0)*(st.urgent?0.7:1.0);
  var nextZone=nextZoneOf(zone);
  var imminent=(nextZone&&zone.nextShrinkTick-tick<=18);
  var bestA=0,bestS=1e9;
  for(var a=0;a<5;a++){
    var nx,ny,nd;
    if(a===0){nx=me.x;ny=me.y;nd=me.dir;}
    else{
      var d=a-1;
      nx=me.x+DX[d];ny=me.y+DY[d];nd=d;
      if(!freeCell(map,nx,ny,tk)){nx=me.x;ny=me.y;}
    }
    var sc=threatAt(s,me,map,nx,ny,tick,cons,hpW,null,target?target.id:'');
    if(!inZone(nx,ny,zone))sc+=90;
    if(imminent&&!inZone(nx,ny,nextZone))sc+=12;
    if(a===0)sc+=0.7;
    else if(a-1===planned)sc-=1.5;
    // 反向前一步的移动：抑制左右抖动导致的原地打转
    if(a>0&&MEM.lastAct>0&&a-1===(MEM.lastAct-1+2)%4)sc+=2.2;
    if(goal){
      var md=Math.abs(nx-goal.x)+Math.abs(ny-goal.y);
      sc+=md*0.9;
      if(nx===goal.x&&ny===goal.y)sc-=2.0;
    }
    if(target&&!target.ghost&&me.fireCooldown<=1&&target.inv<=0&&shotReaches(map,nx,ny,nd,target.x,target.y)){
      var third=threatAt(s,me,map,nx,ny,tick,cons,1.0,target.id);
      var bonus=(third<15)?(st.urgent?26:(st.conserve?11:18)):7;
      sc-=bonus;
    }
    // 残甲保命：与可开火敌人保持距离，除非那一拍就能击毁对方
    if(me.hp===1&&!st.urgent){
      for(var q=0;q<cons.length;q++){
        var oe=cons[q];
        if(oe.inv>0)continue;
        var qd=Math.max(Math.abs(oe.x-nx),Math.abs(oe.y-ny));
        if(qd>=6)continue;
        var deadly=oe.loaded&&shotReaches(map,oe.x,oe.y,oe.dir,nx,ny);
        var killing=target&&!target.ghost&&target.id===oe.id&&target.hp===1;
        if(!killing)sc+=(6-qd)*(deadly?9:4);
      }
    }
    if(MEM.stuck>=4&&a===0)sc+=25;
    if(sc<bestS){bestS=sc;bestA=a;}
  }
  return bestA;
}
// 开火：射线通畅、目标不会横向闪避、不吃缓冲/保护；残甲只换必杀。
function chooseFire(s,me,map,tick,target,cons,st){
  if(me.fireCooldown!==0)return false;
  if(MEM.bullets.length>=2)return false;
  if(!target)return false;
  var list=[],i;
  for(i=0;i<cons.length;i++)if(!cons[i].ghost)list.push(cons[i]);
  if(!list.length)return false;
  var preds=predictPositions(map,list);
  var idx=rayVictim(map,me.x,me.y,me.dir,list,preds);
  if(idx<0)return false;
  var e=list[idx],p=preds[idx];
  if(e.inv>0)return false;
  if(e.hurt>=2)return false;
  var kills=(e.hp===1);
  var hitNow=shotReaches(map,me.x,me.y,me.dir,e.x,e.y);
  var hitPred=p.moved?shotReaches(map,me.x,me.y,me.dir,p.x,p.y):hitNow;
  if(!hitPred&&!hitNow)return false;
  // 目标正在离开射线且预测位也打不到：非必杀不开火
  if(!hitPred&&hitNow&&!kills&&p.moved)return false;
  // 只打到预测位（赌对方保持移动）：移动不稳定或残甲且不追分时不下注
  if(hitPred&&!hitNow&&!kills&&me.hp===1&&!st.urgent)return false;
  if(target.ghost&&target.age>3)return false;
  // 第三方火力：两条以上射线交叉才回避，单条且非残甲可以换血
  var crossfire=0;
  for(i=0;i<cons.length;i++){
    var o=cons[i];
    if(o.id===e.id||o.inv>0)continue;
    if(shotReaches(map,o.x,o.y,o.dir,me.x,me.y)&&o.loaded)crossfire++;
  }
  if(crossfire>=2&&!kills)return false;
  if(me.invincibleTicks>0&&!kills){
    var near=99;
    for(i=0;i<cons.length;i++){
      var dd=Math.max(Math.abs(cons[i].x-me.x),Math.abs(cons[i].y-me.y));
      if(dd<near)near=dd;
    }
    if(near<7)return false;
  }
  if(me.hp===1&&!kills&&!st.urgent)return false;
  return true;
}
// 主流程：记忆维护 → 联系人与局势 → 目标/补给 → 寻路 → 动作与开火。
function core(s){
  var me=s.self,tick=s.tick,map=s.map,zone=s.arena.safeZone,i;
  if(tick<MEM.tick||tick-MEM.tick>1||me.lives<MEM.lives){
    MEM.seen={};MEM.shotAt={};MEM.cad={};MEM.bullets=[];MEM.prevB=null;
    MEM.target='';MEM.stuck=0;MEM.goal=null;MEM.lastFire=-999;MEM.lastAct=-1;
  }
  MEM.tick=tick;MEM.lives=me.lives;
  if(!me.onField)return {move:'stay',fire:false,intent:'hold'};
  // 目击与瞬时速度
  var vis=[];
  for(i=0;i<s.radar.tanks.length;i++)if(s.radar.tanks[i].id!==me.id)vis.push(s.radar.tanks[i]);
  for(i=0;i<vis.length;i++){
    var c=vis[i],o=MEM.seen[c.id];
    if(o&&tick-o.tick===1){
      MEM.seen[c.id]={x:c.x,y:c.y,dir:c.dir,hp:c.hp,rapid:c.rapidTicks,inv:c.invincibleTicks,
        hurt:c.hurtTicks,tick:tick,vx:clamp1(c.x-o.x),vy:clamp1(c.y-o.y),
        pvx:o.vx,pvy:o.vy,
        steady:(clamp1(c.x-o.x)===o.vx&&clamp1(c.y-o.y)===o.vy&&(clamp1(c.x-o.x)!==0||clamp1(c.y-o.y)!==0))};
    }else{
      MEM.seen[c.id]={x:c.x,y:c.y,dir:c.dir,hp:c.hp,rapid:c.rapidTicks,inv:c.invincibleTicks,
        hurt:c.hurtTicks,tick:tick,vx:0,vy:0,pvx:0,pvy:0,steady:false};
    }
  }
  for(var id in MEM.seen){
    var g=MEM.seen[id],alive=true;
    for(i=0;i<s.opponents.length;i++){
      var op=s.opponents[i];
      if(op.id===id&&(op.lives<=0||op.status!=='active'))alive=false;
    }
    if(!alive||tick-g.tick>12)delete MEM.seen[id];
  }
  detectShots(s,vis,tick);
  trackBullets(s,me,map,tick);
  var cons=contactsOf(s,me,tick);
  var st=leadState(s,me,tick);
  var target=pickTarget(s,me,tick,cons,st);
  var supply=planSupply(s,me,tick,cons,st);
  var tk=tanksOf(s);
  bfs(map,me.x,me.y,inZone(me.x,me.y,zone)?zone:null,tk);
  var goal=pickGoal(s,me,map,tick,zone,target,supply,cons,st,tk);
  MEM.goal=goal;
  var act=chooseAction(s,me,map,tick,zone,target,goal,cons,st);
  var fire=chooseFire(s,me,map,tick,target,cons,st);
  if(fire){
    var mzx2,mzy2;
    if(me.dir===0){mzx2=me.x;mzy2=me.y-1;}else if(me.dir===1){mzx2=me.x+2;mzy2=me.y;}
    else if(me.dir===2){mzx2=me.x;mzy2=me.y+2;}else{mzx2=me.x-1;mzy2=me.y;}
    MEM.bullets.push({sx:mzx2,sy:mzy2,dir:me.dir,born:tick,cx:mzx2,cy:mzy2});
    MEM.lastFire=tick;
  }
  if(me.x===MEM.lastX&&me.y===MEM.lastY)MEM.stuck++;else MEM.stuck=0;
  MEM.lastX=me.x;MEM.lastY=me.y;MEM.lastAct=act;
  // intent 如实反映当前动作目的
  var intent='hold',mode=goal.mode;
  if(mode==='resupply')intent='resupply';
  else if(mode==='retreat')intent='retreat';
  else if(mode==='siege'){
    var aligned=(me.fireCooldown<=1)&&shotReaches(map,me.x,me.y,me.dir,target.x,target.y);
    if(aligned&&me.fireCooldown===0)intent='siege';
    else if(target&&Math.abs(target.x-me.x)>=Math.abs(target.y-me.y)&&target.dir!==me.dir&&target.dir!==(me.dir+2)%4)intent='flank';
    else intent='pursue';
  }else if(goal.x!==me.x||goal.y!==me.y)intent='advance';
  if(st.conserve&&intent!=='resupply')intent='defend';
  var move=(act===0)?'stay':MVN[act-1];
  return {move:move,fire:fire,intent:intent};
}
