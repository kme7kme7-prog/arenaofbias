// kestrel — 四人乱斗 2.6.0 参赛作品
// 主线：弹道节拍控制。每拍精确模拟子弹落点；绝不滞留敌车已瞄准的近距弹线；
// 用弹主归属估计对手冷却，在冷却窗口内压上；躲不开的头对头弹用对撞弹拦截；
// 残血收割、领先保命、圈外无条件撤。

var DX=[0,1,0,-1],DY=[-1,0,1,0];
var MV=['up','right','down','left'];
var OPP=[2,3,0,1];
var MZX=[0,2,0,-1],MZY=[-1,0,2,0];
var G=26,S=null;

function boxOk(map,x,y){
  if(x<0||y<0||x>24||y>24)return 0;
  var t=map[y][x];if(t!==0&&t!==4)return 0;
  t=map[y][x+1];if(t!==0&&t!==4)return 0;
  t=map[y+1][x];if(t!==0&&t!==4)return 0;
  t=map[y+1][x+1];if(t!==0&&t!==4)return 0;
  return 1;
}
function ov(x,y,o){return x<o.x+2&&x+2>o.x&&y<o.y+2&&y+2>o.y;}
function inBox(cx,cy,b){return cx>=b.x&&cx<=b.x+1&&cy>=b.y&&cy<=b.y+1;}
function cheb(ax,ay,bx,by){var a=ax-bx,b=ay-by;if(a<0)a=-a;if(b<0)b=-b;return a>b?a:b;}
function zoneAt(t){var m=t<200?0:2+((t-200)/50|0);if(m>9)m=9;return{min:m,max:25-m};}
function inZone(x,y,z){return x>=z.min&&y>=z.min&&x+1<=z.max&&y+1<=z.max;}
function mkGrid(v){var g=[],y;for(y=0;y<G;y++)g.push(new Array(G).fill(v));return g;}
function boxHit(g,x,y){return x>=0&&y>=0&&x<25&&y<25&&(g[y][x]||g[y][x+1]||g[y+1][x]||g[y+1][x+1]);}
function grassAt(map,x,y){
  if(x<0||y<0||x>24||y>24)return 0;
  return map[y][x]===4||map[y][x+1]===4||map[y+1][x]===4||map[y+1][x+1]===4;
}
function goOk(S,map,e,x,y,d){
  var nx=x+DX[d],ny=y+DY[d];
  if(!boxOk(map,nx,ny))return 0;
  for(var id in S.en){var o=S.en[id];if(o!==e&&o.on&&o.x>-5&&S.tick-o.seen<4&&ov(nx,ny,o))return 0;}
  return 1;
}
// 敌车 steps 拍后的位置（mode:-1 停，'c' 沿当前方向）
function stepPos(S,map,e,steps,mode){
  var x=e.x,y=e.y,s,d,nx,ny,bl,o;
  for(s=0;s<steps;s++){
    d=mode==='c'?e.dir:mode;
    if(d<0)break;
    nx=x+DX[d];ny=y+DY[d];
    if(!boxOk(map,nx,ny))break;
    bl=0;
    for(var id in S.en){o=S.en[id];if(o!==e&&o.on&&o.x>-5&&S.tick-o.seen<4&&ov(nx,ny,o)){bl=1;break;}}
    if(bl)break;
    x=nx;y=ny;
  }
  return{x:x,y:y};
}
function mobOf(e){return e.sees>2?e.moved/e.sees:0.5;}
// 标记一颗子弹本拍/下拍覆盖格（在敌车当前箱体处截断）
function markBullet(S,map,now,next,b){
  var x=b.x,y=b.y,d=b.dir,i,t,id,o;
  now[y][x]=1;
  for(i=0;i<3;i++){
    x+=DX[d];y+=DY[d];
    if(x<0||y<0||x>25||y>25)return;
    now[y][x]=1;t=map[y][x];
    if(t===1||t===2)return;
    for(id in S.en){o=S.en[id];if(o.on&&o.x>-5&&S.tick-o.seen<4&&inBox(x,y,o))return;}
  }
  for(i=0;i<3;i++){
    x+=DX[d];y+=DY[d];
    if(x<0||y<0||x>25||y>25)return;
    next[y][x]=1;t=map[y][x];
    if(t===1||t===2)return;
    for(id in S.en){o=S.en[id];if(o.on&&o.x>-5&&S.tick-o.seen<4&&inBox(x,y,o))return;}
  }
}
// 弹线格子（含炮口）直到 reach 格或墙
function laneCells(map,e,d,reach){
  var x=e.x+MZX[d],y=e.y+MZY[d],out=[[x,y]],i,t;
  for(i=0;i<reach;i++){
    x+=DX[d];y+=DY[d];
    if(x<0||y<0||x>25||y>25)break;
    out.push([x,y]);t=map[y][x];
    if(t===1||t===2)break;
  }
  return out;
}
function laneHits(lane,x,y){
  for(var i=0;i<lane.length;i++){var c=lane[i];if(c[0]>=x&&c[0]<=x+1&&c[1]>=y&&c[1]<=y+1)return i+1;}
  return 0;
}
// 陷线检测：我在 e 当前弹线内、且能脱离该线的走位方向<2 → e 一拍开火即无处可躲
function laneTrapped(S,map,e,x,y){
  var ln=laneCells(map,e,e.dir,6);
  if(!laneHits(ln,x,y))return 0;
  var esc=0,d,nx,ny;
  for(d=0;d<4;d++){
    nx=x+DX[d];ny=y+DY[d];
    if(boxOk(map,nx,ny)&&!laneHits(ln,nx,ny))esc++;
  }
  return esc<2;
}
// 射击仿真：dir 开火，返回最早命中 {sc,victim,k,conf}
function shotDir(S,st,dir){
  var me=st.self,map=st.map,now=st.tick;
  var x=me.x+MZX[dir],y=me.y+MZY[dir],k,i,cx,cy,t,id,e,pr,hit,inv,hurt,val,conf,sc;
  var best=null;
  for(k=0;k<=2;k++){
    var cells=[[x,y]],nx=x,ny=y,dead=0;
    for(i=0;i<3;i++){
      nx+=DX[dir];ny+=DY[dir];
      if(nx<0||ny<0||nx>25||ny>25){dead=1;break;}
      cells.push([nx,ny]);t=map[ny][nx];
      if(t===1||t===2){dead=1;break;}
    }
    var stop=0;
    for(var c=0;c<cells.length&&!stop;c++){
      cx=cells[c][0];cy=cells[c][1];
      for(id in S.en){
        e=S.en[id];
        if(!e.on||e.x<-4||now-e.seen>4)continue;
        hit=0;
        pr=stepPos(S,map,e,k+1,'c');
        if(inBox(cx,cy,pr))hit=1;
        else{pr=stepPos(S,map,e,k+1,-1);if(inBox(cx,cy,pr))hit=2;}
        if(!hit)continue;
        inv=e.inv-k;hurt=e.hurt-(k+1);
        if(inv>0)continue;
        stop=1;
        if(hurt>0)break;
        val=e.hp===1?3:1;
        conf=shotConf(S,st,e,k,dir,hit);
        sc=val*conf;
        if(!best||sc>best.sc)best={sc:sc,victim:id,k:k,conf:conf,val:val};
        break;
      }
    }
    if(dead||stop)break;
    x=nx;y=ny;
  }
  return best;
}
function shotConf(S,st,e,k,dir,how){
  var conf=k===0?0.66:k===1?0.52:0.4;
  var vert=dir===0||dir===2,evert=e.dir===0||e.dir===2;
  if(vert===evert)conf+=0.15;else conf-=0.1;
  var p=stepPos(S,st.map,e,k+1,'c');
  var esc=vert?[1,3]:[0,2];
  if(!goOk(S,st.map,e,p.x,p.y,esc[0])&&!goOk(S,st.map,e,p.x,p.y,esc[1]))conf+=0.25;
  conf+=(0.55-mobOf(e))*0.22;
  if(how===2)conf-=0.06;
  var age=st.tick-e.seen;
  if(age>0)conf-=0.12*age;
  if(conf>1)conf=1;if(conf<0.03)conf=0.03;
  return conf;
}
// 子弹飞行寿命估计（用在场弹数统计）
function shotLife(S,map,x,y,dir){
  var k,i,nx=x,ny=y,t,id,o;
  for(k=0;k<=3;k++){
    for(i=0;i<3;i++){
      nx+=DX[dir];ny+=DY[dir];
      if(nx<0||ny<0||nx>25||ny>25)return k;
      t=map[ny][nx];if(t===1||t===2)return k;
      for(id in S.en){o=S.en[id];if(o.on&&o.x>-5&&S.tick-o.seen<4&&inBox(nx,ny,o))return k;}
    }
  }
  return 4;
}
function bfs(map,goals){
  var d=mkGrid(9999),q=[],i,x,y,nx,ny,k;
  for(i=0;i<goals.length;i++){x=goals[i][0];y=goals[i][1];
    if(x<0||y<0||x>24||y>24)continue;
    if(d[y][x]!==0){d[y][x]=0;q.push(x,y);}}
  var h=0;
  while(h<q.length){
    x=q[h];y=q[h+1];h+=2;
    for(k=0;k<4;k++){
      nx=x+DX[k];ny=y+DY[k];
      if(nx<0||ny<0||nx>24||ny>24||d[ny][nx]<9999||!boxOk(map,nx,ny))continue;
      d[ny][nx]=d[y][x]+1;q.push(nx,ny);
    }
  }
  return d;
}
// 攻击位：我能打到 e 的行列带格，fd=需要的开火朝向；避开 e 当前弹线
function attackCells(S,st,e,z){
  var map=st.map,out=[],dd,i,x,y;
  for(dd=3;dd<=7;dd++){
    var offs=[[e.x,e.y-dd,2],[e.x+1,e.y-dd,2],[e.x,e.y+1+dd,0],[e.x+1,e.y+1+dd,0],
              [e.x-dd,e.y,1],[e.x-dd,e.y+1,1],[e.x+1+dd,e.y,3],[e.x+1+dd,e.y+1,3]];
    for(i=0;i<offs.length;i++){
      x=offs[i][0];y=offs[i][1];
      if(!boxOk(map,x,y)||!inZone(x,y,z))continue;
      out.push({x:x,y:y,dd:dd,fd:offs[i][2]});
    }
  }
  return out;
}
function decide(st){
  try{
    var me=st.self,now=st.tick,map=st.map;
    if(!S)S={en:{},shots:[],prevB:[],lastTick:-1,lastPos:null,lastMv:'stay',stuck:0};
    if(S.lastTick>=0&&now>S.lastTick+1){S.shots=[];S.stuck=0;S.prevB=[];}
    S.lastTick=now;S.tick=now;
    // ---- 对手记忆 ----
    var sc={},i,j,r,e,id;
    for(i=0;i<st.scoreboard.length;i++){r=st.scoreboard[i];sc[r.id]=r;}
    for(i=0;i<st.opponents.length;i++){
      var o=st.opponents[i];e=S.en[o.id];
      if(!e)e=S.en[o.id]={id:o.id,x:-9,y:-9,dir:0,hp:2,inv:0,hurt:0,rapid:0,seen:-99,moved:0,sees:0,cdUntil:0,pts:0,kills:0,lives:3,status:'active',resp:0,deaths:0,on:0};
      r=sc[o.id]||o;
      e.lives=r.lives;e.status=r.status;e.resp=r.respawnTicks;e.pts=r.points;e.kills=r.kills;e.deaths=r.deaths;
      e.on=(e.lives>0&&e.status==='active'&&e.resp===0)?1:0;
    }
    for(i=0;i<st.radar.tanks.length;i++){
      var rt=st.radar.tanks[i];e=S.en[rt.id];if(!e)continue;
      if(e.x>-5&&(e.x!==rt.x||e.y!==rt.y))e.moved++;
      e.x=rt.x;e.y=rt.y;e.dir=rt.dir;e.hp=rt.hp;e.inv=rt.invincibleTicks;e.hurt=rt.hurtTicks;e.rapid=rt.rapidTicks;
      e.sees++;e.seen=now;e.on=1;
    }
    // ---- 弹主归属：新出现子弹反推射手，估计冷却窗口 ----
    var curB=st.radar.bullets;
    for(i=0;i<curB.length;i++){
      var b=curB[i],cont=0;
      for(j=0;j<S.prevB.length;j++){var pb=S.prevB[j];
        if(pb.d===b.dir&&b.x===pb.x+3*DX[b.dir]&&b.y===pb.y+3*DY[b.dir]){cont=1;break;}}
      if(cont)continue;
      var sx=b.x-3*DX[b.dir],sy=b.y-3*DY[b.dir]; // 假定上拍发射的出生点
      var tx=sx-MZX[b.dir],ty=sy-MZY[b.dir];     // 反推射手车体左上角
      var bid=null,bd=3;
      for(id in S.en){e=S.en[id];if(!e.on&&e.x<-4)continue;
        var dch=cheb(tx,ty,e.x,e.y);
        if(dch<bd){bd=dch;bid=id;}}
      if(bid!==null&&bd<=1)S.en[bid].cdUntil=now-1+(S.en[bid].rapid>0?4:6);
    }
    S.prevB=curB.map(function(bb){return{x:bb.x,y:bb.y,d:bb.dir};});
    // ---- 我的在场弹 ----
    var live=0;
    for(i=0;i<S.shots.length;i++)if(S.shots[i]>now)live++;
    if(S.shots.length>6)S.shots=S.shots.slice(-6);
    // ---- 在场对手 ----
    var foes=[];
    for(id in S.en){e=S.en[id];if(e.on&&e.x>-5&&now-e.seen<=5)foes.push(e);}
    // ---- 子弹致命格 & 敌车即时弹线（数值化代价） ----
    var dn=mkGrid(0),dn2=mkGrid(0);
    for(i=0;i<curB.length;i++)markBullet(S,map,dn,dn2,curB[i]);
    var lc=mkGrid(0),cell,j;
    function lcBox(x,y){
      var m=0;
      if(x>=0&&y>=0&&x<25&&y<25)m=Math.max(lc[y][x],lc[y][x+1],lc[y+1][x],lc[y+1][x+1]);
      return m;
    }
    function buildLc(tgt){
      for(i=0;i<foes.length;i++){
        e=foes[i];
        if(now-e.seen>3)continue;
        var gap=e.cdUntil-now; // <=0 即可开火
        var w1,w2,a1,a2;
        if(gap<=0){w1=900;w2=140;a1=260;a2=90;}
        else if(gap<=2){w1=600;w2=110;a1=170;a2=60;}
        else{w1=350;w2=80;a1=110;a2=40;}
        if(e===tgt){a1=a1*0.35|0;a2=a2*0.35|0;} // 攻击目标的转向线打折，否则永远无法接近
        for(var d2=0;d2<4;d2++){
          var lane=laneCells(map,e,d2,6);
          for(j=1;j<lane.length;j++){
            cell=lane[j];
            var w;
            if(d2===e.dir)w=j<=3?w1:w2;
            else w=j<=2?a1:j<=5?a2:25;
            if(w>lc[cell[1]][cell[0]])lc[cell[1]][cell[0]]=w;
          }
        }
      }
    }
    // ---- 开火决定 ----
    var fire=false,bestShot=null,bestDir=-1;
    if(me.fireCooldown===0&&live<2){
      for(var d=0;d<4;d++){
        var sh=shotDir(S,st,d);
        if(sh&&(!bestShot||sh.sc>bestShot.sc)){bestShot=sh;bestDir=d;}
      }
      if(bestShot&&bestDir===me.dir&&bestShot.sc>=0.4)fire=true;
    }
    if(me.invincibleTicks>0&&fire&&(!bestShot||bestShot.sc<1.2))fire=false;
    var prot=(me.hurtTicks>=2)||(me.invincibleTicks>0&&!fire);
    var protNext=(me.hurtTicks>=3)||(me.invincibleTicks>1&&!fire);
    var lcScale=prot?0.35:1;
    // ---- 致命兜底：无处可躲时迎面对撞弹拦截 ----
    var meInDn=!prot&&boxHit(dn,me.x,me.y);
    // ---- 态势 ----
    var z=zoneAt(now),zn=zoneAt(now+15);
    var outNow=!inZone(me.x,me.y,z);
    var pressure=0,nearCnt=0,aimedAtMe=0,visCnt=0;
    for(i=0;i<foes.length;i++){
      e=foes[i];
      var cd=cheb(me.x,me.y,e.x,e.y);
      if(now-e.seen<=2)visCnt++;
      if(cd<=8){
        nearCnt++;
        var ln=laneCells(map,e,e.dir,6),hd=laneHits(ln,me.x,me.y);
        if(hd){pressure+=e.hp;if(hd<=4&&e.cdUntil<=now+1)aimedAtMe++;}
      }
    }
    var myPts=0,bestOppPts=0,bestOppLives=0,myKills=0;
    for(i=0;i<st.scoreboard.length;i++){r=st.scoreboard[i];
      if(r.id===me.id){myPts=r.points;myKills=r.kills;}
      else{if(r.points>bestOppPts)bestOppPts=r.points;if(r.lives>bestOppLives)bestOppLives=r.lives;}
    }
    var lead=(me.lives>bestOppLives)||(me.lives===bestOppLives&&myPts>bestOppPts);
    var sup=st.arena.supply,wantSup=0;
    if(sup&&(sup.available||sup.appearTick-now<=12)){
      if(sup.type==='rapid'||me.hp<me.maxHp){
        var eD=99;
        for(i=0;i<foes.length;i++){var ed=cheb(foes[i].x,foes[i].y,sup.x,sup.y);if(ed<eD)eD=ed;}
        if(cheb(me.x,me.y,sup.x,sup.y)<=eD+2&&sup.expireTick-now>5)wantSup=1;
      }
    }
    // ---- 模式 ----
    var mode='patrol',goals=[],target=null;
    if(outNow)mode='zone';
    else if(me.hp===1&&(pressure>=2||aimedAtMe>=1||(nearCnt>=2&&visCnt>=2)))mode='retreat';
    else if(S.mode==='retreat'&&me.hp===1&&(pressure>=1||nearCnt>=1))mode='retreat';
    else if(wantSup&&aimedAtMe===0)mode='supply';
    else{
      var bt=null,bs=-1;
      for(i=0;i<foes.length;i++){
        e=foes[i];var age=now-e.seen;
        var v=(3-e.hp)*1.5+(14-cheb(me.x,me.y,e.x,e.y))*0.3-(e.inv>0?1.2:0)-age*0.8+e.kills*0.2;
        var el=laneCells(map,e,e.dir,6),hd2=laneHits(el,me.x,me.y);
        if(hd2&&hd2<=4&&e.cdUntil<=now)v-=2.5; // 已被瞄准，危险目标
        if(e.cdUntil>now)v+=1.2;              // 冷却窗口内的目标更安全
        if(v>bs){bs=v;bt=e;}
      }
      if(bt&&bs>0){target=bt;mode='engage';}
      else if(foes.length>0){
        var ne=foes[0];for(i=1;i<foes.length;i++)if(now-foes[i].seen<now-ne.seen)ne=foes[i];
        if(now-ne.seen<8){target=ne;mode='hunt';}
      }
    }
    if(now>430&&lead&&mode!=='zone'&&me.hp>1&&!(target&&target.hp===1))mode='hold';
    S.mode=mode;
    buildLc(mode==='engage'||mode==='hunt'?target:null);
    // ---- 目标格 ----
    var xx,yy;
    if(mode==='zone'){
      var zb=zn.min<z.min?zn:z;
      for(yy=zb.min;yy<=zb.max-1;yy++)for(xx=zb.min;xx<=zb.max-1;xx++)if(boxOk(map,xx,yy))goals.push([xx,yy]);
      if(!goals.length)goals.push([12,12]);
    }else if(mode==='supply'){
      goals=[[sup.x,sup.y],[sup.x-1,sup.y],[sup.x+1,sup.y],[sup.x,sup.y-1],[sup.x,sup.y+1]];
    }else if(mode==='engage'||mode==='hunt'){
      var cells=attackCells(S,st,target,z),bc=null,bcv=1e9;
      var tLane=laneCells(map,target,target.dir,6);
      var tCdGap=target.cdUntil-now;
      for(i=0;i<cells.length;i++){
        var cc=cells[i];
        var cv=cheb(me.x,me.y,cc.x,cc.y)*2+Math.abs(cc.dd-5)*1.5;
        var inT=laneHits(tLane,cc.x,cc.y);
        if(inT){
          if(tCdGap<=0&&inT<=3)continue;    // 已就绪敌车的即中弹线：不选
          if(tCdGap<=1&&laneTrapped(S,map,target,cc.x,cc.y))continue; // 陷线攻击位不选
          cv+=inT<=3?(tCdGap<=2?70:35):15;  // 冷却窗口也尽量少停
        }
        for(var oi=0;oi<foes.length;oi++){var of=foes[oi];if(of!==target){
          var l2=laneCells(map,of,of.dir,6);if(laneHits(l2,cc.x,cc.y))cv+=15;
        }}
        // 侧翼偏好：从目标背后射击最安全（fd==其朝向），正面弹线位避开
        if(cc.fd===target.dir)cv-=4;
        else if(cc.fd===OPP[target.dir])cv+=8;
        if(cv<bcv){bcv=cv;bc=cc;}
      }
      if(bc)goals=[[bc.x,bc.y]];else goals=[[target.x,target.y]];
    }else if(mode==='retreat'||mode==='hold'){
      var bx=me.x,by=me.y,bv=-1e9;
      for(var ry=-6;ry<=6;ry++)for(var rx=-6;rx<=6;rx++){
        var px=me.x+rx,py=me.y+ry;
        if(!boxOk(map,px,py)||!inZone(px,py,z))continue;
        if(!prot&&lcBox(px,py)>=600)continue;
        if(px<=1||px>=23||py<=1||py>=23)continue; // 不逃进贴边死角
        var trp=0;
        for(i=0;i<foes.length;i++){e=foes[i];
          if(now-e.seen<=3&&e.cdUntil<=now+1&&cheb(px,py,e.x,e.y)<=7&&laneTrapped(S,map,e,px,py)){trp=1;break;}}
        if(trp)continue;
        var pv=0;
        for(i=0;i<foes.length;i++){e=foes[i];
          pv+=Math.min(cheb(px,py,e.x,e.y),9)*1.4;
          if(Math.abs(px-e.x)>1&&Math.abs(py-e.y)>1)pv+=6; // 斜向：脱离其全部行列带
        }
        pv-=lcBox(px,py)*0.2;
        if(grassAt(map,px,py))pv+=4;
        pv-=Math.abs(rx)+Math.abs(ry);
        if(pv>bv){bv=pv;bx=px;by=py;}
      }
      goals=[[bx,by]];
    }else{
      var spots=[[12,12],[8,12],[12,8],[16,12],[12,16],[12,11],[11,12]];
      var bsp=null,bsv=1e9;
      for(i=0;i<spots.length;i++){var sxp=spots[i];
        if(!boxOk(map,sxp[0],sxp[1])||!inZone(sxp[0],sxp[1],z))continue;
        var sv=cheb(me.x,me.y,sxp[0],sxp[1]);
        if(sv<bsv){bsv=sv;bsp=sxp;}
      }
      if(bsp)goals=[bsp];else goals=[[12,12]];
    }
    var field=bfs(map,goals);
    // ---- 动作候选 ----
    var cands=[{m:'stay',d:me.dir,x:me.x,y:me.y,free:1}];
    for(var k2=0;k2<4;k2++){
      var nx2=me.x+DX[k2],ny2=me.y+DY[k2],ok=boxOk(map,nx2,ny2),bl2=0;
      if(ok)for(i=0;i<foes.length;i++)if(ov(nx2,ny2,foes[i])){bl2=1;break;}
      if(ok&&!bl2)cands.push({m:MV[k2],d:k2,x:nx2,y:ny2,free:1});
      else cands.push({m:MV[k2],d:k2,x:me.x,y:me.y,free:0});
    }
    var aimDir=-1;
    if(bestShot&&bestDir!==me.dir&&bestShot.sc>=0.55&&me.fireCooldown===0&&live<2)aimDir=bestDir;
    // 撤退/持守时面向威胁来向：追兵进线即可对撞或还击
    if(aimDir<0&&(mode==='retreat'||mode==='hold')){
      var nf=null,nfd=9;
      for(i=0;i<foes.length;i++){e=foes[i];var cd3=cheb(me.x,me.y,e.x,e.y);if(cd3<nfd){nfd=cd3;nf=e;}}
      if(nf&&nfd<=6){
        var lnf=laneCells(map,nf,nf.dir,6);
        if(laneHits(lnf,me.x,me.y)||nfd<=4){
          for(var dd3=0;dd3<4;dd3++){
            var laneMe=laneCells(map,me,dd3,7);
            var pr3=stepPos(S,map,nf,1,'c');
            if(laneHits(laneMe,pr3.x,pr3.y)||laneHits(laneMe,nf.x,nf.y)){aimDir=dd3;break;}
          }
        }
      }
    }
    // ---- 评分 ----
    var rnd=st.random>>>3,bestC=null,bestV=1e18;
    for(i=0;i<cands.length;i++){
      var c2=cands[i],v=0;
      if(!protNext){
        if(boxHit(dn,c2.x,c2.y))v+=1e6;
        if(boxHit(dn2,c2.x,c2.y))v+=160;
      }
      var outC=!inZone(c2.x,c2.y,z);
      v+=lcBox(c2.x,c2.y)*lcScale*(outC?0.15:1); // 圈外时软弹线退居次席
      if(outC)v+=1e5;
      else if(!inZone(c2.x,c2.y,zn))v+=70;
      var dg=field[c2.y][c2.x];
      if(dg>=9999)v+=400+cheb(c2.x,c2.y,goals[0][0],goals[0][1])*3;
      else v+=dg*(outC?30:4); // 圈外时回圈梯度主导
      var adj=0,exits=0;
      for(var f=0;f<foes.length;f++)if(cheb(c2.x,c2.y,foes[f].x,foes[f].y)<=2)adj++;
      for(var ed2=0;ed2<4;ed2++)if(boxOk(map,c2.x+DX[ed2],c2.y+DY[ed2]))exits++;
      v+=adj*18+(exits<2?25:0);
      if(!prot)for(f=0;f<foes.length;f++){e=foes[f]; // f 已由上方 var 声明
        if(now-e.seen>3||e.cdUntil>now+1)continue;
        if(cheb(c2.x,c2.y,e.x,e.y)<=7&&laneTrapped(S,map,e,c2.x,c2.y))v+=e.cdUntil<=now?700:350;
      }
      if(c2.d===aimDir)v-=14;
      if(fire&&c2.d===me.dir)v-=4;
      if(mode==='retreat'&&grassAt(map,c2.x,c2.y))v-=6;
      if(!c2.free&&c2.m===S.lastMv)v+=30;
      v+=(rnd&3);rnd>>>=2;
      if(v<bestV){bestV=v;bestC=c2;}
    }
    var mv=bestC.m;
    if(aimDir>=0&&bestV<1e6&&mv!==MV[aimDir]){
      var ac=cands[aimDir+1];
      var acBad=prot?0:(boxHit(dn,ac.x,ac.y)||lcBox(ac.x,ac.y)>=600);
      if(!acBad)mv=MV[aimDir];
    }
    // 被困在就绪弹线里无处可逃：尽量转向对手回敬（对撞或换命）
    if(bestV>=5e4&&!fire&&me.fireCooldown===0&&live<2&&!prot){
      for(i=0;i<foes.length;i++){e=foes[i];
        var ln2=laneCells(map,e,e.dir,6);
        if(laneHits(ln2,me.x,me.y)&&e.cdUntil<=now&&bestShot&&bestShot.victim===e.id&&bestDir!==me.dir){
          mv=MV[bestDir];break;
        }
      }
    }
    // ---- 对撞弹拦截：本拍必中的同线对头弹且走位危险时，迎线开火互消 ----
    if(!fire&&me.fireCooldown===0&&live<2&&!prot&&boxHit(dn,me.x,me.y)&&bestV>=5e4){
      var mx2=me.x+MZX[me.dir],my2=me.y+MZY[me.dir];
      for(i=0;i<curB.length;i++){
        var bb=curB[i];
        if(bb.dir!==OPP[me.dir])continue;
        var aligned=(me.dir===0||me.dir===2)?(bb.x===mx2):(bb.y===my2);
        if(!aligned)continue;
        var coming=(bb.dir===2&&bb.y<me.y)||(bb.dir===0&&bb.y>me.y)||(bb.dir===1&&bb.x<me.x)||(bb.dir===3&&bb.x>me.x);
        if(coming){fire=true;break;}
      }
    }
    if(fire){
      var mx=me.x+MZX[me.dir],my=me.y+MZY[me.dir];
      S.shots.push(now+shotLife(S,map,mx,my,me.dir)+1);
    }
    if(S.lastPos&&S.lastMv!=='stay'&&me.x===S.lastPos[0]&&me.y===S.lastPos[1])S.stuck++;else S.stuck=0;
    S.lastPos=[me.x,me.y];S.lastMv=mv;
    var intent=mode==='zone'||mode==='retreat'?'retreat':mode==='supply'?'resupply':mode==='engage'?'pursue':mode==='hold'?'hold':mode==='hunt'?'flank':'advance';
    if((meInDn||lcBox(me.x,me.y)>=600)&&!prot)intent='defend';
    return{move:mv,fire:fire,intent:intent};
  }catch(err){
    return{move:'stay',fire:false,intent:'hold'};
  }
}
