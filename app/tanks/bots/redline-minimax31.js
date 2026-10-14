// =====================================================================
// 作品代号：redline
// 规则版本：四人坦克乱斗 2.6.0
// 主线：读表定序 → 引弹反击 → 圈缘待机 → 生存结算
//
// 只使用合法 state 与自身历史，不读取任何外部信息。
// 顶层同步函数 decide(state)，单文件，无依赖。
// =====================================================================

const N = 26;
const DV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const MVD = ['up', 'right', 'down', 'left'];
const ALLM = ['up', 'right', 'down', 'left', 'stay'];
const MDIR = [0, 1, 2, 3, -1];

// 关键权重集中在这里：tune.mjs 会针对这一段做参数扫描，其余代码保持不变。
const TUNE = {
  GUN_NEAR: 39, GUN_FAR: 24, GUN_MID: 8, GUN_LONG: 4,   // 对手射线落在候选格上的风险
  BULLET_NOW: 95, BULLET_NEAR: 7,                        // 在场炮弹本拍命中 / 贴道
  SHOT_NOW: 14, SHOT_SETUP: 5,                           // 现在能打 / 下一拍能摆好射位
  LATE_RISK: 0.72, HPLOW_RISK: 1.7,                      // 残甲与终局的风险放大
  ZONE_NOW_W: 120, ZONE_NEXT_W: 34,                     // 当前圈外立刻扣甲 / 下一圈外提前量
  LIFE_RISK_1: 1.4, LIFE_RISK_2: 1.15,                  // 只剩 1 / 2 条命时的风险放大
  LIFE_GREED_1: 0.65, LIFE_GREED_2: 0.88,               // 只剩 1 / 2 条命时的出手贪婪度
  BANK_PEN: 0.18,                                       // 领先收官时额外的出手门槛
  BANK_TICK: 430,                                       // 领先且命足后转入收官保命的时间点
  FIELD_W: 6.5, STAY_PEN: 6,
  COUNTER_SAFE: 2, COUNTER_LATE: 3,                      // 非致命开火允许的对手还手数
  TRAIL_PEN: 1.1, WALL_BONUS: 2.6, GRASS_BONUS: 14,   // 草丛让对方在 2 格外看不见我，是最便宜的隐蔽
  IMMUNE_SHOT_BOOST: 2.0, BREAK_LANE: 45,               // 免伤窗口还手 / 免伤结束前脱离射线
};

let M = null;
function freshMemory() {
  return {
    tick: -99, lives: 3, hp: 2, x: -1, y: -1, dir: -1,
    idle: 0, stuck: 0, ownShots: [],
    sight: {}, exposeUntil: {},
    targetId: '', targetLock: 0,
    anchorX: 12, anchorY: 12, anchorTick: -99,
    trail: [],
  };
}

// ---------- 几何 ----------
const inB = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

function bodyFree(map, x, y) {
  if (x < 0 || y < 0 || x > N - 2 || y > N - 2) return false;
  const a = map[y][x], b = map[y][x + 1], c = map[y + 1][x], d = map[y + 1][x + 1];
  return (a === 0 || a === 4) && (b === 0 || b === 4) && (c === 0 || c === 4) && (d === 0 || d === 4);
}
const rectHit = (ax, ay, bx, by) => ax < bx + 2 && ax + 2 > bx && ay < by + 2 && ay + 2 > by;

// 逻辑炮口：垂直沿左列，水平沿上排。
function muzzleOf(x, y, d) {
  if (d === 0) return { x: x, y: y - 1 };
  if (d === 1) return { x: x + 2, y: y };
  if (d === 2) return { x: x, y: y + 2 };
  return { x: x - 1, y: y };
}

// 一发子弹从炮口沿 d 前进，本拍结算 offset 0..3，之后每拍再走 3 格。
// 返回命中 body(tx,ty) 的 offset；0..3 表示本拍命中，4+ 表示更晚；-1 表示打不到。
function rayHitDelay(map, sx, sy, sd, tx, ty, maxK) {
  const m = muzzleOf(sx, sy, sd);
  let cx = m.x, cy = m.y;
  for (let k = 0; k <= maxK; k++) {
    if (!inB(cx, cy)) return -1;
    const c = map[cy][cx];
    if (c === 1 || c === 2) return -1;
    if (cx >= tx && cx <= tx + 1 && cy >= ty && cy <= ty + 1) return k;
    cx += DV[sd][0]; cy += DV[sd][1];
  }
  return -1;
}

function bulletHitsBody(map, b, tx, ty, others) {
  const d = b.dir | 0;
  let cx = b.x, cy = b.y;
  for (let k = 0; k <= 3; k++) {
    if (cx >= tx && cx <= tx + 1 && cy >= ty && cy <= ty + 1) return true;
    if (!inB(cx, cy)) return false;
    const c = map[cy][cx];
    if (c === 1 || c === 2) return false;
    cx += DV[d][0]; cy += DV[d][1];
    if (!inB(cx, cy)) return false;
    if (k > 0 && others) for (let i = 0; i < others.length; i++) {
      const t = others[i];
      if (cx >= t.x && cx <= t.x + 1 && cy >= t.y && cy <= t.y + 1) return false;  // 被先到的车吸收
    }
  }
  return false;
}

// 该格附近有没有墙（掩体价值）。
function wallScore(map, x, y) {
  let w = 0;
  if (x === 0 || map[y][x - 1] === 1 || map[y][x - 1] === 2) w++;
  if (y === 0 || map[y - 1][x] === 1 || map[y - 1][x] === 2) w++;
  if (map[y][x + 2] === 1 || map[y][x + 2] === 2) w++;
  if (map[y + 2][x] === 1 || map[y + 2][x] === 2) w++;
  return w;
}

// 撞向某方向能否带来有用的朝向变化（否则不如原地不动）。
function turnUseful(d) { return d >= 0 && d !== M.dir; }
function touchesGrass(map, x, y) {
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const gx = x + dx, gy = y + dy;
    if (inB(gx, gy) && map[gy][gx] === 4) return true;
  }
  return false;
}

// ---------- 缩圈 ----------
function zoneAt(tick) {
  const m = tick < 200 ? 0 : Math.min(9, 2 + ((tick - 200) / 50 | 0));
  return { min: m, max: 25 - m };
}
function nextShrinkTick(tick) {
  if (tick < 200) return 200;
  if (tick >= 550) return null;
  return 200 + (((tick - 200) / 50 | 0) + 1) * 50;
}
const inZone = (x, y, z) => x >= z.min && y >= z.min && x + 1 <= z.max && y + 1 <= z.max;
// 距「应当待着的圈」有多远：0 表示完全在内。
function zoneCost(x, y, need) {
  return Math.max(0, need - x) + Math.max(0, need - y)
    + Math.max(0, x + 1 - (25 - need)) + Math.max(0, y + 1 - (25 - need));
}

// ---------- 逆向距离场（2×2 车身节点） ----------
function fieldFrom(map, gx, gy, block) {
  const f = new Int16Array(625); f.fill(-1);
  if (gx < 0 || gy < 0 || gx > N - 2 || gy > N - 2 || !bodyFree(map, gx, gy)) return f;
  const q = new Int16Array(625);
  let h = 0, t = 0;
  f[gy * 25 + gx] = 0; q[t++] = gy * 25 + gx;
  while (h < t) {
    const cur = q[h++], cx = cur % 25, cy = (cur / 25) | 0, d = f[cur];
    for (let k = 0; k < 4; k++) {
      const nx = cx + DV[k][0], ny = cy + DV[k][1];
      if (nx < 0 || ny < 0 || nx > N - 2 || ny > N - 2) continue;
      const ni = ny * 25 + nx;
      if (f[ni] >= 0 || !bodyFree(map, nx, ny)) continue;
      if (block && block[ni]) continue;
      f[ni] = d + 1; q[t++] = ni;
    }
  }
  return f;
}

// ---------- 观察与记忆 ----------
function updateSights(s) {
  const tick = s.tick, sight = M.sight, seen = {};
  for (const e of (s.radar.tanks || [])) {
    if (!e || e.id === s.self.id || e.x < 0) continue;
    seen[e.id] = 1;
    const old = sight[e.id];
    const dt = old ? tick - old.tick : 99;
    let vx = 0, vy = 0;
    if (old && dt >= 1 && dt <= 4) {
      const dx = e.x - old.x, dy = e.y - old.y;
      if ((dx || dy) && Math.abs(dx) + Math.abs(dy) <= dt) { vx = Math.sign(dx); vy = Math.sign(dy); }
    }
    sight[e.id] = {
      x: e.x, y: e.y, dir: e.dir, hp: e.hp | 0, rapid: e.rapidTicks | 0,
      inv: e.invincibleTicks | 0, hurt: e.hurtTicks | 0,
      vx: vx, vy: vy, tick: tick, grass: touchesGrass(s.map, e.x, e.y),
    };
  }
  return seen;
}

// 合法推断：雷达弹没有主人，只能用「可见车 + 朝向 + 弹道共线」推测发射者。
function inferExposed(s) {
  const tick = s.tick;
  const bs = s.radar.bullets || [];
  if (!bs.length) return;
  const cars = [];
  for (const id in M.sight) if (tick - M.sight[id].tick <= 1) cars.push(M.sight[id]);
  for (const b of bs) {
    let hit = false;
    for (const g of cars) {
      const k = rayHitDelay(s.map, g.x, g.y, g.dir | 0, b.x, b.y, 14);
      if (k >= 0) { hit = true; break; }
    }
    if (hit) {
      // 找到与该弹道共线且方向一致的车，标记为暴露中。
      let owner = null, bestK = 99;
      for (const g of cars) {
        const k = rayHitDelay(s.map, g.x, g.y, g.dir | 0, b.x, b.y, 14);
        if (k >= 0 && k < bestK) { bestK = k; owner = g; }
      }
      if (owner) for (const id in M.sight) if (M.sight[id] === owner) M.exposeUntil[id] = tick + 8;
    }
  }
}

// 只按自己合法发射历史排除自己的弹，不读取弹主。
function refreshOwn(s) {
  M.ownShots = M.ownShots.filter(p => p.expire > s.tick);
}
function registerOwnShot(s) {
  const d = s.self.dir, m = muzzleOf(s.self.x, s.self.y, d);
  let cx = m.x, cy = m.y, ok = true;
  for (let k = 0; k <= 3; k++) {
    if (!inB(cx, cy)) { ok = false; break; }
    const c = s.map[cy][cx];
    if (c === 1 || c === 2) { ok = false; break; }
    cx += DV[d][0]; cy += DV[d][1];
  }
  if (ok) M.ownShots.push({ x: cx, y: cy, dir: d, expire: s.tick + 2 });
}

// ---------- 读表：谁还能压过我 ----------
function readBoard(s) {
  const sb = s.scoreboard || [];
  let me = { points: 0, kills: 0, lives: s.self.lives };
  for (const q of sb) if (q.id === s.self.id) me = q;
  const rivals = [];
  for (const q of sb) {
    if (q.id === s.self.id) continue;
    const out = q.status === 'error' || q.status === 'timeout';
    const lives = q.lives | 0;
    const alive = !out && lives > 0;
    rivals.push({ id: q.id, points: q.points | 0, lives: lives, alive: alive, respawn: q.respawnTicks | 0 });
  }
  const ahead = rivals.filter(r => r.alive && r.points > (me.points | 0));
  let top = null;
  for (const r of rivals) if (r.alive && (!top || r.points > top.points)) top = r;
  return {
    me: me, rivals: rivals, top: top,
    trailing: ahead.length > 0,
    gap: top ? top.points - (me.points | 0) : 0,
    aliveFoes: rivals.filter(r => r.alive).length,
  };
}

// ---------- 目标定序 ----------
// 目标价值只由「排名威胁」和「可达可打」决定，不由距离远近单独主导。
function targetValue(s, board, r, g, tick) {
  const me = s.self;
  const stale = tick - g.tick;
  const dist = Math.max(Math.abs(me.x - g.x), Math.abs(me.y - g.y));
  let v = 0;
  if (r.points > (board.me.points | 0)) v += 20 - Math.min(14, r.points - (board.me.points | 0));
  if (board.top && r.id === board.top.id) v += 10;
  if (g.hp <= 1) v += 20;                                   // 残甲可一击致命
  if (r.lives <= 1) v += 12;                                // 击毁可永久移除其排名威胁
  if (tick < (M.exposeUntil[r.id] || 0)) v += 12;            // 已暴露 8 拍内
  if (g.inv > 0) v -= 45;
  if (g.hurt > 1) v -= 9;
  v -= dist * (board.trailing ? 1.1 : 1.7);
  v -= stale * 3.2;
  if (g.grass) v -= 3;
  if (dist > 10) v -= 12;
  return v;
}

function pickTarget(s, board, seen) {
  const tick = s.tick, me = s.self;
  let best = null;
  for (const r of board.rivals) {
    if (!r.alive) continue;
    const g = M.sight[r.id];
    if (!g || tick - g.tick > 5) continue;
    const v = targetValue(s, board, r, g, tick);
    if (!best || v > best.v) {
      best = {
        id: r.id, g: g, v: v, row: r,
        dist: Math.max(Math.abs(me.x - g.x), Math.abs(me.y - g.y)),
      };
    }
  }
  if (!best) return null;

  // 目标稳定性：短窗内不因小幅优势来回摇摆。
  if (M.targetId && M.targetLock > 0 && M.targetId !== best.id) {
    const hr = board.rivals.filter(r => r.id === M.targetId)[0];
    const hg = M.sight[M.targetId];
    if (hr && hr.alive && hg && tick - hg.tick <= 4) {
      const hv = targetValue(s, board, hr, hg, tick);
      if (hv + 12 >= best.v) {
        M.targetLock--;
        return { id: hr.id, g: hg, v: hv, row: hr, dist: Math.max(Math.abs(me.x - hg.x), Math.abs(me.y - hg.y)) };
      }
    }
  }
  M.targetId = best.id;
  M.targetLock = tick >= 450 ? 20 : 10;
  return best;
}

// ---------- 开火价值 ----------
function shotScore(map, x, y, d, g, wantFar) {
  if (!g || g.inv > 0) return 0;
  const k = rayHitDelay(map, x, y, d, g.x, g.y, wantFar ? 8 : 3);
  if (k < 0) return 0;
  if (k > 3) return wantFar ? 0.35 : 0;        // 更晚的命中只作摆位参考
  let v = 1;
  const cross = (d === 0 || d === 2) ? g.vx !== 0 : g.vy !== 0;  // 横向移动可能让对方先躲开
  if (cross) v *= 0.5;
  if (g.hurt > 1) v *= 0.22;                    // 受击缓冲还在，多半白打
  if (g.hp <= 1) v *= 2.4;                      // 致命一击
  return v;
}

// ---------- 风险 ----------
// 免疫帧是这一局最被低估的资源：受击缓冲 4 拍内子弹打不动，复活保护内子弹直接穿过。
function riskAt(map, bullets, foes, x, y, bulletImmune, gunImmune, others) {
  let r = 0;
  if (!bulletImmune) {
    for (const b of bullets) {
      if (bulletHitsBody(map, b, x, y, others)) { r += TUNE.BULLET_NOW; continue; }
      const d = b.dir | 0;
      const k = rayHitDelay(map, x, y, d, b.x, b.y, 0);
      if (k >= 0 && k <= 8) r += TUNE.BULLET_NEAR;   // 贴着弹道走，下一拍要注意
    }
  }
  if (!gunImmune) {
    for (const f of foes) {
      const k = rayHitDelay(map, f.x, f.y, f.dir | 0, x, y, 12);
      if (k < 0) continue;
      const d2 = Math.max(Math.abs(x - f.x), Math.abs(y - f.y));
      if (k <= 3) r += (d2 <= 4 ? TUNE.GUN_NEAR : TUNE.GUN_FAR) * (f.rapid > 0 ? 1.3 : 1);
      else if (k <= 6) r += TUNE.GUN_MID;
      else r += TUNE.GUN_LONG;
    }
  }
  return r;
}

// ---------- 待机锚点 ----------
function pickAnchor(s, board, need) {
  const tick = s.tick, map = s.map;
  const known = [];
  for (const id in M.sight) if (tick - M.sight[id].tick <= 9) known.push(M.sight[id]);
  const mid = (need + 25 - need - 1) / 2;
  let bx = M.anchorX, by = M.anchorY, best = -1e9;
  for (let y = need; y <= 24 - need; y++) {
    for (let x = need; x <= 24 - need; x++) {
      if (!bodyFree(map, x, y)) continue;
      let expose = 0, foe = 99;
      for (const g of known) {
        const d = Math.max(Math.abs(x - g.x), Math.abs(y - g.y));
        if (d < foe) foe = d;
        if (d <= 9 && rayHitDelay(map, g.x, g.y, g.dir | 0, x, y, 11) >= 0) expose++;
      }
      let v = -expose * 8 - Math.abs(x - mid) - Math.abs(y - mid);
      v += wallScore(map, x, y) * 3;
      if (touchesGrass(map, x, y)) v += 6;
      if (foe <= 5) v -= (6 - foe) * 7;
      if (v > best) { best = v; bx = x; by = y; }
    }
  }
  return { x: bx, y: by };
}

// ---------- 主决策 ----------
function think(s) {
  const me = s.self, tick = s.tick, map = s.map, arena = s.arena || {};
  if (tick === 0 || M === null) M = freshMemory();

  // 复活检测：死亡期间不调用 decide，回来时 tick 会跳跃。
  if (M.tick >= 0 && (tick - M.tick > 2 || me.lives < M.lives)) {
    const ax = M.anchorX, ay = M.anchorY;
    M = freshMemory(); M.anchorX = ax; M.anchorY = ay;
    M.tick = tick; M.lives = me.lives; M.hp = me.hp;
  }
  if (me.x !== M.x || me.y !== M.y) M.idle = 0; else M.idle++;
  M.x = me.x; M.y = me.y; M.dir = me.dir; M.tick = tick; M.lives = me.lives; M.hp = me.hp;
  M.trail.push(me.y * 25 + me.x);
  if (M.trail.length > 10) M.trail.shift();

  const seen = updateSights(s);
  inferExposed(s);
  refreshOwn(s);

  const z = zoneAt(tick);
  const nst = nextShrinkTick(tick);
  // 提前按下一圈规划：缩圈前 35 拍起就应当按 nextMin 活动。
  const need = nst && nst - tick < 35 ? zoneAt(nst).min : z.min;
  const board = readBoard(s);
  const late = tick >= 450 || arena.radarPulse;

  // 可见敌人与保守占位
  const foes = [];
  for (const id in seen) foes.push(M.sight[id]);
  const blocked = new Uint8Array(625);
  for (const c of foes) {
    for (let y = c.y - 1; y <= c.y + 2; y++) for (let x = c.x - 1; x <= c.x + 2; x++) {
      if (x >= 0 && y >= 0 && x <= N - 2 && y <= N - 2) blocked[y * 25 + x] = 1;
    }
  }

  // 排除自己的弹
  const hostile = [];
  for (const b of (s.radar.bullets || [])) {
    let mine = false;
    for (const p of M.ownShots) if (p.dir === b.dir && Math.abs(p.x - b.x) <= 1 && Math.abs(p.y - b.y) <= 1) mine = true;
    if (!mine) hostile.push(b);
  }

  const target = pickTarget(s, board, seen);

  // ---- 选目标格 ----
  let mode = 'hold', gx = M.anchorX, gy = M.anchorY, intent = 'hold';

  if (tick - M.anchorTick > 12) {
    const a = pickAnchor(s, board, need);
    M.anchorX = a.x; M.anchorY = a.y; M.anchorTick = tick;
  }
  gx = M.anchorX; gy = M.anchorY;

  if (target) {
    const g = target.g;
    gx = g.x + (g.vx || 0); gy = g.y + (g.vy || 0);
    mode = 'engage';
    intent = tick < (M.exposeUntil[target.id] || 0) ? 'pursue' : 'flank';
  }

  // 补给是一等目标：位置与落地时间都公开，落地前还有 15 拍预告可以提前占位。
  // 实测对手人均拿到的补给是我的两倍多，这一项必须主动争。
  const supply = arena.supply || null;
  if (supply && tick < (supply.expireTick || 0)) {
    const landed = !!supply.available;
    const pending = !landed && tick >= (supply.appearTick || 0) - 30;
    const wantRapid = supply.type === 'rapid' && me.rapidTicks < 20;
    const wantRepair = supply.type === 'repair' && me.hp < me.maxHp;
    const dSupply = Math.max(Math.abs(me.x - supply.x), Math.abs(me.y - supply.y));
    const dTarget = target ? target.dist : 99;
    // 速射在终局最值钱：圈缩到 7×7 后，4 拍间隔正好卡住 4 拍受击缓冲，可以连续压制。
    const mustHave = wantRapid && tick >= 340;
    const desperate = wantRepair && (me.hp <= 1 || (me.lives | 0) <= 1);
    let go = false;
    if (wantRapid || wantRepair) {
      if (mustHave || desperate) go = true;            // 关键资源优先于当前交战
      else if (pending) go = dSupply <= 12;            // 预告期提前占位，但不远距离裸奔
      else if (landed) go = dSupply <= dTarget + 4;     // 落地后只在不比当前交战远太多时才去
    }
    if (go) { mode = 'supply'; gx = supply.x; gy = supply.y; intent = 'resupply'; }
  }
  const myZoneCost = zoneCost(me.x, me.y, need);
  if (myZoneCost > 0) { mode = 'escape'; intent = 'retreat'; }

  // 落后且看不见任何人：压向对手最后位置或圈心，别在角落发呆。
  if (!target && board.trailing && board.top) {
    const g = M.sight[board.top.id];
    if (g && tick - g.tick <= 12) { gx = g.x; gy = g.y; mode = 'hunt'; intent = 'pursue'; }
  }

  const field = fieldFrom(map, gx, gy, blocked);

  // ---- 候选动作打分 ----
  const bulletImmune = me.hurtTicks > 1;      // 输入先减一，>1 才算本拍有效免疫
  const gunImmune = me.invincibleTicks > 0;
  const hpLow = me.hp <= 1;
  // 免伤窗口是这一局最便宜的反打时机：受击缓冲期间对方打不动我。
  // 注意敌方射线只是被「延后」而不是消失，所以枪线风险不打折，只在免伤即将结束时加码脱离。
  const immuneNow = bulletImmune || gunImmune;
  const immuneEndsNext = me.hurtTicks === 2;  // 下一拍输入降为 1，就重新可被打中
  // 命 > 分：排名先比是否还有生命，再比分数。实测败局全部源于终局三条命耗尽，
  // 所以剩余命数直接决定我的风险胃口与出手贪婪度。
  const lifeRisk = me.lives >= 3 ? 1 : me.lives === 2 ? TUNE.LIFE_RISK_2 : TUNE.LIFE_RISK_1;
  const lifeGreed = me.lives >= 3 ? 1.0 : me.lives === 2 ? TUNE.LIFE_GREED_2 : TUNE.LIFE_GREED_1;
  const riskW = lifeRisk * (hpLow ? TUNE.HPLOW_RISK : 1) * (late ? TUNE.LATE_RISK : 1);
  const shotBoost = immuneNow ? TUNE.IMMUNE_SHOT_BOOST : 1;
  // 领先且还有两条命时，终局不必要求打命：活着收官本来就排在分数前面。
  const ahead = board.top ? (board.me.points | 0) >= board.top.points : true;
  const banking = ahead && me.lives >= 2 && tick >= TUNE.BANK_TICK;
  const targetG = target ? target.g : null;
  // 缩圈分两层：当前圈外立刻扣甲，下一圈外只是提前量，按紧迫度加权。
  const shrinkIn = nst === null ? 999 : nst - tick;
  const urgency = Math.max(0, Math.min(1, (35 - shrinkIn) / 35));

  let bestMove = 'stay', bestScore = -1e18;
  for (let a = 0; a < 5; a++) {
    const mv = ALLM[a], d = MDIR[a];
    const nx = d < 0 ? me.x : me.x + DV[d][0];
    const ny = d < 0 ? me.y : me.y + DV[d][1];
    // 撞墙或撞车不会移动，但仍然转向，所以它是一次「原地转向」的手段。
    let stuckByTank = false;
    let blockedMove = false;
    if (!bodyFree(map, nx, ny)) blockedMove = true;
    else for (const c of foes) if (rectHit(nx, ny, c.x, c.y)) { blockedMove = true; stuckByTank = true; break; }
    if (stuckByTank && !turnUseful(d)) continue;

    let sc = 0;
    sc -= riskAt(map, hostile, foes, nx, ny, bulletImmune, gunImmune, foes) * riskW;
    sc -= zoneCost(nx, ny, z.min) * TUNE.ZONE_NOW_W;
    sc -= zoneCost(nx, ny, need) * TUNE.ZONE_NEXT_W * (0.25 + urgency * 0.75);
    const fi = field[ny * 25 + nx];
    sc -= fi >= 0 ? fi * TUNE.FIELD_W : 260;
    if (blockedMove) sc -= 3;

    // 这一步之后能不能开火 / 能不能为下一拍摆好射位
    if (targetG) {
      const nd = d < 0 ? me.dir : d;
      sc += shotScore(map, nx, ny, nd, targetG, false) * TUNE.SHOT_NOW * shotBoost;
      sc += shotScore(map, nx, ny, nd, targetG, true) * TUNE.SHOT_SETUP;
      sc -= Math.max(0, Math.abs(nx - targetG.x) + Math.abs(ny - targetG.y)) * (board.trailing ? 0.5 : 0.2);
    }
    // 免伤即将结束：这一拍必须脱离敌方射线，否则下一拍就会被打死。
    if (immuneEndsNext) {
      for (const f of foes) if (rayHitDelay(map, f.x, f.y, f.dir | 0, nx, ny, 12) >= 0) sc -= TUNE.BREAK_LANE;
    }

    sc += wallScore(map, nx, ny) * TUNE.WALL_BONUS;
    if (touchesGrass(map, nx, ny)) sc += TUNE.GRASS_BONUS;
    if (hpLow) {
      for (const f of foes) {
        const d2 = Math.max(Math.abs(nx - f.x), Math.abs(ny - f.y));
        if (d2 <= 5) sc -= 26 - d2 * 4;
      }
    }
    let visits = 0;
    for (const v of M.trail) if (v === ny * 25 + nx) visits++;
    sc -= visits * TUNE.TRAIL_PEN;
    if (d < 0) sc -= TUNE.STAY_PEN;
    if (M.idle >= 5) sc += a < 4 ? 9 : 0;
    if (mode === 'hold' && d < 0 && board.trailing) sc -= 6;

    if (sc > bestScore) { bestScore = sc; bestMove = mv; }
  }

  if (bestScore < -1e17) {
    for (let a = 0; a < 4; a++) {
      const d = MDIR[a], nx = me.x + DV[d][0], ny = me.y + DV[d][1];
      if (!bodyFree(map, nx, ny)) continue;
      let hit = false;
      for (const c of foes) if (rectHit(nx, ny, c.x, c.y)) hit = true;
      if (!hit) { bestMove = MVD[a]; break; }
    }
  }

  // ---- 开火决策 ----
  let fire = false;
  if (me.fireCooldown === 0 && me.onField) {
    let bestShot = 0, bestG = null;
    for (const f of foes) {
      const v = shotScore(map, me.x, me.y, me.dir, f, false);
      if (v > bestShot) { bestShot = v; bestG = f; }
    }
    // 没有直接命中：若砖墙正好挡在我与目标之间，先拆墙开一条线。
    if (!bestShot) {
      const mb = muzzleOf(me.x, me.y, me.dir);
      if (inB(mb.x, mb.y) && map[mb.y][mb.x] === 1) {
        for (const id in seen) {
          const f = M.sight[id];
          if (f.inv > 0) continue;
          if (rayHitDelay(map, me.x, me.y, me.dir, f.x, f.y, 12) < 0) continue;
          const k = rayHitDelay(map, me.x, me.y, me.dir, f.x, f.y, 12);
          if (k >= 4) { fire = true; break; }     // 只差一堵砖，值得两发换一条线
        }
      }
    }
    if (bestShot > 0) {
      // 免伤窗口里还手几乎没有代价，这是把被动挨打转成主动伤害的唯一时机。
      // lifeGreed 让「只剩一条命」时几乎不再主动接战；banking 则在领先时收手保命。
      let base = immuneNow ? 0.2 : board.trailing ? 0.55 : (late ? 0.3 : 0.62);
      if (banking && !immuneNow) base += TUNE.BANK_PEN;
      const need2 = base / lifeGreed;
      let allow = bestShot >= need2;
      if (bestG.hp <= 1) allow = true;                       // 致命窗口不放弃
      if (bestG.inv > 0) allow = false;
      if ((me.lives | 0) <= 1 && !immuneNow && bestG.hp > 1) allow = false;
      if (allow) {
        // 暴露成本：开火后 8 拍向全场公开，逐个对手算他能否立刻还手。
        let counter = 0;
        for (const f of foes) {
          const k = rayHitDelay(map, f.x, f.y, f.dir | 0, me.x, me.y, 12);
          if (k >= 0 && k <= 6) counter++;
        }
        const fatal = bestG.hp <= 1;
        // 免伤期间对方打不动我，还手数不再作为否决条件。
        if (!immuneNow) {
          if (!fatal && counter >= TUNE.COUNTER_SAFE && !board.trailing) allow = false;
          if (!fatal && counter >= TUNE.COUNTER_LATE && !late) allow = false;
          if (!fatal && hpLow && counter >= 1) allow = false;
        }
        if (allow && gunImmune && me.invincibleTicks > 8 && !fatal && !immuneNow) allow = false;  // 别浪费保护
        fire = allow;
      }
    }
  }
  if (fire) {
    registerOwnShot(s);
    if (intent === 'advance' || intent === 'hold') intent = 'siege';
  }

  const ok = { move: bestMove, fire: fire, intent: intent };
  return ok;
}

// ---------- 入口 ----------
function decide(state) {
  try {
    const a = think(state);
    if (!a || ALLM.indexOf(a.move) < 0 || typeof a.fire !== 'boolean') {
      return { move: 'stay', fire: false, intent: 'hold' };
    }
    return a;
  } catch (e) {
    return { move: 'stay', fire: false, intent: 'hold' };
  }
}
