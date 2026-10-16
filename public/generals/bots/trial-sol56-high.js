// 潮汐锋：尺寸无关的迷雾 FFA 策略。
// 每局 Worker 会重建；首次观察也可能是中盘或预设残局。
const DR = [-1, 1, 0, 0];
const DC = [0, 0, -1, 1];
let memory = null;

function reset(v) {
  const n = v.h * v.w;
  memory = {
    h: v.h, w: v.w, players: v.players, player: v.player, turn: -1,
    terrain: new Int8Array(n),
    lastOwner: new Int16Array(n).fill(-3),
    lastArmy: new Int32Array(n),
    seenAt: new Int32Array(n).fill(-1),
    generals: new Int32Array(v.players).fill(-1),
    recent: []
  };
}

function update(v) {
  if (!memory || memory.h !== v.h || memory.w !== v.w ||
      memory.players !== v.players || memory.player !== v.player || v.turn <= memory.turn) reset(v);
  memory.turn = v.turn;
  const n = v.h * v.w;
  for (let i = 0; i < n; i++) {
    if (v.visible[i]) {
      memory.lastOwner[i] = v.owners[i];
      memory.lastArmy[i] = v.armies[i];
      memory.seenAt[i] = v.turn;
      memory.terrain[i] = v.mountains[i] ? -1 : 1;
      if (v.generals[i] && v.owners[i] >= 0) memory.generals[v.owners[i]] = i;
    }
  }
  for (let p = 0; p < v.players; p++) {
    const g = memory.generals[p];
    if (p !== v.player && g >= 0 && v.visible[g] && (!v.generals[g] || v.owners[g] !== p)) memory.generals[p] = -1;
  }
  memory.recent = memory.recent.filter(e => e.until >= v.turn);
}

function adjacent(i, v, out) {
  out.length = 0;
  const r = (i / v.w) | 0, c = i % v.w;
  if (r > 0) out.push([i - v.w, 0]);
  if (r + 1 < v.h) out.push([i + v.w, 1]);
  if (c > 0) out.push([i - 1, 2]);
  if (c + 1 < v.w) out.push([i + 1, 3]);
  return out;
}

function direction(a, b, w) {
  if (b === a - w) return 0;
  if (b === a + w) return 1;
  if (b === a - 1) return 2;
  if (b === a + 1) return 3;
  return -1;
}

function action(from, to, v, split) {
  const d = direction(from, to, v.w);
  return d < 0 ? null : [(from / v.w) | 0, from % v.w, d, !!split];
}

function traversable(i, v, force) {
  if (v.mountains[i] || memory.terrain[i] < 0) return false;
  // Do not route a stack through a defender it cannot beat. Treating a valuable
  // city as ordinary path terrain caused repeated small attacks into its garrison.
  if (v.visible[i] && !v.owned[i] && v.armies[i] >= force) return false;
  if (v.structures_in_fog[i] && memory.terrain[i] === 0 && force < 56) return false;
  return true;
}

function route(v, start, value, force) {
  const n = v.h * v.w;
  const q = new Int32Array(n), dist = new Int16Array(n), first = new Int32Array(n);
  dist.fill(-1); first.fill(-1);
  let head = 0, tail = 0, best = -1, bestScore = -1e30;
  q[tail++] = start; dist[start] = 0;
  const ns = [];
  const depthLimit = Math.min(80, v.h + v.w + 8);
  while (head < tail) {
    const x = q[head++], d = dist[x];
    if (x !== start && value[x] > -1e20) {
      const score = value[x] - d * 4.2;
      if (score > bestScore) { bestScore = score; best = x; }
    }
    if (d >= depthLimit) continue;
    adjacent(x, v, ns);
    for (const [y] of ns) {
      if (dist[y] >= 0 || !traversable(y, v, force)) continue;
      dist[y] = d + 1;
      first[y] = x === start ? y : first[x];
      q[tail++] = y;
    }
  }
  return best >= 0 ? { target: best, step: first[best], dist: dist[best], score: bestScore } : null;
}

function ownedDistances(v, seeds) {
  const n = v.h * v.w, q = new Int32Array(n), dist = new Int16Array(n);
  dist.fill(-1);
  let head = 0, tail = 0;
  for (const s of seeds) if (s >= 0 && dist[s] < 0) { dist[s] = 0; q[tail++] = s; }
  const ns = [];
  while (head < tail) {
    const x = q[head++];
    adjacent(x, v, ns);
    for (const [y] of ns) if (dist[y] < 0 && v.owned[y]) { dist[y] = dist[x] + 1; q[tail++] = y; }
  }
  return dist;
}

function stepDownDistance(from, dist, v) {
  const ns = []; let best = -1, bd = dist[from];
  adjacent(from, v, ns);
  for (const [y] of ns) if (v.owned[y] && dist[y] >= 0 && (bd < 0 || dist[y] < bd)) { bd = dist[y]; best = y; }
  return best;
}

function manhattan(a, b, w) {
  return Math.abs(((a / w) | 0) - ((b / w) | 0)) + Math.abs(a % w - b % w);
}

function frontierWeight(i, v) {
  const ns = []; let value = 0;
  adjacent(i, v, ns);
  for (const [y] of ns) {
    if (v.mountains[y] || v.owned[y]) continue;
    if (v.generals[y] && v.opponent[y]) value = Math.max(value, 10000);
    else if (v.opponent[y]) value = Math.max(value, 160 + Math.min(80, v.armies[y]));
    else if (v.castles[y]) value = Math.max(value, 95);
    else if (v.fog[y] && !v.structures_in_fog[y]) value = Math.max(value, 48);
    else if (v.neutral[y]) value = Math.max(value, 58);
  }
  return value;
}

function solve(v) {
  update(v);
  const n = v.h * v.w, ns = [], mine = [], enemies = [], frontiers = [];
  let myGeneral = memory.generals[v.player];
  for (let i = 0; i < n; i++) {
    if (v.owned[i]) {
      mine.push(i);
      if (v.generals[i]) myGeneral = memory.generals[v.player] = i;
    }
    if (v.opponent[i]) enemies.push(i);
  }
  if (!mine.length) return null;
  for (const i of mine) if (frontierWeight(i, v) > 0) frontiers.push(i);
  const remaining = Number.isInteger(v.maxTurns) ? Math.max(0, v.maxTurns - v.turn) : 999999;

  let kill = null, killMargin = -1;
  for (const s of mine) if (v.armies[s] > 1) {
    adjacent(s, v, ns);
    for (const [t] of ns) if (v.opponent[t] && v.generals[t] && v.armies[s] - 1 > v.armies[t]) {
      const margin = v.armies[s] - 1 - v.armies[t];
      if (margin > killMargin) { killMargin = margin; kill = action(s, t, v, false); }
    }
  }
  if (kill) return kill;

  if (myGeneral >= 0 && v.owned[myGeneral]) {
    let attacker = -1, threat = 0;
    adjacent(myGeneral, v, ns);
    for (const [t] of ns) if (v.opponent[t] && v.armies[t] > threat) { attacker = t; threat = v.armies[t]; }
    if (attacker >= 0) {
      if (v.armies[myGeneral] - 1 > threat) return action(myGeneral, attacker, v, false);
      for (const s of mine) if (s !== myGeneral && v.armies[s] - 1 > threat) {
        adjacent(s, v, ns);
        if (ns.some(p => p[0] === attacker)) return action(s, attacker, v, false);
      }
      const home = ownedDistances(v, [myGeneral]);
      let donor = -1, merit = -1e30;
      for (const s of mine) if (s !== myGeneral && v.armies[s] > 1 && home[s] > 0) {
        const m = v.armies[s] * 6 - home[s] * 4;
        if (m > merit) { merit = m; donor = s; }
      }
      if (donor >= 0) {
        const next = stepDownDistance(donor, home, v);
        if (next >= 0) return action(donor, next, v, false);
      }
    }
  }

  let closeThreat = 0;
  if (myGeneral >= 0 && v.owned[myGeneral]) {
    for (const e of enemies) {
      const d = manhattan(myGeneral, e, v.w);
      if (d <= 5) closeThreat = Math.max(closeThreat, v.armies[e] + Math.max(0, 6 - d) * 2);
    }
  }
  const avgEnemy = v.players > 1 ? v.enemy_army / (v.players - 1) : 0;
  // With no nearby contact, early general growth must be converted into land rather
  // than idled behind a peacetime garrison. Visible approach still overrides this.
  let generalReserve = v.turn < 50 ? 1 : v.turn < 120 ? 5 : Math.min(36, 10 + (v.turn / 100 | 0));
  generalReserve = Math.max(generalReserve, closeThreat + 2, Math.min(36, Math.ceil(avgEnemy * 0.045)));
  if (remaining <= 3) generalReserve = Math.min(generalReserve, 5);

  const value = new Float64Array(n); value.fill(-1e30);
  for (let i = 0; i < n; i++) {
    if (v.generals[i] && v.opponent[i]) value[i] = 30000;
    else if (v.opponent[i]) value[i] = 310 + Math.min(120, v.armies[i] * 1.5);
    else if (v.castles[i] && !v.owned[i]) value[i] = v.armies[i] <= 52 ? 145 : 85;
    else if (v.neutral[i] && !v.castles[i]) value[i] = 68;
    else if (v.fog[i] && !v.structures_in_fog[i]) value[i] = remaining <= 12 ? 18 : 54;
    const owner = memory.lastOwner[i];
    if (!v.visible[i] && owner >= 0 && owner !== v.player) {
      const age = v.turn - memory.seenAt[i];
      value[i] = Math.max(value[i], 175 - Math.min(130, age * 2));
    }
  }
  for (let p = 0; p < v.players; p++) if (p !== v.player && memory.generals[p] >= 0) {
    value[memory.generals[p]] = Math.max(value[memory.generals[p]], 22000);
  }

  let sources = mine.filter(i => v.armies[i] > 1);
  if (!sources.length) return null;
  sources.sort((a, b) => v.armies[b] - v.armies[a]);
  const cap = Math.min(sources.length, n > 4096 ? 9 : 24);
  const selected = sources.slice(0, cap);
  for (const s of frontiers) if (v.armies[s] > 1 && !selected.includes(s) && selected.length < cap + 10) selected.push(s);
  let best = null, bestMerit = -1e30;
  function offer(from, to, split, merit) {
    if (to < 0) return;
    if (memory.recent.some(e => e.from === to && e.to === from)) merit -= 135;
    if (memory.recent.some(e => e.from === from && e.to === to)) merit -= 8;
    if (merit > bestMerit) { bestMerit = merit; best = { from, to, split }; }
  }

  for (const s of selected) {
    const army = v.armies[s], isGeneral = s === myGeneral;
    if (isGeneral && army <= generalReserve) continue;
    adjacent(s, v, ns);
    for (const [t] of ns) {
      if (!traversable(t, v, army - 1)) continue;
      if (v.owned[t]) {
        const fw = frontierWeight(t, v);
        if (fw > 0 && v.armies[t] <= army + 3 && !isGeneral) offer(s, t, false, fw * 0.45 + Math.log2(army) * 4);
        continue;
      }
      const defense = v.visible[t] ? v.armies[t] : (v.structures_in_fog[t] ? 50 : 0);
      let split = false, sent = army - 1;
      if (isGeneral) { split = true; sent = Math.floor(army / 2); }
      if (sent <= defense || (isGeneral && army - sent < generalReserve)) continue;
      let merit = value[t] + Math.min(70, sent - defense) * 0.45 + Math.log2(army) * 4;
      if (v.generals[t]) merit += 5000;
      if (remaining <= 3 && !v.generals[t] && !v.opponent[t]) merit -= 120;
      offer(s, t, split, merit);
    }
    const path = route(v, s, value, army - 1);
    if (path && path.step >= 0) {
      let split = false;
      if (isGeneral) {
        split = true;
        if (Math.floor(army / 2) < generalReserve) continue;
      }
      const sent = split ? Math.floor(army / 2) : army - 1;
      if (!v.owned[path.step] && v.visible[path.step] && sent <= v.armies[path.step]) continue;
      let merit = path.score + Math.log2(army) * 5 - (isGeneral ? 35 : 0);
      if (remaining <= path.dist && value[path.target] < 1000) merit -= 150;
      offer(s, path.step, split, merit);
    }
  }

  if (best) {
    memory.recent.push({ from: best.from, to: best.to, until: v.turn + 10 });
    if (memory.recent.length > 28) memory.recent.shift();
    return action(best.from, best.to, v, best.split);
  }

  if (frontiers.length) {
    const dist = ownedDistances(v, frontiers);
    let donor = -1, donorMerit = -1e30;
    for (const s of sources) if (dist[s] > 0 && s !== myGeneral) {
      const m = v.armies[s] * 5 - dist[s] * 3;
      if (m > donorMerit) { donorMerit = m; donor = s; }
    }
    if (donor >= 0) {
      const next = stepDownDistance(donor, dist, v);
      if (next >= 0) return action(donor, next, v, false);
    }
  }
  return null;
}

function act(view) {
  try { return solve(view); } catch (_) { return null; }
}
