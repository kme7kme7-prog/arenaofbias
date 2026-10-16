// Terra Bastion: a synchronous, single-file FFA policy.
// It keeps only terrain/general sightings; every decision remains valid after a cold start.
let mem = null;

function reset(view) {
  const n = view.h * view.w;
  mem = { h: view.h, w: view.w, players: view.players, player: view.player,
    turn: -1, terrain: new Int8Array(n), enemyGenerals: new Map(), ownGeneral: -1 };
}

function state(view) {
  if (!mem || mem.h !== view.h || mem.w !== view.w || mem.players !== view.players ||
      mem.player !== view.player || view.turn <= mem.turn) reset(view);
  mem.turn = view.turn;
  const n = view.h * view.w;
  for (let i = 0; i < n; i++) {
    if (view.visible[i]) {
      if (view.mountains[i]) mem.terrain[i] = -1;
      else mem.terrain[i] = 1;
    }
    if (view.generals[i]) {
      if (view.owned[i]) mem.ownGeneral = i;
      else if (view.opponent[i] && view.owners[i] >= 0) mem.enemyGenerals.set(view.owners[i], i);
    }
  }
  return mem;
}

function step(i, d, v) {
  const r = Math.floor(i / v.w), c = i % v.w;
  if (d === 0) return r ? i - v.w : -1;
  if (d === 1) return r + 1 < v.h ? i + v.w : -1;
  if (d === 2) return c ? i - 1 : -1;
  return c + 1 < v.w ? i + 1 : -1;
}

function dirs(i, v) {
  const a = [];
  for (let d = 0; d < 4; d++) { const j = step(i, d, v); if (j >= 0) a.push([j, d]); }
  return a;
}

function bfs(view, seeds, ownOnly) {
  const n = view.h * view.w, dist = new Int32Array(n), q = new Int32Array(n);
  dist.fill(-1); let head = 0, tail = 0;
  for (let k = 0; k < seeds.length; k++) if (seeds[k] >= 0 && dist[seeds[k]] < 0) {
    dist[seeds[k]] = 0; q[tail++] = seeds[k];
  }
  while (head < tail) {
    const x = q[head++];
    for (const pair of dirs(x, view)) {
      const y = pair[0];
      if (dist[y] >= 0 || view.mountains[y]) continue;
      if (ownOnly && !view.owned[y]) continue;
      dist[y] = dist[x] + 1; q[tail++] = y;
    }
  }
  return dist;
}

function nearestOwnMove(from, dist, view) {
  let best = -1, bestD = dist[from];
  for (const pair of dirs(from, view)) {
    const j = pair[0];
    if (view.owned[j] && dist[j] >= 0 && (bestD < 0 || dist[j] < bestD)) { best = pair[1]; bestD = dist[j]; }
  }
  return best;
}

function action(view) {
  const s = state(view), n = view.h * view.w;
  const owned = [], frontier = [], enemies = [], enemyGens = [];
  let maxOwn = -1, maxArmy = 0;
  for (let i = 0; i < n; i++) {
    if (view.owned[i]) {
      owned.push(i);
      if (view.armies[i] > maxArmy) { maxArmy = view.armies[i]; maxOwn = i; }
      for (const p of dirs(i, view)) if (!view.mountains[p[0]] && !view.owned[p[0]]) { frontier.push(i); break; }
    }
    if (view.opponent[i]) enemies.push(i);
    if (view.generals[i] && view.opponent[i]) enemyGens.push(i);
  }
  if (!owned.length) return null;

  const general = s.ownGeneral >= 0 && view.owned[s.ownGeneral] ? s.ownGeneral : -1;
  if (general >= 0) {
    let danger = 0, attacker = -1;
    for (const p of dirs(general, view)) if (view.opponent[p[0]] && view.armies[p[0]] > danger) { danger = view.armies[p[0]]; attacker = p[0]; }
    if (danger > 0) {
      if (view.armies[general] > danger + 1) {
        for (const p of dirs(general, view)) if (p[0] === attacker) return [Math.floor(general / view.w), general % view.w, p[1], false];
      }
      const home = bfs(view, [general], true);
      let donor = -1, donorDist = 1e9;
      for (const i of owned) if (view.armies[i] > 1 && home[i] > 0 && home[i] < donorDist) { donor = i; donorDist = home[i]; }
      if (donor >= 0) { const d = nearestOwnMove(donor, home, view); if (d >= 0) return [Math.floor(donor / view.w), donor % view.w, d, false]; }
    }
  }

  for (const g of enemyGens) {
    for (const p of dirs(g, view)) {
      const from = p[0];
      if (view.owned[from] && view.armies[from] > view.armies[g] + 1) {
        const d = p[1] === 0 ? 1 : p[1] === 1 ? 0 : p[1] === 2 ? 3 : 2;
        return [Math.floor(from / view.w), from % view.w, d, false];
      }
    }
  }

  let best = null, bestScore = -1e9;
  for (const i of owned) {
    const army = view.armies[i];
    if (army <= 1) continue;
    for (const p of dirs(i, view)) {
      const j = p[0]; if (view.mountains[j] || view.owned[j]) continue;
      const defenders = view.armies[j];
      if (army <= defenders + 1) continue;
      let score = 0;
      if (view.generals[j] && view.opponent[j]) score = 1000000;
      else if (view.opponent[j]) score = 1400 + defenders * 7 + army;
      else if (view.castles[j]) score = army > defenders + 12 ? 700 + army : -500;
      else if (view.neutral[j] || view.fog[j]) score = 160 + Math.min(army, 40);
      if (general === i && army < 8) score -= 180;
      if (score > bestScore) { bestScore = score; best = [i, p[1]]; }
    }
  }
  if (best && bestScore > 0) return [Math.floor(best[0] / view.w), best[0] % view.w, best[1], false];

  const remaining = Number.isInteger(view.maxTurns) ? Math.max(0, view.maxTurns - view.turn) : 1000;
  let targets = enemies.length ? enemies : frontier;
  if (remaining <= 8 && enemyGens.length) targets = enemyGens;
  if (targets.length) {
    const dist = bfs(view, targets, true);
    let source = -1, sourceD = -1;
    for (const i of owned) {
      if (view.armies[i] <= 1 || dist[i] < 1) continue;
      const protectedGeneral = i === general && view.armies[i] < 7;
      if (!protectedGeneral && (source < 0 || view.armies[i] * 3 + dist[i] > view.armies[source] * 3 + sourceD)) { source = i; sourceD = dist[i]; }
    }
    if (source >= 0) { const d = nearestOwnMove(source, dist, view); if (d >= 0) return [Math.floor(source / view.w), source % view.w, d, false]; }
  }

  if (maxOwn >= 0) {
    const toStack = bfs(view, [maxOwn], true);
    let feeder = -1;
    for (const i of owned) if (view.armies[i] > 1 && toStack[i] > 0 && (feeder < 0 || view.armies[i] > view.armies[feeder])) feeder = i;
    if (feeder >= 0) { const d = nearestOwnMove(feeder, toStack, view); if (d >= 0) return [Math.floor(feeder / view.w), feeder % view.w, d, false]; }
  }
  return null;
}

function act(view) {
  try { return action(view); } catch (_) { return null; }
}
