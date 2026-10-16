const NAME = "Blitz 闪电战";
const DESC = "ALL-IN 攻势流：卫兵只留 12，见到敌将全军冲锋。";

const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
const GARRISON = 12;

function act(view) {
  const { h, w, armies, owned } = view;
  const blocked = view.mountains.map((m, i) => m || (view.structures_in_fog[i] && !view.castles[i]));
  const idx = i => view.owned[i] && view.armies[i] > 1;

  const score = new Float32Array(h * w);
  for (let i = 0; i < h * w; i++) {
    if (view.neutral[i] && !blocked[i]) score[i] = 10;
    else if (view.opponent[i]) score[i] = 20;
    if (view.castles[i]) score[i] = Math.max(score[i], 46);
    if (view.generals[i] && view.opponent[i]) score[i] = 1200;
    else if (view.fog[i] && score[i] === 0) score[i] = 7;
  }

  const myGen = view.generals.map((g, i) => g && owned[i]);
  let srcs = [];
  for (let i = 0; i < h * w; i++) {
    if (!idx(i)) continue;
    if (myGen[i] && armies[i] < GARRISON) continue;
    srcs.push(i);
  }
  if (!srcs.length) return null;
  srcs.sort((a, b) => armies[b] - armies[a]);
  srcs = srcs.slice(0, 4);

  let best = null;
  for (const s of srcs) {
    const r = (s / w) | 0, c = s % w;
    const can = canTake(view, armies[s] - 1, h, w);   // 打不过的格子别去（撞城送死警告）
    const { dist, parent } = bfs(r, c, blocked, h, w);
    let t = -1, tg = 0;
    for (let i = 0; i < h * w; i++) {
      if (dist[i] > 0 && score[i] > 0 && can[i]) {
        const g = score[i] / (dist[i] + 1);
        if (g > tg) { tg = g; t = i; }
      }
    }
    if (t < 0) continue;
    const d = firstStep(t, s, parent, w);
    if (d < 0) continue;
    const benefit = tg - (myGen[s] ? 2 : 0);
    if (!best || benefit > best[0]) best = [benefit, r, c, d];
  }
  return best ? [best[1], best[2], best[3], false] : null;
}

function canTake(view, srcArmy, h, w) {
  const can = new Uint8Array(h * w);
  for (let i = 0; i < h * w; i++) {
    if (view.fog[i]) can[i] = view.structures_in_fog[i] ? (srcArmy > 50 ? 1 : 0) : 1;
    else can[i] = view.armies[i] < srcArmy ? 1 : 0;
    if (view.mountains[i]) can[i] = 0;
  }
  return can;
}

function bfs(r, c, blocked, h, w) {
  const dist = new Int16Array(h * w).fill(-1);
  const parent = new Int32Array(h * w).fill(-1);
  const start = r * w + c;
  dist[start] = 0;
  let frontier = [start], d = 0;
  while (frontier.length && d < 60) {
    d++;
    const nxt = [];
    for (const cur of frontier) {
      const cr = (cur / w) | 0, cc = cur % w;
      for (const [dr, dc] of DIRS) {
        const nr = cr + dr, nc = cc + dc;
        if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
        const ni = nr * w + nc;
        if (dist[ni] < 0 && !blocked[ni]) { dist[ni] = d; parent[ni] = cur; nxt.push(ni); }
      }
    }
    frontier = nxt;
  }
  return { dist, parent };
}

function firstStep(t, start, parent, w) {
  let cur = t;
  while (parent[cur] !== start) {
    if (parent[cur] < 0) return -1;
    cur = parent[cur];
  }
  const sr = (cur / w) | 0, sc = cur % w;
  const gr = (start / w) | 0, gc = start % w;
  for (let d = 0; d < 4; d++) if (DIRS[d][0] === sr - gr && DIRS[d][1] === sc - gc) return d;
  return -1;
}
