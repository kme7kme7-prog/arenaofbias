'use strict';
// ============================================================================
// Apex Warden (apex-warden) v7 - 四人坦克乱斗 2.6.0 独立参赛 AI
// 核心架构：
// 1. IIFE 词法闭包 + 预分配一维类型化数组（消除 Node VM Contextify 全局拦截器与 GC 开销）
// 2. 逐拍精确无敌/受击缓冲衰减模型（tau 级精确计算 hurtTicks 与 invincibleTicks 过期窗口）
// 3. 2x2 炮口非对称几何定理（持续锁定 tx+1 / ty+1 黄金单向白嫖槽压制，仅在同轴线 tx/ty 开火后横移闪避）
// 4. 多目标反夹击斥力场 + 末命保分铁律 + 缩圈临近硬约束防卡圈 + 补给 15 拍预告期抢占
// ============================================================================

const __apexWardenDecide = (function () {
  const GRID_N = 26;
  const POS_N = 25;
  const DIR_DX = new Int8Array([0, 1, 0, -1]);
  const DIR_DY = new Int8Array([-1, 0, 1, 0]);
  const DIR_NAMES = ['up', 'right', 'down', 'left'];
  const EVADE_HORIZON = 6;
  const MAX_AIM_TICKS = 6;
  const MathRef = Math;

  const FLAT_MAP = new Uint8Array(GRID_N * GRID_N);
  const PASSABLE_BASE = new Uint8Array(POS_N * POS_N);
  const PASSABLE_NOW = new Uint8Array(POS_N * POS_N);
  const PASSABLE_PLAN = new Uint8Array(POS_N * POS_N);
  const PASSABLE_OTHER = new Uint8Array(POS_N * POS_N);

  const BASE_DANGER_MASK = new Uint8Array(GRID_N * GRID_N);
  const TEMP_DANGER_MASK = new Uint8Array(GRID_N * GRID_N);
  const IMMINENT_MUZZLE_GRID = new Uint8Array(GRID_N * GRID_N);
  const STATIC_NOW_GRID = new Uint8Array(GRID_N * GRID_N);
  const STATIC_PLAN_GRID = new Uint8Array(GRID_N * GRID_N);

  const SURV_CUR = new Int8Array(POS_N * POS_N);
  const SURV_NEXT = new Int8Array(POS_N * POS_N);
  const SURV_LIST_A = new Int16Array(POS_N * POS_N);
  const SURV_LIST_B = new Int16Array(POS_N * POS_N);

  const BFS_QX = new Int8Array(POS_N * POS_N);
  const BFS_QY = new Int8Array(POS_N * POS_N);

  let MEM = null;

  function createMemory() {
    return {
      lastTick: -1,
      lives: 3,
      prevHp: 2,
      seen: Object.create(null),
      myShots: [],
      enemyShotTick: Object.create(null),
      lastPos: { x: -1, y: -1 },
      lastMoveDir: -1,
      stuckCount: 0,
      targetId: null,
      targetTick: -99,
      hitEvadeUntil: -1,
      lastFireTick: -99,
      lastFireExposedAxis: false,
      trail: []
    };
  }

  function absVal(v) {
    return v < 0 ? -v : v;
  }

  function chebDist(ax, ay, bx, by) {
    const dx = absVal(ax - bx);
    const dy = absVal(ay - by);
    return dx > dy ? dx : dy;
  }

  function manhattanDist(ax, ay, bx, by) {
    return absVal(ax - bx) + absVal(ay - by);
  }

  function hashMix(n) {
    n = (n ^ (n >>> 16)) >>> 0;
    n = MathRef.imul(n, 0x45d9f3b) >>> 0;
    return (n ^ (n >>> 16)) >>> 0;
  }

  function computeZone(tick) {
    const margin = tick < 200 ? 0 : MathRef.min(9, 2 + ((tick - 200) / 50 | 0));
    const nextShrinkTick = margin >= 9 ? null : (tick < 200 ? 200 : 200 + (((tick - 200) / 50 | 0) + 1) * 50);
    const nextMin = margin === 0 ? 2 : MathRef.min(9, margin + 1);
    return { min: margin, max: 25 - margin, nextShrinkTick: nextShrinkTick, nextMin: nextMin };
  }

  function inSafeZone(x, y, zone) {
    return x >= zone.min && y >= zone.min && x + 1 <= zone.max && y + 1 <= zone.max;
  }

  function validTankPos(x, y) {
    return x >= 0 && y >= 0 && x <= 24 && y <= 24;
  }

  function getMuzzleX(x, dir) {
    return dir === 1 ? x + 2 : (dir === 3 ? x - 1 : x);
  }

  function getMuzzleY(y, dir) {
    return dir === 2 ? y + 2 : (dir === 0 ? y - 1 : y);
  }

  function tankTouchesGrassFlat(x, y) {
    const row0 = y * GRID_N + x;
    const row1 = row0 + GRID_N;
    return (
      FLAT_MAP[row0] === 4 ||
      FLAT_MAP[row0 + 1] === 4 ||
      FLAT_MAP[row1] === 4 ||
      FLAT_MAP[row1 + 1] === 4
    );
  }

  function tankHitsGrid(x, y, grid) {
    const row0 = y * GRID_N + x;
    const row1 = row0 + GRID_N;
    return (
      grid[row0] !== 0 ||
      grid[row0 + 1] !== 0 ||
      grid[row1] !== 0 ||
      grid[row1 + 1] !== 0
    );
  }

  function tankHitsMaskAtTau(x, y, maskGrid, bit) {
    const row0 = y * GRID_N + x;
    const row1 = row0 + GRID_N;
    return (
      ((maskGrid[row0] |
        maskGrid[row0 + 1] |
        maskGrid[row1] |
        maskGrid[row1 + 1]) & bit) !== 0
    );
  }

  function buildFlatMapAndPassable(map, state) {
    for (let y = 0; y < GRID_N; y++) {
      const row = map[y];
      const base = y * GRID_N;
      for (let x = 0; x < GRID_N; x++) {
        FLAT_MAP[base + x] = row[x];
      }
    }

    STATIC_NOW_GRID.fill(0);
    STATIC_PLAN_GRID.fill(0);
    const markTank = function (grid, tx, ty) {
      if (!validTankPos(tx, ty)) return;
      const r0 = ty * GRID_N + tx;
      const r1 = r0 + GRID_N;
      grid[r0] = 1;
      grid[r0 + 1] = 1;
      grid[r1] = 1;
      grid[r1 + 1] = 1;
    };

    const visible = (state.radar && state.radar.tanks) || [];
    for (let i = 0; i < visible.length; i++) {
      markTank(STATIC_NOW_GRID, visible[i].x, visible[i].y);
      markTank(STATIC_PLAN_GRID, visible[i].x, visible[i].y);
    }
    const t = state.tick;
    for (const id in MEM.seen) {
      const m = MEM.seen[id];
      if (t - m.tick > 0 && t - m.tick <= 3) {
        markTank(STATIC_PLAN_GRID, m.x, m.y);
      }
    }

    for (let y = 0; y < POS_N; y++) {
      const r0 = y * GRID_N;
      const r1 = r0 + GRID_N;
      const pBase = y * POS_N;
      for (let x = 0; x < POS_N; x++) {
        const c00 = FLAT_MAP[r0 + x];
        const c01 = FLAT_MAP[r0 + x + 1];
        const c10 = FLAT_MAP[r1 + x];
        const c11 = FLAT_MAP[r1 + x + 1];
        const terOk = (c00 === 0 || c00 === 4) &&
                      (c01 === 0 || c01 === 4) &&
                      (c10 === 0 || c10 === 4) &&
                      (c11 === 0 || c11 === 4);
        PASSABLE_BASE[pBase + x] = terOk ? 1 : 0;
        PASSABLE_NOW[pBase + x] = (terOk && !tankHitsGrid(x, y, STATIC_NOW_GRID)) ? 1 : 0;
        PASSABLE_PLAN[pBase + x] = (terOk && !tankHitsGrid(x, y, STATIC_PLAN_GRID)) ? 1 : 0;
      }
    }
  }

  function stampBulletLaneMask(mx, my, dir, maxTau, maskGrid) {
    if (mx < 0 || my < 0 || mx >= GRID_N || my >= GRID_N) return 0;
    const idx0 = my * GRID_N + mx;
    maskGrid[idx0] |= 2;
    const t0 = FLAT_MAP[idx0];
    if (t0 === 1 || t0 === 2) return 1;

    let cx = mx;
    let cy = my;
    const dx = DIR_DX[dir];
    const dy = DIR_DY[dir];
    const maxSteps = 3 * maxTau;
    let steps = 0;
    for (let s = 1; s <= maxSteps; s++) {
      cx += dx;
      cy += dy;
      if (cx < 0 || cy < 0 || cx >= GRID_N || cy >= GRID_N) break;
      const tau = ((s - 1) / 3 | 0) + 1;
      const cIdx = cy * GRID_N + cx;
      maskGrid[cIdx] |= (1 << tau);
      steps = s;
      const ter = FLAT_MAP[cIdx];
      if (ter === 1 || ter === 2) break;
    }
    return steps + 1;
  }

  function solveSurvivalFast(sx, sy, horizon, maskGrid, passableGrid, baseTick, checkZoneTick, initHurt, initInv) {
    const reach = [0, 0, 0, 0, 0];
    const branchCount = [0, 0, 0, 0, 0];

    SURV_CUR.fill(-3);
    const startKey = sy * POS_N + sx;
    SURV_CUR[startKey] = -2;
    SURV_LIST_A[0] = startKey;
    let curLen = 1;

    for (let tau = 1; tau <= horizon; tau++) {
      const bit = 1 << tau;
      const simTick = baseTick + tau - 1;
      const enforceZone = checkZoneTick && simTick >= 200 && (simTick % 10 === 0);
      const z = enforceZone ? computeZone(simTick) : null;
      const immuneAtTau = (initHurt - tau >= 1) || (initInv - (tau - 1) >= 1);

      SURV_NEXT.fill(-3);
      let nextLen = 0;

      for (let i = 0; i < curLen; i++) {
        const posKey = SURV_LIST_A[i];
        const rootDir = SURV_CUR[posKey];
        const px = posKey % POS_N;
        const py = (posKey - px) / POS_N;

        for (let d = -1; d < 4; d++) {
          let nx = px;
          let ny = py;
          if (d >= 0) {
            nx += DIR_DX[d];
            ny += DIR_DY[d];
            if (nx < 0 || ny < 0 || nx >= POS_N || ny >= POS_N) continue;
            if (passableGrid[ny * POS_N + nx] === 0) continue;
          }
          if (!immuneAtTau && tankHitsMaskAtTau(nx, ny, maskGrid, bit)) continue;
          if (enforceZone && !inSafeZone(nx, ny, z)) continue;

          const firstDir = rootDir === -2 ? d : rootDir;
          const rIdx = firstDir + 1;
          if (reach[rIdx] < tau) reach[rIdx] = tau;

          const nKey = ny * POS_N + nx;
          if (SURV_NEXT[nKey] === -3) {
            SURV_NEXT[nKey] = firstDir;
            SURV_LIST_B[nextLen++] = nKey;
          }
        }
      }

      if (nextLen === 0) {
        return { alive: false, reach: reach, branchCount: branchCount, survivorCount: 0 };
      }

      for (let i = 0; i < nextLen; i++) {
        const k = SURV_LIST_B[i];
        SURV_LIST_A[i] = k;
        SURV_CUR[k] = SURV_NEXT[k];
      }
      curLen = nextLen;
    }

    for (let i = 0; i < curLen; i++) {
      const rIdx = SURV_CUR[SURV_LIST_A[i]] + 1;
      if (rIdx >= 0 && rIdx < 5) branchCount[rIdx]++;
    }

    return {
      alive: true,
      reach: reach,
      branchCount: branchCount,
      survivorCount: curLen
    };
  }

  function computeDistFieldFast(goals, passableGrid) {
    const dist = new Int16Array(POS_N * POS_N);
    dist.fill(-1);
    let head = 0;
    let tail = 0;

    for (let i = 0; i < goals.length; i++) {
      const g = goals[i];
      if (!validTankPos(g.x, g.y)) continue;
      const idx = g.y * POS_N + g.x;
      if (passableGrid[idx] === 0) continue;
      if (dist[idx] < 0) {
        dist[idx] = 0;
        BFS_QX[tail] = g.x;
        BFS_QY[tail] = g.y;
        tail++;
      }
    }

    while (head < tail) {
      const cx = BFS_QX[head];
      const cy = BFS_QY[head];
      head++;
      const cd = dist[cy * POS_N + cx];
      for (let d = 0; d < 4; d++) {
        const nx = cx - DIR_DX[d];
        const ny = cy - DIR_DY[d];
        if (nx < 0 || ny < 0 || nx >= POS_N || ny >= POS_N) continue;
        const nIdx = ny * POS_N + nx;
        if (dist[nIdx] >= 0 || passableGrid[nIdx] === 0) continue;
        dist[nIdx] = cd + 1;
        BFS_QX[tail] = nx;
        BFS_QY[tail] = ny;
        tail++;
      }
    }
    return dist;
  }

  function updateEnemyMemory(state) {
    const t = state.tick;
    const visible = (state.radar && state.radar.tanks) || [];
    for (let i = 0; i < visible.length; i++) {
      const e = visible[i];
      const prev = MEM.seen[e.id];
      const dt = prev ? t - prev.tick : 99;
      let vx = 0;
      let vy = 0;
      if (prev && dt >= 1 && dt <= 3) {
        const dx = e.x - prev.x;
        const dy = e.y - prev.y;
        if (absVal(dx) + absVal(dy) <= dt) {
          vx = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
          vy = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
        }
      }
      MEM.seen[e.id] = {
        id: e.id,
        x: e.x,
        y: e.y,
        dir: e.dir,
        hp: e.hp,
        maxHp: e.maxHp,
        invincibleTicks: e.invincibleTicks,
        hurtTicks: e.hurtTicks,
        rapidTicks: e.rapidTicks,
        vx: vx,
        vy: vy,
        tick: t
      };
    }
    const opps = state.opponents || [];
    for (let i = 0; i < opps.length; i++) {
      const o = opps[i];
      if (o.lives <= 0 || o.respawnTicks > 0 || o.status !== 'active') {
        delete MEM.seen[o.id];
      }
    }
  }

  function classifyBullets(state) {
    const t = state.tick;
    const radarBullets = (state.radar && state.radar.bullets) || [];
    const activeShots = [];
    for (let i = 0; i < MEM.myShots.length; i++) {
      if (t - MEM.myShots[i].tick <= 10) {
        activeShots.push(MEM.myShots[i]);
      }
    }
    MEM.myShots = activeShots;

    const matchedBullet = new Uint8Array(radarBullets.length);
    let matchedCount = 0;

    for (let i = 0; i < MEM.myShots.length; i++) {
      const s = MEM.myShots[i];
      const age = t - s.tick;
      const expX = s.x + DIR_DX[s.dir] * 3 * age;
      const expY = s.y + DIR_DY[s.dir] * 3 * age;
      for (let j = 0; j < radarBullets.length; j++) {
        if (matchedBullet[j]) continue;
        const b = radarBullets[j];
        if (b.dir === s.dir && b.x === expX && b.y === expY) {
          matchedBullet[j] = 1;
          matchedCount++;
          break;
        }
      }
    }

    let inFlight = matchedCount;
    for (let i = 0; i < MEM.myShots.length; i++) {
      if (t - MEM.myShots[i].tick === 1 && matchedCount === 0 && state.self.fireCooldown >= 3) {
        inFlight = MathRef.max(inFlight, 1);
      }
    }

    const enemyBullets = [];
    const visible = (state.radar && state.radar.tanks) || [];
    for (let j = 0; j < radarBullets.length; j++) {
      if (matchedBullet[j]) continue;
      const b = radarBullets[j];
      enemyBullets.push(b);
      for (let k = 0; k < visible.length; k++) {
        const e = visible[k];
        if (e.dir !== b.dir) continue;
        const mx = getMuzzleX(e.x, e.dir);
        const my = getMuzzleY(e.y, e.dir);
        const dx = DIR_DX[e.dir];
        const dy = DIR_DY[e.dir];
        const along = (b.x - mx) * dx + (b.y - my) * dy;
        const cross = absVal((b.x - mx) * dy - (b.y - my) * dx);
        if (cross <= 1 && along >= 2 && along <= 4) {
          MEM.enemyShotTick[e.id] = t - 1;
        }
      }
    }

    const pulse = !!(state.arena && state.arena.radarPulse);
    if (!pulse) {
      for (let k = 0; k < visible.length; k++) {
        const e = visible[k];
        if (chebDist(state.self.x, state.self.y, e.x, e.y) > 6) {
          if (!MEM.enemyShotTick[e.id] || t - MEM.enemyShotTick[e.id] > 8) {
            MEM.enemyShotTick[e.id] = t - 1;
          }
        }
      }
    }

    return { inFlight: inFlight, enemyBullets: enemyBullets };
  }

  function getScoreStatus(state) {
    const sb = state.scoreboard || [];
    const myId = state.self.id;
    let myRow = null;
    let maxOtherPoints = -1;
    let maxOtherKills = -1;
    let maxMultiLifePoints = -1;
    let aliveOpponents = 0;
    let leaderId = null;

    for (let i = 0; i < sb.length; i++) {
      const r = sb[i];
      if (r.id === myId) {
        myRow = r;
      } else if (r.status !== 'error' && r.status !== 'timeout' && r.lives > 0) {
        aliveOpponents++;
        if (r.points > maxOtherPoints || (r.points === maxOtherPoints && r.kills > maxOtherKills)) {
          maxOtherPoints = r.points;
          maxOtherKills = r.kills;
          leaderId = r.id;
        }
        if (r.lives >= 2 && r.points > maxMultiLifePoints) {
          maxMultiLifePoints = r.points;
        }
      }
    }

    const myPoints = myRow ? myRow.points : 0;
    const myKills = myRow ? myRow.kills : 0;
    const soleLeader = aliveOpponents === 0 || myPoints > maxOtherPoints || (myPoints === maxOtherPoints && myKills > maxOtherKills);
    const margin = myPoints - MathRef.max(0, maxOtherPoints);
    return {
      myPoints: myPoints,
      myKills: myKills,
      maxOtherPoints: MathRef.max(0, maxOtherPoints),
      maxMultiLifePoints: MathRef.max(0, maxMultiLifePoints),
      aliveOpponents: aliveOpponents,
      soleLeader: soleLeader,
      margin: margin,
      leaderId: leaderId
    };
  }

  function canInterceptBullet(sx, sy, dir, enemyBullets) {
    const mx = getMuzzleX(sx, dir);
    const my = getMuzzleY(sy, dir);
    if (mx < 0 || my < 0 || mx >= GRID_N || my >= GRID_N) return false;
    TEMP_DANGER_MASK.fill(0);
    stampBulletLaneMask(mx, my, dir, 2, TEMP_DANGER_MASK);
    const oppDir = (dir + 2) % 4;
    const dx = DIR_DX[oppDir];
    const dy = DIR_DY[oppDir];

    for (let i = 0; i < enemyBullets.length; i++) {
      const b = enemyBullets[i];
      if (b.dir !== oppDir) continue;
      let cx = b.x;
      let cy = b.y;
      if ((TEMP_DANGER_MASK[cy * GRID_N + cx] & 2) !== 0) return true;
      for (let s = 1; s <= 6; s++) {
        cx += dx;
        cy += dy;
        if (cx < 0 || cy < 0 || cx >= GRID_N || cy >= GRID_N) break;
        const tau = s <= 3 ? 1 : 2;
        const cIdx = cy * GRID_N + cx;
        if ((TEMP_DANGER_MASK[cIdx] & (1 << tau)) !== 0) return true;
        const ter = FLAT_MAP[cIdx];
        if (ter === 1 || ter === 2) break;
      }
    }
    return false;
  }

  function buildImminentMuzzleGrid(visible, tick) {
    IMMINENT_MUZZLE_GRID.fill(0);
    for (let i = 0; i < visible.length; i++) {
      const e = visible[i];
      if (e.invincibleTicks > 1) continue;
      const lastShot = MEM.enemyShotTick[e.id] || -99;
      const minCd = e.rapidTicks > 0 ? 3 : 4;
      if (tick - lastShot < minCd) continue;

      const mx = getMuzzleX(e.x, e.dir);
      const my = getMuzzleY(e.y, e.dir);
      if (mx < 0 || my < 0 || mx >= GRID_N || my >= GRID_N) continue;
      const idx0 = my * GRID_N + mx;
      IMMINENT_MUZZLE_GRID[idx0] = 1;
      const t0 = FLAT_MAP[idx0];
      if (t0 === 1 || t0 === 2) continue;
      let cx = mx;
      let cy = my;
      const dx = DIR_DX[e.dir];
      const dy = DIR_DY[e.dir];
      for (let s = 1; s <= 3; s++) {
        cx += dx;
        cy += dy;
        if (cx < 0 || cy < 0 || cx >= GRID_N || cy >= GRID_N) break;
        const cIdx = cy * GRID_N + cx;
        IMMINENT_MUZZLE_GRID[cIdx] = 1;
        const ter = FLAT_MAP[cIdx];
        if (ter === 1 || ter === 2) break;
      }
    }
  }

  function evaluateAllShots(state, sx, sy, scoreInfo) {
    const visible = (state.radar && state.radar.tanks) || [];
    const best = { dir: -1, targetId: null, grade: -1, score: -1e9, tau: 99, asymmetricSafe: false };
    if (visible.length === 0) return best;

    const t = state.tick;
    const self = state.self;
    const myTotalHp = self.hp + (self.lives - 1) * 2;

    for (let i = 0; i < visible.length; i++) {
      const e = visible[i];
      const memE = MEM.seen[e.id] || { vx: 0, vy: 0 };
      let eLives = 3;
      let ePoints = 0;
      const sb = state.scoreboard || [];
      for (let s = 0; s < sb.length; s++) {
        if (sb[s].id === e.id) {
          eLives = sb[s].lives;
          ePoints = sb[s].points;
          break;
        }
      }

      PASSABLE_OTHER.set(PASSABLE_BASE);
      for (let py = 0; py < POS_N; py++) {
        for (let px = 0; px < POS_N; px++) {
          if (PASSABLE_OTHER[py * POS_N + px] === 0) continue;
          if (px < sx + 2 && px + 2 > sx && py < sy + 2 && py + 2 > sy) {
            PASSABLE_OTHER[py * POS_N + px] = 0;
            continue;
          }
          for (let j = 0; j < visible.length; j++) {
            if (j === i) continue;
            const o = visible[j];
            if (px < o.x + 2 && px + 2 > o.x && py < o.y + 2 && py + 2 > o.y) {
              PASSABLE_OTHER[py * POS_N + px] = 0;
              break;
            }
          }
        }
      }

      const predX = MathRef.max(0, MathRef.min(24, e.x + memE.vx));
      const predY = MathRef.max(0, MathRef.min(24, e.y + memE.vy));

      for (let d = 0; d < 4; d++) {
        const mx = getMuzzleX(sx, d);
        const my = getMuzzleY(sy, d);
        if (mx < 0 || my < 0 || mx >= GRID_N || my >= GRID_N) continue;
        const t0 = FLAT_MAP[my * GRID_N + mx];
        if (t0 === 1 || t0 === 2) continue;

        let hitIdxNow = -1;
        let hitIdxPred = -1;
        if (mx >= e.x && mx <= e.x + 1 && my >= e.y && my <= e.y + 1) hitIdxNow = 0;
        if (mx >= predX && mx <= predX + 1 && my >= predY && my <= predY + 1) hitIdxPred = 0;

        let cx = mx;
        let cy = my;
        const dx = DIR_DX[d];
        const dy = DIR_DY[d];
        const maxSteps = 3 * MAX_AIM_TICKS;
        for (let s = 1; s <= maxSteps; s++) {
          cx += dx;
          cy += dy;
          if (cx < 0 || cy < 0 || cx >= GRID_N || cy >= GRID_N) break;
          if (hitIdxNow < 0 && cx >= e.x && cx <= e.x + 1 && cy >= e.y && cy <= e.y + 1) {
            hitIdxNow = s;
          }
          if (hitIdxPred < 0 && cx >= predX && cx <= predX + 1 && cy >= predY && cy <= predY + 1) {
            hitIdxPred = s;
          }
          const ter = FLAT_MAP[cy * GRID_N + cx];
          if (ter === 1 || ter === 2) break;
        }

        if (hitIdxNow < 0 && hitIdxPred < 0) continue;
        const hitIdx = hitIdxNow >= 0 ? hitIdxNow : hitIdxPred;
        const arrivalTau = hitIdx === 0 ? 1 : ((hitIdx - 1) / 3 | 0) + 1;

        if (e.hurtTicks - arrivalTau > 0) continue;
        if (e.invincibleTicks - (arrivalTau - 1) > 0) continue;

        const asymmetricSafe = ((d === 0 || d === 2) && sx === e.x + 1) || ((d === 1 || d === 3) && sy === e.y + 1);

        const H = MathRef.min(4, MathRef.max(1, arrivalTau + 1));
        TEMP_DANGER_MASK.set(BASE_DANGER_MASK);
        stampBulletLaneMask(mx, my, d, H, TEMP_DANGER_MASK);

        const evade = solveSurvivalFast(e.x, e.y, H, TEMP_DANGER_MASK, PASSABLE_OTHER, t, true, e.hurtTicks, e.invincibleTicks);
        let blockedBranches = 0;
        for (let b = 0; b < 5; b++) {
          if (evade.reach[b] < H) blockedBranches++;
        }

        const isKill = e.hp === 1;
        const isLeader = e.id === scoreInfo.leaderId || ePoints >= scoreInfo.maxOtherPoints;
        const lastShot = MEM.enemyShotTick[e.id] || -99;
        const enemyOnCooldown = (t - lastShot) <= 4;
        const enemyTurnedAway = e.dir !== (d + 2) % 4;
        let distracted = false;
        for (let j = 0; j < visible.length; j++) {
          if (j !== i && chebDist(visible[j].x, visible[j].y, e.x, e.y) <= 6) {
            distracted = true;
            break;
          }
        }

        let grade = 0;
        if (!evade.alive) {
          grade = isKill ? 4 : 3;
        } else if (hitIdxNow >= 0 && hitIdxNow <= 3) {
          grade = isKill ? 3 : 2;
        } else if (blockedBranches >= 3 && arrivalTau <= 2) {
          grade = isKill ? 3 : 2;
        } else if (arrivalTau <= 3 && (hitIdxNow >= 0 || hitIdxPred >= 0)) {
          if (asymmetricSafe || isKill || enemyOnCooldown || enemyTurnedAway || distracted || self.rapidTicks > 0 || scoreInfo.margin <= 0 || myTotalHp >= e.hp + (eLives - 1) * 2) {
            grade = 1;
          }
        }

        if (grade <= 0) continue;

        let shotScore = grade * 100;
        if (isKill) shotScore += 110;
        if (asymmetricSafe) shotScore += 55;
        if (isLeader) shotScore += 32;
        if (e.id === MEM.targetId) shotScore += 18;
        if (d === self.dir) shotScore += 55;
        if (hitIdxNow >= 0 && hitIdxPred >= 0) shotScore += 26;
        shotScore += blockedBranches * 13;
        shotScore -= arrivalTau * 15;
        if (enemyOnCooldown) shotScore += 18;
        if (enemyTurnedAway) shotScore += 15;

        if (shotScore > best.score) {
          best.dir = d;
          best.targetId = e.id;
          best.grade = grade;
          best.score = shotScore;
          best.tau = arrivalTau;
          best.asymmetricSafe = asymmetricSafe;
        }
      }
    }

    return best;
  }

  function evaluateSupply(state, sx, sy, zonePlan) {
    const box = state.arena && state.arena.supply;
    if (!box) return null;
    const t = state.tick;
    const self = state.self;
    if (t + 2 >= box.expireTick) return null;
    if (!inSafeZone(box.x, box.y, zonePlan)) return null;
    if (box.type === 'repair' && self.hp >= self.maxHp) return null;

    const goals = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = box.x + dx;
        const gy = box.y + dy;
        if (validTankPos(gx, gy) && PASSABLE_PLAN[gy * POS_N + gx] !== 0 && inSafeZone(gx, gy, zonePlan)) {
          goals.push({ x: gx, y: gy });
        }
      }
    }
    if (goals.length === 0) return null;

    const dist = computeDistFieldFast(goals, PASSABLE_PLAN);
    const myEta = dist[sy * POS_N + sx];
    if (myEta < 0) return null;
    const waitTicks = MathRef.max(0, box.appearTick - t);
    const effectiveEta = MathRef.max(myEta, waitTicks);
    if (t + effectiveEta >= box.expireTick - 1) return null;

    let minEnemyDist = 999;
    let enemiesNearBox = 0;
    const visible = (state.radar && state.radar.tanks) || [];
    for (let i = 0; i < visible.length; i++) {
      const d = manhattanDist(visible[i].x, visible[i].y, box.x, box.y);
      if (d < minEnemyDist) minEnemyDist = d;
      if (d <= 6) enemiesNearBox++;
    }
    for (const id in MEM.seen) {
      const m = MEM.seen[id];
      if (t - m.tick > 10) continue;
      const d = manhattanDist(m.x, m.y, box.x, box.y);
      if (d < minEnemyDist) minEnemyDist = d;
    }

    let priority = 0;
    if (box.type === 'repair') {
      priority = self.hp === 1 ? (self.lives === 1 ? 165 : 135) : 0;
    } else {
      priority = self.rapidTicks < 25 ? 90 : 35;
    }

    if (enemiesNearBox >= 2 && myEta > 2 && self.invincibleTicks < myEta) {
      return null;
    }
    if (minEnemyDist + 1 < myEta && (self.hp === 1 || self.lives === 1) && self.invincibleTicks === 0 && box.type !== 'repair') {
      return null;
    }

    priority -= effectiveEta * 3.5;
    if (priority <= 10) return null;

    return { dist: dist, priority: priority, box: box, eta: myEta };
  }

  function choosePrimaryTarget(state, sx, sy, scoreInfo) {
    const visible = (state.radar && state.radar.tanks) || [];
    const t = state.tick;
    let bestTarget = null;
    let bestValue = -1e9;

    for (let i = 0; i < visible.length; i++) {
      const e = visible[i];
      const dist = chebDist(sx, sy, e.x, e.y);
      let val = 60 - dist * 4.5;
      if (e.hp === 1) val += 75;
      if (e.id === scoreInfo.leaderId) val += 26;
      if (e.id === MEM.targetId && t - MEM.targetTick <= 15) val += 18;
      if (e.invincibleTicks > 4) val -= 70;
      if (e.hurtTicks >= 2 && dist <= 3) val -= 25;
      if (e.rapidTicks > 20 && state.self.hp === 1 && e.hp === 2) val -= 35;
      const lastShot = MEM.enemyShotTick[e.id] || -99;
      if (t - lastShot <= 4) val += 22;

      if (val > bestValue) {
        bestValue = val;
        bestTarget = e;
      }
    }

    if (bestTarget) {
      MEM.targetId = bestTarget.id;
      MEM.targetTick = t;
      return bestTarget;
    }

    let bestGhost = null;
    let bestGhostScore = -1e9;
    for (const id in MEM.seen) {
      const m = MEM.seen[id];
      const age = t - m.tick;
      if (age <= 0 || age > 10) continue;
      const gScore = (m.hp === 1 ? 45 : 18) - age * 3 - chebDist(sx, sy, m.x, m.y) * 2;
      if (gScore > bestGhostScore) {
        bestGhostScore = gScore;
        bestGhost = {
          id: m.id,
          x: MathRef.max(0, MathRef.min(24, m.x + m.vx)),
          y: MathRef.max(0, MathRef.min(24, m.y + m.vy)),
          dir: m.dir,
          hp: m.hp,
          invincibleTicks: 0,
          hurtTicks: 0,
          rapidTicks: 0,
          isGhost: true
        };
      }
    }
    return bestGhost;
  }

  function computeGeometricThreat(x, y, visible, tick, hitEvading) {
    let penalty = 0;
    let closeEnemies = 0;

    for (let i = 0; i < visible.length; i++) {
      const e = visible[i];
      const dist = chebDist(x, y, e.x, e.y);
      if (dist <= 4) closeEnemies++;

      if (e.invincibleTicks > 2 && e.hp === 1) continue;
      const lastShot = MEM.enemyShotTick[e.id] || -99;
      const cdLikelyReady = (tick - lastShot) >= (e.rapidTicks > 0 ? 3 : 4);

      const mx = getMuzzleX(e.x, e.dir);
      const my = getMuzzleY(e.y, e.dir);
      if (mx >= 0 && my >= 0 && mx < GRID_N && my < GRID_N) {
        let cx = mx;
        let cy = my;
        const dx = DIR_DX[e.dir];
        const dy = DIR_DY[e.dir];
        for (let s = 0; s <= 15; s++) {
          if (s > 0) {
            cx += dx;
            cy += dy;
          }
          if (cx < 0 || cy < 0 || cx >= GRID_N || cy >= GRID_N) break;
          const ter = FLAT_MAP[cy * GRID_N + cx];
          if (ter === 1 || ter === 2) break;
          if (cx >= x && cx <= x + 1 && cy >= y && cy <= y + 1) {
            const tau = s === 0 ? 1 : ((s - 1) / 3 | 0) + 1;
            const suckerSlot = ((e.dir === 0 || e.dir === 2) && x === e.x - 1) ||
                               ((e.dir === 1 || e.dir === 3) && y === e.y - 1);
            const mult = (cdLikelyReady ? 1.55 : 0.85) * (suckerSlot ? 1.75 : 1.0) * (e.rapidTicks > 0 ? 1.25 : 1.0) * (hitEvading ? 1.75 : 1.0);
            penalty += (tau === 1 ? 155 : tau === 2 ? 72 : 30) * mult;
            break;
          }
        }
      }

      if (x === e.x - 1 && absVal(y - e.y) <= 9) {
        const dirToMe = y < e.y ? 0 : 2;
        const emx = getMuzzleX(e.x, dirToMe);
        let emy = getMuzzleY(e.y, dirToMe);
        let clear = true;
        const steps = absVal(y - e.y);
        const dy = DIR_DY[dirToMe];
        for (let s = 0; s < steps; s++) {
          if (emy < 0 || emy >= GRID_N) { clear = false; break; }
          const ter = FLAT_MAP[emy * GRID_N + emx];
          if (ter === 1 || ter === 2) { clear = false; break; }
          emy += dy;
        }
        if (clear) penalty += 68;
      }
      if (y === e.y - 1 && absVal(x - e.x) <= 9) {
        const dirToMe = x < e.x ? 3 : 1;
        let emx = getMuzzleX(e.x, dirToMe);
        const emy = getMuzzleY(e.y, dirToMe);
        let clear = true;
        const steps = absVal(x - e.x);
        const dx = DIR_DX[dirToMe];
        for (let s = 0; s < steps; s++) {
          if (emx < 0 || emx >= GRID_N) { clear = false; break; }
          const ter = FLAT_MAP[emy * GRID_N + emx];
          if (ter === 1 || ter === 2) { clear = false; break; }
          emx += dx;
        }
        if (clear) penalty += 68;
      }
    }

    if (closeEnemies >= 2) penalty += (closeEnemies - 1) * 55;
    return penalty;
  }

  function runDecision(state) {
    const t = state.tick;
    if (!MEM || t < MEM.lastTick) {
      MEM = createMemory();
    }
    const self = state.self;
    const map = state.map;

    if (!self.onField) {
      MEM.lastTick = t;
      return { move: 'stay', fire: false, intent: 'hold' };
    }

    if (self.lives < MEM.lives || t - MEM.lastTick > 1) {
      MEM.myShots = [];
      MEM.lastMoveDir = -1;
      MEM.stuckCount = 0;
      MEM.hitEvadeUntil = -1;
      MEM.lastFireTick = -99;
      MEM.lastFireExposedAxis = false;
      MEM.prevHp = self.hp;
      MEM.trail = [];
    }
    MEM.lives = self.lives;
    MEM.lastTick = t;

    if (self.hp < MEM.prevHp) {
      MEM.hitEvadeUntil = t + 7;
    } else if (self.hp > MEM.prevHp) {
      MEM.hitEvadeUntil = -1;
    }
    MEM.prevHp = self.hp;

    const sx = self.x;
    const sy = self.y;
    if (sx === MEM.lastPos.x && sy === MEM.lastPos.y) {
      MEM.stuckCount++;
    } else {
      MEM.stuckCount = 0;
    }
    MEM.lastPos = { x: sx, y: sy };
    MEM.trail.push({ x: sx, y: sy });
    if (MEM.trail.length > 14) MEM.trail.shift();

    updateEnemyMemory(state);
    buildFlatMapAndPassable(map, state);
    const bulletInfo = classifyBullets(state);
    const scoreInfo = getScoreStatus(state);

    const zoneNow = computeZone(t);
    const shrinkIn = zoneNow.nextShrinkTick !== null ? zoneNow.nextShrinkTick - t : 999;
    const zoneNext = zoneNow.nextShrinkTick !== null
      ? computeZone(MathRef.min(599, zoneNow.nextShrinkTick))
      : zoneNow;
    const zonePlan = shrinkIn <= 22 ? zoneNext : zoneNow;
    const inNow = inSafeZone(sx, sy, zoneNow);
    const inPlan = inSafeZone(sx, sy, zonePlan);

    BASE_DANGER_MASK.fill(0);
    for (let i = 0; i < bulletInfo.enemyBullets.length; i++) {
      const b = bulletInfo.enemyBullets[i];
      stampBulletLaneMask(b.x, b.y, b.dir, EVADE_HORIZON, BASE_DANGER_MASK);
    }

    const visible = (state.radar && state.radar.tanks) || [];
    buildImminentMuzzleGrid(visible, t);

    const immuneTau1 = self.invincibleTicks > 0 || self.hurtTicks >= 2;
    const canFire = self.fireCooldown === 0 && bulletInfo.inFlight < 2;

    const survival = solveSurvivalFast(
      sx, sy, EVADE_HORIZON, BASE_DANGER_MASK, PASSABLE_NOW, t, true,
      self.hurtTicks, self.invincibleTicks
    );

    let interceptFire = false;
    if (!immuneTau1 && canFire) {
      if (!survival.alive || tankHitsMaskAtTau(sx, sy, BASE_DANGER_MASK, 2)) {
        if (canInterceptBullet(sx, sy, self.dir, bulletInfo.enemyBullets)) {
          interceptFire = true;
        }
      }
    }

    const bestShot = canFire
      ? evaluateAllShots(state, sx, sy, scoreInfo)
      : { dir: -1, targetId: null, grade: -1, score: -1e9, tau: 99, asymmetricSafe: false };

    const lastLife = self.lives === 1;
    const protectLead = (scoreInfo.soleLeader && (
      (lastLife && (scoreInfo.margin >= 1 || self.hp === 1)) ||
      (t >= 460 && scoreInfo.margin >= 3) ||
      (t >= 510 && scoreInfo.margin >= 1 && (self.hp === 1 || lastLife))
    )) || (lastLife && scoreInfo.myPoints >= 10 && scoreInfo.myPoints >= scoreInfo.maxMultiLifePoints + 2 && t >= 260);

    let fire = interceptFire;
    if (!fire && canFire && bestShot.dir === self.dir && bestShot.grade >= 1) {
      if (self.invincibleTicks > 1) {
        let tgtObj = null;
        for (let i = 0; i < visible.length; i++) {
          if (visible[i].id === bestShot.targetId) { tgtObj = visible[i]; break; }
        }
        const isFinishingBlow = tgtObj && tgtObj.hp === 1 && bestShot.grade >= 3;
        const safeToBreak = !tankHitsMaskAtTau(sx, sy, BASE_DANGER_MASK, 2) && !tankHitsGrid(sx, sy, IMMINENT_MUZZLE_GRID);
        if (isFinishingBlow && safeToBreak) {
          fire = true;
        }
      } else if (protectLead && self.hp === 1) {
        if (bestShot.grade >= 3 || (bestShot.grade >= 2 && bestShot.asymmetricSafe)) {
          fire = true;
        }
      } else {
        fire = true;
      }
    }

    let zoneDistField = null;
    if (!inNow || !inPlan) {
      const zTarget = !inNow ? zoneNow : zonePlan;
      const zGoals = [];
      for (let y = zTarget.min; y <= zTarget.max - 1; y++) {
        for (let x = zTarget.min; x <= zTarget.max - 1; x++) {
          if (PASSABLE_BASE[y * POS_N + x] !== 0) zGoals.push({ x: x, y: y });
        }
      }
      zoneDistField = computeDistFieldFast(zGoals, PASSABLE_NOW);
      if (zoneDistField[sy * POS_N + sx] < 0) {
        zoneDistField = computeDistFieldFast(zGoals, PASSABLE_BASE);
      }
    }

    const supplyInfo = evaluateSupply(state, sx, sy, zonePlan);
    const target = choosePrimaryTarget(state, sx, sy, scoreInfo);

    const hitEvading = t < MEM.hitEvadeUntil && self.invincibleTicks === 0;
    const isRetreating = protectLead ||
      (lastLife && self.hp === 1 && self.invincibleTicks === 0 && !(target && target.hp === 1 && bestShot.grade >= 3)) ||
      (hitEvading && !(target && target.hp === 1 && bestShot.grade >= 3));

    let combatDistField = null;
    let desiredBand = 5;

    if (target) {
      if (isRetreating) {
        desiredBand = 8;
      } else if (self.invincibleTicks > 3 || (target.hp === 1 && !lastLife) || (self.rapidTicks > 25 && !lastLife)) {
        desiredBand = 3;
      } else if (scoreInfo.margin <= 0 && t >= 320 && self.lives >= 2) {
        desiredBand = 4;
      } else if (self.hp === 1 || lastLife) {
        desiredBand = 6;
      } else {
        desiredBand = 5;
      }

      const combatGoals = [];
      const tx = target.x;
      const ty = target.y;
      for (let y = zonePlan.min; y <= zonePlan.max - 1; y++) {
        for (let x = zonePlan.min; x <= zonePlan.max - 1; x++) {
          if (PASSABLE_PLAN[y * POS_N + x] === 0) continue;
          const cd = chebDist(x, y, tx, ty);

          let crowdedByOthers = false;
          for (let j = 0; j < visible.length; j++) {
            const o = visible[j];
            if (o.id === target.id) continue;
            if (chebDist(x, y, o.x, o.y) <= (isRetreating ? 5 : 3)) {
              crowdedByOthers = true;
              break;
            }
          }
          if (crowdedByOthers) continue;

          if (isRetreating) {
            const offAxis = absVal(x - tx) >= 2 && absVal(y - ty) >= 2;
            if (offAxis && cd >= 6 && cd <= 11) {
              combatGoals.push({ x: x, y: y });
            }
          } else {
            const goldenSlot = (x === tx + 1 || y === ty + 1);
            const symSlot = (x === tx || y === ty) && self.hp === 2 && !lastLife && self.fireCooldown <= 1;
            if ((goldenSlot || symSlot) && cd >= MathRef.max(2, desiredBand - 2) && cd <= desiredBand + 2) {
              combatGoals.push({ x: x, y: y });
            }
          }
        }
      }
      if (combatGoals.length === 0 && !isRetreating) {
        combatGoals.push({
          x: MathRef.max(zonePlan.min, MathRef.min(zonePlan.max - 1, tx + 1)),
          y: MathRef.max(zonePlan.min, MathRef.min(zonePlan.max - 1, ty + 1))
        });
      }
      if (combatGoals.length > 0) {
        combatDistField = computeDistFieldFast(combatGoals, PASSABLE_PLAN);
      }
    } else {
      const patrolGoals = [];
      const box = state.arena && state.arena.supply;
      if (box && !isRetreating && inSafeZone(box.x, box.y, zonePlan)) {
        for (let y = zonePlan.min; y <= zonePlan.max - 1; y++) {
          for (let x = zonePlan.min; x <= zonePlan.max - 1; x++) {
            if (PASSABLE_PLAN[y * POS_N + x] === 0) continue;
            const d = chebDist(x, y, box.x, box.y);
            if (d >= 4 && d <= 6 && (x === box.x + 1 || y === box.y + 1 || x === box.x || y === box.y)) {
              patrolGoals.push({ x: x, y: y });
            }
          }
        }
      }
      if (patrolGoals.length === 0) {
        const anchors = [
          { x: 9, y: 9 }, { x: 15, y: 9 }, { x: 15, y: 15 }, { x: 9, y: 15 }, { x: 12, y: 12 }
        ];
        for (let i = 0; i < anchors.length; i++) {
          const ax = MathRef.max(zonePlan.min + 1, MathRef.min(zonePlan.max - 2, anchors[i].x));
          const ay = MathRef.max(zonePlan.min + 1, MathRef.min(zonePlan.max - 2, anchors[i].y));
          if (PASSABLE_PLAN[ay * POS_N + ax] !== 0) patrolGoals.push({ x: ax, y: ay });
        }
      }
      if (patrolGoals.length > 0) {
        combatDistField = computeDistFieldFast(patrolGoals, PASSABLE_PLAN);
      }
    }

    let maxSurvivalReach = 0;
    for (let b = 0; b < 5; b++) {
      if (survival.reach[b] > maxSurvivalReach) {
        maxSurvivalReach = survival.reach[b];
      }
    }

    const exposedFireNow = fire && target && (sx === target.x || sy === target.y);
    const needPostFireSidestep = exposedFireNow || (t - MEM.lastFireTick <= 1 && MEM.lastFireExposedAxis);
    const ticksToZoneHit = t >= 200 ? ((10 - (t % 10)) % 10) : 99;
    let bestAction = -1;
    let bestActionScore = -1e12;

    for (let d = -1; d < 4; d++) {
      let nx = sx;
      let ny = sy;
      let newDir = self.dir;
      let moveBlocked = false;

      if (d >= 0) {
        newDir = d;
        const candX = sx + DIR_DX[d];
        const candY = sy + DIR_DY[d];
        if (validTankPos(candX, candY) && PASSABLE_NOW[candY * POS_N + candX] !== 0) {
          nx = candX;
          ny = candY;
        } else {
          moveBlocked = true;
        }
      }

      const rIdx = moveBlocked ? 0 : (d + 1);
      const reachTau = survival.reach[rIdx];
      const branchCnt = survival.branchCount[rIdx];

      let score = 0;

      // (A) 弹道生存硬约束
      if (reachTau < maxSurvivalReach) {
        score -= (maxSurvivalReach - reachTau) * 60000;
      }
      if (!immuneTau1) {
        if (tankHitsMaskAtTau(nx, ny, BASE_DANGER_MASK, 2)) {
          score -= 250000;
        }
        if (tankHitsGrid(nx, ny, IMMINENT_MUZZLE_GRID)) {
          score -= (self.hp === 1 || lastLife ? 36000 : 17000);
        }
      }
      if (self.hurtTicks - 2 < 1 && self.invincibleTicks - 1 < 1) {
        if (tankHitsMaskAtTau(nx, ny, BASE_DANGER_MASK, 4)) {
          score -= 12000;
        }
      }
      if (self.hurtTicks - 3 < 1 && self.invincibleTicks - 2 < 1) {
        if (tankHitsMaskAtTau(nx, ny, BASE_DANGER_MASK, 8)) {
          score -= 2500;
        }
      }
      score += branchCnt * 4.0;

      // (B) 危险区与缩圈安全评分
      if (!inSafeZone(nx, ny, zoneNow)) {
        const zonePen = ticksToZoneHit === 0 ? 220000 : (ticksToZoneHit <= 2 ? 42000 : 9500);
        score -= zonePen;
        if (zoneDistField) {
          const zd = zoneDistField[ny * POS_N + nx];
          if (zd >= 0) score -= zd * 1200;
        }
      } else if (!inSafeZone(nx, ny, zonePlan)) {
        const urgency = shrinkIn <= 3 ? 40000 : (shrinkIn <= 8 ? 2200 : 380);
        score -= urgency;
        if (zoneDistField) {
          const zd = zoneDistField[ny * POS_N + nx];
          if (zd >= 0) score -= zd * (shrinkIn <= 10 ? 600 : 140);
        }
      } else {
        const marginDist = MathRef.min(nx - zonePlan.min, zonePlan.max - (nx + 1), ny - zonePlan.min, zonePlan.max - (ny + 1));
        if (marginDist === 0 && shrinkIn <= 30) score -= 30;
        else if (marginDist >= 2) score += 14;
      }

      // (C) 转向瞄准配合
      if (!fire && canFire && bestShot.dir >= 0 && bestShot.grade >= 1) {
        if (newDir === bestShot.dir && (!isRetreating || bestShot.grade >= 3 || bestShot.asymmetricSafe)) {
          score += bestShot.grade * 105 + (bestShot.asymmetricSafe ? 90 : 50);
        }
      }

      // (D) 敌方炮线与盲区几何威胁
      if (self.invincibleTicks <= 2) {
        const geoPen = computeGeometricThreat(nx, ny, visible, t, hitEvading);
        score -= geoPen * (self.hp === 1 || lastLife || isRetreating ? 2.25 : 1.25);
      }

      if ((needPostFireSidestep || hitEvading) && target) {
        const crossBefore = MathRef.min(absVal(sx - target.x), absVal(sy - target.y));
        const crossAfter = MathRef.min(absVal(nx - target.x), absVal(ny - target.y));
        if (crossAfter > crossBefore) {
          score += hitEvading ? 98 : 68;
        }
      }

      // (E) 补给争夺
      if (supplyInfo && supplyInfo.dist) {
        const sd = supplyInfo.dist[ny * POS_N + nx];
        if (sd >= 0) {
          score += (30 - MathRef.min(30, sd)) * (supplyInfo.priority * 0.52);
          if (sd === 0 && supplyInfo.box.available) score += supplyInfo.priority * 4.2;
        }
      }

      // (F) 交战距离带与单向白嫖射击位抢占
      if (combatDistField) {
        const cd = combatDistField[ny * POS_N + nx];
        if (cd >= 0) {
          const weight = isRetreating ? 48 : (target && target.hp === 1 ? 58 : 38);
          score -= cd * weight;
        }
      }

      if (target) {
        const distToTgt = chebDist(nx, ny, target.x, target.y);
        score -= absVal(distToTgt - desiredBand) * 15;
        if (isRetreating) {
          let minAllEnemyDist = 99;
          for (let j = 0; j < visible.length; j++) {
            const ed = chebDist(nx, ny, visible[j].x, visible[j].y);
            if (ed < minAllEnemyDist) minAllEnemyDist = ed;
          }
          score += MathRef.min(10, minAllEnemyDist) * 16;
          if (t < 495 && minAllEnemyDist > 2 && tankTouchesGrassFlat(nx, ny)) {
            score += 45;
          }
        } else {
          if (nx === target.x + 1 && absVal(ny - target.y) <= 9) {
            score += 50;
            if (newDir === (ny > target.y ? 0 : 2)) score += 38;
          }
          if (ny === target.y + 1 && absVal(nx - target.x) <= 9) {
            score += 50;
            if (newDir === (nx > target.x ? 3 : 1)) score += 38;
          }
        }
      } else if (t < 495 && tankTouchesGrassFlat(nx, ny)) {
        score += 20;
      }

      // (G) 防卡死与轨迹平滑
      if (moveBlocked) {
        if (!(!fire && canFire && bestShot.dir === d && bestShot.grade >= 2)) {
          score -= 160;
        }
      }
      if (d >= 0 && d === MEM.lastMoveDir && !moveBlocked) {
        score += 8;
      }
      let recentVisits = 0;
      for (let i = 0; i < MEM.trail.length; i++) {
        if (MEM.trail[i].x === nx && MEM.trail[i].y === ny) recentVisits++;
      }
      score -= recentVisits * 10;

      if (MEM.stuckCount >= 3 && d === -1) {
        score -= 90;
      }

      score += (hashMix((state.random ^ ((d + 2) * 97)) >>> 0) & 31) * 0.01;

      if (score > bestActionScore) {
        bestActionScore = score;
        bestAction = d;
      }
    }

    let chosenIntent = 'hold';
    if (!fire && canFire && self.invincibleTicks === 0 && !protectLead && !lastLife && self.hp === 2 && visible.length === 0) {
      const mx = getMuzzleX(sx, self.dir);
      const my = getMuzzleY(sy, self.dir);
      if (mx >= 0 && my >= 0 && mx < GRID_N && my < GRID_N && FLAT_MAP[my * GRID_N + mx] === 1) {
        if (bestAction === self.dir || MEM.stuckCount >= 2) {
          fire = true;
          chosenIntent = 'siege';
        }
      }
    }

    if (fire) {
      const mx = getMuzzleX(sx, self.dir);
      const my = getMuzzleY(sy, self.dir);
      MEM.myShots.push({ tick: t, x: mx, y: my, dir: self.dir });
      MEM.lastFireTick = t;
      MEM.lastFireExposedAxis = Boolean(exposedFireNow);
    }
    MEM.lastMoveDir = bestAction;

    if (chosenIntent !== 'siege') {
      if (interceptFire || (!immuneTau1 && maxSurvivalReach < EVADE_HORIZON)) {
        chosenIntent = 'defend';
      } else if (!inNow || !inPlan || isRetreating) {
        chosenIntent = 'retreat';
      } else if (supplyInfo && supplyInfo.eta <= 6 && (!target || supplyInfo.priority >= 60)) {
        chosenIntent = 'resupply';
      } else if (fire || (target && !target.isGhost)) {
        chosenIntent = bestAction >= 0 && bestAction !== self.dir ? 'flank' : 'pursue';
      } else if (bestAction >= 0) {
        chosenIntent = 'advance';
      } else {
        chosenIntent = 'hold';
      }
    }

    return {
      move: bestAction >= 0 ? DIR_NAMES[bestAction] : 'stay',
      fire: Boolean(fire),
      intent: chosenIntent
    };
  }

  return runDecision;
})();

function decide(state) {
  try {
    return __apexWardenDecide(state);
  } catch (_err) {
    return { move: 'stay', fire: false, intent: 'hold' };
  }
}