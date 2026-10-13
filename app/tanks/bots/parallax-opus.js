// Parallax —— 四人坦克乱斗 2.6 参赛 bot（单文件、同步、无外部依赖）
// 主线：弹道几何。引擎每拍“先开火、后移动、再结算炮弹”，且炮线只沿车身左列/上排，
// 所以（1）只要本拍移动后的车身不在敌方“当前朝向”的四格炮线内，就不会被新开的炮打中；
// （2）站在对手下排/右列的偏置车道上，我能打到他而他的炮线碰不到我。
// 其余模块（走位习惯统计、冷却记账、草丛位置推断、缩圈、补给、收割残甲）都服务于这两条。

var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
var MOVES = ['up', 'right', 'down', 'left'];
var SIDES = 'ABCD';
var KD = 4;                       // 已知炮弹的前瞻拍数
var MAXC = 70;                    // 目标场的代价上界
// 可调参数（开发脚本按名字替换做对照实验）
var P_TW = 0.9;      // “下一拍无路可躲”的权重
var P_AIM = 4;       // 对手选择封位走法的倍权
var P_MOB = 0;       // 出口被堵惩罚的倍率（对照实验显示有害，默认关闭）
var P_GH = 0.4;      // 草丛隐身炮线的权重
var P_FC = 0.6;      // 开火门槛：冷却的机会成本 + 开火后全场暴露 8 拍的代价
var P_FCI = 0.15;    // 长时间没有好机会时门槛降到的下限
var P_END = 1;       // 按命数/分差/时间调整风险的开关
var P_L1 = 3.5;      // 最后一条命且不落后：满甲时中弹代价倍率
var P_L2 = 1.4;      // 剩两条命且明显领先
var P_BH = 0.55;     // 落后且命数充足时的终盘倍率
var P_POT = 0.3;     // “下一拍可开火命中”的权重
var P_WG = 0.07;     // 每步路程代价
var P_PRIO = 2.5;    // 最近目标是残甲车时路程代价的倍率（值得赶路）
var P_PRIS = 1.5;    // 最近目标是久停不动的车时的倍率
var P_RND = 0;       // 评分差在此以内的走法用本拍随机数挑选（降低可预测性）
var P_HC2 = 2.2;     // 满甲时中弹代价
var P_HC1 = 5;       // 残甲时中弹代价（三命）
var P_PF = 0.9;      // 冷却就绪的对手沿炮线开火的概率
var P_G0 = 1;        // 贴身进攻位的附加代价
var P_G1 = 0;        // 隔一格进攻位的附加代价
var P_PROX = 0;      // 与敌车贴身的代价
var P_XF = 0;        // 同时处在多辆敌车近旁的代价
var P_PL = 0.35;     // 远处对手沿当前炮线开火的概率（下一拍飞到）
var P_ZB = 1;        // 入圈卡住时，缩圈距离场把可见敌车的（预测）占位当作障碍
var P_ZA = 1;        // 入圈卡住时，允许同样靠外的进攻位（打开被堵的入口）
var P_ZK = 5;        // 到下一圈的步数连续多少拍没有缩短算“卡住”
var P_ZW = 6;        // 卡住后再过多少拍还进不去就转入“开路”
var P_ZF = 1;        // 开路时朝向堵路敌车的加分
var P_ZU = 0.8;      // 入圈余量为 0 时按“被圈打一次”的多大比例计价
var P_ZS = 12;       // 下一圈：余量低于这个拍数开始加压
var P_ZS2 = 6;       // 当前圈：距下次伤害的余量低于这个拍数开始加压
var P_ZX = 0.3;      // 圈外落点 3 格内有敌车时的加价比例（回圈可能被车身堵住）
var G = new Int8Array(676);       // 地形
var FREE = new Uint8Array(625);   // 2×2 车身可停的位置
var GRASS = new Uint8Array(625);  // 车身沾草
var BLK = new Uint8Array(625);    // 与可见敌车重叠的位置
var PEN = new Uint8Array(625);    // 寻路附加代价（圈外）
var MARK = new Uint8Array(625);
var DETA = [], DETF = [];         // 各拍已知炮弹扫过的格；F 为“我本拍开火对撞后”的版本
var LANE = new Float32Array(676), LANEF = new Float32Array(676), GH = new Float32Array(676);
var AG = new Int16Array(2500), AT = new Int8Array(2500);   // 带朝向的目标状态代价
var PD = new Int16Array(625), PT = new Int8Array(625);     // 位置到最近目标的代价
var BQ = [];
var RX = new Int16Array(5), RY = new Int16Array(5), RB = new Uint8Array(5);
var TMP4 = new Int16Array(4), ACC = new Float32Array(25);
var TMK = new Int16Array(18), TBK = new Int16Array(18), TPW = new Float32Array(18);
var ZD = new Int16Array(625), ZQ = new Int16Array(625), ZB = new Uint8Array(625);
var ZN = 0, ZT = 0, ZC = 0, ZTD = 0, ZUSE = false, ZFINAL = false, ZLIM = 0, ZSTUCK = false, ZFIGHT = false;
var RISKK = new Int16Array(12), RISKV = new Float32Array(12), RISKN = 0;
var BRICKS = [], MAPOK = false, PENKEY = -1;
var MEM = null;
var PXD = {};
(function () {
  var i;
  for (i = 0; i < KD; i++) { DETA.push(new Uint8Array(676)); DETF.push(new Uint8Array(676)); }
  for (i = 0; i <= MAXC; i++) BQ.push([]);
})();

var TICK = 0, X0 = 0, Y0 = 0, D0 = 0, MYID = 'A', HURTIMM = 0, INVIMM = 0, NDET = 0, NGH = 0, VIS = [];

function mzx(x, d) { return d === 1 ? x + 2 : d === 3 ? x - 1 : x; }
function mzy(y, d) { return d === 2 ? y + 2 : d === 0 ? y - 1 : y; }
function zminAt(t) { return t < 200 ? 0 : Math.min(9, 2 + Math.floor((t - 200) / 50)); }
function outDist(x, y, zm) {
  var hi = 24 - zm;
  return (x < zm ? zm - x : x > hi ? x - hi : 0) + (y < zm ? zm - y : y > hi ? y - hi : 0);
}
function cheb(ax, ay, bx, by) { var a = Math.abs(ax - bx), b = Math.abs(ay - by); return a > b ? a : b; }

// 地形只会因砖被打掉而变化：只在砖数变化时重建通行表。
function loadMap(map) {
  var x, y, i;
  if (MAPOK) {
    var same = true;
    for (i = 0; i < BRICKS.length; i++) { var bc = BRICKS[i]; if (map[(bc - bc % 26) / 26][bc % 26] !== 1) { same = false; break; } }
    if (same) return;
  }
  BRICKS.length = 0; i = 0;
  for (y = 0; y < 26; y++) { var row = map[y]; for (x = 0; x < 26; x++) { var t = row[x]; G[i] = t; if (t === 1) BRICKS.push(i); i++; } }
  for (y = 0; y < 25; y++) for (x = 0; x < 25; x++) {
    var c = y * 26 + x, a = G[c], b = G[c + 1], e = G[c + 26], f = G[c + 27];
    FREE[y * 25 + x] = ((a === 0 || a === 4) && (b === 0 || b === 4) && (e === 0 || e === 4) && (f === 0 || f === 4)) ? 1 : 0;
    GRASS[y * 25 + x] = (a === 4 || b === 4 || e === 4 || f === 4) ? 1 : 0;
  }
  MAPOK = true;
}

// 一发炮弹一拍内扫过的格：先结算所在格，再飞三格；砖、钢吸收。
function lane4(mx, my, d, out) {
  var n = 0, x = mx, y = my;
  for (var s = 0; s < 4; s++) {
    if (x < 0 || y < 0 || x > 25 || y > 25) break;
    var t = G[y * 26 + x];
    if (t === 1 || t === 2) break;
    out[n++] = y * 26 + x;
    x += DX[d]; y += DY[d];
  }
  return n;
}
function trace(mx, my, d, K) {
  var out = [], x = mx, y = my, alive = !(x < 0 || y < 0 || x > 25 || y > 25);
  if (alive) { var t0 = G[y * 26 + x]; if (t0 === 1 || t0 === 2) alive = false; }
  for (var k = 0; k < K; k++) {
    var cells = [];
    if (alive) {
      cells.push(y * 26 + x);
      for (var s = 0; s < 3; s++) {
        var nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx > 25 || ny > 25) { alive = false; break; }
        var t = G[ny * 26 + nx];
        if (t === 1 || t === 2) { alive = false; break; }
        x = nx; y = ny; cells.push(y * 26 + x);
      }
    }
    out.push(cells);
  }
  return out;
}
function bodyHit(cells, n, x, y) {
  for (var i = 0; i < n; i++) {
    var c = cells[i], cx = c % 26, cy = (c - cx) / 26;
    if (cx >= x && cx <= x + 1 && cy >= y && cy <= y + 1) return true;
  }
  return false;
}
function canGo(x, y) { return x >= 0 && y >= 0 && x <= 24 && y <= 24 && FREE[y * 25 + x] === 1 && BLK[y * 25 + x] === 0; }
function immune(k, f) { return k < HURTIMM || (!f && k < INVIMM); }
function detHit(k, x, y, f) { var D = f ? DETF[k] : DETA[k], c = y * 26 + x; return (D[c] | D[c + 1] | D[c + 26] | D[c + 27]) !== 0; }
function max4(A, x, y) {
  var c = y * 26 + x, p = A[c];
  if (A[c + 1] > p) p = A[c + 1];
  if (A[c + 26] > p) p = A[c + 26];
  if (A[c + 27] > p) p = A[c + 27];
  return p;
}

function newMem() {
  return {tick: -99, en: {}, prevBullets: [], px: -1, py: -1, pd: 0, fired: false, myFire: -99,
    lane: new Int16Array(4), laneN: 0, lastMove: -1, pulse: false, born: 0, zn: -1, zbest: 999, zbt: 0};
}
function newRec(id) {
  return {id: id, seen: -99, x: 0, y: 0, dir: 0, hp: 2, inv: 0, hurt: 0, rapid: 0, px: 0, py: 0, pdir: 0, pseen: -99,
    lastFire: -99, wStay: 0.34, wFwd: 0.42, wTurn: 0.24, q: 0.3, qe: 0.3, pin: 0.7, still: 0, thr: -99, lives: 3, respawn: 0, alive: true, points: 0, bel: null};
}

// 敌车记忆：位置、朝向、走位习惯（停/直行/转向的滑动频率）、被瞄准时离开炮线的比例。
function observe(S, M, cont) {
  var tick = S.tick, i, r, o;
  for (i = 0; i < S.opponents.length; i++) {
    o = S.opponents[i]; r = M.en[o.id] || (M.en[o.id] = newRec(o.id));
    r.lives = o.lives; r.respawn = o.respawnTicks; r.points = o.points; r.alive = o.status === 'active' && o.lives > 0;
  }
  var vis = [], tanks = S.radar.tanks;
  for (i = 0; i < tanks.length; i++) {
    var t = tanks[i]; r = M.en[t.id] || (M.en[t.id] = newRec(t.id));
    if (cont && r.seen === tick - 1) {
      var md = Math.abs(t.x - r.x) + Math.abs(t.y - r.y);
      if (md <= 1) {
        var cat = (md === 0 && t.dir === r.dir) ? 0 : (t.dir === r.dir ? 1 : 2), a = 0.06;
        r.wStay += a * ((cat === 0 ? 1 : 0) - r.wStay);
        r.wFwd += a * ((cat === 1 ? 1 : 0) - r.wFwd);
        r.wTurn += a * ((cat === 2 ? 1 : 0) - r.wTurn);
        r.still = cat === 0 ? r.still + 1 : 0;
        if (r.thr === tick - 1) { r.q += 0.15 * ((bodyHit(M.lane, M.laneN, t.x, t.y) ? 0 : 1) - r.q); r.qe += 0.15 * (1 - r.pin - r.qe); }
      } else r.still = 0;
      r.px = r.x; r.py = r.y; r.pdir = r.dir; r.pseen = tick - 1;
    } else { r.pseen = -99; r.still = 0; }
    r.x = t.x; r.y = t.y; r.dir = t.dir; r.hp = t.hp; r.inv = t.invincibleTicks; r.hurt = t.hurtTicks; r.rapid = t.rapidTicks; r.seen = tick;
    vis.push({id: t.id, x: t.x, y: t.y, dir: t.dir, hp: t.hp, inv: t.invincibleTicks, hurt: t.hurtTicks, rapid: t.rapidTicks, rec: r});
  }
  return vis;
}

// 冷却记账：雷达没有弹主，只能用“上一拍某车炮口前三格处出现新弹”或“突然全场暴露”推断谁刚开过火。
function detectShots(S, M, vis) {
  var tick = S.tick, bl = S.radar.bullets, pb = M.prevBullets, i, j, e;
  for (i = 0; i < bl.length; i++) {
    var b = bl[i], ox = b.x - 3 * DX[b.dir], oy = b.y - 3 * DY[b.dir], seenBefore = false;
    for (j = 0; j < pb.length; j++) if (pb[j].x === ox && pb[j].y === oy && pb[j].dir === b.dir) { seenBefore = true; break; }
    if (seenBefore) continue;
    var sx = b.dir === 1 ? ox - 2 : b.dir === 3 ? ox + 1 : ox, sy = b.dir === 2 ? oy - 2 : b.dir === 0 ? oy + 1 : oy;
    if (M.fired && M.px === sx && M.py === sy && M.pd === b.dir) continue;
    for (j = 0; j < vis.length; j++) {
      e = vis[j].rec;
      if (e.pseen === tick - 1) { if (e.px === sx && e.py === sy && e.pdir === b.dir) e.lastFire = tick - 1; }
      else if (Math.abs(e.x - sx) + Math.abs(e.y - sy) <= 1) e.lastFire = tick - 1;
    }
  }
  if (!S.arena.radarPulse && !M.pulse) for (j = 0; j < vis.length; j++) {
    e = vis[j].rec;
    if (e.pseen === tick - 1) continue;
    var dd = cheb(X0, Y0, e.x, e.y);
    if (!(dd <= 6 && (dd <= 2 || !GRASS[e.y * 25 + e.x]))) e.lastFire = tick - 1;
  }
}

// 看不见的对手：从最后目击位置逐拍外扩，并剔除“若在那里我本该看见”的位置。
// 草丛里的集合会一直很小，于是能给出一张“可能被伏击的炮线”图。
function updateBelief(M, pulse) {
  var id, r, i, d, p;
  GH.fill(0); NGH = 0;
  for (id in M.en) {
    r = M.en[id];
    if (!r.alive || r.respawn > 0) { r.bel = null; continue; }
    if (r.seen === TICK) { r.bel = [r.y * 25 + r.x]; continue; }
    if (!r.bel) continue;
    if (pulse) { r.bel = null; continue; }
    var nb = [];
    for (i = 0; i < r.bel.length; i++) {
      p = r.bel[i];
      var x = p % 25, y = (p - x) / 25;
      for (d = -1; d < 4; d++) {
        var nx = d < 0 ? x : x + DX[d], ny = d < 0 ? y : y + DY[d];
        if (nx < 0 || ny < 0 || nx > 24 || ny > 24) continue;
        var q = ny * 25 + nx;
        if (MARK[q] || !FREE[q]) continue;
        var dd = cheb(X0, Y0, nx, ny);
        if (dd <= 2 || (dd <= 6 && !GRASS[q])) continue;
        MARK[q] = 1; nb.push(q);
      }
    }
    for (i = 0; i < nb.length; i++) MARK[nb[i]] = 0;
    if (!nb.length || nb.length > 36) { r.bel = null; continue; }
    r.bel = nb;
    var w = P_GH / nb.length;
    for (i = 0; i < nb.length; i++) {
      p = nb[i];
      var bx = p % 25, by = (p - bx) / 25;
      if (cheb(X0, Y0, bx, by) > 7) continue;
      for (d = 0; d < 4; d++) {
        var n = lane4(mzx(bx, d), mzy(by, d), d, TMP4);
        for (var j = 0; j < n; j++) GH[TMP4[j]] += w;
      }
      NGH++;
    }
  }
}

function hitsOther(nx, ny, self) {
  for (var i = 0; i < VIS.length; i++) { var o = VIS[i]; if (o !== self && Math.abs(nx - o.x) < 2 && Math.abs(ny - o.y) < 2) return true; }
  return false;
}
// 对手下一拍的五种动作及概率；被墙或车挡住时只转向。
function buildOpts(e, zm) {
  var r = e.rec, o = [], d, i, sum = 0;
  var ws = Math.max(0.05, r.wStay), wf = Math.max(0.05, r.wFwd), wt = Math.max(0.06, r.wTurn) / 3;
  if (r.still >= 2) { var keep = Math.min(0.9, 0.5 + 0.1 * r.still); if (ws < keep) { var sc0 = (1 - keep) / Math.max(0.01, wf + 3 * wt); ws = keep; wf *= sc0; wt *= sc0; } }
  o.push({x: e.x, y: e.y, dir: e.dir, w: ws, lane: new Int16Array(4), n: 0});
  for (d = 0; d < 4; d++) {
    var nx = e.x + DX[d], ny = e.y + DY[d];
    var ok = nx >= 0 && ny >= 0 && nx <= 24 && ny <= 24 && FREE[ny * 25 + nx] === 1 &&
      !(Math.abs(nx - X0) < 2 && Math.abs(ny - Y0) < 2) && !hitsOther(nx, ny, e);
    o.push({x: ok ? nx : e.x, y: ok ? ny : e.y, dir: d, w: d === e.dir ? wf : wt, lane: new Int16Array(4), n: 0});
  }
  for (i = 0; i < 5; i++) {
    var q = o[i];
    if (NDET && e.inv === 0 && e.hurt <= 1 && detHit(0, q.x, q.y, false)) q.w *= 0.4;   // 多数对手会躲已有炮弹
    if (outDist(q.x, q.y, zm) > 0) q.w *= 0.6;
    sum += q.w;
    q.n = lane4(mzx(q.x, q.dir), mzy(q.y, q.dir), q.dir, q.lane);
  }
  for (i = 0; i < 5; i++) o[i].w /= sum;
  return o;
}
// 两拍后的位置分布（用于“下一拍能不能开火命中”）。
function buildD2(e) {
  var r = e.rec, out = [], i, d, k;
  var ws = Math.max(0.05, r.wStay), wf = Math.max(0.05, r.wFwd), wt = Math.max(0.06, r.wTurn) / 3, tot = ws + wf + 3 * wt;
  ACC.fill(0);
  for (i = 0; i < 5; i++) {
    var o = e.opts[i], bx = o.x - e.x + 2, by = o.y - e.y + 2;
    ACC[by * 5 + bx] += o.w * ws / tot;
    for (d = 0; d < 4; d++) {
      var nx = o.x + DX[d], ny = o.y + DY[d];
      var ok = nx >= 0 && ny >= 0 && nx <= 24 && ny <= 24 && FREE[ny * 25 + nx] === 1;
      ACC[(ok ? by + DY[d] : by) * 5 + (ok ? bx + DX[d] : bx)] += o.w * (d === o.dir ? wf : wt) / tot;
    }
  }
  for (k = 0; k < 25; k++) if (ACC[k] > 0) out.push({x: e.x + k % 5 - 2, y: e.y + (k - k % 5) / 5 - 2, p: ACC[k]});
  return out;
}

function risk0(x, y, f) {
  if (immune(0, f)) return 0;
  if (NDET && detHit(0, x, y, f)) return 1;
  var p = max4(f ? LANEF : LANE, x, y);
  if (NGH) { var g = max4(GH, x, y); if (g > 0.6) g = 0.6; p = p + (1 - p) * g; }
  return p;
}
// 从 (x,y) 出发，能否在第 k..kmax-1 拍都避开已知炮弹。
function surv(x, y, k, kmax, f) {
  if (k >= kmax) return true;
  var im = immune(k, f);
  if ((im || !detHit(k, x, y, f)) && surv(x, y, k + 1, kmax, f)) return true;
  for (var d = 0; d < 4; d++) {
    var nx = x + DX[d], ny = y + DY[d];
    if (!canGo(nx, ny)) continue;
    if (!im && detHit(k, nx, ny, f)) continue;
    if (surv(nx, ny, k + 1, kmax, f)) return true;
  }
  return false;
}
// 下一拍会不会被逼死：把我的每个应手记成一位；每个对手的每种走法用炮线封住若干位，
// 他走到的新位置还会用车身堵住若干位（被堵的应手等同原地不动）。枚举所有走法组合，累加“全部应手被封”的概率。
// 会瞄准的对手更可能走封位的那一步（P_AIM 倍权）。
function trapRisk(x1, y1, f) {
  if (immune(1, f)) return 0;
  var nr = 1, d, i, j, k, base = 0;
  RX[0] = x1; RY[0] = y1;
  for (d = 0; d < 4; d++) { var nx = x1 + DX[d], ny = y1 + DY[d]; if (canGo(nx, ny)) { RX[nr] = nx; RY[nr] = ny; nr++; } }
  var full = (1 << nr) - 1, ne = VIS.length;
  if (NDET) for (i = 0; i < nr; i++) if (detHit(1, RX[i], RY[i], f)) base |= 1 << i;
  if (base === full) return 1;
  if (ne === 0) return 0;
  for (i = 0; i < ne; i++) {
    var e = VIS[i], mk, bk, sum = 0, b6 = i * 6;
    // 第 5 项：他本拍就沿当前炮线开火，下一拍炮弹飞到（此时他下一拍不能再开火）
    mk = base;
    var pl = 0;
    if (e.pf0 > 0.1 && e.tr[1].length) {
      for (j = 0; j < nr; j++) if (bodyHit(e.tr[1], e.tr[1].length, RX[j], RY[j])) mk |= 1 << j;
      if (mk !== base) pl = P_PL * e.pf0;
    }
    TMK[b6 + 5] = mk; TBK[b6 + 5] = 0; TPW[b6 + 5] = pl;
    for (k = 0; k < 5; k++) {
      var o = e.opts[k], lane = o.lane, n = o.n, into = Math.abs(o.x - x1) < 2 && Math.abs(o.y - y1) < 2;
      mk = base; bk = 0;
      if (into) { n = lane4(mzx(e.x, o.dir), mzy(e.y, o.dir), o.dir, TMP4); lane = TMP4; }   // 他想走进我的新位置：只转向
      else for (j = 1; j < nr; j++) if (Math.abs(RX[j] - o.x) < 2 && Math.abs(RY[j] - o.y) < 2) bk |= 1 << j;
      if (e.pf1 >= 0.1) {
        for (j = 0; j < nr; j++) if (bodyHit(lane, n, RX[j], RY[j])) mk |= 1 << j;
      }
      var w = o.w * ((mk !== base || bk) ? P_AIM : 1);
      TMK[b6 + k] = mk; TBK[b6 + k] = bk; TPW[b6 + k] = w; sum += w;
    }
    for (k = 0; k < 5; k++) TPW[b6 + k] = TPW[b6 + k] / sum * (1 - pl);
  }
  var tot = 0, a, b, c, u, bl, pa, pb, pc;
  for (a = 0; a < 6; a++) {
    pa = TPW[a]; if (pa <= 0) continue;
    if (ne === 1) { u = TMK[a]; if (u & 1) u |= TBK[a]; if (u === full) tot += pa; continue; }
    for (b = 0; b < 6; b++) {
      pb = TPW[6 + b]; if (pb <= 0) continue;
      if (ne === 2) { u = TMK[a] | TMK[6 + b]; if (u & 1) u |= TBK[a] | TBK[6 + b]; if (u === full) tot += pa * pb; continue; }
      for (c = 0; c < 6; c++) {
        pc = TPW[12 + c]; if (pc <= 0) continue;
        u = TMK[a] | TMK[6 + b] | TMK[12 + c];
        if (u & 1) u |= TBK[a] | TBK[6 + b] | TBK[12 + c];
        if (u === full) tot += pa * pb * pc;
      }
    }
  }
  tot *= P_PF;
  return tot > 1 ? 1 : tot;
}
function openLen(cx, cy, d) {
  var n = 0;
  for (;;) {
    cx += DX[d]; cy += DY[d];
    if (cx < 0 || cy < 0 || cx > 25 || cy > 25) break;
    var t = G[cy * 26 + cx];
    if (t === 1 || t === 2) break;
    if (++n >= 6) break;
  }
  return n;
}
// 侧移出口被堵时，对应那一排/列的远射躲不开：按敞开的射线条数计。
function mobPen(x, y) {
  var pen = 0;
  if (!canGo(x, y + 1)) { if (openLen(x, y, 3) >= 5) pen++; if (openLen(x + 1, y, 1) >= 5) pen++; }
  if (!canGo(x, y - 1)) { if (openLen(x, y + 1, 3) >= 5) pen++; if (openLen(x + 1, y + 1, 1) >= 5) pen++; }
  if (!canGo(x + 1, y)) { if (openLen(x, y, 0) >= 5) pen++; if (openLen(x, y + 1, 2) >= 5) pen++; }
  if (!canGo(x - 1, y)) { if (openLen(x + 1, y, 0) >= 5) pen++; if (openLen(x + 1, y + 1, 2) >= 5) pen++; }
  return pen;
}
// 综合风险：本拍中弹 + 之后被已知炮弹逼中 + 下一拍被逼死。按位置缓存。
function posRisk(x, y, f) {
  var key = (y * 25 + x) * 2 + (f ? 1 : 0), i;
  for (i = 0; i < RISKN; i++) if (RISKK[i] === key) return RISKV[i];
  var r = risk0(x, y, f), doom = 0;
  if (r < 1) {
    if (NDET) doom = !surv(x, y, 1, 2, f) ? 1 : !surv(x, y, 1, 3, f) ? 0.7 : !surv(x, y, 1, 4, f) ? 0.4 : 0;
    var trp = doom < 1 ? trapRisk(x, y, f) : 0;
    r = r + (1 - r) * (0.75 * doom + P_TW * trp * (1 - doom));
  }
  if (RISKN < 12) { RISKK[RISKN] = key; RISKV[RISKN] = r; RISKN++; }
  return r;
}

// 本拍开火的期望得分：当拍四格内按对手一步走法算，远距离按两步分布打折。
function fireEV() {
  var tr = trace(mzx(X0, D0), mzy(Y0, D0), D0, 3), tot = 0, i, j;
  for (i = 0; i < VIS.length; i++) {
    var e = VIS[i], val = e.hp <= 1 ? 3.2 : 1, p0 = 0, p1 = 0, p2 = 0, esc = false;
    if (e.inv === 0 && e.hurt <= 1 && tr[0].length) {
      for (j = 0; j < 5; j++) { var o = e.opts[j]; if (bodyHit(tr[0], tr[0].length, o.x, o.y)) p0 += o.w; else esc = true; }
      p0 = esc ? Math.min(1, p0 * e.aw) : 1;
    }
    if (e.inv <= 1 && e.hurt <= 2 && tr[1].length) {
      for (j = 0; j < e.d2.length; j++) if (bodyHit(tr[1], tr[1].length, e.d2[j].x, e.d2[j].y)) p1 += e.d2[j].p;
      p1 *= (1 - p0) * Math.min(1, e.aw) * 0.7;
    }
    if (e.inv <= 2 && e.hurt <= 3 && tr[2].length) {
      for (j = 0; j < e.d2.length; j++) if (bodyHit(tr[2], tr[2].length, e.d2[j].x, e.d2[j].y)) p2 += e.d2[j].p;
      p2 *= (1 - p0 - p1) * Math.min(1, e.aw) * 0.4;
    }
    tot += (p0 + p1 + p2) * val;
  }
  return tot;
}
// 走到 (x,y) 且朝向 d 后，下一拍开火的命中期望。
function potential(x, y, d) {
  var n = lane4(mzx(x, d), mzy(y, d), d, TMP4), v = 0;
  if (!n) return 0;
  for (var i = 0; i < VIS.length; i++) {
    var e = VIS[i], p = 0;
    if (e.inv > 1 || e.hurt > 2) continue;
    for (var j = 0; j < e.d2.length; j++) if (bodyHit(TMP4, n, e.d2[j].x, e.d2[j].y)) p += e.d2[j].p;
    v += Math.min(1, p * e.aw) * (e.hp <= 1 ? 3.2 : 1);
  }
  return v;
}

function seedPos(q, cost, type) {
  if (cost > MAXC || cost >= PD[q]) return;
  PD[q] = cost; PT[q] = type; BQ[cost].push(q);
}
// 目标状态 (x,y,朝向 d)。位置场的种子是“再走一步就到位”的格：从后方开进来，或原地顶墙转向。
function pushGoal(x, y, d, cost, type) {
  var p = y * 25 + x, s = p * 4 + d;
  if (cost < 0) cost = 0;
  if (cost >= AG[s]) return;
  AG[s] = cost; AT[s] = type;
  var qx = x - DX[d], qy = y - DY[d];
  if (canGo(qx, qy) || (qx === X0 && qy === Y0)) seedPos(qy * 25 + qx, cost + 1 + PEN[p], type);
  if (!canGo(x + DX[d], y + DY[d])) seedPos(p, cost + 1, type);
}
// 进攻位：炮线压住对手且四格内直达；优先偏置车道（a=1）和对手行进方向一侧。
function addAttack(ex, ey, edir, base, zg, moving, prio) {
  for (var d = 0; d < 4; d++) for (var a = 0; a < 2; a++) for (var g = 0; g < 4; g++) {
    var x, y, c, i, clear = true;
    if (d === 1) { x = ex - 2 - g; y = ey + a; } else if (d === 3) { x = ex + 2 + g; y = ey + a; }
    else if (d === 2) { y = ey - 2 - g; x = ex + a; } else { y = ey + 2 + g; x = ex + a; }
    var zo = outDist(x, y, zg);
    if (!canGo(x, y) || zo > ZLIM) continue;
    var mx = mzx(x, d), my = mzy(y, d);
    for (i = 0; i < g; i++) { var t = G[(my + i * DY[d]) * 26 + mx + i * DX[d]]; if (t === 1 || t === 2) { clear = false; break; } }
    if (!clear) continue;
    c = base + (g === 0 ? P_G0 : g === 1 ? P_G1 : g === 3 ? 1 : 0) + 2 * zo;
    if (a === 0) c += (edir === (d + 2) % 4) ? 5 : 1;
    if ((edir + d) % 2 === 1) {            // 对手横向经过我的炮线：打他前进方向那一排/列
      var want = (edir === 2 || edir === 1) ? 1 : 0;
      if (a !== want) c += moving;
    }
    if (max4(LANE, x, y) > 0.5) c += 3;
    pushGoal(x, y, d, c, (a ? 2 : 1) + prio);
  }
}
function runGoals() {
  var need = 1, d;
  MARK[Y0 * 25 + X0] = 1;
  for (d = 0; d < 4; d++) if (canGo(X0 + DX[d], Y0 + DY[d])) { MARK[(Y0 + DY[d]) * 25 + X0 + DX[d]] = 1; need++; }
  for (var c = 0; c <= MAXC && need > 0; c++) {
    var b = BQ[c];
    for (var i = 0; i < b.length; i++) {
      var p = b[i];
      if (PD[p] !== c) continue;
      if (MARK[p]) { MARK[p] = 0; if (--need <= 0) break; }
      var x = p % 25, y = (p - x) / 25, nc = c + 1 + PEN[p], ty = PT[p];
      if (nc > MAXC) continue;
      for (d = 0; d < 4; d++) {
        var qx = x + DX[d], qy = y + DY[d];
        if (!canGo(qx, qy) && !(qx === X0 && qy === Y0)) continue;
        var q = qy * 25 + qx;
        if (nc < PD[q]) { PD[q] = nc; PT[q] = ty; BQ[nc].push(q); }
      }
    }
  }
  MARK[Y0 * 25 + X0] = 0;
  for (d = 0; d < 4; d++) { var mx = X0 + DX[d], my = Y0 + DY[d]; if (mx >= 0 && my >= 0 && mx <= 24 && my <= 24) MARK[my * 25 + mx] = 0; }
}
function buildGoals(S, M, me) {
  var i, x, y, d;
  AG.fill(9999); PD.fill(9999);
  for (i = 0; i <= MAXC; i++) BQ[i].length = 0;
  var z1 = zminAt(TICK + 30), z2 = zminAt(TICK + 60), zg = zminAt(TICK + 40);
  ZLIM = P_ZA > 0 && ZSTUCK ? 2 : 0;
  if (PENKEY !== z1 * 16 + z2) {
    PENKEY = z1 * 16 + z2;
    for (y = 0; y < 25; y++) for (x = 0; x < 25; x++) PEN[y * 25 + x] = outDist(x, y, z1) > 0 ? 3 : (outDist(x, y, z2) > 0 ? 1 : 0);
  }
  for (i = 0; i < VIS.length; i++) {
    var e = VIS[i], r = e.rec;
    var v = 4 + (e.hp <= 1 ? 4 : 0) + (r.wStay > 0.5 ? 1 : 0) - (e.inv > 0 ? Math.min(8, Math.ceil(e.inv / 2)) : 0) - Math.round(4 * Math.max(0, r.q - 0.35));
    addAttack(e.x, e.y, e.dir, 12 - v, zg, r.wFwd > 0.3 ? 2 : 1, e.inv > 0 ? 0 : e.hp <= 1 ? 8 : r.still >= 3 ? 4 : 0);
  }
  for (var id in M.en) {
    var m = M.en[id];
    if (!m.alive || m.respawn > 0 || m.seen === TICK || TICK - m.seen > 40 || !m.bel) continue;
    addAttack(m.x, m.y, m.dir, 11 + ((TICK - m.seen) >> 2), zg, 0, 0);
  }
  var sup = S.arena.supply;
  if (sup && TICK < sup.expireTick - 1 && (sup.type === 'rapid' ? me.rapidTicks < 30 : me.hp < me.maxHp)) {
    var sv = sup.type === 'rapid' ? 6 : (me.lives === 1 ? 10 : 8);
    for (y = sup.y - 1; y <= sup.y + 1; y++) for (x = sup.x - 1; x <= sup.x + 1; x++) {
      if (!canGo(x, y) || outDist(x, y, zg) > 0) continue;
      for (d = 0; d < 4; d++) pushGoal(x, y, d, 12 - sv, 3);
    }
  }
  var hx = sup ? sup.x : 12, hy = sup ? sup.y : 12;
  for (y = hy - 2; y <= hy + 2; y++) for (x = hx - 2; x <= hx + 2; x++) {
    if (!canGo(x, y) || Math.abs(x - hx) + Math.abs(y - hy) > 2) continue;
    for (d = 0; d < 4; d++) pushGoal(x, y, d, 14, 4);
  }
  runGoals();
}

// 缩圈：ZN 为下一圈下界，ZT 为距它生效的拍数。身在下一圈外时用带障碍的真实步数。
function prepZone(M) {
  ZC = zminAt(TICK); ZFINAL = ZC >= 9;
  var ts = TICK < 200 ? 200 : 200 + (Math.floor((TICK - 200) / 50) + 1) * 50;
  ZN = ZFINAL ? 9 : zminAt(ts); ZT = ZFINAL ? 0 : ts - TICK;
  ZTD = TICK < 200 ? 200 : (TICK % 10 === 0 ? TICK : TICK + 10 - TICK % 10);
  ZUSE = false; ZSTUCK = false; ZFIGHT = false;
  if (outDist(X0, Y0, ZN) === 0) { M.zbest = 999; M.zbt = TICK; return; }
  ZUSE = true;
  zoneField(false);
  var zp = ZD[Y0 * 25 + X0];
  if (M.zn !== ZN) { M.zn = ZN; M.zbest = 999; M.zbt = TICK; }
  if (zp < M.zbest || !(ZFINAL || ZT <= 52)) { M.zbest = zp; M.zbt = TICK; }
  ZSTUCK = VIS.length > 0 && TICK - M.zbt >= P_ZK;
  ZFIGHT = ZSTUCK && P_ZF > 0 && TICK - M.zbt >= P_ZK + P_ZW;
  var blk = P_ZB > 0 && ZSTUCK;
  if (blk) {
    ZB.fill(0);
    for (var i = 0; i < VIS.length; i++) {
      var e = VIS[i], r = e.rec, k0 = 0, k1 = 0;
      if (r.still === 0 && r.pseen === TICK - 1 && (r.px !== e.x || r.py !== e.y) && zfree(e.x + DX[e.dir], e.y + DY[e.dir])) { k0 = 1; k1 = 3; }
      for (var k = k0; k <= k1; k++) {
        var cx = e.x + k * DX[e.dir], cy = e.y + k * DY[e.dir];
        if (k > 0 && !zfree(cx, cy)) break;
        for (var by = cy - 1; by <= cy + 1; by++) for (var bx = cx - 1; bx <= cx + 1; bx++)
          if (bx >= 0 && by >= 0 && bx <= 24 && by <= 24) ZB[by * 25 + bx] = 1;
      }
    }
    ZB[Y0 * 25 + X0] = 0;
  }
  if (blk) {
    zoneField(true);
    if (ZD[Y0 * 25 + X0] >= 999) zoneField(false);     // 被完全堵死时退回不计敌车的距离
  }
}
function zfree(x, y) { return x >= 0 && y >= 0 && x <= 24 && y <= 24 && FREE[y * 25 + x] === 1; }
// 落点到下一圈的步数：圈内为 0；被预测占位盖住的格按最近的可达邻格估计。
function zdAt(x, y) {
  if (outDist(x, y, ZN) === 0) return 0;
  var v = ZD[y * 25 + x];
  if (v < 999) return v;
  for (var d = 0; d < 4; d++) {
    var qx = x + DX[d], qy = y + DY[d];
    if (qx < 0 || qy < 0 || qx > 24 || qy > 24) continue;
    var w = ZD[qy * 25 + qx] + 3;
    if (w < v) v = w;
  }
  return v;
}
function zoneField(blk) {
  ZD.fill(999);
  var h = 0, t = 0, x, y, d, lo = ZN, hi = 24 - ZN;
  for (y = lo; y <= hi; y++) for (x = lo; x <= hi; x++) {
    var s0 = y * 25 + x;
    if (FREE[s0] === 1 && !(blk && ZB[s0])) { ZD[s0] = 0; ZQ[t++] = s0; }
  }
  while (h < t) {
    var p = ZQ[h++], px = p % 25, py = (p - px) / 25, nd = ZD[p] + 1;
    for (d = 0; d < 4; d++) {
      var qx = px + DX[d], qy = py + DY[d];
      if (qx < 0 || qy < 0 || qx > 24 || qy > 24) continue;
      var q = qy * 25 + qx;
      if (ZD[q] <= nd || FREE[q] !== 1 || (blk && ZB[q])) continue;
      ZD[q] = nd; ZQ[t++] = q;
    }
  }
}
function entryBlocked(x, y, zd) {
  for (var d = 0; d < 4; d++) {
    var qx = x + DX[d], qy = y + DY[d];
    if (qx < 0 || qy < 0 || qx > 24 || qy > 24 || FREE[qy * 25 + qx] !== 1 || ZD[qy * 25 + qx] >= zd) continue;
    var hit = false;
    for (var i = 0; i < VIS.length && !hit; i++) {
      var e = VIS[i], ex = e.x, ey = e.y;
      if (e.rec.still === 0 && e.rec.pseen === TICK - 1 && (e.rec.px !== e.x || e.rec.py !== e.y)) { ex += DX[e.dir]; ey += DY[e.dir]; }
      if (Math.abs(ex - qx) < 2 && Math.abs(ey - qy) < 2) hit = true;
    }
    if (!hit) return false;
  }
  return true;
}
function zoneCost(x, y, zhit) {
  var c = 0, od, u;
  if (!ZFINAL) {
    var zd = ZUSE ? zdAt(x, y) : outDist(x, y, ZN);
    if (zd > 60) zd = 60;
    if (zd > 0) {
      var slack = ZT - zd;
      if (ZUSE && ZT <= 30 && VIS.length && entryBlocked(x, y, zd)) c += slack <= 6 ? 1.2 : 0.6;
      if (slack < 0) c += zhit + 0.9 * zd;
      else if (ZT <= 52) {
        c += zd * (slack >= 12 ? 0.5 : 0.9);
        if (slack < P_ZS) { u = 1 - slack / P_ZS; c += P_ZU * zhit * u * u; }
      }
    }
  }
  if (TICK >= 200) {
    od = ZFINAL && ZUSE ? Math.min(60, zdAt(x, y)) : outDist(x, y, ZC);
    if (od > 0) {
      var s2 = ZTD - TICK - od;
      c += 0.6 * od;
      if (s2 < 0) c += zhit;
      else if (s2 < P_ZS2) { u = 1 - s2 / P_ZS2; c += P_ZU * zhit * u * u; }
      if (P_ZX > 0) for (var i = 0; i < VIS.length; i++) if (cheb(x, y, VIS[i].x, VIS[i].y) <= 3) { c += P_ZX * zhit; break; }
    }
  }
  return c;
}
function earlier(id) { var k = TICK % 4; return ((SIDES.indexOf(id) - k + 4) % 4) < ((SIDES.indexOf(MYID) - k + 4) % 4); }

function think(S) {
  var me = S.self, tick = S.tick, i, j, k, c, e;
  if (!MEM || tick <= MEM.tick) MEM = newMem();
  var M = MEM, cont = M.tick === tick - 1;
  if (!cont) M.born = tick;
  TICK = tick; X0 = me.x; Y0 = me.y; D0 = me.dir; MYID = me.id;
  HURTIMM = me.hurtTicks - 1; INVIMM = me.invincibleTicks;
  loadMap(S.map);
  VIS = observe(S, M, cont);
  if (cont) detectShots(S, M, VIS);
  var canFire = me.fireCooldown === 0;
  var pulse = S.arena.radarPulse, exposed = M.myFire + 8 >= tick, meGrass = GRASS[Y0 * 25 + X0] === 1;
  var zm = zminAt(tick + 1);
  updateBelief(M, pulse);

  BLK.fill(0);
  for (i = 0; i < VIS.length; i++) {
    e = VIS[i];
    for (var by = e.y - 1; by <= e.y + 1; by++) for (var bx = e.x - 1; bx <= e.x + 1; bx++)
      if (bx >= 0 && by >= 0 && bx <= 24 && by <= 24) BLK[by * 25 + bx] = 1;
  }
  // 已知炮弹
  var bl = S.radar.bullets, od = (D0 + 2) % 4;
  if (NDET) for (k = 0; k < KD; k++) { DETA[k].fill(0); DETF[k].fill(0); }
  NDET = bl.length;
  for (i = 0; i < bl.length; i++) {
    var b = bl[i], tr = trace(b.x, b.y, b.dir, KD);
    var canc = canFire && b.dir === od && (D0 === 1 ? (b.y === Y0 && b.x >= X0 + 2) : D0 === 3 ? (b.y === Y0 && b.x <= X0 - 1) :
      D0 === 0 ? (b.x === X0 && b.y <= Y0 - 1) : (b.x === X0 && b.y >= Y0 + 2));
    for (k = 0; k < KD; k++) for (j = 0; j < tr[k].length; j++) { DETA[k][tr[k][j]] = 1; if (!canc) DETF[k][tr[k][j]] = 1; }
  }
  // 敌方当前炮线
  LANE.fill(0); LANEF.fill(0);
  for (i = 0; i < VIS.length; i++) {
    e = VIS[i];
    var cd = e.rapid > 0 ? 4 : 6, d = cheb(X0, Y0, e.x, e.y);
    e.pf0 = tick >= e.rec.lastFire + cd ? P_PF : 0.03;
    e.pf1 = tick + 1 >= e.rec.lastFire + cd ? P_PF : 0.03;
    e.tr = trace(mzx(e.x, e.dir), mzy(e.y, e.dir), e.dir, 3);
    e.sees = pulse || exposed || (d <= 6 && (d <= 2 || !meGrass));
    e.aw = e.sees ? Math.max(0.15, Math.min(1.2, (1.05 - e.rec.q) / (1.05 - e.rec.qe))) : 1;
    var headOn = canFire && e.dir === od && (D0 === 1 ? (e.y === Y0 && e.x >= X0 + 3) : D0 === 3 ? (e.y === Y0 && e.x <= X0 - 3) :
      D0 === 0 ? (e.x === X0 && e.y <= Y0 - 3) : (e.x === X0 && e.y >= Y0 + 3));
    for (j = 0; j < e.tr[0].length; j++) {
      c = e.tr[0][j];
      if (e.pf0 > LANE[c]) LANE[c] = e.pf0;
      if (!headOn && e.pf0 > LANEF[c]) LANEF[c] = e.pf0;
    }
  }
  for (i = 0; i < VIS.length; i++) VIS[i].opts = buildOpts(VIS[i], zm);
  for (i = 0; i < VIS.length; i++) VIS[i].d2 = buildD2(VIS[i]);

  prepZone(M);
  buildGoals(S, M, me);
  var ev = canFire ? fireEV() : 0;
  var myPts = 0, rival = -1, rivals = 0;
  for (i = 0; i < S.scoreboard.length; i++) {
    var row = S.scoreboard[i];
    if (row.id === me.id) myPts = row.points;
    else if (row.status === 'active' && row.lives > 0) { rivals++; if (row.points > rival) rival = row.points; }
  }
  var lead = myPts - rival, left = 599 - tick;
  var HC = me.hp >= 2 ? P_HC2 : (me.lives >= 3 ? P_HC1 : me.lives === 2 ? P_HC1 * 1.3 : 30);
  // 存活优先于积分：领先时命越少越惜命；落后且还有命时把命当资源换分。
  if (P_END) {
    if (me.lives === 1) HC = me.hp < 2 ? (lead >= 0 ? 30 : lead >= -3 ? 14 : 8) : HC * (lead >= 0 ? P_L1 : 1.3);
    else if (me.lives === 2 && lead >= 4) HC *= P_L2;
    if (left < 120 && lead >= 3) HC *= 1.5;
    else if (lead < 0 && me.lives >= 2) HC *= tick >= 450 ? P_BH : tick >= 300 ? (1 + P_BH) / 2 : 1;
  }
  var potW = P_POT * (me.fireCooldown <= 1 ? 1 : me.fireCooldown === 2 ? 0.6 : me.fireCooldown === 3 ? 0.35 : 0.15);
  var idle = tick - Math.max(M.myFire, M.born);
  var fireCost = idle <= 12 ? P_FC : Math.max(P_FCI, P_FC - (idle - 12) * 0.012);
  var hidden = 0;
  for (var id in M.en) { var rr = M.en[id]; if (rr.alive && rr.respawn === 0 && rr.seen !== tick) hidden++; }
  var mobW = P_MOB * (0.03 + 0.03 * hidden);
  var zf = -1;                      // 被敌车车身堵住的入圈方向
  if (ZFIGHT) {
    var zo0 = outDist(X0, Y0, ZN);
    for (i = 0; i < 4; i++) {
      var fx = X0 + DX[i], fy = Y0 + DY[i];
      if (fx >= 0 && fy >= 0 && fx <= 24 && fy <= 24 && FREE[fy * 25 + fx] === 1 && BLK[fy * 25 + fx] === 1 && outDist(fx, fy, ZN) < zo0) { zf = i; break; }
    }
    if (zf >= 0) {                  // 只有炮线此刻压得住它才值得转过去等
      var zn = lane4(mzx(X0, zf), mzy(Y0, zf), zf, TMP4), za = false;
      for (i = 0; i < VIS.length; i++) if (bodyHit(TMP4, zn, VIS[i].x, VIS[i].y)) za = true;
      if (!za) zf = -1;
    }
    if (zf >= 0 && zf === D0) fireCost = Math.min(fireCost, P_FCI);
  }
  var best = null, bestSc = -1e9, dbg = [], dbg2 = [], alts = [];
  RISKN = 0;
  var gbest = 9999, gbt = 0;
  for (var m0 = -1; m0 < 4; m0++) {
    var gx = X0, gy = Y0, gdir = m0 < 0 ? D0 : m0;
    if (m0 >= 0 && canGo(X0 + DX[m0], Y0 + DY[m0])) { gx += DX[m0]; gy += DY[m0]; }
    var ga = AG[(gy * 25 + gx) * 4 + gdir], gp = PD[gy * 25 + gx];
    if (ga <= gp) { if (ga < gbest) { gbest = ga; gbt = AT[(gy * 25 + gx) * 4 + gdir]; } }
    else if (gp < gbest) { gbest = gp; gbt = PT[gy * 25 + gx]; }
  }
  var wG = P_WG * (gbt >= 8 ? P_PRIO : gbt >= 4 && gbt < 8 && (gbt & 3) !== 0 ? P_PRIS : 1);
  for (var m = -1; m < 4; m++) {
    // 本拍可能的落点：正常是 (px,py)；被先手的敌车抢位则留在原地；顶着的敌车先走开则会意外前进。
    var px = X0, py = Y0, pd = D0, alt = 0, ax = X0, ay = Y0;
    if (m >= 0) {
      pd = m;
      var tx = X0 + DX[m], ty = Y0 + DY[m];
      if (tx >= 0 && ty >= 0 && tx <= 24 && ty <= 24 && FREE[ty * 25 + tx] === 1) {
        if (!BLK[ty * 25 + tx]) {
          px = tx; py = ty;
          for (i = 0; i < VIS.length; i++) {
            e = VIS[i];
            if (!earlier(e.id)) continue;
            for (j = 1; j < 5; j++) { var o = e.opts[j]; if ((o.x !== e.x || o.y !== e.y) && Math.abs(o.x - px) < 2 && Math.abs(o.y - py) < 2) alt += o.w; }
          }
          if (alt > 1) alt = 1;
        } else {
          var blockers = 0, pv = 0;
          for (i = 0; i < VIS.length; i++) {
            e = VIS[i];
            if (Math.abs(e.x - tx) >= 2 || Math.abs(e.y - ty) >= 2) continue;
            blockers++;
            if (!earlier(e.id)) { blockers = 9; break; }
            for (j = 1; j < 5; j++) { var o2 = e.opts[j]; if (Math.abs(o2.x - tx) >= 2 || Math.abs(o2.y - ty) >= 2) pv += o2.w; }
          }
          if (blockers === 1 && pv > 0) { alt = Math.max(0.35, pv); ax = tx; ay = ty; }
        }
      }
    }
    var gdist = Math.min(AG[(py * 25 + px) * 4 + pd], PD[py * 25 + px]);
    var gtype = AG[(py * 25 + px) * 4 + pd] <= PD[py * 25 + px] ? AT[(py * 25 + px) * 4 + pd] : PT[py * 25 + px];
    if (gdist > MAXC) gdist = MAXC;
    var zc = zoneCost(px, py, me.hp >= 2 ? 2.0 : HC), pot = potential(px, py, pd), mob = P_MOB > 0 ? mobW * mobPen(px, py) : 0;
    if (P_PROX > 0 || P_XF > 0) {
      var nearN = 0, touch = 0;
      for (i = 0; i < VIS.length; i++) { var dq = cheb(px, py, VIS[i].x, VIS[i].y); if (dq <= 2) touch++; if (dq <= 5) nearN++; }
      mob += P_PROX * touch + (nearN > 1 ? P_XF * (nearN - 1) : 0);
    }
    for (var f = 0; f < (canFire ? 2 : 1); f++) {
      var ff = f === 1, r = posRisk(px, py, ff);
      if (alt > 0) r = (1 - alt) * r + alt * posRisk(ax, ay, ff);
      var sc = -HC * r - zc - mob - wG * gdist;
      if (ff) sc += ev - fireCost - (INVIMM > 0 ? 0.04 * INVIMM : 0);
      else sc += potW * pot;
      if (m >= 0 && m === M.lastMove) sc += 0.01;
      if (zf >= 0 && pd === zf && px === X0 && py === Y0) sc += P_ZF;
      if (sc > bestSc) { bestSc = sc; best = {m: m, f: ff, r: r, gt: gtype, gd: gdist, sc: sc}; }
      if (P_RND > 0) alts.push({m: m, f: ff, r: r, gt: gtype, gd: gdist, sc: sc});
      dbg.push(Math.round(sc * 100) / 100);
      if (!ff) dbg2.push([m, gdist, gtype, Math.round(pot * 100) / 100, Math.round(r * 100) / 100, Math.round(zc * 100) / 100]);
    }
  }
  if (P_RND > 0) {
    var pool = [];
    for (i = 0; i < alts.length; i++) if (alts[i].sc >= bestSc - P_RND && alts[i].f === best.f) pool.push(alts[i]);
    if (pool.length > 1) best = pool[(S.random >>> 0) % pool.length];
  }
  // 记忆
  M.laneN = lane4(mzx(X0, D0), mzy(Y0, D0), D0, M.lane);
  for (i = 0; i < VIS.length; i++) {
    e = VIS[i];
    if (!e.sees || !bodyHit(M.lane, M.laneN, e.x, e.y)) continue;
    var pin = 0;
    for (j = 0; j < 5; j++) if (bodyHit(M.lane, M.laneN, e.opts[j].x, e.opts[j].y)) pin += e.opts[j].w;
    e.rec.thr = tick; e.rec.pin = pin;
  }
  M.prevBullets = bl; M.px = X0; M.py = Y0; M.pd = D0; M.pulse = pulse;
  M.fired = best.f && canFire; if (M.fired) M.myFire = tick;
  M.lastMove = best.m; M.tick = tick;
  var intent = best.f ? 'pursue' : best.r > 0.3 ? 'defend' :
    best.gt === 3 ? 'resupply' : (best.gt & 3) === 2 && best.gt !== 4 ? 'flank' : (best.gt & 3) === 1 ? 'pursue' : best.m < 0 ? 'hold' : 'advance';
  PXD = {t: tick, ev: ev, sc: dbg, b: best, c: dbg2};
  return {move: best.m < 0 ? 'stay' : MOVES[best.m], fire: best.f, intent: intent};
}

function fallback(S) {
  var me = S && S.self, mv = 'stay';
  if (me && S.arena && S.arena.safeZone) {
    var z = S.arena.safeZone, lo = z.min + 1, hi = z.max - 2;
    if (me.x < lo) mv = 'right'; else if (me.x > hi) mv = 'left'; else if (me.y < lo) mv = 'down'; else if (me.y > hi) mv = 'up';
  }
  return {move: mv, fire: false, intent: 'hold'};
}
function decide(state) {
  try {
    var a = think(state);
    if (a && typeof a.fire === 'boolean' && (a.move === 'stay' || MOVES.indexOf(a.move) >= 0)) return a;
  } catch (err) { PXD = {err: String(err && err.stack || err)}; }
  try { return fallback(state); } catch (err2) { return {move: 'stay', fire: false, intent: 'hold'}; }
}
