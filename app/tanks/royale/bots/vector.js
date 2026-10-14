// VECTOR 26: lateral firing lanes and bounded receding-horizon movement.
var V = {tick:-1, lives:3, prev:null, foes:{}, own:[], visits:[], blocked:[], target:null};
var DX = [0,1,0,-1], DY = [-1,0,1,0], MOVES = ['up','right','down','left','stay'];
var N=26,P=25;
function centerPos() { return (N-2)/2; }
function scaleAnchor(v) { return Math.round(v*(N-2)/24); }
function cover(p,x,y) { return x>=p.x && x<p.x+2 && y>=p.y && y<p.y+2; }
function overlap(a,b) { return a.x<b.x+2 && a.x+2>b.x && a.y<b.y+2 && a.y+2>b.y; }
function validCell(m,x,y) {
  if(x<0||y<0||x>N-2||y>N-2) return false;
  return (m[y][x]===0||m[y][x]===4) && (m[y][x+1]===0||m[y][x+1]===4)
    && (m[y+1][x]===0||m[y+1][x]===4) && (m[y+1][x+1]===0||m[y+1][x+1]===4);
}
function muzzle(p,d) {
  return {x:p.x+(d===1?2:d===3?-1:0), y:p.y+(d===2?2:d===0?-1:0),dir:d};
}
function ray(m,p,d,t) {
  var b=muzzle(p,d), dx=DX[d],dy=DY[d];
  for(var n=0;n<N;n++,b.x+=dx,b.y+=dy) {
    if(b.x<0||b.y<0||b.x>=N||b.y>=N||m[b.y][b.x]===1||m[b.y][b.x]===2) return -1;
    if(cover(t,b.x,b.y)) return n;
  }
  return -1;
}
function inside(p,min) { return p.x>=min && p.y>=min && p.x<=N-2-min && p.y<=N-2-min; }
function margin(t,s) {
  var z=s.arena.safeZone,q=s.arena.zoneSchedule;if(!q)return t<200?0:Math.min(9,2+Math.floor((t-200)/50));
  if(t<=s.tick)return z.min;if(z.nextShrinkTick===null||t<z.nextShrinkTick)return z.min;
  return Math.min(N-1,z.nextMin+Math.floor((t-z.nextShrinkTick)/q.stepTicks)*q.stepSize);
}
function bfs(free,starts) {
  var dist=new Int16Array(P*P);dist.fill(1000);
  var q=new Int16Array(P*P),tail=0,head=0;
  for(var i=0;i<starts.length;i++) if(free[starts[i]]&&dist[starts[i]]!==0) { dist[starts[i]]=0;q[tail++]=starts[i]; }
  while(head<tail) {
    var k=q[head++],x=k%P,y=(k/P)|0;
    for(var d=0;d<4;d++) {
      var nx=x+DX[d],ny=y+DY[d],nk=ny*P+nx;
      if(nx>=0&&ny>=0&&nx<P&&ny<P&&free[nk]&&dist[nk]>dist[k]+1) { dist[nk]=dist[k]+1;q[tail++]=nk; }
    }
  }
  return dist;
}
function remember(s) {
  var me=s.self, dt=s.tick-V.tick, reset=V.tick<0||dt!==1||me.lives!==V.lives;
  if(reset) { V.prev=null;V.own=[];V.visits=[];V.blocked=[];V.target=null; }
  if(V.prev&&(me.x!==V.prev.expectX||me.y!==V.prev.expectY)) {
    V.blocked.push({x:V.prev.x,y:V.prev.y,move:V.prev.move,tick:s.tick});
  }
  V.blocked=V.blocked.filter(function(b){return s.tick-b.tick<4;}).slice(-4);
  var bullets=s.radar.bullets, own=[];
  if(!reset) {
    for(var i=0;i<V.own.length;i++) {
      var b=V.own[i],x=b.x+3*DX[b.dir],y=b.y+3*DY[b.dir];
      if(x<0||x>=N||y<0||y>=N||s.tick-b.born>10) continue;
      var seen=bullets.some(function(c){return c.x===x&&c.y===y&&c.dir===b.dir;});
      if(seen||Math.max(Math.abs(x-me.x),Math.abs(y-me.y))>6) own.push({x:x,y:y,dir:b.dir,born:b.born});
    }
    if(V.prev.fire && V.prev.cooldown===0 && me.fireCooldown>0) {
      var shot=muzzle(V.prev,V.prev.dir),sx=shot.x+3*DX[shot.dir],sy=shot.y+3*DY[shot.dir];
      if(bullets.some(function(c){return c.x===sx&&c.y===sy&&c.dir===shot.dir;})) own.push({x:sx,y:sy,dir:shot.dir,born:s.tick-1});
    }
  }
  V.own=own.slice(-2);
  var enemies=[];
  for(var i=0;i<s.radar.tanks.length;i++) {
    var e=s.radar.tanks[i],old=V.foes[e.id],vx=0,vy=0,momentum=0;
    if(old&&s.tick-old.tick===1) {
      vx=e.x-old.x;vy=e.y-old.y;
      if(Math.abs(vx)+Math.abs(vy)>1) {vx=0;vy=0;}
      momentum=old.vx===vx&&old.vy===vy?Math.min(5,(old.momentum||0)+1):0;
    }
    var ready=old?old.ready:0;
    if(V.prev&&old&&old.tick===s.tick-1&&e.invincibleTicks===0) {
      var m=muzzle(old,old.dir),ex=m.x+3*DX[old.dir],ey=m.y+3*DY[old.dir];
      for(var j=0;j<bullets.length;j++) {
        var c=bullets[j];
        if(c.x!==ex||c.y!==ey||c.dir!==old.dir) continue;
        var prior=V.prev.bullets.some(function(b){return b.dir===c.dir&&b.x+3*DX[b.dir]===c.x&&b.y+3*DY[b.dir]===c.y;});
        var ours=own.some(function(b){return b.x===c.x&&b.y===c.y&&b.dir===c.dir;});
        if(!prior&&!ours) ready=s.tick+(old.rapidTicks>1?3:5);
      }
    }
    var record={id:e.id,x:e.x,y:e.y,dir:e.dir,hp:e.hp,invincibleTicks:e.invincibleTicks,hurtTicks:e.hurtTicks,
      rapidTicks:e.rapidTicks,vx:vx,vy:vy,momentum:momentum,ready:ready,tick:s.tick,visible:true};
    V.foes[e.id]=record;enemies.push(record);
  }
  for(var id in V.foes) {
    var old=V.foes[id],status=s.opponents.find(function(o){return o.id===id;});
    if(!status||status.status!=='active'||status.respawnTicks>0||s.tick-old.tick>18) {delete V.foes[id];continue;}
    if(old.tick!==s.tick) enemies.push({id:id,x:old.x,y:old.y,dir:old.dir,hp:old.hp,vx:old.vx,vy:old.vy,momentum:old.momentum,
      invincibleTicks:0,hurtTicks:0,rapidTicks:old.rapidTicks,ready:old.ready,tick:old.tick,visible:false});
  }
  V.tick=s.tick;V.lives=me.lives;
  V.visits.push({x:me.x,y:me.y});if(V.visits.length>18)V.visits.shift();
  return enemies;
}
// A small distribution covers continued motion, stopping and direction changes.
function predictions(e,m,self) {
  var weights=[0.08,0.08,0.08,0.08,0.22];
  weights[e.dir]+=0.15;
  var velocity=4;
  for(var d=0;d<4;d++) if(e.vx===DX[d]&&e.vy===DY[d]) velocity=d;
  weights[velocity]+=0.34+0.03*Math.min(3,e.momentum);
  var lists=[],current=[{x:e.x,y:e.y,p:1}],sumw=weights.reduce(function(a,b){return a+b;},0);
  for(var h=0;h<5;h++) {
    var acc={};
    for(var i=0;i<current.length;i++) for(var d=0;d<5;d++) {
      var x=current[i].x+(d<4?DX[d]:0),y=current[i].y+(d<4?DY[d]:0);
      if(!validCell(m,x,y)||overlap({x:x,y:y},self)) {x=current[i].x;y=current[i].y;}
      var k=y*P+x;acc[k]=(acc[k]||0)+current[i].p*weights[d]/sumw;
    }
    current=[];for(var k in acc) if(acc[k]>0.005) current.push({x:Number(k)%P,y:(Number(k)/P)|0,p:acc[k]});
    lists.push(current);
  }
  return lists;
}
function shotValue(s,p,d,enemies,forecasts) {
  var b=muzzle(p,d),sum=0,hit=[0,0,0],m=s.map;
  for(var n=0;n<16;n++,b.x+=DX[d],b.y+=DY[d]) {
    if(b.x<0||b.x>=N||b.y<0||b.y>=N) break;
    if(m[b.y][b.x]===1||m[b.y][b.x]===2) break;
    var h=n===0?0:((n-1)/3)|0;
    for(var i=0;i<enemies.length;i++) {
      var e=enemies[i];if(!e.visible||e.invincibleTicks>h||e.hurtTicks>h+1)continue;
      var prob=0,positions=forecasts[i][Math.min(h,4)];
      for(var j=0;j<positions.length;j++) if(cover(positions[j],b.x,b.y)) prob+=positions[j].p;
      if(prob>hit[i]) hit[i]=prob;
    }
  }
  for(var i=0;i<enemies.length;i++) {
    var e=enemies[i],reward=e.hp===1?3.25:1.1;
    var board=s.opponents.find(function(o){return o.id===e.id;});
    if(board&&board.lives===1&&e.hp===1) reward+=1;
    if(e.id===V.target) reward*=1.08;
    sum+=hit[i]*reward;
  }
  return sum;
}
function mark(matrix,x,y,value) {
  for(var yy=y-1;yy<=y;yy++) for(var xx=x-1;xx<=x;xx++) if(xx>=0&&yy>=0&&xx<P&&yy<P) matrix[yy*P+xx]+=value;
}
// Radar bullets are anonymous. Only confirmed matching self-shot history is exempt.
function danger(s,fire) {
  var bs=s.radar.bullets.map(function(b){
    var own=V.own.find(function(c){return b.x===c.x&&b.y===c.y&&b.dir===c.dir;});
    return {x:b.x,y:b.y,dir:b.dir,immune:own?3-(s.tick-own.born):0,alive:true};
  });
  if(fire) {var b=muzzle(s.self,s.self.dir);bs.push({x:b.x,y:b.y,dir:b.dir,immune:3,alive:true});}
  var result=[],m=s.map.map(function(r){return r.slice();});
  function settle(b,cells,h) {
    if(b.x<0||b.x>=N||b.y<0||b.y>=N) {b.alive=false;return;}
    var terrain=m[b.y][b.x];
    if(terrain===1||terrain===2) {if(terrain===1)m[b.y][b.x]=0;b.alive=false;return;}
    if(b.immune<=h) cells.push({x:b.x,y:b.y});
  }
  for(var h=0;h<4;h++) {
    var matrix=new Float64Array(P*P),traces=bs.map(function(){return [];});
    for(var i=0;i<bs.length;i++) if(bs[i].alive) settle(bs[i],traces[i],h);
    for(var i=0;i<bs.length;i++) for(var j=i+1;j<bs.length;j++) if(bs[i].alive&&bs[j].alive&&bs[i].x===bs[j].x&&bs[i].y===bs[j].y) {bs[i].alive=false;bs[j].alive=false;}
    for(var step=0;step<3;step++) {
      for(var i=0;i<bs.length;i++) for(var j=i+1;j<bs.length;j++) {
        var a=bs[i],b=bs[j];if(!a.alive||!b.alive)continue;
        var ax=a.x+DX[a.dir],ay=a.y+DY[a.dir],bx=b.x+DX[b.dir],by=b.y+DY[b.dir];
        if((ax===bx&&ay===by)||(ax===b.x&&ay===b.y&&bx===a.x&&by===a.y)) {a.alive=false;b.alive=false;}
      }
      for(var i=0;i<bs.length;i++) if(bs[i].alive) {bs[i].x+=DX[bs[i].dir];bs[i].y+=DY[bs[i].dir];settle(bs[i],traces[i],h);}
    }
    for(var i=0;i<traces.length;i++) {
      var local=new Uint8Array(P*P);
      for(var j=0;j<traces[i].length;j++) mark(local,traces[i][j].x,traces[i][j].y,1);
      for(var k=0;k<P*P;k++) if(local[k]) matrix[k]++;
    }
    result.push(matrix);
  }
  return result;
}
function expectedShots(s,enemies) {
  var out=[];for(var h=0;h<4;h++)out.push(new Float64Array(P*P));
  for(var i=0;i<enemies.length;i++) {
    var e=enemies[i],age=s.tick-e.tick;if(!e.visible&&age>4) continue;
    var align=ray(s.map,e,e.dir,s.self),base=align>=0?0.76:0.18;
    if(e.invincibleTicks>2)base*=0.5;
    if(!e.visible)base*=0.45;
    for(var h=0;h<4;h++) {
      if(e.ready>s.tick+h) continue;
      for(var d=0;d<4;d++) {
        if(h===0&&d!==e.dir)continue;
        var weight=d===e.dir?base:(e.visible?0.12:0.045);
        var origins=[{x:e.x,y:e.y,p:0.7}];
        if(h>0&&validCell(s.map,e.x+e.vx,e.y+e.vy)) origins.push({x:e.x+e.vx,y:e.y+e.vy,p:0.3});
        else origins[0].p=1;
        for(var z=0;z<origins.length;z++) {
          var b=muzzle(origins[z],d),local=new Uint8Array(P*P);
          for(var n=0;n<4+3*h;n++,b.x+=DX[d],b.y+=DY[d]) {
            if(b.x<0||b.x>=N||b.y<0||b.y>=N||s.map[b.y][b.x]===1||s.map[b.y][b.x]===2)break;
            mark(local,b.x,b.y,1);
          }
          for(var k=0;k<P*P;k++) if(local[k]) out[h][k]+=weight*origins[z].p;
        }
      }
    }
  }
  return out;
}
function decide(state) {
  if(state&&state.map){N=state.map.length;P=N-1;if(V.size!==P){V={size:P,tick:-1,lives:3,prev:null,foes:{},own:[],visits:[],blocked:[],target:null};}}
  if(!state||!state.self||!state.map||!state.radar||!state.arena) return {move:'stay',fire:false,intent:'hold'};
  var s=state,me=s.self,m=s.map,enemies=remember(s),visible=enemies.filter(function(e){return e.visible;});
  var free=new Uint8Array(P*P),starts=[],futureStarts=[],min=margin(s.tick,s);
  var next=s.arena.safeZone.nextShrinkTick===null?min:s.arena.safeZone.nextMin;
  for(var y=0;y<P;y++)for(var x=0;x<P;x++) {
    var k=y*P+x;if(!validCell(m,x,y))continue;free[k]=1;
    if(inside({x:x,y:y},min))starts.push(k);
    if(inside({x:x,y:y},next))futureStarts.push(k);
  }
  var here=me.y*P+me.x,walkFree=free.slice();
  for(var k=0;k<P*P;k++)if(walkFree[k])for(var i=0;i<visible.length;i++)if(overlap({x:k%P,y:(k/P)|0},visible[i]))walkFree[k]=0;
  walkFree[here]=1;
  var reach=bfs(walkFree,[here]),zoneDist=bfs(free,starts),nextDist=bfs(free,futureStarts);
  var exitWindow=s.arena.safeZone.nextShrinkTick===null?0:s.arena.safeZone.nextShrinkTick-s.tick;
  var exitUrgency=exitWindow<=Math.max(40,nextDist[here]+18)?1:0;
  if(!exitUrgency)nextDist.fill(0);
  var selfRow=s.scoreboard.find(function(o){return o.id===me.id;});
  var rivalPoints=0;for(var i=0;i<s.opponents.length;i++)if(s.opponents[i].lives>0)rivalPoints=Math.max(rivalPoints,s.opponents[i].points);
  var lead=selfRow?selfRow.points-rivalPoints:0,conserve=me.lives===1||s.tick>475&&lead>1;
  var damageCost=me.hp===1?(me.lives===1?130:58):27;
  var target=null,targetValue=-1e9;
  for(var i=0;i<enemies.length;i++) {
    var e=enemies[i],value=10/(2+Math.abs(me.x-e.x)+Math.abs(me.y-e.y))+(e.hp===1?1.1:0);
    if(e.id===V.target)value+=0.45;
    if(!e.visible)value*=0.3;
    if(e.invincibleTicks>2)value-=1;
    if(value>targetValue){targetValue=value;target=e;}
  }
  V.target=target?target.id:null;
  var forecasts=enemies.map(function(e){return predictions(e,m,me);});
  var potential=new Float64Array(P*P),goal=here,bestGoal=-1e9,supply=s.arena.supply;
  var useful=supply&&s.tick<supply.expireTick-2&&(supply.type==='repair'?me.hp<2:me.rapidTicks<30);
  var repulse=new Float64Array(P*P);
  for(var i=0;i<V.visits.length-1;i++)repulse[V.visits[i].y*P+V.visits[i].x]+=(i+1)/V.visits.length;
  for(var k=0;k<P*P;k++) {
    if(!free[k]||reach[k]>=1000) {potential[k]=-10000;continue;}
    var p={x:k%P,y:(k/P)|0},value=0,offense=0,exposure=0;
    for(var i=0;i<enemies.length;i++) {
      var e=enemies[i],dist=Math.abs(p.x-e.x)+Math.abs(p.y-e.y),confidence=e.visible?1:0.2*(1-(s.tick-e.tick)/20);
      if(overlap(p,e)&&e.visible) {value-=20;continue;}
      var shot=-1,shotDir=-1;
      for(var d=0;d<4;d++) {var n=ray(m,p,d,e);if(n>=0&&(shot<0||n<shot)){shot=n;shotDir=d;}}
      if(shot>=0) {
        var active=e.invincibleTicks>2?0.1:1;
        var asymmetric=(shotDir%2===0?p.x===e.x+1:p.y===e.y+1)?1.65:0.7;
        var reward=(e.hp===1?7.2:4.2)*confidence*active*asymmetric/(1+Math.max(0,shot-3)*0.17);
        if(e.id===V.target)reward*=1.18;
        offense=Math.max(offense,reward)+reward*0.08;
      }
      for(var d=0;d<4;d++) {
        var n=ray(m,e,d,p);if(n<0)continue;
        exposure+=(d===e.dir?2.6:0.8)*confidence/(1+Math.max(0,n-3)*0.12);
      }
      if(dist<4&&e.visible)exposure+=(4-dist)*(e.invincibleTicks>2?1.3:0.7);
      if(e.id===V.target)value-=Math.min(25,dist)*(e.visible?0.16:0.12);
    }
    value+=offense*(conserve?0.68:1)-exposure*(conserve?1.7:1);
    if(useful) {
      var sd=Math.max(0,Math.abs(p.x-supply.x)-1)+Math.max(0,Math.abs(p.y-supply.y)-1);
      var worth=supply.type==='repair'?7.2:3.8;
      value+=worth/(1+sd*0.4);
      if(!target)value-=sd*0.22;
    } else if(!target) {
      var center=centerPos(),radius=Math.max(Math.abs(p.x-center),Math.abs(p.y-center));
      value-=Math.abs(radius-(conserve?3:4))*0.65;
      var seat=s.scoreboard.findIndex(function(row){return row.id===me.id;});
      var phase=(Math.floor(s.tick/45)+(seat<0?0:seat%4))%4;
      var px=scaleAnchor([8,16,16,8][phase]),py=scaleAnchor([8,8,16,16][phase]);
      value-=0.09*(Math.abs(p.x-px)+Math.abs(p.y-py));
    }
    value-=zoneDist[k]*10+nextDist[k]*10;
    if(!inside(p,margin(s.tick+reach[k]+12,s)))value-=10;
    potential[k]=value;
    var goalValue=value-reach[k]*0.4-repulse[k]*0.12;
    if(goalValue>bestGoal){bestGoal=goalValue;goal=k;}
  }
  var route=bfs(walkFree,[goal]),soft=expectedShots(s,enemies),known0=danger(s,false);
  var ready=me.fireCooldown===0&&V.own.length<2,shot=ready?shotValue(s,me,me.dir,enemies,forecasts):0;
  var brick=false,front=muzzle(me,me.dir);
  if(ready&&front.x>=0&&front.x<N&&front.y>=0&&front.y<N&&m[front.y][front.x]===1) {
    var dest={x:me.x+DX[me.dir],y:me.y+DY[me.dir]};
    brick=!validCell(m,dest.x,dest.y)&&Math.abs(dest.x-goal%P)+Math.abs(dest.y-((goal/P)|0))<Math.abs(me.x-goal%P)+Math.abs(me.y-((goal/P)|0));
  }
  var fireChoices=[false];if(ready&&(shot>0.045||brick))fireChoices.push(true);
  var best=-1e12,choice=4,chosenFire=false;
  var rotation=s.random%4,order=[rotation,(rotation+1)%4,(rotation+2)%4,(rotation+3)%4,4];
  function nextPosition(x,y,d,h) {
    if(d===4)return {x:x,y:y,dir:-1};
    var nx=x+DX[d],ny=y+DY[d],blocked=!validCell(m,nx,ny);
    if(!blocked)for(var i=0;i<visible.length;i++)if(overlap({x:nx,y:ny},visible[i])){blocked=true;break;}
    return {x:blocked?x:nx,y:blocked?y:ny,dir:d};
  }
  function leaf(x,y,dir) {
    var k=y*P+x,value=potential[k]*0.42-route[k]*0.88;
    if(me.fireCooldown<=3) {
      var e=target;if(e&&e.visible&&e.invincibleTicks<3&&ray(m,{x:x,y:y},dir,e)>=0)value+=1.3;
    }
    return value;
  }
  function search(x,y,dir,h,hurts,inv,known) {
    if(h===3)return leaf(x,y,dir);
    var best=-1e10;
    for(var j=0;j<5;j++) {
      var d=order[j],p=nextPosition(x,y,d,h),nd=d===4?dir:d,k=p.y*P+p.x;
      var hit=known[h][k]>0&&inv<=h&&hurts<=h+1;
      var cost=hit?damageCost:0,nh=hit?h+5:hurts;
      if(inv<=h&&hurts<=h+1)cost+=Math.min(1.3,soft[h][k])*damageCost*(h===0?0.9:0.38);
      if(s.tick+h>=200&&(s.tick+h)%10===0&&!inside(p,margin(s.tick+h,s)))cost+=damageCost*1.5;
      cost+=zoneDist[k]*4+nextDist[k]*2.4+Math.min(50,route[k])*0.24;
      if(d!==4&&p.x===x&&p.y===y&&h===0)cost+=0.35;
      var value=-cost+(h===0?0:potential[k]*0.025)+search(p.x,p.y,nd,h+1,nh,inv,known);
      if(value>best)best=value;
    }
    return best;
  }
  for(var f=0;f<fireChoices.length;f++) {
    var fire=fireChoices[f],known=fire?danger(s,true):known0,inv=fire?0:me.invincibleTicks;
    for(var j=0;j<5;j++) {
      var d=order[j],p=nextPosition(me.x,me.y,d,0),dir=d===4?me.dir:d,k=p.y*P+p.x;
      var hit=known[0][k]>0&&inv===0&&me.hurtTicks<=1;
      var cost=hit?damageCost*3:0,hurts=hit?5:me.hurtTicks;
      if(inv===0&&me.hurtTicks<=1)cost+=Math.min(1.3,soft[0][k])*damageCost*0.9;
      if(s.tick>=200&&s.tick%10===0&&!inside(p,min))cost+=damageCost*3;
      cost+=zoneDist[k]*5+nextDist[k]*3+Math.min(50,route[k])*0.32;
      for(var b=0;b<V.blocked.length;b++)if(V.blocked[b].x===me.x&&V.blocked[b].y===me.y&&V.blocked[b].move===MOVES[d])cost+=1.5;
      var value=search(p.x,p.y,dir,1,hurts,inv,known)-cost;
      value+=fire?(shot*7.5+(brick?0.6:0)-0.08):0;
      if(fire&&me.invincibleTicks>0)value-=Math.min(8,me.invincibleTicks*0.45);
      value-=repulse[k]*(target?0.07:0.28);
      if(d!==4&&p.x===me.x&&p.y===me.y)value-=0.3;
      if(d!==4&&V.prev&&V.prev.move===MOVES[(d+2)%4])value-=0.15;
      if(!fire&&me.fireCooldown<=1)value+=shotValue(s,p,dir,enemies,forecasts)*2.8;
      if(dir===me.dir)value+=0.03;
      if(value>best){best=value;choice=d;chosenFire=fire;}
    }
  }
  var p=nextPosition(me.x,me.y,choice,0),intent='hold';
  if(zoneDist[here]>0||nextDist[here]>0)intent='retreat';
  else if(useful&&overlap(p,supply))intent='resupply';
  else if(known0[0][here]>0||me.hp===1&&visible.length)intent='retreat';
  else if(target)intent=chosenFire?'pursue':'flank';
  else if(choice!==4)intent=useful?'resupply':'advance';
  V.prev={x:me.x,y:me.y,expectX:p.x,expectY:p.y,dir:me.dir,fire:chosenFire,cooldown:me.fireCooldown,move:MOVES[choice],bullets:s.radar.bullets.map(function(b){return {x:b.x,y:b.y,dir:b.dir};})};
  return {move:MOVES[choice],fire:chosenFire,intent:intent};
}
