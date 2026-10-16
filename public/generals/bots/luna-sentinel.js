let mem = null;
const DR = [-1, 1, 0, 0], DC = [0, 0, -1, 1];

function act(v) {
  const n = v.h * v.w;
  if (!mem || mem.h !== v.h || mem.w !== v.w || mem.players !== v.players || mem.player !== v.player || v.turn <= mem.turn) {
    mem = { h:v.h, w:v.w, players:v.players, player:v.player, turn:-1, gen:new Map(), recentEdges:[] };
  }
  mem.recentEdges=mem.recentEdges.filter(e=>e.until>=v.turn);
  mem.turn = v.turn;
  const owned = [], generals = [], enemies = [];
  for (let i=0;i<n;i++) {
    if (v.owned[i]) owned.push(i);
    if (v.generals[i] && v.owned[i]) generals.push(i);
    if (v.generals[i] && v.opponent[i]) {
      const id=v.owners[i]; mem.gen.set(id,i); enemies.push({id,at:i,army:v.armies[i]});
    }
    if (v.opponent[i] && !v.generals[i]) enemies.push({id:v.owners[i],at:i,army:v.armies[i]});
  }
  for (const [id,at] of mem.gen) {
    if (v.owned[at]) mem.gen.delete(id);
    else if (v.visible[at] && !v.generals[at]) mem.gen.delete(id);
  }
  const remain = Math.max(0, (v.maxTurns || 1200) - v.turn);
  const general = generals[0] ?? -1;
  const hostileNearGen = general >= 0 ? nearbyHostile(v,general) : 0;
  let genReserve = 1;
  if (general >= 0) {
    const gArmy=v.armies[general];
    const visibleThreat=hostileNearGen;
    let guardBase=v.turn<18?2:v.turn<55?16:36;
    let closestThreat=0;
    const gr=Math.floor(general/v.w),gc=general%v.w;
    for(const e of enemies) {
      const er=Math.floor(e.at/v.w),ec=e.at%v.w;
      const distance=Math.abs(gr-er)+Math.abs(gc-ec);
      if(distance<=5) closestThreat=Math.max(closestThreat,e.army+4);
    }
    genReserve = Math.min(Math.max(1, gArmy-1), Math.max(guardBase, Math.ceil(visibleThreat*1.25)+2, closestThreat));
  }

  // A low-cost BFS from each of a bounded set of useful stacks gives routes to
  // visible generals and valuable frontiers without assuming a square board.
  let best = null;
  const sources=[];
  for (const s of owned) if (v.armies[s] > 1) sources.push(s);
  sources.sort((a,b)=>v.armies[b]-v.armies[a]);
  const sourceLimit = n > 4096 ? 10 : 28;
  const selected=sources.slice(0,sourceLimit);
  // Also retain local border units, which may be more useful than the largest stacks.
  for (const s of sources) {
    if (selected.length >= sourceLimit+18) break;
    if (adjacentFrontier(v,s)) selected.push(s);
  }

  // Emergency reinforcement takes precedence over economic expansion.
  if (general >= 0 && hostileNearGen >= Math.max(1,v.armies[general]-1)) {
    const gArmy=v.armies[general];
    for (const s of owned) {
      if (s===general || v.armies[s] < 3) continue;
      const d=adjacentDir(s,general,v.w);
      if (d<0) continue;
      const available=v.armies[s]-1;
      const needed=hostileNearGen+2-gArmy;
      if (needed>0 && available>0) {
        const split = available > needed*1.7 && available>8;
        return [Math.floor(s/v.w),s%v.w,d,split];
      }
    }
  }

  // A remembered visible enemy general remains a strategic goal when it is fogged.
  const generalTargets=[];
  for (const [id,at] of mem.gen) if (!v.owned[at] && !v.mountains[at]) generalTargets.push({id,at,known:true});
  for (const e of enemies) if (v.generals[e.at]) generalTargets.push({id:e.id,at:e.at,known:true});
  const goals=[];
  for(let t=0;t<n;t++) if(v.visible[t] && (v.castles[t] || v.neutral[t] || v.opponent[t])) {
    const score=v.generals[t]?2500:v.castles[t]?260:v.opponent[t]?500:60;
    goals.push({at:t,score,defense:v.armies[t]||0,gen:!!v.generals[t],city:!!v.castles[t]});
  }

  for (const s of selected) {
    const army=v.armies[s], isGen=v.generals[s]&&v.owned[s];
    const reserve=isGen ? genReserve : 1;
    const force=army-1;
    if (force<1) continue;
    const path=bfs(v,s);
    for(const goal of goals) {
      const t=goal.at, distance=path.dist[t];
      if(distance<2) continue;
      const first=firstHop(path.parent,t,s);
      if(first<0) continue;
      const hr=Math.floor(s/v.w)+DR[first],hc=s%v.w+DC[first],hop=hr*v.w+hc;
      const half=Math.floor(army/2);
      let split=false,sent=force;
      if(v.owned[hop]) {
        if(isGen) { if(half<reserve) continue; split=true;sent=half; }
        else if(army<=v.armies[hop]+2) continue;
      } else {
        const hopDef=v.armies[hop]||0;
        if(v.mountains[hop]) continue;
        if(v.structures_in_fog[hop] && sent<=40) continue;
        if(v.opponent[hop] || v.neutral[hop] || v.structures_in_fog[hop]) {
          if(sent<=hopDef) continue;
        }
        if(isGen) { if(half<reserve || half<=hopDef) continue; split=true;sent=half; }
      }
      if(goal.city && goal.defense>=sent && distance===2) {
        // Route to a city can still be useful as a staging move, but do not
        // send the current stack into the city before it can overcome 40 guards.
      }
      let score=goal.score/(distance+0.35);
      if(goal.gen) score+=180/(distance+0.5);
      if(remain<25) score*=1.7;
      score+=deterministicJitter(s,t,v.turn);
      offer([s,first,split],score);
    }
    // Aim at known enemy generals first, including an approach step through owned land.
    for (const t of generalTargets) {
      if (t.at===s || path.dist[t.at]<0) continue;
      const first=firstHop(path.parent,t.at,s);
      if (first<0) continue;
      const direct = path.dist[t.at]===1;
      const defense=direct ? v.armies[t.at] : (v.visible[t.at]?v.armies[t.at]:Math.max(2,Math.ceil(army*.42)));
      const split = army >= reserve*2 && Math.floor(army/2) > defense;
      if (isGen && !split) continue;
      if (!split && (isGen ? (force <= defense || army-1 < reserve+defense) : force <= defense)) continue;
      const urgency = remain < 30 ? 1.45 : 1;
      const score=(direct?190:70)/(path.dist[t.at]+1)*urgency + Math.min(35,(force-defense)*.12);
      offer([s,first,split],score);
    }
    const r=Math.floor(s/v.w), c=s%v.w;
    for (let d=0;d<4;d++) {
      const nr=r+DR[d], nc=c+DC[d];
      if(nr<0||nr>=v.h||nc<0||nc>=v.w)continue;
      const t=nr*v.w+nc;
      if(v.mountains[t]) continue;
      const own=v.owned[t], fog=v.fog[t], visible=v.visible[t];
      let value=0, defense=0, destinationType='';
      if(own) {
        if(t===general || remain<3 || army<5) continue;
        const pressure=frontierPressure(v,t);
        if(pressure<12 || (!isGen && army<=v.armies[t]+2)) continue;
        if(isGen && Math.floor(army/2)<reserve) continue;
        value=Math.min(25,pressure*.22) + Math.min(5,(army-v.armies[t])*.03);
        destinationType='stack';
      } else if(v.structures_in_fog[t]) {
        defense=40;
        value=82;
        destinationType='hidden-structure';
      } else if(fog) {
        value=13 + (remain<20?-8:0);
        defense=0;
        destinationType='explore';
      } else if(v.neutral[t]) {
        defense=v.armies[t]||0;
        value=v.castles[t]?68:24;
        destinationType=v.castles[t]?'city':'neutral';
      } else if(v.opponent[t]) {
        defense=v.armies[t]||0;
        value=v.generals[t]?240:53;
        destinationType=v.generals[t]?'general':'enemy';
      } else continue;
      // All-in captures targets that are actually beatable; split when it preserves
      // a useful rear stack and still sends enough force to win.
      let split=false;
      const half=Math.floor(army/2);
      if(destinationType==='stack') split=isGen;
      else if(half>defense && half>=3 && (destinationType==='explore'||destinationType==='neutral'||destinationType==='city'||destinationType==='hidden-structure') && (!isGen || half>=reserve)) split=true;
      if(isGen && !split) continue;
      const sent=split?half:force;
      if(sent<=defense) continue;
      if(isGen && !split && army-1 < reserve+defense) continue;
      const margin=sent-defense;
      let score=value + Math.min(30,Math.max(0,margin)*.16);
      if(destinationType==='general') score+=90;
      if(destinationType==='city') score+=v.turn%2===0?12:5;
      if(destinationType==='stack') score+=Math.min(20,army*.1);
      if(isGen && hostileNearGen>0) score-=80;
      // Avoid repeatedly feeding a futile attack into a city or enemy stack.
      if(destinationType==='explore') score-=Math.min(10,Math.floor(v.turn/100));
      score += deterministicJitter(s,t,v.turn);
      offer([s,d,split],score);
    }
  }
  if(!best) return null;
  const result=[Math.floor(best.s/v.w),best.s%v.w,best.d,best.split];
  const sr=best.s,dr=sr+DR[best.d]*v.w+DC[best.d];
  mem.recentEdges.push({src:sr,dst:dr,until:v.turn+12});
  if(mem.recentEdges.length>16) mem.recentEdges.shift();
  return result;

  function offer(move,score){
    const src=move[0],dst=src+DR[move[1]]*v.w+DC[move[1]];
    if(mem.recentEdges.some(e=>e.src===dst&&e.dst===src)) score-=160;
    if(!best||score>best.score) best={s:src,d:move[1],split:move[2],score};
  }
}

function nearbyHostile(v,i){
  let sum=0,r=Math.floor(i/v.w),c=i%v.w;
  for(let d=0;d<4;d++){const nr=r+DR[d],nc=c+DC[d];if(nr>=0&&nr<v.h&&nc>=0&&nc<v.w){const q=nr*v.w+nc;if(v.opponent[q])sum+=v.armies[q];}}
  return sum;
}
function adjacentDir(a,b,w){const ar=Math.floor(a/w),ac=a%w,br=Math.floor(b/w),bc=b%w;for(let d=0;d<4;d++)if(ar+DR[d]===br&&ac+DC[d]===bc)return d;return -1;}
function adjacentFrontier(v,i){const r=Math.floor(i/v.w),c=i%v.w;for(let d=0;d<4;d++){const nr=r+DR[d],nc=c+DC[d];if(nr>=0&&nr<v.h&&nc>=0&&nc<v.w){const q=nr*v.w+nc;if(!v.owned[q]&&!v.mountains[q])return true;}}return false;}
function frontierPressure(v,i){const r=Math.floor(i/v.w),c=i%v.w;let p=0;for(let d=0;d<4;d++){const nr=r+DR[d],nc=c+DC[d];if(nr>=0&&nr<v.h&&nc>=0&&nc<v.w){const q=nr*v.w+nc;if(v.generals[q])p=Math.max(p,180);else if(v.opponent[q])p=Math.max(p,70);else if(v.castles[q])p=Math.max(p,90);else if(v.neutral[q])p=Math.max(p,30);else if(v.fog[q]&&!v.structures_in_fog[q])p=Math.max(p,18);}}return p;}
function bfs(v,start){
  const n=v.h*v.w,dist=new Int32Array(n).fill(-1),parent=new Int32Array(n).fill(-1),queue=new Int32Array(n);let head=0,tail=0;
  dist[start]=0;queue[tail++]=start;
  while(head<tail){const i=queue[head++],r=Math.floor(i/v.w),c=i%v.w;for(let d=0;d<4;d++){const nr=r+DR[d],nc=c+DC[d];if(nr<0||nr>=v.h||nc<0||nc>=v.w)continue;const q=nr*v.w+nc;if(dist[q]>=0||v.mountains[q])continue;dist[q]=dist[i]+1;parent[q]=i;queue[tail++]=q;}}
  return {dist,parent};
}
function firstHop(parent,target,start){let cur=target;if(parent[cur]<0)return -1;while(parent[cur]!==start){cur=parent[cur];if(cur<0)return -1;}const sr=Math.floor(start/(mem.w)),sc=start%mem.w,r=Math.floor(cur/mem.w),c=cur%mem.w;for(let d=0;d<4;d++)if(sr+DR[d]===r&&sc+DC[d]===c)return d;return -1;}
function deterministicJitter(a,b,t){return ((a*17+b*31+t*13)%7)*.08;}


