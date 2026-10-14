// 四人坦克乱斗 2.6 · shrike（伯劳）
// 独立策略：弹药窗口收割 + 补给统制 + 圈层纪律。
//
// 核心主张（三条，按优先级）：
//   1. 圈层纪律最高：任何时刻都不允许为了战斗留在或走进危险区；提前一拍想清下一条边界与撤离路。
//   2. 只在自己挨不到弹、且这一发能造成真实装甲伤害时开火；残甲（1 血）时基本不接对射。
//   3. 目标一旦选定就保持数拍（committed goal），避免每拍在格与格之间来回摇摆。
// 只使用 decide(state) 的合法输入与自身历史；热路径用预计算网格，单拍决策远低于 50ms。

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const MOVES = ['up', 'right', 'down', 'left', 'stay'];
const SAFE_ACTION = { move: 'stay', fire: false, intent: 'hold' };
let N=26,POS=25,CELL=676,COUNT=625;
const BITCOUNT = [0, 1, 1, 2, 1, 2, 2, 3];

// 权重：以「1 点装甲 ≈ 10 单位」为基准。
const P = {
  bulletNow: 24, bulletNext: 7,
  gunClose: 9, gunMid: 6.5, gunFar: 4.5, gunStale: 2.5, rapidMul: 1.5,
  nakedW: 4,        // 处在敌方枪线下、自己却打不到他
  facingW: 2.6, laneW: 7,
  zoneW: 400, ringW: 7,
  distW: 0.5, supplyW: 3.2, huntW: 0.6, grassW: 2.0,
  minRange: 0, rangeW: 0,   // 与可见敌人的最小期望距离（0 = 关闭）
  trailW: 3.0, undoW: 16,
  hp1Danger: 3.4, killW: 22, hitW: 10, fireGate: 1.6, offBonus: 7,
};

// 跨拍记忆（本局自己的 Worker 内保留）
const M = {
  tick: -1, lives: 0, seen: {}, lastFire: {}, visTick: {},
  shots: [], eb: [], trail: [], stuck: 0, last: { x: -1, y: -1 },
  target: '', goal: null, goalWhy: '', goalUntil: 0, lastMove: -1,
};

// 预计算网格（26×26 单格）：0 无 / 1 下拍 / 2 本拍
let GB = new Uint8Array(CELL);
let GG = new Uint8Array(CELL);
let GF = new Uint8Array(CELL);
let GL = new Uint8Array(CELL);
let GO = new Uint8Array(CELL);
let DIST = new Int16Array(COUNT);
let FIRST = new Int8Array(COUNT);
let Q = new Int16Array(COUNT);

// ---------------- 基础工具 ----------------
function ab(n) { return n < 0 ? -n : n; }
function cheb(ax, ay, bx, by) { const dx = ab(ax - bx), dy = ab(ay - by); return dx > dy ? dx : dy; }
function covers(b, x, y) { return x >= b.x && x <= b.x + 1 && y >= b.y && y <= b.y + 1; }
function ovl(a, b) { return a.x <= b.x + 1 && a.x + 1 >= b.x && a.y <= b.y + 1 && a.y + 1 >= b.y; }
function boxFree(map, x, y) {
  if (x < 0 || y < 0 || x > N-2 || y > N-2) return false;
  const a = map[y][x], b = map[y][x + 1], c = map[y + 1][x], d = map[y + 1][x + 1];
  return (a === 0 || a === 4) && (b === 0 || b === 4) && (c === 0 || c === 4) && (d === 0 || d === 4);
}
function muzzleX(x, d) { return d === 1 ? x + 2 : d === 3 ? x - 1 : x; }
function muzzleY(y, d) { return d === 2 ? y + 2 : d === 0 ? y - 1 : y; }
function touchGrass(map, x, y) {
  if (x < 0 || y < 0 || x > N-2 || y > N-2) return false;
  return map[y][x] === 4 || map[y][x + 1] === 4 || map[y + 1][x] === 4 || map[y + 1][x + 1] === 4;
}
function inZone(x, y, z) { return x >= z.min && y >= z.min && x + 1 <= z.max && y + 1 <= z.max; }
// 车身四格在 zone 外的最大超出量（0 表示完全在内）
function zoneOut(x, y, z) {
  return Math.max(z.min - x, z.min - y, x + 1 - z.max, y + 1 - z.max, 0);
}
function markRay(grid, map, x, y, d, maxLen, value) {
  let cx = x, cy = y;
  for (let i = 0; i < maxLen; i++) {
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
    const t = map[cy][cx];
    if (t === 1 || t === 2) return;
    const idx = cy * N + cx;
    grid[idx] = grid[idx] | value;
    cx += DIRS[d][0]; cy += DIRS[d][1];
  }
}
function markSpan(map, x, y, d) {
  let cx = x, cy = y;
  for (let i = 0; i < 7; i++) {
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
    const t = map[cy][cx];
    if (t === 1 || t === 2) return;
    const idx = cy * N + cx;
    const v = i <= 3 ? 2 : 1;
    if (v > GB[idx]) GB[idx] = v;
    cx += DIRS[d][0]; cy += DIRS[d][1];
  }
}
function rayHitsBox(map, tanks, mx, my, d, bx, by, maxLen, selfId) {
  let x = mx, y = my;
  for (let i = 0; i < maxLen; i++) {
    if (x < 0 || y < 0 || x >= N || y >= N) return -1;
    const t = map[y][x];
    if (t === 1 || t === 2) return -1;
    if (x >= bx && x <= bx + 1 && y >= by && y <= by + 1) return i;
    for (let k = 0; k < tanks.length; k++) {
      const o = tanks[k];
      if (o.id !== selfId && covers(o, x, y)) return -1;
    }
    x += DIRS[d][0]; y += DIRS[d][1];
  }
  return -1;
}
function advance(map, x, y, d, steps) {
  let cx = x, cy = y;
  for (let i = 0; i < steps; i++) {
    const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
    if (nx < 0 || ny < 0 || nx >= N || ny >= N) return { x: cx, y: cy, alive: false };
    const t = map[ny][nx];
    if (t === 1 || t === 2) return { x: cx, y: cy, alive: false };
    cx = nx; cy = ny;
  }
  return { x: cx, y: cy, alive: true };
}
// 本格四条射界中，能命中目标的行/列有多少条（用于拆砖判断与进攻位加成）
function lanesOn(map, tanks, x, y, target, selfId) {
  let n = 0;
  for (let d = 0; d < 4; d++) {
    if (rayHitsBox(map, tanks, muzzleX(x, d), muzzleY(y, d), d, target.x, target.y, 16, selfId) >= 0) n++;
  }
  return n;
}
// 本格是否被砖墙挡在目标方向（可拆）
function brickOnLine(map, x, y, target) {
  const dx = target.x - x, dy = target.y - y;
  const d = ab(dx) >= ab(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  let cx = muzzleX(x, d), cy = muzzleY(y, d);
  for (let i = 0; i < 5; i++) {
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return false;
    const t = map[cy][cx];
    if (t === 1) return true;
    if (t === 2) return false;
    cx += DIRS[d][0]; cy += DIRS[d][1];
  }
  return false;
}

// 本格被敌方枪口威胁的加权风险：越近、越新鲜、对方越快射，权重越高。
function gunRiskAt(map, visTanks, E, x, y) {
  let risk = 0;
  for (let i = 0; i < E.length; i++) {
    const en = E[i];
    if (en.age > 3) continue;
    if (en.inv > 0) continue;
    const hit = rayHitsBox(map, visTanks, muzzleX(en.x, en.dir), muzzleY(en.y, en.dir), en.dir, x, y, 6, en.id);
    if (hit < 0) continue;
    let w;
    if (en.age === 0) w = hit <= 1 ? P.gunClose : hit <= 3 ? P.gunMid : P.gunFar;
    else w = hit <= 3 ? P.gunStale + 3 : P.gunStale;
    if (en.rapid > 0) w *= P.rapidMul;
    risk += w;
  }
  return risk;
}
// 从 (x,y) 朝四个方向中对目标的最大射击价值
function bestShotAt(map, visTanks, x, y, target, selfId) {
  if (!target) return 0;
  let best = 0;
  for (let d = 0; d < 4; d++) {
    const sv = shotValue(map, visTanks, x, y, d, target, selfId);
    if (sv && sv.val > best) best = sv.val;
  }
  return best;
}

// ---------------- 射击评估 ----------------
function predictBox(en, map, tanks, steps, out) {
  let x = en.x, y = en.y;
  const vx = en.vx || 0, vy = en.vy || 0;
  for (let i = 0; i < steps; i++) {
    if (!vx && !vy) break;
    const nx = x + vx, ny = y + vy;
    if (!boxFree(map, nx, ny)) break;
    let blocked = false;
    for (let k = 0; k < tanks.length; k++) {
      if (tanks[k].id === en.id) continue;
      if (ovl({ x: nx, y: ny }, tanks[k])) { blocked = true; break; }
    }
    if (blocked) break;
    x = nx; y = ny;
  }
  out.x = x; out.y = y;
  return out;
}
const TMPBOX = { x: 0, y: 0 };
function shotValue(map, tanks, px, py, dir, en, selfId) {
  if (en.inv > 0) return null;
  const mx = muzzleX(px, dir), my = muzzleY(py, dir);
  if (mx < 0 || my < 0 || mx >= N || my >= N) return null;
  const steps = en.age > 0 ? (en.age < 2 ? en.age : 2) : 0;
  const pred = predictBox(en, map, tanks, steps, TMPBOX);
  let idx = rayHitsBox(map, tanks, mx, my, dir, pred.x, pred.y, 16, selfId);
  let bx = pred.x, by = pred.y;
  if (idx < 0 && (pred.x !== en.x || pred.y !== en.y)) {
    idx = rayHitsBox(map, tanks, mx, my, dir, en.x, en.y, 16, selfId);
    bx = en.x; by = en.y;
  }
  if (idx < 0) return null;
  const hitTick = (idx / 3) | 0;
  const buffered = en.hurt - hitTick > 1;
  const mvKnown = (pred.x !== en.x || pred.y !== en.y);
  let chance = mvKnown ? 0.82 : 0.94;
  if (idx <= 3) {
    let ex, ey;
    if (dir === 0 || dir === 2) { ex = (mx === bx) ? 1 : -1; ey = 0; }
    else { ey = (my === by) ? 1 : -1; ex = 0; }
    if (boxFree(map, bx + ex, by + ey)) chance -= mvKnown ? 0.1 : 0.32;
    if (idx >= 3) {
      if (boxFree(map, bx + DIRS[dir][0], by + DIRS[dir][1])) chance -= mvKnown ? 0.08 : 0.22;
    }
  } else if (idx <= 6) chance *= 0.62;
  else chance *= 0.34;
  if (chance < 0.15) chance = 0.15;
  let val;
  if (buffered) val = 1.5;
  else {
    val = P.hitW;
    if (en.hp === 1) val += P.killW;
    if (en.rapid > 0) val += 4;
    if (en.age > 0) val *= 0.75;
  }
  return { val: val * chance, idx: idx, buffered: buffered };
}

// ---------------- BFS ----------------
function bfsFrom(map, tanks, sx, sy, selfId) {
  DIST.fill(-1); FIRST.fill(-1);
  let head = 0, tail = 0;
  if (!boxFree(map, sx, sy)) return;
  const s = sy * POS + sx;
  DIST[s] = 0; Q[tail++] = s;
  while (head < tail) {
    const id = Q[head++], x = id % POS, y = (id / POS) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx > N-2 || ny > N-2) continue;
      const nid = ny * POS + nx;
      if (DIST[nid] >= 0 || !boxFree(map, nx, ny)) continue;
      let blocked = false;
      for (let k = 0; k < tanks.length; k++) {
        if (tanks[k].id !== selfId && ovl({ x: nx, y: ny }, tanks[k])) { blocked = true; break; }
      }
      if (blocked) continue;
      DIST[nid] = DIST[id] + 1;
      FIRST[nid] = id === s ? d : FIRST[id];
      Q[tail++] = nid;
    }
  }
}
let DIST_R = new Int16Array(COUNT);
let QR = new Int16Array(COUNT);
// 多源 BFS：到 ring 矩形内的步数
function bfsRing(map, tanks, min, max, selfId, out) {
  out.fill(-1);
  let head = 0, tail = 0;
  for (let y = min; y <= max - 1; y++) {
    for (let x = min; x <= max - 1; x++) {
      if (x < 0 || y < 0 || x > N-2 || y > N-2) continue;
      if (!boxFree(map, x, y)) continue;
      const id = y * POS + x;
      if (out[id] >= 0) continue;
      let blocked = false;
      for (let k = 0; k < tanks.length; k++) {
        if (tanks[k].id !== selfId && ovl({ x: x, y: y }, tanks[k])) { blocked = true; break; }
      }
      if (blocked) continue;
      out[id] = 0; QR[tail++] = id;
    }
  }
  while (head < tail) {
    const id = QR[head++], x = id % POS, y = (id / POS) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx > N-2 || ny > N-2) continue;
      const nid = ny * POS + nx;
      if (out[nid] >= 0 || !boxFree(map, nx, ny)) continue;
      out[nid] = out[id] + 1;
      QR[tail++] = nid;
    }
  }
}

// ---------------- 主决策 ----------------
function think(st) {
  const T = st.tick, me = st.self, map = st.map, zone = st.arena.safeZone, arena = st.arena;
  const gap = T - M.tick;

  if (T === 0 || gap < 0 || gap > 1) {
    M.shots = []; M.eb = []; M.trail = []; M.goal = null; M.target = '';
    M.stuck = 0; M.last = { x: -1, y: -1 }; M.lastMove = -1; M.goalUntil = 0;
  }
  if (T === 0 || gap < 0 || gap > 45 || me.lives > M.lives) { M.seen = {}; M.lastFire = {}; M.visTick = {}; }
  M.tick = T; M.lives = me.lives;

  const pulse = !!arena.radarPulse;
  const vis = st.radar.tanks || [];
  const rbul = st.radar.bullets || [];
  const oppRows = {};
  for (let i = 0; i < st.opponents.length; i++) oppRows[st.opponents[i].id] = st.opponents[i];

  // 1) 目击与暴露推断
  for (let i = 0; i < vis.length; i++) {
    const e = vis[i];
    const p = M.seen[e.id];
    let vx = 0, vy = 0;
    if (p) {
      const dt = T - p.tick, dx = e.x - p.x, dy = e.y - p.y;
      if (dt > 0 && dt <= 3 && ab(dx) <= dt && ab(dy) <= dt && ab(dx) + ab(dy) <= dt && (dx !== 0 || dy !== 0)) {
        vx = dx > 0 ? 1 : -1; vy = dy > 0 ? 1 : -1;
      } else { vx = p.vx || 0; vy = p.vy || 0; }
    }
    const dc = cheb(me.x, me.y, e.x, e.y);
    const exposed = !pulse && (dc > 6 || (touchGrass(map, e.x, e.y) && dc > 2));
    const lastVis = M.visTick[e.id];
    if (exposed && (lastVis === undefined || T - lastVis > 1)) M.lastFire[e.id] = T - 1;
    M.visTick[e.id] = T;
    M.seen[e.id] = { x: e.x, y: e.y, dir: e.dir, hp: e.hp, hurt: e.hurtTicks, inv: e.invincibleTicks, rapid: e.rapidTicks, tick: T, vx: vx, vy: vy, deaths: p ? p.deaths : undefined };
  }
  for (let i = 0; i < st.scoreboard.length; i++) {
    const id = st.scoreboard[i].id;
    if (id === me.id) continue;
    const row = st.scoreboard.find(function (r) { return r.id === id; });
    if (!row || row.lives <= 0) { delete M.seen[id]; delete M.lastFire[id]; delete M.visTick[id]; continue; }
    const p = M.seen[id];
    if (p && p.deaths !== undefined && row.deaths !== p.deaths) delete M.seen[id];
    if (p) p.deaths = row.deaths;
  }
  delete M.seen[me.id];

  // 2) 对手集合
  const E = [];
  const visIds = {};
  for (let i = 0; i < vis.length; i++) {
    const e = vis[i];
    visIds[e.id] = 1;
    E.push({ id: e.id, x: e.x, y: e.y, dir: e.dir, hp: e.hp, hurt: e.hurtTicks, inv: e.invincibleTicks, rapid: e.rapidTicks, age: 0, vx: 0, vy: 0 });
  }
  for (let i = 0; i < st.scoreboard.length; i++) {
    const id = st.scoreboard[i].id;
    if (id === me.id || visIds[id]) continue;
    if (!oppRows[id] || oppRows[id].lives <= 0) continue;
    const p = M.seen[id];
    if (!p) continue;
    const age = T - p.tick;
    if (age > 5) continue;
    E.push({
      id: id, x: p.x, y: p.y, dir: p.dir, hp: p.hp,
      hurt: p.hurt - age > 0 ? p.hurt - age : 0,
      inv: p.inv - age > 0 ? p.inv - age : 0,
      rapid: p.rapid - age > 0 ? p.rapid - age : 0,
      age: age, vx: p.vx || 0, vy: p.vy || 0,
    });
  }
  const visTanks = [];
  for (let i = 0; i < vis.length; i++) visTanks.push({ id: vis[i].id, x: vis[i].x, y: vis[i].y });

  // 3) 弹道跟踪
  for (let i = 0; i < M.shots.length; i++) {
    const s = M.shots[i];
    if (s.dead) continue;
    if (cheb(s.x, s.y, me.x, me.y) <= 6) {
      let found = false;
      for (let k = 0; k < rbul.length; k++) if (rbul[k].x === s.x && rbul[k].y === s.y) { found = true; break; }
      if (!found) s.dead = true;
    }
    if (s.age > 5) s.dead = true;
  }
  for (let k = 0; k < rbul.length; k++) {
    const b = rbul[k];
    let known = false;
    for (let i = 0; i < M.shots.length; i++) {
      if (!M.shots[i].dead && M.shots[i].x === b.x && M.shots[i].y === b.y) { known = true; break; }
    }
    if (!known) for (let i = 0; i < M.eb.length; i++) {
      if (!M.eb[i].dead && M.eb[i].x === b.x && M.eb[i].y === b.y) { known = true; break; }
    }
    if (!known) M.eb.push({ x: b.x, y: b.y, dir: b.dir, age: 0 });
  }
  for (let i = 0; i < M.shots.length; i++) {
    const s = M.shots[i];
    if (s.dead) continue;
    const a = advance(map, s.x, s.y, s.dir, 3);
    s.x = a.x; s.y = a.y; s.age++;
    if (!a.alive) s.dead = true;
  }
  for (let i = 0; i < M.eb.length; i++) {
    const t = M.eb[i];
    if (t.dead) continue;
    const a = advance(map, t.x, t.y, t.dir, 3);
    t.x = a.x; t.y = a.y; t.age++;
    if (!a.alive || t.age > 4 || cheb(t.x, t.y, me.x, me.y) > 8) t.dead = true;
  }
  M.shots = M.shots.filter(function (s) { return !s.dead; });
  M.eb = M.eb.filter(function (s) { return !s.dead; });
  if (M.shots.length > 4) M.shots.shift();
  if (M.eb.length > 6) M.eb.shift();

  // 4) 形势
  const myRow = st.scoreboard.find(function (r) { return r.id === me.id; });
  const myPts = myRow ? myRow.points : 0;
  let leadPts = -1, aliveCount = 0;
  for (let i = 0; i < st.opponents.length; i++) {
    const o = st.opponents[i];
    if (o.lives > 0) { aliveCount++; if (o.points > leadPts) leadPts = o.points; }
  }
  const late = T >= 430;
  const behind = myPts < leadPts;
  const fragile = me.hp === 1 && me.invincibleTicks === 0;
  const lastLife = me.lives === 1;

  // 5) 目标选择（带稳定性）
  let target = null, targetPred = null;
  let bestT = null, bestS = -1e9;
  for (let i = 0; i < E.length; i++) {
    const en = E[i];
    if (en.age > 3) continue;
    const d = cheb(me.x, me.y, en.x, en.y);
    let s = 30 - d * 1.4;
    if (en.hp === 1) s += 12;
    if (en.hurt > 1) s -= 10;
    if (en.inv > 0) s -= 16;
    if (en.rapid > 0) s += 4;
    const row = oppRows[en.id];
    if (row && leadPts > 0 && row.points >= leadPts) s += 4;
    if (en.age > 0) s -= 8;
    if (en.id === M.target) s += 5;
    if (s > bestS) { bestS = s; bestT = en; }
  }
  if (fragile) bestT = null;
  if (bestT && bestS > 6) M.target = bestT.id; else M.target = '';
  if (bestT && bestT.age <= 2) {
    target = bestT;
    const steps = bestT.age < 2 ? bestT.age : 2;
    targetPred = predictBox(bestT, map, visTanks, steps, { x: 0, y: 0 });
    if (targetPred.x === bestT.x && targetPred.y === bestT.y) targetPred = null;
  }

  // 6) 网格
  GB.fill(0); GG.fill(0); GF.fill(0); GL.fill(0); GO.fill(0);
  for (let i = 0; i < M.eb.length; i++) markSpan(map, M.eb[i].x, M.eb[i].y, M.eb[i].dir);
  for (let i = 0; i < M.shots.length; i++) if (M.shots[i].age >= 3) markSpan(map, M.shots[i].x, M.shots[i].y, M.shots[i].dir);
  for (let i = 0; i < E.length; i++) {
    const en = E[i];
    if (en.age > 3) continue;
    const mz = muzzleX(en.x, en.dir), my2 = muzzleY(en.y, en.dir);
    if (en.age === 0) { markRay(GG, map, mz, my2, en.dir, 4, 1); markRay(GF, map, mz, my2, en.dir, 14, 1); }
    else markRay(GF, map, mz, my2, en.dir, 10, 1);
    if (en.age <= 2) markRay(GL, map, mz, my2, en.dir, 14, 1 << i);
  }
  // 进攻位：我方能从该格打到目标的哪些行/列
  if (target) {
    for (let d = 0; d < 4; d++) {
      markRay(GO, map, muzzleX(target.x, d), muzzleY(target.y, d), d, 16, 1);
      markRay(GO, map, muzzleX(target.x, d), muzzleY(target.y + 1, d), d, 16, 1);
    }
    if (targetPred) {
      for (let d = 0; d < 4; d++) {
        markRay(GO, map, muzzleX(targetPred.x, d), muzzleY(targetPred.y, d), d, 16, 1);
        markRay(GO, map, muzzleX(targetPred.x, d), muzzleY(targetPred.y + 1, d), d, 16, 1);
      }
    }
  }

  // 7) 补给
  const sup = arena.supply;
  let supBox = null, supVal = 0;
  if (sup && sup.expireTick - T > 0) {
    const want = sup.type === 'repair' ? (me.hp < me.maxHp ? 1 : 0) : 1;
    if (want > 0) {
      const soon = sup.available ? 0 : (sup.appearTick - T > 0 ? sup.appearTick - T : 0);
      const timeOK = soon <= cheb(me.x, me.y, sup.x, sup.y) + 3;
      const gain = sup.type === 'repair' ? (me.hp === 1 ? 16 : 5) : (me.rapidTicks > 0 ? 3 : 12);
      supVal = gain * (timeOK ? 1 : 0.4) * (sup.expireTick - T > 14 ? 1 : 0.5);
      supBox = sup;
    }
  }

  // 8) 边界与 BFS
  const shrinkIn = zone.nextShrinkTick === null ? 9999 : zone.nextShrinkTick - T;
  const nextRing = { min: zone.nextMin, max: zone.nextMax ?? N-1-zone.nextMin };
  const inNext = inZone(me.x, me.y, nextRing);
  const distNext = (shrinkIn < 60) ? (bfsRing(map, visTanks, nextRing.min, nextRing.max, me.id, DIST_R), DIST_R) : null;
  bfsFrom(map, visTanks, me.x, me.y, me.id);

  const hpScale = fragile ? P.hp1Danger : 1;
  const conserve = late && !behind && me.hp >= 2 && me.lives >= 2;

  // 9) 目标格（committed goal）
  const needNew = !M.goal || T >= M.goalUntil
    || (M.goal.x === me.x && M.goal.y === me.y)
    || !boxFree(map, M.goal.x, M.goal.y)
    || visTanks.some(function (e) { return ovl(M.goal, e); })
    || zoneOut(me.x, me.y, zone) > 0;
  if (needNew) {
    M.goal = chooseGoal(st, map, visTanks, E, me, zone, nextRing, inNext, shrinkIn, distNext, target, supBox, supVal, fragile, late, behind, conserve, myPts, leadPts, aliveCount);
    M.goalUntil = T + 5;
  }
  const goal = M.goal;

  // 10) 先算出「朝哪个方向能打到目标」，让走位顺便完成转向
  let aimDir = -1;
  if (target) {
    let best = 0;
    for (let d = 0; d < 4; d++) {
      const sv = shotValue(map, visTanks, me.x, me.y, d, target, me.id);
      if (sv && !sv.buffered && sv.val > best) { best = sv.val; aimDir = d; }
    }
    if (best < 4) aimDir = -1;
  }

  // 11) 本拍动作
  const local = pickMove(st, map, visTanks, E, me, goal, zone, nextRing, inNext, shrinkIn, hpScale, target, supBox, supVal, fragile, lastLife, aimDir);
  const move = local.move;

  // 12) 开火：只要期望伤害为正且不为此送命，就把弹打出去。
  // 本拍只能沿行动前朝向开火，所以这里只认当前方向能否命中。
  let fire = false, shotTarget = null, shotBest = 0;
  if (me.fireCooldown === 0) {
    let curVal = 0;
    for (let i = 0; i < E.length; i++) {
      const en = E[i];
      if (en.age > 3) continue;
      const sv = shotValue(map, visTanks, me.x, me.y, me.dir, en, me.id);
      if (!sv || sv.buffered) continue;
      let v = sv.val;
      if (fragile && en.age === 0 && en.hp >= 2) {
        if (rayHitsBox(map, visTanks, muzzleX(en.x, en.dir), muzzleY(en.y, en.dir), en.dir, me.x, me.y, 4, en.id) >= 0) v -= 6;
      }
      if (v > curVal) { curVal = v; shotTarget = en; }
    }
    if (curVal >= P.fireGate) fire = true;
    // 领先且安全时不为小伤害暴露自己
    if (fire && conserve && shotTarget && shotTarget.hp >= 2 && curVal < 12) fire = false;
    // 出圈撤离时不做无谓开火
    if (fire && zoneOut(me.x, me.y, zone) > 0) fire = false;
    // 残甲：除非能击毁或换命，否则不接对射
    if (fire && fragile && curVal < 22 && me.lives > 1) fire = false;
  }
  // 拆砖：只在砖墙确实挡在目标方向或计划方向时
  if (!fire && me.fireCooldown === 0 && zoneOut(me.x, me.y, zone) === 0) {
    const mz = muzzleX(me.x, me.dir), my2 = muzzleY(me.y, me.dir);
    if (mz >= 0 && my2 >= 0 && mz < N && my2 < N && map[my2][mz] === 1) {
      let want = false;
      if (target && brickOnLine(map, me.x, me.y, target)) want = true;
      if (!want && goal && brickOnLine(map, me.x, me.y, goal)) want = true;
      if (want) fire = true;
    }
  }

  // 12) 自报与记录
  let intent = local.why || 'advance';
  if (fire && shotTarget) intent = shotTarget.hp === 1 ? 'pursue' : 'flank';
  else if (local.why) intent = local.why;
  else if (M.goalWhy === 'escape') intent = 'retreat';
  else if (M.goalWhy === 'ring' || M.goalWhy === 'retreat') intent = 'retreat';
  else if (M.goalWhy === 'resupply') intent = 'resupply';
  else if (target) intent = 'pursue';
  else if (move === 'stay') intent = 'hold';

  M.trail.push({ x: me.x, y: me.y });
  if (M.trail.length > 10) M.trail.shift();
  if (me.x === M.last.x && me.y === M.last.y) M.stuck++; else M.stuck = 0;
  M.last = { x: me.x, y: me.y };
  M.lastMove = MOVES.indexOf(move);

  if (fire) {
    const mz = muzzleX(me.x, me.dir), my2 = muzzleY(me.y, me.dir);
    const a = advance(map, mz, my2, me.dir, 3);
    M.shots.push({ x: a.x, y: a.y, dir: me.dir, age: 0, dead: !a.alive });
  }
  return { move: move, fire: fire, intent: intent };
}

// ---------------- 目标格选择 ----------------
function chooseGoal(st, map, visTanks, E, me, zone, nextRing, inNext, shrinkIn, distNext, target, supBox, supVal, fragile, late, behind, conserve, myPts, leadPts, aliveCount) {
  const T = st.tick, pulse = st.arena.radarPulse;
  const outZone = zoneOut(me.x, me.y, zone);
  let bestX = -1, bestY = -1, bestScore = -1e9, why = 'advance';

  // 可达性：若当前在圈外，允许自己走到圈内；其余情况只考虑自由格
  const distMe = DIST;
  if (!boxFree(map, me.x, me.y)) return null;

  for (let y = 0; y < POS; y++) {
    for (let x = 0; x < POS; x++) {
      const d = distMe[y * POS + x];
      if (d < 0 || d > 20) continue;
      if (visTanks.some(function (e) { return ovl({ x: x, y: y }, e); })) continue;
      const cell = { x: x, y: y };
      let sc = -d * P.distW;

      // 圈层纪律：出当前圈是绝对禁忌
      const oz = zoneOut(x, y, zone);
      sc -= oz * P.zoneW;
      // 下一条边界
      if (distNext) {
        const dn = distNext[y * POS + x];
        if (dn >= 0) {
          const lateCells = dn - (shrinkIn - 1);
          if (lateCells > 0) sc -= lateCells * lateCells * P.ringW;
        } else sc -= 60;
      }

      // 弹道与枪口
      const r0 = y * N, r1 = (y + 1) * N;
      let b = GB[r0 + x];
      const b2 = GB[r0 + x + 1]; if (b2 > b) b = b2;
      const b3 = GB[r1 + x]; if (b3 > b) b = b3;
      const b4 = GB[r1 + x + 1]; if (b4 > b) b = b4;
      if (b === 1) sc -= P.bulletNext; else if (b === 2) sc -= P.bulletNow;
      const gunRisk = gunRiskAt(map, visTanks, E, x, y);
      if (gunRisk > 0) {
        sc -= gunRisk * (fragile ? 1.7 : 1);
        // 站在别人的枪口下却打不到他：这是最亏的姿势
        if (target && bestShotAt(map, visTanks, x, y, target, me.id) <= 0) sc -= P.nakedW * (fragile ? 1.4 : 1);
      } else if (GF[r0 + x] || GF[r0 + x + 1] || GF[r1 + x] || GF[r1 + x + 1]) sc -= P.facingW;
      const laneBits = (GL[r0 + x] | GL[r0 + x + 1] | GL[r1 + x] | GL[r1 + x + 1]) & 7;
      const lc = BITCOUNT[laneBits];
      if (lc > 1) sc -= (lc - 1) * P.laneW * (fragile ? 1.6 : 1);

      if (touchGrass(map, x, y) && !pulse && T < 500) sc += P.grassW;
      let wall = 0;
      if (!boxFree(map, x - 1, y)) wall++;
      if (!boxFree(map, x + 1, y)) wall++;
      if (!boxFree(map, x, y - 1)) wall++;
      if (!boxFree(map, x, y + 1)) wall++;
      sc += (wall > 2 ? 2 : wall) * 0.9;

      // 补给
      if (supBox) {
        const arrive = T + d;
        const ok = arrive >= supBox.appearTick - 2 && arrive <= supBox.expireTick - 2;
        const sd = cheb(x, y, supBox.x, supBox.y);
        sc += (ok ? P.supplyW * supVal : 0) - sd * 0.2;
        if (ok && sd <= 1) sc += supVal * 0.8;
      }
      // 进攻位
      if (target) {
        if (GO[r0 + x] || GO[r0 + x + 1] || GO[r1 + x] || GO[r1 + x + 1]) sc += P.offBonus;
        const td = cheb(x, y, target.x, target.y);
        if (td > 9) sc -= (td - 9) * 1.3;
        else if (td < 3) sc -= (3 - td) * 5;
        else if (td <= 7) sc += 1.5;
      }
      if (P.rangeW > 0) {
        for (let i = 0; i < E.length; i++) {
          if (E[i].age > 2) continue;
          const d2 = cheb(x, y, E[i].x, E[i].y);
          if (d2 < P.minRange) sc -= (P.minRange - d2) * P.rangeW;
        }
      }
      for (let i = 0; i < M.trail.length; i++) {
        if (M.trail[i].x === x && M.trail[i].y === y) sc -= P.trailW * (i === M.trail.length - 1 ? 4 : 1);
      }
      if (sc > bestScore) { bestScore = sc; bestX = x; bestY = y; }
    }
  }
  if (bestX < 0) return null;

  if (outZone > 0) why = 'escape';
  else if (distNext && !inNext && shrinkIn <= 20) why = 'ring';
  else if (supBox && supVal > 7) why = 'resupply';
  else if (target) why = 'pursue';
  else if (fragile) why = 'retreat';
  M.goalWhy = why;
  return { x: bestX, y: bestY };
}

// ---------------- 本拍动作 ----------------
function pickMove(st, map, visTanks, E, me, goal, zone, nextRing, inNext, shrinkIn, hpScale, target, supBox, supVal, fragile, lastLife, aimDir) {
  const T = st.tick, pulse = st.arena.radarPulse;
  const outZone = zoneOut(me.x, me.y, zone);
  // 到目标格的步数：从目标格反向 BFS，避免撞墙绕路
  let goalDist = null;
  if (goal) { bfsFrom(map, visTanks, goal.x, goal.y, '#'); goalDist = DIST; }

  let bestD = -1, bestVal = -1e9, bestWhy = null;
  for (let d = 0; d < 5; d++) {
    const isStay = d === 4;
    let x = me.x, y = me.y, dirAfter = me.dir;
    if (!isStay) {
      const nx = me.x + DIRS[d][0], ny = me.y + DIRS[d][1];
      if (!boxFree(map, nx, ny)) continue;
      let blocked = false;
      for (let k = 0; k < visTanks.length; k++) if (ovl({ x: nx, y: ny }, visTanks[k])) { blocked = true; break; }
      if (blocked) continue;
      x = nx; y = ny; dirAfter = d;
    }
    let sc = 0;
    const r0 = y * N, r1 = (y + 1) * N;

    // 弹道
    let b = GB[r0 + x];
    const b2 = GB[r0 + x + 1]; if (b2 > b) b = b2;
    const b3 = GB[r1 + x]; if (b3 > b) b = b3;
    const b4 = GB[r1 + x + 1]; if (b4 > b) b = b4;
    if (b === 2) sc -= P.bulletNow * (hpScale * 0.4 + 0.6);
    else if (b === 1) sc -= P.bulletNext;
    // 枪口威胁：精确射线，近距与速射更致命
    const gunRisk = gunRiskAt(map, visTanks, E, x, y);
    if (gunRisk > 0) {
      sc -= gunRisk * (hpScale * 0.65 + 0.35);
      if (target && bestShotAt(map, visTanks, x, y, target, me.id) <= 0) sc -= P.nakedW * (hpScale * 0.6 + 0.4);
    }

    // 圈：在圈内绝不允许主动走出去；在圈外则奖励靠近
    const oz = zoneOut(x, y, zone);
    if (outZone === 0) { if (oz > 0) sc -= P.zoneW * 1.6; }
    else sc -= oz * P.zoneW * 0.5;

    // 靠近目标格（用 aim 反推，绕墙）
    if (goalDist) {
      const gd = goalDist[y * POS + x];
      if (gd >= 0) sc -= gd * 1.5;
      else sc -= 10;
      if (goal && x === goal.x && y === goal.y) sc += 3;
    }
    // 防来回摇摆：惩罚回到上一拍的位置
    if (M.last.x === x && M.last.y === y && M.last.x >= 0 && !isStay) sc -= P.undoW;

    // 瞄准收益：本拍转向后下一拍能开火；或正好朝可射击方向移动
    if (target && target.age <= 2) {
      const sv = shotValue(map, visTanks, x, y, dirAfter, target, me.id);
      if (sv) sc += sv.val * 0.5;
    }
    if (aimDir >= 0 && !isStay && d === aimDir) sc += 3.5;
    if (P.rangeW > 0) {
      for (let i = 0; i < E.length; i++) {
        if (E[i].age > 2) continue;
        const d2 = cheb(x, y, E[i].x, E[i].y);
        if (d2 < P.minRange) sc -= (P.minRange - d2) * P.rangeW * 0.5;
      }
    }
    if (supBox && supVal > 6) {
      const sd = cheb(x, y, supBox.x, supBox.y);
      sc += (sd < 6 ? 6 - sd : 0) * (supVal > 10 ? 0.5 : 0.2);
    }
    if (touchGrass(map, x, y) && !pulse && T < 500) sc += 0.8;
    if (isStay && b === 0 && gunRisk === 0) sc += 0.6;
    if (M.stuck >= 2) sc += ((st.random >>> ((d * 7) % 24)) & 31) * 0.06;
    if (sc > bestVal) { bestVal = sc; bestD = d; }
  }

  if (bestD < 0) return { move: 'stay', why: fragile ? 'retreat' : 'hold' };
  let why = null;
  if (outZone > 0) why = 'retreat';
  else if (fragile && me.lives > 1) why = 'retreat';
  return { move: MOVES[bestD], why: why };
}

function fallback(st) {
  try {
    const me = st.self, map = st.map, zone = st.arena.safeZone;
    const vis = st.radar.tanks || [];
    let bd = -1, bestScore = -1e9;
    for (let d = 0; d < 4; d++) {
      const nx = me.x + DIRS[d][0], ny = me.y + DIRS[d][1];
      if (!boxFree(map, nx, ny)) continue;
      let blocked = false;
      for (let i = 0; i < vis.length; i++) if (ovl({ x: nx, y: ny }, vis[i])) { blocked = true; break; }
      if (blocked) continue;
      let sc = 0;
      if (zoneOut(nx, ny, zone) > 0) sc -= 100;
      const out = zoneOut(nx, ny, zone);
      if (out > 0) sc -= out * 10;
      if (sc > bestScore) { bestScore = sc; bd = d; }
    }
    if (bd >= 0 && bestScore > -50) return { move: MOVES[bd], fire: false, intent: 'retreat' };
  } catch (e) { /* 保底 */ }
  return SAFE_ACTION;
}

function decide(state) {
  if(state&&state.map){const n=state.map.length;if(n!==N){N=n;POS=n-1;CELL=n*n;COUNT=POS*POS;GB=new Uint8Array(CELL);GG=new Uint8Array(CELL);GF=new Uint8Array(CELL);GL=new Uint8Array(CELL);GO=new Uint8Array(CELL);DIST=new Int16Array(COUNT);FIRST=new Int8Array(COUNT);Q=new Int16Array(COUNT);DIST_R=new Int16Array(COUNT);QR=new Int16Array(COUNT);M.tick=-1;M.seen={};M.lastFire={};M.visTick={};M.shots=[];M.eb=[];M.trail=[];M.goal=null;M.target='';}}
  try {
    return think(state);
  } catch (err) {
    return fallback(state);
  }
}
