// Iron Ambush: a ring patrol that converts brief radar contacts into safe firing angles.
var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
var MOVES = ['up', 'right', 'down', 'left'];
var memory = freshMemory();

function freshMemory() {
  return {lastTick: -1, lastX: -1, lastY: -1, lastMove: 'stay', stuck: 0,
    targetId: '', targetAge: 99, contacts: {}, shots: [], patrolShift: 0,
    evadeUntil: -1, shotX: -1, shotY: -1, shotDir: 0, projectiles: [], prevHp: 2};
}

function abs(n) { return n < 0 ? -n : n; }
function manhattan(a, b) { return abs(a.x - b.x) + abs(a.y - b.y); }
function chebyshev(a, b) { var x = abs(a.x - b.x), y = abs(a.y - b.y); return x > y ? x : y; }
function cover(t, x, y) { return x >= t.x && x < t.x + 2 && y >= t.y && y < t.y + 2; }
function overlap(a, b) { return a.x < b.x + 2 && a.x + 2 > b.x && a.y < b.y + 2 && a.y + 2 > b.y; }
function seat(s,id) { var i=s.scoreboard.findIndex(function(row){return row.id===id;}); return i<0?0:i; }

function inZone(p, z) {
  return p.x >= z.min && p.y >= z.min && p.x + 1 <= z.max && p.y + 1 <= z.max;
}

function openAt(map, x, y) {
  if (x < 0 || y < 0 || x > map.length - 2 || y > map.length - 2) return false;
  return [map[y][x], map[y][x + 1], map[y + 1][x], map[y + 1][x + 1]]
    .every(function (v) { return v === 0 || v === 4; });
}

function occupiedByVisible(s, p) {
  for (var i = 0; i < s.radar.tanks.length; i += 1) {
    if (overlap(p, s.radar.tanks[i])) return true;
  }
  return false;
}

function freeAt(s, x, y) {
  var p = {x: x, y: y};
  return openAt(s.map, x, y) && !occupiedByVisible(s, p);
}

function nextPoint(p, d) {
  return {x: p.x + DIRS[d][0], y: p.y + DIRS[d][1]};
}

function updateMemory(s) {
  if (memory.lastTick >= 0 && s.tick <= memory.lastTick) memory = freshMemory();
  if (memory.lastTick >= 0 && s.tick - memory.lastTick > 1) {
    memory.shots = [];
    memory.projectiles = [];
    memory.targetId = '';
    memory.evadeUntil = -1;
    memory.lastMove = 'stay';
    memory.targetAge = 99;
    memory.stuck = 0;
  }
  if (memory.lastTick >= 0 && s.self.hp < memory.prevHp) memory.evadeUntil = s.tick + 5;
  memory.prevHp = s.self.hp;
  if (memory.lastTick >= 0 && memory.lastX === s.self.x && memory.lastY === s.self.y
      && memory.lastMove !== 'stay') memory.stuck += 1;
  else memory.stuck = 0;
  for (var i = 0; i < s.radar.tanks.length; i += 1) {
    var e = s.radar.tanks[i];
    var prior = memory.contacts[e.id];
    memory.contacts[e.id] = {x: e.x, y: e.y, dir: e.dir, tick: s.tick, hp: e.hp,
      prevX: prior ? prior.x : -99, prevY: prior ? prior.y : -99,
      prevTick: prior ? prior.tick : -99};
  }
  memory.shots = memory.shots.filter(function (t) { return s.tick - t < 11; });
  memory.projectiles = memory.projectiles.filter(function (p) { return s.tick - p.tick < 11; });
  if (memory.targetId) memory.targetAge += 1;
}

function opponentInfo(s, id) {
  for (var i = 0; i < s.opponents.length; i += 1) {
    if (s.opponents[i].id === id) return s.opponents[i];
  }
  return null;
}

function chooseTarget(s) {
  var best = null, bestValue = -100000;
  var myPoints = 0, leaderPoints = 0;
  for (var q = 0; q < s.scoreboard.length; q += 1) {
    var row = s.scoreboard[q];
    if (row.id === s.self.id) myPoints = row.points;
    else if (row.lives > 0 && row.points > leaderPoints) leaderPoints = row.points;
  }
  for (var i = 0; i < s.radar.tanks.length; i += 1) {
    var e = s.radar.tanks[i], publicInfo = opponentInfo(s, e.id);
    if (publicInfo && (publicInfo.status === 'eliminated' || publicInfo.lives <= 0)) continue;
    if (e.invincibleTicks > 0) continue;
    var value = e.hp === 1 ? 72 : 25;
    value -= manhattan(s.self, e) * 1.8;
    value += e.hurtTicks <= 1 ? 10 : -20;
    if (e.rapidTicks > 0) value += 7;
    if (publicInfo) value += Math.min(12, publicInfo.points * 0.15);
    if (myPoints < leaderPoints && publicInfo && publicInfo.points >= leaderPoints - 1) value += 12;
    if (e.id === memory.targetId) value += 11;
    if (value > bestValue) { bestValue = value; best = e; }
  }
  if (best) {
    if (memory.targetId !== best.id) memory.targetAge = 0;
    memory.targetId = best.id;
  }
  if (best && best.hp === 2 && s.radar.tanks.length && s.tick < 430
      && !hitsNowOrNext(s, s.self.x, s.self.y, s.self.dir, best)) return null;
  return best;
}

function occupiedByVisibleExcept(s, p, id) {
  for (var i = 0; i < s.radar.tanks.length; i += 1) {
    var e = s.radar.tanks[i];
    if (e.id !== id && overlap(p, e)) return true;
  }
  return false;
}

function predictedTarget(s, target) {
  var old = memory.contacts[target.id];
  if (!old || old.prevTick !== s.tick - 1 || old.prevX !== target.x || old.prevY !== target.y) return target;
  var d = target.dir, p = {x: target.x + DIRS[d][0], y: target.y + DIRS[d][1], id: target.id};
  if (openAt(s.map, p.x, p.y) && !occupiedByVisibleExcept(s, p, target.id)) return p;
  return target;
}

function muzzle(x, y, d) {
  return {x: x + (d === 1 ? 2 : d === 3 ? -1 : 0),
    y: y + (d === 2 ? 2 : d === 0 ? -1 : 0)};
}

function rayHits(s, x, y, d, target, limit) {
  var p = muzzle(x, y, d);
  var steps = limit === undefined ? 4 : limit;
  for (var n = 0; n < steps; n += 1) {
    if (p.x < 0 || p.y < 0 || p.x >= s.map.length || p.y >= s.map.length) return false;
    var terrain = s.map[p.y][p.x];
    if (terrain === 1 || terrain === 2) return false;
    if (cover(target, p.x, p.y)) return true;
    for (var i = 0; i < s.radar.tanks.length; i += 1) {
      var other = s.radar.tanks[i];
      if (other.id !== target.id && cover(other, p.x, p.y)) return false;
    }
    p.x += DIRS[d][0];
    p.y += DIRS[d][1];
  }
  return false;
}

function hitsNowOrNext(s, x, y, d, target) {
  return rayHits(s, x, y, d, target) || rayHits(s, x, y, d, predictedTarget(s, target));
}

function aimDirection(s, target, x, y, preferred) {
  var order = [preferred, (preferred + 1) % 4, (preferred + 3) % 4, (preferred + 2) % 4];
  for (var i = 0; i < order.length; i += 1) {
    if (hitsNowOrNext(s, x, y, order[i], target)) return order[i];
  }
  return -1;
}

function attackGoal(s, target, z) {
  var me = s.self, best = null, bestScore = 100000;
  var currentDir = aimDirection(s, target, me.x, me.y, me.dir);
  if (currentDir >= 0) return {x: me.x, y: me.y, dir: currentDir};
  for (var d = 0; d < 4; d += 1) {
    for (var k = 3; k <= 8; k += 1) {
      for (var lane = 0; lane < 2; lane += 1) {
        var p;
        if (d === 1) p = {x: target.x - k, y: target.y + lane};
        else if (d === 3) p = {x: target.x + k, y: target.y + lane};
        else if (d === 2) p = {x: target.x + lane, y: target.y - k};
        else p = {x: target.x + lane, y: target.y + k};
        if (!inZone(p, z) || !freeAt(s, p.x, p.y)) continue;
        if (!hitsNowOrNext(s, p.x, p.y, d, target)) continue;
        var score = manhattan(me, p) + abs(k - 4) * 0.4;
        if (d === me.dir) score -= 2;
        if (score < bestScore) { bestScore = score; best = {x: p.x, y: p.y, dir: d}; }
      }
    }
  }
  return best;
}

function bulletThreatAt(s, p) {
  for (var i = 0; i < s.radar.bullets.length; i += 1) {
    var b = s.radar.bullets[i], x = b.x, y = b.y;
    var ownFresh = false;
    for (var q = 0; q < memory.projectiles.length; q += 1) {
      var shot = memory.projectiles[q], age = s.tick - shot.tick;
      var sx = shot.x + DIRS[shot.dir][0] * 3 * age;
      var sy = shot.y + DIRS[shot.dir][1] * 3 * age;
      if (age >= 0 && age < 3 && sx === b.x && sy === b.y && shot.dir === b.dir) ownFresh = true;
    }
    if (ownFresh) continue;
    for (var step = 0; step <= 3; step += 1) {
      if (x < 0 || y < 0 || x >= s.map.length || y >= s.map.length) break;
      var terrain = s.map[y][x];
      if (terrain === 1 || terrain === 2) break;
      if (cover(p, x, y)) return true;
      x += DIRS[b.dir][0];
      y += DIRS[b.dir][1];
    }
  }
  return false;
}

function validMove(s, d, z) {
  var p = nextPoint(s.self, d);
  return freeAt(s, p.x, p.y) && (!z || inZone(p, z));
}

function dodgeMove(s, z) {
  var me = s.self;
  if (!bulletThreatAt(s, me)) return -1;
  var best = -1, bestScore = -100000;
  for (var i = 0; i < 4; i += 1) {
    if (!validMove(s, i, z)) continue;
    var p = nextPoint(me, i), score = 0;
    if (!bulletThreatAt(s, {x: p.x, y: p.y})) score += 100;
    if (i === me.dir) score += 3;
    if (i === (me.dir + 2) % 4) score -= 2;
    var c = centerPos(s); score -= manhattan(p, {x: c, y: c}) * 0.03;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best >= 0) return best;
  for (var j = 0; j < 4; j += 1) if (validMove(s, j, null)) return j;
  return -1;
}

function enemyAimingAt(s) {
  for (var i = 0; i < s.radar.tanks.length; i += 1) {
    var e = s.radar.tanks[i];
    if (e.invincibleTicks === 0 && rayHits(s, e.x, e.y, e.dir, s.self, 4)) return e;
  }
  return null;
}

function enemyThreatAtPosition(s, p) {
  for (var i = 0; i < s.radar.tanks.length; i += 1) {
    var e = s.radar.tanks[i];
    if (e.invincibleTicks === 0 && rayHits(s, e.x, e.y, e.dir, p, 4)) return e;
  }
  return null;
}

function evadeLineMove(s, z, enemy, reference) {
  var order = [(enemy.dir + 1) % 4, (enemy.dir + 3) % 4,
    (enemy.dir + 2) % 4, enemy.dir], best = -1, bestScore = -100000;
  var from = reference || enemy;
  for (var i = 0; i < order.length; i += 1) {
    var d = order[i];
    if (!validMove(s, d, z)) continue;
    var p = nextPoint(s.self, d), score = 0;
    if (!bulletThreatAt(s, p)) score += 80;
    if (!rayHits(s, enemy.x, enemy.y, enemy.dir, p, 4)) score += 40;
    score += manhattan(p, from) * 2;
    if (d === s.self.dir) score += 2;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function postShotMove(s, z, target) {
  var d0 = s.self.dir;
  var order = [(d0 + 1) % 4, (d0 + 3) % 4, (d0 + 2) % 4, d0];
  var best = -1, bestScore = -100000;
  for (var i = 0; i < order.length; i += 1) {
    var d = order[i];
    if (!validMove(s, d, z)) continue;
    var p = nextPoint(s.self, d), score = 0;
    if (!bulletThreatAt(s, p)) score += 100;
    if (target) {
      score += (manhattan(p, target) - manhattan(s.self, target)) * 4;
      if (!rayHits(s, p.x, p.y, d0, target, 4)) score += 8;
    }
    for (var j = 0; j < s.radar.tanks.length; j += 1) {
      var e = s.radar.tanks[j];
      if (e.invincibleTicks === 0 && rayHits(s, e.x, e.y, e.dir, p, 4)) score -= 55;
    }
    if (d === d0) score -= 3;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function walkTo(s, goal, z) {
  if (!goal) return -1;
  var size=s.map.length-1,total=size*size;
  var start = s.self.y * size + s.self.x;
  var seen = new Uint8Array(total), first = new Int8Array(total), queue = [start];
  first.fill(-1); seen[start] = 1;
  var best = start, bestScore = 100000;
  var shift = (seat(s,s.self.id) + s.tick + memory.patrolShift) % 4;
  for (var qi = 0; qi < queue.length; qi += 1) {
    var key = queue[qi], x = key % size, y = (key / size) | 0;
    var here = {x: x, y: y};
    if (inZone(here, z)) {
      var score = manhattan(here, goal);
      if (score < bestScore) { bestScore = score; best = key; }
      if (score === 0) break;
    }
    for (var q = 0; q < 4; q += 1) {
      var d = (q + shift) % 4, nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx > size - 1 || ny > size - 1) continue;
      var nk = ny * size + nx;
      if (seen[nk] || !freeAt(s, nx, ny)) continue;
      if (z && inZone(here, z) && !inZone({x: nx, y: ny}, z)) continue;
      seen[nk] = 1;
      first[nk] = key === start ? d : first[key];
      queue.push(nk);
    }
  }
  return first[best] === undefined ? -1 : first[best];
}

function projectedZone(s) {
  var z = s.arena.safeZone;
  if (z.nextShrinkTick !== null && z.nextShrinkTick - s.tick <= 24) {
    return {min: z.nextMin, max: z.nextMax ?? s.map.length - 1 - z.nextMin};
  }
  return z;
}

function centerPos(s) { return (s.map.length - 2) / 2; }

function clampGoal(p, z) {
  return {x: Math.max(z.min, Math.min(z.max - 1, p.x)),
    y: Math.max(z.min, Math.min(z.max - 1, p.y))};
}

function patrolGoal(s, z) {
  var lo = z.min, hi = z.max - 1, w = hi - lo;
  var pad = Math.max(2, Math.min(5, (w / 4) | 0));
  var mid = (lo + hi) / 2 | 0, a = seat(s,s.self.id) % 4;
  var corners = [
    {x: lo + pad, y: hi - pad}, {x: lo + pad, y: lo + pad},
    {x: hi - pad, y: lo + pad}, {x: hi - pad, y: hi - pad}
  ];
  var inner = [
    {x: lo + pad + 3, y: Math.min(hi - 1, mid + 3)},
    {x: Math.min(hi - 1, mid + 3), y: lo + pad + 3},
    {x: hi - pad - 3, y: Math.max(lo, mid - 3)},
    {x: Math.max(lo, mid - 3), y: hi - pad - 3}
  ];
  var phase = ((s.tick + a * 19) / 70) | 0;
  return clampGoal((phase + memory.patrolShift) % 2 ? inner[a] : corners[a], z);
}

function grassAt(s, p) {
  for (var y = p.y; y < p.y + 2; y += 1) for (var x = p.x; x < p.x + 2; x += 1) {
    if (s.map[y][x] === 4) return true;
  }
  return false;
}

function survivalGoal(s, z) {
  var best = null, bestScore = -100000;
  for (var y = z.min; y < z.max; y += 1) for (var x = z.min; x < z.max; x += 1) {
    var p = {x: x, y: y};
    if (!freeAt(s, x, y)) continue;
    var nearest = 99, score = 0, exposed = 0;
    for (var i = 0; i < s.radar.tanks.length; i += 1) {
      var e = s.radar.tanks[i], d = chebyshev(p, e);
      if (d < nearest) nearest = d;
      if (rayHits(s, e.x, e.y, e.dir, p, 4)) exposed += 1;
    }
    score += nearest * 4;
    score -= exposed * 20;
    if (grassAt(s, p)) score += 8;
    score -= manhattan(s.self, p) * 0.08;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best || patrolGoal(s, z);
}

function survivalMode(s) {
  var mine = 0, lead = 0;
  for (var i = 0; i < s.scoreboard.length; i += 1) {
    var row = s.scoreboard[i];
    if (row.id === s.self.id) mine = row.points;
    else if (row.lives > 0 && row.points > lead) lead = row.points;
  }
  if (s.self.hp === 1) return mine >= lead;
  return s.self.lives === 1 && s.tick >= 500 && mine >= lead - 2;
}

function supplyGoal(s, z, target) {
  var box = s.arena.supply;
  if (!box || !inZone(box, z)) return null;
  var distance = manhattan(s.self, box), want = false;
  if (box.type === 'repair') want = s.self.hp === 1;
  else want = s.tick < 430 && (target !== null || s.self.rapidTicks === 0);
  if (!want) return null;
  if (box.available && (s.self.hp === 1 || distance <= 12)) return {x: box.x, y: box.y};
  if (!box.available && box.appearTick - s.tick <= 12 && distance <= 12) return {x: box.x, y: box.y};
  return null;
}

function chooseMove(s, target, z, firing) {
  var dodge = dodgeMove(s, z);
  if (dodge >= 0) return {d: dodge, intent: 'retreat'};

  var me = s.self;
  if (!inZone(me, z)) {
    var center = {x: (z.min + z.max - 1) / 2 | 0, y: (z.min + z.max - 1) / 2 | 0};
    var escape = walkTo(s, center, z);
    if (escape >= 0) return {d: escape, intent: 'retreat'};
  }

  var aimedBy = enemyAimingAt(s);
  if (aimedBy) {
    var lineStep = evadeLineMove(s, z, aimedBy, aimedBy);
    if (lineStep >= 0) return {d: lineStep, intent: firing ? 'flank' : (target ? 'flank' : 'retreat')};
  }

  if (firing) {
    var shotStep = postShotMove(s, z, target);
    if (shotStep >= 0) return {d: shotStep, intent: 'flank'};
  }

  if (s.tick <= memory.evadeUntil) {
    var remembered = target || {x: memory.shotX, y: memory.shotY, dir: memory.shotDir};
    var rememberedStep = evadeLineMove(s, z, remembered, remembered);
    if (rememberedStep >= 0) return {d: rememberedStep, intent: 'retreat'};
  }

  if (survivalMode(s)) {
    var safeStep = walkTo(s, survivalGoal(s, z), z);
    if (safeStep >= 0) return {d: safeStep, intent: 'defend'};
  }

  var box = supplyGoal(s, z, target);
  if (box) {
    var supplyStep = walkTo(s, box, z);
    if (supplyStep >= 0) return {d: supplyStep, intent: 'resupply'};
  }

  if (target) {
    var attack = attackGoal(s, target, z);
    var attackStep = walkTo(s, attack || patrolGoal(s, z), z);
    if (attackStep >= 0) {
      if (firing && !bulletThreatAt(s, nextPoint(me, attackStep))) return {d: -1, intent: 'pursue'};
      return {d: attackStep, intent: 'pursue'};
    }
    var turn = aimDirection(s, target, me.x, me.y, me.dir);
    if (turn >= 0 && turn !== me.dir) return {d: turn, intent: 'pursue'};
  }

  var patrol = walkTo(s, patrolGoal(s, z), z);
  if (patrol >= 0) {
    if (firing) return {d: -1, intent: 'hold'};
    if (bulletThreatAt(s, nextPoint(me, patrol))) {
      var sidestep = dodgeMove(s, z);
      if (sidestep >= 0) return {d: sidestep, intent: 'retreat'};
    }
    return {d: patrol, intent: target ? 'pursue' : 'flank'};
  }
  if (memory.stuck > 3) memory.patrolShift = (memory.patrolShift + 1) % 4;
  return {d: -1, intent: target ? 'pursue' : 'hold'};
}

function decide(state) {
  updateMemory(state);
  var target = chooseTarget(state);
  var z = projectedZone(state);
  var fire = false;
  var cautious = survivalMode(state);
  var enemyLead = 0, myPoints = 0;
  for (var i = 0; i < state.scoreboard.length; i += 1) {
    var row = state.scoreboard[i];
    if (row.id === state.self.id) myPoints = row.points;
    else if (row.lives > 0 && row.points > enemyLead) enemyLead = row.points;
  }
  if (target && target.hurtTicks <= 1 && target.invincibleTicks === 0
      && state.self.fireCooldown === 0 && state.self.invincibleTicks === 0
      && memory.shots.length < 2
      && (!cautious || target.hp === 1 || myPoints + 6 < enemyLead)
      && hitsNowOrNext(state, state.self.x, state.self.y, state.self.dir, target)) {
    fire = true;
  }
  var choice = chooseMove(state, target, z, fire);
  var finalDir = choice.d;
  if (state.self.hp === 1 && finalDir >= 0) {
    var previousDir = MOVES.indexOf(memory.lastMove);
    if (previousDir >= 0 && finalDir === (previousDir + 2) % 4) {
      var alternatives = [(previousDir + 1) % 4, (previousDir + 3) % 4, previousDir];
      var offset = (state.random >>> 0) % alternatives.length;
      for (var a = 0; a < alternatives.length; a += 1) {
        var candidateDir = alternatives[(a + offset) % alternatives.length];
        if (validMove(state, candidateDir, z) && !bulletThreatAt(state, nextPoint(state.self, candidateDir))) {
          finalDir = candidateDir;
          break;
        }
      }
    }
  }
  if (state.self.hp === 1 && finalDir >= 0) {
    var next = nextPoint(state.self, finalDir), aimedAtNext = enemyThreatAtPosition(state, next);
    if (aimedAtNext) {
      var safer = evadeLineMove(state, z, aimedAtNext, aimedAtNext);
      if (safer >= 0) finalDir = safer;
    }
  }
  var move = finalDir >= 0 ? MOVES[finalDir] : 'stay';
  if (fire) {
    memory.shots.push(state.tick);
    memory.evadeUntil = state.tick + 2;
    memory.shotX = target.x;
    memory.shotY = target.y;
    memory.shotDir = target.dir;
    var launch = muzzle(state.self.x, state.self.y, state.self.dir);
    memory.projectiles.push({tick: state.tick, x: launch.x, y: launch.y, dir: state.self.dir});
  }
  memory.lastTick = state.tick;
  memory.lastX = state.self.x;
  memory.lastY = state.self.y;
  memory.lastMove = move;
  return {move: move, fire: fire, intent: choice.intent};
}





