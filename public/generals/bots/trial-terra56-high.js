// 边境潮汐：只保留可由当前视野验证的地形和将军末次位置。
// 任一观察都可重建决策，因此 worker 冷启动和残局不会依赖开局步骤。
let mem = null;
const DR = [-1, 1, 0, 0], DC = [0, 0, -1, 1];

function reset(v) {
  const n = v.h * v.w;
  mem = { h:v.h, w:v.w, players:v.players, player:v.player, turn:-1,
    terrain:new Int8Array(n), enemyGeneral:new Int32Array(v.players).fill(-1), seenAt:new Int32Array(n).fill(-1) };
}
function neighbor(i,d,v){const r=(i/v.w)|0,c=i%v.w;if(d===0)return r?i-v.w:-1;if(d===1)return r+1<v.h?i+v.w:-1;if(d===2)return c?i-1:-1;return c+1<v.w?i+1:-1;}
function direction(a,b,w){if(b===a-w)return 0;if(b===a+w)return 1;if(b===a-1)return 2;if(b===a+1)return 3;return -1;}
function move(s,d,split,v){return [(s/v.w)|0,s%v.w,d,!!split];}

function update(v) {
  if(!mem||mem.h!==v.h||mem.w!==v.w||mem.players!==v.players||mem.player!==v.player||v.turn<=mem.turn)reset(v);
  mem.turn=v.turn;
  for(let i=0,n=v.h*v.w;i<n;i++)if(v.visible[i]){
    mem.seenAt[i]=v.turn;mem.terrain[i]=v.mountains[i]?-1:(v.castles[i]?2:1);
    if(v.generals[i]&&v.owners[i]>=0)mem.enemyGeneral[v.owners[i]]=i;
  }
  for(let p=0;p<v.players;p++){const g=mem.enemyGeneral[p];if(p!==v.player&&g>=0&&v.visible[g]&&(!v.generals[g]||v.owners[g]!==p))mem.enemyGeneral[p]=-1;}
}

// 路径只把已知山当绝对障碍；未确认的雾结构在首步由安全检查拦截。
function route(v,start,score){
  const n=v.h*v.w,q=new Int32Array(n),dist=new Int16Array(n),first=new Int32Array(n);dist.fill(-1);first.fill(-1);
  let head=0,tail=0,target=-1,best=-1e30;q[tail++]=start;dist[start]=0;
  const limit=Math.min(n,Math.max(28,(v.h+v.w)*3));
  while(head<tail){const x=q[head++],dd=dist[x];if(x!==start&&score[x]>-1e20){const value=score[x]-dd*3.4;if(value>best){best=value;target=x;}}if(dd>=limit)continue;for(let d=0;d<4;d++){const y=neighbor(x,d,v);if(y<0||dist[y]>=0||mem.terrain[y]<0||v.mountains[y])continue;dist[y]=dd+1;first[y]=x===start?y:first[x];q[tail++]=y;}}
  return target<0?null:{step:first[target],distance:dist[target],value:best};
}
function ownedRoute(v,start,target){
  const n=v.h*v.w,q=new Int32Array(n),parent=new Int32Array(n);parent.fill(-2);let head=0,tail=0;q[tail++]=start;parent[start]=-1;
  while(head<tail){const x=q[head++];if(x===target)break;for(let d=0;d<4;d++){const y=neighbor(x,d,v);if(y>=0&&parent[y]===-2&&v.owned[y]){parent[y]=x;q[tail++]=y;}}}
  if(parent[target]===-2)return -1;let x=target;while(parent[x]!==start){x=parent[x];if(x<0)return -1;}return direction(start,x,v.w);
}
function frontier(i,v){for(let d=0;d<4;d++){const j=neighbor(i,d,v);if(j>=0&&!v.owned[j]&&!v.mountains[j])return true;}return false;}

function act(v){
  update(v);const n=v.h*v.w,mine=[],sources=[],enemyGens=[];let general=-1;
  const remaining=Number.isInteger(v.maxTurns)?Math.max(0,v.maxTurns-v.turn):9999;
  for(let i=0;i<n;i++){if(v.owned[i]){mine.push(i);if(v.generals[i])general=i;if(v.armies[i]>1)sources.push(i);}if(v.opponent[i]&&v.generals[i])enemyGens.push(i);}
  if(!mine.length||!sources.length)return null;
  // 直接斩首是短残局唯一能够即时兑现的目标。
  for(const g of enemyGens)for(let d=0;d<4;d++){const s=neighbor(g,d,v);if(s>=0&&v.owned[s]&&v.armies[s]-1>v.armies[g])return move(s,direction(s,g,v.w),false,v);}
  // 相邻威胁先处理；当前观察本身足够触发，不依赖开局历史。
  if(general>=0){let attacker=-1,danger=0;for(let d=0;d<4;d++){const x=neighbor(general,d,v);if(x>=0&&v.opponent[x]&&v.armies[x]>danger){attacker=x;danger=v.armies[x];}}
    if(attacker>=0){if(v.armies[general]-1>danger)return move(general,direction(general,attacker,v.w),false,v);let donor=-1,strength=0,donorDir=-1;for(const s of sources){if(s===general)continue;const d=ownedRoute(v,s,general);if(d>=0&&v.armies[s]>strength){donor=s;strength=v.armies[s];donorDir=d;}}if(donor>=0)return move(donor,donorDir,false,v);}}
  const goals=new Float64Array(n);goals.fill(-1e30);
  for(let i=0;i<n;i++){if(v.opponent[i])goals[i]=v.generals[i]?15000:300+Math.min(120,v.armies[i]*2);else if(v.castles[i]&&!v.owned[i])goals[i]=230-Math.min(120,v.armies[i]);else if(v.neutral[i]&&!v.castles[i])goals[i]=55;else if(v.fog[i]&&!v.structures_in_fog[i])goals[i]=remaining<=4?3:34;}
  for(let p=0;p<v.players;p++){const g=mem.enemyGeneral[p];if(p!==v.player&&g>=0&&!v.owned[g]&&mem.terrain[g]>=0)goals[g]=Math.max(goals[g],remaining<30?8000:4800);}
  sources.sort((a,b)=>v.armies[b]-v.armies[a]);const selected=sources.slice(0,n>4096?8:18);for(const s of sources)if(selected.length<(n>4096?16:34)&&frontier(s,v))selected.push(s);
  let best=null;
  for(const s of selected){const army=v.armies[s],isGeneral=s===general,opening=isGeneral&&mine.length<4&&v.turn<46,reserve=opening?1:(isGeneral?Math.max(6,Math.min(38,7+Math.ceil(v.enemy_army/Math.max(1,v.players-1)*.11))):1);if(army<=reserve)continue;const path=route(v,s,goals);if(!path||path.step<0)continue;const d=direction(s,path.step,v.w),first=path.step;if(d<0||v.mountains[first])continue;const defense=v.visible[first]&&!v.owned[first]?v.armies[first]:0,hidden=v.structures_in_fog[first]&&mem.terrain[first]===0,available=army-1;if((hidden&&available<=52)||(!v.owned[first]&&available<=defense))continue;let split=false;if(isGeneral&&v.owned[first]&&Math.floor(army/2)>=reserve)split=true;const sent=split?Math.floor(army/2):available;if(sent<=defense||isGeneral&&army-sent<reserve)continue;let merit=path.value+Math.min(70,army)*1.7-(isGeneral?24:0);if(opening)merit+=45;if(!v.owned[first]&&v.generals[first])merit+=10000;if(remaining<=3&&!v.generals[first]&&goals[first]<1000)merit-=500;if(!best||merit>best.merit)best={s,d,split,merit};}
  if(best)return move(best.s,best.d,best.split,v);
  // 无目标时向最强前沿汇兵，避免后方兵力永久闲置。
  let anchor=-1;for(const s of mine)if(frontier(s,v)&&(anchor<0||v.armies[s]>v.armies[anchor]))anchor=s;if(anchor>=0)for(const s of sources){if(s===anchor||(s===general&&v.armies[s]<10))continue;const d=ownedRoute(v,s,anchor);if(d>=0)return move(s,d,false,v);}
  return null;
}
