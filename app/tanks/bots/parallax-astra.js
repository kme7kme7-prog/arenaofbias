// Parallax: offset firing posts with a short, collision-aware escape horizon.
var PX = [0, 1, 0, -1], PY = [-1, 0, 1, 0];
var PM = ['up', 'right', 'down', 'left', 'stay'];
var memory = null;

function inside(x, y, min) {
  return x >= min && y >= min && x <= 24 - min && y <= 24 - min;
}
function margin(tick) {
  return tick < 200 ? 0 : Math.min(9, 2 + Math.floor((tick - 200) / 50));
}
function covers(t, x, y) {
  return x >= t.x && x <= t.x + 1 && y >= t.y && y <= t.y + 1;
}
function overlaps(a, b) {
  return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
}
function muzzle(t, dir) {
  return {x: t.x + (dir === 1 ? 2 : dir === 3 ? -1 : 0),
    y: t.y + (dir === 2 ? 2 : dir === 0 ? -1 : 0)};
}
function passable(map, x, y) {
  if (x < 0 || y < 0 || x > 24 || y > 24) return false;
  for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
    var v = map[y + dy][x + dx];
    if (v !== 0 && v !== 4) return false;
  }
  return true;
}
function beam(map, a, dir, b, limit) {
  var p = muzzle(a, dir);
  for (var n = 0; n <= limit; n++) {
    if (p.x < 0 || p.x > 25 || p.y < 0 || p.y > 25) return -1;
    var tile = map[p.y][p.x];
    if (tile === 1 || tile === 2) return -1;
    if (covers(b, p.x, p.y)) return n;
    p.x += PX[dir]; p.y += PY[dir];
  }
  return -1;
}
function lineDir(a, b) {
  if (a.x >= b.x && a.x <= b.x + 1) {
    if (a.y > b.y + 1) return 0;
    if (a.y + 1 < b.y) return 2;
  }
  if (a.y >= b.y && a.y <= b.y + 1) {
    if (a.x > b.x + 1) return 3;
    if (a.x + 1 < b.x) return 1;
  }
  return -1;
}
function walkPrediction(map, e, dx, dy, count) {
  var p = {x: e.x, y: e.y};
  for (var i = 0; i < count; i++) {
    if (!passable(map, p.x + dx, p.y + dy)) break;
    p.x += dx; p.y += dy;
  }
  return p;
}
function updateMemory(s) {
  var me = s.self, tick = s.tick;
  if (!memory || tick <= memory.tick) memory = {
    tick: -1, lives: me.lives, foes: {}, own: [], last: null,
    target: '', goal: null, visits: new Int16Array(625), blocked: null, patrol: 0
  };
  var m = memory, consecutive = tick === m.tick + 1 && me.lives === m.lives;
  if (!consecutive) {
    m.own = []; m.last = null; m.blocked = null; m.goal = null;
    for (var id in m.foes) { m.foes[id].vx = 0; m.foes[id].vy = 0; }
  }
  if (m.last && consecutive) {
    if ((m.last.x !== me.x || m.last.y !== me.y) && m.last.moved) {
      m.blocked = {x: m.last.x, y: m.last.y, until: tick + 3};
    }
    var fired = m.last.fire && m.last.cooldown === 0 && me.fireCooldown > 0;
    if (!fired) m.own = m.own.filter(b => b.born !== tick - 1);
  }
  m.own = m.own.filter(b => tick - b.born <= 9 && s.radar.bullets.some(
    r => r.x === b.x && r.y === b.y && r.dir === b.dir));
  for (var e of s.radar.tanks) {
    var old = m.foes[e.id], adjacent = old && old.tick === tick - 1;
    var vx = adjacent ? e.x - old.x : 0, vy = adjacent ? e.y - old.y : 0;
    if (Math.abs(vx) + Math.abs(vy) > 1) { vx = 0; vy = 0; }
    var streak = adjacent && old.vx === vx && old.vy === vy ? Math.min(6, old.streak + 1) : 1;
    var shot = old ? old.shot : -20;
    if (adjacent) {
      var gun = muzzle(old, old.dir);
      if (s.radar.bullets.some(b => b.dir === old.dir &&
        b.x === gun.x + PX[old.dir] * 3 && b.y === gun.y + PY[old.dir] * 3)) shot = tick - 1;
    }
    m.foes[e.id] = {id: e.id, x: e.x, y: e.y, dir: e.dir, hp: e.hp,
      invincibleTicks: e.invincibleTicks, hurtTicks: e.hurtTicks, rapidTicks: e.rapidTicks,
      tick: tick, vx: vx, vy: vy, streak: streak, shot: shot};
  }
  for (var op of s.opponents) if (op.status !== 'active' || op.respawnTicks > 0) delete m.foes[op.id];
  for (var key in m.foes) if (tick - m.foes[key].tick > 18) delete m.foes[key];
  m.visits[me.y * 25 + me.x] = tick + 1;
  return m;
}

// Enemy bodies are not assumed to absorb shells: their movement is uncertain.
function forecast(s, fire) {
  var tick = s.tick, map = s.map.map(row => row.slice()), list = [];
  for (var b of s.radar.bullets) {
    var own = memory.own.find(q => q.x === b.x && q.y === b.y && q.dir === b.dir);
    list.push({x: b.x, y: b.y, dir: b.dir, born: own ? own.born : -100, alive: true, fresh: false});
  }
  if (fire) {
    var p = muzzle(s.self, s.self.dir);
    list.push({x: p.x, y: p.y, dir: s.self.dir, born: tick, alive: true, fresh: true});
  }
  var layers = [[], [], []], shotPath = [], nextOwn = [];
  function settle(b, phase) {
    if (b.x < 0 || b.x > 25 || b.y < 0 || b.y > 25) { b.alive = false; return; }
    var tile = map[b.y][b.x];
    if (tile === 1 || tile === 2) {
      if (tile === 1) map[b.y][b.x] = 0;
      b.alive = false; return;
    }
    if (tick + phase - b.born >= 3) layers[phase].push({x: b.x, y: b.y});
    if (b.fresh) shotPath.push({x: b.x, y: b.y, phase: phase});
  }
  for (var phase = 0; phase < 3; phase++) {
    for (var i = 0; i < list.length; i++) {
      var b = list[i]; if (!b.alive) continue;
      for (var j = i + 1; j < list.length; j++) {
        var other = list[j];
        if (other.alive && b.x === other.x && b.y === other.y) b.alive = other.alive = false;
      }
      if (b.alive) settle(b, phase);
    }
    for (var step = 0; step < 3; step++) {
      var moving = list.filter(b => b.alive);
      for (var i = 0; i < moving.length; i++) for (var j = i + 1; j < moving.length; j++) {
        var a = moving[i], b = moving[j], ax = a.x + PX[a.dir], ay = a.y + PY[a.dir];
        var bx = b.x + PX[b.dir], by = b.y + PY[b.dir];
        if ((ax === bx && ay === by) || (ax === b.x && ay === b.y && bx === a.x && by === a.y))
          a.alive = b.alive = false;
      }
      for (var b of moving) if (b.alive) { b.x += PX[b.dir]; b.y += PY[b.dir]; settle(b, phase); }
    }
    if (phase === 0) nextOwn = list.filter(b => b.alive && b.born >= 0)
      .map(b => ({x: b.x, y: b.y, dir: b.dir, born: b.born}));
  }
  return {layers: layers, shotPath: shotPath, own: nextOwn};
}
function touches(cells, p) {
  for (var c of cells) if (covers(p, c.x, c.y)) return 1;
  return 0;
}
function shotValue(s, origin, dir, enemies, explicitPath, delay) {
  var path = explicitPath;
  if (!path) {
    path = []; var p = muzzle(origin, dir);
    for (var n = 0; n <= 12; n++) {
      if (p.x < 0 || p.y < 0 || p.x > 25 || p.y > 25 || s.map[p.y][p.x] === 1 || s.map[p.y][p.x] === 2) break;
      path.push({x: p.x, y: p.y, phase: n <= 3 ? 0 : Math.floor((n - 1) / 3)});
      p.x += PX[dir]; p.y += PY[dir];
    }
  }
  var best = 0;
  for (var e of enemies) {
    if (e.tick !== s.tick) continue;
    var hit = 0;
    for (var t = 0; t < 3; t++) {
      if (e.invincibleTicks > t + delay || e.hurtTicks > t + delay + 1) continue;
      var h = Math.min(3, t + delay + 1), stayWeight = (e.vx || e.vy) ? 0.25 : 0.60;
      var runWeight = (e.vx || e.vy) ? (e.streak >= 2 ? 0.60 : 0.45) : 0.10;
      var predicted = walkPrediction(s.map, e, e.vx, e.vy, h);
      var hitStay = false, hitRun = false, spread = 0;
      var other = [];
      for (var d = 0; d < 4; d++) other.push(walkPrediction(s.map, e, PX[d], PY[d], h));
      for (var c of path) if (c.phase === t) {
        if (covers(e, c.x, c.y)) hitStay = true;
        if (covers(predicted, c.x, c.y)) hitRun = true;
      }
      for (var p of other) if (path.some(c => c.phase === t && covers(p, c.x, c.y))) spread++;
      var probability = (hitStay ? stayWeight : 0) + (hitRun ? runWeight : 0) + spread * (1 - stayWeight - runWeight) / 4;
      var value = probability * (e.hp === 1 ? 2.5 : 1.25) * Math.pow(0.72, t + delay * 0.3);
      if (e.id === memory.target) value *= 1.06;
      hit = Math.max(hit, value);
    }
    best = Math.max(best, hit);
  }
  return best;
}
function enemyRisk(s, p, enemies, future) {
  var risk = 0, count = 0;
  for (var e of enemies) {
    if (e.tick !== s.tick) continue;
    var range = beam(s.map, e, e.dir, p, future ? 9 : 3);
    if (range >= 0) {
      var cooling = s.tick - e.shot < (e.rapidTicks > 1 ? 4 : 6);
      risk += (cooling ? 0.18 : 0.78) * (range > 3 ? 0.42 : 1);
      count++;
    } else if (future) {
      var d = lineDir(e, p);
      if (d >= 0 && beam(s.map, e, d, p, 7) >= 0) risk += 0.12;
    }
  }
  return risk + Math.max(0, count - 1) * 0.2;
}
function trapRisk(s, p, enemies) {
  var worst = 0;
  for (var e of enemies) {
    if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) > 7) continue;
    for (var turn = 0; turn < 5; turn++) {
      var dir = turn < 4 ? turn : e.dir;
      var next = {x: e.x + (turn < 4 ? PX[turn] : 0), y: e.y + (turn < 4 ? PY[turn] : 0)};
      if (!passable(s.map, next.x, next.y) || overlaps(next, p) ||
        enemies.some(other => other.id !== e.id && overlaps(next, other))) next = {x: e.x, y: e.y};
      if (beam(s.map, next, dir, p, 6) < 0) continue;
      var bestEscape = 1;
      for (var d = 0; d < 5; d++) {
        var q = {x: p.x + (d < 4 ? PX[d] : 0), y: p.y + (d < 4 ? PY[d] : 0)};
        if (!passable(s.map, q.x, q.y) || overlaps(q, next) ||
          enemies.some(other => other.id !== e.id && overlaps(q, other))) continue;
        if (beam(s.map, next, dir, q, 3) < 0) { bestEscape = 0; break; }
      }
      var cool = s.tick - e.shot < (e.rapidTicks > 1 ? 3 : 5);
      worst = Math.max(worst, bestEscape * (cool ? 0.15 : 0.7));
    }
  }
  return worst;
}
function graph(s) {
  var free = new Uint8Array(625), route = new Uint8Array(625), dist = new Int16Array(625), queue = new Int16Array(625);
  var routeMargin = inside(s.self.x, s.self.y, s.arena.safeZone.min) ? s.arena.safeZone.min : 0;
  dist.fill(-1);
  for (var y = 0; y <= 24; y++) for (var x = 0; x <= 24; x++) {
    if (!passable(s.map, x, y)) continue;
    var p = {x: x, y: y};
    if (s.radar.tanks.some(e => overlaps(p, e))) continue;
    if (memory.blocked && memory.blocked.until >= s.tick && x === memory.blocked.x && y === memory.blocked.y) continue;
    free[y * 25 + x] = 1;
    if (inside(x, y, routeMargin)) route[y * 25 + x] = 1;
  }
  var start = s.self.y * 25 + s.self.x, end = 1; queue[0] = start; dist[start] = 0; free[start] = route[start] = 1;
  for (var head = 0; head < end; head++) {
    var k = queue[head], x = k % 25, y = Math.floor(k / 25);
    for (var d = 0; d < 4; d++) {
      var nx = x + PX[d], ny = y + PY[d], nk = ny * 25 + nx;
      if (nx < 0 || nx > 24 || ny < 0 || ny > 24 || !route[nk] || dist[nk] >= 0) continue;
      dist[nk] = dist[k] + 1; queue[end++] = nk;
    }
  }
  return {free: free, route: route, dist: dist, cells: queue, count: end};
}
function distances(g, goal) {
  var out = new Int16Array(625), q = new Int16Array(625), end = 1;
  out.fill(999); q[0] = goal; out[goal] = 0;
  for (var head = 0; head < end; head++) {
    var k = q[head], x = k % 25, y = Math.floor(k / 25);
    for (var d = 0; d < 4; d++) {
      var nx = x + PX[d], ny = y + PY[d], nk = ny * 25 + nx;
      if (nx < 0 || nx > 24 || ny < 0 || ny > 24 || !g.route[nk] || out[nk] !== 999) continue;
      out[nk] = out[k] + 1; q[end++] = nk;
    }
  }
  return out;
}
function decide(state) {
  var s = state, me = s.self, tick = s.tick, m = updateMemory(s), g = graph(s);
  var enemies = Object.keys(m.foes).map(id => m.foes[id]), visible = enemies.filter(e => e.tick === tick);
  var ownScore = s.scoreboard.find(r => r.id === me.id), rivals = s.opponents.filter(r => r.lives > 0);
  var lead = ownScore.points - Math.max(0, ...rivals.map(r => r.points));
  var preserve = (tick > 430 && lead > 1) || (me.lives === 1 && tick > 240 && lead >= 0);
  var target = null, targetScore = -1000;
  for (var e of enemies) {
    var distance = Math.abs(e.x - me.x) + Math.abs(e.y - me.y);
    var score = 11 - distance * 0.45 + (e.hp === 1 ? 2.1 : 0) - (e.invincibleTicks > 2 ? 4 : 0)
      + (m.target === e.id ? 1.8 : 0) - (tick - e.tick) * 0.45;
    if (score > targetScore) { targetScore = score; target = e; }
  }
  m.target = target ? target.id : '';
  var zone = s.arena.safeZone, escape = false, safeDistance = 999;
  for (var i = 0; i < g.count; i++) {
    var k = g.cells[i];
    if (inside(k % 25, Math.floor(k / 25), zone.nextMin)) safeDistance = Math.min(safeDistance, g.dist[k]);
  }
  escape = !inside(me.x, me.y, zone.min) || (zone.nextShrinkTick !== null && zone.nextShrinkTick - tick < safeDistance + 10);
  var box = s.arena.supply, resupply = false;
  if (box && tick < box.expireTick && inside(box.x, box.y, margin(tick + 10))) {
    var boxDist = Math.abs(box.x - me.x) + Math.abs(box.y - me.y);
    resupply = (box.type === 'repair' && me.hp < me.maxHp && boxDist < 23) ||
      (box.type === 'rapid' && me.rapidTicks < 12 && !preserve && (boxDist < 8 || !target));
  }
  var mode = escape ? 'retreat' : resupply ? 'resupply' : preserve ? 'defend' : target ? 'pursue' : 'advance';
  var patrols = [[8, 8], [16, 8], [16, 16], [8, 16]];
  if (!m.goal || (Math.abs(m.goal.x - me.x) + Math.abs(m.goal.y - me.y) < 2) || tick % 40 === 0) {
    m.patrol = (m.patrol + 1 + (s.random % 2)) % 4;
  }
  var anchor = patrols[m.patrol], bestCost = 1e9, goal = me.y * 25 + me.x;
  for (var i = 0; i < g.count; i++) {
    var k = g.cells[i], x = k % 25, y = Math.floor(k / 25), p = {x: x, y: y};
    var travel = g.dist[k], cost = travel * 0.48;
    if (!inside(x, y, margin(tick + travel + 16))) cost += 70;
    if (escape && !inside(x, y, zone.nextShrinkTick - tick < safeDistance + 10 ? zone.nextMin : zone.min)) cost += 150;
    if (escape) cost += (Math.abs(x - 12) + Math.abs(y - 12)) * 0.08;
    else if (resupply) {
      cost += (Math.max(0, Math.abs(x - box.x) - 1) + Math.max(0, Math.abs(y - box.y) - 1)) * 2.5;
    } else if (preserve) {
      for (var e of enemies) {
        var dis = Math.abs(x - e.x) + Math.abs(y - e.y);
        cost += Math.max(0, 9 - dis) * 1.0 * Math.max(0.2, 1 - (tick - e.tick) / 18);
      }
      cost += (Math.abs(x - 12) + Math.abs(y - 12)) * 0.08;
    } else if (target) {
      var dis = Math.abs(x - target.x) + Math.abs(y - target.y), d = lineDir(p, target);
      cost += dis * 0.55;
      if (d >= 0 && beam(s.map, p, d, target, 9) >= 0 && dis >= 3) {
        cost -= 5.5;
        if ((d % 2 === 0 && x === target.x + 1) || (d % 2 === 1 && y === target.y + 1)) cost -= 1.2;
        cost += Math.abs(dis - 5) * 0.22;
      }
      if (dis < 3) cost += 3;
    } else {
      cost += (Math.abs(x - anchor[0]) + Math.abs(y - anchor[1])) * 0.7;
      cost += Math.max(0, 35 - (tick + 1 - m.visits[k])) * 0.04;
    }
    var attackers = 0;
    for (var e of visible) {
      if (Math.abs(x - e.x) + Math.abs(y - e.y) > 12) continue;
      var ed = lineDir(e, p);
      if (ed >= 0 && beam(s.map, e, ed, p, 9) >= 0) { cost += e.dir === ed ? 3 : 0.65; attackers++; }
    }
    cost += Math.max(0, attackers - 1) * 3;
    if (m.goal && x === m.goal.x && y === m.goal.y && mode === m.goal.mode) cost -= 0.55;
    if (cost < bestCost) { bestCost = cost; goal = k; }
  }
  m.goal = {x: goal % 25, y: Math.floor(goal / 25), mode: mode};
  var navigation = distances(g, goal), fields = [forecast(s, false)];
  var canFire = me.fireCooldown === 0 && m.own.length < 2;
  if (canFire) fields.push(forecast(s, true));
  var tactical = [];
  for (var move = 0; move < 5; move++) {
    var x = me.x, y = me.y, dir = move < 4 ? move : me.dir;
    if (move < 4) {
      var nx = x + PX[move], ny = y + PY[move];
      if (nx >= 0 && nx <= 24 && ny >= 0 && ny <= 24 && g.free[ny * 25 + nx]) { x = nx; y = ny; }
    }
    var p = {x: x, y: y};
    tactical.push({x: x, y: y, dir: dir, trap: trapRisk(s, p, visible),
      present: enemyRisk(s, p, visible, false), future: enemyRisk(s, p, visible, true),
      nextShot: me.fireCooldown <= 1 ? shotValue(s, p, dir, visible, null, 1) : 0});
  }
  var currentDistance = navigation[me.y * 25 + me.x];
  function routeDistance(x, y) {
    return navigation[y * 25 + x] === 999 ? currentDistance + 3 : navigation[y * 25 + x];
  }
  var best = null, bestValue = -1e9;
  for (var f = 0; f < fields.length; f++) {
    var field = fields[f], attack = f ? shotValue(s, me, me.dir, visible, field.shotPath, 0) : 0;
    var protectedNow = !f && me.invincibleTicks > 0, buffered = me.hurtTicks > 1;
    var durability = protectedNow || buffered ? 0 : me.hp === 1 ? 160 : 105;
    var brickValue = 0;
    if (f && attack < 0.1 && !preserve && me.invincibleTicks === 0) {
      var gun = muzzle(me, me.dir);
      for (var n = 0; n < 5; n++) {
        if (gun.x < 0 || gun.y < 0 || gun.x > 25 || gun.y > 25) break;
        var tile = s.map[gun.y][gun.x];
        if (tile === 2) break;
        if (tile === 1) {
          var forward = (m.goal.x - me.x) * PX[me.dir] + (m.goal.y - me.y) * PY[me.dir];
          if (forward > 1) brickValue = 2.2;
          break;
        }
        gun.x += PX[me.dir]; gun.y += PY[me.dir];
      }
    }
    for (var move = 0; move < 5; move++) {
      var c = tactical[move], x = c.x, y = c.y, dir = c.dir;
      var p = {x: x, y: y}, moved = x !== me.x || y !== me.y;
      var value = -routeDistance(x, y) * 2.0;
      value -= touches(field.layers[0], p) * durability;
      value -= c.present * durability * 0.65;
      if (me.hurtTicks <= 2 && !(protectedNow && me.invincibleTicks > 1))
        value -= c.trap * (me.hp === 1 ? 80 : 50);
      for (var e of enemies) {
        var age = tick - e.tick;
        if (age > 0 && age <= 4) {
          var dangerDir = lineDir(e, p);
          if (dangerDir >= 0 && beam(s.map, e, dangerDir, p, 5) >= 0)
            value -= (5 - age) * (me.hp === 1 ? 3 : 1.8);
        }
        if (age === 0 && me.hp === 1 && me.fireCooldown > 1)
          value -= Math.max(0, 4 - Math.abs(x - e.x) - Math.abs(y - e.y)) * 2;
      }
      var futureBest = 1e9;
      for (var d = 0; d < 5; d++) {
        var xx = x + (d < 4 ? PX[d] : 0), yy = y + (d < 4 ? PY[d] : 0);
        if (xx < 0 || xx > 24 || yy < 0 || yy > 24 || !g.free[yy * 25 + xx]) continue;
        var q = {x: xx, y: yy};
        var risk = touches(field.layers[1], q) * (me.hurtTicks > 2 || (!f && me.invincibleTicks > 1) ? 0 : 55);
        risk += enemyRisk(s, q, visible, true) * (protectedNow ? 1 : 9);
        if (!inside(xx, yy, margin(tick + 2))) risk += 60;
        risk += routeDistance(xx, yy) * 0.2;
        futureBest = Math.min(futureBest, risk);
      }
      value -= futureBest;
      value -= c.future * (protectedNow ? 0.5 : 3.5);
      if (!inside(x, y, margin(tick))) value -= tick % 10 === 0 ? 220 : 45;
      if (!inside(x, y, margin(tick + 5))) value -= 6;
      if (f) value += attack * 24 + brickValue - (preserve ? 1.8 : 0.7);
      if (f && me.invincibleTicks > 0) value -= 4 + Math.min(8, me.invincibleTicks * 0.5);
      if (!f) value += c.nextShot * 9;
      if (move < 4 && !moved) value -= 0.4;
      if (moved && m.last && x === m.last.fromX && y === m.last.fromY) value -= 0.35;
      if (moved && move === me.dir) value += 0.08;
      if (resupply && overlaps(p, box) && tick >= box.appearTick) value += 4;
      if (value > bestValue) {
        bestValue = value; best = {move: move, fire: !!f, x: x, y: y, moved: moved, field: field};
      }
    }
  }
  if (!best) return {move: 'stay', fire: false, intent: 'hold'};
  m.own = best.field.own;
  m.last = {x: best.x, y: best.y, fromX: me.x, fromY: me.y, moved: best.moved,
    fire: best.fire, cooldown: me.fireCooldown};
  m.tick = tick; m.lives = me.lives;
  var intent = mode;
  if (best.move === 4) intent = 'hold';
  else if (touches(fields[0].layers[0], me) && best.moved) intent = 'retreat';
  else if (target && !resupply && !escape && !preserve) intent = best.fire ? 'pursue' : 'flank';
  return {move: PM[best.move], fire: best.fire, intent: intent};
}
