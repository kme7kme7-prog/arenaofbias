// ============================================================================
// harrier（红隼）· 本地四人坦克乱斗 2.6.0 参赛 bot
// 策略主线：节拍破解 + 火线压制 + 硬绑定躲避 + 补给经济
//   1) 节拍破解：从合法观察（弹道归属、远距暴露现身、冷却窗口）推断每个对手
//      的开火节拍；只有在其“可能开火”的拍才把它的火线当危险——安全拍压进，
//      危险拍提前横移。学不到节拍就按保守处理。
//   2) 火线压制：有清晰射界就持续开火（普通 6 拍/速射 4 拍），残血优先（击毁+2）。
//   3) 硬绑定躲避：时间展开 BFS，把所有非我方弹（含推断的敌方虚拟弹）扫过
//      走廊按拍标禁，首步与存活深度硬绑定；受击缓冲期吞弹，复活保护期穿弹。
//   4) 补给经济：速射优先争夺、残血抢维修、落地前占位；缩圈全车体提前撤离。
// 只使用合法 state 与自身历史记忆；任何内部异常回退 stay 保底。
// ============================================================================

function decide(state) {
  if (state && state.map) { N = state.map.length; P = N - 1; C = N * N; }
  try { return think(state); } catch (err) { return { move: 'stay', fire: false, intent: 'hold' }; }
}

// ---------------- 基础 ----------------
var DX = [0, 1, 0, -1];
var DY = [-1, 0, 1, 0];
var MV = ['up', 'right', 'down', 'left'];
var N=26,P=25,C=676;
var HZ = 8; // 躲避预测视界（拍）

var M = null;

function freshMem() {
  return {
    tick: -1, lives: 4,
    shots: [],            // 我方发射 {tick, mx, my, dir, wall}
    seen: {},             // id -> 目击 {tick,x,y,dir,hp}
    rhythm: {},           // id -> {fires:[], m, res, lastFire, safeUntil}
    lock: null, lockUntil: 0,
    cover: null, coverTick: -99,
    hist: [], stuck: 0, lastMove: 'stay',
  };
}

function resetShort() {
  M.lock = null; M.lockUntil = 0;
  M.cover = null; M.coverTick = -99;
  M.hist = []; M.stuck = 0; M.lastMove = 'stay';
  M.shots = [];
}

function inB(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }
function pass(map, x, y) { return inB(x, y) && (map[y][x] === 0 || map[y][x] === 4); }
function posOK(map, x, y) {
  return x >= 0 && y >= 0 && x <= N-2 && y <= N-2 &&
    pass(map, x, y) && pass(map, x + 1, y) && pass(map, x, y + 1) && pass(map, x + 1, y + 1);
}
function inZone(x, y, z) { return x >= z.min && y >= z.min && x + 1 <= z.max && y + 1 <= z.max; }
function cheb(ax, ay, bx, by) {
  var dx = ax - bx; if (dx < 0) dx = -dx;
  var dy = ay - by; if (dy < 0) dy = -dy;
  return dx > dy ? dx : dy;
}
// 车身到圈盒的曼哈顿距离（圈内为 0）
function zoneGap(x, y, z) {
  var dx = 0, dy = 0;
  if (x + 1 < z.min) dx = z.min - (x + 1); else if (x > z.max) dx = x - z.max;
  if (y + 1 < z.min) dy = z.min - (y + 1); else if (y > z.max) dy = y - z.max;
  return dx + dy;
}
function manh(ax, ay, bx, by) {
  var dx = ax - bx; if (dx < 0) dx = -dx;
  var dy = ay - by; if (dy < 0) dy = -dy;
  return dx + dy;
}
function muzzleOf(x, y, d) {
  if (d === 0) return [x, y - 1];
  if (d === 1) return [x + 2, y];
  if (d === 2) return [x, y + 2];
  return [x - 1, y];
}
function hitBody(set, x, y) {
  return set && (set[y*N+ x] || set[y*N+ x + 1] || set[(y + 1) * N + x] || set[(y + 1) * N + x + 1]);
}

// ---------------- 洪水填充（2×2 顶格） ----------------
function flood(map, sx, sy, blocked) {
  var dist = new Int16Array(C);
  for (var i = 0; i < C; i++) dist[i] = 9999;
  if (!posOK(map, sx, sy)) return dist;
  var q = [sy*N+ sx];
  dist[q[0]] = 0;
  for (var h = 0; h < q.length; h++) {
    var cur = q[h], cx = cur %N, cy = (cur /N) | 0, nd = dist[cur] + 1;
    for (var d = 0; d < 4; d++) {
      var nx = cx + DX[d], ny = cy + DY[d], ni = ny*N+ nx;
      if (dist[ni] <= nd) continue;
      if (!posOK(map, nx, ny)) continue;
      if (blocked && blocked[ni]) continue;
      dist[ni] = nd;
      q.push(ni);
    }
  }
  return dist;
}

function enemyBlock(tanks) {
  var b = new Uint8Array(C);
  for (var k = 0; k < tanks.length; k++) {
    var e = tanks[k];
    var xs = [e.x - 1, e.x], ys = [e.y - 1, e.y];
    for (var ix = 0; ix < 2; ix++) for (var iy = 0; iy < 2; iy++) {
      var px = xs[ix], py = ys[iy];
      if (px >= 0 && py >= 0 && px <= N-2 && py <= N-2) b[py*N+ px] = 1;
    }
  }
  return b;
}

// 射线：从炮口格沿 d 逐格。钢/砖 → 墙；命中可见车身 → 该车 id。
// skipSelf：为选点校验服务，忽略我当前车身（未来我已不在那儿）。
function walkRay(s, sx, sy, d, tanks, skipSelf) {
  var cx = sx, cy = sy;
  for (var i = 0; i < N; i++) {
    cx += DX[d]; cy += DY[d];
    if (!inB(cx, cy)) return { wall: 1, len: i };
    var ter = s.map[cy][cx];
    if (ter === 1 || ter === 2) return { wall: 1, len: i };
    if (!skipSelf) {
      var sl = s.self;
      if (cx >= sl.x && cx < sl.x + 2 && cy >= sl.y && cy < sl.y + 2) return { hit: 'me', len: i };
    }
    for (var k = 0; k < tanks.length; k++) {
      var e = tanks[k];
      if (cx >= e.x && cx < e.x + 2 && cy >= e.y && cy < e.y + 2) return { hit: e.id, len: i };
    }
  }
  return { len: 99 };
}

// ---------------- 记忆与观察 ----------------
function isMine(b, t) {
  for (var i = 0; i < M.shots.length; i++) {
    var sh = M.shots[i], age = t - sh.tick;
    if (age < 1 || age > 12) continue;
    if (sh.dir !== b.dir) continue;
    if (sh.mx + DX[sh.dir] * age * 3 === b.x && sh.my + DY[sh.dir] * age * 3 === b.y) return true;
  }
  return false;
}

function noteFire(id, F) {
  var r = M.rhythm[id];
  if (!r) { r = M.rhythm[id] = { fires: [], m: 0, res: 0, lastFire: -99, safeUntil: 0 }; }
  if (r.fires.length && r.fires[r.fires.length - 1] === F) {
    if (r.safeUntil < F + 5) r.safeUntil = F + 5;
    return;
  }
  r.lastFire = F;
  if (r.safeUntil < F + 5) r.safeUntil = F + 5;
  r.fires.push(F);
  if (r.fires.length > 8) r.fires.shift();
  r.m = 0;
  if (r.fires.length >= 2) {
    for (var m = 16; m >= 4; m--) {
      var res = ((r.fires[0] % m) + m) % m, ok = true;
      for (var i = 1; i < r.fires.length; i++) {
        if (((r.fires[i] % m) + m) % m !== res) { ok = false; break; }
      }
      if (ok) { r.m = m; r.res = res; break; }
    }
    if (r.fires.length >= 3 && r.m === 0) r.fires = [r.fires[r.fires.length - 1]]; // 节奏失效，仅留最新样本
  }
}

function observe(s) {
  var t = s.tick;
  M.shots = M.shots.filter(function (sh) { return t - sh.tick <= 14; });

  // 先用上拍目击做弹道归属（该弹上拍发射），再更新目击
  for (var bi = 0; bi < s.radar.bullets.length; bi++) {
    var b = s.radar.bullets[bi];
    if (isMine(b, t)) continue;
    for (var id in M.seen) {
      var se = M.seen[id];
      if (t - se.tick !== 1) continue;
      if (se.dir !== b.dir) continue;
      var m = muzzleOf(se.x, se.y, se.dir);
      for (var step = 0; step <= 4; step++) {
        if (m[0] + DX[se.dir] * step === b.x && m[1] + DY[se.dir] * step === b.y) { noteFire(id, t - 1); break; }
      }
    }
  }

  // 非脉冲期看到 6 格外的车 → 它刚开火（暴露 8 拍），时刻不确定，只进冷却窗口
  if (!s.arena.radarPulse) {
    for (var ei = 0; ei < s.radar.tanks.length; ei++) {
      var e2 = s.radar.tanks[ei];
      if (cheb(s.self.x, s.self.y, e2.x, e2.y) > 6) {
        var r = M.rhythm[e2.id];
        if (!r) { r = M.rhythm[e2.id] = { fires: [], m: 0, res: 0, lastFire: -99, safeUntil: 0 }; }
        if (t - 1 > r.lastFire) r.lastFire = t - 1;
        if (r.safeUntil < t + 4) r.safeUntil = t + 4;
      }
    }
  }

  // 最后更新目击
  for (var i = 0; i < s.radar.tanks.length; i++) {
    var e = s.radar.tanks[i];
    M.seen[e.id] = { tick: t, x: e.x, y: e.y, dir: e.dir, hp: e.hp };
  }
}

function mayFire(s, id, tickAbs) {
  var r = M.rhythm[id];
  if (!r) return true;
  if (tickAbs <= r.safeUntil) return false; // 刚开火，冷却中
  if (r.m >= 4 && r.fires.length >= 3) {
    var rr = ((tickAbs % r.m) + r.m) % r.m;
    return rr === r.res;
  }
  return true; // 节奏未知或样本不足：保守
}

// ---------------- 我方在飞弹 ----------------
function recordShot(s, d) {
  var m = muzzleOf(s.self.x, s.self.y, d);
  var wall = 27;
  var cx = m[0], cy = m[1];
  for (var i = 0; i < 27; i++) {
    cx += DX[d]; cy += DY[d];
    if (!inB(cx, cy) || s.map[cy][cx] === 1 || s.map[cy][cx] === 2) { wall = i + 1; break; }
  }
  M.shots.push({ tick: s.tick, mx: m[0], my: m[1], dir: d, wall: wall });
  if (M.shots.length > 8) M.shots.shift();
}

function inFlight(t) {
  var n = 0;
  for (var i = 0; i < M.shots.length; i++) {
    var sh = M.shots[i], age = t - sh.tick;
    if (age >= 0 && age * 3 < sh.wall) n++;
  }
  return n;
}

// ---------------- 危险走廊 ----------------
function corridor(sets, s, tanks, sx, sy, d, startOff) {
  var x = sx, y = sy;
  for (var off = startOff; off < HZ; off++) {
    var set = sets[off];
    var cx = x, cy = y;
    for (var j = 0; j < 4; j++) {
      if (j > 0) { cx += DX[d]; cy += DY[d]; }
      if (!inB(cx, cy)) return;
      var ter = s.map[cy][cx];
      var myBuf = s.self.hurtTicks - 1 - off > 0;       // 该拍我若受击缓冲，弹被吞
      var myProt = s.self.invincibleTicks - off > 0;    // 该拍我若有保护，弹穿过
      var onMe = cx >= s.self.x && cx < s.self.x + 2 && cy >= s.self.y && cy < s.self.y + 2;
      if (onMe && myBuf) return;                         // 被我吞掉：后面安全
      // 关键：不因我当前车身截断——弹速 3 倍于车，躲闪后弹会继续飞过“身后格”。
      // 保护期穿过也不标记；否则标记（含我的格）并继续延伸。
      if (ter === 1 || ter === 2) return;
      if (!(onMe && myProt)) set[cy*N+ cx] = 1;
      var blocked = false;
      for (var k = 0; k < tanks.length; k++) {
        var e = tanks[k];
        if (cx >= e.x && cx < e.x + 2 && cy >= e.y && cy < e.y + 2) { blocked = true; break; }
      }
      if (blocked) return;
    }
    x = cx; y = cy;
  }
}

function buildDanger(s, tanks) {
  var sets = [];
  for (var i = 0; i < HZ; i++) sets.push({});
  for (var bi = 0; bi < s.radar.bullets.length; bi++) {
    var b = s.radar.bullets[bi];
    if (isMine(b, s.tick)) continue;
    corridor(sets, s, tanks, b.x, b.y, b.dir, 0);
  }
  // 虚拟弹：可见敌在其“可能开火”的拍沿当前朝向开火
  for (var ei = 0; ei < tanks.length; ei++) {
    var e = tanks[ei];
    for (var off = 0; off < HZ; off++) {
      if (!mayFire(s, e.id, s.tick + off)) continue;
      var m = muzzleOf(e.x, e.y, e.dir);
      if (!inB(m[0], m[1])) continue;
      corridor(sets, s, tanks, m[0], m[1], e.dir, off);
    }
  }
  return sets;
}

// ---------------- 躲避求解（时间展开 BFS） ----------------
// zoneCtx：圈外致死判定进求解器——下一缩圈拍之后按下一圈，
// 200 拍起当前圈每个伤害拍（tick%10===0）当拍圈外也视同致死。
function solve(s, danger, blocked, zoneCtx) {
  var me = s.self, map = s.map;
  var toShrink = zoneCtx ? zoneCtx.toShrink : 9999;
  var nz = zoneCtx ? zoneCtx.nextZone : null;
  var cz = zoneCtx ? zoneCtx.curZone : null;
  var tick = zoneCtx ? zoneCtx.tick : 0;
  var first = new Int8Array(HZ * C);
  var seenA = new Uint8Array(HZ * C);
  for (var i = 0; i < HZ * C; i++) first[i] = -1;
  function doomed(x, y, t) {
    if (t >= toShrink) return !inZone(x, y, nz);
    // 圈伤只在 hp===1 时才等于死；hp===2 交给评分层软惩罚
    if (cz && s.self.hp === 1 && tick + t >= 200 && (tick + t) % 10 === 0) return !inZone(x, y, cz);
    return false;
  }
  var layers = [];
  var l0 = [];
  for (var d = 0; d < 4; d++) {
    var nx = me.x + DX[d], ny = me.y + DY[d];
    if (!posOK(map, nx, ny) || blocked[ny*N+ nx]) continue;
    if (hitBody(danger[0], nx, ny) || doomed(nx, ny, 0)) continue;
    var si = ny*N+ nx;
    if (!seenA[si]) { seenA[si] = 1; first[si] = d; l0.push(si); }
  }
  if (!hitBody(danger[0], me.x, me.y) && !doomed(me.x, me.y, 0)) {
    var s0 = me.y*N+ me.x;
    if (!seenA[s0]) { seenA[s0] = 1; first[s0] = 4; l0.push(s0); }
  }
  layers.push(l0);
  for (var t = 0; t + 1 < HZ; t++) {
    var lt = layers[t], ln = [];
    for (var ii = 0; ii < lt.length; ii++) {
      var p = lt[ii], px = p %N, py = (p /N) | 0;
      for (var m = 0; m < 5; m++) {
        var nx2 = m < 4 ? px + DX[m] : px, ny2 = m < 4 ? py + DY[m] : py;
        if (m < 4 && (!posOK(map, nx2, ny2) || blocked[ny2*N+ nx2])) { nx2 = px; ny2 = py; }
        if (hitBody(danger[t + 1], nx2, ny2) || doomed(nx2, ny2, t + 1)) continue;
        var si2 = (t + 1) * C + ny2*N+ nx2;
        if (seenA[si2]) continue;
        seenA[si2] = 1;
        first[si2] = first[t * C + p];
        ln.push(ny2*N+ nx2);
      }
    }
    layers.push(ln);
    if (!ln.length) break;
  }
  var depth = [0, 0, 0, 0, 0];
  for (var tt = 0; tt < layers.length; tt++) {
    for (var jj = 0; jj < layers[tt].length; jj++) {
      var p2 = layers[tt][jj], fm = first[tt * C + p2];
      if (fm >= 0 && tt > depth[fm]) depth[fm] = tt;
    }
  }
  return depth;
}

// ---------------- 开火选择 ----------------
function bestShot(s) {
  var me = s.self;
  if (me.fireCooldown !== 0) return null;
  if (me.invincibleTicks > 0) return null;      // 保护期不开火（保持无敌）
  if (inFlight(s.tick) >= 2) return null;
  var rapid = me.rapidTicks > 0;
  var best = null;
  for (var i = 0; i < s.radar.tanks.length; i++) {
    var e = s.radar.tanks[i];
    if (e.invincibleTicks > 0) continue;
    if (e.hurtTicks > 1) continue;              // 缓冲吸收，浪费弹
    for (var d = 0; d < 4; d++) {
      var m = muzzleOf(me.x, me.y, d);
      if (!inB(m[0], m[1])) continue;
      var r = walkRay(s, m[0], m[1], d, s.radar.tanks);
      if (r.hit !== e.id) continue;
      var gate = rapid ? 9 : 8;
      if (e.hp === 1) gate = 10;
      if (r.len > gate) continue;
      var q = (e.hp === 1 ? 100 : 0) + (d === me.dir ? 50 : 0) - r.len * 3;
      if (!best || q > best.q) best = { q: q, d: d, e: e, len: r.len };
    }
  }
  return best;
}

// ---------------- 目标选择 ----------------
function sbOf(s, id) {
  for (var i = 0; i < s.scoreboard.length; i++) if (s.scoreboard[i].id === id) return s.scoreboard[i];
  return null;
}
function pickTarget(s, leading) {
  var me = s.self, t = s.tick;
  var best = null;
  for (var i = 0; i < s.radar.tanks.length; i++) {
    var e = s.radar.tanks[i];
    if (leading && t >= 470 && e.hp > 1) continue;    // 领先收官只补必杀
    var dist = cheb(me.x, me.y, e.x, e.y);
    var sc = (2 - e.hp) * 8 + Math.max(0, 10 - dist) * 2;
    if (e.hurtTicks <= 1) sc += 3;
    if (e.hp === 1) sc += 6;
    if (e.invincibleTicks > 0) sc -= 14;
    if (M.lock === e.id && t < M.lockUntil) sc += 5;
    if (!best || sc > best.sc) best = { sc: sc, e: e, dist: dist };
  }
  return best;
}

// ---------------- 任务层 ----------------
function zoneEscapeGoal(s, z, floodMe) {
  var best = null;
  for (var y = z.min; y <= z.max - 1; y++) {
    for (var x = z.min; x <= z.max - 1; x++) {
      if (!posOK(s.map, x, y)) continue;
      var d = floodMe[y*N+ x];
      if (d < 9999 && (!best || d < best.d)) best = { x: x, y: y, d: d };
    }
  }
  return best || { x: s.self.x, y: s.self.y };
}

function duelGoal(s, tgt, floodMe) {
  var e = tgt.e, me = s.self;
  var myEff = me.hp + (me.lives - 1) * 2 + (me.hurtTicks > 0 ? 1 : 0);
  var sb = sbOf(s, e.id);
  var eEff = e.hp + ((sb ? sb.lives : 1) - 1) * 2;
  // 生命少于场上最多者：排名键“仍有生命”优先于积分，拉开距离保命
  var maxOppLives = 1;
  for (var li = 0; li < s.opponents.length; li++) {
    var op = s.opponents[li];
    if (op.status === 'active' && op.lives > maxOppLives) maxOppLives = op.lives;
  }
  var cautious = me.lives < maxOppLives;
  var kite = myEff < eEff || cautious;
  var rapid = me.rapidTicks > 0;
  var spots = [];
  var x, y;
  for (var i = 0; i < 2; i++) {
    var cx = e.x + i;
    for (y = e.y + 2; y <= Math.min(N-2, e.y + 9); y++) spots.push({ x: cx, y: y, d: 0, gap: y - (e.y + 2) });
    for (y = Math.max(0, e.y - 9); y <= e.y - 2; y++) spots.push({ x: cx, y: y, d: 2, gap: e.y - (y + 2) });
  }
  for (var j = 0; j < 2; j++) {
    var cy = e.y + j;
    for (x = Math.max(0, e.x - 9); x <= e.x - 2; x++) spots.push({ x: x, y: cy, d: 1, gap: e.x - (x + 2) });
    for (x = e.x + 3; x <= Math.min(N-2, e.x + 10); x++) spots.push({ x: x, y: cy, d: 3, gap: x - (e.x + 2) });
  }
  var best = null;
  for (var k = 0; k < spots.length; k++) {
    var sp = spots[k];
    if (!posOK(s.map, sp.x, sp.y)) continue;
    var dd = floodMe[sp.y*N+ sp.x];
    if (dd >= 9999) continue;
    var m = muzzleOf(sp.x, sp.y, sp.d);
    if (!inB(m[0], m[1])) continue;
    var r = walkRay(s, m[0], m[1], sp.d, s.radar.tanks, true);
    if (r.hit !== e.id) continue;
    var sc = dd * 1.2 + Math.abs(sp.gap - 4) * 1.5 + (sp.gap < 2 ? 6 : 0);
    // 落点避开敌方当前炮线（在射线上 +12；若我受击缓冲期则免罚——弹被吞）
    var em = muzzleOf(e.x, e.y, e.dir);
    if (me.hurtTicks <= 1) {
      var onLine = false;
      if (e.dir === 0 && sp.x >= em[0] && sp.x <= em[0] + 1 && sp.y < e.y) onLine = true;
      if (e.dir === 2 && sp.x >= em[0] && sp.x <= em[0] + 1 && sp.y > e.y + 1) onLine = true;
      if (e.dir === 1 && sp.y >= em[1] && sp.y <= em[1] + 1 && sp.x > e.x + 1) onLine = true;
      if (e.dir === 3 && sp.y >= em[1] && sp.y <= em[1] + 1 && sp.x < e.x) onLine = true;
      if (onLine) sc += 12;
    }
    if (kite) sc += Math.max(0, 5 - sp.gap) * 3;
    if (cautious && sp.gap < 4) sc += (4 - sp.gap) * 2;
    if (rapid) sc += Math.max(0, sp.gap - 3);
    for (var oi = 0; oi < s.radar.tanks.length; oi++) {
      var o = s.radar.tanks[oi];
      if (o.id !== e.id) sc += Math.max(0, 7 - cheb(sp.x, sp.y, o.x, o.y)) * 2;
    }
    if (!best || sc < best.sc) best = { x: sp.x, y: sp.y, sc: sc };
  }
  if (best) return best;
  return { x: e.x, y: e.y };
}

function pickCover(s, zone, minEnemyDist) {
  var best = null;
  var mid = (zone.min + zone.max - 1) / 2;
  var md = minEnemyDist || 4;
  for (var y = Math.max(0, zone.min); y <= zone.max - 1; y++) {
    for (var x = Math.max(0, zone.min); x <= zone.max - 1; x++) {
      if (!posOK(s.map, x, y)) continue;
      var near = false, grass = false;
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
        if (s.map[y + dy][x + dx] === 4) grass = true;
      }
      var nearest = 99;
      for (var k = 0; k < s.radar.tanks.length; k++) {
        var e = s.radar.tanks[k];
        var cd = cheb(x, y, e.x, e.y);
        if (cd < nearest) nearest = cd;
        if (cd <= md) { near = true; break; }
      }
      if (near) continue;
      var cost = Math.abs(x - mid) + Math.abs(y - mid) - (grass ? 5 : 0) - Math.min(8, nearest) * (md >= 6 ? 1.5 : 0);
      if (!best || cost < best.cost) best = { x: x, y: y, cost: cost };
    }
  }
  return best;
}

function chooseMission(s, zone, nextZone, toShrink, floodMe) {
  var me = s.self, t = s.tick;
  if (!inZone(me.x, me.y, zone)) return { mode: 'zone' };
  var zoneUrgency = toShrink <= (me.hp === 1 ? 24 : 16);
  if (!inZone(me.x, me.y, nextZone) && zoneUrgency) return { mode: 'zone' };

  var sb = sbOf(s, me.id);
  var aliveOpp = [];
  for (var i = 0; i < s.opponents.length; i++) {
    var o = s.opponents[i];
    if (o.status === 'active' && o.lives > 0) aliveOpp.push(o);
  }
  var leading = !!sb && aliveOpp.length > 0;
  if (leading) {
    for (var oi = 0; oi < aliveOpp.length; oi++) {
      if (sb.points < aliveOpp[oi].points + 2 || me.lives < aliveOpp[oi].lives) { leading = false; break; }
    }
  }

  // 复活保护期：借无敌前压（不开火以保持保护）
  if (me.invincibleTicks > 10) {
    if (M.lock && M.seen[M.lock] && t - M.seen[M.lock].tick <= 12) {
      return { mode: 'hunt', goal: { x: M.seen[M.lock].x, y: M.seen[M.lock].y } };
    }
    return { mode: 'hold' };
  }

  // 补给：落地前占位 + 争夺
  var box = s.arena.supply;
  if (box) {
    var want = box.type === 'rapid' ? true : me.hp < 2;
    if (want) {
      var eta = floodMe[box.y*N+ box.x];
      var timeLeft = box.expireTick - t;
      if (eta < 9999 && eta + 2 <= timeLeft) {
        var closer = 0, nearest = 999, unknown = 0;
        for (var ai = 0; ai < aliveOpp.length; ai++) {
          var se = M.seen[aliveOpp[ai].id];
          if (!se || t - se.tick > 20) { unknown++; continue; }
          var ed = cheb(se.x, se.y, box.x, box.y);
          if (ed < nearest) nearest = ed;
          if (ed <= eta + 1) closer++;
        }
        if (unknown > 0) nearest = Math.min(nearest, eta); // 位置未知的对手按已到场估计
        var desperate = me.hp === 1 && box.type === 'repair';
        var margin = box.type === 'rapid' ? 2 : 1;
        var okContest = desperate ||
          (closer === 0 && (unknown === 0 || box.type === 'rapid')) ||
          (closer <= 1 && eta + margin <= nearest);
        if (okContest) return { mode: 'supply', goal: { x: box.x, y: box.y } };
      }
    }
  }

  var tgt = pickTarget(s, leading);
  if (tgt) {
    var sbT = sbOf(s, tgt.e.id);
    var eEff = tgt.e.hp + ((sbT ? sbT.lives : 1) - 1) * 2;
    // 残血且无缓冲：脱离纠缠（对方再中一枪就没了）；对方也只剩 1 甲则对拼
    if (me.hp === 1 && eEff >= 2 && me.hurtTicks <= 1) return { mode: 'evade' };
    M.lock = tgt.e.id;
    M.lockUntil = t + 8;
    return { mode: 'duel', target: tgt };
  }
  if (M.lock && M.seen[M.lock]) {
    var se2 = M.seen[M.lock];
    var still = false;
    for (var li = 0; li < aliveOpp.length; li++) if (aliveOpp[li].id === M.lock) still = true;
    if (still && t - se2.tick <= 5) return { mode: 'hunt', goal: { x: se2.x, y: se2.y } };
  }
  return { mode: 'hold' };
}

function missionGoal(s, miss, zone, nextZone, floodMe) {
  if (miss.mode === 'zone') return zoneEscapeGoal(s, nextZone, floodMe);
  if (miss.mode === 'supply') return miss.goal;
  if (miss.mode === 'duel') return duelGoal(s, miss.target, floodMe);
  if (miss.mode === 'hunt') return miss.goal;
  if (miss.mode === 'evade') {
    // 远离所有可见敌的掩体/草丛点，6 拍重选
    var t = s.tick;
    if (!M.cover || t - M.coverTick > 6 || !posOK(s.map, M.cover.x, M.cover.y) || !inZone(M.cover.x, M.cover.y, nextZone)) {
      var c2 = pickCover(s, nextZone, 6);
      if (c2) { M.cover = c2; M.coverTick = t; }
    }
    if (M.cover) return M.cover;
  }
  // hold：掩体/草丛驻点，12 拍重选
  var th = s.tick;
  if (!M.cover || th - M.coverTick > 12 || !posOK(s.map, M.cover.x, M.cover.y) || !inZone(M.cover.x, M.cover.y, nextZone)) {
    var c = pickCover(s, nextZone, 4);
    if (c) { M.cover = c; M.coverTick = th; }
  }
  return M.cover || { x: s.self.x, y: s.self.y };
}

// ---------------- 移动选择 ----------------
function pickMove(s, miss, goal, depth, danger, blocked, floodGoal, toShrink, shot, floodMe) {
  var me = s.self, map = s.map;
  var t = s.tick;
  var cands = [];
  for (var d = 0; d < 4; d++) {
    var nx = me.x + DX[d], ny = me.y + DY[d];
    var ok = posOK(map, nx, ny) && !blocked[ny*N+ nx];
    cands.push({ m: d, x: ok ? nx : me.x, y: ok ? ny : me.y, stepped: ok });
  }
  cands.push({ m: 4, x: me.x, y: me.y, stepped: true });

  var maxD = -1;
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i];
    var dp = c.stepped && c.m < 4 ? depth[c.m] : depth[4];
    if (dp > maxD) maxD = dp;
  }
  var forced = maxD < HZ - 1;

  var gx = goal.x, gy = goal.y;
  var curZone = s.arena.safeZone;
  var nz2 = nextZoneOf(s);
  var best = null;
  for (var k = 0; k < cands.length; k++) {
    var c2 = cands[k];
    var dp2 = c2.stepped && c2.m < 4 ? depth[c2.m] : depth[4];
    var sc = 0;
    if (forced) sc = dp2 * 100000;
    else if (dp2 < HZ - 1) sc -= 1e7;
    if (hitBody(danger[1], c2.x, c2.y)) sc -= 50000;
    var gd = floodGoal[c2.y*N+ c2.x];
    if (gd >= 9999) gd = manh(c2.x, c2.y, gx, gy) + 60;
    sc -= gd * 4;
    var zg = zoneGap(c2.x, c2.y, curZone);
    if (zg > 0) {
      sc -= 9000 + zg * 3000;
      // 伤害拍将至仍留在圈外：重罚（圈伤无视保护与缓冲）
      if (t >= 200) {
        var nextDmg = (10 - (t % 10)) % 10;
        if (nextDmg <= 1 && s.self.hp === 1) sc -= 60000;
        else if (nextDmg <= 2) sc -= 18000;
      }
    }
    else {
      var urg = s.self.hp === 1 ? 24 : 16;
      var zg2 = zoneGap(c2.x, c2.y, nz2);
      if (zg2 > 0 && toShrink <= urg) sc -= 2200 + zg2 * 1500 + Math.max(0, urg - toShrink) * 400;
    }
    if (shot && shot.d !== me.dir && c2.m === shot.d) sc += 35; // 走向射击朝向（含撞墙原地转向）
    if (MV[c2.m] === M.lastMove) sc += 1.5;
    sc += (s.random % 89) / 89;
    if (!best || sc > best.sc) best = { sc: sc, m: c2.m };
  }
  return best ? MV[best.m] : 'stay';
}

function nextZoneOf(s) {
  var z = s.arena.safeZone;
  return z.nextShrinkTick === null ? { min: z.min, max: z.max } : { min: z.nextMin, max: z.nextMax ?? N-1-z.nextMin };
}

function antiStuck(s, move, floodMe, blocked, moving) {
  var me = s.self;
  var key = me.y*N+ me.x;
  var last = M.hist.length ? M.hist[M.hist.length - 1] : -1;
  if (key === last && moving) M.stuck++; else if (key !== last) M.stuck = 0;
  M.hist.push(key);
  if (M.hist.length > 10) M.hist.shift();
  if (M.stuck >= 4 && floodMe[key] > 0) {
    var bd = 9999, bm = move;
    for (var d = 0; d < 4; d++) {
      var nx = me.x + DX[d], ny = me.y + DY[d];
      if (!posOK(s.map, nx, ny) || blocked[ny*N+ nx]) continue;
      var dd = floodMe[ny*N+ nx];
      if (dd < bd) { bd = dd; bm = MV[d]; }
    }
    M.stuck = 0;
    return bm;
  }
  return move;
}

// ---------------- 主流程 ----------------
function think(s) {
  var t = s.tick;
  if (!M || t <= M.tick) M = freshMem();
  var gap = M.tick >= 0 ? t - M.tick : 1;
  if (gap > 1 || s.self.lives < M.lives) resetShort();
  M.lives = s.self.lives;
  M.tick = t;

  var zone = s.arena.safeZone;
  var nextZone = nextZoneOf(s);
  var toShrink = zone.nextShrinkTick === null ? 9999 : zone.nextShrinkTick - t;

  observe(s);

  var tanks = s.radar.tanks;
  var blocked = enemyBlock(tanks);
  var floodMe = flood(s.map, s.self.x, s.self.y, blocked);
  var danger = buildDanger(s, tanks);

  var miss = chooseMission(s, zone, nextZone, toShrink, floodMe);
  var goal = missionGoal(s, miss, zone, nextZone, floodMe);
  var floodGoal = flood(s.map, goal.x, goal.y, null);

  var depth = solve(s, danger, blocked, { toShrink: toShrink, nextZone: nextZone, curZone: zone, tick: t });
  var shot = bestShot(s);
  var fire = false;
  if (shot && shot.d === s.self.dir) { fire = true; recordShot(s, shot.d); }

  var move = pickMove(s, miss, goal, depth, danger, blocked, floodGoal, toShrink, shot, floodMe);
  move = antiStuck(s, move, floodMe, blocked, move !== 'stay');
  M.lastMove = move;

  var intent = 'hold';
  if (fire) intent = 'pursue';
  else if (miss.mode === 'zone' || miss.mode === 'evade') intent = 'retreat';
  else if (miss.mode === 'supply') intent = 'resupply';
  else if (miss.mode === 'duel' || miss.mode === 'hunt') intent = 'pursue';
  if (hitBody(danger[0], s.self.x, s.self.y) || hitBody(danger[1], s.self.x, s.self.y)) intent = 'defend';
  return { move: move, fire: fire, intent: intent };
}
