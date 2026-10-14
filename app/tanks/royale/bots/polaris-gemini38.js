// Polaris (北极星 / 极光猎手) - 四人坦克乱斗 2.6 参赛 Bot
// 作者模型：Gemini 3.8 Flash
// 规则版本：2.6.0
// 独立策略：机会收割 + 终盘领先保命 + 极速零GC寻路 + 预先缩圈撤离 + 严防残血正面对枪

const P_DIRS = [
  { x: 0, y: -1 }, // 0: up
  { x: 1, y: 0 },  // 1: right
  { x: 0, y: 1 },  // 2: down
  { x: -1, y: 0 }, // 3: left
];
const P_MOVES = ['up', 'right', 'down', 'left', 'stay'];

// 静态预分配数组，杜绝 GC 停顿与内存分配开销
let P_SIZE=25;
let P_DIST = new Int16Array(P_SIZE*P_SIZE);
let P_FIRST = new Int8Array(P_SIZE*P_SIZE);
let P_QUEUE = new Int16Array(P_SIZE*P_SIZE);

let P_MEM = {
  tick: -1,
  lives: 3,
  lastX: -1,
  lastY: -1,
  stuck: 0,
  targetId: null,
  myShots: [],
  enemyHistory: {},
};

function resetMemory(lives) {
  P_MEM = {
    tick: -1,
    lives: lives,
    lastX: -1,
    lastY: -1,
    stuck: 0,
    targetId: null,
    myShots: [],
    enemyHistory: {},
  };
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < P_SIZE+1 && y < P_SIZE+1;
}

function tankInBounds(x, y) {
  return x >= 0 && y >= 0 && x <= P_SIZE-1 && y <= P_SIZE-1;
}

function inZone(x, y, zone) {
  return x >= zone.min && y >= zone.min && x + 1 <= zone.max && y + 1 <= zone.max;
}

function distToZone(x, y, zone) {
  const dx = Math.max(0, zone.min - x) + Math.max(0, (x + 1) - zone.max);
  const dy = Math.max(0, zone.min - y) + Math.max(0, (y + 1) - zone.max);
  return dx + dy;
}

function isCellPassable(map, x, y) {
  if (x < 0 || y < 0 || x >= P_SIZE+1 || y >= P_SIZE+1) return false;
  const t = map[y][x];
  return t === 0 || t === 4; // empty or grass
}

function isTankPassable(map, x, y) {
  if (!tankInBounds(x, y)) return false;
  return isCellPassable(map, x, y) &&
         isCellPassable(map, x + 1, y) &&
         isCellPassable(map, x, y + 1) &&
         isCellPassable(map, x + 1, y + 1);
}

function tanksOverlap(ax, ay, bx, by) {
  return ax < bx + 2 && ax + 2 > bx && ay < by + 2 && ay + 2 > by;
}

function getMuzzle(x, y, dir) {
  if (dir === 0) return { x: x, y: y - 1 };
  if (dir === 1) return { x: x + 2, y: y };
  if (dir === 2) return { x: x, y: y + 2 };
  return { x: x - 1, y: y };
}

function distManhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

// 零分配极速炮线穿透检查 (返回是否命中 [tx..tx+1, ty..ty+1])
function traceRayHit(map, sx, sy, dir, tx, ty) {
  const dx = P_DIRS[dir].x;
  const dy = P_DIRS[dir].y;
  let x = sx;
  let y = sy;
  while (x >= 0 && y >= 0 && x < P_SIZE+1 && y < P_SIZE+1) {
    const t = map[y][x];
    if (t === 2 || t === 1) return false; // 钢墙或砖墙阻挡
    if (x >= tx && x <= tx + 1 && y >= ty && y <= ty + 1) return true;
    x += dx;
    y += dy;
  }
  return false;
}

// 检查从指定车位及朝向是否能射中目标
function canHitTargetFrom(map, x, y, dir, target) {
  const muz = getMuzzle(x, y, dir);
  if (dir === 0 || dir === 2) {
    if (muz.x < target.x || muz.x > target.x + 1) return false;
    if (dir === 0 && muz.y < target.y) return false;
    if (dir === 2 && muz.y > target.y + 1) return false;
  } else {
    if (muz.y < target.y || muz.y > target.y + 1) return false;
    if (dir === 3 && muz.x < target.x) return false;
    if (dir === 1 && muz.x > target.x + 1) return false;
  }
  return traceRayHit(map, muz.x, muz.y, dir, target.x, target.y);
}

// 评估即时动作候选位置威胁度 (仅评估 5 个候选移动，极速执行)
function evaluateCandidateDanger(map, x, y, radarBullets, radarTanks, selfTank, safeZone, nextSafeZone, timeToShrink) {
  let danger = 0;

  // 1. 安全区危险度
  const outsideCurr = !inZone(x, y, safeZone);
  if (outsideCurr) {
    danger += 30000 + distToZone(x, y, safeZone) * 5000;
  } else if (timeToShrink <= 30 && !inZone(x, y, nextSafeZone)) {
    const shrinkUrgency = timeToShrink <= 12 ? 15000 : timeToShrink <= 22 ? 6000 : 2000;
    danger += shrinkUrgency + distToZone(x, y, nextSafeZone) * 2500;
  }

  // 2. 敌车碰撞
  for (let i = 0; i < radarTanks.length; i++) {
    const e = radarTanks[i];
    if (tanksOverlap(x, y, e.x, e.y)) {
      return 99999;
    }
  }

  // 3. 炮弹精准躲避
  for (let i = 0; i < radarBullets.length; i++) {
    const b = radarBullets[i];
    let isMyImmune = false;
    for (let j = 0; j < P_MEM.myShots.length; j++) {
      const s = P_MEM.myShots[j];
      if (s.tickDiff <= 2 && s.dir === b.dir) {
        const dx = P_DIRS[b.dir].x * 3 * s.tickDiff;
        const dy = P_DIRS[b.dir].y * 3 * s.tickDiff;
        if (Math.abs(b.x - (s.x + dx)) <= 1 && Math.abs(b.y - (s.y + dy)) <= 1) {
          isMyImmune = true;
          break;
        }
      }
    }
    if (isMyImmune) continue;

    let bx = b.x;
    let by = b.y;
    const dx = P_DIRS[b.dir].x;
    const dy = P_DIRS[b.dir].y;
    for (let step = 0; step <= 6; step++) {
      if (bx < 0 || by < 0 || bx >= P_SIZE+1 || by >= P_SIZE+1) break;
      const t = map[by][bx];
      if (t === 1 || t === 2) break;

      if (bx >= x && bx <= x + 1 && by >= y && by <= y + 1) {
        danger += step <= 3 ? 35000 : 9000;
        break;
      }
      bx += dx;
      by += dy;
    }
  }

  // 4. 敌方直射架枪威胁 (残血 1 HP 时绝对禁止踏入敌方枪线)
  for (let i = 0; i < radarTanks.length; i++) {
    const e = radarTanks[i];
    if (e.invincibleTicks > 1) continue;
    if (canHitTargetFrom(map, e.x, e.y, e.dir, { x, y })) {
      const hpMultiplier = selfTank.hp === 1 ? 25000 : 2500;
      danger += e.rapidTicks > 0 ? hpMultiplier * 1.6 : hpMultiplier;
    }
  }

  return danger;
}

function decide(state) {
  if(state&&state.map){const p=state.map.length-1;if(p!==P_SIZE){P_SIZE=p;P_DIST=new Int16Array(p*p);P_FIRST=new Int8Array(p*p);P_QUEUE=new Int16Array(p*p);resetMemory(state.self.lives);}}
  try {
    return polarisDecide(state);
  } catch (_e) {
    return { move: 'stay', fire: false, intent: 'hold' };
  }
}

function polarisDecide(state) {
  const self = state.self;
  const tick = state.tick;
  const map = state.map;
  const arena = state.arena;
  const safeZone = arena.safeZone;

  // 重置检查：tick 跳变（新局或复活）
  if (P_MEM.tick < 0 || tick <= P_MEM.tick || tick - P_MEM.tick > 20 || self.lives !== P_MEM.lives) {
    resetMemory(self.lives);
  }

  // 卡位记录
  if (P_MEM.lastX === self.x && P_MEM.lastY === self.y) {
    P_MEM.stuck++;
  } else {
    P_MEM.stuck = 0;
  }
  P_MEM.lastX = self.x;
  P_MEM.lastY = self.y;
  P_MEM.lives = self.lives;
  P_MEM.tick = tick;

  // 更新我方发射记录
  for (let i = 0; i < P_MEM.myShots.length; i++) {
    P_MEM.myShots[i].tickDiff = tick - P_MEM.myShots[i].tick;
  }
  P_MEM.myShots = P_MEM.myShots.filter(s => s.tickDiff <= 4);

  // 缩圈时间与边界分析
  const timeToShrink = safeZone.nextShrinkTick !== null ? (safeZone.nextShrinkTick - tick) : 999;
  const shrinkSoon = timeToShrink <= 35;
  const nextSafeZone = shrinkSoon ? { min: safeZone.nextMin, max: safeZone.nextMax ?? P_SIZE-safeZone.nextMin } : safeZone;
  // 核心圈规：当缩圈在 25 拍以内时，必须以此圈为准，严防外缘口袋陷阱
  const requiredZone = (timeToShrink <= 25) ? nextSafeZone : safeZone;

  // 敌情分析
  const radarTanks = state.radar.tanks || [];
  const radarBullets = state.radar.bullets || [];

  for (let i = 0; i < radarTanks.length; i++) {
    const e = radarTanks[i];
    const prev = P_MEM.enemyHistory[e.id];
    let vx = 0, vy = 0;
    if (prev && prev.tick === tick - 1) {
      vx = Math.max(-1, Math.min(1, e.x - prev.x));
      vy = Math.max(-1, Math.min(1, e.y - prev.y));
    }
    P_MEM.enemyHistory[e.id] = {
      x: e.x,
      y: e.y,
      dir: e.dir,
      hp: e.hp,
      tick: tick,
      vx,
      vy,
      rapidTicks: e.rapidTicks,
    };
  }

  // 记分板分析
  let myScore = 0;
  let highestOpponentScore = 0;
  let activeOpponentsCount = 0;
  for (let i = 0; i < state.scoreboard.length; i++) {
    const row = state.scoreboard[i];
    if (row.id === self.id) {
      myScore = row.points;
    } else if (row.status === 'active' && row.lives > 0) {
      activeOpponentsCount++;
      if (row.points > highestOpponentScore) {
        highestOpponentScore = row.points;
      }
    }
  }

  const isLeading = myScore > highestOpponentScore;
  const leadMargin = myScore - highestOpponentScore;
  const isLateGame = tick >= 450;
  const isFinalPhase = tick >= 500;

  // 领先者残局全面保命守胜
  const terminalDefense = (isLateGame && isLeading) || (tick >= 400 && isLeading && leadMargin >= 3);

  // 目标筛选 (机会收割)
  let target = null;
  let bestTargetScore = -999999;

  if (!terminalDefense) {
    for (let i = 0; i < radarTanks.length; i++) {
      const e = radarTanks[i];
      let score = 200;

      // 机会收割：残血 1 HP 优先级极高 (+2 击毁分)
      if (e.hp === 1) score += 550;

      const dist = distManhattan(self.x, self.y, e.x, e.y);
      score -= dist * 14;

      if (e.invincibleTicks > 0) score -= 900;
      if (e.hurtTicks > 0) score -= 180;

      const sc = state.opponents.find(o => o.id === e.id);
      if (!isLeading && sc && sc.points === highestOpponentScore) {
        score += 200;
      }

      if (e.id === P_MEM.targetId) {
        score += 80;
      }

      if (score > bestTargetScore) {
        bestTargetScore = score;
        target = e;
      }
    }
  }

  P_MEM.targetId = target ? target.id : null;

  // 极速 BFS 全局寻路 (静态预分配数组，耗时 < 0.1ms)
  const startX = self.x;
  const startY = self.y;
  const startIdx = startY * P_SIZE + startX;

  P_DIST.fill(-1);
  P_FIRST.fill(-1);

  let qHead = 0;
  let qTail = 0;

  P_DIST[startIdx] = 0;
  P_QUEUE[qTail++] = startIdx;

  const currentlyInZone = inZone(startX, startY, safeZone);
  const currentlyInRequired = inZone(startX, startY, requiredZone);

  while (qHead < qTail) {
    const curr = P_QUEUE[qHead++];
    const cx = curr % P_SIZE;
    const cy = (curr / P_SIZE) | 0;
    const cdist = P_DIST[curr];

    for (let d = 0; d < 4; d++) {
      const nx = cx + P_DIRS[d].x;
      const ny = cy + P_DIRS[d].y;
      const nidx = ny * P_SIZE + nx;

      if (!tankInBounds(nx, ny) || P_DIST[nidx] >= 0) continue;
      if (!isTankPassable(map, nx, ny)) continue;

      // 缩圈严防：如果当前已在所需安全区内，严禁向圈外寻路
      if (currentlyInRequired && !inZone(nx, ny, requiredZone)) continue;
      else if (currentlyInZone && !inZone(nx, ny, safeZone)) continue;

      let blockedByEnemy = false;
      for (let i = 0; i < radarTanks.length; i++) {
        const e = radarTanks[i];
        if (tanksOverlap(nx, ny, e.x, e.y)) {
          blockedByEnemy = true;
          break;
        }
      }
      if (blockedByEnemy) continue;

      P_DIST[nidx] = cdist + 1;
      P_FIRST[nidx] = curr === startIdx ? d : P_FIRST[curr];
      P_QUEUE[qTail++] = nidx;
    }
  }

  const targetZone = requiredZone;
  const centerMin = targetZone.min;
  const centerMax = targetZone.max;
  const boardCenter = (P_SIZE - 1) / 2;
  const centerX = Math.max(centerMin, Math.min(centerMax - 1, boardCenter));
  const centerY = Math.max(centerMin, Math.min(centerMax - 1, boardCenter));

  const supply = arena.supply;
  const supplyWanted = supply && supply.available && tick < supply.expireTick &&
    inZone(supply.x, supply.y, requiredZone) &&
    (supply.type === 'rapid' || self.hp < 2);

  let bestGoalIdx = startIdx;
  let bestGoalUtility = -999999;
  let intent = 'advance';

  // 战略目标评估 (轻量启发式评估)
  for (let i = 0; i < qTail; i++) {
    const cellIdx = P_QUEUE[i];
    const gx = cellIdx % P_SIZE;
    const gy = (cellIdx / P_SIZE) | 0;
    const steps = P_DIST[cellIdx];

    let utility = -steps * 8;

    if (shrinkSoon) {
      if (!inZone(gx, gy, nextSafeZone)) {
        utility -= timeToShrink <= 15 ? 5000 : 2000;
      } else {
        utility += 350;
      }
    }

    if (terminalDefense) {
      intent = 'defend';
      const cdist = Math.abs(gx - centerX) + Math.abs(gy - centerY);
      utility -= cdist * 12;

      for (let j = 0; j < radarTanks.length; j++) {
        const d = distManhattan(gx, gy, radarTanks[j].x, radarTanks[j].y);
        if (d < 5) utility -= (5 - d) * 70;
        else if (d >= 6 && d <= 10) utility += 40;
      }
    } else {
      if (supplyWanted) {
        const sdist = distManhattan(gx, gy, supply.x, supply.y);
        if (sdist <= 1) utility += 500;
        else utility += Math.max(0, 200 - sdist * 15);
      }

      if (target && target.invincibleTicks <= 0) {
        const tdist = distManhattan(gx, gy, target.x, target.y);
        if (tdist >= 3 && tdist <= 6) {
          utility += target.hp === 1 ? 550 : 300;
        } else if (tdist < 3) {
          utility -= 90;
        } else {
          utility -= (tdist - 6) * 10;
        }
      } else {
        const cdist = Math.abs(gx - centerX) + Math.abs(gy - centerY);
        utility -= cdist * 8;
      }
    }

    if (map[gy][gx] === 4 && !isFinalPhase) {
      utility += 35;
    }

    if (utility > bestGoalUtility) {
      bestGoalUtility = utility;
      bestGoalIdx = cellIdx;
    }
  }

  if (supplyWanted && distManhattan(self.x, self.y, supply.x, supply.y) <= 6) {
    intent = 'resupply';
  } else if (target && !terminalDefense) {
    intent = target.hp === 1 ? 'flank' : 'pursue';
  } else if (terminalDefense) {
    intent = 'defend';
  }

  // 开火决策
  let fire = false;
  if (self.fireCooldown === 0) {
    for (let i = 0; i < radarTanks.length; i++) {
      const e = radarTanks[i];
      if (e.invincibleTicks > 0 || e.hurtTicks > 0) continue;
      if (canHitTargetFrom(map, self.x, self.y, self.dir, e)) {
        fire = true;
        break;
      }
    }

    // 破砖开路
    if (!fire && !target && P_MEM.stuck >= 2) {
      const muz = getMuzzle(self.x, self.y, self.dir);
      if (inBounds(muz.x, muz.y) && map[muz.y][muz.x] === 1) {
        fire = true;
      }
    }
  }

  if (fire) {
    const muz = getMuzzle(self.x, self.y, self.dir);
    P_MEM.myShots.push({
      x: muz.x,
      y: muz.y,
      dir: self.dir,
      tick: tick,
      tickDiff: 0,
    });
  }

  // 候选动作评估 (仅 5 个候选动作，耗时 < 0.2ms)
  let plannedMoveDir = P_FIRST[bestGoalIdx];
  let bestAction = 'stay';
  let bestActionScore = -999999;

  for (let a = 0; a < 5; a++) {
    const moveName = P_MOVES[a];
    let nx = self.x;
    let ny = self.y;
    let ndir = self.dir;

    if (a < 4) {
      nx += P_DIRS[a].x;
      ny += P_DIRS[a].y;
      ndir = a;
    }

    if (!tankInBounds(nx, ny) || !isTankPassable(map, nx, ny)) continue;

    // 缩圈严格约束：
    if (currentlyInRequired) {
      if (!inZone(nx, ny, requiredZone)) continue;
    } else if (currentlyInZone) {
      if (!inZone(nx, ny, safeZone)) continue;
    }

    let collides = false;
    for (let i = 0; i < radarTanks.length; i++) {
      const e = radarTanks[i];
      if (tanksOverlap(nx, ny, e.x, e.y)) {
        collides = true;
        break;
      }
    }
    if (collides) continue;

    let actionScore = 0;

    // 1. 规避弹道与危险
    const danger = evaluateCandidateDanger(map, nx, ny, radarBullets, radarTanks, self, safeZone, nextSafeZone, timeToShrink);
    actionScore -= danger * 2.5;

    // 圈外极速回圈加成
    if (!currentlyInRequired) {
      const currDist = distToZone(self.x, self.y, requiredZone);
      const nextDist = distToZone(nx, ny, requiredZone);
      if (nextDist < currDist) {
        actionScore += 25000;
      } else if (nextDist === 0) {
        actionScore += 60000;
      }
    }

    // 2. 贴合 BFS 最优路径
    if (a < 4 && a === plannedMoveDir) {
      actionScore += 300;
    } else if (a === 4 && plannedMoveDir < 0) {
      actionScore += 150;
    }

    // 3. 转向瞄准加成
    if (target && target.invincibleTicks <= 0 && canHitTargetFrom(map, nx, ny, ndir, target)) {
      actionScore += target.hp === 1 ? 450 : 250;
    }

    // 4. 防卡位打散
    if (P_MEM.stuck >= 2) {
      if (a === 4) actionScore -= 400;
      actionScore += ((state.random >>> (a * 4)) & 63) * 6;
    }

    if (actionScore > bestActionScore) {
      bestActionScore = actionScore;
      bestAction = moveName;
    }
  }

  // 保底
  if (bestActionScore <= -15000 && bestAction === 'stay' && plannedMoveDir >= 0) {
    const fallbackMove = P_MOVES[plannedMoveDir];
    const fx = self.x + P_DIRS[plannedMoveDir].x;
    const fy = self.y + P_DIRS[plannedMoveDir].y;
    if (tankInBounds(fx, fy) && isTankPassable(map, fx, fy)) {
      bestAction = fallbackMove;
    }
  }

  return {
    move: bestAction,
    fire: fire,
    intent: intent,
  };
}
