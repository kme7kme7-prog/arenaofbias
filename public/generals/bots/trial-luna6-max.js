const DR = [-1, 1, 0, 0];
const DC = [0, 0, -1, 1];
let memory = null;

function resetMemory(v) {
  const n = v.h * v.w;
  memory = {
    h: v.h, w: v.w, players: v.players, player: v.player, turn: -1,
    terrain: new Int8Array(n), lastOwner: new Int16Array(n).fill(-3),
    age: new Uint16Array(n), enemyGenerals: new Int32Array(v.players).fill(-1),
    ownGeneral: -1, recent: []
  };
}

function updateMemory(v) {
  if (!memory || memory.h !== v.h || memory.w !== v.w || memory.players !== v.players ||
      memory.player !== v.player || v.turn <= memory.turn) resetMemory(v);
  memory.turn = v.turn;
  const n = v.h * v.w;
  for (let i = 0; i < n; i++) {
    if (v.visible[i]) {
      memory.age[i] = 0;
      memory.lastOwner[i] = v.owners[i];
      memory.terrain[i] = v.mountains[i] ? -1 : (v.castles[i] ? 2 : 1);
      if (v.generals[i] && v.owners[i] >= 0) {
        if (v.owners[i] === v.player) memory.ownGeneral = i;
        else memory.enemyGenerals[v.owners[i]] = i;
      }
    } else if (memory.age[i] < 65535) memory.age[i]++;
  }
  for (let p = 0; p < v.players; p++) {
    const g = memory.enemyGenerals[p];
    if (p !== v.player && g >= 0 && v.visible[g] && !v.generals[g] && v.owners[g] !== p)
      memory.enemyGenerals[p] = -1;
  }
  memory.recent = memory.recent.filter(e => e.until >= v.turn);
  return memory;
}

function neighbor(i, d, v) {
  const r = (i / v.w) | 0, c = i % v.w;
  if (d === 0) return r > 0 ? i - v.w : -1;
  if (d === 1) return r + 1 < v.h ? i + v.w : -1;
  if (d === 2) return c > 0 ? i - 1 : -1;
  return c + 1 < v.w ? i + 1 : -1;
}

function directionBetween(a, b, w) {
  if (b === a - w) return 0;
  if (b === a + w) return 1;
  if (b === a - 1) return 2;
  if (b === a + 1) return 3;
  return -1;
}

function isMountain(v, i) {
  return !!v.mountains[i] || memory.terrain[i] === -1;
}

function makePotential(v, gen) {
  const n = v.h * v.w;
  const base = new Float64Array(n);
  const hard = new Uint8Array(n);
  const potential = new Float64Array(n);
  const nextDir = new Int8Array(n).fill(-1);
  potential.fill(-1e9);
  const remaining = Number.isInteger(v.maxTurns) ? Math.max(0, v.maxTurns - v.turn) : 1000;

  for (let i = 0; i < n; i++) {
    if (v.owned[i] || isMountain(v, i)) continue;
    if (v.visible[i]) {
      if (v.opponent[i]) {
        base[i] = v.generals[i] ? (remaining <= 24 ? 1350 : 1120) : 225 + Math.min(45, (v.armies[i] || 0) * 0.3);
        hard[i] = 1;
      } else if (v.castles[i]) {
        base[i] = remaining <= 24 ? 150 : 275;
        hard[i] = 1;
      } else if (v.neutral[i]) base[i] = 82;
    } else if (v.fog[i] && !v.structures_in_fog[i]) {
      base[i] = 48;
    } else if (memory.terrain[i] === 2 && memory.lastOwner[i] !== v.player) {
      base[i] = 175;
      hard[i] = 1;
    }
  }

  for (let p = 0; p < v.players; p++) {
    if (p === v.player) continue;
    const g = memory.enemyGenerals[p];
    if (g >= 0 && !v.owned[g] && !isMountain(v, g)) {
      base[g] = Math.max(base[g], remaining <= 24 ? 1000 : 760);
      hard[g] = 1;
    }
  }

  let heapIndex = new Int32Array(Math.max(64, n * 2));
  let heapValue = new Float64Array(heapIndex.length);
  let heapSize = 0, poppedValue = 0;
  function push(index, value) {
    if (heapSize === heapIndex.length) {
      const ni = new Int32Array(heapIndex.length * 2), nv = new Float64Array(heapValue.length * 2);
      ni.set(heapIndex); nv.set(heapValue); heapIndex = ni; heapValue = nv;
    }
    let k = heapSize++;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (heapValue[parent] >= value) break;
      heapIndex[k] = heapIndex[parent]; heapValue[k] = heapValue[parent]; k = parent;
    }
    heapIndex[k] = index; heapValue[k] = value;
  }
  function pop() {
    const result = heapIndex[0];
    poppedValue = heapValue[0];
    const lastIndex = heapIndex[--heapSize], lastValue = heapValue[heapSize];
    if (heapSize) {
      let k = 0;
      while (true) {
        const left = k * 2 + 1;
        if (left >= heapSize) break;
        const right = left + 1;
        const child = right < heapSize && heapValue[right] > heapValue[left] ? right : left;
        if (heapValue[child] <= lastValue) break;
        heapIndex[k] = heapIndex[child]; heapValue[k] = heapValue[child]; k = child;
      }
      heapIndex[k] = lastIndex; heapValue[k] = lastValue;
    }
    return result;
  }

  for (let i = 0; i < n; i++) {
    if (base[i] > 0) {
      potential[i] = base[i];
      push(i, base[i]);
    }
  }
  while (heapSize) {
    const i = pop(), value = poppedValue;
    if (value + 1e-7 < potential[i]) continue;
    for (let d = 0; d < 4; d++) {
      const j = neighbor(i, d, v);
      if (j < 0 || isMountain(v, j) || (hard[j] && j !== i)) continue;
      if (v.structures_in_fog[j] && memory.terrain[j] === 0) continue;
      if (hard[j]) continue;
      const candidate = value - 7;
      if (candidate <= potential[j] + 1e-7) continue;
      potential[j] = candidate;
      nextDir[j] = d === 0 ? 1 : d === 1 ? 0 : d === 2 ? 3 : 2;
      push(j, candidate);
    }
  }
  return { base, potential, nextDir };
}

function ownedRoutes(v, start) {
  const n = v.h * v.w;
  const dist = new Int32Array(n).fill(-1);
  const nextDir = new Int8Array(n).fill(-1);
  if (start < 0 || !v.owned[start]) return { dist, nextDir };
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  queue[tail++] = start;
  dist[start] = 0;
  while (head < tail) {
    const i = queue[head++];
    for (let d = 0; d < 4; d++) {
      const j = neighbor(i, d, v);
      if (j < 0 || !v.owned[j] || dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      nextDir[j] = d === 0 ? 1 : d === 1 ? 0 : d === 2 ? 3 : 2;
      queue[tail++] = j;
    }
  }
  return { dist, nextDir };
}

function act(v) {
  const mem = updateMemory(v);
  const n = v.h * v.w;
  let gen = -1;
  for (let i = 0; i < n; i++) if (v.generals[i] && v.owned[i]) { gen = i; mem.ownGeneral = i; break; }
  if (gen < 0 && mem.ownGeneral >= 0 && v.owned[mem.ownGeneral]) gen = mem.ownGeneral;

  let danger = 0, guardDemand = v.turn < 16 ? 3 : (v.turn < 40 ? 8 : (v.turn < 80 ? 16 : 24));
  guardDemand = Math.max(guardDemand, Math.ceil((v.enemy_army || 0) / (Math.max(1, v.players - 1) * 10)));
  let guardDistance = 1e9, nearestEnemy = 1e9;
  if (gen >= 0) {
    const gr = (gen / v.w) | 0, gc = gen % v.w;
    for (let i = 0; i < n; i++) {
      if (!v.opponent[i]) continue;
      const distance = Math.abs(((i / v.w) | 0) - gr) + Math.abs((i % v.w) - gc);
      if (distance <= 1) danger += Math.max(0, v.armies[i] - 1);
      if (distance <= 5) {
        nearestEnemy = Math.min(nearestEnemy, distance);
        const desired = distance <= 2 ? v.armies[i] + 2 :
          distance === 3 ? Math.ceil(v.armies[i] * 0.9) + 2 : Math.ceil(v.armies[i] * 0.65) + 2;
        if (desired > guardDemand) { guardDemand = desired; guardDistance = distance; }
      }
    }
  }
  const reserve = Math.min(60, guardDemand);

  const urgentDefense = gen >= 0 && danger > 0 &&
    (danger >= v.armies[gen] || v.armies[gen] - danger < reserve);
  const proactiveDefense = gen >= 0 && guardDistance <= 5 && v.armies[gen] < reserve;
  if (urgentDefense || proactiveDefense) {
    const routes = ownedRoutes(v, gen);
    let donor = -1, donorScore = -1e9;
    for (let i = 0; i < n; i++) {
      if (i === gen || !v.owned[i] || v.armies[i] <= 1 || routes.dist[i] <= 0) continue;
      const distance = routes.dist[i];
      const score = v.armies[i] - distance * (urgentDefense ? 1 : 2.5) + (urgentDefense && distance === 1 ? 50 : 0);
      if (score > donorScore) { donor = i; donorScore = score; }
    }
    if (donor >= 0) {
      const d = routes.nextDir[donor];
      return finish([((donor / v.w) | 0), donor % v.w, d, false], donor, neighbor(donor, d, v), v.turn);
    }
    let target = -1, targetArmy = 0;
    for (let d = 0; d < 4; d++) {
      const j = neighbor(gen, d, v);
      if (j >= 0 && v.opponent[j] && v.armies[j] > targetArmy) { target = j; targetArmy = v.armies[j]; }
    }
    if (target >= 0 && v.armies[gen] - 1 > targetArmy) {
      const d = directionBetween(gen, target, v.w);
      return finish([((gen / v.w) | 0), gen % v.w, d, false], gen, target, v.turn);
    }
  }

  const field = makePotential(v, gen);
  let best = null;
  function offer(src, dst, d, split, score) {
    if (score <= -1e8) return;
    for (let k = 0; k < mem.recent.length; k++) {
      const e = mem.recent[k];
      if (e.src === dst && e.dst === src) score -= 52;
    }
    if (!best || score > best.score) best = { src, dst, d, split, score };
  }

  for (let s = 0; s < n; s++) {
    if (!v.owned[s] || v.armies[s] <= 1) continue;
    const army = v.armies[s], isGen = s === gen;
    for (let d = 0; d < 4; d++) {
      const t = neighbor(s, d, v);
      if (t < 0 || isMountain(v, t)) continue;

      if (v.owned[t]) {
        const progress = field.potential[t] - field.potential[s];
        if (progress > 0.1) {
          let split = false;
          if (isGen) {
            const sent = Math.floor(army / 2);
            if (army - sent < reserve || sent < 1) continue;
            split = true;
          }
          const growth = (t === gen || v.castles[t] || memory.terrain[t] === 2) ? 8 : 0;
          const score = field.potential[t] + Math.min(12, Math.log2(army + 1) * 2) + growth - (isGen ? 4 : 0);
          offer(s, t, d, split, score);
        }
        continue;
      }

      let defense = 0;
      if (v.visible[t]) defense = v.armies[t] || 0;
      if (v.visible[t] && v.owners[t] === -2) continue;
      if (v.structures_in_fog[t] && memory.terrain[t] !== 2) continue;

      const halfSent = Math.floor(army / 2);
      const fullSent = army - 1;
      let split = false, sent = 0;
      if (isGen) {
        if (halfSent > defense && army - halfSent >= reserve) {
          split = true; sent = halfSent;
        } else if (v.generals[t] && fullSent > defense &&
                   Number.isInteger(v.maxTurns) && v.maxTurns - v.turn <= 3) {
          split = false; sent = fullSent;
        } else continue;
        if (danger >= army - reserve) continue;
      } else if (fullSent > defense) {
        split = false; sent = fullSent;
      } else continue;

      const targetValue = Math.max(field.base[t], field.potential[t]);
      if (targetValue <= -1e8) continue;
      let bonus = 7;
      if (v.generals[t] && v.opponent[t]) bonus += 220;
      else if (v.castles[t]) bonus += 32;
      else if (v.opponent[t]) bonus += 20;
      const survivors = sent - defense;
      const force = Math.min(14, Math.log2(survivors + 1) * 2) + Math.min(8, survivors * 0.05);
      let score = targetValue + bonus + force;
      if (isGen) score -= 4;
      if (gen >= 0 && s !== gen && Math.abs(((s / v.w) | 0) - ((gen / v.w) | 0)) + Math.abs((s % v.w) - (gen % v.w)) === 1 && danger > 0)
        score -= 24;
      offer(s, t, d, split, score);
    }
  }

  if (!best) {
    const routes = ownedRoutes(v, gen);
    let donor = -1, donorScore = -1e9;
    for (let i = 0; i < n; i++) {
      if (!v.owned[i] || v.armies[i] <= 1 || (i === gen) || routes.dist[i] <= 0) continue;
      const score = v.armies[i] - routes.dist[i] * 2;
      if (score > donorScore) { donor = i; donorScore = score; }
    }
    if (donor >= 0) {
      const d = routes.nextDir[donor];
      return finish([((donor / v.w) | 0), donor % v.w, d, false], donor, neighbor(donor, d, v), v.turn);
    }
    return null;
  }
  return finish([((best.src / v.w) | 0), best.src % v.w, best.d, best.split], best.src, best.dst, v.turn);
}

function finish(action, src, dst, turn) {
  if (memory && src >= 0 && dst >= 0) {
    memory.recent.push({ src, dst, until: turn + 7 });
    if (memory.recent.length > 24) memory.recent.shift();
  }
  return action;
}
