// 巡衡：动态威胁防守、带兵力损耗的行军搜索与城市经济。
let S = null;
function setup(v) {
  const n=v.h*v.w, adj=new Int32Array(n*4).fill(-1);
  for(let i=0;i<n;i++) {const r=(i/v.w)|0,c=i%v.w;
    if(r)adj[i*4]=i-v.w;if(r+1<v.h)adj[i*4+1]=i+v.w;
    if(c)adj[i*4+2]=i-1;if(c+1<v.w)adj[i*4+3]=i+1;
  }
  S={h:v.h,w:v.w,p:v.player,players:v.players,turn:-1,adj,
    terrain:new Int8Array(n),owner:new Int32Array(n).fill(-3),army:new Float64Array(n),
    seen:new Int32Array(n).fill(-10000),walk:new Int32Array(n).fill(-10000),
    generals:new Map(),g:-1,edges:[],objective:-1};
}
function update(v) {
  if(!S||S.h!==v.h||S.w!==v.w||S.p!==v.player||S.players!==v.players||v.turn<=S.turn)setup(v);
  S.turn=v.turn;
  for(let i=0;i<v.h*v.w;i++)if(v.visible[i]||v.owned[i]) {
    S.terrain[i]=v.mountains[i]?-1:v.castles[i]?2:1;
    S.owner[i]=v.owners[i];S.army[i]=v.armies[i];S.seen[i]=v.turn;
    if(v.generals[i]) {if(v.owned[i])S.g=i;else if(v.opponent[i])S.generals.set(v.owners[i],i);}
  }
  for(const [p,g] of S.generals)if(v.visible[g]&&(!v.generals[g]||v.owners[g]!==p))S.generals.delete(p);
  S.edges=S.edges.filter(e=>e.tick>=v.turn-10);
}
function blocked(i,v) {return i<0||S.terrain[i]===-1||v.mountains[i]||(v.structures_in_fog[i]&&S.terrain[i]!==2);}
function action(s,t,half,v) {
  let d=-1;for(let k=0;k<4;k++)if(S.adj[s*4+k]===t)d=k;
  if(d<0)return null;
  S.edges.push({s,t,tick:v.turn});S.walk[t]=v.turn;
  return [(s/v.w)|0,s%v.w,d,!!half];
}
function bfs(start,v,ownOnly,limit) {
  const n=v.h*v.w,d=new Int32Array(n).fill(-1),first=new Int32Array(n).fill(-1),q=new Int32Array(n);
  let a=0,b=0;d[start]=0;q[b++]=start;
  while(a<b){const x=q[a++];if(d[x]>=limit)continue;
    for(let k=0;k<4;k++){const y=S.adj[x*4+k];if(blocked(y,v)||d[y]>=0||(ownOnly&&!v.owned[y]))continue;
      d[y]=d[x]+1;first[y]=x===start?y:first[x];q[b++]=y;
    }
  }return {d,first};
}
function defense(i,v) {
  if(v.owned[i])return 0;
  if(v.visible[i])return v.armies[i];
  if(S.terrain[i]===2)return S.army[i]+Math.max(0,v.turn-S.seen[i])*.5;
  if(S.owner[i]>=0&&S.owner[i]!==v.player)return Math.min(18,S.army[i]+(v.turn-S.seen[i])/50);
  return 0;
}
// Positive edge weights keep the search bounded; force prediction includes gathered friendly troops.
function routes(src,force,v) {
  const n=v.h*v.w,cost=new Float64Array(n).fill(1e30),steps=new Int32Array(n),first=new Int32Array(n).fill(-1),
    left=new Float64Array(n),damage=new Float64Array(n),heap=[],keys=[];
  function push(x,k){let i=heap.length;heap.push(x);keys.push(k);while(i){let p=(i-1)>>1;if(keys[p]<=k)break;heap[i]=heap[p];keys[i]=keys[p];i=p;}heap[i]=x;keys[i]=k;}
  function pop(){const x=heap[0],k=keys[0],z=heap.pop(),zkey=keys.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&keys[j+1]<keys[j])j++;if(keys[j]>=zkey)break;heap[i]=heap[j];keys[i]=keys[j];i=j;}heap[i]=z;keys[i]=zkey;}return [x,k];}
  cost[src]=0;left[src]=force;push(src,0);let count=0,maxNodes=n>4096?2600:n;
  while(heap.length&&count++<maxNodes){const [x,key]=pop();if(key>cost[x]+1e-7)continue;
    if(steps[x]>=Math.min(70,v.h+v.w))continue;
    for(let k=0;k<4;k++){const y=S.adj[x*4+k];if(blocked(y,v))continue;
      const own=v.owned[y],def=defense(y,v),next=left[x]-(own?0:def)-1+(own?Math.max(0,v.armies[y]-1):0);
      if(!own&&next<1)continue;
      const c=key+1+def*.16+(v.opponent[y]?.18:0);
      if(c+1e-7>=cost[y])continue;
      cost[y]=c;steps[y]=steps[x]+1;first[y]=x===src?y:first[x];left[y]=next;damage[y]=damage[x]+def;push(y,c);
    }
  }return {cost,steps,first,left,damage};
}
function act(v) {
  update(v);if(v.mode&&v.mode!=='ffa')return null;
  const n=v.h*v.w,A=v.armies,owned=[],sources=[],enemies=[],front=[],targets=[],isGen=new Uint8Array(n),
    reveal=new Uint8Array(n),remain=Math.max(0,(v.maxTurns||5000)-v.turn),g=S.g;
  for(const x of S.generals.values())isGen[x]=1;
  for(let i=0;i<n;i++) {
    if(v.owned[i]){owned.push(i);if(A[i]>1)sources.push(i);}
    if(v.opponent[i])enemies.push(i);
    if(!v.owned[i]&&!blocked(i,v)) {
      if(v.visible[i]||v.fog[i]||S.terrain[i]===2||isGen[i])targets.push(i);
      const r=(i/v.w)|0,c=i%v.w;
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){let rr=r+dr,cc=c+dc;if(rr>=0&&rr<v.h&&cc>=0&&cc<v.w&&S.seen[rr*v.w+cc]<0)reveal[i]++;}
    }
  }
  if(!sources.length)return null;
  // Exact adjacent decapitation comes before speculative planning.
  for(const s of sources)for(let d=0;d<4;d++){const t=S.adj[s*4+d];if(t>=0&&v.opponent[t]&&v.generals[t]&&A[s]-1>A[t])return action(s,t,false,v);}
  let reserve=1,home=null,danger=null;
  if(g>=0&&v.owned[g]) {
    home=bfs(g,v,false,9);
    for(const e of enemies){const d=home.d[e];if(d>0&&d<=7){const power=A[e]-d+2;if(power>reserve)reserve=power;
      if(power>A[g]&&(!danger||d<danger.d||(d===danger.d&&power>danger.power)))danger={e,d,power};}}
    if(danger&&danger.d<=5) {
      // Prefer interception from a side stack, then timely reinforcement over unrelated growth.
      let best=null,bestScore=-1e30;
      for(const s of sources){for(let k=0;k<4;k++){const t=S.adj[s*4+k];if(t<0||!v.opponent[t]||home.d[t]<0||home.d[t]>danger.d)continue;
          if(A[s]-1>A[t]&&(s!==g||A[g]-A[t]-1>reserve-danger.power)){
            const score=1000-home.d[t]*30+A[t];if(score>bestScore){best={s,t};bestScore=score;}
          }}
      }
      if(best)return action(best.s,best.t,false,v);
      const hg=bfs(g,v,true,Math.min(12,danger.d+2));
      for(const s of sources)if(s!==g&&hg.d[s]>0&&hg.d[s]<=danger.d&&A[s]>2){
        const score=(A[s]-1)/(hg.d[s]+.5);if(score>bestScore){
          let t=-1;for(let k=0;k<4;k++){const z=S.adj[s*4+k];if(z>=0&&v.owned[z]&&hg.d[z]===hg.d[s]-1){t=z;break;}}
          if(t>=0){best={s,t};bestScore=score;}
        }
      }
      if(best)return action(best.s,best.t,false,v);
    }
  }
  reserve=Math.max(1,Math.ceil(reserve));
  for(const s of owned)for(let k=0;k<4;k++){const t=S.adj[s*4+k];if(t>=0&&!v.owned[t]&&!blocked(t,v)){front.push(s);break;}}
  sources.sort((a,b)=>A[b]-A[a]);
  const cap=n>4096?4:14,chosen=sources.slice(0,cap);
  // Keep cheap growth actions available without searching every tiny land garrison.
  for(const s of front)if(A[s]>1&&!chosen.includes(s)&&chosen.length<cap+6)chosen.push(s);
  let best=null,bestScore=-1e30;
  function offer(s,t,half,score,target) {
    if(t<0||blocked(t,v))return;
    const sent=half?Math.floor(A[s]/2):A[s]-1;
    if(!v.owned[t]&&sent<=defense(t,v))return;
    for(const e of S.edges)if(e.s===t&&e.t===s)score-=20*(1-(v.turn-e.tick)/12);
    if(score>bestScore){bestScore=score;best={s,t,half,target};}
  }
  const largeGoals=Array.from(S.generals.values());
  for(const s of chosen) {
    let half=false,force=A[s]-1;
    if(s===g&&reserve>1){if(Math.ceil(A[s]/2)<reserve)continue;half=true;force=Math.floor(A[s]/2);}
    if(force<1)continue;
    const path=routes(s,force,v);
    for(const t of targets) {
      const d=path.steps[t],first=path.first[t];if(first<0||d<1||d>remain)continue;
      const city=v.castles[t]||S.terrain[t]===2,gen=!!isGen[t],left=path.left[t];
      if(left<1)continue;
      let score;
      if(gen) {
        // A distant general can grow or receive reinforcements while the army marches.
        if(left<d*.6+2&&d>1)continue;
        score=1400/(d+1)+Math.min(30,left*.12);
        if(remain<=5)score*=2;
      } else if(city) {
        if(remain<Math.max(25,d+18))continue;
        if(left<3+d*.15)continue;
        score=100/(d+2)-path.damage[t]*.045;
        score*=Math.min(1,(remain-d)/110);
        if(v.opponent[t])score+=4/(d+1);
      } else {
        const fog=!v.visible[t],enemy=v.opponent[t]||(S.owner[t]>=0&&S.owner[t]!==v.player);
        let value=12+reveal[t]*1.6+(enemy?5:0)+(fog?2:0);
        if(v.turn-S.walk[t]<20)value-=8;
        score=value/(d+1)-path.damage[t]*.14;
        // Search farther into enemy territory to reveal its general rather than trade armies aimlessly.
        if(enemy&&reveal[t])score+=Math.min(2,force*.03);
        if(remain<15)score*=.35;
      }
      score+=Math.min(5,Math.sqrt(force)*.32)/(1+d*.10);
      if(t===S.objective)score+=.35;
      if(s===g&&reserve>1)score-=2;
      offer(s,first,half,score,t);
    }
  }
  // Supply moves use friendly roads and never bounce toward a previous donor.
  if(front.length&&remain>4) {
    const fd=new Int32Array(n).fill(-1),next=new Int32Array(n).fill(-1),q=new Int32Array(n);let head=0,tail=0;
    for(const f of front){fd[f]=0;q[tail++]=f;}
    while(head<tail){const x=q[head++];for(let k=0;k<4;k++){const y=S.adj[x*4+k];if(y<0||!v.owned[y]||fd[y]>=0)continue;fd[y]=fd[x]+1;next[y]=x;q[tail++]=y;}}
    for(const s of sources)if(fd[s]>0&&A[s]>=5){
      let half=s===g&&reserve>1;if(half&&Math.ceil(A[s]/2)<reserve)continue;
      const force=half?Math.floor(A[s]/2):A[s]-1;
      const score=5+Math.sqrt(force)*2.8/(1+fd[s]*.32);
      offer(s,next[s],half,score,-1);
    }
  }
  if(best){S.objective=best.target;return action(best.s,best.t,best.half,v);}
  return null;
}

