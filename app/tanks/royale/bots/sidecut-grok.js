'use strict';

// 主线：单向射界。炮从车身左列或上排射出。
// 站在敌方原点 +1 的列或排时，自己打得到对方，对方炮口打不到自己。
// 若只能站在互相射界上，就在开火的同一拍挪到 +1 的安全侧。
// 缩圈、补给和比分决定要不要把这条射界打完。

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const MV = ['up', 'right', 'down', 'left'];
let N=26,P=25;

let M = null;

function decide(state) {
  if(state&&state.map){N=state.map.length;P=N-1;if(M&&M.size!==P)M=null;}
  try {
    return think(state);
  } catch (err) {
    return { move: 'stay', fire: false, intent: 'hold' };
  }
}

function blank() {
  return {
    size:P,
    tick: -1,
    lives: 3,
    hp: 2,
    seen: Object.create(null),
    shotAt: Object.create(null),
    radar: [],
    mine: [],
    target: '',
    targetTick: -99,
    stuck: 0,
    lx: -1,
    ly: -1,
    lastMove: 'stay',
    retreat: -1,
  };
}

function think(s) {
  const me = s.self;
  const tick = s.tick;
  const map = s.map;
  if (!M || tick === 0 || tick < M.tick || me.lives > M.lives) M = blank();
  if (tick - M.tick > 1) {
    M.mine = [];
    M.radar = [];
    M.stuck = 0;
    M.target = '';
    M.retreat = -1;
  }
  advanceMine(map);
  reconcileMine(s);
  attributeShots(s);
  refreshSeen(s);
  if (me.x === M.lx && me.y === M.ly) M.stuck += 1;
  else M.stuck = 0;
  if (tick - M.tick === 1 && (me.hp < M.hp || me.hurtTicks >= 4)) M.retreat = tick + 8;
  M.hp = me.hp;
  M.lives = me.lives;
  M.lx = me.x;
  M.ly = me.y;

  const req = required(tick, s.arena.safeZone);
  const visible = s.radar.tanks || [];
  const info = classify(s);
  const shy = tick < M.retreat;
  const target = pickTarget(s, visible, info);
  const shot = currentShot(s, visible, info, shy);
  const sets = buildSets(s, visible);
  const goal = search(s, visible, target, info, shy, req, sets);
  const options = scoreOptions(s, visible, target, shot, info, goal, sets, req);
  let best = options[0];
  for (let i = 1; i < options.length; i++) {
    const o = options[i];
    if (o.score > best.score || (o.score === best.score && o.tie < best.tie)) best = o;
  }
  if (best.fire) {
    const mz = muzzle(me.x, me.y, me.dir);
    if (mz[0] >= 0 && mz[1] >= 0 && mz[0] < N && mz[1] < N) {
      M.mine.push({ x: mz[0], y: mz[1], dir: me.dir, age: 0 });
    }
  }
  M.lastMove = best.move;
  M.tick = tick;
  M.radar = (s.radar.bullets || []).map((b) => ({ x: b.x, y: b.y, dir: b.dir }));
  return { move: best.move, fire: best.fire, intent: best.intent };
}

function advanceMine(map) {
  const next = [];
  for (let i = 0; i < M.mine.length; i++) {
    const b = M.mine[i];
    const p = stepBullet(map, b);
    if (!p) continue;
    const age = b.age + 1;
    if (age > 10) continue;
    next.push({ x: p.x, y: p.y, dir: b.dir, age });
  }
  M.mine = next;
}

function reconcileMine(s) {
  const seen = Object.create(null);
  const bullets = s.radar.bullets || [];
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    seen[b.x + ',' + b.y + ',' + b.dir] = 1;
  }
  const me = s.self;
  const kept = [];
  for (let i = 0; i < M.mine.length; i++) {
    const b = M.mine[i];
    const key = b.x + ',' + b.y + ',' + b.dir;
    if (seen[key]) {
      kept.push(b);
      continue;
    }
    const dist = Math.max(Math.abs(me.x - b.x), Math.abs(me.y - b.y));
    if (dist > 6 && b.age <= 8) kept.push(b);
  }
  M.mine = kept;
}

function stepBullet(map, b) {
  let x = b.x;
  let y = b.y;
  if (x < 0 || y < 0 || x >= N || y >= N) return null;
  if (map[y][x] === 1 || map[y][x] === 2) return null;
  const dx = DX[b.dir];
  const dy = DY[b.dir];
  for (let i = 0; i < 3; i++) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= N || ny >= N) return null;
    if (map[ny][nx] === 1 || map[ny][nx] === 2) return null;
    x = nx;
    y = ny;
  }
  return { x, y };
}

function attributeShots(s) {
  const explained = Object.create(null);
  for (let i = 0; i < M.radar.length; i++) {
    const p = stepBullet(s.map, M.radar[i]);
    if (p) explained[p.x + ',' + p.y + ',' + M.radar[i].dir] = 1;
  }
  for (let i = 0; i < M.mine.length; i++) {
    const b = M.mine[i];
    explained[b.x + ',' + b.y + ',' + b.dir] = 1;
  }
  const bullets = s.radar.bullets || [];
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (explained[b.x + ',' + b.y + ',' + b.dir]) continue;
    const dx = DX[b.dir];
    const dy = DY[b.dir];
    for (let back = 1; back <= 3; back++) {
      const sx = b.x - dx * back;
      const sy = b.y - dy * back;
      for (const id in M.seen) {
        const e = M.seen[id];
        if (s.tick - e.tick > 2 || e.dir !== b.dir) continue;
        const mz = muzzle(e.x, e.y, e.dir);
        if (mz[0] === sx && mz[1] === sy) M.shotAt[id] = s.tick - 1;
      }
    }
  }
}

function refreshSeen(s) {
  for (let i = 0; i < s.opponents.length; i++) {
    const o = s.opponents[i];
    if (o.lives <= 0 || o.respawnTicks > 0 || o.status === 'eliminated' || o.status === 'error' || o.status === 'timeout') {
      delete M.seen[o.id];
      if (o.lives <= 0) delete M.shotAt[o.id];
    }
  }
  const tanks = s.radar.tanks || [];
  for (let i = 0; i < tanks.length; i++) {
    const e = tanks[i];
    M.seen[e.id] = {
      x: e.x, y: e.y, dir: e.dir, hp: e.hp,
      inv: e.invincibleTicks, hurt: e.hurtTicks, rapid: e.rapidTicks, tick: s.tick,
    };
  }
}

function canShoot(e, tick) {
  const at = M.shotAt[e.id];
  if (at === undefined) return true;
  const gap = e.rapidTicks > 0 ? 4 : 6;
  return tick >= at + gap;
}

function classify(s) {
  const board = s.scoreboard || [];
  let me = { points: 0, kills: 0, lives: s.self.lives };
  for (let i = 0; i < board.length; i++) if (board[i].id === s.self.id) me = board[i];
  let ahead = true;
  let tied = false;
  let top = me.points;
  let alive = 0;
  for (let i = 0; i < board.length; i++) {
    const r = board[i];
    if (r.id === s.self.id) continue;
    if (r.lives <= 0 || r.status === 'error' || r.status === 'timeout') continue;
    alive += 1;
    if (r.points > top) top = r.points;
    if (r.points > me.points) ahead = false;
    else if (r.points === me.points && r.kills > me.kills) ahead = false;
    else if (r.points === me.points && r.kills === me.kills && r.lives > me.lives) ahead = false;
    else if (r.points === me.points && r.kills === me.kills && r.lives === me.lives) tied = true;
  }
  const clearly = ahead && !tied;
  const behind = !ahead;
  const tick = s.tick;
  let mode = 'farm';
  if (clearly && (tick >= 460 || (s.self.lives === 1 && s.self.hp === 1 && tick >= 380))) mode = 'bank';
  else if (behind && (tick >= 300 || top - me.points >= 3 || tick >= 500)) mode = 'hunt';
  return { mode, behind, clearly, alive, me, top, deficit: top - me.points };
}

function rowOf(s, id) {
  const board = s.scoreboard || [];
  for (let i = 0; i < board.length; i++) if (board[i].id === id) return board[i];
  return null;
}

function axisSteps(me, e) {
  const sx = me.x < e.x ? e.x - me.x : me.x > e.x + 1 ? me.x - (e.x + 1) : 0;
  const sy = me.y < e.y ? e.y - me.y : me.y > e.y + 1 ? me.y - (e.y + 1) : 0;
  return sx < sy ? sx : sy;
}

function pickTarget(s, visible, info) {
  let best = null;
  let bestV = -1e9;
  const score = [];
  for (let i = 0; i < visible.length; i++) {
    const e = visible[i];
    const row = rowOf(s, e.id);
    let v = (2 - e.hp) * 26;
    if (e.hp === 1) v += 22;
    if (row && row.lives === 1) v += 26;
    if (row && info.behind && row.points === info.top) v += 20;
    if (e.hurtTicks > 2) v -= 16;
    if (e.invincibleTicks > 0) v -= 28;
    v -= axisSteps(s.self, e) * 6;
    v -= Math.max(Math.abs(s.self.x - e.x), Math.abs(s.self.y - e.y));
    if (e.id === M.target && s.tick - M.targetTick < 8) v += 16;
    if (info.mode === 'bank' && e.hp > 1) v -= 24;
    score.push(v);
    if (v > bestV) {
      bestV = v;
      best = e;
    }
  }
  if (!best) return null;
  if (M.target && M.target !== best.id && s.tick - M.targetTick < 6) {
    for (let i = 0; i < visible.length; i++) {
      if (visible[i].id === M.target && score[i] >= bestV - 18) best = visible[i];
    }
  }
  M.target = best.id;
  M.targetTick = s.tick;
  return best;
}

function currentShot(s, visible, info, shy) {
  const me = s.self;
  if (me.fireCooldown !== 0 || M.mine.length >= 2) return null;
  let best = null;
  for (let i = 0; i < visible.length; i++) {
    const e = visible[i];
    const L = look(s.map, me.x, me.y, me.dir, e, visible, false);
    if (L && L.kind === 'hit') {
      const travel = L.k <= 3 ? 0 : Math.ceil((L.k - 3) / 3);
      if (travel < e.hurtTicks - 1) continue;
      if (e.invincibleTicks > travel) continue;
      if (travel > 4) continue;
      const good = laneGood(me.x, me.y, me.dir, e);
      const row = rowOf(s, e.id);
      const eliminate = !!(row && row.lives === 1 && e.hp === 1);
      let w = good ? 230 : 96;
      if (e.hp === 1) w += 170;
      if (row && row.lives === 1) w += 36;
      if (eliminate && me.lives >= 2) w += 420;
      if (travel > 2 && !good) w -= 36;
      if ((info.mode === 'bank' || shy) && !eliminate && !(good && e.hp === 1)) w = good && travel <= 1 ? 70 : 0;
      if (me.invincibleTicks > 4 && !(eliminate || (good && e.hp === 1 && travel <= 1))) w = 0;
      if (w > 0 && (!best || w > best.w)) best = { w, good, e, travel, siege: false, eliminate };
    } else if (L && L.kind === 'brick' && L.k <= 3 && info.mode !== 'bank' && !shy && me.invincibleTicks <= 2) {
      const behind = look(s.map, me.x, me.y, me.dir, e, visible, true);
      if (behind && behind.kind === 'hit' && (!best || best.w < 48)) {
        best = { w: 48, good: false, e, travel: 0, siege: true, eliminate: false };
      }
    }
  }
  return best;
}

function laneGood(x, y, dir, e) {
  if (dir === 0 || dir === 2) return x === e.x + 1;
  return y === e.y + 1;
}

function look(map, x, y, dir, target, bodies, passBrick) {
  let cx = x;
  let cy = y;
  if (dir === 0) cy = y - 1;
  else if (dir === 1) cx = x + 2;
  else if (dir === 2) cy = y + 2;
  else cx = x - 1;
  const dx = DX[dir];
  const dy = DY[dir];
  let skipped = false;
  for (let k = 0; k < 28; k++) {
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return null;
    if (covers(target, cx, cy)) return { kind: 'hit', k };
    if (bodies) {
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.id === target.id || b.invincibleTicks > 0) continue;
        if (covers(b, cx, cy)) return { kind: 'body', k };
      }
    }
    const t = map[cy][cx];
    if (t === 2) return { kind: 'steel', k };
    if (t === 1) {
      if (passBrick && !skipped) {
        skipped = true;
        cx += dx;
        cy += dy;
        continue;
      }
      return { kind: 'brick', k };
    }
    cx += dx;
    cy += dy;
  }
  return null;
}

function flightWhen(map, bx, by, dir, tx, ty) {
  let x = bx;
  let y = by;
  const dx = DX[dir];
  const dy = DY[dir];
  for (let t = 0; t < 2; t++) {
    if (hitsTank(x, y, tx, ty)) return t;
    if (x < 0 || y < 0 || x >= N || y >= N) return -1;
    if (map[y][x] === 1 || map[y][x] === 2) return -1;
    for (let s = 0; s < 3; s++) {
      x += dx;
      y += dy;
      if (x < 0 || y < 0 || x >= N || y >= N) return -1;
      if (hitsTank(x, y, tx, ty)) return t;
      if (map[y][x] === 1 || map[y][x] === 2) return -1;
    }
  }
  return -1;
}

function hitsTank(x, y, tx, ty) {
  return x >= tx && x <= tx + 1 && y >= ty && y <= ty + 1;
}

function ownImmune(b) {
  for (let i = 0; i < M.mine.length; i++) {
    const m = M.mine[i];
    if (m.age < 3 && m.x === b.x && m.y === b.y && m.dir === b.dir) return true;
  }
  return false;
}

function buildSets(s, visible) {
  const hard = new Uint8Array(P*P);
  const soft = new Uint8Array(P*P);
  const hot = new Uint8Array(P*P);
  for (let i = 0; i < visible.length; i++) {
    const e = visible[i];
    const ready = canShoot(e, s.tick);
    for (let d = 0; d < 4; d++) {
      paintRay(s.map, e, d, ready && d === e.dir ? hard : soft, visible);
    }
  }
  const bullets = s.radar.bullets || [];
  for (let i = 0; i < bullets.length; i++) {
    if (!ownImmune(bullets[i])) paintFlight(s.map, bullets[i], hot);
  }
  return { hard, soft, hot };
}

function paintRay(map, e, dir, into, bodies) {
  let pair = muzzle(e.x, e.y, dir);
  let x = pair[0];
  let y = pair[1];
  const dx = DX[dir];
  const dy = DY[dir];
  for (let k = 0; k < 28; k++) {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    if (map[y][x] === 1 || map[y][x] === 2) return;
    markOrigins(into, x, y);
    let stop = false;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.id === e.id || b.invincibleTicks > 0) continue;
      if (covers(b, x, y)) {
        stop = true;
        break;
      }
    }
    if (stop) return;
    x += dx;
    y += dy;
  }
}

function paintFlight(map, b, into) {
  let x = b.x;
  let y = b.y;
  const dx = DX[b.dir];
  const dy = DY[b.dir];
  for (let t = 0; t < 2; t++) {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    if (map[y][x] === 1 || map[y][x] === 2) return;
    markOrigins(into, x, y);
    for (let s = 0; s < 3; s++) {
      x += dx;
      y += dy;
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      if (map[y][x] === 1 || map[y][x] === 2) return;
      markOrigins(into, x, y);
    }
  }
}

function markOrigins(into, x, y) {
  for (let oy = y - 1; oy <= y; oy++) {
    if (oy < 0 || oy > N-2) continue;
    for (let ox = x - 1; ox <= x; ox++) {
      if (ox < 0 || ox > N-2) continue;
      into[oy * P + ox] = 1;
    }
  }
}

function shares(x, y, e) {
  return x === e.x || x === e.x + 1 || y === e.y || y === e.y + 1;
}

function spotValue(map, x, y, dir, e, visible) {
  if ((dir === 0 || dir === 2) && x !== e.x && x !== e.x + 1) return 0;
  if ((dir === 1 || dir === 3) && y !== e.y && y !== e.y + 1) return 0;
  const L = look(map, x, y, dir, e, visible, false);
  if (!L || L.kind !== 'hit') return 0;
  const travel = L.k <= 3 ? 0 : Math.ceil((L.k - 3) / 3);
  if (travel > 4 || travel < e.hurtTicks - 1 || e.invincibleTicks > travel) return 0;
  const good = laneGood(x, y, dir, e);
  let v = good ? 128 : 70;
  v -= travel * 10;
  if (e.hp === 1) v += 22;
  return v;
}

function bestDir(map, x, y, target, visible) {
  let d = -1;
  let v = 0;
  for (let i = 0; i < 4; i++) {
    const s = spotValue(map, x, y, i, target, visible);
    if (s > v) {
      v = s;
      d = i;
    }
  }
  return d;
}

function required(tick, zone) {
  let min = zone.min;
  if (zone.nextShrinkTick !== null && zone.nextShrinkTick !== undefined && zone.nextShrinkTick - tick <= 36) {
    min = Math.max(min, zone.nextMin);
  }
  return { min, max: N-1-min };
}

function zoneWeight(x, y, req, s) {
  const now = s.arena.safeZone;
  let p = outside(x, y, now.min, now.max);
  if (p > 0 && s.tick >= 200) p += 2;
  p += outside(x, y, req.min, req.max);
  return p;
}

function supplyWanted(s, box) {
  if (!box || s.tick >= box.expireTick) return false;
  if (box.type === 'repair') return s.self.hp < 2;
  return s.self.rapidTicks < 45;
}

function supplyScore(s, box, x, y) {
  const dist = Math.abs(s.self.x - box.x) + Math.abs(s.self.y - box.y);
  const until = box.appearTick - s.tick;
  const commit = box.available || until <= Math.max(6, dist);
  const d = Math.abs(x - box.x) + Math.abs(y - box.y);
  if (!commit) return d >= 3 && d <= 6 ? 8 : 0;
  const zone = s.arena.safeZone;
  const on = Math.abs(x - box.x) <= 1 && Math.abs(y - box.y) <= 1 && inside(x, y, zone.min, zone.max);
  if (on) return box.type === 'repair' ? 160 : 108;
  return Math.max(0, 14 - d) * (box.type === 'repair' ? 3 : 2);
}

function stageOf(me, e) {
  const vx = Math.abs(me.x - e.x);
  const vy = Math.abs(me.y - e.y);
  let tx;
  let ty;
  if (vx > vy) {
    ty = e.y + 1;
    tx = me.x >= e.x ? e.x + 3 : e.x - 3;
  } else {
    tx = e.x + 1;
    ty = me.y >= e.y ? e.y + 3 : e.y - 3;
  }
  if (tx < 0) tx = 0;
  else if (tx > N-2) tx = N-2;
  if (ty < 0) ty = 0;
  else if (ty > N-2) ty = N-2;
  return [tx, ty];
}

function freshest(s) {
  let best = null;
  for (const id in M.seen) {
    const e = M.seen[id];
    if (s.tick - e.tick > 30) continue;
    if (!best || e.tick > best.tick) best = e;
  }
  return best;
}

function homeFor(s,id){const i=s.scoreboard.findIndex(function(r){return r.id===id;});const low=Math.floor((N-2)*0.25),high=Math.floor((N-2)*0.72);return (i<0?0:i)%4===0?[low,high]:(i%4===1?[low,low]:(i%4===2?[high,low]:[high,high]));}

function search(s, visible, target, info, shy, req, sets) {
  const me = s.self;
  const map = s.map;
  const start = me.y * P + me.x;
  const cost = new Int16Array(P*P);
  const steps = new Int16Array(P*P);
  const first = new Int8Array(P*P);
  cost.fill(-1);
  steps.fill(-1);
  first.fill(-1);
  cost[start] = 0;
  steps[start] = 0;
  const heap = [[0, start]];
  let best = start;
  let bestS = -1e9;
  let bestSteps = 0;
  const box = s.arena.supply;
  const wantBox = supplyWanted(s, box);
  const pull = target ? stageOf(me, target) : null;
  const home = homeFor(s,me.id);
  const memory = target ? null : freshest(s);
  while (heap.length) {
    const item = heapPop(heap);
    const c = item[0];
    const id = item[1];
    if (c !== cost[id]) continue;
    const x = id % P;
    const y = (id / P) | 0;
    const travel = steps[id];
    let sc = -travel * 2;
    sc -= zoneWeight(x, y, req, s) * 20;
    if (sets.hard[id]) sc -= 28;
    else if (sets.soft[id]) sc -= 10;
    if (sets.hot[id]) sc -= 16;
    if (target && shares(x, y, target)) {
      let spot = 0;
      for (let d = 0; d < 4; d++) {
        const v = spotValue(map, x, y, d, target, visible);
        if (v > spot) spot = v;
      }
      if (info.mode === 'bank' || shy) spot *= 0.18;
      else if (info.mode === 'hunt') spot *= 1.15;
      sc += spot;
    }
    if (pull) {
      const w = info.mode === 'bank' || shy ? 0.08 : info.mode === 'hunt' ? 0.62 : 0.3;
      sc -= (Math.abs(x - pull[0]) + Math.abs(y - pull[1])) * w;
    } else if (memory) {
      sc -= (Math.abs(x - memory.x) + Math.abs(y - memory.y)) * 0.42;
    } else {
      const hx = clamp(home[0], req.min, N-2-req.min);
      const hy = clamp(home[1], req.min, N-2-req.min);
      sc -= (Math.abs(x - hx) + Math.abs(y - hy)) * 0.65;
    }
    if (wantBox) sc += supplyScore(s, box, x, y);
    if ((info.mode === 'bank' || shy) && grassAt(map, x, y) && inside(x, y, req.min, req.max)) sc += 14;
    if (sc > bestS || (sc === bestS && travel < bestSteps)) {
      bestS = sc;
      best = id;
      bestSteps = travel;
    }
    if (travel >= 16) continue;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (!passable(map, nx, ny) || blockedBy(visible, nx, ny)) continue;
      const nid = ny * P + nx;
      const extra = (sets.hard[nid] ? 4 : 0) + (sets.hot[nid] ? 3 : 0);
      const nc = c + 1 + extra;
      if (cost[nid] !== -1 && nc >= cost[nid]) continue;
      cost[nid] = nc;
      steps[nid] = travel + 1;
      first[nid] = id === start ? d : first[id];
      heapPush(heap, [nc, nid]);
    }
  }
  return { dir: first[best] };
}

function heapPush(h, item) {
  h.push(item);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p][0] <= h[i][0]) break;
    const tmp = h[p];
    h[p] = h[i];
    h[i] = tmp;
    i = p;
  }
}

function heapPop(h) {
  const top = h[0];
  const last = h.pop();
  if (!h.length) return top;
  h[0] = last;
  let i = 0;
  for (;;) {
    const l = i * 2 + 1;
    const r = l + 1;
    let m = i;
    if (l < h.length && h[l][0] < h[m][0]) m = l;
    if (r < h.length && h[r][0] < h[m][0]) m = r;
    if (m === i) break;
    const tmp = h[m];
    h[m] = h[i];
    h[i] = tmp;
    i = m;
  }
  return top;
}

function bulletPain(map, bullets, virtual, x, y, armored, hp) {
  let pain = 0;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (ownImmune(b)) continue;
    pain += painOf(flightWhen(map, b.x, b.y, b.dir, x, y), armored, hp);
  }
  for (let i = 0; i < virtual.length; i++) {
    const b = virtual[i];
    if (b.x < 0 || b.y < 0 || b.x >= N || b.y >= N) continue;
    pain += painOf(flightWhen(map, b.x, b.y, b.dir, x, y), armored, hp);
  }
  return pain;
}

function painOf(when, armored, hp) {
  if (when < 0) return 0;
  if (when === 0 && armored) return 12;
  if (when === 0) return hp === 1 ? 9000 : 1500;
  if (when === 1) return hp === 1 ? 220 : 80;
  return 0;
}

function aimBonus(map, me, i, x, y, dir, blocked, target, visible, info, shy) {
  if (!target || i > 3) return 0;
  const scale = info.mode === 'bank' || shy ? 0.25 : 1;
  const here = bestDir(map, me.x, me.y, target, visible);
  if (here >= 0 && here !== me.dir) {
    if (i === here) {
      if (blocked) return 110 * scale;
      if (spotValue(map, x, y, dir, target, visible) > 0) return 100 * scale;
      return 18 * scale;
    }
    if (i === (here ^ 2) && !blocked) return 72 * scale;
    return 0;
  }
  return spotValue(map, x, y, dir, target, visible) * 0.42 * scale;
}

function scoreOptions(s, visible, target, shot, info, goal, sets, req) {
  const me = s.self;
  const map = s.map;
  const tick = s.tick;
  const ghost = me.invincibleTicks > 0;
  const armored = me.hurtTicks >= 2;
  const zone = s.arena.safeZone;
  const damageTick = tick >= 200 && tick % 10 === 0;
  const shy = tick < M.retreat;
  const bullets = s.radar.bullets || [];
  const virtual = [];
  for (let i = 0; i < visible.length; i++) {
    const e = visible[i];
    if (!canShoot(e, tick)) continue;
    const L = look(map, e.x, e.y, e.dir, me, visible, false);
    if (!L || L.kind !== 'hit') continue;
    const mz = muzzle(e.x, e.y, e.dir);
    virtual.push({ x: mz[0], y: mz[1], dir: e.dir });
  }
  const stayPain = bulletPain(map, bullets, virtual, me.x, me.y, armored, me.hp);
  const prefer = goal.dir < 0 ? 4 : goal.dir;
  const opp = M.lastMove === 'up' ? 'down' : M.lastMove === 'down' ? 'up' : M.lastMove === 'left' ? 'right' : M.lastMove === 'right' ? 'left' : '';
  const rand = s.random >>> 0;
  const options = [];
  for (let i = 0; i < 5; i++) {
    const mv = i < 4 ? MV[i] : 'stay';
    let x = me.x;
    let y = me.y;
    let dir = me.dir;
    let blocked = false;
    let moved = false;
    if (i < 4) {
      const nx = me.x + DX[i];
      const ny = me.y + DY[i];
      if (passable(map, nx, ny) && !blockedBy(visible, nx, ny)) {
        x = nx;
        y = ny;
        dir = i;
        moved = true;
      } else {
        dir = i;
        blocked = true;
      }
    }
    const id = y * P + x;
    let nav = i === prefer ? 58 : 0;
    if (sets.hard[id]) nav -= 24;
    else if (sets.soft[id]) nav -= 8;
    if (sets.hot[id]) nav -= 20;
    if (mv === opp && M.stuck < 3) nav -= 7;
    if (blocked) nav -= 5;
    if (M.stuck >= 4 && moved) nav += 26;
    if ((info.mode === 'bank' || shy) && grassAt(map, x, y)) nav += 8;
    nav += aimBonus(map, me, i, x, y, dir, blocked, target, visible, info, shy);
    const pain = bulletPain(map, bullets, virtual, x, y, armored, me.hp);
    const zoneDie = damageTick && !inside(x, y, zone.min, zone.max);
    let zoneCost = zoneDie ? (me.hp === 1 ? 9000 : 2600) : outside(x, y, zone.min, zone.max) * 70;
    zoneCost += outside(x, y, req.min, req.max) * 10;
    const quietDanger = zoneCost + (ghost ? 0 : pain);
    options.push({
      move: mv,
      fire: false,
      intent: intentOf(false, false, info, s, x, y, pain, stayPain),
      score: nav - quietDanger,
      tie: (rand >>> (i * 3)) & 15,
    });
    if (!shot) continue;
    let w = shot.w;
    if (w <= 0) continue;
    let danger = zoneCost + pain;
    if (shot.eliminate && me.lives >= 2 && !zoneDie) danger = Math.min(danger, 180);
    options.push({
      move: mv,
      fire: true,
      intent: intentOf(true, shot.siege, info, s, x, y, pain, stayPain),
      score: nav - danger + w,
      tie: ((rand >>> (i * 3)) & 15) + 16,
    });
  }
  return options;
}

function intentOf(fire, siege, info, s, x, y, pain, stayPain) {
  if (fire && siege) return 'siege';
  if (fire) return 'pursue';
  if (pain + 8 < stayPain) return 'retreat';
  const zone = s.arena.safeZone;
  if (!inside(s.self.x, s.self.y, zone.min, zone.max) && inside(x, y, zone.min, zone.max)) return 'retreat';
  const box = s.arena.supply;
  if (box && supplyWanted(s, box)) {
    const d0 = Math.abs(s.self.x - box.x) + Math.abs(s.self.y - box.y);
    const d1 = Math.abs(x - box.x) + Math.abs(y - box.y);
    if (d1 < d0) return 'resupply';
  }
  if (info.mode === 'bank') return x === s.self.x && y === s.self.y ? 'hold' : 'defend';
  if (info.mode === 'hunt') return 'advance';
  return x === s.self.x && y === s.self.y ? 'hold' : 'flank';
}

function covers(t, x, y) {
  return x >= t.x && x < t.x + 2 && y >= t.y && y < t.y + 2;
}

function passable(map, x, y) {
  if (x < 0 || y < 0 || x > N-2 || y > N-2) return false;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const t = map[y + dy][x + dx];
      if (t !== 0 && t !== 4) return false;
    }
  }
  return true;
}

function blockedBy(list, x, y) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (x < e.x + 2 && x + 2 > e.x && y < e.y + 2 && y + 2 > e.y) return true;
  }
  return false;
}

function inside(x, y, min, max) {
  return x >= min && y >= min && x + 1 <= max && y + 1 <= max;
}

function outside(x, y, min, max) {
  const dx = min - x > x + 1 - max ? min - x : x + 1 - max;
  const dy = min - y > y + 1 - max ? min - y : y + 1 - max;
  return (dx > 0 ? dx : 0) + (dy > 0 ? dy : 0);
}

function grassAt(map, x, y) {
  if (x < 0 || y < 0 || x > N-2 || y > N-2) return false;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) if (map[y + dy][x + dx] === 4) return true;
  }
  return false;
}

function muzzle(x, y, dir) {
  if (dir === 0) return [x, y - 1];
  if (dir === 1) return [x + 2, y];
  if (dir === 2) return [x, y + 2];
  return [x - 1, y];
}

function clamp(v, a, b) {
  if (b < a) return a;
  return v < a ? a : v > b ? b : v;
}

