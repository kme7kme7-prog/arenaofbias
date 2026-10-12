const DIRECTIONS = [
  { x: 0, y: -1, move: 'up', dir: 0 },
  { x: 1, y: 0, move: 'right', dir: 1 },
  { x: 0, y: 1, move: 'down', dir: 2 },
  { x: -1, y: 0, move: 'left', dir: 3 },
];

let memory = null;

function indexOf(x, y) {
  return y * 25 + x;
}

function distance(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx > dy ? dx : dy;
}

function overlaps(a, b) {
  return a.x < b.x + 2 && a.x + 2 > b.x && a.y < b.y + 2 && a.y + 2 > b.y;
}

function inZone(x, y, zone) {
  return x >= zone.min && y >= zone.min && x + 1 <= zone.max && y + 1 <= zone.max;
}

function freePosition(map, x, y) {
  if (x < 0 || y < 0 || x > 24 || y > 24) return false;
  return [map[y][x], map[y][x + 1], map[y + 1][x], map[y + 1][x + 1]]
    .every(cell => cell === 0 || cell === 4);
}

function blockedByOpponent(x, y, tanks, skipId) {
  const point = { x, y };
  for (const tank of tanks) {
    if (tank.id !== skipId && overlaps(point, tank)) return true;
  }
  return false;
}

function positionAllowed(map, x, y, tanks, zone, skipId) {
  return freePosition(map, x, y) && inZone(x, y, zone)
    && !blockedByOpponent(x, y, tanks, skipId);
}

function makeDistanceMap(map, goals, tanks, zone) {
  const distances = new Int16Array(625);
  distances.fill(30000);
  const queue = new Int16Array(625);
  let head = 0;
  let tail = 0;
  for (const goal of goals) {
    const id = indexOf(goal.x, goal.y);
    if (distances[id] !== 30000) continue;
    distances[id] = 0;
    queue[tail++] = id;
  }
  while (head < tail) {
    const id = queue[head++];
    const x = id % 25;
    const y = (id / 25) | 0;
    const nextDistance = distances[id] + 1;
    for (const direction of DIRECTIONS) {
      const nx = x + direction.x;
      const ny = y + direction.y;
      if (!positionAllowed(map, nx, ny, tanks, zone, '')) continue;
      const nextId = indexOf(nx, ny);
      if (distances[nextId] <= nextDistance) continue;
      distances[nextId] = nextDistance;
      queue[tail++] = nextId;
    }
  }
  return distances;
}

function firstHitOnLane(map, origin, direction, tanks) {
  let x = origin.x;
  let y = origin.y;
  if (direction === 0) y -= 1;
  else if (direction === 1) x += 2;
  else if (direction === 2) y += 2;
  else x -= 1;
  for (let steps = 1; steps <= 26; steps++) {
    if (x < 0 || y < 0 || x > 25 || y > 25) return null;
    const terrain = map[y][x];
    if (terrain === 1 || terrain === 2) return null;
    for (const tank of tanks) {
      if (x >= tank.x && x < tank.x + 2 && y >= tank.y && y < tank.y + 2) {
        return { tank, steps };
      }
    }
    x += direction === 1 ? 1 : direction === 3 ? -1 : 0;
    y += direction === 2 ? 1 : direction === 0 ? -1 : 0;
  }
  return null;
}

function rayTouches(map, origin, direction, target) {
  const hit = firstHitOnLane(map, origin, direction, [target]);
  return hit ? hit.steps : 0;
}

function collectAttackGoals(state, target, zone, visible) {
  const goals = [];
  for (let y = zone.min; y <= zone.max - 1; y++) {
    for (let x = zone.min; x <= zone.max - 1; x++) {
      if (!positionAllowed(state.map, x, y, visible, zone, target.id)) continue;
      const range = distance({ x, y }, target);
      if (range < 2 || range > 8) continue;
      let clear = false;
      for (let direction = 0; direction < 4 && !clear; direction++) {
        clear = rayTouches(state.map, { x, y }, direction, target) > 0;
      }
      if (clear) goals.push({ x, y });
    }
  }
  return goals;
}

function distanceToZone(x, y, zone) {
  let amount = 0;
  if (x < zone.min) amount += zone.min - x;
  if (y < zone.min) amount += zone.min - y;
  if (x + 1 > zone.max) amount += x + 1 - zone.max;
  if (y + 1 > zone.max) amount += y + 1 - zone.max;
  return amount;
}

function bulletHitsPosition(map, bullet, x, y) {
  let bx = bullet.x;
  let by = bullet.y;
  for (let step = 0; step <= 3; step++) {
    if (bx < 0 || by < 0 || bx > 25 || by > 25) return 0;
    const terrain = map[by][bx];
    if (terrain === 1 || terrain === 2) return 0;
    if (bx >= x && bx < x + 2 && by >= y && by < y + 2) return step === 0 ? 1 : 2;
    if (step === 3) break;
    if (bullet.dir === 0) by -= 1;
    else if (bullet.dir === 1) bx += 1;
    else if (bullet.dir === 2) by += 1;
    else bx -= 1;
  }
  return 0;
}

function candidateMoves(state, visible, zone) {
  const self = state.self;
  const result = [{ move: 'stay', dir: self.dir, x: self.x, y: self.y, moved: false }];
  for (const direction of DIRECTIONS) {
    const x = self.x + direction.x;
    const y = self.y + direction.y;
    if (positionAllowed(state.map, x, y, visible, zone, '')) {
      result.push({ move: direction.move, dir: direction.dir, x, y, moved: true });
    } else {
      result.push({ move: direction.move, dir: direction.dir, x: self.x, y: self.y, moved: false });
    }
  }
  return result;
}

function damageEstimate(state, target, steps) {
  const flightTurns = ((steps - 1) / 3) | 0;
  if (target.invincibleTicks > flightTurns) return 0;
  if (target.hurtTicks > flightTurns + 1) return 0;
  let value = target.hp === 1 ? 3 : 1;
  if (target.hurtTicks <= flightTurns + 1) value += 0.5;
  const score = state.scoreboard.find(row => row.id === target.id);
  if (score && score.lives === 1) value += 0.5;
  return value;
}

function chooseShot(state, visible) {
  const self = state.self;
  if (self.fireCooldown > 0 || self.invincibleTicks > 0) return false;
  const hit = firstHitOnLane(state.map, self, self.dir, visible);
  if (!hit) return false;
  if (damageEstimate(state, hit.tank, hit.steps) <= 0) return false;
  return true;
}

function chooseTarget(state, visible, goalZone, pathZone, memoryState) {
  let best = null;
  for (const target of visible) {
    const range = distance(state.self, target);
    if (range > 8) continue;
    const goals = collectAttackGoals(state, target, goalZone, visible);
    if (!goals.length) continue;
    const distances = makeDistanceMap(state.map, goals, visible, pathZone);
    const travel = distances[indexOf(state.self.x, state.self.y)];
    if (travel >= 30000) continue;
    const score = state.scoreboard.find(row => row.id === target.id);
    let value = 1.5 - travel * 0.42;
    if (target.hp === 1) value += 2.1;
    if (target.hurtTicks === 1) value += 1.2;
    if (score && score.lives === 1) value += 0.6;
    if (target.invincibleTicks > 0) value -= 1.7 + Math.min(1.5, target.invincibleTicks * 0.06);
    if (target.rapidTicks > 0) value -= 0.35;
    if (memoryState.target === target.id) value += 0.8;
    if (range <= 3) value += 0.5;
    if (!best || value > best.value) best = { target, goals, distances, travel, value };
  }
  return best && best.value > -1.5 ? best : null;
}

function makeCenterGoals(state, zone, visible) {
  const center = (zone.min + zone.max - 1) / 2;
  let nearest = 100;
  const candidates = [];
  for (let y = zone.min; y <= zone.max - 1; y++) {
    for (let x = zone.min; x <= zone.max - 1; x++) {
      if (!positionAllowed(state.map, x, y, visible, zone, '')) continue;
      const d = Math.abs(x - center) + Math.abs(y - center);
      if (d < nearest) {
        nearest = d;
        candidates.length = 0;
        candidates.push({ x, y });
      } else if (d === nearest) candidates.push({ x, y });
    }
  }
  return candidates;
}

function chooseSupply(state, visible, goalZone, pathZone) {
  const box = state.arena.supply;
  if (!box || !box.available) return null;
  if (box.type === 'repair' && state.self.hp >= state.self.maxHp) return null;
  if (box.type === 'rapid' && state.self.rapidTicks > 20 && visible.length === 0) return null;
  const goals = [];
  for (let y = box.y - 1; y <= box.y; y++) {
    for (let x = box.x - 1; x <= box.x; x++) {
      if (positionAllowed(state.map, x, y, visible, goalZone, '')) goals.push({ x, y });
    }
  }
  if (!goals.length) return null;
  const distances = makeDistanceMap(state.map, goals, visible, pathZone);
  const travel = distances[indexOf(state.self.x, state.self.y)];
  if (travel >= 30000 || state.tick + travel > box.expireTick) return null;
  const bonus = box.type === 'repair' ? 15 : 7;
  if (travel > (box.type === 'repair' ? 18 : 12)) return null;
  return { goals, distances, travel, value: bonus - travel * 1.05, type: box.type };
}

function facingThreat(state, candidate, visible) {
  for (const enemy of visible) {
    if (distance(candidate, enemy) > 6) continue;
    const steps = rayTouches(state.map, enemy, enemy.dir, candidate);
    if (steps > 0) return true;
  }
  return false;
}

function updateMemory(state) {
  const now = state.self;
  if (!memory || state.tick <= memory.tick) {
    memory = { tick: state.tick, x: now.x, y: now.y, move: 'stay', stuck: 0, target: '' };
    return memory;
  }
  const gap = state.tick - memory.tick;
  if (gap > 1) {
    memory.stuck = 0;
    memory.target = '';
  } else if (now.x === memory.x && now.y === memory.y && memory.move !== 'stay') {
    memory.stuck = Math.min(8, memory.stuck + 1);
  } else {
    memory.stuck = 0;
  }
  memory.tick = state.tick;
  memory.x = now.x;
  memory.y = now.y;
  return memory;
}

function decide(state) {
  const self = state.self;
  const memoryState = updateMemory(state);
  const visible = state.radar.tanks || [];
  const currentZone = state.arena.safeZone;
  let targetZone = currentZone;
  if (currentZone.nextShrinkTick !== null && currentZone.nextShrinkTick - state.tick <= 18) {
    targetZone = { min: currentZone.nextMin, max: 25 - currentZone.nextMin };
  }

  const pathZone = { min: 0, max: 25 };
  const centerGoals = makeCenterGoals(state, targetZone, visible);
  const centerDistances = makeDistanceMap(state.map, centerGoals, visible, pathZone);
  const target = chooseTarget(state, visible, targetZone, pathZone, memoryState);
  const supply = chooseSupply(state, visible, targetZone, pathZone);
  const opponents = state.opponents;
  const topOpponentLives = opponents.reduce((value, row) => Math.max(value, row.lives), 0);
  const ownScore = state.scoreboard.find(row => row.id === self.id);
  const leading = self.lives > topOpponentLives || state.tick > 430
    && opponents.every(row => self.lives > row.lives
      || self.lives === row.lives && ownScore && ownScore.points >= row.points);

  let objective = { distances: centerDistances, weight: 0.72, intent: 'advance', targetId: '' };
  if (target) {
    let targetValue = target.value;
    if (self.hp === 1 && self.lives <= 1) targetValue -= 1.5;
    if (leading && state.tick > 430) targetValue -= 3.5;
    if (targetValue > 0.15) {
      objective = { distances: target.distances, weight: 1.25, intent: 'pursue', targetId: target.target.id };
    }
  }
  if (supply && supply.value > 0 && (!leading || state.tick < 520)) {
    const supplyScore = supply.value + (supply.type === 'repair' && self.hp === 1 ? 5 : 0);
    const objectiveScore = objective.intent === 'pursue' ? 3.5 - target.travel * 0.2 : -2;
    if (supplyScore > objectiveScore) {
      objective = { distances: supply.distances, weight: 1.7, intent: 'resupply', targetId: '' };
    }
  }

  const actions = candidateMoves(state, visible, pathZone);
  let best = null;
  for (const action of actions) {
    const location = { x: action.x, y: action.y };
    let score = 0;
    const routeDistance = objective.distances[indexOf(action.x, action.y)];
    score -= (routeDistance >= 30000 ? 120 : routeDistance * objective.weight);
    const zoneDistance = distanceToZone(action.x, action.y, targetZone);
    score -= zoneDistance * 24;
    if (action.moved) score += 0.18;
    if (memoryState.stuck > 1 && action.moved && (action.x !== self.x || action.y !== self.y)) {
      score += Math.min(3, memoryState.stuck * 0.45);
    }

    const centerDistance = Math.abs(action.x - 12) + Math.abs(action.y - 12);
    score -= centerDistance * (objective.intent === 'advance' ? 0.05 : 0.015);

    for (const enemy of visible) {
      const gap = distance(location, enemy);
      const closeness = Math.max(0, 5 - gap);
      score -= closeness * (self.hp === 1 ? 1.6 : 0.85);
      if (facingThreat(state, location, [enemy])) score -= self.hp === 1 ? 12 : 6;
      if (action.dir !== self.dir && target && target.target.id === enemy.id
          && rayTouches(state.map, location, action.dir, enemy) > 0) score += 0.65;
    }

    for (const bullet of state.radar.bullets || []) {
      const danger = bulletHitsPosition(state.map, bullet, action.x, action.y);
      if (danger) score -= (danger === 1 ? 16 : 10) * (self.hp === 1 ? 1.8 : 1);
    }

    if (action.move === 'stay' && target && rayTouches(state.map, location, action.dir, target.target) > 0) score += 0.15;
    if (action.move === memoryState.move && action.moved && memoryState.stuck > 2) score -= 0.7;
    if (!best || score > best.score) best = { ...action, score };
  }

  const fire = chooseShot(state, visible);
  memoryState.target = target ? target.target.id : '';
  memoryState.move = best.move;

  let intent = objective.intent;
  if (best.move === 'stay' && !fire) intent = 'hold';
  if (self.hp === 1 && best.move !== 'stay' && !fire) intent = 'retreat';
  return { move: best.move, fire, intent };
}
