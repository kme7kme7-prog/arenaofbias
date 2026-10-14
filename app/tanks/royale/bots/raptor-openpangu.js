// =====================================================================
// 猛禽 Raptor · 四人坦克乱斗 2.6
//
// 主线：机会收割 + 缩圈先手。平时贴安全区内缘的掩体锚点观察，
// 让其他人先交火；用弹道可达性 + 节奏窗口找稳中的一枪，
// 优先收残血车（击毁 +2）；缩圈前提前站进下一圈；
// 残局按比分与生命决定冒险收割或保守收官。
//
// 实现完全独立：仅依据规则文档与引擎合同（brawl.js/sim.js/常量表）
// 从零编写，未阅读任何内置示例 bot 或其他参赛者的源码。
// 只使用合法 state 与自身历史；顶层记忆只在本地这一场内保留。
// =====================================================================

let N = 26, P = 25, ACTIVE = null, ACTIVE_TICK = 0;
const DV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DN = ['up', 'right', 'down', 'left'];
const ZONE_SHRINK = 200, ZONE_STEP = 50, ZONE_MAX = 9;
const EVADE_H = 5;
const STUCK_LIMIT = 5;
const ANCHOR_EVERY = 6;

// ------------------------- 每场记忆 -------------------------
let M = null;
function freshM() {
  return {
    gridSize: N, last: -1, lives: 3,
    seen: Object.create(null),
    plan: -1, stuck: 0, lx: -1, ly: -1,
    tgt: null, tgtTick: -99,
    anchor: null, anchorTick: -99,
    retreatUntil: -1, prevHp: 2,
    shotTick: Object.create(null),
  };
}

// ------------------------- 区与格 -------------------------
function zoneAt(t) {
  const z=ACTIVE&&ACTIVE.arena.safeZone,q=ACTIVE&&ACTIVE.arena.zoneSchedule;
  if(!z){const m=t<ZONE_SHRINK?0:Math.min(ZONE_MAX,2+Math.floor((t-ZONE_SHRINK)/ZONE_STEP));return {min:m,max:N-1-m};}
  let m=z.min;if(t>ACTIVE_TICK&&q&&z.nextShrinkTick!==null&&t>=z.nextShrinkTick){const steps=Math.floor((t-z.nextShrinkTick)/q.stepTicks)+1;m=Math.min(N-1,z.nextMin+(steps-1)*q.stepSize);}
  return {min:m,max:N-1-m};
}
function marginAt(t) { return zoneAt(t).min; }
function inZone(x, y, z) { return x >= z.min && y >= z.min && x + 1 <= z.max && y + 1 <= z.max; }
function bodyFits(x, y) { return x >= 0 && y >= 0 && x <= N - 2 && y <= N - 2; }
function cellPass(map, x, y) { if (x < 0 || y < 0 || x >= N || y >= N) return false; const t = map[y][x]; return t === 0 || t === 4; }
function bodyPass(map, x, y) { return cellPass(map, x, y) && cellPass(map, x + 1, y) && cellPass(map, x, y + 1) && cellPass(map, x + 1, y + 1); }
function muzzle(x, y, d) {
  if (d === 0) return { x: x, y: y - 1 };
  if (d === 1) return { x: x + 2, y: y };
  if (d === 2) return { x: x, y: y + 2 };
  return { x: x - 1, y: y };
}
function cheb(ax, ay, bx, by) { const dx = ax - bx < 0 ? bx - ax : ax - bx, dy = ay - by < 0 ? by - ay : ay - by; return dx > dy ? dx : dy; }

// ------------------------- 弹道 -------------------------
function laneFor(map, mx, my, d, maxT) {
  const cells = [];
  if (mx < 0 || my < 0 || mx >= N || my >= N) return { cells };
  cells.push({ x: mx, y: my });
  const t0 = map[my][mx];
  if (t0 === 2 || t0 === 1) return { cells };
  let cx = mx, cy = my;
  for (let i = 1; i <= 3 * maxT; i++) {
    cx += DV[d][0]; cy += DV[d][1];
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return { cells };
    const t = map[cy][cx];
    cells.push({ x: cx, y: cy });
    if (t === 2 || t === 1) return { cells };
  }
  return { cells };
}
function laneForb(lane, maxTau) {
  const forb = [[]];
  for (let tau = 1; tau <= maxTau; tau++) {
    const arr = [];
    const lo = 3 * (tau - 1), hi = Math.min(3 * tau, lane.cells.length - 1);
    for (let i = lo; i <= hi; i++) arr.push(lane.cells[i]);
    forb.push(arr);
  }
  return forb;
}
function bodyTouchesGrid(px, py, grid) {
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const cx = px + dx, cy = py + dy;
    if (cx >= 0 && cy >= 0 && cx < N && cy < N && grid[cy * N + cx]) return true;
  }
  return false;
}
function listToGrid(list) {
  const g = new Uint8Array(N * N);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.x >= 0 && c.y >= 0 && c.x < N && c.y < N) g[c.y * N + c.x] = 1;
  }
  return g;
}

// ------------------------- 躲避求解 -------------------------
function solveEvade(sx, sy, H, forbs, staticGrid, map) {
  const grids = [];
  for (let i = 0; i < forbs.length; i++) grids.push(listToGrid(forbs[i]));
  const key = (x, y) => x + y * P;
  let layer = new Map(); layer.set(key(sx, sy), -2);
  const reach = Object.create(null);
  for (let tau = 1; tau <= H; tau++) {
    const fb = grids[Math.min(tau, grids.length - 1)];
    const next = new Map();
    layer.forEach(function (fd, pk) {
      const px = pk % P, py = (pk - px) / P;
      for (let d = -1; d < 4; d++) {
        let nx = px, ny = py;
        if (d >= 0) {
          nx += DV[d][0]; ny += DV[d][1];
          if (!bodyFits(nx, ny) || !bodyPass(map, nx, ny)) continue;
          if (staticGrid && bodyTouchesGrid(nx, ny, staticGrid)) continue;
        }
        if (bodyTouchesGrid(nx, ny, fb)) continue;
        const nk = key(nx, ny);
        if (!next.has(nk)) next.set(nk, fd === -2 ? d : fd);
      }
    });
    if (next.size === 0) return { alive: false, reach: reach };
    layer = next;
    layer.forEach(function (fd) {
      const k = String(fd);
      if (!(k in reach) || reach[k] < tau) reach[k] = tau;
    });
  }
  return { alive: true, reach: reach };
}

// ------------------------- 距离场 -------------------------
function distField(goals, map, staticGrid) {
  const dist = new Int16Array(N * N).fill(-1);
  let frontier = [];
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    if (!bodyPass(map, g.x, g.y)) continue;
    if (staticGrid && bodyTouchesGrid(g.x, g.y, staticGrid)) continue;
    const k = g.x + g.y * P;
    if (dist[k] < 0) { dist[k] = 0; frontier.push(g); }
  }
  while (frontier.length) {
    const nxt = [];
    for (let i = 0; i < frontier.length; i++) {
      const v = frontier[i];
      const dv = dist[v.x + v.y * P];
      for (let d = 0; d < 4; d++) {
        const wx = v.x - DV[d][0], wy = v.y - DV[d][1];
        if (!bodyFits(wx, wy) || !bodyPass(map, wx, wy)) continue;
        if (staticGrid && bodyTouchesGrid(wx, wy, staticGrid)) continue;
        const wk = wx + wy * P;
        if (dist[wk] >= 0) continue;
        dist[wk] = dv + 1;
        nxt.push({ x: wx, y: wy });
      }
    }
    frontier = nxt;
  }
  return dist;
}
function stepToward(dist, x, y, map, staticGrid, pen) {
  const cur = dist[x + y * P];
  let bestD = -1, bestS = cur >= 0 ? cur * 16 + 8 : 1e9;
  for (let d = 0; d < 4; d++) {
    const nx = x + DV[d][0], ny = y + DV[d][1];
    if (!bodyFits(nx, ny) || !bodyPass(map, nx, ny)) continue;
    if (staticGrid && bodyTouchesGrid(nx, ny, staticGrid)) continue;
    const dd = dist[nx + ny * P];
    if (dd < 0) continue;
    const s = dd * 16 + (pen ? (pen[nx + ny * P] || 0) : 0);
    if (s < bestS) { bestS = s; bestD = d; }
  }
  return bestD;
}

// ------------------------- 感知 -------------------------
function updateSeen(state) {
  const list = (state.radar && state.radar.tanks) || [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    M.seen[e.id] = { x: e.x, y: e.y, d: e.dir, tick: state.tick, hp: e.hp, inv: e.invincibleTicks, hurt: e.hurtTicks, rapid: e.rapidTicks };
  }
}
function buildThreats(map, bullets) {
  const out = [];
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    const lane = laneFor(map, b.x, b.y, b.dir, EVADE_H);
    if (lane.cells.length <= 1) continue;
    out.push({ lane: lane, forb: laneForb(lane, EVADE_H) });
  }
  return out;
}
function buildStatic(state) {
  const g = new Uint8Array(N * N);
  const mark = function (x, y) {
    if (!bodyFits(x, y)) return;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) g[(y + dy) * N + (x + dx)] = 1;
  };
  const list = (state.radar && state.radar.tanks) || [];
  for (let i = 0; i < list.length; i++) mark(list[i].x, list[i].y);
  for (const id in M.seen) {
    const s = M.seen[id];
    if (state.tick - s.tick > 4) continue;
    let visible = false;
    for (let i = 0; i < list.length; i++) if (list[i].id === id) { visible = true; break; }
    if (!visible) mark(s.x, s.y);
  }
  return g;
}

// ------------------------- 瞄准 -------------------------
function findShot(state, map, sx, sy, staticGrid, aggr) {
  const res = { d: -1, id: null, grade: -1 };
  const list = (state.radar && state.radar.tanks) || [];
  if (!list.length) return res;
  const myTotal = state.self.hp + 2 * (state.self.lives - 1);
  const cands = list.slice().sort(function (a, b) {
    const va = (2 - a.hp) * 100 - cheb(a.x, a.y, sx, sy) - (a.rapidTicks > 0 ? 10 : 0);
    const vb = (2 - b.hp) * 100 - cheb(b.x, b.y, sx, sy) - (b.rapidTicks > 0 ? 10 : 0);
    return vb - va;
  });
  for (let ci = 0; ci < Math.min(cands.length, 3); ci++) {
    const e = cands[ci];
    if (e.invincibleTicks > 0 || e.hurtTicks >= 2) continue;
    let tgtLives = 3;
    for (let i = 0; i < (state.scoreboard || []).length; i++) {
      if (state.scoreboard[i].id === e.id) tgtLives = state.scoreboard[i].lives;
    }
    const healthOk = aggr || myTotal >= e.hp + 2 * Math.max(0, tgtLives - 1) || state.self.rapidTicks > 20 || (myTotal >= 2 && e.hp === 1);
    // 节奏窗口：刚目击它开火（冷却中）或它近旁正有人缠斗
    const inRhythm = (state.tick - (M.shotTick[e.id] || -99) <= 4) ||
      list.some(function (o) { return o.id !== e.id && cheb(o.x, o.y, e.x, e.y) <= 7; });
    for (let d = 0; d < 4; d++) {
      const mz = muzzle(sx, sy, d);
      if (mz.x < 0 || mz.y < 0 || mz.x >= N || mz.y >= N) continue;
      const lane = laneFor(map, mz.x, mz.y, d, 7);
      if (lane.cells.length < 3) continue;
      let hitIdx = -1;
      for (let i = 1; i < lane.cells.length; i++) {
        const c = lane.cells[i];
        if ((c.x === e.x || c.x === e.x + 1) && (c.y === e.y || c.y === e.y + 1)) { hitIdx = i; break; }
      }
      if (hitIdx < 0) continue;
      const H = Math.max(1, Math.ceil((lane.cells.length - 1) / 3));
      const forb = laneForb(lane, H);
      // 弹道越近越难躲；远距离目标用简化判定
      const useEvade = hitIdx <= 6;
      const r = useEvade ? solveEvade(e.x, e.y, Math.min(H, 3), forb, staticGrid, map) : { alive: true };
      const hp1 = e.hp <= 1;
      const backshot = e.dir !== (d + 2) % 4;
      if (!r.alive) {
        const grade = hp1 ? 3 : 2;
        if (grade > res.grade) { res.grade = grade; res.d = d; res.id = e.id; }
      } else if (healthOk && hitIdx <= 9 && (inRhythm || backshot || hitIdx <= 7 || aggr || e.hurtTicks === 1 || state.self.rapidTicks > 30)) {
        if (res.grade < 1) { res.grade = 1; res.d = d; res.id = e.id; }
      } else if (healthOk && hp1 && hitIdx <= 14 && !e.invincibleTicks) {
        if (res.grade < 1) { res.grade = 1; res.d = d; res.id = e.id; }
      }
    }
    if (res.grade >= 3) break;
  }
  return res;
}

// ------------------------- 补给 -------------------------
function supplyPlan(state, map, sx, sy, staticGrid) {
  const box = state.arena && state.arena.supply;
  if (!box) return { want: 0, dist: null };
  const t = state.tick;
  if (t + 2 > box.expireTick) return { want: 0, dist: null };
  if (box.type === 'repair' && state.self.hp >= state.self.maxHp) return { want: 0, dist: null };
  const goals = [];
  for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
    const gx = box.x + dx, gy = box.y + dy;
    if (bodyFits(gx, gy)) goals.push({ x: gx, y: gy });
  }
  if (!goals.length) return { want: 0, dist: null };
  const dist = distField(goals, map, staticGrid);
  const eta = dist[sx + sy * P];
  if (eta < 0 || eta + 2 > box.expireTick - t) return { want: 0, dist: null };
  let rival = 1e9;
  const list = (state.radar && state.radar.tanks) || [];
  for (let i = 0; i < list.length; i++) {
    const d = Math.abs(list[i].x - box.x) + Math.abs(list[i].y - box.y);
    if (d < rival) rival = d;
  }
  for (const id in M.seen) {
    const s = M.seen[id];
    if (t - s.tick > 10) continue;
    const d = Math.abs(s.x - box.x) + Math.abs(s.y - box.y);
    if (d < rival) rival = d;
  }
  let want = 0;
  if (box.type === 'repair' && state.self.hp < state.self.maxHp) want = 60 + (state.self.hp === 1 ? 40 : 0);
  else if (box.type === 'rapid' && state.self.rapidTicks <= 40) want = 50;
  if (rival <= eta + 2) {
    if (eta + 2 < rival) want = Math.min(want, 40);
    else if (box.type === 'repair' && state.self.hp === 1 && eta < rival + 4) want = 45;
    else want = 0;
  }
  if (eta > 12) want -= (eta - 12) * 3;
  return { want: want, dist: dist };
}

// ------------------------- 锚点 -------------------------
function pickAnchor(state, map, zone, sx, sy, staticGrid) {
  const t = state.tick;
  const exList = [];
  const list = (state.radar && state.radar.tanks) || [];
  for (let i = 0; i < list.length; i++) exList.push({ x: list[i].x, y: list[i].y });
  for (const id in M.seen) {
    const s = M.seen[id];
    if (t - s.tick <= 20) exList.push({ x: s.x, y: s.y });
  }
  const cx = (zone.min + zone.max) / 2, cy = cx;
  let best = null, bestS = -1e9;
  for (let y = zone.min; y <= zone.max - 1; y++) for (let x = zone.min; x <= zone.max - 1; x++) {
    if (!bodyPass(map, x, y)) continue;
    if (staticGrid && bodyTouchesGrid(x, y, staticGrid) && !(x === sx && y === sy)) continue;
    let s = 0;
    const edge = Math.min(x - zone.min, zone.max - (x + 1), y - zone.min, zone.max - (y + 1));
    s += edge * 5;
    s -= (Math.abs(x + 0.5 - cx) + Math.abs(y + 0.5 - cy)) * 1.5;
    let exits = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DV[d][0], ny = y + DV[d][1];
      if (bodyFits(nx, ny) && bodyPass(map, nx, ny) && !(staticGrid && bodyTouchesGrid(nx, ny, staticGrid))) exits++;
    }
    if (exits >= 3) s += 10; else if (exits === 2) s += 2; else s -= 25;
    let cover = 0;
    for (let i = 0; i < exList.length; i++) {
      const e = exList[i];
      const ddx = e.x - x, ddy = e.y - y;
      if (ddx === 0 && ddy === 0) { s -= 40; continue; }
      if (ddx === 0 || ddy === 0) {
        const len = Math.abs(ddx) + Math.abs(ddy);
        if (len <= 14) {
          let blocked = false;
          const sx2 = Math.sign(ddx), sy2 = Math.sign(ddy);
          let cx2 = x + sx2, cy2 = y + sy2;
          for (let j = 0; j < len; j++, cx2 += sx2, cy2 += sy2) {
            if (map[cy2][cx2] === 1 || map[cy2][cx2] === 2) { blocked = true; break; }
          }
          if (blocked) cover += 8; else s -= 14;
        }
      } else cover += 3;
    }
    s += Math.min(cover, 30);
    let grass = false;
    for (let dy = 0; dy < 2 && !grass; dy++) for (let dx = 0; dx < 2; dx++) {
      const gx = x + dx, gy = y + dy;
      if (gx < N && gy < N && map[gy][gx] === 4) { grass = true; break; }
    }
    if (grass) s += 12;
    if (s > bestS) { bestS = s; best = { x: x, y: y }; }
  }
  return best;
}

// ------------------------- 记分 -------------------------
function leadScore(state) {
  const sb = state.scoreboard || [];
  let mine = null;
  for (let i = 0; i < sb.length; i++) if (sb[i].id === state.self.id) mine = sb[i];
  if (!mine) return 0;
  let worse = 0, alive = 0;
  for (let i = 0; i < sb.length; i++) {
    const r = sb[i];
    if (r.id === mine.id || r.lives <= 0) continue;
    alive++;
    if (r.points > mine.points) worse++;
  }
  return alive ? (worse / alive) * 2 - 1 : 0;
}

// ------------------------- 主逻辑 -------------------------
function think(state) {
  const t = state.tick;
  if (!M || t < M.last) M = freshM();
  M.last = t;
  const self = state.self;
  const map = state.map;
  if (self.lives < M.lives) {
    M.plan = -1; M.stuck = 0; M.tgt = null; M.anchor = null; M.anchorTick = -99;
    M.retreatUntil = -1; M.prevHp = self.hp;
  }
  M.lives = self.lives;
  if (self.hp < M.prevHp) M.retreatUntil = t + 8;
  if (self.hp > M.prevHp) M.retreatUntil = -1;
  M.prevHp = self.hp;
  const retreating = self.hp === 1 || t < M.retreatUntil;

  const sx = self.x, sy = self.y;
  const zoneNow = zoneAt(t);
  const az = state.arena && state.arena.safeZone;
  let nextShrink = null;
  if (az && az.nextShrinkTick !== null && az.nextShrinkTick !== undefined) nextShrink = az.nextShrinkTick;
  else if (marginAt(t) < ZONE_MAX) nextShrink = t < ZONE_SHRINK ? ZONE_SHRINK : ZONE_SHRINK + (Math.floor((t - ZONE_SHRINK) / ZONE_STEP) + 1) * ZONE_STEP;
  let zoneNext = zoneNow;
  if (nextShrink !== null) zoneNext = zoneAt(nextShrink);
  const shrinkIn = nextShrink !== null ? nextShrink - t : 999;
  const zonePlan = shrinkIn <= 12 ? zoneNext : zoneNow;
  const inNow = inZone(sx, sy, zoneNow);
  const inPlan = inZone(sx, sy, zonePlan);

  updateSeen(state);
  const bullets = (state.radar && state.radar.bullets) || [];
  for (const b of bullets) {
    const list = (state.radar && state.radar.tanks) || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dir !== b.dir) continue;
      const dv = DV[e.dir];
      const along = (b.x - e.x) * dv[0] + (b.y - e.y) * dv[1];
      const cross = Math.abs((b.x - e.x) * dv[1] - (b.y - e.y) * dv[0]);
      if (cross <= 2 && along >= 1 && along <= 10) M.shotTick[e.id] = t;
    }
  }
  const threats = buildThreats(map, bullets);
  const staticGrid = buildStatic(state);

  const canFire = self.fireCooldown === 0;
  const meHurt = self.hurtTicks >= 2;
  const meInv = self.invincibleTicks > 0;

  if (sx === M.lx && sy === M.ly) M.stuck++; else M.stuck = 0;
  M.lx = sx; M.ly = sy;

  const danger1 = [], danger2 = [];
  for (let i = 0; i < threats.length; i++) {
    const f = threats[i].forb;
    for (const c of f[1]) danger1.push(c);
    for (const c of f[Math.min(2, f.length - 1)]) danger2.push(c);
  }
  const g1 = listToGrid(danger1);
  const touchD1 = function (x, y) { return bodyTouchesGrid(x, y, g1); };

  let moveD = -1;
  let intent = 'hold';
  let fire = false;
  let dodging = false;

  // A. 弹道生存
  let evadeReach = null;
  if (threats.length && !meHurt && !meInv) {
    const forbs = [];
    for (let tau = 0; tau <= EVADE_H; tau++) {
      const arr = [];
      for (let i = 0; i < threats.length; i++) {
        const f = threats[i].forb;
        for (const c of f[Math.min(tau, f.length - 1)]) arr.push(c);
      }
      forbs.push(arr);
    }
    const r = solveEvade(sx, sy, EVADE_H, forbs, staticGrid, map);
    evadeReach = r.reach;
  }

  // B. 危险区
  if (!dodging) {
    if (!inNow) {
      const goals = [];
      for (let y = zoneNow.min; y <= zoneNow.max - 1; y++) for (let x = zoneNow.min; x <= zoneNow.max - 1; x++)
        if (bodyPass(map, x, y)) goals.push({ x: x, y: y });
      if (goals.length) {
        const dist = distField(goals, map, staticGrid);
        const pen = new Int16Array(N * N);
        for (const c of danger1) pen[c.y * N + c.x] += 90;
        for (const c of danger2) pen[c.y * N + c.x] += 40;
        const d = stepToward(dist, sx, sy, map, staticGrid, pen);
        if (d >= 0) { moveD = d; intent = 'retreat'; }
      }
    } else if (!inPlan) {
      const goals = [];
      for (let y = zonePlan.min; y <= zonePlan.max - 1; y++) for (let x = zonePlan.min; x <= zonePlan.max - 1; x++)
        if (bodyPass(map, x, y)) goals.push({ x: x, y: y });
      if (goals.length) {
        const dist = distField(goals, map, staticGrid);
        const pen = new Int16Array(N * N);
        for (const c of danger1) pen[c.y * N + c.x] += 90;
        for (const c of danger2) pen[c.y * N + c.x] += 40;
        const d = stepToward(dist, sx, sy, map, staticGrid, pen);
        if (d >= 0) { moveD = d; intent = shrinkIn <= 6 ? 'retreat' : 'advance'; }
      }
    }
  }

  // C. 瞄准与开火
  const aggr = t >= 450 && leadScore(state) >= 0 && self.hp >= 2;
  const shot = canFire ? findShot(state, map, sx, sy, staticGrid, aggr) : { d: -1, id: null, grade: -1 };
  let weakKill = false;
  if (shot.id) {
    const vlist = (state.radar && state.radar.tanks) || [];
    for (let i = 0; i < vlist.length; i++) if (vlist[i].id === shot.id) {
      let lv = 3;
      for (let j = 0; j < (state.scoreboard || []).length; j++) if (state.scoreboard[j].id === shot.id) lv = state.scoreboard[j].lives;
      weakKill = vlist[i].hp <= 1 || lv === 1;
    }
  }
  const wantGrade = retreating && !weakKill ? 3 : 1;
  if (shot.grade >= wantGrade) {
    const pointBlankKill = shot.grade === 3;
    const fireNow = shot.d === self.dir && (!meInv || pointBlankKill);
    if (fireNow && (!dodging || pointBlankKill)) {
      fire = true;
      M.tgt = shot.id; M.tgtTick = t;
      intent = 'pursue';
    } else if (!dodging && canFire) {
      const nx = sx + DV[shot.d][0], ny = sy + DV[shot.d][1];
      const displaces = bodyFits(nx, ny) && bodyPass(map, nx, ny) && !(staticGrid && bodyTouchesGrid(nx, ny, staticGrid));
      const safe = !displaces || (inZone(nx, ny, zonePlan) && !touchD1(nx, ny));
      if (safe) { moveD = shot.d; intent = 'flank'; }
    }
  }

  // D. 补给
  if (!dodging && moveD === -1 && inNow) {
    let foeNear = false;
    const vlist = (state.radar && state.radar.tanks) || [];
    const foeGate = self.hp === 1 ? 3 : 5;
    for (let i = 0; i < vlist.length; i++) if (cheb(vlist[i].x, vlist[i].y, sx, sy) <= foeGate) { foeNear = true; break; }
    if (!foeNear) {
      const sp = supplyPlan(state, map, sx, sy, staticGrid);
      if (sp.want > 0 && sp.dist) {
        const d = stepToward(sp.dist, sx, sy, map, staticGrid, null);
        if (d >= 0) { moveD = d; intent = 'resupply'; }
      }
    }
  }

  // E. 交战走位 / 追击 / 锚点
  if (!dodging && moveD === -1) {
    const list = (state.radar && state.radar.tanks) || [];
    let tgt = null;
    if (list.length) {
      let bestV = -1e9;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        let v = (2 - e.hp) * 30 - cheb(e.x, e.y, sx, sy) * 2 - (e.rapidTicks > 0 ? 15 : 0);
        if (e.id === M.tgt && t - M.tgtTick <= 20) v += 12;
        if (v > bestV) { bestV = v; tgt = e; }
      }
    }
    if (tgt) {
      const myLead = leadScore(state);
      const weak = tgt.hp <= 1;
      const myTotal = self.hp + 2 * (self.lives - 1);
      let tgtLives = 3;
      for (let i = 0; i < (state.scoreboard || []).length; i++)
        if (state.scoreboard[i].id === tgt.id) tgtLives = state.scoreboard[i].lives;
      const tgtTotal = tgt.hp + 2 * Math.max(0, tgtLives - 1);
      const healthOk = myTotal >= tgtTotal;
      let band = retreating ? 10 : self.hp === 1 ? 9 : (healthOk ? 7 : 9);
      if (!healthOk) band = Math.max(band, 9);
      if (t >= 450 && self.hp === 2) band = myLead > 0 ? 4 : 9;
      if (self.rapidTicks > 30 && healthOk) band = Math.min(band, 4);
      const charging = (meHurt || self.hurtTicks === 1) && healthOk && list.filter(function (o) { return cheb(o.x, o.y, sx, sy) <= 6; }).length <= 1;
      const avoidMode = (retreating || self.hp === 1) && !charging;
      if (charging) band = 2;
      const distT = cheb(tgt.x, tgt.y, sx, sy);
      const displace = t - M.lastFireTick <= 3;

      const cornerPenalty = function (qx, qy) {
        const edge = Math.min(qx, qy, N - 2 - qx, N - 2 - qy);
        return edge <= 1 ? -12 : 0;
      };
      const openArea = function (qx, qy) {
        const seen = new Uint8Array(N * N);
        let cnt = 0;
        const stack = [[qx, qy]];
        seen[qy * N + qx] = 1;
        while (stack.length && cnt < 18) {
          const c = stack.pop(); cnt++;
          for (let d = 0; d < 4; d++) {
            const nx = c[0] + DV[d][0], ny = c[1] + DV[d][1];
            if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen[ny * N + nx]) continue;
            if (map[ny][nx] !== 0 && map[ny][nx] !== 4) continue;
            seen[ny * N + nx] = 1; stack.push([nx, ny]);
          }
        }
        return cnt;
      };
      const lanePenalty = function (qx, qy) {
        let p = 0;
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          const ddx = qx - o.x, ddy = qy - o.y;
          if (ddx !== 0 && ddy !== 0) continue;
          const len = Math.abs(ddx) + Math.abs(ddy);
          if (len === 0 || len > 8) continue;
          let blocked = false;
          const sx2 = Math.sign(ddx), sy2 = Math.sign(ddy);
          let cx2 = qx + sx2, cy2 = qy + sy2;
          for (let j = 0; j < len; j++, cx2 += sx2, cy2 += sy2) {
            if (map[cy2][cx2] === 1 || map[cy2][cx2] === 2) { blocked = true; break; }
          }
          if (!blocked) p -= (o.id === tgt.id ? 5 : 9) * (9 - len);
        }
        return p;
      };

      if (moveD === -1) {
        let bestD = -1, bestS = -Math.abs(distT - band) * 8 + lanePenalty(sx, sy);
        for (let d = 0; d < 4; d++) {
          const nx = sx + DV[d][0], ny = sy + DV[d][1];
          if (!bodyFits(nx, ny) || !bodyPass(map, nx, ny)) continue;
          if (staticGrid && bodyTouchesGrid(nx, ny, staticGrid)) continue;
          if (!inZone(nx, ny, zonePlan)) continue;
          if (touchD1(nx, ny)) continue;
          let s = 1;
          const nd = cheb(tgt.x, tgt.y, nx, ny);
          s -= Math.abs(nd - band) * 8;
          const crossNow = Math.min(Math.abs(tgt.x - sx), Math.abs(tgt.y - sy));
          const crossNew = Math.min(Math.abs(tgt.x - nx), Math.abs(tgt.y - ny));
          if (avoidMode) s += (crossNew - crossNow) * 8;
          else {
            s += (crossNow - crossNew) * 6;
            const colAligned = nx === tgt.x || nx === tgt.x + 1;
            const rowAligned = ny === tgt.y || ny === tgt.y + 1;
            if (colAligned && (d === 0 || d === 2)) s += 16;
            else if (rowAligned && (d === 1 || d === 3)) s += 16;
          }
          if (d === M.plan) s += 3;
          if (avoidMode) s -= openArea(nx, ny) < 14 ? 22 : 0;
          s += lanePenalty(nx, ny);
          if (displace && crossNew > crossNow) s += 12;
          if (avoidMode) {
            if (nd > distT) s += 6;
            s += cornerPenalty(nx, ny);
            if (openArea(nx, ny) < 14) s -= 22;
            const ddx = tgt.x - nx, ddy = tgt.y - ny;
            if (ddx !== 0 && ddy !== 0) s += 4;
            else {
              const len = Math.abs(ddx) + Math.abs(ddy);
              if (len > 0) {
                let blocked = false;
                const sx2 = Math.sign(ddx), sy2 = Math.sign(ddy);
                let cx2 = nx + sx2, cy2 = ny + sy2;
                for (let j = 0; j < len; j++, cx2 += sx2, cy2 += sy2) {
                  if (map[cy2][cx2] === 1 || map[cy2][cx2] === 2) { blocked = true; break; }
                }
                if (blocked) s += 10;
              }
            }
            let grass = false;
            for (let gy = ny; gy < ny + 2 && !grass; gy++) for (let gx = nx; gx < nx + 2; gx++) {
              if (gx < N && gy < N && map[gy][gx] === 4) { grass = true; break; }
            }
            if (grass) s += 14;
          }
          if (s > bestS) { bestS = s; bestD = d; }
        }
        if (bestD >= 0) { moveD = bestD; intent = band <= 4 ? 'pursue' : 'flank'; }
        if (distT <= band + 1 && distT >= band - 1 && bestD === -1) intent = retreating ? 'retreat' : 'hold';
      }
      M.tgt = tgt.id; M.tgtTick = t;
    } else {
      let ghost = null;
      if (self.hp === 2 && M.tgt && M.seen[M.tgt] && t - M.seen[M.tgt].tick <= 4) ghost = M.seen[M.tgt];
      if (ghost && cheb(ghost.x, ghost.y, sx, sy) <= 8) {
        const dist = distField([{ x: ghost.x, y: ghost.y }], map, staticGrid);
        const d = dist[sx + sy * P] >= 0 ? stepToward(dist, sx, sy, map, staticGrid, null) : -1;
        if (d >= 0) { moveD = d; intent = 'pursue'; }
      }
      if (moveD === -1) {
        if (!M.anchor || t - M.anchorTick > ANCHOR_EVERY || !inZone(M.anchor.x, M.anchor.y, zonePlan)) {
          M.anchor = pickAnchor(state, map, zonePlan, sx, sy, staticGrid);
          M.anchorTick = t;
        }
        if (M.anchor) {
          if (M.anchor.x === sx && M.anchor.y === sy) intent = 'hold';
          else {
            const dist = distField([M.anchor], map, staticGrid);
            if (dist[sx + sy * P] < 0) { M.anchor = null; }
            else {
              const d = stepToward(dist, sx, sy, map, staticGrid, null);
              if (d >= 0) { moveD = d; intent = 'advance'; }
            }
          }
        }
      }
    }
  }

  // F. 卡住解锁、弹道绑定与终检
  if (M.stuck >= STUCK_LIMIT && moveD === M.plan) {
    for (let k = 0; k < 4; k++) {
      const d = (t + k) % 4;
      const nx = sx + DV[d][0], ny = sy + DV[d][1];
      if (bodyFits(nx, ny) && bodyPass(map, nx, ny) && !(staticGrid && bodyTouchesGrid(nx, ny, staticGrid)) && !touchD1(nx, ny)) { moveD = d; break; }
    }
    M.stuck = 0;
  }
  if (evadeReach !== null) {
    const chosen = String(moveD);
    const reached = evadeReach[chosen] || 0;
    if (reached < EVADE_H) {
      let bd = null, bs = -1;
      for (const kd of ['-1', '0', '1', '2', '3']) {
        const rv = evadeReach[kd] || 0;
        if (rv === 0) continue;
        const sv = rv * 10 + (Number(kd) === M.plan ? 1 : 0);
        if (sv > bs) { bs = sv; bd = Number(kd); }
      }
      if (bd === null) {
        for (const kd of ['-1', '0', '1', '2', '3']) {
          const rv = evadeReach[kd] || 0;
          if (rv > bs) { bs = rv; bd = Number(kd); }
        }
      }
      if (bd !== null) { moveD = bd; dodging = true; intent = 'defend'; }
    }
  }
  if (moveD >= 0) {
    const nx = sx + DV[moveD][0], ny = sy + DV[moveD][1];
    const legal = bodyFits(nx, ny) && bodyPass(map, nx, ny) && !(staticGrid && bodyTouchesGrid(nx, ny, staticGrid));
    if (!legal || (!dodging && touchD1(nx, ny))) moveD = -1;
  }
  M.plan = moveD;
  if (moveD >= 0 && intent === 'hold') intent = 'advance';
  return { move: moveD >= 0 ? DN[moveD] : 'stay', fire: !!fire, intent: intent };
}

function decide(state) {
  if(state&&state.map){N=state.map.length;P=N-1;ACTIVE=state;ACTIVE_TICK=state.tick;if(M&&M.gridSize!==N)M=null;}
  try { return think(state); } catch (e) { return { move: 'stay', fire: false, intent: 'hold' }; }
}
