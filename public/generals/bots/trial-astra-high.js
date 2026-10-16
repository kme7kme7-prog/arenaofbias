// 星渡：兵力预算路径规划与动态护将。
let memory;
function act(v) {
  if (v.mode && v.mode !== 'ffa') throw Error('Unsupported mode');
  if (v.rulesVersion && v.rulesVersion !== 'aob-generals-ffa-1.0.0') throw Error('Unsupported rules');
  const n=v.h*v.w;
  if (!memory || memory.w!==v.w || memory.h!==v.h || memory.player!==v.player || memory.players!==v.players || v.turn<=memory.turn) {
    const links=Array.from({length:n},(_,i)=>{const a=[];if(i>=v.w)a.push(i-v.w);if(i+v.w<n)a.push(i+v.w);if(i%v.w)a.push(i-1);if(i%v.w+1<v.w)a.push(i+1);return a;});
    memory={w:v.w,h:v.h,player:v.player,players:v.players,turn:-1,terrain:new Int8Array(n),owner:new Int32Array(n).fill(-3),seen:new Int32Array(n).fill(-10000),generals:new Map(),links,target:-1,edges:[],last:-1};
  }
  const m=memory,adj=m.links,remaining=Math.max(0,(v.maxTurns||5000)-v.turn),mine=[],enemies=[],sources=[];
  m.turn=v.turn;let home=-1;
  for(let i=0;i<n;i++) {
    if(v.visible[i]) {m.terrain[i]=v.mountains[i]?-1:v.castles[i]?2:1;m.owner[i]=v.owners[i];m.seen[i]=v.turn;}
    if(v.generals[i] && v.owners[i]>=0)m.generals.set(v.owners[i],i);
    if(v.owned[i]) {mine.push(i);if(v.generals[i])home=i;if(v.armies[i]>1)sources.push(i);}
    if(v.opponent[i])enemies.push(i);
  }
  for(const [p,g] of m.generals)if(v.visible[g]&&(!v.generals[g]||v.owners[g]!==p))m.generals.delete(p);
  if(home<0)home=m.generals.get(v.player)??-1;
  if(!mine.length)return null;
  const pass=i=>m.terrain[i]!==-1&&!v.mountains[i]&&!(v.structures_in_fog[i]&&m.terrain[i]===0);
  const emit=(s,t,half=false)=>{m.edges.push([s,t,v.turn]);if(m.edges.length>18)m.edges.shift();m.last=t;return [(s/v.w)|0,s%v.w,t===s-v.w?0:t===s+v.w?1:t===s-1?2:3,half];};
  for(const s of sources)for(const t of adj[s])if(v.opponent[t]&&v.generals[t]&&v.armies[s]-1>v.armies[t])return emit(s,t);
  function distances(start,onlyOwn=false){const d=new Int32Array(n).fill(-1),q=new Int32Array(n);let a=0,b=0;d[start]=0;q[b++]=start;while(a<b){const x=q[a++];for(const y of adj[x])if(d[y]<0&&pass(y)&&(!onlyOwn||v.owned[y])){d[y]=d[x]+1;q[b++]=y;}}return d;}
  const homeDist=home>=0?distances(home):null;
  let threat=-1,threatPower=0,threatTime=10000;
  if(home>=0)for(const e of enemies){const d=homeDist[e];if(d<1||d>6)continue;const power=v.armies[e]-d;let protection=v.armies[home]+d*.5;if(power>protection && (d<threatTime||d===threatTime&&power>threatPower)){threat=e;threatTime=d;threatPower=power;}}
  if(threat>=0){
    // Adjacent friendly transfers resolve before attacks on a general.
    let rescue=-1,rescuePower=0;
    for(const s of adj[home])if(v.owned[s]&&v.armies[s]>rescuePower+1){rescue=s;rescuePower=v.armies[s]-1;}
    if(threatTime===1&&rescue>=0)return emit(rescue,home);
    let intercept=null,interceptValue=-1;
    for(const s of sources)for(const t of adj[s])if(v.opponent[t]&&homeDist[t]<=threatTime&&v.armies[s]-1>v.armies[t]){const score=v.armies[t]*2-homeDist[t]*10;if(score>interceptValue){interceptValue=score;intercept=[s,t];}}
    if(intercept)return emit(intercept[0],intercept[1]);
    const defense=distances(home,true);let donor=-1,donorScore=0;
    for(const s of sources)if(s!==home&&defense[s]>0&&defense[s]<=threatTime+1){const val=(v.armies[s]-defense[s])/(defense[s]+.5);if(val>donorScore){donorScore=val;donor=s;}}
    if(donor>=0){const next=adj[donor].find(t=>v.owned[t]&&defense[t]===defense[donor]-1);if(next!==undefined)return emit(donor,next);}
  }
  const border=new Uint8Array(n),reveal=new Uint8Array(n),pressure=new Float64Array(n);
  for(let i=0;i<n;i++) {
    if(!pass(i))continue;
    for(const t of adj[i]) {if(!v.owned[t]&&pass(t))border[i]++;if(v.opponent[t])pressure[i]=Math.max(pressure[i],v.armies[t]);}
    const r=(i/v.w)|0,c=i%v.w;
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const rr=r+dr,cc=c+dc;if(rr>=0&&cc>=0&&rr<v.h&&cc<v.w&&m.seen[rr*v.w+cc]<0)reveal[i]++;}
  }
  let best=null,bestScore=-1e20;
  function offer(s,t,half,score,target){
    if(s===home && threat>=0 && t!==threat)score-=150;
    for(const e of m.edges)if(e[0]===t&&e[1]===s&&v.turn-e[2]<10)score-=16;
    if(target===m.target)score*=1.12;
    if(s===m.last)score+=.6;
    if(score>bestScore){bestScore=score;best={s,t,half,target};}
  }
  function available(s){
    if(s!==home)return {force:v.armies[s]-1,half:false};
    let nearby=0;
    for(const e of enemies)if(homeDist[e]>0&&homeDist[e]<=6)nearby=Math.max(nearby,v.armies[e]-homeDist[e]+3);
    const reserve=Math.max(mine.length>80?32:mine.length>45?18:mine.length>20?7:1,nearby);
    if(reserve>1){const half=Math.floor(v.armies[s]/2);if(v.armies[s]-half<reserve)return {force:0,half:true};return {force:half,half:true};}
    return {force:v.armies[s]>=5?v.armies[s]-1:0,half:false};
  }
  function reward(t,d,force,spent){
    const enemy=v.opponent[t]||(!v.visible[t]&&m.owner[t]>=0&&m.owner[t]!==v.player);
    let general=false;for(const [p,g] of m.generals)if(p!==v.player&&g===t)general=true;
    if(general)return 30000/(d+1)+Math.min(100,force);
    if(remaining<=3)return -1000;
    let value=v.castles[t]||m.terrain[t]===2?75*Math.min(1,remaining/120):enemy?20:15;
    value+=reveal[t]*1.9;
    if(enemy)value+=Math.min(15,(v.armies[t]||0)*.08);
    // A surviving expedition should retain enough force to keep moving.
    value+=Math.min(24,Math.sqrt(Math.max(0,force))*2.2);
    value-=spent*.23;
    if(pressure[t]>force+2)value-=Math.min(35,(pressure[t]-force)*.5);
    return value/(d+.7);
  }
  sources.sort((a,b)=>v.armies[b]-v.armies[a]);
  // Local expansion remains available even if a small border stack misses the search cap.
  for(const s of sources){const a=available(s);if(a.force<=0)continue;for(const t of adj[s])if(!v.owned[t]&&pass(t)){
    const defense=v.visible[t]?v.armies[t]:m.terrain[t]===2?45:1;
    if(a.force<=defense)continue;offer(s,t,a.half,reward(t,1,a.force-defense,defense),t);
  }}
  const cap=n>4096?4:10;
  for(const s of sources.slice(0,cap)){
    const a=available(s);if(a.force<3)continue;
    const dist=new Float64Array(n).fill(Infinity),steps=new Int32Array(n),force=new Float64Array(n),spent=new Float64Array(n),first=new Int32Array(n).fill(-1),done=new Uint8Array(n);
    const heap=[];
    function push(x,c){let k=heap.length;heap.push([x,c]);while(k){const p=(k-1)>>1;if(heap[p][1]<=c)break;heap[k]=heap[p];k=p;}heap[k]=[x,c];}
    function pop(){const root=heap[0],last=heap.pop();if(heap.length){let k=0;while(2*k+1<heap.length){let j=2*k+1;if(j+1<heap.length&&heap[j+1][1]<heap[j][1])j++;if(heap[j][1]>=last[1])break;heap[k]=heap[j];k=j;}heap[k]=last;}return root;}
    dist[s]=0;force[s]=a.force+1;push(s,0);let visited=0;
    while(heap.length&&visited<(n>4096?1800:n)){
      const [x,c]=pop();if(done[x]||c!==dist[x])continue;done[x]=1;visited++;
      const d=steps[x];
      if(x!==s&&!v.owned[x]&&force[x]>0&&d<=remaining){
        const t=first[x];let val=reward(x,d,force[x],spent[x]);
        if(v.owned[t])val-=.8;
        offer(s,t,a.half,val,x);
      }
      if(d>=Math.min(64,remaining))continue;
      for(const y of adj[x])if(!done[y]&&pass(y)){
        const own=v.owned[y],defense=own?0:v.visible[y]?v.armies[y]:m.terrain[y]===2?45:1;
        const growth=!own&&(v.castles[y]||v.generals[y])?(d+1)*.5:0;
        const f=force[x]-1+(own?v.armies[y]-1:-defense-growth);
        if(f<=0)continue;
        const cost=c+(own?.85:1.1)+(defense+growth)/Math.max(8,a.force*.35);
        if(cost<dist[y]){dist[y]=cost;steps[y]=d+1;force[y]=f;spent[y]=spent[x]+defense+growth;first[y]=x===s?y:first[x];push(y,cost);}
      }
    }
  }
  if(mine.length>30&&n<=4096){
    const anchor=sources.find(s=>s!==home&&border[s]&&v.armies[s]>=8);
    if(anchor!==undefined){const gather=distances(anchor,true);
      for(const s of sources){const a=available(s);if(s===anchor||a.force<5||gather[s]<1)continue;
        const t=adj[s].find(t=>v.owned[t]&&gather[t]===gather[s]-1);if(t===undefined)continue;
        const score=8+Math.sqrt(a.force*15)/(gather[s]+.5);
        offer(s,t,a.half,score,anchor);
      }
    }
  }
  if(best&&bestScore>0){m.target=best.target;return emit(best.s,best.t,best.half);}
  // No affordable target: consolidate toward the largest useful army.
  let anchor=sources.find(s=>s!==home&&border[s])??sources[0];
  if(anchor!==undefined){const d=distances(anchor,true);let donor=-1,val=0;for(const s of sources){const a=available(s);if(s!==anchor&&d[s]>0&&a.force/d[s]>val){val=a.force/d[s];donor=s;}}if(donor>=0){const t=adj[donor].find(t=>v.owned[t]&&d[t]===d[donor]-1);if(t!==undefined)return emit(donor,t,available(donor).half);}}
  return null;
}
