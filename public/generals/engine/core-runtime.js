/**
 * 蛐蛐游乐场 · 将军棋引擎（JS 版）
 *
 * AOB Generals FFA 1.0.0. 规则参照本地 strakam/generals-bots 2.6.0，
 * 固定 general_trade=false；地图生成独立。见 RULES.md 和 LICENSE-JAX.txt。
 * - 涨兵：将军/城市每 2 tick（偶数 tick）+1；全部领地每 50 tick +1
 * - 战斗：兵多者胜，目标格剩 |差值|；将军被占 → 全部领土转移、兵力减半(向上取整)、将军变城
 * - 出兵：split=半军(floor)，否则倾巢(留1)；1 兵格可"移动"但无兵可带
 * - 地图：可通行区域连通；城市由邻接空地的山雕刻；出生距离按可放置性逐级放宽
 *
 * 浏览器 / Node 通用（无依赖）。
 */
(function (global) {
  "use strict";

  // ---------------- 随机数（可复现） ----------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------- 地图生成 ----------------
  // owner: -2 山, -1 中立(含城), 0..n-1 玩家
  function generateMap(n, size, rng) {
    const H = size, W = size;
    const owner = new Int8Array(H * W).fill(-1);
    const isCity = new Uint8Array(H * W);
    const isGeneral = new Uint8Array(H * W);

    // 1. 随机撒山
    const density = 0.18 + rng() * 0.08;
    for (let i = 0; i < H * W; i++) if (rng() < density) owner[i] = -2;

    // 2. 连通性：把非最大连通块的空地封成山（不留死盆地）
    const largest = largestRegion(owner, H, W);
    for (let i = 0; i < H * W; i++)
      if (owner[i] === -1 && !largest.has(i)) owner[i] = -2;

    // 3. 从山里雕出 9~11 座城（守军 40~50）
    const nCities = 9 + Math.floor(rng() * 3);
    const mountainIdx = [];
    for (let i = 0; i < H * W; i++) if (owner[i] === -2) {
      const r = Math.floor(i / W), c = i % W;
      if ([[-1,0],[1,0],[0,-1],[0,1]].some(([dr,dc]) => {
        const nr=r+dr, nc=c+dc;
        return nr>=0 && nr<H && nc>=0 && nc<W && largest.has(nr*W+nc);
      })) mountainIdx.push(i);
    }
    shuffle(mountainIdx, rng);
    for (let k = 0; k < Math.min(nCities, mountainIdx.length); k++) {
      const i = mountainIdx[k];
      owner[i] = -1; isCity[i] = 1;
    }

    // 4. 将军：空地上选 n 个，两两 BFS 距离 >= minDist（放不下就逐步放宽）
    const passable = i => owner[i] !== -2;
    for (const minDist of [Math.max(4, Math.floor(size*.6)), 4, 3, 2, 1]) {
      const spots = [];
      for (let i = 0; i < H * W; i++) if (owner[i] === -1 && !isCity[i]) spots.push(i);
      shuffle(spots, rng);
      const chosen = [];
      for (const s of spots) {
        if (chosen.length >= n) break;
        let ok = true;
        for (const c of chosen) {
          if (bfsDist(c, s, passable, H, W) < minDist) { ok = false; break; }
        }
        if (ok) chosen.push(s);
      }
      if (chosen.length === n) {
        chosen.forEach((s, p) => { owner[s] = p; isGeneral[s] = 1; });
        break;
      }
    }
    if (isGeneral.reduce((a,b)=>a+b,0) !== n) throw new Error("地图无法放置全部将军，请更换种子");
    return { owner, isCity, isGeneral, H, W };
  }

  function largestRegion(owner, H, W) {
    const seen = new Uint8Array(H * W);
    let best = new Set();
    for (let s = 0; s < H * W; s++) {
      if (owner[s] !== -1 || seen[s]) continue;
      const region = new Set([s]);
      const q = [s]; seen[s] = 1;
      while (q.length) {
        const cur = q.pop(), cr = (cur / W) | 0, cc = cur % W;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
          const ni = nr * W + nc;
          if (!seen[ni] && owner[ni] === -1) { seen[ni] = 1; region.add(ni); q.push(ni); }
        }
      }
      if (region.size > best.size) best = region;
    }
    return best;
  }

  function bfsDist(from, to, passable, H, W) {
    if (!passable(to)) return Infinity;
    const dist = new Int16Array(H * W).fill(-1);
    dist[from] = 0;
    const q = [from];
    while (q.length) {
      const cur = q.shift();
      if (cur === to) return dist[cur];
      const cr = (cur / W) | 0, cc = cur % W;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = cr + dr, nc = cc + dc;
        if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
        const ni = nr * W + nc;
        if (dist[ni] < 0 && passable(ni)) { dist[ni] = dist[cur] + 1; q.push(ni); }
      }
    }
    return Infinity;
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ---------------- 对局 ----------------
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 上 下 左 右

  function createGame({ n=4, size=18, seed=1, maxTurns=1200 } = {}) {
    if (!Number.isInteger(n) || n<2 || n>4) throw new Error("参赛人数必须为2–4");
    if (!Number.isInteger(size) || size<8 || size>26) throw new Error("地图边长必须为8–26");
    if (!Number.isInteger(seed) || seed<0 || seed>0xffffffff) throw new Error("种子必须为0–4294967295整数");
    if (!Number.isInteger(maxTurns) || maxTurns<1 || maxTurns>5000) throw new Error("回合上限必须为1–5000");
    const rng = mulberry32(seed >>> 0);
    const map = generateMap(n, size, rng);
    const H = map.H, W = map.W, N = n;

    const state = {
      H, W, N,
      owner: map.owner,            // Int8Array
      army: new Int32Array(H * W),
      isCity: map.isCity,
      isGeneral: map.isGeneral,
      eliminated: new Array(N).fill(false),
      time: 0,
      winner: -1,
      done: false,
      reason: null,
      seed,
      events: [],
      maxTurns: maxTurns || 1200,
    };
    for (let i = 0; i < H * W; i++) {
      if (state.isCity[i]) state.army[i] = 40 + Math.floor(rng() * 11);
      else if (state.isGeneral[i]) state.army[i] = 1;
    }
    state.initialTerrain = terrainMeta(state);
    return state;
  }

  // 执行一个 tick：结算所有移动 → 时间+1 → 涨兵
  function tick(state, actions) {
    if (state.done || state.winner >= 0) return state;
    if (!Array.isArray(actions) || actions.length !== state.N) throw new Error("每个席位需要一个动作");
    state.events = [];
    const safe = actions.map(a=>actionError(a, state) ? null : a);
    const order = moveOrder(state, safe);
    for (const p of order) applyMove(state, p, safe[p]);
    state.time++;
    const alive = state.eliminated.map((v,i)=>v ? -1 : i).filter(i=>i>=0);
    if (alive.length===1) state.winner=alive[0];
    if (state.winner < 0 && alive.length>0) income(state);
    state.done = state.winner>=0 || alive.length===0 || state.time>=state.maxTurns;
    if (state.done) state.reason=state.winner>=0 ? "last-standing" : alive.length===0 ? "all-forfeit" : "turn-limit";
    return state;
  }

  function actionError(a, s) {
    if (a === null) return null;
    if (!Array.isArray(a) || a.length!==4) return "返回值必须是null或四元素数组";
    if (!a.slice(0,3).every(Number.isInteger)) return "行、列和方向必须为整数";
    if (a[0]<0 || a[0]>=s.H || a[1]<0 || a[1]>=s.W || a[2]<0 || a[2]>3) return "动作坐标或方向越界";
    if (typeof a[3]!=="boolean") return "半军字段必须是boolean";
    return null;
  }

  // generals.io 移动排序：防守优先 → 非攻将优先 → 大兵优先 → 玩家序(奇数tick反转)
  function moveOrder(state, actions) {
    const N = state.N, W = state.W;
    const idx = Array.from({ length: N }, (_, i) => i);
    const key = i => {
      const a = actions[i];
      if (!a) return [1, 1, 1, 0, state.time%2 ? -i : i];
      const [r, c, d] = a;
      const dr = r + DIRS[d][0], dc = c + DIRS[d][1];
      const dest = Math.max(0,Math.min(state.H-1,dr))*W + Math.max(0,Math.min(W-1,dc));
      const defensive = state.owner[dest] === i;
      const generalAttack = state.isGeneral[dest] === 1;
      const army = state.army[r * W + c];
      return [0, defensive ? 0 : 1, generalAttack ? 1 : 0, -army, state.time%2 ? -i : i];
    };
    idx.sort((a, b) => {
      const ka = key(a), kb = key(b);
      for (let k = 0; k < 5; k++) {
        const va = ka[k], vb = kb[k];
        if (va !== vb) return va - vb;
      }
      return 0;
    });
    const enters=(a,b)=> actions[a] && actions[b] &&
      actions[a][0]+DIRS[actions[a][2]][0]===actions[b][0] &&
      actions[a][1]+DIRS[actions[a][2]][1]===actions[b][1];
    const result=[];
    while(result.length<N) {
      const pending=idx.filter(i=>!result.includes(i));
      const next=pending.find(i=>!pending.some(j=>j!==i && enters(j,i) && !enters(i,j)));
      result.push(next ?? pending[0]);
    }
    return result;
  }

  function applyMove(state, p, mv) {
    const { H, W, owner, army, isGeneral, isCity } = state;
    if (!mv) return;
    if (state.eliminated[p] || state.winner >= 0) return;
    const [r, c, d, split] = mv;
    if (r < 0 || r >= H || c < 0 || c >= W) return;
    if (owner[r * W + c] !== p) return;
    const dr = r + DIRS[d][0], dc = c + DIRS[d][1];
    if (dr < 0 || dr >= H || dc < 0 || dc >= W) return;
    const src = r * W + c, dst = dr * W + dc;
    if (owner[dst] === -2) return; // 山

    let toMove = split ? Math.floor(army[src] / 2) : army[src] - 1;
    toMove = Math.max(0, Math.min(toMove, army[src] - 1));
    if (!(toMove > 0 || army[src] === 1)) return;
    if (toMove === 0) return; // FFA 无队友，1兵格移动无效果

    const destOwner = owner[dst];
    if (destOwner === p) {
      army[dst] += toMove;
      army[src] -= toMove;
      return;
    }
    // 进攻
    army[src] -= toMove;
    const win = toMove > army[dst];
    army[dst] = Math.abs(army[dst] - toMove);
    if (!win) return;
    if (isGeneral[dst]) {
      // 俘虏敌将：将军变城，全部领土转移、兵力减半向上取整
      const q = destOwner;
      isGeneral[dst] = 0; isCity[dst] = 1; owner[dst] = p;
      for (let i = 0; i < H * W; i++) {
        if (owner[i] === q) { owner[i] = p; army[i] = Math.ceil(army[i] / 2); }
      }
      state.eliminated[q] = true;
      state.events.push({type:"capture", by:p, target:q, cell:dst, t:state.time+1});
      const alive = state.eliminated.filter(e => !e).length;
      if (alive === 1) state.winner = p;
    } else {
      owner[dst] = p;
    }
  }

  function income(state) {
    const { H, W, owner, army, isGeneral, isCity } = state;
    if (state.time % 2 === 0) {
      for (let i = 0; i < H * W; i++)
        if (owner[i] >= 0 && (isGeneral[i] || isCity[i])) army[i]++;
    }
    if (state.time % 50 === 0) {
      for (let i = 0; i < H * W; i++)
        if (owner[i] >= 0) army[i]++;
    }
  }

  // ---------------- 迷雾视野（给 bot 的 view，与竞技场字段一致） ----------------
  function viewFor(state, p) {
    const { H, W, owner, army, isGeneral, isCity } = state;
    const size = H * W;
    const vis = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      if (owner[i] !== p) continue;
      const r = (i / W) | 0, c = i % W;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < H && nc >= 0 && nc < W) vis[nr * W + nc] = 1;
        }
    }

    const view = {
      apiVersion: 'aob-generals-bot/1', rulesVersion: 'aob-generals-ffa-1.0.0',
      mode: 'ffa', players: state.N, maxTurns: state.maxTurns,
      rules: { generalTrade: false, fogRadius: 1, structureGrowthEvery: 2, landGrowthEvery: 50, diagonalMovement: false },
      h: H, w: W, turn: state.time,
      armies: [], owned: [], opponent: [], neutral: [], fog: [],
      mountains: [], structures_in_fog: [], castles: [], generals: [],
      land: 0, army: 0, enemy_land: 0, enemy_army: 0,
    };
    for (let i = 0; i < size; i++) {

      const o = owner[i], a = army[i];
      const isObs = o === -2, isCityC = isCity[i] === 1;
      view.armies.push(vis[i] ? a : 0);
      view.owned.push(o === p);
      view.opponent.push(!!vis[i] && o >= 0 && o !== p);
      view.neutral.push(!!vis[i] && o === -1);
      view.fog.push(!vis[i] && !(isObs || isCityC));
      view.mountains.push(isObs && !!vis[i]);
      view.structures_in_fog.push(!vis[i] && (isObs || isCityC));
      view.castles.push(isCityC && !!vis[i]);
      view.generals.push(isGeneral[i] === 1 && (!!vis[i] || o === p));
      if (o === p) { view.land++; view.army += a; }
      else if (o >= 0) { view.enemy_land++; view.enemy_army += a; }
    }
    view.visible=Array.from(vis,Boolean);
    view.player=p;
    view.owners=Array.from(owner,(o,i)=>vis[i] ? o : -3);
    return view;
  }

  // ---------------- 回放帧（本地 v2 独立格式） ----------------
  function snapshot(state) {
    const { H, W, owner, army } = state;
    const o = new Int8Array(H * W);
    for (let i = 0; i < H * W; i++) o[i] = owner[i];
    const a = new Uint32Array(H * W);
    for (let i = 0; i < H * W; i++) a[i] = army[i];
    return {
      t: state.time,
      o: bytesToB64(new Uint8Array(o.buffer)),
      a: bytesToB64(new Uint8Array(a.buffer)),
      g: bytesToB64(state.isGeneral),
      c: bytesToB64(state.isCity),
      eliminated: [...state.eliminated],
      events: state.events.map(e=>({...e})),
    };
  }

  function bytesToB64(bytes) {
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }

  // 初始地形 meta（逐帧地形仍以 snapshot 为准）
  function terrainMeta(state) {
    const size = state.H * state.W;
    const to2D = mask => {
      const rows = [];
      for (let r = 0; r < state.H; r++) rows.push(Array.from(mask.slice(r * state.W, (r + 1) * state.W), Boolean));
      return rows;
    };
    const mountains = new Uint8Array(size), castles = new Uint8Array(size), generals = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      mountains[i] = state.owner[i] === -2 ? 1 : 0;
      castles[i] = state.isCity[i];
      generals[i] = state.isGeneral[i];
    }
    return { mountains: to2D(mountains), castles: to2D(castles), generals: to2D(generals) };
  }

  function surrender(state,p) {
    if(state.done || !Number.isInteger(p) || p<0 || p>=state.N) return;
    state.eliminated[p]=true;
  }
  const GPEngine = { VERSION:"aob-generals-ffa-1.0.0", createGame, tick, viewFor, snapshot, terrainMeta, mulberry32, actionError, surrender, moveOrder, _bfsDist: bfsDist };
  if (typeof module !== "undefined" && module.exports) module.exports = GPEngine;
  else global.GPEngine = GPEngine;
})(typeof window !== "undefined" ? window : globalThis);
