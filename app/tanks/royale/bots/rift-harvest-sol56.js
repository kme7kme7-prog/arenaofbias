var RH={
  size:25,lastTick:-1,lastX:-1,lastY:-1,lastMove:'stay',stuck:0,lastLives:3,
  quarry:'',quarryTick:-99,lastShot:-99,seen:{},bias:0
};

var RH_MOVES=[
  {move:'up',dir:0,dx:0,dy:-1},
  {move:'right',dir:1,dx:1,dy:0},
  {move:'down',dir:2,dx:0,dy:1},
  {move:'left',dir:3,dx:-1,dy:0}
];
var RH_DX=[0,1,0,-1];
var RH_DY=[-1,0,1,0];
var N=26,P=25,RH_STATE=null;

function rhAbs(n){return n<0?-n:n;}
function rhMin(a,b){return a<b?a:b;}
function rhMax(a,b){return a>b?a:b;}
function rhCheb(a,b,c,d){return rhMax(rhAbs(a-c),rhAbs(b-d));}
function rhMan(a,b,c,d){return rhAbs(a-c)+rhAbs(b-d);}
function rhInsideRect(x,y,r){return x>=r.x&&x<r.x+2&&y>=r.y&&y<r.y+2;}
function rhOverlap(x,y,r){return x<r.x+2&&x+2>r.x&&y<r.y+2&&y+2>r.y;}

function rhFree(map,x,y){
  if(x<0||y<0||x>N-2||y>N-2)return false;
  for(var j=0;j<2;j++)for(var i=0;i<2;i++){
    var t=map[y+j][x+i];
    if(t!==0&&t!==4)return false;
  }
  return true;
}

function rhGrass(map,x,y){
  for(var j=0;j<2;j++)for(var i=0;i<2;i++)if(map[y+j][x+i]===4)return true;
  return false;
}

function rhOpen(state,x,y,tanks){
  if(!rhFree(state.map,x,y))return false;
  for(var i=0;i<tanks.length;i++)if(rhOverlap(x,y,tanks[i]))return false;
  return true;
}

function rhMargin(tick){
  var z=RH_STATE&&RH_STATE.arena.safeZone,q=RH_STATE&&RH_STATE.arena.zoneSchedule;
  if(!z||!q)return tick<200?0:Math.min(9,2+Math.floor((tick-200)/50));
  if(tick<=RH_STATE.tick)return z.min;if(z.nextShrinkTick===null||tick<z.nextShrinkTick)return z.min;
  return Math.min(N-1,z.nextMin+Math.floor((tick-z.nextShrinkTick)/q.stepTicks)*q.stepSize);
}

function rhInMargin(x,y,m){return x>=m&&y>=m&&x+1<=N-1-m&&y+1<=N-1-m;}

function rhZoneDebt(x,y,m){
  var a=m-x,b=m-y,c=x+1-(N-1-m),d=y+1-(N-1-m),n=0;
  if(a>0)n+=a;if(b>0)n+=b;if(c>0)n+=c;if(d>0)n+=d;
  return n;
}

function rhMuzzle(x,y,dir){
  if(dir===0)return {x:x,y:y-1};
  if(dir===1)return {x:x+2,y:y};
  if(dir===2)return {x:x,y:y+2};
  return {x:x-1,y:y};
}

function rhRayToRect(map,x,y,dir,r){
  if(dir===0&&(x<r.x||x>r.x+1||y<=r.y+1))return null;
  if(dir===2&&(x<r.x||x>r.x+1||y+1>=r.y))return null;
  if(dir===1&&(y<r.y||y>r.y+1||x+1>=r.x))return null;
  if(dir===3&&(y<r.y||y>r.y+1||x<=r.x+1))return null;
  var p=rhMuzzle(x,y,dir),cx=p.x,cy=p.y;
  for(var d=1;d<N;d++){
    if(cx<0||cy<0||cx>=N||cy>=N)return null;
    var tile=map[cy][cx];
    if(tile===1||tile===2)return null;
    if(rhInsideRect(cx,cy,r))return {dist:d,phases:Math.ceil(d/3)};
    cx+=RH_DX[dir];cy+=RH_DY[dir];
  }
  return null;
}

function rhLaneFrom(map,x,y,dir,r){return rhRayToRect(map,x,y,dir,r)!==null;}

function rhBulletRisk(state,x,y){
  var risk=0;
  var bullets=state.radar.bullets;
  for(var i=0;i<bullets.length;i++){
    var b=bullets[i],cx=b.x,cy=b.y;
    for(var step=0;step<=6;step++){
      if(cx<0||cy<0||cx>=N||cy>=N)break;
      var tile=state.map[cy][cx];
      if(tile===1||tile===2)break;
      if(rhInsideRect(cx,cy,{x:x,y:y})){
        risk+=step<=3?150-step*8:34-step*2;
        break;
      }
      cx+=RH_DX[b.dir];cy+=RH_DY[b.dir];
    }
  }
  return risk;
}

function rhEnemyRayRisk(state,x,y,e){
  var hit=rhRayToRect(state.map,e.x,e.y,e.dir,{x:x,y:y});
  if(!hit)return 0;
  var r=hit.dist<=3?82:hit.dist<=6?58:32;
  if(e.invincibleTicks>0)r-=8;
  return r;
}

function rhAllEnemyRisk(state,x,y,tanks){
  var risk=0,near=0;
  for(var i=0;i<tanks.length;i++){
    var e=tanks[i],d=rhCheb(x,y,e.x,e.y);
    risk+=rhEnemyRayRisk(state,x,y,e);
    if(d<=2)risk+=70;
    else if(d<=4)risk+=20;
    if(state.self.hp===1&&d<=4)risk+=42+(4-d)*12;
    else if(state.self.hp===1&&d<=6)risk+=15;
    if(d<=7)near++;
  }
  if(near>1)risk+=(near-1)*20;
  return risk;
}

function rhNearestEnemy(x,y,tanks){
  var best=99;
  for(var i=0;i<tanks.length;i++)best=rhMin(best,rhCheb(x,y,tanks[i].x,tanks[i].y));
  return best;
}

function rhMobility(state,x,y,tanks){
  var n=0;
  for(var i=0;i<4;i++)if(rhOpen(state,x+RH_DX[i],y+RH_DY[i],tanks))n++;
  return n;
}

function rhCover(state,x,y){
  var n=0;
  var cells=[[x,y-1],[x+1,y-1],[x+2,y],[x+2,y+1],[x,y+2],[x+1,y+2],[x-1,y],[x-1,y+1]];
  for(var i=0;i<cells.length;i++){
    var cx=cells[i][0],cy=cells[i][1];
    if(cx<0||cy<0||cx>=N||cy>=N){n++;continue;}
    var t=state.map[cy][cx];
    if(t===1||t===2)n++;
  }
  return n;
}

function rhScoreRow(state,id){
  for(var i=0;i<state.scoreboard.length;i++)if(state.scoreboard[i].id===id)return state.scoreboard[i];
  return null;
}

function rhUpdateMemory(state){
  var s=state.self;
  if(RH.lastTick>=0){
    if(state.tick-RH.lastTick>1||s.lives<RH.lastLives){
      RH.stuck=0;RH.lastMove='stay';RH.quarry='';
    }else if(RH.lastMove!=='stay'){
      if(s.x===RH.lastX&&s.y===RH.lastY)RH.stuck=rhMin(5,RH.stuck+1);
      else RH.stuck=0;
    }else if(RH.stuck>0)RH.stuck--;
  }
  for(var id in RH.seen)RH.seen[id].visible=false;
  for(var i=0;i<state.radar.tanks.length;i++){
    var e=state.radar.tanks[i],old=RH.seen[e.id];
    var vx=0,vy=0;
    if(old&&old.tick===state.tick-1){vx=e.x-old.x;vy=e.y-old.y;}
    RH.seen[e.id]={id:e.id,x:e.x,y:e.y,dir:e.dir,hp:e.hp,maxHp:e.maxHp,
      invincibleTicks:e.invincibleTicks,hurtTicks:e.hurtTicks,rapidTicks:e.rapidTicks,
      tick:state.tick,vx:vx,vy:vy,visible:true};
  }
  RH.lastLives=s.lives;
}

function rhChooseQuarry(state){
  var best=null,bestScore=-9999;
  for(var i=0;i<state.radar.tanks.length;i++){
    var e=state.radar.tanks[i],row=rhScoreRow(state,e.id);
    var d=rhCheb(state.self.x,state.self.y,e.x,e.y);
    var score=120-d*4+(e.hp===1?70:0)+(e.invincibleTicks===0?18:-35);
    if(e.hurtTicks>1)score-=12;
    if(row){score+=row.points*4+(3-row.lives)*10;}
    if(e.id===RH.quarry)score+=34;
    if(state.tick>=450&&row)score+=row.points*5;
    if(score>bestScore){bestScore=score;best=RH.seen[e.id];}
  }
  if(best){RH.quarry=best.id;RH.quarryTick=state.tick;return best;}
  var old=RH.seen[RH.quarry];
  if(old&&state.tick-old.tick<=12)return old;
  best=null;bestScore=-9999;
  for(var id in RH.seen){
    var m=RH.seen[id],age=state.tick-m.tick;
    if(age>12)continue;
    var v=100-age*9-rhCheb(state.self.x,state.self.y,m.x,m.y)*3;
    if(v>bestScore){bestScore=v;best=m;}
  }
  if(best){RH.quarry=best.id;return best;}
  RH.quarry='';return null;
}

function rhStanding(state){
  var me=rhScoreRow(state,state.self.id),best=-1,rank=1;
  for(var i=0;i<state.scoreboard.length;i++){
    var r=state.scoreboard[i];
    if(r.id!==state.self.id&&r.lives>0&&r.points>best)best=r.points;
    if(me&&r.id!==me.id&&r.lives>0&&(r.points>me.points||(r.points===me.points&&r.kills>me.kills)))rank++;
  }
  return {me:me,leader:me&&me.points>=best,rank:rank,best:best};
}

function rhSupplyValue(state){
  var box=state.arena.supply;
  if(!box)return 0;
  if(box.type==='repair')return state.self.hp<state.self.maxHp?125:0;
  return state.self.rapidTicks>20?18:78;
}

function rhBfs(state,tanks){
  var dist=new Array(P*P),first=new Array(P*P),qx=new Array(P*P),qy=new Array(P*P);
  for(var z=0;z<P*P;z++){dist[z]=-1;first[z]='stay';}
  var head=0,tail=0,sx=state.self.x,sy=state.self.y,si=sy*P+sx;
  var safe=rhMargin(state.tick),keepSafe=state.tick>=200&&rhInMargin(sx,sy,safe);
  dist[si]=0;qx[tail]=sx;qy[tail++]=sy;
  while(head<tail){
    var x=qx[head],y=qy[head++],base=dist[y*P+x];
    for(var i=0;i<4;i++){
      var nx=x+RH_DX[i],ny=y+RH_DY[i];
      if(nx<0||ny<0||nx>N-2||ny>N-2)continue;
      var k=ny*P+nx;
      if(dist[k]>=0||!rhOpen(state,nx,ny,tanks)||(keepSafe&&!rhInMargin(nx,ny,safe)))continue;
      dist[k]=base+1;first[k]=base===0?RH_MOVES[i].move:first[y*P+x];qx[tail]=nx;qy[tail++]=ny;
    }
  }
  return {dist:dist,first:first};
}

function rhSupplyOverlap(x,y,b){return x<b.x+2&&x+2>b.x&&y<b.y+2&&y+2>b.y;}

function rhPotential(state,x,y,d,tanks,target,standing){
  var arrival=state.tick+d;
  var future=rhMargin(arrival+35);
  var score=0;
  var nowDebt=rhZoneDebt(x,y,rhMargin(arrival)),futureDebt=rhZoneDebt(x,y,future);
  if(nowDebt>0)score-=3000+nowDebt*500;
  if(futureDebt>0)score-=1400+futureDebt*260;
  var edge=rhMin(rhMin(x-future,y-future),rhMin(N-2-future-x,N-2-future-y));
  score+=rhMin(edge,4)*7;
  var ring=state.tick<200?7:state.tick<400?5:3;
  score-=rhAbs(rhMan(x,y,(N-2)/2,(N-2)/2)-ring)*2.1;
  var mobility=rhMobility(state,x,y,tanks);
  score+=mobility*5;
  if(mobility<=1)score-=28;
  score+=rhCover(state,x,y)*2.2;
  var danger=rhAllEnemyRisk(state,x,y,tanks);
  var dangerWeight=state.self.hp===1?1.15:0.8;
  if(standing.leader&&state.tick>=450)dangerWeight+=0.35;
  score-=danger*dangerWeight;
  var hidden=rhGrass(state.map,x,y);
  if(hidden&&state.tick-RH.lastShot>8)score+=standing.leader&&state.tick>350?20:9;
  if(target){
    var age=state.tick-target.tick,tx=target.x+target.vx*rhMin(age,2),ty=target.y+target.vy*rhMin(age,2);
    tx=rhMax(0,rhMin(N-2,tx));ty=rhMax(0,rhMin(N-2,ty));
    var td=rhCheb(x,y,tx,ty);
    var ideal=state.self.hp===1?8:(target.hp===1?5:7);
    if(state.tick>=500&&!standing.leader)ideal=5;
    score-=rhAbs(td-ideal)*4;
    if(td>12)score-=standing.leader?1:(td-12)*2;
    var tr={x:tx,y:ty};
    for(var dir=0;dir<4;dir++)if(rhLaneFrom(state.map,x,y,dir,tr)){score+=13;break;}
    if(target.visible&&target.hp===1)score+=9;
  }
  var sv=rhSupplyValue(state),box=state.arena.supply;
  if(sv&&box&&arrival<box.expireTick){
    var bd=rhCheb(x,y,box.x,box.y);
    if(rhSupplyOverlap(x,y,box)&&arrival>=box.appearTick)score+=sv-danger*(sv>100?1.4:0.85);
    else score-=bd*(sv>100?3.6:2.2);
  }
  if(!standing.leader&&state.tick>=500&&target)score+=12;
  score-=d*0.28;
  return score;
}

function rhGoal(state,tanks,target,standing,bfs){
  var best={x:state.self.x,y:state.self.y,score:-999999};
  for(var y=0;y<P;y++)for(var x=0;x<P;x++){
    var d=bfs.dist[y*P+x];
    if(d<0)continue;
    var score=rhPotential(state,x,y,d,tanks,target,standing);
    if(score>best.score+0.001){best={x:x,y:y,score:score};}
    else if(rhAbs(score-best.score)<0.001&&((x+y+state.random)%2)<((best.x+best.y+state.random)%2))best={x:x,y:y,score:score};
  }
  return best;
}

function rhDistanceField(state,tanks,gx,gy){
  var dist=new Array(P*P),qx=new Array(P*P),qy=new Array(P*P);
  for(var z=0;z<P*P;z++)dist[z]=-1;
  var head=0,tail=0;
  var safe=rhMargin(state.tick),next=state.arena.safeZone.nextMin;
  if(state.arena.safeZone.nextShrinkTick!==null&&state.arena.safeZone.nextShrinkTick-state.tick<=40&&rhInMargin(state.self.x,state.self.y,next))safe=next;
  var keepSafe=state.tick>=200&&rhInMargin(state.self.x,state.self.y,safe);
  if(!rhOpen(state,gx,gy,tanks)&&!(gx===state.self.x&&gy===state.self.y))return dist;
  if(keepSafe&&!rhInMargin(gx,gy,safe))return dist;
  dist[gy*P+gx]=0;qx[tail]=gx;qy[tail++]=gy;
  while(head<tail){
    var x=qx[head],y=qy[head++],base=dist[y*P+x];
    for(var i=0;i<4;i++){
      var nx=x+RH_DX[i],ny=y+RH_DY[i];
      if(nx<0||ny<0||nx>N-2||ny>N-2)continue;
      var k=ny*P+nx;
      if(dist[k]>=0||!rhOpen(state,nx,ny,tanks)||(keepSafe&&!rhInMargin(nx,ny,safe)))continue;
      dist[k]=base+1;qx[tail]=nx;qy[tail++]=ny;
    }
  }
  return dist;
}

function rhMoveChoice(state,tanks,target,goal,standing){
  var field=rhDistanceField(state,tanks,goal.x,goal.y),choices=[];
  choices.push({move:'stay',dir:state.self.dir,x:state.self.x,y:state.self.y});
  for(var i=0;i<4;i++){
    var x=state.self.x+RH_DX[i],y=state.self.y+RH_DY[i];
    if(rhOpen(state,x,y,tanks))choices.push({move:RH_MOVES[i].move,dir:i,x:x,y:y});
  }
  var minBullet=99999;
  for(var j=0;j<choices.length;j++){
    choices[j].bullet=rhBulletRisk(state,choices[j].x,choices[j].y);
    if(choices[j].bullet<minBullet)minBullet=choices[j].bullet;
  }
  var best=choices[0],bestScore=-999999;
  var currentNear=rhNearestEnemy(state.self.x,state.self.y,tanks);
  var zone=rhMargin(state.tick),currentDebt=rhZoneDebt(state.self.x,state.self.y,zone);
  var urgent=rhMargin(state.tick+20),urgentDebt=rhZoneDebt(state.self.x,state.self.y,urgent);
  for(var k=0;k<choices.length;k++){
    var c=choices[k],gd=field[c.y*P+c.x];
    var enemyRisk=rhAllEnemyRisk(state,c.x,c.y,tanks);
    var score=(gd<0?-800:-gd*15)-c.bullet*3-enemyRisk*(state.self.hp===1?1.8:1.2);
    if(c.bullet>minBullet+30)score-=500;
    if(c.move==='stay')score-=5;
    if(c.move===RH.lastMove&&RH.stuck>0)score-=RH.stuck*45;
    if(target&&rhRayToRect(state.map,c.x,c.y,c.dir,target))score+=state.self.hp===1?6:16;
    var mNow=rhMargin(state.tick+1);
    var debt=rhZoneDebt(c.x,c.y,mNow);
    if(debt>0)score-=state.tick>=200?700+debt*220:0;
    if(currentDebt>0&&debt>=currentDebt)score-=850;
    var nextDebt=rhZoneDebt(c.x,c.y,urgent);
    if(urgentDebt>0){score-=nextDebt*260;if(nextDebt>=urgentDebt)score-=420;}
    var near=rhNearestEnemy(c.x,c.y,tanks);
    if(state.self.hp===1&&currentNear<=5&&near>currentNear)score+=80*(near-currentNear);
    if(state.self.hp===1&&currentNear<=4&&near<currentNear)score-=110*(currentNear-near);
    if(c.move!=='stay')score+=((state.random>>>k)&3)*0.03;
    if(score>bestScore){bestScore=score;best=c;}
  }
  best.pressure=rhAllEnemyRisk(state,best.x,best.y,tanks);
  best.minBullet=minBullet;
  return best;
}

function rhDefensiveShot(state){
  if(state.self.fireCooldown!==0||state.self.invincibleTicks>0)return false;
  var m=rhMuzzle(state.self.x,state.self.y,state.self.dir);
  for(var i=0;i<state.radar.bullets.length;i++){
    var b=state.radar.bullets[i];
    if((b.dir+2)%4!==state.self.dir)continue;
    if(state.self.dir===0||state.self.dir===2){
      if(b.x!==m.x)continue;
      if(state.self.dir===0&&b.y<m.y&&m.y-b.y<=7)return true;
      if(state.self.dir===2&&b.y>m.y&&b.y-m.y<=7)return true;
    }else{
      if(b.y!==m.y)continue;
      if(state.self.dir===1&&b.x>m.x&&b.x-m.x<=7)return true;
      if(state.self.dir===3&&b.x<m.x&&m.x-b.x<=7)return true;
    }
  }
  return false;
}

function rhFireChoice(state,target,move,standing){
  if(state.self.fireCooldown!==0)return false;
  var bestValue=-999;
  for(var i=0;i<state.radar.tanks.length;i++){
    var e=state.radar.tanks[i],ray=rhRayToRect(state.map,state.self.x,state.self.y,state.self.dir,e);
    if(!ray)continue;
    if(e.invincibleTicks>=ray.phases)continue;
    if(e.hurtTicks>ray.phases)continue;
    var value=100-ray.dist*2+(e.hp===1?58:0)+(e.id===RH.quarry?18:0);
    var row=rhScoreRow(state,e.id);if(row)value+=row.points*4;
    if(value>bestValue)bestValue=value;
  }
  if(bestValue>0){
    if(state.self.invincibleTicks>0&&(bestValue<180||move.pressure>35||move.minBullet>0))return false;
    return true;
  }
  if(target&&!target.visible&&state.tick-target.tick<=3){
    var age=state.tick-target.tick;
    var ghost={x:target.x+target.vx*age,y:target.y+target.vy*age};
    if(rhFree(state.map,ghost.x,ghost.y)&&rhRayToRect(state.map,state.self.x,state.self.y,state.self.dir,ghost)){
      if(state.self.invincibleTicks===0&&!standing.leader)return true;
    }
  }
  if(rhDefensiveShot(state))return true;
  if(state.self.invincibleTicks>0)return false;
  var muzzle=rhMuzzle(state.self.x,state.self.y,state.self.dir),cx=muzzle.x,cy=muzzle.y;
  for(var d=1;d<=3;d++){
    if(cx<0||cy<0||cx>=N||cy>=N)break;
    var tile=state.map[cy][cx];
    if(tile===2)break;
    if(tile===1){
      if(target&&rhCheb(cx,cy,target.x,target.y)<=5)return true;
      break;
    }
    cx+=RH_DX[state.self.dir];cy+=RH_DY[state.self.dir];
  }
  return false;
}

function rhIntent(state,target,move,fire,standing){
  var box=state.arena.supply;
  if(box&&rhSupplyValue(state)>0&&rhCheb(state.self.x,state.self.y,box.x,box.y)<=8)return 'resupply';
  if(move.minBullet>0||(state.self.hp===1&&move.pressure>65))return 'retreat';
  if(standing.leader&&state.tick>=450)return 'defend';
  if(fire)return 'siege';
  if(target&&target.visible)return 'flank';
  if(target)return 'pursue';
  if(move.move==='stay')return 'hold';
  return 'advance';
}

function decide(state){
  if(state&&state.map){N=state.map.length;P=N-1;if(RH.size!==P)RH={size:P,lastTick:-1,lastX:-1,lastY:-1,lastMove:'stay',stuck:0,lastLives:3,quarry:'',quarryTick:-99,lastShot:-99,seen:{},bias:0};RH_STATE=state;}
  rhUpdateMemory(state);
  var tanks=state.radar.tanks.slice();
  var target=rhChooseQuarry(state);
  var standing=rhStanding(state);
  var bfs=rhBfs(state,tanks);
  var goal=rhGoal(state,tanks,target,standing,bfs);
  var move=rhMoveChoice(state,tanks,target,goal,standing);
  var fire=rhFireChoice(state,target,move,standing);
  if(fire)RH.lastShot=state.tick;
  var intent=rhIntent(state,target,move,fire,standing);
  RH.lastTick=state.tick;RH.lastX=state.self.x;RH.lastY=state.self.y;RH.lastMove=move.move;
  return {move:move.move,fire:fire,intent:intent};
}
