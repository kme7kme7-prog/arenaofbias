// ASTRA KNIFE: independent four-way combat controller, rules 2.6.
// All history comes from the player's observations; every search is bounded.
var KDX = [0, 1, 0, -1], KDY = [-1, 0, 1, 0];
var KMOVE = ['up', 'right', 'down', 'left', 'stay'];
var KM = {tick:-100, seen:{}, own:[], pending:null, visits:new Uint16Array(625), target:null, stuck:0, waypoint:0};

function kCell(x,y) { return y*25+x; }
function kOverlap(a,b) { return Math.abs(a.x-b.x)<2 && Math.abs(a.y-b.y)<2; }
function kMuzzle(x,y,d) { return {x:x+(d===1?2:d===3?-1:0),y:y+(d===2?2:d===0?-1:0),d:d}; }
function kMargin(t) { return t<200?0:Math.min(9,2+Math.floor((t-200)/50)); }
function kInside(x,y,m) { return x>=m && y>=m && x<=24-m && y<=24-m; }
function kTerrain(map,x,y) { return x>=0 && y>=0 && x<26 && y<26 ? map[y][x] : 2; }
function kFree(map,x,y) {
  if(x<0||y<0||x>24||y>24)return false;
  for(var yy=y;yy<y+2;yy++)for(var xx=x;xx<x+2;xx++)if(map[yy][xx]!==0&&map[yy][xx]!==4)return false;
  return true;
}
function kGrid(map) {
  var free=new Uint8Array(625), exits=new Uint8Array(625);
  for(var y=0;y<25;y++)for(var x=0;x<25;x++)free[kCell(x,y)]=kFree(map,x,y)?1:0;
  for(var y=0;y<25;y++)for(var x=0;x<25;x++)if(free[kCell(x,y)])for(var d=0;d<4;d++){
    var nx=x+KDX[d],ny=y+KDY[d];if(nx>=0&&ny>=0&&nx<25&&ny<25&&free[kCell(nx,ny)])exits[kCell(x,y)]++;
  }
  return {free:free,exits:exits};
}
function kBfs(free,starts) {
  var dist=new Int16Array(625);dist.fill(999);
  var q=new Int16Array(625),head=0,tail=0;
  for(var i=0;i<starts.length;i++)if(dist[starts[i]]===999){dist[starts[i]]=0;q[tail++]=starts[i];}
  while(head<tail){var c=q[head++],x=c%25,y=(c/25)|0;
    for(var d=0;d<4;d++){var nx=x+KDX[d],ny=y+KDY[d],n=kCell(nx,ny);
      if(nx<0||ny<0||nx>24||ny>24||!free[n]||dist[n]!==999)continue;
      dist[n]=dist[c]+1;q[tail++]=n;
    }
  }
  return dist;
}
// Return the first flight turn on which the projectile intersects the rectangle.
function kRay(map,x,y,d,e,limit) {
  var b=kMuzzle(x,y,d);
  for(var j=0;j<=limit;j++){
    var terrain=kTerrain(map,b.x,b.y);if(terrain===1||terrain===2)return -1;
    if(b.x>=e.x&&b.x<e.x+2&&b.y>=e.y&&b.y<e.y+2)return Math.floor(Math.max(0,j-1)/3);
    b.x+=KDX[d];b.y+=KDY[d];
  }
  return -1;
}
function kFacing(x,y,e) {
  if(x>=e.x&&x<=e.x+1){if(y+1<e.y)return 2;if(y>e.y+1)return 0;}
  if(y>=e.y&&y<=e.y+1){if(x+1<e.x)return 1;if(x>e.x+1)return 3;}
  return -1;
}
function kObserve(s) {
  var t=s.tick,me=s.self,gap=t-KM.tick;
  if(gap!==1 || KM.life!==me.lives){KM.own=[];KM.pending=null;KM.stuck=0;KM.target=null;}
  if(KM.pending&&gap===1&&me.fireCooldown>0){KM.own.push(KM.pending);}
  KM.pending=null;KM.own=KM.own.filter(function(b){
    var age=t-b.tick,m=kMuzzle(b.x,b.y,b.dir);
    if(age>=9)return false;
    for(var step=0;step<=age*3;step++){
      var terrain=kTerrain(s.map,m.x,m.y);if(terrain===1||terrain===2)return false;
      if(step<age*3){m.x+=KDX[b.dir];m.y+=KDY[b.dir];}
    }
    if(Math.max(Math.abs(m.x-me.x),Math.abs(m.y-me.y))>6)return true;
    return s.radar.bullets.some(function(v){return v.x===m.x&&v.y===m.y&&v.dir===b.dir;});
  });
  if(gap===1&&KM.last){KM.stuck=KM.last.move!=='stay'&&me.x===KM.last.x&&me.y===KM.last.y?KM.stuck+1:0;}
  for(var i=0;i<s.opponents.length;i++){
    var pub=s.opponents[i],old=KM.seen[pub.id];
    if(old&&(pub.lives!==old.lives||pub.respawnTicks>0||pub.status!=='active'))delete KM.seen[pub.id];
  }
  for(var i=0;i<s.radar.tanks.length;i++){
    var e=s.radar.tanks[i],old=KM.seen[e.id],pub=s.opponents.find(function(p){return p.id===e.id;});
    var vx=0,vy=0,lastShot=old?old.lastShot:-99,motion=old?old.motion:0.5;
    if(old&&old.tick===t-1){
      vx=e.x-old.x;vy=e.y-old.y;
      if(Math.abs(vx)+Math.abs(vy)>1){vx=0;vy=0;}
      motion=0.85*motion+0.15*(Math.abs(vx)+Math.abs(vy));
      var b=kMuzzle(old.x,old.y,old.dir);b.x+=3*KDX[b.d];b.y+=3*KDY[b.d];
      if(s.radar.bullets.some(function(v){return v.x===b.x&&v.y===b.y&&v.dir===b.d;}) &&
         !(KM.bullets||[]).some(function(v){return v.x+3*KDX[v.dir]===b.x&&v.y+3*KDY[v.dir]===b.y&&v.dir===b.d;}))lastShot=t-1;
    }
    KM.seen[e.id]={...e,tick:t,vx:vx,vy:vy,motion:motion,lastShot:lastShot,lives:pub?pub.lives:0};
  }
  var id=kCell(me.x,me.y);if(id>=0&&id<625)KM.visits[id]=Math.min(100,KM.visits[id]+1);
  if(t%32===0)for(var j=0;j<625;j++)KM.visits[j]=KM.visits[j]>>1;
}
function kEnemyModels(s,grid) {
  var out=[];
  for(var i=0;i<s.radar.tanks.length;i++){
    var e=KM.seen[s.radar.tanks[i].id],positions=[],total=0;
    for(var d=0;d<5;d++){
      var nx=e.x+(d<4?KDX[d]:0),ny=e.y+(d<4?KDY[d]:0);
      if(!kFree(s.map,nx,ny)||kOverlap({x:nx,y:ny},s.self))continue;
      var w=d===4?0.5+(1-e.motion)*1.7:0.32;
      if(d<4&&KDX[d]===e.vx&&KDY[d]===e.vy)w+=1.7*e.motion;
      if(d===e.dir)w+=0.28;
      positions.push({x:nx,y:ny,w:w});total+=w;
    }
    if(!positions.length){positions=[{x:e.x,y:e.y,w:1}];total=1;}
    for(var j=0;j<positions.length;j++)positions[j].w/=total;
    var cd=e.rapidTicks>1?4:6;
    out.push({e:e,positions:positions,ready:s.tick-e.lastShot>=cd,wait:Math.max(0,cd-(s.tick-e.lastShot))});
  }
  return out;
}
function kShot(s,x,y,d,enemies,delay) {
  var value=0;
  for(var i=0;i<enemies.length;i++){
    var model=enemies[i],e=model.e,p=0;
    for(var j=0;j<model.positions.length;j++){
      var q=model.positions[j],h=kRay(s.map,x,y,d,q,11);
      if(h<0||s.tick+h+delay>=600||e.hurtTicks>h+delay+1)continue;
      var inv=e.invincibleTicks>h+delay?0.12:1;
      p+=q.w*Math.pow(0.62,h)*inv;
    }
    value+=p*(e.hp===1?2.6:1)*(e.id===KM.target?1.08:1);
  }
  return Math.min(3,value);
}
// Exact simultaneous bullet-vs-bullet microsteps; tanks are deliberately not
// removed from forecasts after an expected kill. Unknown bullets remain hazards.
function kFlights(s,fire,extra) {
  var me=s.self,list=[],map=s.map.map(function(r){return r.slice();}),fields=[];
  for(var h=0;h<4;h++)fields.push(new Float32Array(625));
  for(var i=0;i<s.radar.bullets.length;i++){
    var b=s.radar.bullets[i],immune=0;
    for(var j=0;j<KM.own.length;j++){
      var own=KM.own[j],age=s.tick-own.tick,m=kMuzzle(own.x,own.y,own.dir);
      if(b.dir===own.dir&&b.x===m.x+3*age*KDX[b.dir]&&b.y===m.y+3*age*KDY[b.dir])immune=Math.max(0,3-age);
    }
    list.push({x:b.x,y:b.y,d:b.dir,immune:immune,alive:true,p:1});
  }
  if(fire){var b=kMuzzle(me.x,me.y,me.dir);list.push({...b,immune:3,alive:true,p:1});}
  if(extra)list.push({...extra,immune:0,alive:true,p:extra.p});
  for(var h=0;h<Math.min(4,600-s.tick);h++){
    var visited=list.map(function(){return new Set();});
    function settle(b,index){
      var terrain=kTerrain(map,b.x,b.y);
      if(terrain===1){map[b.y][b.x]=0;b.alive=false;return;}
      if(terrain===2){b.alive=false;return;}
      if(b.immune>h)return;
      for(var dy=0;dy<2;dy++)for(var dx=0;dx<2;dx++){
        var x=b.x-dx,y=b.y-dy;if(x<0||y<0||x>24||y>24)continue;
        var c=kCell(x,y);if(!visited[index].has(c)){fields[h][c]+=b.p;visited[index].add(c);}
      }
    }
    for(var i=0;i<list.length;i++)if(list[i].alive){
      for(var j=i+1;j<list.length;j++)if(list[j].alive&&list[i].x===list[j].x&&list[i].y===list[j].y){list[i].alive=false;list[j].alive=false;}
      if(list[i].alive)settle(list[i],i);
    }
    for(var step=0;step<3;step++){
      var deaths=[];
      for(var i=0;i<list.length;i++)if(list[i].alive)for(var j=i+1;j<list.length;j++)if(list[j].alive){
        var a=list[i],b=list[j],ax=a.x+KDX[a.d],ay=a.y+KDY[a.d],bx=b.x+KDX[b.d],by=b.y+KDY[b.d];
        if((ax===bx&&ay===by)||(ax===b.x&&ay===b.y&&bx===a.x&&by===a.y)){deaths.push(i,j);}
      }
      for(var i=0;i<deaths.length;i++)list[deaths[i]].alive=false;
      for(var i=0;i<list.length;i++)if(list[i].alive){list[i].x+=KDX[list[i].d];list[i].y+=KDY[list[i].d];settle(list[i],i);}
    }
  }
  return fields;
}
function kFutureThreats(s,enemies) {
  var fields=[new Float32Array(625),new Float32Array(625),new Float32Array(625),new Float32Array(625)];
  for(var ei=0;ei<enemies.length;ei++){
    var model=enemies[ei],e=model.e,poses=[{x:e.x,y:e.y,d:e.dir,w:1}];
    for(var h=1;h<4;h++){
      var next=new Map();
      for(var i=0;i<poses.length;i++)for(var d=0;d<5;d++){
        var p=poses[i],x=p.x+(d<4?KDX[d]:0),y=p.y+(d<4?KDY[d]:0),dir=d<4?d:p.d;
        if(!kFree(s.map,x,y)){x=p.x;y=p.y;}
        var w=p.w*(d===4?0.20:d===p.d?0.32:0.16),key=kCell(x,y)*4+dir;
        var old=next.get(key);if(old)old.w+=w;else next.set(key,{x:x,y:y,d:dir,w:w});
      }
      poses=Array.from(next.values()).sort(function(a,b){return b.w-a.w;}).slice(0,20);
      if(model.wait>h)continue;
      for(var i=0;i<poses.length;i++){
        var p=poses[i],b=kMuzzle(p.x,p.y,p.d),used=new Set();
        for(var step=0;step<4;step++){
          var terrain=kTerrain(s.map,b.x,b.y);if(terrain===1||terrain===2)break;
          for(var dy=0;dy<2;dy++)for(var dx=0;dx<2;dx++){
            var x=b.x-dx,y=b.y-dy,c=kCell(x,y);
            if(x>=0&&y>=0&&x<25&&y<25&&!used.has(c)){fields[h][c]+=p.w;used.add(c);}
          }
          b.x+=KDX[b.d];b.y+=KDY[b.d];
        }
      }
    }
  }
  return fields;
}
function kGoal(s,grid,enemies) {
  var me=s.self,c=kCell(me.x,me.y),from=kBfs(grid.free,[c]),margin=kMargin(s.tick+35);
  var safe=[];for(var y=margin;y<=24-margin;y++)for(var x=margin;x<=24-margin;x++)if(grid.free[kCell(x,y)])safe.push(kCell(x,y));
  var inward=kBfs(grid.free,safe),own=s.scoreboard.find(function(e){return e.id===me.id;}),lead=-999;
  var rivals=s.opponents.filter(function(e){return e.status==='active'&&e.lives>0;});
  if(own)lead=own.points-Math.max(0,...rivals.map(function(e){return e.points;}));
  var defensive=(lead>0&&s.tick>260)||(lead>=3&&s.tick>160)||(me.lives===1&&lead>0);
  var contacts=Object.values(KM.seen).filter(function(e){return s.tick-e.tick<25;});
  var target=null,best=-1e9;
  for(var i=0;i<contacts.length;i++){
    var e=contacts[i],dist=Math.abs(e.x-me.x)+Math.abs(e.y-me.y),score=16-dist+(e.hp===1?5:0)+(e.id===KM.target?4:0)-(s.tick-e.tick)*0.6-(e.invincibleTicks>3?8:0);
    if(score>best){best=score;target=e;}
  }
  KM.target=target?target.id:null;
  var box=s.arena.supply,desiredBox=box&&s.tick<box.expireTick&&((box.type==='repair'&&me.hp<2)||(box.type==='rapid'&&me.rapidTicks<15));
  var patrol=[[8,8],[16,8],[16,16],[8,16],[12,12]],way=patrol[KM.waypoint%patrol.length];
  if(Math.abs(me.x-way[0])+Math.abs(me.y-way[1])<2){KM.waypoint++;way=patrol[KM.waypoint%patrol.length];}
  var goal=c,scoreBest=-1e9,intent='advance';
  for(var y=0;y<25;y++)for(var x=0;x<25;x++){
    var n=kCell(x,y),dist=from[n];if(!grid.free[n]||dist>40)continue;
    var v=-0.82*dist-KM.visits[n]*0.16;
    if(!kInside(x,y,margin))v-=90+12*inward[n];
    v+=grid.exits[n]*0.7;
    var attack=-999,minDist=99,threats=0;
    for(var i=0;i<contacts.length;i++){
      var e=contacts[i],r=Math.abs(e.x-x)+Math.abs(e.y-y),age=s.tick-e.tick;
      minDist=Math.min(minDist,r);
      var aim=kFacing(x,y,e),toward=kFacing(e.x,e.y,{x:x,y:y});
      if(toward>=0&&kRay(s.map,e.x,e.y,toward,{x:x,y:y},12)>=0){threats++;v-=defensive?8:3.5;}
      if(e.id===KM.target){
        attack=-1.25*Math.max(0,r-3);
        if(aim>=0&&kRay(s.map,x,y,aim,e,12)>=0){
          attack+=17-0.7*r+(toward<0?7:0)+(e.hp===1?3:0);
          if(e.invincibleTicks>3)attack-=10;
        }
        attack-=age*0.2;
      }
      if(r<4)v-=defensive?8*(4-r):1.5*(4-r);
    }
    if(threats>1)v-=7*(threats-1);
    if(defensive&&contacts.length){v+=Math.min(minDist,14)*2.2;v-=Math.abs(x-12)*0.1+Math.abs(y-12)*0.1;}
    else if(target)v+=attack;
    else v-=0.9*(Math.abs(x-way[0])+Math.abs(y-way[1]));
    var supplyValue=0;
    if(desiredBox){
      var sd=Math.max(0,Math.abs(x-box.x)-1)+Math.max(0,Math.abs(y-box.y)-1);
      supplyValue=(box.type==='repair'?34:17)-sd*2.4-Math.max(0,box.appearTick-s.tick-dist)*0.3;
      if(supplyValue>0)v+=supplyValue;
    }
    if(v>scoreBest){scoreBest=v;goal=n;intent=supplyValue>9?'resupply':defensive?'retreat':target?'pursue':'advance';}
  }
  return {dist:kBfs(grid.free,[goal]),inward:inward,margin:margin,defensive:defensive,intent:intent,lead:lead};
}
function kExposure(s,x,y,enemies,h) {
  var value=0;
  for(var i=0;i<enemies.length;i++){
    var m=enemies[i],e=m.e;
    if(m.wait>h+1)continue;
    var d=kFacing(e.x,e.y,{x:x,y:y});
    if(d<0)continue;
    var flight=kRay(s.map,e.x,e.y,d,{x:x,y:y},10);
    if(flight<0)continue;
    var turn=d===e.dir?1:0.4;
    value+=turn*Math.pow(0.64,flight);
  }
  return value;
}
function kPlan(s,grid,enemies,goal,fire,future) {
  var me=s.self,fields=kFlights(s,fire,null),spec=[];
  // Each possible new enemy shot is simulated independently so a hypothetical
  // projectile cannot erase a real one in the safety forecast.
  for(var i=0;i<enemies.length;i++)if(enemies[i].ready){
    var e=enemies[i].e,m=kMuzzle(e.x,e.y,e.dir);
    spec.push(kFlights(s,fire,{...m,p:0.78}));
  }
  var damageCost=me.hp===1?620:390;if(me.lives===1)damageCost*=1.7;
  var shot=fire?kShot(s,me.x,me.y,me.dir,enemies,0):0;
  var root={x:me.x,y:me.y,d:me.dir,score:shot*38,first:4,trail:[]},beam=[root],best=root;
  for(var h=0;h<Math.min(4,600-s.tick);h++){
    var nodes=[],used=new Map();
    for(var bi=0;bi<beam.length;bi++)for(var move=0;move<5;move++){
      var prev=beam[bi],x=prev.x,y=prev.y,d=move<4?move:prev.d,blocked=false;
      if(move<4){
        var nx=x+KDX[move],ny=y+KDY[move];
        blocked=nx<0||ny<0||nx>24||ny>24||!grid.free[kCell(nx,ny)];
        if(!blocked&&h<2)for(var ei=0;ei<enemies.length;ei++)if(kOverlap({x:nx,y:ny},enemies[ei].e)){blocked=true;break;}
        if(!blocked){x=nx;y=ny;}
      }
      var n=kCell(x,y),v=prev.score,protectedNow=(!fire&&me.invincibleTicks>h)||me.hurtTicks>h+1;
      var risk=protectedNow?0:fields[h][n],p=0;
      if(!protectedNow)for(var si=0;si<spec.length;si++)p+=Math.max(0,spec[si][h][n]-fields[h][n]);
      // An earlier mover can occupy our intended escape cell. Account for the
      // resulting stationary tank, rather than trusting an unexecuted dodge.
      if(h===0&&!protectedNow&&!blocked&&move<4){
        var blockedChance=0,myOrder=(me.id.charCodeAt(0)-65-s.tick%4+4)%4;
        for(var ei=0;ei<enemies.length;ei++){
          var em=enemies[ei];
          if((em.e.id.charCodeAt(0)-65-s.tick%4+4)%4>=myOrder)continue;
          for(var pi=0;pi<em.positions.length;pi++)if(kOverlap({x:x,y:y},em.positions[pi]))blockedChance+=em.positions[pi].w;
        }
        if(blockedChance>0){
          var oldCell=kCell(prev.x,prev.y),oldRisk=fields[0][oldCell],oldP=0;
          for(var si=0;si<spec.length;si++)oldP+=Math.max(0,spec[si][0][oldCell]-fields[0][oldCell]);
          v-=damageCost*Math.min(1,blockedChance)*(Math.max(0,oldRisk-risk)+Math.max(0,oldP-p)*0.8);
        }
      }
      v-=damageCost*Math.pow(0.77,h)*(Math.min(1.6,risk)+Math.min(1.25,p)*0.8);
      if(!protectedNow&&h>0)v-=damageCost*0.5*Math.pow(0.8,h)*future[h][n];
      if(!protectedNow)v-=kExposure(s,x,y,enemies,h)*(h===0?7:12)*Math.pow(0.8,h);
      var margin=kMargin(s.tick+h);
      if(!kInside(x,y,margin))v-=((s.tick+h)%10===0?damageCost:18)+goal.inward[n]*4;
      if(!kInside(x,y,goal.margin)){
        var until=Math.max(0,(s.arena.safeZone.nextShrinkTick||s.tick)-s.tick);
        v-=6+goal.inward[n]*(8+60/(until+3));
      }
      v-=goal.dist[n]*1.6;
      v-=KM.visits[n]*0.09;
      if(blocked)v-=0.7+Math.min(5,KM.stuck)*0.4;
      if(prev.trail.indexOf(n)>=0)v-=0.75;
      if(move===4)v-=0.18;
      if(enemies.length){
        var aim=kShot(s,x,y,d,enemies,h+1),ready=Math.max(0,(fire?(me.rapidTicks>1?4:6):me.fireCooldown)-h);
        v+=aim*(ready<=1?6.5:1.2)*(goal.defensive?0.6:1);
      }
      v+=grid.exits[n]*0.15;
      var first=h===0?move:prev.first,key=n*4+d,node={x:x,y:y,d:d,score:v,first:first,trail:prev.trail.concat(n)};
      var old=used.get(key);if(!old||old.score<v)used.set(key,node);
    }
    nodes=Array.from(used.values());nodes.sort(function(a,b){return b.score-a.score;});beam=nodes.slice(0,12);best=beam[0]||root;
  }
  return {move:KMOVE[best.first],fire:fire,intent:goal.intent,value:best.score};
}
function decide(state) {
  if(!state||!state.self||!state.map||!state.radar)return {move:'stay',fire:false,intent:'hold'};
  var s=state,me=s.self;
  kObserve(s);
  var grid=kGrid(s.map),enemies=kEnemyModels(s,grid),goal=kGoal(s,grid,enemies),future=kFutureThreats(s,enemies);
  var result=kPlan(s,grid,enemies,goal,false,future);
  var quality=kShot(s,me.x,me.y,me.dir,enemies,0);
  if(me.fireCooldown===0&&KM.own.length<2&&(quality>0.015||s.radar.bullets.length>0)){
    var fired=kPlan(s,grid,enemies,goal,true,future);
    if(fired.value>result.value+0.15)result=fired;
  }
  if(result.fire)KM.pending={tick:s.tick,x:me.x,y:me.y,dir:me.dir};
  KM.tick=s.tick;KM.life=me.lives;KM.bullets=s.radar.bullets;
  KM.last={x:me.x,y:me.y,move:result.move};
  return {move:result.move,fire:result.fire,intent:result.intent};
}
