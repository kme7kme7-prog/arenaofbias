// 蝰蛇 (Viper) · 四人坦克乱斗 2.6 参赛 bot
// 核心策略：一击脱离的猎手。利用掩体锚点观察全局，等待敌方开火后的冷却窗口
// 或残血目标出现；用 BFS 生存求解保证存活；残局按比分切换攻防姿态。
// 仅依据规则文档与引擎合同编写，只使用合法 state 与自身历史。

var DV = [[0, - 1], [1, 0], [0, 1], [- 1, 0]];
var DN = ['up', 'right', 'down', 'left'];
var GRID = 26;
var ZONE_SHRINK = 200;
var ZONE_STEP = 50;
var ZONE_MAX = 9;
var DODGE_H = 4;
var AIM_T = 5;
var LANE_T = 6;
var ANCHOR_EVERY = 8;
var STUCK_L = 5;

var M = null;
function freshMem() {
  return {
    last: -1, lives: 3, prevHp: 2,
    seen: {}, fired: [],
    plan: -1, stuck: 0, lx: -1, ly: -1,
    tgt: null, tgtTick: -99,
    anchor: null, anchorTick: -99,
    retreatUntil: -1, lastFireTick: -99,
    shotTick: {}
  };
}

function marginAt(t) {
  if (t < ZONE_SHRINK) return 0;
  return Math.min(ZONE_MAX, 2 + Math.floor((t - ZONE_SHRINK) / ZONE_STEP));
}
function zoneAt(t) {
  var m = marginAt(t);
  return { min: m, max: 25 - m };
}
function inZone(x, y, z) {
  return x >= z.min && y >= z.min && x + 1 <= z.max && y + 1 <= z.max;
}
function bodyFits(x, y) {
  return x >= 0 && y >= 0 && x <= 24 && y <= 24;
}
function cellPass(map, x, y) {
  if (x < 0 || y < 0 || x >= GRID || y >= GRID) return false;
  var c = map[y][x];
  return c === 0 || c === 4;
}
function bodyPass(map, x, y) {
  return cellPass(map, x, y) && cellPass(map, x + 1, y) &&
    cellPass(map, x, y + 1) && cellPass(map, x + 1, y + 1);
}
function muzzleOf(x, y, d) {
  if (d === 0) return { x: x, y: y - 1 };
  if (d === 1) return { x: x + 2, y: y };
  if (d === 2) return { x: x, y: y + 2 };
  return { x: x - 1, y: y };
}
function cheb(ax, ay, bx, by) {
  var dx = ax - bx, dy = ay - by;
  if (dx < 0) dx = -dx;
  if (dy < 0) dy = -dy;
  return dx > dy ? dx : dy;
}
function mix32(n) {
  n = (n ^ (n >>> 16)) >>> 0;
  n = (n * 0x45d9f3b) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n;
}

function laneFor(map, mx, my, d, maxT) {
  var cells = [];
  if (mx < 0 || my < 0 || mx >= GRID || my >= GRID) return { cells: cells, end: 'oob' };
  cells.push({ x: mx, y: my });
  var t0 = map[my][mx];
  if (t0 === 2) return { cells: cells, end: 'steel' };
  if (t0 === 1) return { cells: cells, end: 'brick' };
  var cx = mx, cy = my;
  var steps = 3 * maxT;
  for (var i = 1; i <= steps; i++) {
    cx += DV[d][0]; cy += DV[d][1];
    if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return { cells: cells, end: 'wall' };
    var t = map[cy][cx];
    cells.push({ x: cx, y: cy });
    if (t === 2) return { cells: cells, end: 'steel' };
    if (t === 1) return { cells: cells, end: 'brick' };
  }
  return { cells: cells, end: 'range' };
}

function laneForb(lane, maxTau) {
  var forb = [[]];
  var c = lane.cells;
  for (var tau = 1; tau <= maxTau; tau++) {
    var arr = [];
    var lo = 3 * (tau - 1);
    var hi = Math.min(3 * tau, c.length - 1);
    for (var i = lo; i <= hi; i++) arr.push(c[i]);
    forb.push(arr);
  }
  return forb;
}

function bodyTouch(px, py, grid) {
  for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
    var cx = px + dx, cy = py + dy;
    if (cx >= 0 && cy >= 0 && cx < GRID && cy < GRID && grid[cy * GRID + cx]) return true;
  }
  return false;
}

function listToGrid(list) {
  var g = new Uint8Array(GRID * GRID);
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (c.x >= 0 && c.y >= 0 && c.x < GRID && c.y < GRID) g[c.y * GRID + c.x] = 1;
  }
  return g;
}

function solveEvade(sx, sy, H, forbs, staticGrid, map) {
  var grids = [];
  for (var i = 0; i < forbs.length; i++) grids.push(listToGrid(forbs[i]));
  var key = function (x, y) { return x + y * 25; };
  var layer = new Map();
  layer.set(key(sx, sy), -2);
  var reach = {};
  for (var tau = 1; tau <= H; tau++) {
    var fb = grids[Math.min(tau, grids.length - 1)];
    var next = new Map();
    layer.forEach(function (fd, pk) {
      var px = pk % 25, py = (pk - px) / 25;
      for (var d = -1; d < 4; d++) {
        var nx = px, ny = py;
        if (d >= 0) {
          nx += DV[d][0]; ny += DV[d][1];
          if (!bodyFits(nx, ny)) continue;
          if (!bodyPass(map, nx, ny)) continue;
          if (staticGrid && bodyTouch(nx, ny, staticGrid)) continue;
        }
        if (bodyTouch(nx, ny, fb)) continue;
        var nk = key(nx, ny);
        if (!next.has(nk)) next.set(nk, fd === -2 ? d : fd);
      }
    });
    if (next.size === 0) return { alive: false, reach: reach };
    layer = next;
    layer.forEach(function (fd) {
      var k = String(fd);
      if (!(k in reach) || reach[k] < tau) reach[k] = tau;
    });
  }
  return { alive: true, reach: reach };
}

function distField(goals, map, staticGrid) {
  var dist = new Int16Array(GRID * GRID);
  dist.fill(-1);
  var frontier = [];
  for (var i = 0; i < goals.length; i++) {
    var g = goals[i];
    if (!bodyPass(map, g.x, g.y)) continue;
    if (staticGrid && bodyTouch(g.x, g.y, staticGrid)) continue;
    var k = g.x + g.y * 25;
    if (dist[k] < 0) { dist[k] = 0; frontier.push(g); }
  }
  while (frontier.length) {
    var nxt = [];
    for (var i = 0; i < frontier.length; i++) {
      var v = frontier[i];
      var dv = dist[v.x + v.y * 25];
      for (var d = 0; d < 4; d++) {
        var wx = v.x - DV[d][0], wy = v.y - DV[d][1];
        if (!bodyFits(wx, wy)) continue;
        var wk = wx + wy * 25;
        if (dist[wk] >= 0) continue;
        if (!bodyPass(map, wx, wy)) continue;
        if (staticGrid && bodyTouch(wx, wy, staticGrid)) continue;
        dist[wk] = dv + 1;
        nxt.push({ x: wx, y: wy });
      }
    }
    frontier = nxt;
  }
  return dist;
}

function stepToward(dist, x, y, map, staticGrid, pen) {
  var cur = dist[x + y * 25];
  var bestD = -1;
  var bestS = cur >= 0 ? cur * 16 + 8 : 1e9;
  for (var d = 0; d < 4; d++) {
    var nx = x + DV[d][0], ny = y + DV[d][1];
    if (!bodyFits(nx, ny) || !bodyPass(map, nx, ny)) continue;
    if (staticGrid && bodyTouch(nx, ny, staticGrid)) continue;
    var dd = dist[nx + ny * 25];
    if (dd < 0) continue;
    var s = dd * 16 + (pen ? (pen[nx + ny * 25] || 0) : 0);
    if (s < bestS) { bestS = s; bestD = d; }
  }
  return bestD;
}

function updateSeen(state) {
  var t = state.tick;
  var list = (state.radar && state.radar.tanks) || [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    M.seen[e.id] = {
      x: e.x, y: e.y, d: e.dir, tick: t,
      hp: e.hp, mh: e.maxHp, inv: e.invincibleTicks, hurt: e.hurtTicks, rapid: e.rapidTicks
    };
  }
}

function splitBullets(state) {
  var t = state.tick;
  var bullets = (state.radar && state.radar.bullets) || [];
  var fresh = [];
  for (var i = 0; i < M.fired.length; i++) if (t - M.fired[i].tick <= 14) fresh.push(M.fired[i]);
  M.fired = fresh;
  var used = new Array(bullets.length).fill(false);
  var matched = 0;
  for (var i = 0; i < M.fired.length; i++) {
    var f = M.fired[i];
    var age = t - f.tick;
    var dv = DV[f.d];
    for (var j = 0; j < bullets.length; j++) {
      if (used[j]) continue;
      var b = bullets[j];
      if (b.dir !== f.d) continue;
      var along = (b.x - f.x) * dv[0] + (b.y - f.y) * dv[1];
      var cross = Math.abs((b.x - f.x) * dv[1] - (b.y - f.y) * dv[0]);
      if (cross === 0 && along === 3 * age) { used[j] = true; matched++; break; }
    }
  }
  var inFlight = matched;
  for (var i = 0; i < M.fired.length; i++) if (t - M.fired[i].tick <= 1) inFlight++;
  var threats = [];
  for (var j = 0; j < bullets.length; j++) if (!used[j]) threats.push(bullets[j]);
  return { inFlight: inFlight, threats: threats };
}

function buildThreats(map, bullets) {
  var out = [];
  for (var i = 0; i < bullets.length; i++) {
    var b = bullets[i];
    var lane = laneFor(map, b.x, b.y, b.dir, LANE_T);
    if (lane.cells.length <= 1) continue;
    out.push({ lane: lane, forb: laneForb(lane, LANE_T) });
  }
  return out;
}

function buildStatic(state) {
  var g = new Uint8Array(GRID * GRID);
  var mark = function (x, y) {
    if (!bodyFits(x, y)) return;
    for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++)
      g[(y + dy) * GRID + (x + dx)] = 1;
  };
  var list = (state.radar && state.radar.tanks) || [];
  for (var i = 0; i < list.length; i++) mark(list[i].x, list[i].y);
  var t = state.tick;
  for (var id in M.seen) {
    var s = M.seen[id];
    if (t - s.tick > 4) continue;
    var visible = false;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { visible = true; break; }
    if (!visible) mark(s.x, s.y);
  }
  return g;
}

function findShot(state, map, sx, sy, staticAim, aggr) {
  var res = { d: -1, id: null, grade: -1 };
  var t = state.tick;
  var list = (state.radar && state.radar.tanks) || [];
  if (!list.length) return res;
  var myTotal = state.self.hp + 2 * (state.self.lives - 1);
  var cands = list.slice().sort(function (a, b) {
    var va = (2 - a.hp) * 100 - cheb(a.x, a.y, sx, sy) - (a.rapidTicks > 0 ? 10 : 0);
    var vb = (2 - b.hp) * 100 - cheb(b.x, b.y, sx, sy) - (b.rapidTicks > 0 ? 10 : 0);
    return vb - va;
  }).slice(0, 2);
  for (var ci = 0; ci < cands.length; ci++) {
    var e = cands[ci];
    if (e.invincibleTicks > 0) continue;
    if (e.hurtTicks >= 2) continue;
    var tgtLives = 3;
    for (var i = 0; i < (state.scoreboard || []).length; i++) {
      if (state.scoreboard[i].id === e.id) tgtLives = state.scoreboard[i].lives;
    }
    var healthOk = aggr || myTotal >= e.hp + 2 * Math.max(0, tgtLives - 1) || state.self.rapidTicks > 20;
    var inRhythm = (t - (M.shotTick[e.id] || -99) <= 3) ||
      list.some(function (o) { return o.id !== e.id && cheb(o.x, o.y, e.x, e.y) <= 7; });
    for (var d = 0; d < 4; d++) {
      var mz = muzzleOf(sx, sy, d);
      if (mz.x < 0 || mz.y < 0 || mz.x >= GRID || mz.y >= GRID) continue;
      var lane = laneFor(map, mz.x, mz.y, d, AIM_T);
      if (lane.cells.length < 3) continue;
      var hitIdx = -1;
      for (var i = 1; i < lane.cells.length; i++) {
        var c = lane.cells[i];
        if ((c.x === e.x || c.x === e.x + 1) && (c.y === e.y || c.y === e.y + 1)) { hitIdx = i; break; }
      }
      if (hitIdx < 0) continue;
      var H = Math.max(1, Math.ceil((lane.cells.length - 1) / 3));
      var forb = laneForb(lane, H);
      var r = solveEvade(e.x, e.y, H, forb, staticAim, map);
      var hp1 = e.hp <= 1;
      var backshot = e.dir !== (d + 2) % 4;
      if (!r.alive) {
        var grade = hp1 ? 3 : 2;
        if (grade > res.grade) { res.grade = grade; res.d = d; res.id = e.id; }
      } else if (hp1 && r.surv <= 2 && hitIdx <= 9) {
        if (res.grade < 1) { res.grade = 1; res.d = d; res.id = e.id; }
      } else if (healthOk && hitIdx <= 9 && (inRhythm || backshot || hitIdx <= 7 || aggr || e.hurtTicks === 1 || state.self.rapidTicks > 30)) {
        if (res.grade < 1) { res.grade = 1; res.d = d; res.id = e.id; }
      }
    }
    if (res.grade >= 3) break;
  }
  return res;
}

function findIntercept(state, map, sx, sy, threats) {
  var d = state.self.dir;
  var mz = muzzleOf(sx, sy, d);
  if (mz.x < 0 || mz.y < 0 || mz.x >= GRID || mz.y >= GRID) return false;
  var mine = laneForb(laneFor(map, mz.x, mz.y, d, 2), 2);
  for (var i = 0; i < threats.length; i++) {
    var tf = threats[i].forb;
    for (var tau = 0; tau <= 2; tau++) {
      var arr = tf[Math.min(tau, tf.length - 1)];
      for (var a = 0; a < arr.length; a++) {
        for (var u = 0; u <= 2; u++) {
          var ma = mine[u];
          for (var b = 0; b < ma.length; b++) {
            if (ma[b].x === arr[a].x && ma[b].y === arr[a].y) return true;
          }
        }
      }
    }
  }
  return false;
}

function supplyPlan(state, map, sx, sy, staticGrid) {
  var box = state.arena && state.arena.supply;
  var info = { want: 0, dist: null, eta: 1e9 };
  if (!box) return info;
  var t = state.tick;
  var self = state.self;
  if (t + 2 > box.expireTick) return info;
  var needRepair = self.hp < self.maxHp;
  if (box.type === 'repair' && !needRepair) return info;
  var goals = [];
  for (var dy = -1; dy <= 0; dy++) for (var dx = -1; dx <= 0; dx++) {
    var gx = box.x + dx, gy = box.y + dy;
    if (bodyFits(gx, gy)) goals.push({ x: gx, y: gy });
  }
  if (!goals.length) return info;
  var dist = distField(goals, map, staticGrid);
  var eta = dist[sx + sy * 25];
  if (eta < 0 || eta + 2 > box.expireTick - t) return info;
  var rival = 1e9;
  var list = (state.radar && state.radar.tanks) || [];
  for (var i = 0; i < list.length; i++) {
    var d = Math.abs(list[i].x - box.x) + Math.abs(list[i].y - box.y);
    if (d < rival) rival = d;
  }
  for (var id in M.seen) {
    var s = M.seen[id];
    if (t - s.tick > 10) continue;
    var d = Math.abs(s.x - box.x) + Math.abs(s.y - box.y);
    if (d < rival) rival = d;
  }
  var want = 0;
  if (box.type === 'repair' && needRepair) want = 60 + (self.hp === 1 ? 40 : 0);
  else if (box.type === 'rapid' && self.rapidTicks <= 40) want = 50;
  if (rival <= eta + 2) {
    if (eta + 2 < rival) want = Math.min(want, 40);
    else if (box.type === 'repair' && self.hp === 1 && eta < rival + 4) want = 45;
    else want = 0;
  }
  if (eta > 12) want -= (eta - 12) * 3;
  info.want = want; info.dist = dist; info.eta = eta;
  return info;
}

function laneClear(map, x0, y0, dx, dy, len) {
  var cx = x0, cy = y0;
  for (var i = 0; i < len; i++) {
    cx += dx; cy += dy;
    if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return true;
    var t = map[cy][cx];
    if (t === 2 || t === 1) return true;
  }
  return false;
}

function pickAnchor(state, map, zone, sx, sy, staticGrid, pulse) {
  var t = state.tick;
  var exList = [];
  var list = (state.radar && state.radar.tanks) || [];
  for (var i = 0; i < list.length; i++) exList.push({ x: list[i].x, y: list[i].y });
  for (var id in M.seen) {
    var s = M.seen[id];
    if (t - s.tick <= 20) exList.push({ x: s.x, y: s.y });
  }
  var box = state.arena && state.arena.supply;
  var cx = (zone.min + zone.max) / 2, cy = (zone.min + zone.max) / 2;
  var best = null, bestS = -1e9;
  var yMin = Math.max(zone.min, sy - 6);
  var yMax = Math.min(zone.max - 1, sy + 6);
  var xMin = Math.max(zone.min, sx - 6);
  var xMax = Math.min(zone.max - 1, sx + 6);
  var budget = 0;
  for (var y = yMin; y <= yMax; y++) for (var x = xMin; x <= xMax; x++) {
    if (++budget > 80) break;
    if (!bodyPass(map, x, y)) continue;
    if (staticGrid && bodyTouch(x, y, staticGrid) && !(x === sx && y === sy)) continue;
    var s = 0;
    var edge = Math.min(x - zone.min, zone.max - (x + 1), y - zone.min, zone.max - (y + 1));
    s += edge * 5;
    s -= (Math.abs(x + 0.5 - cx) + Math.abs(y + 0.5 - cy)) * 1.5;
    var exits = 0;
    for (var d = 0; d < 4; d++) {
      var nx = x + DV[d][0], ny = y + DV[d][1];
      if (bodyFits(nx, ny) && bodyPass(map, nx, ny) && !(staticGrid && bodyTouch(nx, ny, staticGrid))) exits++;
    }
    if (exits >= 3) s += 10; else if (exits === 2) s += 2; else s -= 25;
    var cover = 0;
    for (var i = 0; i < exList.length; i++) {
      var e = exList[i];
      var ddx = e.x - x, ddy = e.y - y;
      if (ddx === 0 && ddy === 0) { s -= 40; continue; }
      if (ddx === 0 || ddy === 0) {
        var len = Math.abs(ddx) + Math.abs(ddy);
        if (len <= 14) {
          if (laneClear(map, x, y, Math.sign(ddx), Math.sign(ddy), len)) cover += 8;
          else s -= 14;
        }
      } else cover += 3;
    }
    s += Math.min(cover, 30);
    if (!pulse) {
      var grass = false;
      for (var dy = 0; dy < 2 && !grass; dy++) for (var dx = 0; dx < 2; dx++) {
        var gx = x + dx, gy = y + dy;
        if (gx < GRID && gy < GRID && map[gy][gx] === 4) { grass = true; break; }
      }
      if (grass) s += 12;
    }
    if (box) {
      var bd = Math.abs(x - box.x) + Math.abs(y - box.y);
      var crowd = 0, myD = Math.abs(sx - box.x) + Math.abs(sy - box.y), rivalD = 1e9;
      var elist = (state.radar && state.radar.tanks) || [];
      for (var i = 0; i < elist.length; i++) {
        var ed = Math.abs(elist[i].x - box.x) + Math.abs(elist[i].y - box.y);
        if (ed <= 6) crowd++;
        if (ed < rivalD) rivalD = ed;
      }
      for (var id2 in M.seen) {
        var g = M.seen[id2];
        if (t - g.tick > 10) continue;
        var ed2 = Math.abs(g.x - box.x) + Math.abs(g.y - box.y);
        if (ed2 <= 6) crowd++;
        if (ed2 < rivalD) rivalD = ed2;
      }
      var needIt = box.type === 'repair' ? state.self.hp < state.self.maxHp : rivalD >= myD;
      if (bd <= 8 && needIt && crowd <= 1) s += (8 - bd) * 2;
      if (bd <= 6 && crowd >= 2) s -= 14;
    }
    s += mix32(((state.random | 0) ^ (x * 7 + y * 131)) >>> 0) % 5;
    if (s > bestS) { bestS = s; best = { x: x, y: y }; }
  }
  return best;
}

function leadScore(state) {
  var sb = state.scoreboard || [];
  var mine = null;
  for (var i = 0; i < sb.length; i++) if (sb[i].id === state.self.id) mine = sb[i];
  if (!mine) return 0;
  var worse = 0, alive = 0;
  for (var i = 0; i < sb.length; i++) {
    var r = sb[i];
    if (r.id === mine.id || r.lives <= 0) continue;
    alive++;
    if (r.points > mine.points) worse++;
  }
  return alive ? (worse / alive) * 2 - 1 : 0;
}

function think(state) {
  var t = state.tick;
  if (!M || t < M.last) M = freshMem();
  M.last = t;
  var self = state.self;
  var map = state.map;
  if (self.lives < M.lives) {
    M.fired.length = 0; M.plan = -1; M.stuck = 0;
    M.tgt = null; M.anchor = null; M.anchorTick = -99;
    M.retreatUntil = -1; M.lastFireTick = -99; M.prevHp = self.hp;
  }
  M.lives = self.lives;
  if (self.hp < M.prevHp) M.retreatUntil = t + 8;
  if (self.hp > M.prevHp) M.retreatUntil = -1;
  M.prevHp = self.hp;
  var retreating = self.hp === 1 || t < M.retreatUntil;

  var sx = self.x, sy = self.y;
  var zoneNow = zoneAt(t);
  var az = state.arena && state.arena.safeZone;
  var nextShrink;
  if (az && az.nextShrinkTick !== null && az.nextShrinkTick !== undefined) nextShrink = az.nextShrinkTick;
  else if (marginAt(t) >= ZONE_MAX) nextShrink = null;
  else nextShrink = t < ZONE_SHRINK ? ZONE_SHRINK : ZONE_SHRINK + (Math.floor((t - ZONE_SHRINK) / ZONE_STEP) + 1) * ZONE_STEP;
  var zoneNext = zoneNow;
  if (nextShrink !== null && nextShrink <= 599) {
    var m2 = marginAt(Math.min(599, nextShrink));
    zoneNext = { min: m2, max: 25 - m2 };
  }
  var shrinkIn = nextShrink !== null ? nextShrink - t : 999;
  var zonePlan = shrinkIn <= 12 ? zoneNext : zoneNow;
  var pulse = !!(state.arena && state.arena.radarPulse);
  var inNow = inZone(sx, sy, zoneNow);
  var inPlan = inZone(sx, sy, zonePlan);

  updateSeen(state);
  var bm = splitBullets(state);
  var vlist = (state.radar && state.radar.tanks) || [];
  for (var bi = 0; bi < bm.threats.length; bi++) {
    var b = bm.threats[bi];
    for (var i = 0; i < vlist.length; i++) {
      var e = vlist[i];
      if (e.dir !== b.dir) continue;
      var dv = DV[e.dir];
      var along = (b.x - e.x) * dv[0] + (b.y - e.y) * dv[1];
      var cross = Math.abs((b.x - e.x) * dv[1] - (b.y - e.y) * dv[0]);
      if (cross <= 2 && along >= 1 && along <= 10) M.shotTick[e.id] = t;
    }
  }
  var threats = buildThreats(map, bm.threats);
  var staticGrid = buildStatic(state);

  var canFire = self.fireCooldown === 0 && bm.inFlight < 2;
  var meHurt = self.hurtTicks >= 2;
  var meInv = self.invincibleTicks > 0;

  if (sx === M.lx && sy === M.ly) M.stuck++; else M.stuck = 0;
  M.lx = sx; M.ly = sy;

  var danger1 = [], danger2 = [];
  for (var i = 0; i < threats.length; i++) {
    var f = threats[i].forb;
    var a1 = f[1], a2 = f[Math.min(2, f.length - 1)];
    for (var k = 0; k < a1.length; k++) danger1.push(a1[k]);
    for (var k = 0; k < a2.length; k++) danger2.push(a2[k]);
  }
  var g1 = listToGrid(danger1);
  var touchD1 = function (x, y) { return bodyTouch(x, y, g1); };

  var moveD = -1;
  var intent = 'hold';
  var fire = false;
  var dodging = false;

  // 弹道生存求解（含炮口威胁）
  var evadeReach = null;
  var gunThreats = [];
  var nearestNd = 1e9, nearestE = null;
  for (var gi = 0; gi < vlist.length; gi++) {
    var nd = cheb(vlist[gi].x, vlist[gi].y, sx, sy);
    if (nd < nearestNd) { nearestNd = nd; nearestE = vlist[gi]; }
  }
  if (nearestE && nearestE.invincibleTicks <= 0 && nearestNd <= 8) {
    var gm = muzzleOf(nearestE.x, nearestE.y, nearestE.dir);
    var glane = laneFor(map, gm.x, gm.y, nearestE.dir, 3);
    if (glane.cells.length >= 3) {
      gunThreats.push({ forb: laneForb(glane, 3) });
    }
  }
  if ((threats.length || gunThreats.length) && !meHurt && !meInv) {
    var forbs = [];
    for (var tau = 0; tau <= DODGE_H; tau++) {
      var arr = [];
      for (var i = 0; i < threats.length; i++) {
        var f = threats[i].forb;
        var src = f[Math.min(tau, f.length - 1)];
        for (var k = 0; k < src.length; k++) arr.push(src[k]);
      }
      for (var gi2 = 0; gi2 < gunThreats.length; gi2++) {
        var gf = gunThreats[gi2].forb;
        var gsrc = gf[Math.min(tau, gf.length - 1)];
        for (var k2 = 0; k2 < gsrc.length; k2++) arr.push(gsrc[k2]);
      }
      forbs.push(arr);
    }
    var r = solveEvade(sx, sy, DODGE_H, forbs, staticGrid, map);
    evadeReach = r.reach;
    if (!r.alive && canFire && findIntercept(state, map, sx, sy, threats)) {
      fire = true;
      M.lastFireTick = t;
      var mz = muzzleOf(sx, sy, self.dir);
      M.fired.push({ tick: t, x: mz.x, y: mz.y, d: self.dir });
    }
  }

  // 危险区处理
  if (!dodging) {
    if (!inNow) {
      var goals = [];
      for (var y = zoneNow.min; y <= zoneNow.max - 1; y++) for (var x = zoneNow.min; x <= zoneNow.max - 1; x++) {
        if (bodyPass(map, x, y)) goals.push({ x: x, y: y });
      }
      if (goals.length) {
        var dist = distField(goals, map, staticGrid);
        var pen = new Int16Array(GRID * GRID);
        for (var i = 0; i < danger1.length; i++) { var c = danger1[i]; pen[c.y * GRID + c.x] += 90; }
        for (var i = 0; i < danger2.length; i++) { var c = danger2[i]; pen[c.y * GRID + c.x] += 40; }
        var d = stepToward(dist, sx, sy, map, staticGrid, pen);
        if (d >= 0) { moveD = d; intent = 'retreat'; }
      }
    } else if (!inPlan) {
      var goals2 = [];
      for (var y = zonePlan.min; y <= zonePlan.max - 1; y++) for (var x = zonePlan.min; x <= zonePlan.max - 1; x++) {
        if (bodyPass(map, x, y)) goals2.push({ x: x, y: y });
      }
      if (goals2.length) {
        var dist2 = distField(goals2, map, staticGrid);
        var pen2 = new Int16Array(GRID * GRID);
        for (var i = 0; i < danger1.length; i++) { var c = danger1[i]; pen2[c.y * GRID + c.x] += 90; }
        for (var i = 0; i < danger2.length; i++) { var c = danger2[i]; pen2[c.y * GRID + c.x] += 40; }
        var d2 = stepToward(dist2, sx, sy, map, staticGrid, pen2);
        if (d2 >= 0) { moveD = d2; intent = shrinkIn <= 6 ? 'retreat' : 'advance'; }
      }
    }
  }

  // 瞄准与开火
  var aggr = t >= 450 && leadScore(state) >= 0 && self.hp >= 2;
  var shot = canFire ? findShot(state, map, sx, sy, staticGrid, aggr) : { d: -1, id: null, grade: -1 };
  var weakKill = false;
  if (shot.id) {
    for (var i = 0; i < vlist.length; i++) if (vlist[i].id === shot.id) {
      var lv = 3;
      for (var j = 0; j < (state.scoreboard || []).length; j++) if (state.scoreboard[j].id === shot.id) lv = state.scoreboard[j].lives;
      weakKill = vlist[i].hp <= 1 || lv === 1;
    }
  }
  var wantGrade = retreating && !weakKill ? 3 : 1;
  if (shot.grade >= wantGrade) {
    var pointBlankKill = shot.grade === 3;
    var fireNow = shot.d === self.dir && (!meInv || pointBlankKill);
    if (fireNow && (!dodging || pointBlankKill)) {
      fire = true;
      M.lastFireTick = t;
      var mz = muzzleOf(sx, sy, self.dir);
      M.fired.push({ tick: t, x: mz.x, y: mz.y, d: self.dir });
      M.tgt = shot.id; M.tgtTick = t;
      intent = 'pursue';
    } else if (!dodging && canFire) {
      var nx = sx + DV[shot.d][0], ny = sy + DV[shot.d][1];
      var displaces = bodyFits(nx, ny) && bodyPass(map, nx, ny) && !(staticGrid && bodyTouch(nx, ny, staticGrid));
      var safe = !displaces || (inZone(nx, ny, zonePlan) && !touchD1(nx, ny));
      if (safe) { moveD = shot.d; intent = 'flank'; }
    }
  }

  // 补给
  if (!dodging && moveD === -1 && inNow) {
    var foeNear = false;
    var foeGate = self.hp === 1 ? 3 : 5;
    for (var i = 0; i < vlist.length; i++) if (cheb(vlist[i].x, vlist[i].y, sx, sy) <= foeGate) { foeNear = true; break; }
    if (!foeNear) {
      var sp = supplyPlan(state, map, sx, sy, staticGrid);
      if (sp.want > 0 && sp.dist) {
        var d = stepToward(sp.dist, sx, sy, map, staticGrid, null);
        if (d >= 0) { moveD = d; intent = 'resupply'; }
      }
    }
  }

  // 交战走位/追击/锚点
  if (!dodging && moveD === -1) {
    var tgt = null;
    if (vlist.length) {
      var bestV = -1e9;
      for (var i = 0; i < vlist.length; i++) {
        var e = vlist[i];
        var v = (2 - e.hp) * 30 - cheb(e.x, e.y, sx, sy) * 2 - (e.rapidTicks > 0 ? 15 : 0);
        if (e.id === M.tgt && t - M.tgtTick <= 20) v += 12;
        if (t - (M.shotTick[e.id] || -99) <= 3) v += 8;
        if (v > bestV) { bestV = v; tgt = e; }
      }
    }
    if (tgt) {
      var myLead = leadScore(state);
      var weak = tgt.hp <= 1;
      var myTotal = self.hp + 2 * (self.lives - 1);
      var tgtLives = 3;
      for (var i = 0; i < (state.scoreboard || []).length; i++) {
        if (state.scoreboard[i].id === tgt.id) tgtLives = state.scoreboard[i].lives;
      }
      var tgtTotal = tgt.hp + 2 * Math.max(0, tgtLives - 1);
      var healthOk = myTotal >= tgtTotal;
      var band = retreating ? 10 : self.hp === 1 ? 9 : (healthOk ? 7 : 9);
      if (!healthOk) band = Math.max(band, 9);
      if (t >= 450 && self.hp === 2) band = myLead > 0 ? 4 : 9;
      var avoidMode = (retreating || self.hp === 1);
      if (self.rapidTicks > 30 && healthOk && !avoidMode) band = Math.min(band, 4);
      var charging = (meHurt || self.hurtTicks === 1) && healthOk && vlist.filter(function (o) { return cheb(o.x, o.y, sx, sy) <= 6; }).length <= 1;
      if (charging) { band = 2; avoidMode = false; }
      var distT = cheb(tgt.x, tgt.y, sx, sy);
      var displace = t - M.lastFireTick <= 3;
      var cornerPenalty = function (qx, qy) {
        var edge = Math.min(qx, qy, 24 - qx, 24 - qy);
        return edge <= 1 ? -12 : 0;
      };
      var openArea = function (qx, qy) {
        var seen = new Uint8Array(GRID * GRID);
        var cnt = 0;
        var q = [[qx, qy]];
        seen[qy * GRID + qx] = 1;
        while (q.length && cnt < 12) {
          var c = q.pop();
          cnt++;
          for (var d = 0; d < 4; d++) {
            var nx = c[0] + DV[d][0], ny = c[1] + DV[d][1];
            if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || seen[ny * GRID + nx]) continue;
            if (map[ny][nx] !== 0 && map[ny][nx] !== 4) continue;
            seen[ny * GRID + nx] = 1;
            q.push([nx, ny]);
          }
        }
        return cnt;
      };
      var lanePenalty = function (qx, qy) {
        var p = 0;
        for (var i = 0; i < vlist.length; i++) {
          var o = vlist[i];
          var ddx = qx - o.x, ddy = qy - o.y;
          if (ddx !== 0 && ddy !== 0) continue;
          var len = Math.abs(ddx) + Math.abs(ddy);
          if (len === 0 || len > 8) continue;
          if (!laneClear(map, o.x, o.y, Math.sign(ddx), Math.sign(ddy), len)) continue;
          p -= (o.id === tgt.id ? 5 : 9) * (9 - len);
        }
        return p;
      };
      var bestD = -1;
      var bestS = -Math.abs(distT - band) * 8 + lanePenalty(sx, sy);
      for (var d = 0; d < 4; d++) {
        var nx = sx + DV[d][0], ny = sy + DV[d][1];
        if (!bodyFits(nx, ny) || !bodyPass(map, nx, ny)) continue;
        if (staticGrid && bodyTouch(nx, ny, staticGrid)) continue;
        if (!inZone(nx, ny, zonePlan)) continue;
        if (touchD1(nx, ny)) continue;
        var s = 1;
        var nd = cheb(tgt.x, tgt.y, nx, ny);
        s -= Math.abs(nd - band) * 8;
        var crossNow = Math.min(Math.abs(tgt.x - sx), Math.abs(tgt.y - sy));
        var crossNew = Math.min(Math.abs(tgt.x - nx), Math.abs(tgt.y - ny));
        if (avoidMode) s += (crossNew - crossNow) * 8;
        else {
          s += (crossNow - crossNew) * 6;
          var colAligned = nx === tgt.x || nx === tgt.x + 1;
          var rowAligned = ny === tgt.y || ny === tgt.y + 1;
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
          var ddx = tgt.x - nx, ddy = tgt.y - ny;
          if (ddx !== 0 && ddy !== 0) s += 4;
          else {
            var len = Math.abs(ddx) + Math.abs(ddy);
            if (len > 0 && laneClear(map, nx, ny, Math.sign(ddx), Math.sign(ddy), len)) s += 10;
          }
          var grass = false;
          for (var gy = ny; gy < ny + 2 && !grass; gy++) for (var gx = nx; gx < nx + 2; gx++) {
            if (gx < GRID && gy < GRID && map[gy][gx] === 4) { grass = true; break; }
          }
          if (grass) s += 14;
        }
        if (s > bestS) { bestS = s; bestD = d; }
      }
      if (bestD >= 0) { moveD = bestD; intent = band <= 4 ? 'pursue' : 'flank'; }
      if (distT <= band + 1 && distT >= band - 1 && bestD === -1) intent = retreating ? 'retreat' : 'hold';
      M.tgt = tgt.id; M.tgtTick = t;
    } else {
      // 无可见目标时的处理
      var ghost = null;
      if (self.hp === 2 && M.tgt && M.seen[M.tgt] && t - M.seen[M.tgt].tick <= 4) ghost = M.seen[M.tgt];
      if (ghost && cheb(ghost.x, ghost.y, sx, sy) <= 8) {
        var dist = distField([{ x: ghost.x, y: ghost.y }], map, staticGrid);
        var d = dist[sx + sy * 25] >= 0 ? stepToward(dist, sx, sy, map, staticGrid, null) : -1;
        if (d >= 0) { moveD = d; intent = 'pursue'; }
      }
      if (moveD === -1) {
        if (!M.anchor || t - M.anchorTick > ANCHOR_EVERY || !inZone(M.anchor.x, M.anchor.y, zonePlan)) {
          M.anchor = pickAnchor(state, map, zonePlan, sx, sy, staticGrid, pulse);
          M.anchorTick = t;
        }
        if (M.anchor) {
          if (M.anchor.x === sx && M.anchor.y === sy) intent = 'hold';
          else {
            var dist = distField([M.anchor], map, staticGrid);
            if (dist[sx + sy * 25] < 0) { M.anchor = null; }
            else {
              var d = stepToward(dist, sx, sy, map, staticGrid, null);
              if (d >= 0) { moveD = d; intent = 'advance'; }
            }
          }
        }
      }
    }
  }

  // 卡住解锁
  if (M.stuck >= STUCK_L && moveD === M.plan) {
    for (var k = 0; k < 4; k++) {
      var d = (t + k) % 4;
      var nx = sx + DV[d][0], ny = sy + DV[d][1];
      if (bodyFits(nx, ny) && bodyPass(map, nx, ny) && !(staticGrid && bodyTouch(nx, ny, staticGrid)) && !touchD1(nx, ny)) { moveD = d; break; }
    }
    M.stuck = 0;
  }

  // 弹道绑定
  if (evadeReach !== null) {
    var chosen = String(moveD);
    var reached = evadeReach[chosen] || 0;
    if (reached < DODGE_H) {
      var bd = null, bs = -1;
      for (var kd = -1; kd < 4; kd++) {
        var rv = evadeReach[String(kd)] || 0;
        if (rv === 0) continue;
        var sv = rv * 10 + (kd === M.plan ? 1 : 0);
        if (sv > bs) { bs = sv; bd = kd; }
      }
      if (bd === null) {
        for (var kd = -1; kd < 4; kd++) {
          var rv = evadeReach[String(kd)] || 0;
          if (rv > bs) { bs = rv; bd = kd; }
        }
      }
      if (bd !== null) { moveD = bd; dodging = true; intent = 'defend'; }
    }
  }
  if (moveD >= 0) {
    var nx = sx + DV[moveD][0], ny = sy + DV[moveD][1];
    var legal = bodyFits(nx, ny) && bodyPass(map, nx, ny) && !(staticGrid && bodyTouch(nx, ny, staticGrid));
    if (!legal || (!dodging && touchD1(nx, ny))) moveD = -1;
  }
  M.plan = moveD;
  if (moveD >= 0 && intent === 'hold') intent = 'advance';
  return { move: moveD >= 0 ? DN[moveD] : 'stay', fire: !!fire, intent: intent };
}

function decide(state) {
  try { return think(state); } catch (e) { return { move: 'stay', fire: false, intent: 'hold' }; }
}
