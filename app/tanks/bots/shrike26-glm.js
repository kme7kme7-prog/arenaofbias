'use strict';
// =====================================================================
// 伯劳 SHRIKE · 四人坦克乱斗 2.6 参赛作品（entries/shrike26/bot.js）
//
// 主线：弹道生存 + 机会收割。
//  - 所有雷达炮弹逐拍外推成禁行格，时间展开搜索求生存走位；
//  - 用发射历史辨认自家炮弹（雷达无弹主），正确执行两枚在场上限，
//    也不把自家弹当成威胁（免疫窗后才计入）；
//  - 从炮弹方向反推「谁刚开火」，抓住冷却窗口打分级好枪：
//    3=必中击毁 2=必中 1=有机会的机会弹；
//  - 开火后向全场暴露 8 拍，火线风险只在对方真能看见我时计入；
//  - 缩圈提前站进下一圈；补给按到达时间与竞争者裁决；
//    终盘（50 秒全场常亮）按比分决定压迫或保守收官。
//
// 借用说明：规则与物理来自引擎源码（brawl.js / sim.js / 雷达过滤）；
// 弹道逐拍禁行、发射历史识别自家弹、补给按竞争距离裁决等公共技巧
// 与允许名单内对手（Jackal / LUNA）的公开思路同源，架构与代码独立编写。
// 只使用合法 state 与自身历史；任何异常回退到合法保底动作。
// =====================================================================

const N = 26;                        // 地图边长（格）
const T = 25;                        // 车身左上角取值 0..24
const DV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const MN = ['up', 'right', 'down', 'left'];
const HORIZON = 5;                   // 弹道外推拍数
const GUN_RANGE = 13;                // 敌方火线分析格数

let MEM = null;
function freshMem() {
  return {
    tick: -1, lives: 3, prevHp: 2,
    seen: Object.create(null),       // id -> {x,y,d,hp,inv,hurt,rapid,t,vx,vy}
    shots: Object.create(null),      // id -> 估计的开火拍
    mine: [],                        // 我方在飞弹 {t,x,y,d}（x,y 为出膛格）
    mineAlive: 0,
    plan: -1, stuck: 0, lx: -1, ly: -1,
    fired: -99, fireD: -1,
    tgt: '', tgtT: -99,
    anchor: null, anchorT: -99,
    retreatUntil: -1,
    seenEnemyT: -99,
    prevLives: Object.create(null),  // id -> 上拍生命（用于检测阵亡）
    deaths: Object.create(null),     // id -> 检测到阵亡的拍
    commit: null,                    // {id, until} 击杀专注窗口
  };
}

// ------------------------- 基础几何 -------------------------
function hash32(n) { n = (n ^ (n >>> 16)) >>> 0; n = Math.imul(n, 0x45d9f3b) >>> 0; return (n ^ (n >>> 16)) >>> 0; }
function cheb(ax, ay, bx, by) { const dx = ax > bx ? ax - bx : bx - ax, dy = ay > by ? ay - by : by - ay; return dx > dy ? dx : dy; }
function manh(ax, ay, bx, by) { const dx = ax > bx ? ax - bx : bx - ax, dy = ay > by ? ay - by : by - ay; return dx + dy; }
function fits(x, y) { return x >= 0 && y >= 0 && x <= T - 1 && y <= T - 1; }
function cellOk(map, x, y) { if (x < 0 || y < 0 || x >= N || y >= N) return false; const c = map[y][x]; return c === 0 || c === 4; }
function bodyOk(map, x, y) { return cellOk(map, x, y) && cellOk(map, x + 1, y) && cellOk(map, x, y + 1) && cellOk(map, x + 1, y + 1); }
function touchesGrass(map, x, y) {
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const gx = x + dx, gy = y + dy;
    if (gx >= 0 && gy >= 0 && gx < N && gy < N && map[gy][gx] === 4) return true;
  }
  return false;
}
function muzzle(x, y, d) { return d === 0 ? { x: x, y: y - 1 } : d === 1 ? { x: x + 2, y: y } : d === 2 ? { x: x, y: y + 2 } : { x: x - 1, y: y }; }
function inZone(x, y, z) { return x >= z.min && y >= z.min && x + 1 <= z.max && y + 1 <= z.max; }
function touchGrid(x, y, g) { const a = y * N + x; return g[a] || g[a + 1] || g[a + N] || g[a + N + 1]; }

// 弹道格序列（含起点，不含被钢/砖/边界挡住的格），元素为 y*N+x。
function lane(map, x, y, d, cap) {
  const cells = [];
  if (x < 0 || y < 0 || x >= N || y >= N) return cells;
  cells.push(y * N + x);
  let cx = x, cy = y;
  for (let i = 0; i < cap; i++) {
    cx += DV[d][0]; cy += DV[d][1];
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) break;
    const c = map[cy][cx];
    if (c === 1 || c === 2) break;
    cells.push(cy * N + cx);
  }
  return cells;
}
// 第 tau 拍结算时炮弹占据的格（tau 从 1 起；fs[tau-1]）。
function laneForbs(cells, H) {
  const fs = [];
  for (let tau = 1; tau <= H; tau++) {
    const lo = 3 * (tau - 1), hi = Math.min(3 * tau, cells.length - 1), arr = [];
    for (let i = lo; i <= hi; i++) arr.push(cells[i]);
    fs.push(arr);
  }
  return fs;
}

// ------------------------- 生存求解 -------------------------
// 时间展开 BFS：每拍可走可停，避开 forbGrids[tau-1] 与 block。
// 返回 reach：首动作(-1 停 / 0..3 走向) -> 能活到的最深拍。
function survive(sx, sy, H, forbGrids, block, map) {
  let layer = new Map(); layer.set(sy * T + sx, -2);
  const reach = Object.create(null);
  for (let tau = 1; tau <= H; tau++) {
    const fg = forbGrids[tau - 1];
    const next = new Map();
    layer.forEach(function (fa, pk) {
      const px = pk % T, py = (pk - px) / T;
      for (let a = -1; a < 4; a++) {
        let nx = px, ny = py;
        if (a >= 0) {
          nx += DV[a][0]; ny += DV[a][1];
          if (!fits(nx, ny) || !bodyOk(map, nx, ny)) continue;
          if (block && touchGrid(nx, ny, block)) continue;
        }
        if (touchGrid(nx, ny, fg)) continue;
        const nk = ny * T + nx;
        if (!next.has(nk)) next.set(nk, fa === -2 ? a : fa);
      }
    });
    if (next.size === 0) return { alive: false, reach: reach };
    layer = next;
    layer.forEach(function (fa) {
      const k = fa + '';
      if (!(k in reach) || reach[k] < tau) reach[k] = tau;
    });
  }
  return { alive: true, reach: reach };
}

// ------------------------- 距离场 -------------------------
function distField(goals, map, block) {
  const dist = new Int16Array(T * T).fill(-1);
  const q = [];
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    if (!fits(g.x, g.y) || !bodyOk(map, g.x, g.y)) continue;
    if (block && touchGrid(g.x, g.y, block)) continue;
    const k = g.y * T + g.x;
    if (dist[k] < 0) { dist[k] = 0; q.push(k); }
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % T, y = (k - x) / T, d = dist[k];
    for (let dd = 0; dd < 4; dd++) {
      const nx = x + DV[dd][0], ny = y + DV[dd][1];
      if (!fits(nx, ny)) continue;
      const nk = ny * T + nx;
      if (dist[nk] >= 0) continue;
      if (!bodyOk(map, nx, ny)) continue;
      if (block && touchGrid(nx, ny, block)) continue;
      dist[nk] = d + 1; q.push(nk);
    }
  }
  return dist;
}

// ------------------------- 复活点蹲守 -------------------------
// 复刻引擎复活规则：当前安全区内距原始出生点曼哈顿距离最近的合法车位。
function predictRespawn(state, map, id) {
  const spawns = { A: { x: 2, y: 22 }, B: { x: 2, y: 2 }, C: { x: 22, y: 2 }, D: { x: 22, y: 22 } };
  const sp = spawns[id];
  const z = state.arena.safeZone;
  let best = null;
  for (let y = z.min; y < z.max; y++) for (let x = z.min; x < z.max; x++) {
    if (!bodyOk(map, x, y)) continue;
    const cost = Math.abs(x - sp.x) + Math.abs(y - sp.y);
    if (!best || cost < best.cost) best = { x: x, y: y, cost: cost };
  }
  return best;
}
// 找一个值得蹲的复活点：阵亡 16..40 拍内、距离可及、附近无敌车蹲守。
function findCamp(state, map, zonePlan, block, radarTanks, opp) {
  const t = state.tick;
  for (let i = 0; i < opp.length; i++) {
    const o = opp[i];
    if (o.lives <= 0) continue;
    const d = MEM.deaths[o.id];
    if (d === undefined || t - d < 16 || t - d > 44) continue;
    const cell = predictRespawn(state, map, o.id);
    if (!cell) continue;
    if (!inZone(cell.x, cell.y, zonePlan)) continue;
    if (cheb(state.self.x, state.self.y, cell.x, cell.y) > 11) continue;
    let contested = false;
    for (let j = 0; j < radarTanks.length; j++) {
      const e = radarTanks[j];
      if (e.hp === 2 && cheb(e.x, e.y, cell.x, cell.y) <= 6) contested = true;
    }
    if (contested) continue;
    // 找站位：距复活点 2..4、有射线直通复活点、在规划圈内
    let best = null, bs = -1e9, bestAim = -1;
    for (let y = cell.y - 4; y <= cell.y + 4; y++) for (let x = cell.x - 4; x <= cell.x + 4; x++) {
      if (!fits(x, y) || !bodyOk(map, x, y) || touchGrid(x, y, block)) continue;
      if (!inZone(x, y, zonePlan)) continue;
      const dc = cheb(x, y, cell.x, cell.y);
      if (dc < 2 || dc > 4) continue;
      let aim = -1;
      for (let d2 = 0; d2 < 4; d2++) {
        const mz = muzzle(x, y, d2);
        const cells = lane(map, mz.x, mz.y, d2, 12);
        for (let k = 0; k < cells.length; k++) {
          const c = cells[k], cx = c % N, cy = (c - cx) / N;
          if (cx >= cell.x && cx <= cell.x + 1 && cy >= cell.y && cy <= cell.y + 1) { aim = d2; break; }
        }
        if (aim >= 0) break;
      }
      if (aim < 0) continue;
      let exits = 0;
      for (let d2 = 0; d2 < 4; d2++) {
        const nx = x + DV[d2][0], ny = y + DV[d2][1];
        if (fits(nx, ny) && bodyOk(map, nx, ny)) exits++;
      }
      const s = -Math.abs(dc - 3) * 3 + (exits >= 3 ? 6 : 0) - manh(x, y, state.self.x, state.self.y) * 0.3;
      if (s > bs) { bs = s; best = { x: x, y: y }; bestAim = aim; }
    }
    if (!best) continue;
    const dist = distField([best], map, block);
    if (dist[state.self.y * T + state.self.x] < 0) continue;
    return { cell: cell, stage: best, aimD: bestAim, dist: dist };
  }
  return null;
}

// ------------------------- 锚点 -------------------------
function pickAnchor(state, map, zone, block, enemies, gun, me) {
  const t = state.tick;
  const known = [];
  for (let i = 0; i < enemies.length; i++) known.push({ x: enemies[i].x, y: enemies[i].y });
  for (const id in MEM.seen) {
    const g = MEM.seen[id];
    if (t - g.t <= 20 && !enemies.some(function (e) { return e.id === id; })) known.push({ x: g.x, y: g.y });
  }
  const cx = (zone.min + zone.max - 1) / 2, cy = cx;
  // 满甲时快速恢复接触；残甲时保持隐蔽节奏
  const roam = t - MEM.seenEnemyT > (me.hp === 2 ? 15 : 45);
  const waypoints = [{ x: 10, y: 10 }, { x: 14, y: 10 }, { x: 14, y: 14 }, { x: 10, y: 14 }];
  const wp = waypoints[Math.floor(t / 45) % 4];
  let best = null, bs = -1e9;
  for (let y = zone.min; y <= zone.max - 1; y++) for (let x = zone.min; x <= zone.max - 1; x++) {
    if (!bodyOk(map, x, y)) continue;
    if (block && touchGrid(x, y, block) && !(x === me.x && y === me.y)) continue;
    let s = 0;
    const edge = Math.min(x - zone.min, zone.max - (x + 1), y - zone.min, zone.max - (y + 1));
    s += Math.min(edge, 4) * 4;
    s -= (Math.abs(x - cx) + Math.abs(y - cy)) * 0.9;
    let exits = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DV[d][0], ny = y + DV[d][1];
      if (fits(nx, ny) && bodyOk(map, nx, ny) && !(block && touchGrid(nx, ny, block))) exits++;
    }
    s += exits >= 3 ? 8 : (exits === 2 ? 0 : -18);
    for (let i = 0; i < known.length; i++) {
      const e = known[i];
      const ddx = e.x - x, ddy = e.y - y;
      if (ddx === 0 && ddy === 0) { s -= 30; continue; }
      if ((ddx === 0 || ddy === 0) && Math.abs(ddx) + Math.abs(ddy) <= 13) {
        const sx = ddx > 0 ? 1 : (ddx < 0 ? -1 : 0), sy = ddy > 0 ? 1 : (ddy < 0 ? -1 : 0);
        let blocked = false;
        let qxx = x, qyy = y;
        for (let j = 0; j < Math.abs(ddx) + Math.abs(ddy); j++) {
          qxx += sx; qyy += sy;
          if (qxx < 0 || qyy < 0 || qxx >= N || qyy >= N) { blocked = true; break; }
          const c = map[qyy][qxx];
          if (c === 1 || c === 2) { blocked = true; break; }
        }
        if (blocked) s += 5; else s -= 13;
      } else s += 2;
    }
    s -= gun[y * T + x] * 10;
    if (!(state.arena && state.arena.radarPulse) && t < 498 && touchesGrass(map, x, y)) s += 9;
    if (roam) s -= manh(x, y, wp.x, wp.y) * 1.2;
    s -= manh(x, y, me.x, me.y) * 0.12;
    s += hash32((state.random ^ t) ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) % 6;
    if (s > bs) { bs = s; best = { x: x, y: y }; }
  }
  return best;
}

// ------------------------- 主逻辑 -------------------------
function think(state) {
  const t = state.tick;
  if (!MEM || t < MEM.tick || t - MEM.tick > 1) MEM = freshMem();
  const me = state.self, map = state.map;
  if (me.lives < MEM.lives) { MEM.mine.length = 0; MEM.tgt = ''; MEM.plan = -1; MEM.stuck = 0; MEM.retreatUntil = -1; }
  MEM.lives = me.lives;
  if (me.hp < MEM.prevHp) MEM.retreatUntil = t + 8;
  if (me.hp > MEM.prevHp) MEM.retreatUntil = -1;
  MEM.prevHp = me.hp;
  MEM.tick = t;
  // 只把「想位移却没动」记为卡位；主动停留不算
  if (MEM.plan >= 0 && me.x === MEM.lx && me.y === MEM.ly) MEM.stuck++; else MEM.stuck = 0;
  MEM.lx = me.x; MEM.ly = me.y;

  const radarTanks = (state.radar && state.radar.tanks) || [];
  const radarBullets = (state.radar && state.radar.bullets) || [];
  if (radarTanks.length) MEM.seenEnemyT = t;

  // 目击更新（含短窗速度估计）与击杀专注检测
  for (let i = 0; i < radarTanks.length; i++) {
    const e = radarTanks[i];
    const old = MEM.seen[e.id];
    let vx = 0, vy = 0;
    if (old && t - old.t === 1) {
      vx = Math.max(-1, Math.min(1, e.x - old.x));
      vy = Math.max(-1, Math.min(1, e.y - old.y));
    }
    if (old && e.hp < old.hp && e.hp <= 1) MEM.commit = { id: e.id, until: t + 25 };
    MEM.seen[e.id] = { x: e.x, y: e.y, d: e.dir, hp: e.hp, inv: e.invincibleTicks || 0, hurt: e.hurtTicks || 0, rapid: e.rapidTicks || 0, t: t, vx: vx, vy: vy };
  }
  // 不在场的目击按对手公开状态清理；检测阵亡时刻
  const opp = state.opponents || [];
  for (let i = 0; i < opp.length; i++) {
    const o = opp[i];
    if (o.lives <= 0 || o.respawnTicks > 0) delete MEM.seen[o.id];
    const pl = MEM.prevLives[o.id];
    if (pl !== undefined && o.lives < pl) {
      MEM.deaths[o.id] = t;
      if (MEM.commit && MEM.commit.id === o.id) MEM.commit = null;
    }
    MEM.prevLives[o.id] = o.lives;
  }
  if (MEM.commit && MEM.commit.until < t) MEM.commit = null;

  // ---- 自家弹簿记：预测位置 + 雷达确认 ----
  const keptMine = [];
  const claimed = new Array(radarBullets.length).fill(false);
  for (let i = 0; i < MEM.mine.length; i++) {
    const b = MEM.mine[i];
    const age = t - b.t;
    if (age > 9) continue;
    // 出膛后逐格检查：弹道上的钢若仍在，说明弹早已消散（砖被打掉会变空地）
    let dead = false;
    let cx = b.x, cy = b.y;
    const idx = 3 * age;
    for (let j = 0; j <= idx; j++) {
      if (j > 0) { cx += DV[b.d][0]; cy += DV[b.d][1]; }
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) { dead = true; break; }
      const c = map[cy][cx];
      if (c === 1 || c === 2) { dead = true; break; }
    }
    if (!dead) {
      // 预测弹道穿过可见敌车车身 -> 大概率已命中消散
      let hitTank = false;
      let hx = b.x, hy = b.y;
      for (let j2 = 0; j2 <= idx && !hitTank; j2++) {
        if (j2 > 0) { hx += DV[b.d][0]; hy += DV[b.d][1]; }
        for (let j3 = 0; j3 < radarTanks.length; j3++) {
          const e3 = radarTanks[j3];
          if (e3.invincibleTicks > 0) continue;       // 保护期子弹穿透
          if (hx >= e3.x && hx <= e3.x + 1 && hy >= e3.y && hy <= e3.y + 1) { hitTank = true; break; }
        }
      }
      if (hitTank) dead = true;
    }
    if (!dead) {
      // 预测位置在雷达范围内却看不到 -> 已经消散
      if (cx >= 0 && cy >= 0 && cx < N && cy < N && cheb(me.x, me.y, cx, cy) <= 6) {
        let found = false;
        for (let j = 0; j < radarBullets.length; j++) {
          const rb = radarBullets[j];
          if (rb.dir === b.d && rb.x === cx && rb.y === cy) { found = true; claimed[j] = true; break; }
        }
        if (!found) dead = true;
      } else {
        for (let j = 0; j < radarBullets.length; j++) {
          if (claimed[j]) continue;
          const rb = radarBullets[j];
          if (rb.dir === b.d && rb.x === cx && rb.y === cy) { claimed[j] = true; break; }
        }
      }
    }
    if (!dead) keptMine.push(b);
  }
  MEM.mine = keptMine;
  MEM.mineAlive = keptMine.length;

  // ---- 敌方开火推断（雷达弹 - 自家弹）----
  const threats = [];
  for (let j = 0; j < radarBullets.length; j++) {
    if (claimed[j]) continue;
    threats.push(radarBullets[j]);
    const b = radarBullets[j];
    for (let i = 0; i < radarTanks.length; i++) {
      const e = radarTanks[i];
      if (e.dir !== b.dir) continue;
      const dv = DV[b.dir];
      const along = (b.x - e.x) * dv[0] + (b.y - e.y) * dv[1];
      const cross = Math.abs((b.x - e.x) * dv[1] - (b.y - e.y) * dv[0]);
      if (cross <= 2 && along >= 1 && along <= 12) {
        const est = t - Math.ceil(along / 3);
        if (!(e.id in MEM.shots) || MEM.shots[e.id] < est) MEM.shots[e.id] = est;
      }
    }
  }

  // ---- 威胁禁行表（含自家弹免疫窗后的格）----
  const forbGrids = [];
  for (let tau = 1; tau <= HORIZON; tau++) forbGrids.push(new Uint8Array(N * N));
  for (let i = 0; i < threats.length; i++) {
    const b = threats[i];
    const cells = lane(map, b.x, b.y, b.dir, 3 * HORIZON + 1);
    const fs = laneForbs(cells, HORIZON);
    for (let tau = 1; tau <= HORIZON; tau++) {
      const g = forbGrids[tau - 1];
      const arr = fs[tau - 1];
      for (let j = 0; j < arr.length; j++) g[arr[j]] = 1;
    }
  }
  for (let i = 0; i < keptMine.length; i++) {
    const b = keptMine[i];
    const age = t - b.t;
    const cells = lane(map, b.x, b.y, b.d, 3 * HORIZON + 1 + 3 * age);
    for (let tau = 1; tau <= HORIZON; tau++) {
      if (age + tau <= 2) continue;             // 自伤豁免窗内
      const lo = 3 * (age + tau - 1), hi = Math.min(3 * (age + tau), cells.length - 1);
      const g = forbGrids[tau - 1];
      for (let j = lo; j <= hi; j++) g[cells[j]] = 1;
    }
  }

  // ---- 静态阻挡（可见敌车 + 2 拍内残影）----
  const block = new Uint8Array(N * N);
  const markBody = function (x, y) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const gx = x + dx, gy = y + dy;
      if (gx >= 0 && gy >= 0 && gx < N && gy < N) block[gy * N + gx] = 1;
    }
  };
  for (let i = 0; i < radarTanks.length; i++) markBody(radarTanks[i].x, radarTanks[i].y);
  for (const id in MEM.seen) {
    const g = MEM.seen[id];
    if (t - g.t > 0 && t - g.t <= 2) markBody(g.x, g.y);
  }

  // ---- 区域规划 ----
  const zs = state.arena && state.arena.safeZone;
  const zoneNow = { min: zs ? zs.min : 0, max: zs ? zs.max : 25 };
  let zonePlan = zoneNow;
  const shrinkIn = zs && zs.nextShrinkTick !== null && zs.nextShrinkTick !== undefined ? zs.nextShrinkTick - t : 9999;
  if (shrinkIn <= 12) zonePlan = { min: zs.nextMin, max: 25 - zs.nextMin };
  const pulse = !!(state.arena && state.arena.radarPulse);

  // ---- 比分态势 ----
  const sb = state.scoreboard || [];
  let myRow = null;
  for (let i = 0; i < sb.length; i++) if (sb[i].id === me.id) myRow = sb[i];
  if (!myRow) myRow = { points: 0, kills: 0, lives: me.lives };
  const betterRow = function (a, b) {
    if (a.points !== b.points) return a.points > b.points;
    if (a.kills !== b.kills) return a.kills > b.kills;
    return a.lives > b.lives;
  };
  const aliveRows = [];
  for (let i = 0; i < sb.length; i++) {
    const r = sb[i];
    if (r.id === me.id || r.lives <= 0 || r.status === 'error' || r.status === 'timeout') continue;
    aliveRows.push(r);
  }
  let bestRival = null;
  for (let i = 0; i < aliveRows.length; i++) if (!bestRival || betterRow(aliveRows[i], bestRival)) bestRival = aliveRows[i];
  const leading = !bestRival || betterRow(myRow, bestRival);
  const behind = !!bestRival && betterRow(bestRival, myRow);

  // ---- 火线风险：只在对方真可能看见我时计入 ----
  const iFiredRecently = t - MEM.fired <= 8;
  const myGrass = touchesGrass(map, me.x, me.y);
  const gun = new Float32Array(T * T);
  for (let i = 0; i < radarTanks.length; i++) {
    const e = radarTanks[i];
    const dist = cheb(me.x, me.y, e.x, e.y);
    if (dist > 6 && !pulse) continue;                                  // 雷达范围外看不见我
    if (!pulse && dist > 2 && myGrass && !iFiredRecently) continue;    // 草丛隐匿
    if (e.inv > 10) continue;                                          // 长保护期一般不开火
    const lastShot = MEM.shots[e.id];
    const hot = lastShot === undefined || t - lastShot >= 4;
    let w = (hot ? 1 : 0.7) * (e.rapid > 0 ? 1.35 : 1);
    if (e.hp === 1) w *= 0.85;
    const eg = new Float32Array(T * T);
    for (let d = 0; d < 4; d++) {
      const mz = muzzle(e.x, e.y, d);
      const cells = lane(map, mz.x, mz.y, d, GUN_RANGE);
      const wf = w * (d === e.dir ? 1.5 : 1);
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k], cx = c % N, cy = (c - cx) / N;
        const val = wf * (GUN_RANGE + 1 - k) / (GUN_RANGE + 1) * (k <= 2 ? 1.6 : 1);
        for (let oy = cy - 1; oy <= cy; oy++) for (let ox = cx - 1; ox <= cx; ox++) {
          if (!fits(ox, oy)) continue;
          const kk = oy * T + ox;
          const v = val * (k === 0 ? 1.2 : 1);
          if (v > eg[kk]) eg[kk] = v;
        }
      }
    }
    for (let k = 0; k < gun.length; k++) gun[k] += eg[k];
  }

  // ---- 生存求解 ----
  const protectedNow = me.invincibleTicks > 0 || me.hurtTicks >= 1;
  let evadeReach = null, doomed = false;
  if (threats.length && !protectedNow) {
    const r = survive(me.x, me.y, HORIZON, forbGrids, block, map);
    evadeReach = r.reach;
    doomed = !r.alive;
  }

  // ---- 开火控制 ----
  const canFire = me.fireCooldown === 0 && MEM.mineAlive < 2;
  const grades = [-1, -1, -1, -1];
  const livesOf = function (id) {
    for (let i = 0; i < sb.length; i++) if (sb[i].id === id) return sb[i].lives;
    return 3;
  };
  const myTotal = me.hp + 2 * (me.lives - 1);
  const retreating = me.hp === 1 || t < MEM.retreatUntil;
  const safeEnd = t >= 520 && leading;
  const ultraSafe = safeEnd && aliveRows.length === 1 && t >= 535;
  if (canFire && radarTanks.length) {
    for (let d = 0; d < 4; d++) {
      const mz = muzzle(me.x, me.y, d);
      const cells = lane(map, mz.x, mz.y, d, 27);
      if (cells.length < 2) continue;
      let victim = null, kIdx = -1;
      for (let i = 0; i < cells.length && !victim; i++) {
        const c = cells[i], cx = c % N, cy = (c - cx) / N;
        for (let j = 0; j < radarTanks.length; j++) {
          const e = radarTanks[j];
          if (cx >= e.x && cx <= e.x + 1 && cy >= e.y && cy <= e.y + 1) { victim = e; kIdx = i; break; }
        }
      }
      if (!victim) continue;
      if (victim.invincibleTicks > 0) continue;             // 子弹穿透，浪费
      const tau = Math.max(1, Math.ceil(kIdx / 3));
      if (tau <= (victim.hurtTicks || 0)) continue;         // 会打在受击缓冲上
      const vl = livesOf(victim.id);
      const tgtTotal = victim.hp + 2 * Math.max(0, vl - 1);
      const healthOk = myTotal >= tgtTotal || me.rapidTicks > 20;
      // 目标逃脱分析（阻挡 = 其他可见车身 + 我的车身，不含目标自身）
      const vBlock = new Uint8Array(N * N);
      for (let j = 0; j < radarTanks.length; j++) {
        const e = radarTanks[j];
        if (e === victim) continue;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) vBlock[(e.y + dy) * N + e.x + dx] = 1;
      }
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) vBlock[(me.y + dy) * N + me.x + dx] = 1;
      const fs = laneForbs(cells, tau);
      const vGrids = [];
      for (let tau2 = 1; tau2 <= tau; tau2++) {
        const g = new Uint8Array(N * N);
        const arr = fs[tau2 - 1];
        for (let j = 0; j < arr.length; j++) g[arr[j]] = 1;
        vGrids.push(g);
      }
      const r = survive(victim.x, victim.y, tau, vGrids, vBlock, map);
      const undodge = !r.alive;
      const lastShot = MEM.shots[victim.id];
      const recent = lastShot !== undefined && t - lastShot <= 4;
      const backshot = victim.dir !== (d + 2) % 4;
      const distracted = radarTanks.some(function (o) { return o !== victim && cheb(o.x, o.y, victim.x, victim.y) <= 7; });
      const hurtWin = (victim.hurtTicks || 0) >= 1;
      // 提前量：目标正按上拍速度移动，预测到位后仍在弹道上
      let lead = false;
      const sv = MEM.seen[victim.id];
      if (sv && (sv.vx || sv.vy)) {
        const vtau = Math.min(2, Math.max(1, Math.ceil(kIdx / 3)));
        const px = Math.max(0, Math.min(24, victim.x + sv.vx * vtau));
        const py = Math.max(0, Math.min(24, victim.y + sv.vy * vtau));
        for (let i2 = 0; i2 < cells.length; i2++) {
          const c = cells[i2], cx2 = c % N, cy2 = (c - cx2) / N;
          if (cx2 >= px && cx2 <= px + 1 && cy2 >= py && cy2 <= py + 1) { lead = true; break; }
        }
      }
      let exits = 0;
      for (let dd = 0; dd < 4; dd++) {
        const nx = victim.x + DV[dd][0], ny = victim.y + DV[dd][1];
        if (fits(nx, ny) && bodyOk(map, nx, ny)) exits++;
      }
      const pocket = exits <= 2;
      let grade = -1;
      if (undodge) grade = victim.hp <= 1 ? 3 : 2;
      // 对齐即射：射线清晰、打得到、血量不亏就开火（提前量目标优先）
      else if ((healthOk || victim.hp === 1)) grade = lead ? 1 : (recent || backshot || distracted || hurtWin || pocket || me.rapidTicks > 20 || (t >= 460 && behind) || kIdx <= 9) ? 1 : -1;
      if (me.invincibleTicks > 0 && !(grade === 3 || (grade >= 2 && tau <= 2))) grade = -1;
      // 撤退/残甲时仍打低风险机会弹：目标被缠住、冷却中、或残甲贴脸
      if (retreating && grade === 1 && !(victim.hp === 1 && kIdx <= 6) && !(distracted || recent || lead)) grade = -1;
      if (safeEnd && grade === 1) grade = -1;
      if (ultraSafe && !(grade === 3 || victim.hp === 1)) grade = -1;
      grades[d] = grade;
    }
  }
  let fire = false;
  if (grades[me.dir] >= 1) fire = true;
  // 走投无路：开火求对撞拦截，或至少换分
  if (doomed && canFire && !fire) {
    if (grades[me.dir] >= 1) fire = true;
    else {
      const mz = muzzle(me.x, me.y, me.dir);
      const myLane = lane(map, mz.x, mz.y, me.dir, 7);
      let inter = false;
      for (let tau = 1; tau <= 2 && !inter; tau++) {
        const g = forbGrids[tau - 1];
        for (let j = 0; j < myLane.length; j++) if (g[myLane[j]]) { inter = true; break; }
      }
      if (inter) fire = true;
    }
  }
  if (fire) {
    MEM.fired = t; MEM.fireD = me.dir;
    const mz = muzzle(me.x, me.y, me.dir);
    MEM.mine.push({ t: t, x: mz.x, y: mz.y, d: me.dir });
    MEM.mineAlive = MEM.mine.length;
  } else if (canFire && !radarTanks.length &&
             t - MEM.seenEnemyT > 3 && inZone(me.x, me.y, zoneNow)) {
    // 无人交战时清掉眼前的砖，开路兼保持火力节奏
    const mz = muzzle(me.x, me.y, me.dir);
    if (mz.x >= 0 && mz.y >= 0 && mz.x < N && mz.y < N && map[mz.y][mz.x] === 1) {
      fire = true;
      MEM.fired = t; MEM.fireD = me.dir;
      MEM.mine.push({ t: t, x: mz.x, y: mz.y, d: me.dir });
      MEM.mineAlive = MEM.mine.length;
    }
  }
  // 转向权重（未开火时才牵引走位）
  const aimW = [0, 0, 0, 0];
  if (!fire) for (let d = 0; d < 4; d++) {
    if (grades[d] >= 3) aimW[d] = 42;
    else if (grades[d] === 2) aimW[d] = 30;
    else if (grades[d] === 1) aimW[d] = 12;
  }

  // ---- 目标选择 ----
  let tgt = null;
  if (radarTanks.length) {
    let bestV = -1e9;
    for (let i = 0; i < radarTanks.length; i++) {
      const e = radarTanks[i];
      let v = (2 - e.hp) * 30 - cheb(me.x, me.y, e.x, e.y) * 2 - (e.rapid > 0 ? 12 : 0) - (e.inv > 0 ? 200 : 0);
      if (e.id === MEM.tgt && t - MEM.tgtT <= 18) v += 10;
      if (MEM.commit && MEM.commit.id === e.id) v += 45;
      if (t >= 460) {
        let row = null;
        for (let j = 0; j < sb.length; j++) if (sb[j].id === e.id) row = sb[j];
        if (behind && row) v += row.points * 1.2;
        if (e.hp === 1) v += 12;
      }
      if (v > bestV) { bestV = v; tgt = e; }
    }
    if (tgt) { MEM.tgt = tgt.id; MEM.tgtT = t; }
  }
  let ghost = null;
  if (!tgt && me.hp === 2 && MEM.tgt && MEM.seen[MEM.tgt] && t - MEM.seen[MEM.tgt].t <= 4) {
    const g = MEM.seen[MEM.tgt];
    if (cheb(me.x, me.y, g.x, g.y) <= 8) ghost = g;
  }

  // ---- 补给裁决 ----
  const box = state.arena && state.arena.supply;
  let supplyGo = null;
  if (box) {
    const remain = box.expireTick - t;
    const isRepair = box.type === 'repair';
    const wantType = isRepair ? me.hp < me.maxHp : me.rapidTicks <= 25;
    if (remain > 3 && wantType) {
      const goals = [];
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
        const gx = box.x + dx, gy = box.y + dy;
        if (fits(gx, gy)) goals.push({ x: gx, y: gy });
      }
      const dist = distField(goals, map, block);
      const eta = dist[me.y * T + me.x];
      const wait = Math.max(0, box.appearTick - t);
      if (eta >= 0 && eta + 2 <= remain && eta <= wait + 6) {
        let rival = 1e9;
        for (let i = 0; i < radarTanks.length; i++) rival = Math.min(rival, manh(radarTanks[i].x, radarTanks[i].y, box.x, box.y));
        for (const id in MEM.seen) {
          const g = MEM.seen[id];
          if (t - g.t <= 10) rival = Math.min(rival, manh(g.x, g.y, box.x, box.y));
        }
        let want = isRepair ? (me.hp === 1 ? 90 : 55) : 58;
        // 人群折扣：两辆以上新鲜敌车贴近箱子时收敛争夺
        let crowd = 0;
        for (let i = 0; i < radarTanks.length; i++) if (cheb(radarTanks[i].x, radarTanks[i].y, box.x, box.y) <= 8) crowd++;
        for (const id2 in MEM.seen) {
          const g2 = MEM.seen[id2];
          if (t - g2.t <= 8 && cheb(g2.x, g2.y, box.x, box.y) <= 8) crowd++;
        }
        if (crowd >= 2 && eta > 3) want *= 0.6;
        // 前两轮补给血雨腥风：只有明显先到才进场
        if (t < 240 && rival <= eta) want = isRepair && me.hp === 1 && rival <= eta + 4 ? 60 : 0;
        if (rival <= eta - 1 && !(isRepair && me.hp === 1 && rival <= eta + 5)) want = 0;
        if (!isRepair && rival < eta - 2) want = 0;
        // 有人守在箱边而我不在近旁：不当面抢
        let camper = false;
        for (let i = 0; i < radarTanks.length; i++) if (cheb(radarTanks[i].x, radarTanks[i].y, box.x, box.y) <= 3 && cheb(me.x, me.y, box.x, box.y) > 2) camper = true;
        if (camper && !(isRepair && me.hp === 1)) want = Math.min(want, 20);
        if (eta > 14) want -= (eta - 14) * 2.5;
        if (want > 25) supplyGo = { dist: dist, eta: eta, box: box };
      }
    }
  }

  // ---- 模式与目标格 ----
  const inNow = inZone(me.x, me.y, zoneNow);
  const inPlan = inZone(me.x, me.y, zonePlan);
  let goalDist = null, intent = 'hold';
  let camp = null, campAim = -1;
  // 收割窗口：两辆敌车正在互相缠斗（其一残甲或刚开火）
  let harvest = false;
  if (radarTanks.length >= 2) {
    for (let i = 0; i < radarTanks.length && !harvest; i++) for (let j = i + 1; j < radarTanks.length; j++) {
      const e1 = radarTanks[i], e2 = radarTanks[j];
      if (cheb(e1.x, e1.y, e2.x, e2.y) > 8) continue;
      const ls1 = MEM.shots[e1.id], ls2 = MEM.shots[e2.id];
      const busy = (ls1 !== undefined && t - ls1 <= 3) || (ls2 !== undefined && t - ls2 <= 3);
      if (e1.hp === 1 || e2.hp === 1 || busy) { harvest = true; break; }
    }
  }
  // hp1 时只在火力就绪且目标残甲的瞬间缠斗，或两敌缠斗时在场边收割
  let engageTgt = tgt || ghost;
  if (me.hp === 1 && me.invincibleTicks === 0 &&
      !(engageTgt && engageTgt.hp <= 1 && me.fireCooldown === 0)) {
    if (!(harvest && engageTgt && engageTgt.hp <= 1)) engageTgt = null;
  }
  let band = 7, avoid = false;
  const zoneCells = function (z) {
    const cells = [];
    for (let y = z.min; y <= z.max - 1; y++) for (let x = z.min; x <= z.max - 1; x++) cells.push({ x: x, y: y });
    return cells;
  };
  if (!inNow || (shrinkIn <= 12 && !inPlan)) {
    goalDist = distField(zoneCells(zonePlan), map, block);
    intent = !inNow ? 'retreat' : (shrinkIn <= 6 ? 'retreat' : 'advance');
  } else if (supplyGo && me.hp === 1 && supplyGo.box.type === 'repair') {
    goalDist = supplyGo.dist; intent = 'resupply';
  } else if (engageTgt) {
    intent = 'pursue';
    const et = engageTgt;
    const etLives = livesOf(et.id);
    const etTotal = et.hp + 2 * Math.max(0, etLives - 1);
    const healthOk = myTotal >= etTotal;
    band = retreating ? 10 : (healthOk ? 7 : 9);
    const etDist = cheb(me.x, me.y, et.x, et.y);
    // 处决：目标残甲且我火力就绪 -> 贴上去终结
    if (!retreating && et.hp === 1 && myTotal > etTotal && me.fireCooldown === 0 && me.hp >= 1) band = 3;
    // 收割：两敌缠斗时贴近中距离待机，吃破绽
    if (harvest && !retreating && band > 5) band = 5;
    // 火力未就绪时不与近敌对峙
    if (me.fireCooldown >= 3 && etDist <= 7 && band < 9) band = 9;
    if (me.rapidTicks > 20 && healthOk && !retreating) band = Math.min(band, 4);
    if (t >= 460) {
      if (behind && !retreating) band = Math.min(band, 4);
      else if (leading && me.hp === 1) band = 10;
    }
    avoid = retreating;
  } else if (supplyGo) {
    goalDist = supplyGo.dist; intent = 'resupply';
  } else if (me.hp === 2 && !retreating && (camp = findCamp(state, map, zonePlan, block, radarTanks, opp))) {
    // 复活点蹲守：预测复活的敌车保护期一结束就能吃到 aligned 火力
    goalDist = camp.dist; intent = 'siege';
    if (cheb(me.x, me.y, camp.cell.x, camp.cell.y) <= 5 && camp.aimD >= 0) campAim = camp.aimD;
  } else {
    // 锚点
    if (!MEM.anchor || t - MEM.anchorT > 8 || !inZone(MEM.anchor.x, MEM.anchor.y, zonePlan) ||
        !bodyOk(map, MEM.anchor.x, MEM.anchor.y)) {
      MEM.anchor = pickAnchor(state, map, zonePlan, block, radarTanks, gun, me);
      MEM.anchorT = t;
    }
    if (MEM.anchor) {
      if (MEM.anchor.x === me.x && MEM.anchor.y === me.y) intent = 'hold';
      else {
        goalDist = distField([MEM.anchor], map, block);
        if (goalDist[me.y * T + me.x] < 0) { MEM.anchor = null; MEM.anchorT = -99; }
        else intent = 'advance';
      }
    }
  }

  // ---- 候选动作评分 ----
  const cur = me.y * T + me.x;
  const protectFactor = me.invincibleTicks > 0 ? 0 : me.hurtTicks >= 1 ? 0.25 : 1;
  const gunW = 26 * (me.hp === 1 ? 2.4 : 1);
  const forb1 = forbGrids[0];
  const hideMode = retreating && !pulse && t < 498;
  let bestA = -1, bestS = -1e18;
  const candScore = [];
  for (let a = -1; a < 4; a++) {
    let nx = me.x, ny = me.y;
    if (a >= 0) { nx += DV[a][0]; ny += DV[a][1]; }
    const displace = a < 0 || (fits(nx, ny) && bodyOk(map, nx, ny) && !touchGrid(nx, ny, block));
    if (a >= 0 && !displace) { nx = me.x; ny = me.y; }    // 撞墙/撞车仍完成转向
    const k = ny * T + nx;
    let s = 0;
    if (protectFactor > 0 && touchGrid(nx, ny, forb1)) s -= 500 * protectFactor;
    s -= gun[k] * gunW * protectFactor;
    if (!inZone(nx, ny, zoneNow)) s -= 400;
    else if (!inZone(nx, ny, zonePlan)) s -= 90;
    if (goalDist) {
      const dc = goalDist[cur], dn = goalDist[k];
      const w = !inNow ? 60 : 15;
      if (dc >= 0 && dn >= 0) s += (dc - dn) * w;
      else if (dn < 0 && dc >= 0) s -= 30;
    }
    if (engageTgt && displace) {
      const nd = cheb(nx, ny, engageTgt.x, engageTgt.y);
      if (!goalDist) s -= Math.abs(nd - band) * 9;
      if (avoid && nd < 5) s -= (5 - nd) * 15;             // 撤退时绝不贴脸
      // 近战死区：未装填或目标满甲时不贴脸（装填且目标残甲的处决态除外）
      const loaded = me.fireCooldown === 0 && engageTgt.hp === 1;
      if (!avoid && nd < 4 && me.invincibleTicks === 0 && !loaded) s -= (4 - nd) * 22;
      if (!avoid) {
        if (nd >= 5) {
          if (Math.abs(nx - engageTgt.x) <= 1 && (a === 0 || a === 2)) s += 9;
          if (Math.abs(ny - engageTgt.y) <= 1 && (a === 1 || a === 3)) s += 9;
        }
      } else if (nd > cheb(me.x, me.y, engageTgt.x, engageTgt.y)) s += 5;
    }
    if (a >= 0) s += aimW[a];
    if (a >= 0 && a === campAim) s += 20;             // 蹲守位预对准复活点
    // 无好枪时面向威胁的主轴：逼近的敌人会走进炮口
    if (a >= 0 && engageTgt && !aimW.some(function (w) { return w > 0; })) {
      const adx = engageTgt.x - me.x, ady = engageTgt.y - me.y;
      const faceDir = Math.abs(adx) > Math.abs(ady) ? (adx > 0 ? 1 : 3) : (ady > 0 ? 2 : 0);
      if (a === faceDir) s += 6;
    }
    if (a === MEM.plan) s += 2;
    if (t - MEM.fired <= 2 && a >= 0 && a % 2 !== MEM.fireD % 2 && displace) s += 5;
    if (hideMode && displace && a >= 0 && touchesGrass(map, nx, ny)) s += 7;
    s += (hash32((state.random ^ Math.imul(t, 2654435761)) + (a + 2) * 971) % 20) * 0.1;
    candScore.push(s);
    if (s > bestS) { bestS = s; bestA = a; }
  }
  // 生存绑定：意向动作活不满视界时改走能活最久的首步
  if (evadeReach !== null) {
    const reach = evadeReach[bestA + ''] || 0;
    if (reach < HORIZON) {
      let bd = null, bv = -1;
      for (let a = -1; a < 4; a++) {
        const rv = evadeReach[a + ''] || 0;
        const sv = rv * 10 + (a === bestA ? 3 : 0);
        if (sv > bv) { bv = sv; bd = a; }
      }
      if (bd !== null && (evadeReach[bd + ''] || 0) > reach) { bestA = bd; intent = 'defend'; }
    }
  }
  // 卡位解锁：只在「想动没动成」时触发，按安全分选向，绝不离开规划圈
  if (MEM.stuck >= 4 && MEM.plan >= 0 && bestA === MEM.plan) {
    let ud = -1, us = 1e18;
    for (let d = 0; d < 4; d++) {
      const nx = me.x + DV[d][0], ny = me.y + DV[d][1];
      if (!fits(nx, ny) || !bodyOk(map, nx, ny) || touchGrid(nx, ny, block)) continue;
      if (!inZone(nx, ny, zonePlan)) continue;
      if (protectFactor > 0 && touchGrid(nx, ny, forb1)) continue;
      let sc = gun[ny * T + nx] * gunW;
      if (engageTgt) sc += Math.abs(cheb(nx, ny, engageTgt.x, engageTgt.y) - band) * 7;
      sc += (hash32(state.random + t * 31 + d * 7) % 10) * 0.1;
      if (sc < us) { us = sc; ud = d; }
    }
    if (ud >= 0) { bestA = ud; MEM.stuck = 0; }
  }
  MEM.plan = bestA;
  if (fire && intent === 'hold') intent = 'pursue';
  if (bestA >= 0 && aimW[bestA] >= 30 && !fire) intent = 'flank';
  return { move: bestA < 0 ? 'stay' : MN[bestA], fire: fire, intent: intent };
}

// ------------------------- 入口 -------------------------
// 任何内部异常都回退合法保底动作，绝不让选手被判异常出局。
function decide(state) {
  try { return think(state); } catch (e) { return { move: 'stay', fire: false, intent: 'hold' }; }
}
