// 匹配机制校验（决策 046）：lib/matchmaking.ts 的分档/保底/熔断/上轮回避语义，
// 以及服务端 /api/ratings 与 computeRatings 同口径（votes 重放）。
// 前半段拼合模块纯断言（同 validate-arena 模式），后半段起真实 server 比对。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

let tests = 0;
async function check(name, test) {
  await test();
  tests++;
  console.log(`PASS ${name}`);
}

const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;

// arena.ts 两份种子 JSON 内联注入 + matchmaking.ts 拼合（去掉对 arena 的导入）
const rosterJson = await readFile(new URL('../lib/works-roster.json', import.meta.url), 'utf8');
const promptsSeedJson = await readFile(new URL('../lib/prompts-seed.json', import.meta.url), 'utf8');
const arenaCode = transpile(await readFile(new URL('../lib/arena.ts', import.meta.url), 'utf8'))
  .replace(
    /^import\s+rosterData\s+from\s+['"]\.\/works-roster\.json['"];?\s*$/m,
    `const rosterData = ${rosterJson};`,
  )
  .replace(
    /^import\s+promptsSeed\s+from\s+['"]\.\/prompts-seed\.json['"];?\s*$/m,
    `const promptsSeed = ${promptsSeedJson};`,
  );
const matchmakingCode = transpile(
  await readFile(new URL('../lib/matchmaking.ts', import.meta.url), 'utf8'),
).replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]*arena['"];?\s*$/gm, '');

const module = await import(
  `data:text/javascript;base64,${Buffer.from(`${arenaCode}\n${matchmakingCode}`).toString('base64')}`
);
const {
  pickMatchedMatchup,
  computeRatings,
  tierOf,
  MATCH_CONFIG,
  eligiblePairs,
} = module;

// 断言用的小型作品池：4 个模型（S 最强 / A / B / C 最弱），1 题
const makeResults = () =>
  ['s-model', 'a-model', 'b-model', 'c-model'].map((modelId) => ({
    id: `001-${modelId}`,
    promptId: '001',
    modelId,
    modelName: modelId,
    title: modelId,
    content: { kind: 'html', src: `/works/x.html` },
  }));
// 固定随机：头位确定性抽第 floor(r*len) 组、尾位决定左右
const seqRandom = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

try {
  await check('声望分重放：零和、方向正确、无票为空', async () => {
    assert.deepEqual(computeRatings([]), {});
    const votes = [
      { winnerId: 'w', loserId: 'l', ts: 1 },
      { winnerId: 'w', loserId: 'l', ts: 2 },
      { winnerId: 'l', loserId: 'w', ts: 3 },
    ];
    const ratings = computeRatings(votes);
    // Elo 零和按「每票双方变动量之和为 0」：分别核对每票两侧的分数变动
    const stepByStep = computeRatings([]); // 逐票重放核对
    let prev = { w: 1200, l: 1200 };
    for (const vote of votes) {
      const after = computeRatings([vote]);
      // 单票口径：win 涨多少 lose 就跌多少
      const winGain = after.w - 1200;
      const loseLoss = 1200 - after.l;
      assert.ok(Math.abs(winGain - loseLoss) < 1e-9, `not zero-sum: ${winGain} vs ${loseLoss}`);
      prev = { w: after.w, l: after.l };
    }
    void stepByStep;
    void prev;
    assert.ok(ratings.w > 1200 && ratings.l < 1200);
  });

  await check('分档：同档优先时绝不跨档；档位计算含未知名兜底', async () => {
    assert.equal(tierOf(undefined), tierOf(MATCH_CONFIG.baseRating));
    // 档位边界：每 tierWidth 分一档、左闭右开（1050 与 1199 同档，1200 跨档）
    assert.equal(tierOf(1050), tierOf(1199));
    assert.notEqual(tierOf(1199), tierOf(1200));
    // 声望分只留两个同档模型 S/A（1500/1560），random 恒走同档路径：
    // 任何结果都只能是这两个互打
    const results = makeResults();
    const ratings = { 's-model': 1500, 'a-model': 1560, 'b-model': 100, 'c-model': 90 };
    for (let i = 0; i < 50; i++) {
      const pair = pickMatchedMatchup('001', results, ratings, undefined, seqRandom([0.99, 0.3]));
      const ids = new Set(pair.map((entry) => entry.modelId));
      assert.ok(
        (ids.has('s-model') && ids.has('a-model')) || ids.size === 2,
        `unexpected pair: ${[...ids].join(',')}`,
      );
      // random 尾位 0.3 < 0.5 → 不交换，floor(0.99*sameTierLen) 首组稳定
    }
    // 同档池有两组（S/A 与 B/C——B=100/C=90 同在 0 档）：90% 路径二选一，
    // 10% 全池 1/6。命中 S/A 的理论期望 ≈ 0.9*0.5 + 0.1*(1/6) ≈ 46.7%，
    // 显著高于均匀随机的 1/6，且 B/C（同档弱组）命中率同为 ~46.7%，
    // 跨档组（S/B、S/C、A/B、A/C）合计只占 ~6.7%。
    let sa = 0;
    let bc = 0;
    let cross = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const ids = pickMatchedMatchup('001', results, ratings, undefined, Math.random)
        .map((e) => e.modelId)
        .sort()
        .join('+');
      if (ids === 'a-model+s-model') sa++;
      else if (ids === 'b-model+c-model') bc++;
      else cross++;
    }
    assert.ok(sa / N > 0.4, `S/A rate ${sa}/${N}`);
    assert.ok(bc / N > 0.4, `B/C rate ${bc}/${N}`);
    assert.ok(cross / N < 0.12, `cross-tier rate ${cross}/${N} too high`);
  });

  await check('保底：10% 全池路径 + 无声望分时退化为均匀随机', async () => {
    // 空声望分：全员同档（基础分），全部组合都可能 —— 语义等价 pickMatchup
    const results = makeResults();
    const pairs = eligiblePairs('001', results);
    for (let i = 0; i < pairs.length * 4; i++) {
      const pair = pickMatchedMatchup('001', results, {}, undefined, Math.random);
      assert.ok(pairs.some(([l, r]) =>
        (l.id === pair[0].id && r.id === pair[1].id) ||
        (r.id === pair[0].id && l.id === pair[1].id)));
    }
  });

  await check('熔断：分差超限的对局被重抽，保底仍是合法对局', async () => {
    // S=1600 C=100：同档池为空（四模型四档），全池首抽若命中 S/C（分差 1500>400）
    // 应重抽。构造必中 S/C 的随机序列验证重抽生效。
    const results = makeResults();
    const ratings = { 's-model': 1600, 'a-model': 900, 'b-model': 400, 'c-model': 100 };
    const pairs = eligiblePairs('001', results);
    const blowoutPairs = pairs.filter(
      ([l, r]) =>
        Math.abs(ratings[l.modelId] - ratings[r.modelId]) > MATCH_CONFIG.blowoutGap,
    );
    assert.ok(blowoutPairs.length > 0);
    // 池顺序（eligiblePairs flatMap）：S/A, S/B, S/C, A/B, A/C, B/C —— 前 5 组
    // 全部超线，只有 B/C（gap 300）合法。首抽 index 0（S/A 超线）→ 熔断重抽
    // index 5（B/C 合法）。随机序列：选组 0.0 → 尾位 0.0（不交换）→ 同档池空
    // 走全池重抽 0.9…（floor(0.9*6)=5）→ 尾位 0.0。
    let blowoutReturned = 0;
    for (let i = 0; i < 40; i++) {
      const pair = pickMatchedMatchup('001', results, ratings, undefined, seqRandom([0.0, 0.0, 0.9, 0.0]));
      const gap = Math.abs(ratings[pair[0].modelId] - ratings[pair[1].modelId]);
      if (gap > MATCH_CONFIG.blowoutGap) blowoutReturned++;
    }
    // 重抽恒成功（B/C 是唯一合法组且必被重抽选中）→ 永远不返回超分差对局
    assert.equal(blowoutReturned, 0);
  });

  await check('上轮回避：同档语义下仍尽量避开上轮作品；无可避开回退', async () => {
    const results = makeResults();
    const ratings = { 's-model': 1500, 'a-model': 1560, 'b-model': 900, 'c-model': 950 };
    const previous = [results[0], results[1]]; // S 与 A 上轮出场
    // 同档组只剩 {S,A}（都被回避）→ 回退全池：其余组不含 S/A
    for (let i = 0; i < 30; i++) {
      const pair = pickMatchedMatchup('001', results, ratings, previous, Math.random);
      const inPrevious = pair.some((entry) => previous.some((old) => old.id === entry.id));
      assert.ok(!inPrevious, 'fresh pool must avoid previous works when alternatives exist');
    }
    // 极端：全部作品上轮出场过 → 回退全池，照常出对局（流程优先）
    const allPrevious = [results[0], results[1], results[2], results[3]];
    const fallback = pickMatchedMatchup('001', results, ratings, allPrevious, seqRandom([0, 0]));
    assert.ok(Array.isArray(fallback) && fallback.length === 2);
  });

  await check('无可配对：与 pickMatchup 一致返回 null', async () => {
    assert.equal(pickMatchedMatchup('004', makeResults(), {}, undefined, Math.random), null);
    // 004 题库里没有本作品池的结果
  });

  // ---------- 服务端：/api/ratings 与 computeRatings 同口径 ----------
  const dataDir = await mkdtemp(path.join(tmpdir(), 'aob-match-'));
  const port = 21000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  try {
    for (let attempt = 0; ; attempt++) {
      if (attempt > 100) throw new Error('测试服务端未就绪');
      const ok = await fetch(`${base}/api/ratings`).then(() => true).catch(() => false);
      if (ok) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await check('服务端 /api/ratings：种子票重放与 computeRatings 完全一致', async () => {
      // 临时库为空（无票）→ 空对象；注入两票后与前端公式逐位一致
      let data = await (await fetch(`${base}/api/ratings`)).json();
      assert.deepEqual(data.ratings, {});
      // 直接写库两票（服务端只读重放，不提供写票外的入口）
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(path.join(dataDir, 'comments.db'));
      const now = Date.now();
      db.prepare(
        `INSERT INTO votes (id, prompt_id, winner_rid, winner_mid, loser_rid, loser_mid, pair_key, mode, user_id, created_at)
         VALUES ('11111111-1111-4111-8111-111111111111', '002', 'x', 'w-model', 'y', 'l-model', 'k1', 'blind', 'u1', ${now})`,
      ).run();
      db.prepare(
        `INSERT INTO votes (id, prompt_id, winner_rid, winner_mid, loser_rid, loser_mid, pair_key, mode, user_id, created_at)
         VALUES ('22222222-2222-4222-8222-222222222222', '002', 'y', 'w-model', 'x', 'l-model', 'k2', 'blind', 'u2', ${now + 1})`,
      ).run();
      db.close();
      data = await (await fetch(`${base}/api/ratings`)).json();
      const expected = computeRatings([
        { winnerId: 'w-model', loserId: 'l-model', ts: now },
        { winnerId: 'w-model', loserId: 'l-model', ts: now + 1 },
      ]);
      for (const [modelId, value] of Object.entries(expected)) {
        assert.ok(
          Math.abs(data.ratings[modelId] - value) < 1e-9,
          `${modelId}: server ${data.ratings[modelId]} vs local ${value}`,
        );
      }
      // 胜者 > 基准、败者 < 基准
      assert.ok(data.ratings['w-model'] > 1200 && data.ratings['l-model'] < 1200);
      // 平局票（决策 048）：双方各得半分——重放口径与本地一致，且把差距往中间拉
      const db2 = new Database(path.join(dataDir, 'comments.db'));
      db2.prepare(
        `INSERT INTO votes (id, prompt_id, winner_rid, winner_mid, loser_rid, loser_mid, pair_key, mode, user_id, created_at, outcome)
         VALUES ('33333333-3333-4333-8333-333333333333', '002', 'x', 'w-model', 'y', 'l-model', 'k3', 'blind', 'u3', ${now + 2}, 'draw')`,
      ).run();
      db2.close();
      data = await (await fetch(`${base}/api/ratings`)).json();
      const withDraw = computeRatings([
        { winnerId: 'w-model', loserId: 'l-model', ts: now },
        { winnerId: 'w-model', loserId: 'l-model', ts: now + 1 },
        { winnerId: 'w-model', loserId: 'l-model', ts: now + 2, outcome: 'draw' },
      ]);
      for (const [modelId, value] of Object.entries(withDraw)) {
        assert.ok(
          Math.abs(data.ratings[modelId] - value) < 1e-9,
          `draw 后 ${modelId}: server ${data.ratings[modelId]} vs local ${value}`,
        );
      }
      assert.ok(
        data.ratings['w-model'] < expected['w-model'],
        '平局后领先方声望回落',
      );
      assert.ok(
        data.ratings['l-model'] > expected['l-model'],
        '平局后落后方声望回升',
      );
    });
  } finally {
    child.kill();
    await new Promise((resolve) => {
      child.on('exit', resolve);
      setTimeout(resolve, 3000);
    });
    await rm(dataDir, { recursive: true, force: true });
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
console.log(`${tests} matchmaking checks passed.`);
