'use strict';
// =====================================================================
// vortex · 四人坦克乱斗 2.6 参赛 bot
//
// 主线：空间猎手 + 节奏施压者 (Pressure Hunter, v8).
//   - 简单粗暴的主线：planmove 朝目标 → 命中即开火 → 弹道威胁即躲避；
//   - 躲避：solveEvade H=4 拍找到最深路线，命中早期 tau 优先避；
//   - 距离：d > 5 主动推进；d 2-4 维持；d < 2 横移；
//   - 草丛作掩护进草；
//   - 残局按比分与生命决定激进或保守。
//
// 实现完全独立：仅依据规则文档与引擎合同 (brawl.js / sim.js / constants)
// 从零编写；未参考任何参赛作品源码。
// 仅使用合法 state 与自身历史；顶层记忆只在本地这一场内保留。
// =====================================================================

const N = 26;
const DVEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DNAME = ['up', 'right', 'down', 'left'];
const ZONE_SHRINK = 200, ZONE_STEP = 50, ZONE_MAX = 9;

// ------------------------- 每场记忆 -------------------------
let M = null;
function freshMemory(prev) {
  return {
    lastTick: -1,
    lives: 3,
    seen: prev ? prev.seen : Object.create(null),
    myShots: [],
    stuck: 0, lx: -1, ly: -1,
  };
}

// ------------------------- 工具 -------------------------
function abs(n) { return n < 0 ? -n : n; }
function cheb(ax, ay, bx, by) {
  const dx = abs(ax - bx), dy = abs(ay - by);
  return dx > dy ? dx : dy;
}
function manh(ax, ay, bx, by) {
  return abs(ax - bx) + abs(ay - by);
}
function marginAt(t) {
  if (t < ZONE_SHRINK) return 0;
  return Math.min(ZONE_MAX, 2 + Math.floor((t - ZONE_SHRINK) / ZONE_STEP));
}
function zoneAt(t) { const m = marginAt(t); return { min: m, max: 25 - m }; }
function inZone(x, y, z0) {
  return x >= z0.min && y >= z0.min && x + 1 <= z0.max && y + 1 <= z0.max;
}
function bodyFits(x, y) { return x >= 0 && y >= 0 && x <= N - 2 && y <= N - 2; }
function cellPass(map, x, y) {
  if (x < 0 || y < 0 || x >= N || y >= N) return false;
  const t = map[y][x];
  return t === 0 || t === 4;
}
function bodyPass(map, x, y) {
  return cellPass(map, x, y) && cellPass(map, x + 1, y)
      && cellPass(map, x, y + 1) && cellPass(map, x + 1, y + 1);
}
function muzzleOf(x, y, d) {
  if (d === 0) return { x, y: y - 1 };
  if (d === 1) return { x: x + 2, y };
  if (d === 2) return { x, y: y + 2 };
  return { x: x - 1, y };
}
function bodyCovers(ax, ay, x, y) {
  return x >= ax && x <= ax + 1 && y >= ay && y <= ay + 1;
}
function bodyOverlap(ax, ay, bx, by) {
  return ax < bx + 2 && ax + 2 > bx && ay < by + 2 && ay + 2 > by;
}
function bodyCoversGrid(px, py, grid) {
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const cx = px + dx, cy = py + dy;
    if (cx >= 0 && cy >= 0 && cx < N && cy < N && grid[cy * N + cx]) return true;
  }
  return false;
}

// ------------------------- 弹道 -------------------------
function lineHitsPos(map, mx, my, d, ax, ay, maxCells) {
  if (mx < 0 || my < 0 || mx >= N || my >= N) return false;
  let cx = mx, cy = my;
  for (let s = 0; s < maxCells; s++) {
    if (bodyCovers(ax, ay, cx, cy)) return true;
    cx += DVEC[d][0]; cy += DVEC[d][1];
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return false;
    const t = map[cy][cx];
    if (t === 1 || t === 2) return false;
  }
  return false;
}
// 子弹在 ≤H 拍内会经过的格子
function bulletCells(map, mx, my, d, H) {
  const out = [[]];
  if (mx < 0 || my < 0 || mx >= N || my >= N) {
    for (let tau = 1; tau <= H; tau++) out.push([]);
    return out;
  }
  const t0 = map[my][mx];
  if (t0 === 1 || t0 === 2) {
    for (let tau = 1; tau <= H; tau++) out.push([]);
    return out;
  }
  out.push([{ x: mx, y: my }]);
  let cx = mx, cy = my, stopped = false;
  for (let tau = 1; tau <= H && !stopped; tau++) {
    const cells = [];
    for (let s = 0; s < 3; s++) {
      cx += DVEC[d][0]; cy += DVEC[d][1];
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) { stopped = true; break; }
      const t = map[cy][cx];
      cells.push({ x: cx, y: cy });
      if (t === 1 || t === 2) { stopped = true; break; }
    }
    out.push(cells);
  }
  for (let tau = out.length; tau <= H; tau++) out.push([]);
  return out;
}

// ------------------------- 躲避求解 -------------------------
function solveEvade(sx, sy, H, mergedForb, map, staticGrid) {
  if (!bodyFits(sx, sy)) return { fd: -1, aliveT: 0 };
  const key = (x, y) => x + y * 25;
  const grids = [];
  for (let tau = 0; tau <= H; tau++) {
    const g = new Uint8Array(N * N);
    const cells = mergedForb[tau];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.x >= 0 && c.y >= 0 && c.x < N && c.y < N) g[c.y * N + c.x] = 1;
    }
    grids.push(g);
  }
  let layer = new Map();
  layer.set(key(sx, sy), -2);
  let best = { fd: -1, aliveT: 0 };
  for (let tau = 1; tau <= H; tau++) {
    const fb = grids[tau];
    const next = new Map();
    for (const [pk, fd] of layer) {
      const px = pk % 25, py = (pk - px) / 25;
      for (let d = -1; d < 4; d++) {
        let nx = px, ny = py;
        if (d >= 0) {
          nx += DVEC[d][0]; ny += DVEC[d][1];
          if (!bodyFits(nx, ny)) continue;
          if (!bodyPass(map, nx, ny)) continue;
          if (staticGrid && bodyCoversGrid(nx, ny, staticGrid)) continue;
        }
        if (bodyCoversGrid(nx, ny, fb)) continue;
        const nk = key(nx, ny);
        if (!next.has(nk)) next.set(nk, fd === -2 ? d : fd);
      }
    }
    if (next.size === 0) return best;
    layer = next;
    for (const [, fd] of layer) { best = { fd, aliveT: tau }; break; }
  }
  return best;
}

// ------------------------- BFS 路径 -------------------------
function planMove(map, sx, sy, goal, zone, occupied) {
  if (sx === goal.x && sy === goal.y) return -1;
  if (!bodyFits(sx, sy)) return -1;
  const key = (x, y) => x + y * 25;
  const seen = new Uint8Array(25 * 25);
  const first = new Int8Array(25 * 25); first.fill(-1);
  const queue = [key(sx, sy)];
  seen[key(sx, sy)] = 1;
  let head = 0;
  let bestKey = -1, bestCost = Infinity;
  while (head < queue.length) {
    const k = queue[head++];
    const x = k % 25, y = (k - x) / 25;
    const c = manh(x, y, goal.x, goal.y);
    if (c < bestCost) { bestCost = c; bestKey = k; if (c === 0) break; }
    for (let d = 0; d < 4; d++) {
      const nx = x + DVEC[d][0], ny = y + DVEC[d][1];
      if (!bodyFits(nx, ny)) continue;
      if (!bodyPass(map, nx, ny)) continue;
      if (occupied && occupied.some(e => bodyOverlap(nx, ny, e.x, e.y))) continue;
      if (!inZone(nx, ny, zone)) continue;
      const nk = nx + ny * 25;
      if (seen[nk]) continue;
      seen[nk] = 1;
      first[nk] = k === key(sx, sy) ? d : first[k];
      queue.push(nk);
    }
  }
  if (bestKey < 0) return -1;
  return first[bestKey];
}

// ------------------------- 主入口 -------------------------
function decide(state) {
  const me = state.self;
  const tick = state.tick;
  if (M === null || M.lastTick > tick) {
    M = freshMemory(null);
  } else if (M.lastTick !== tick - 1 && M.lastTick >= 0) {
    M = freshMemory(M);
    M.lx = me.x; M.ly = me.y;
  }
  M.lastTick = tick;
  if (M.lx !== me.x || M.ly !== me.y) { M.stuck = 0; M.lx = me.x; M.ly = me.y; } else { M.stuck++; }
  M.myShots = M.myShots.filter(s => tick - s.tick < 8);

  // ---------- 1. 合并视野 + 记忆 ----------
  const oppTable = Object.create(null);
  for (const o of state.opponents) oppTable[o.id] = o;
  const enemies = Object.create(null);
  for (const v of state.radar.tanks) {
    const op = oppTable[v.id] || {};
    enemies[v.id] = {
      id: v.id,
      x: v.x, y: v.y, dir: v.dir,
      hp: v.hp, inv: v.invincibleTicks, hurt: v.hurtTicks, rapid: v.rapidTicks,
      points: op.points || 0, kills: op.kills || 0,
      lives: op.lives || 0, respawnTicks: op.respawnTicks || 0,
      onField: 1, lastSeenTick: tick, vx: 0, vy: 0,
    };
  }
  for (const id of Object.keys(M.seen)) {
    if (enemies[id]) {
      const prev = M.seen[id];
      const cur = enemies[id];
      const dt = tick - prev.lastSeenTick;
      if (dt === 1) {
        const dx = cur.x - prev.x, dy = cur.y - prev.y;
        cur.vx = abs(dx) <= 1 ? Math.sign(dx) : 0;
        cur.vy = abs(dy) <= 1 ? Math.sign(dy) : 0;
      }
    } else {
      const s = M.seen[id];
      const age = tick - s.lastSeenTick;
      if (age > 30) { delete M.seen[id]; continue; }
      enemies[id] = Object.assign({}, s, { confidence: Math.max(0, 1 - age / 30) });
    }
  }
  for (const id of Object.keys(enemies)) {
    if (enemies[id].onField) M.seen[id] = Object.assign({}, enemies[id]);
  }

  // ---------- 2. 选取主目标 ----------
  const myPoints = (() => {
    for (const sb of state.scoreboard) if (sb.id === me.id) return sb.points;
    return 0;
  })();
  const enemyList = Object.values(enemies).filter(e => e.onField);
  const leadPoints = Math.max(0, ...state.opponents.filter(o => o.lives > 0 && o.id !== me.id).map(o => o.points || 0));
  const late = tick >= 450;
  const lowHP = me.hp === 1;
  const conserve = (lowHP && myPoints >= leadPoints - 1);
  const urgent = late && myPoints < leadPoints;

  let mainTarget = null, bestScore = -1e9;
  for (const e of enemyList) {
    if (e.confidence !== undefined && e.confidence !== 1) continue;
    const d = cheb(me.x, me.y, e.x, e.y);
    let s = -d * 0.3;
    if (e.hp === 1) s += 80;
    if (e.respawnTicks > 0) s -= 250;
    if (e.inv > 0) s -= 60;
    if (e.points > leadPoints - 1) s += 25;
    if (lowHP && e.hp === 2) s -= 30;
    if (s > bestScore) { bestScore = s; mainTarget = e; }
  }

  // ---------- 3. 准备参数 ----------
  const zone = zoneAt(tick);
  const margin = marginAt(tick);
  const nextMargin = (tick >= ZONE_SHRINK && margin < ZONE_MAX) ? margin + 1 : null;
  const shrinkTick = nextMargin !== null ? ZONE_SHRINK + margin * ZONE_STEP : null;
  const needNextZone = shrinkTick !== null && (tick + 16 >= shrinkTick);
  const wantMin = needNextZone ? nextMargin : margin;
  const wantMax = needNextZone ? 25 - nextMargin : 25 - margin;
  const wantZone = { min: wantMin, max: wantMax };

  const staticGrid = new Uint8Array(N * N);
  for (const e of enemyList) {
    if (!e.onField) continue;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const cx = e.x + dx, cy = e.y + dy;
      if (cx >= 0 && cy >= 0 && cx < N && cy < N) staticGrid[cy * N + cx] = 1;
    }
  }

  // 子弹 forb（排除己方）
  const H = 4;
  const mergedForb = [[], [], [], [], []];
  for (const b of state.radar.bullets) {
    let isMine = false;
    for (let j = 0; j < M.myShots.length; j++) {
      const ms = M.myShots[j];
      if (ms.dir === b.dir && abs(ms.mx - b.x) < 6 && abs(ms.my - b.y) < 6
          && ms.tick >= b.tick - 2) { isMine = true; break; }
    }
    if (isMine) continue;
    const fb = bulletCells(state.map, b.x, b.y, b.dir, H);
    for (let tau = 1; tau <= H; tau++) {
      for (const c of fb[tau]) mergedForb[tau].push(c);
    }
  }
  let immediateThreat = false;
  for (let tau = 1; tau <= 3 && !immediateThreat; tau++) {
    for (const c of mergedForb[tau]) {
      if (bodyCovers(me.x, me.y, c.x, c.y)) { immediateThreat = true; break; }
    }
  }

  // ---------- 4. 紧急躲避 ----------
  if (immediateThreat) {
    const ev = solveEvade(me.x, me.y, H, mergedForb, state.map, staticGrid);
    if (ev.fd !== -1) {
      const nx = me.x + (ev.fd >= 0 ? DVEC[ev.fd][0] : 0);
      const ny = me.y + (ev.fd >= 0 ? DVEC[ev.fd][1] : 0);
      let fire = false;
      if (mainTarget && !mainTarget.inv && me.fireCooldown === 0 && !me.invincibleTicks) {
        for (let d = 0; d < 4; d++) {
          const mu = muzzleOf(nx, ny, d);
          if (mu.x < 0 || mu.y < 0) continue;
          if (lineHitsPos(state.map, mu.x, mu.y, d, mainTarget.x, mainTarget.y, 20)) {
            fire = true;
            M.myShots.push({ tick, mx: mu.x, my: mu.y, dir: d });
            break;
          }
        }
      }
      return { move: DNAME[ev.fd], fire, intent: 'retreat' };
    }
    for (let d = 0; d < 4; d++) {
      const nx = me.x + DVEC[d][0], ny = me.y + DVEC[d][1];
      if (!bodyFits(nx, ny)) continue;
      if (!bodyPass(state.map, nx, ny)) continue;
      if (bodyCoversGrid(nx, ny, staticGrid)) continue;
      let safe = true;
      for (let tau = 1; tau <= 2 && safe; tau++) {
        for (const c of mergedForb[tau]) {
          if (bodyCovers(nx, ny, c.x, c.y)) safe = false;
        }
      }
      if (safe) return { move: DNAME[d], fire: false, intent: 'retreat' };
    }
  }

  // ---------- 5. 简易目标位置 ----------
  let goalX = me.x, goalY = me.y;
  if (!inZone(me.x, me.y, wantZone)) {
    const zx = Math.round((wantZone.min + wantZone.max - 1) / 2);
    goalX = zx; goalY = zx;
  } else if (mainTarget) {
    const d = cheb(me.x, me.y, mainTarget.x, mainTarget.y);
    if (conserve) {
      // 极保守：远离所有人，朝 zone 中心偏外
      const zx = Math.round((wantZone.min + wantZone.max - 1) / 2);
      goalX = zx + ((tick % 2) ? 2 : -2);
      goalY = zx + ((tick * 3) % 2 ? 2 : -2);
    } else if (d > 4) {
      // 主动拉近：朝目标方向走 1 格
      const dx = mainTarget.x - me.x, dy = mainTarget.y - me.y;
      if (abs(dx) > abs(dy)) {
        goalX = me.x + Math.sign(dx);
        goalY = me.y;
      } else if (abs(dy) > 0) {
        goalX = me.x;
        goalY = me.y + Math.sign(dy);
      }
    } else if (d <= 2) {
      // 太近且不开火：横移
      const left = (me.dir + 3) % 4;
      goalX = me.x + DVEC[left][0];
      goalY = me.y + DVEC[left][1];
    }
  } else {
    const zx = Math.round((wantZone.min + wantZone.max - 1) / 2);
    goalX = zx + ((tick * 7) % 3) - 1;
    goalY = zx + ((tick * 13) % 3) - 1;
  }
  goalX = Math.max(wantZone.min, Math.min(wantZone.max - 1, goalX));
  goalY = Math.max(wantZone.min, Math.min(wantZone.max - 1, goalY));

  // ---------- 6. 单元评分（择优格） ----------
  const occupied = enemyList.map(e => ({ x: e.x, y: e.y }));
  const candidates = [];
  const tryCell = (x, y) => {
    if (!bodyFits(x, y)) return;
    if (!bodyPass(state.map, x, y)) return;
    if (occupied.some(e => bodyOverlap(x, y, e.x, e.y))) return;
    if (!inZone(x, y, wantZone)) return;
    candidates.push({ x, y });
  };
  tryCell(me.x, me.y);
  for (let d = 0; d < 4; d++) tryCell(me.x + DVEC[d][0], me.y + DVEC[d][1]);

  if (candidates.length === 0) {
    let fire = false;
    if (mainTarget && !mainTarget.inv && me.fireCooldown === 0 && !me.invincibleTicks) {
      for (let d = 0; d < 4; d++) {
        const mu = muzzleOf(me.x, me.y, d);
        if (mu.x < 0 || mu.y < 0) continue;
        if (lineHitsPos(state.map, mu.x, mu.y, d, mainTarget.x, mainTarget.y, 20)) { fire = true; break; }
      }
    }
    return { move: 'stay', fire, intent: 'hold' };
  }

  // 主目标 aim（领导弹）
  let aimX = me.x, aimY = me.y, aimDir = -1;
  if (mainTarget) {
    const dToTarget = cheb(me.x, me.y, mainTarget.x, mainTarget.y);
    const bytes = Math.max(0, Math.ceil((dToTarget - 1) / 3) - 1);
    const lead = Math.min(2, Math.max(0, bytes));
    aimX = Math.max(0, Math.min(24, mainTarget.x + (mainTarget.vx || 0) * lead));
    aimY = Math.max(0, Math.min(24, mainTarget.y + (mainTarget.vy || 0) * lead));
    for (let d = 0; d < 4; d++) {
      const mu = muzzleOf(me.x, me.y, d);
      if (mu.x < 0 || mu.y < 0) continue;
      if (lineHitsPos(state.map, mu.x, mu.y, d, aimX, aimY, 20)) { aimDir = d; break; }
    }
  }

  const canFireNow = mainTarget && !mainTarget.inv && me.fireCooldown === 0 && !me.invincibleTicks;

  let best = null;
  for (const c of candidates) {
    let score = 0;

    // 风险
    let risk = 0;
    for (let tau = 0; tau <= 3; tau++) {
      for (const cell of mergedForb[tau]) {
        if (bodyCovers(c.x, c.y, cell.x, cell.y)) risk += (4 - tau) * 30;
      }
    }
    for (const e of enemyList) {
      if (!e.onField || e.inv > 0) continue;
      const mu = muzzleOf(e.x, e.y, e.dir);
      if (mu.x < 0 || mu.y < 0) continue;
      if (lineHitsPos(state.map, mu.x, mu.y, e.dir, c.x, c.y, 4)) risk += 22;
      else if (lineHitsPos(state.map, mu.x, mu.y, e.dir, c.x, c.y, 9)) risk += 6;
    }
    if (lowHP) risk *= 1.4;
    if (conserve) risk *= 1.5;
    score -= risk * 0.08;

    // 距离 / 目标
    if (mainTarget) {
      const d = cheb(c.x, c.y, aimX, aimY);
      if (conserve) {
        // 极保守：远离目标
        score -= d * 3;
      } else if (d > 6) score -= (d - 6) * 4;
      else if (d > 3) score += 16 - (d - 3) * 3;   // 4: 16, 5: 13, 6: 10
      else if (d >= 2) score += 14;
      else score += 6;

      if (canFireNow) {
        for (let d = 0; d < 4; d++) {
          const mu = muzzleOf(c.x, c.y, d);
          if (mu.x < 0 || mu.y < 0) continue;
          if (lineHitsPos(state.map, mu.x, mu.y, d, aimX, aimY, 20)) {
            let hit = 1.0;
            if (mainTarget.hurt > 0) hit = 0.3;
            if (mainTarget.inv > 0) hit = 0;
            score += hit * (mainTarget.hp === 1 ? 70 : 45);
            break;
          }
        }
      }
    } else {
      const zx = Math.round((wantZone.min + wantZone.max - 1) / 2);
      const dCenter = cheb(c.x, c.y, zx, zx);
      score -= dCenter * 0.4;
    }

    // 草丛加成
    let inGrass = false;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const cx = c.x + dx, cy = c.y + dy;
      if (cx >= 0 && cy >= 0 && cx < N && cy < N && state.map[cy][cx] === 4) inGrass = true;
    }
    if (inGrass) score += 5;

    // 缩圈惩罚
    const edge = Math.min(c.x - wantZone.min, c.y - wantZone.min, wantZone.max - (c.x + 1), wantZone.max - (c.y + 1));
    if (edge < 0) score -= 200;
    else if (edge < 1) score -= 22;
    else if (edge < 2) score -= 6;

    if (c.x === me.x && c.y === me.y && M.stuck > 6) score -= 4;

    if (best === null || score > best.score) {
      best = { cell: c, score };
    }
  }

  // ---------- 7. 输出 ----------
  const chosen = best.cell;
  let moveName = 'stay';
  if (chosen.x !== me.x || chosen.y !== me.y) {
    const dx = chosen.x - me.x, dy = chosen.y - me.y;
    if (dx === 1) moveName = 'right';
    else if (dx === -1) moveName = 'left';
    else if (dy === 1) moveName = 'down';
    else if (dy === -1) moveName = 'up';
  }

  let fire = false;
  if (canFireNow && aimDir != -1) {
    const mu = muzzleOf(chosen.x, chosen.y, aimDir);
    if (mu.x >= 0 && mu.y >= 0
        && lineHitsPos(state.map, mu.x, mu.y, aimDir, aimX, aimY, 20)) {
      fire = true;
      M.myShots.push({ tick, mx: mu.x, my: mu.y, dir: aimDir });
    }
  }
  if (conserve) fire = false;

  let intent = 'advance';
  if (conserve) intent = 'retreat';
  else if (urgent) intent = 'pursue';
  else if (mainTarget) {
    const d = cheb(me.x, me.y, mainTarget.x, mainTarget.y);
    if (d <= 5) intent = mainTarget.hp === 1 ? 'pursue' : 'siege';
    else intent = 'pursue';
  }

  const VALID_INTENT = ['advance', 'flank', 'hold', 'pursue', 'retreat', 'resupply', 'defend', 'siege'];
  return { move: moveName, fire, intent: VALID_INTENT.includes(intent) ? intent : 'hold' };
}