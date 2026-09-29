// 模一把校验（决策 057）：lib/guess-logic.ts 的判定规则、每日答案派生的
// 确定性与稳定性、数据集完整性。纯断言（同 validate-arena 模式），
// 后半段起真实 server 比对 /api/guess/* 接口的判定口径。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createJiti } from 'jiti';

let tests = 0;
async function check(name, test) {
  await test();
  tests++;
  console.log(`PASS ${name}`);
}

// jiti 加载 TS 模块（与 server/index.js 同一方式），保证口径一致
const jiti = createJiti(import.meta.url);
const logic = await jiti.import('../lib/guess-logic.ts');
const {
  GUESS_MODELS,
  ATTRIBUTE_KEYS,
  judge,
  answerForDate,
  dayNumber,
  guessDayKey,
  resolveGuess,
  searchGuessModels,
  GUESS_EPOCH,
  PRICE_BAND_EDGES,
  PRICE_TIERS,
  GUESS_DIFFICULTIES,
  DAILY_DIFFICULTIES,
  poolForDifficulty,
  dailyPool,
  VENDOR_REGION,
} = logic;

// ── 分池冻结（决策 079，081 改层叠语义）──
// 钉住主数据集每档的专属槽位构成（difficulty === k；组算一槽，槽 id 排序后
// sha256 前 16 位）。层叠池（≤k）由它推导——专属集合不变，池就不会变。
// 改任何模型的 difficulty 都会让指纹断言失败——「重新分池」从靠人记住红线
// 变成机器拦意外。有意的调整走 docs/games/guess.md「分池定稿」流程：
// 用户拍板 → 改数据集 → 重算并更新这里的指纹 → DECISIONS.md 记一条。
// 只覆盖主数据集（lib/guess-models.json）；后台增量条目走 sinceDay 契约，
// 不进本指纹。本版指纹 = 2026-09-16 第一版映射（29 条退役入地狱 + 66 条新增）。
const POOL_FINGERPRINTS = {
  1: { slots: 40, hash: '2661a1ade90a0bb3' },
  2: { slots: 33, hash: 'd17136db3a6b2d4f' },
  3: { slots: 66, hash: '775d5c3cdf953475' },
  4: { slots: 29, hash: '5001a15d88c8f56f' },
};

try {
  // ── 数据集完整性 ──
  await check('数据集规模 ≥ 100（广泛收录口径）', () => {
    assert.ok(GUESS_MODELS.length >= 100, `实际 ${GUESS_MODELS.length}`);
  });

  await check('id 唯一且非空', () => {
    const ids = new Set(GUESS_MODELS.map((m) => m.id));
    assert.equal(ids.size, GUESS_MODELS.length);
    for (const m of GUESS_MODELS) assert.match(m.id, /^[\w.-]+$/);
  });

  await check('name 唯一（不区分大小写）且非空', () => {
    const names = new Set(GUESS_MODELS.map((m) => m.name.toLowerCase()));
    assert.equal(names.size, GUESS_MODELS.length);
  });

  await check('released 全部为 YYYY-MM 合法值', () => {
    for (const m of GUESS_MODELS) {
      assert.match(m.released, /^\d{4}-(0[1-9]|1[0-2])$/, `${m.name}: ${m.released}`);
    }
  });

  await check('modalities 含 text 且只含已知值', () => {
    const known = new Set(['text', 'image', 'audio', 'video']);
    for (const m of GUESS_MODELS) {
      assert.ok(m.modalities.includes('text'), m.name);
      for (const mod of m.modalities) assert.ok(known.has(mod), `${m.name}: ${mod}`);
    }
  });

  await check('priceTier ∈ 0-4 或 null', () => {
    for (const m of GUESS_MODELS)
      assert.ok(
        m.priceTier === null || (Number.isInteger(m.priceTier) && m.priceTier >= 0 && m.priceTier <= 4),
        `${m.name}: ${m.priceTier}`,
      );
  });

  // ── 价格档（方案 A，2026-09-13 定稿）：priceOut=官方一手输出单价，
  //    档位由 PRICE_BAND_EDGES 划定，不依赖数据集字符串档 ──
  await check('价格档：priceOut 与档位边界一一对应', () => {
    for (const m of GUESS_MODELS) {
      if (m.priceOut === null) {
        assert.equal(m.priceTier, null, `${m.name}: priceOut null 但档位非 null`);
        continue;
      }
      let expected = PRICE_BAND_EDGES.length;
      for (let i = 0; i < PRICE_BAND_EDGES.length; i++)
        if (m.priceOut < PRICE_BAND_EDGES[i]) { expected = i; break; }
      assert.equal(m.priceTier, expected, `${m.name}: $${m.priceOut} 应为 ${expected} 档`);
    }
  });

  await check('价格档：旗舰条目档位符合直觉（防聚合商免费价回归）', () => {
    const expect = [
      ['gpt-5', 3, 'GPT-5 $10 应为贵'],
      ['claude-opus-4-5', 4, 'Claude Opus 4.5 $25 应为旗舰'],
      ['glm-5-2', 2, 'GLM-5.2 $4.4 应为中等'],
      ['kimi-k3', 3, 'Kimi K3 $15 应为贵'],
      ['deepseek-v4-flash', 1, 'DeepSeek V4 Flash $0.6 应为便宜'],
    ];
    for (const [id, tier, why] of expect) {
      const m = GUESS_MODELS.find((x) => x.id === id);
      assert.ok(m, `数据集缺少 ${id}`);
      assert.equal(m.priceTier, tier, `${why}（实际 ${m.priceTier}）`);
    }
  });

  await check('价格档：分布有区分度（free 污染不回归——任一档不超 60%）', () => {
    const counts = [0, 0, 0, 0, 0];
    let known = 0;
    for (const m of GUESS_MODELS) {
      if (m.priceTier === null) continue;
      counts[m.priceTier]++;
      known++;
    }
    const maxShare = Math.max(...counts) / known;
    assert.ok(
      maxShare <= 0.6,
      `最大档占比 ${(maxShare * 100).toFixed(0)}%，价格属性失去区分度: ${counts.join('/')}`,
    );
    // 五档文案齐备
    assert.equal(PRICE_TIERS.length, 5);
  });

  await check('contextK 为正数或 null', () => {
    for (const m of GUESS_MODELS)
      assert.ok(
        m.contextK === null || (Number.isFinite(m.contextK) && m.contextK > 0),
        `${m.name}: ${m.contextK}`,
      );
  });

  // ── 合并组（决策 061）：同线小版本并入一组，组占一个答案槽 ──
  await check('合并组：variants ≥2、变体字段完整、难度只挂在组上', () => {
    const raw = JSON.parse(
      readFileSync(new URL('../lib/guess-models.json', import.meta.url), 'utf8'),
    );
    const ids = new Set();
    let groups = 0;
    for (const e of raw.models) {
      assert.ok(!ids.has(e.id), `条目 id 重复: ${e.id}`);
      ids.add(e.id);
      if (!e.variants) continue;
      groups++;
      assert.ok(e.variants.length >= 2, `${e.id} 组只有 ${e.variants.length} 个版本`);
      assert.ok(
        GUESS_DIFFICULTIES.includes(e.difficulty),
        `${e.id} 组 difficulty=${e.difficulty}`,
      );
      for (const v of e.variants) {
        assert.ok(!('difficulty' in v), `${e.id}/${v.id} 变体应继承组难度`);
        for (const f of ['id', 'name', 'org', 'year', 'month', 'openWeights', 'modality', 'reasoning'])
          assert.notEqual(v[f], undefined, `${e.id}/${v.id} 缺字段 ${f}`);
        assert.ok(!ids.has(v.id), `变体 id 重复: ${v.id}`);
        ids.add(v.id);
      }
    }
    assert.ok(groups > 0, '数据集应有合并组');
  });

  await check('合并组：同组变体落入同一难度池（分池以组为单位）', () => {
    const byGroup = new Map();
    for (const m of GUESS_MODELS) {
      if (!m.groupId) continue;
      const g = byGroup.get(m.groupId) ?? new Set();
      g.add(m.difficulty);
      byGroup.set(m.groupId, g);
    }
    for (const [gid, ds] of byGroup)
      assert.equal(ds.size, 1, `组 ${gid} 的难度被拆散到多个池`);
  });

  // ── 后台增量文件（data/guess-models-extra.json，存在才校验）──
  // 注意：这里校验的是文件本身，不注册进本进程的 GUESS_MODELS——下文起的
  // 真实 server 用临时 DATA_DIR 也读不到它，两边口径保持一致。
  await check('增量文件：字段齐全、id/name 不冲突、厂商有地区登记', () => {
    const extraPath = new URL(
      '../data/guess-models-extra.json',
      import.meta.url,
    );
    if (!existsSync(extraPath)) return; // 后台还没加过模型
    const extra = JSON.parse(readFileSync(extraPath, 'utf8'));
    const baseIds = new Set(GUESS_MODELS.map((m) => m.id));
    const baseNames = new Set(GUESS_MODELS.map((m) => m.name.toLowerCase()));
    const regions = { ...VENDOR_REGION, ...extra.vendorRegions };
    const seen = new Set();
    for (const e of extra.models ?? []) {
      assert.ok(!e.variants?.length, `${e.id} 增量不支持合并组`);
      for (const f of [
        'id', 'name', 'org', 'year', 'month',
        'openWeights', 'modality', 'reasoning', 'popularity', 'difficulty',
        'sinceDay',
      ])
        assert.notEqual(e[f], undefined, `${e.id} 缺字段 ${f}`);
      assert.ok(
        Number.isInteger(e.sinceDay) && e.sinceDay >= 0,
        `${e.id} sinceDay 须为非负整数（缺了会落进基础槽、改历史答案）`,
      );
      assert.ok(!baseIds.has(e.id) && !seen.has(e.id), `增量 id 冲突: ${e.id}`);
      assert.ok(!baseNames.has(e.name.toLowerCase()), `增量 name 冲突: ${e.name}`);
      assert.ok(regions[e.org], `${e.id} 厂商 ${e.org} 未登记地区`);
      assert.ok(GUESS_DIFFICULTIES.includes(e.difficulty), `${e.id} difficulty`);
      seen.add(e.id);
    }
  });

  // ── 难度分池（决策 060 三档 → 079 四档 → 081 层叠）──
  await check('难度：difficulty ∈ 1-4，四池层叠包含、每档有专属模型', () => {
    for (const m of GUESS_MODELS)
      assert.ok(
        GUESS_DIFFICULTIES.includes(m.difficulty),
        `${m.name}: difficulty=${m.difficulty}`,
      );
    const pools = GUESS_DIFFICULTIES.map((d) => poolForDifficulty(GUESS_MODELS, d));
    const idSets = pools.map((pool) => new Set(pool.map((m) => m.id)));
    // 层叠：pool₁ ⊆ pool₂ ⊆ pool₃ ⊆ pool₄，且地狱池 = 全集
    for (let i = 0; i < idSets.length - 1; i++)
      for (const id of idSets[i])
        assert.ok(idSets[i + 1].has(id), `难度 ${i + 1} 池的 ${id} 不在难度 ${i + 2} 池里`);
    assert.equal(idSets[3].size, GUESS_MODELS.length, '地狱池应是全库');
    // 池大小单调不减
    for (let i = 0; i < pools.length - 1; i++)
      assert.ok(
        pools[i + 1].length >= pools[i].length,
        `难度 ${i + 2} 池（${pools[i + 1].length}）小于难度 ${i + 1} 池（${pools[i].length}）`,
      );
    // 每档都有专属模型（difficulty === k 非空）——任一档空了说明分档塌了
    for (const d of GUESS_DIFFICULTIES)
      assert.ok(
        GUESS_MODELS.some((m) => m.difficulty === d),
        `难度 ${d} 没有专属模型`,
      );
    // 简单池与每日池（≤2）是可玩性基本盘，单独保底
    assert.ok(pools[0].length >= 10, `简单池太小: ${pools[0].length}`);
    assert.ok(
      dailyPool(GUESS_MODELS).length >= 20,
      `每日池太小: ${dailyPool(GUESS_MODELS).length}`,
    );
  });

  await check('分池冻结：各档专属槽位构成与 081 指纹一致', () => {
    const slotOf = (m) => m.groupId ?? m.id;
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // code-unit 序，与默认字符串排序一致
    for (const d of GUESS_DIFFICULTIES) {
      const slots = [
        ...new Set(GUESS_MODELS.filter((m) => m.difficulty === d).map(slotOf)),
      ].sort(cmp);
      const hash = createHash('sha256')
        .update(slots.join(','))
        .digest('hex')
        .slice(0, 16);
      const frozen = POOL_FINGERPRINTS[d];
      assert.ok(frozen, `难度 ${d} 缺少冻结指纹`);
      assert.equal(
        slots.length,
        frozen.slots,
        `难度 ${d} 专属槽数变了：${frozen.slots} → ${slots.length}（分池调整须走 081 定稿流程并更新指纹）`,
      );
      assert.equal(
        hash,
        frozen.hash,
        `难度 ${d} 专属槽位构成变了（分池调整须走 081 定稿流程并更新指纹）`,
      );
    }
  });

  await check('难度：各池答案派生确定、相邻两天不同题、十年全覆盖', () => {
    for (const d of GUESS_DIFFICULTIES) {
      // 层叠语义下各池必非空（「每档有专属模型」断言先行保证），不再有空池分支
      const pool = poolForDifficulty(GUESS_MODELS, d);
      // 同日确定性
      const noon = new Date('2026-10-01T04:00:00Z');
      const night = new Date('2026-10-01T15:30:00Z');
      assert.equal(
        answerForDate(noon, pool).id,
        answerForDate(night, pool).id,
        `难度 ${d} 同日答案不稳定`,
      );
      // 相邻两天不同题
      for (let i = 0; i < 60; i++) {
        const a = answerForDate(new Date(2026, 8, 13 + i), pool);
        const b = answerForDate(new Date(2026, 8, 14 + i), pool);
        assert.notEqual(a.id, b.id, `难度 ${d} day ${i} 与次日同题`);
      }
      // 答案必在池内 + 十年全槽位覆盖、组内版本均被实例化（决策 061）
      // 层叠语义（081）：池 = difficulty ≤ d，答案的 difficulty ≤ d 即在池内
      const slotOf = (m) => m.groupId ?? m.id;
      const counts = new Map();
      const variantSeen = new Set();
      for (let i = 0; i < 3650; i++) {
        const a = answerForDate(new Date(2026, 8, 13 + i), pool);
        assert.ok(a.difficulty <= d, `难度 ${d} 出了池外模型 ${a.name}`);
        counts.set(slotOf(a), (counts.get(slotOf(a)) ?? 0) + 1);
        variantSeen.add(a.id);
      }
      const slotTotal = new Set(pool.map(slotOf)).size;
      assert.equal(counts.size, slotTotal, `难度 ${d} 十年未全槽位覆盖`);
      for (const m of pool)
        assert.ok(variantSeen.has(m.id), `难度 ${d} 的 ${m.name} 从未被实例化`);
    }
  });

  // ── 判定规则 ──
  await check('judge：自己猜自己全 hit（未公开属性除外）、won=true', () => {
    for (const m of GUESS_MODELS) {
      const fb = judge(m, m);
      assert.ok(fb.won, m.name);
      for (const key of ATTRIBUTE_KEYS) {
        // contextK/priceTier 未公开时，自己对自己也是 unknown（诚实口径，非 hit）。
        const expect =
          key === 'contextK' ? (m.contextK !== null ? 'hit' : 'unknown')
          : key === 'priceTier' ? (m.priceTier !== null ? 'hit' : 'unknown')
          : 'hit';
        assert.equal(fb.attributes[key].state, expect, `${m.name}.${key}`);
      }
    }
  });

  await check('judge：厂商同厂商 hit；同国家/地区不同厂商 near；跨国 miss', () => {
    const a = GUESS_MODELS.find((m) => m.vendor === 'OpenAI');
    assert.equal(judge(a, a).attributes.vendor.state, 'hit');
    // 同国不同厂商（OpenAI 与 xAI 同为美国）→ near 且无箭头
    const sameRegion = GUESS_MODELS.find((m) => m.vendor === 'xAI');
    const nearFb = judge(sameRegion, a).attributes.vendor;
    assert.equal(nearFb.state, 'near');
    assert.equal(nearFb.arrow, null);
    // 跨国（DeepSeek 中国 vs OpenAI 美国）→ miss
    const cross = GUESS_MODELS.find((m) => m.vendor === 'DeepSeek');
    assert.equal(judge(cross, a).attributes.vendor.state, 'miss');
  });

  await check('厂商地区：数据集所有 org 都在 VENDOR_REGION 登记（无 ?? 回落）', () => {
    for (const m of GUESS_MODELS)
      assert.notEqual(m.region, '??', `${m.name} 的厂商 ${m.vendor} 未登记地区`);
  });

  await check('judge：数值属性箭头方向正确（答案更晚/更大 → up）', () => {
    const early = GUESS_MODELS.find((m) => m.released < '2022-01' && m.contextK);
    const late = GUESS_MODELS.find(
      (m) => m.released > '2025-06' && m.contextK && m.contextK > (early?.contextK ?? 0),
    );
    if (early && late) {
      const fb = judge(early, late);
      assert.equal(fb.attributes.released.arrow, 'up');
      if (late.contextK > early.contextK)
        assert.equal(fb.attributes.contextK.arrow, 'up');
    }
  });

  await check('judge：未公开属性 → unknown 且无箭头（不惩罚）', () => {
    const unknownPrice = GUESS_MODELS.find((m) => m.priceTier === null);
    const knownPrice = GUESS_MODELS.find((m) => m.priceTier !== null);
    if (unknownPrice && knownPrice) {
      const fb = judge(knownPrice, unknownPrice);
      assert.equal(fb.attributes.priceTier.state, 'unknown');
      assert.equal(fb.attributes.priceTier.arrow, null);
    }
  });

  await check('judge：模态相同=绿 / 不同多模态=黄 / 一纯一多=灰', () => {
    const answer = GUESS_MODELS.find((m) => m.name === 'Claude Opus 4.6');
    assert.ok(answer);
    // 用户截图：不同模型只要同为「图」，也应为绿；胜负仍按模型身份。
    for (const name of ['GPT-4.1', 'Claude Opus 5', 'Claude Fable 5', 'Claude Opus 4.6']) {
      const guess = GUESS_MODELS.find((m) => m.name === name);
      assert.ok(guess, name);
      const feedback = judge(guess, answer);
      assert.deepEqual(feedback.attributes.modalities, { state: 'hit', arrow: null }, name);
      assert.equal(feedback.won, guess.id === answer.id, name);
    }
    const cases = [
      [['text'], ['text'], 'hit'],
      [['text', 'image', 'audio', 'video'], ['video', 'audio', 'image', 'text'], 'hit'],
      [['text', 'image'], ['image', 'text', 'image'], 'hit'],
      [['text', 'image'], ['text', 'image', 'video'], 'near'],
      [['text', 'image'], ['text', 'audio'], 'near'],
      [['text'], ['text', 'image'], 'miss'],
    ];
    for (const [left, right, state] of cases) {
      const a = { ...answer, id: 'guess', modalities: left };
      const b = { ...answer, id: 'answer', modalities: right };
      assert.deepEqual(judge(a, b).attributes.modalities, { state, arrow: null });
      assert.deepEqual(judge(b, a).attributes.modalities, { state, arrow: null });
    }
  });

  await check('judge：价格档相邻档=黄+箭头、差≥2档=灰+箭头、同档=绿、未公开=?', () => {
    // 合成最小模型，只填 judge 用到的字段。相邻档必须全档位给黄——
    // 旧实现把档位序数喂给比值分支，0↔1（1/0=∞）与 1↔2（2>1.5）都错给灰
    const mk = (priceTier) => ({
      id: `zz-tier-${priceTier}`, name: `ZZ Tier ${priceTier}`, vendor: 'OpenAI',
      region: 'US', released: '2026-01', openWeights: false, contextK: 128,
      modalities: ['text'], reasoning: false, priceOut: null, priceTier,
      popularity: 0, difficulty: 1,
    });
    const t = (g, a) => judge(mk(g), mk(a)).attributes.priceTier;
    for (const [g, a] of [[0, 1], [1, 0], [1, 2], [2, 3], [3, 4]])
      assert.equal(t(g, a).state, 'near', `档 ${g}↔${a} 相邻应给黄`);
    assert.equal(t(1, 2).arrow, 'up');
    assert.equal(t(2, 1).arrow, 'down');
    for (const [g, a] of [[0, 2], [0, 4], [4, 2], [1, 4]])
      assert.equal(t(g, a).state, 'miss', `档 ${g}↔${a} 差≥2 应给灰`);
    assert.equal(t(0, 2).arrow, 'up');
    assert.deepEqual(t(2, 2), { state: 'hit', arrow: null });
    assert.deepEqual(t(null, 2), { state: 'unknown', arrow: null });
    assert.deepEqual(t(2, null), { state: 'unknown', arrow: null });
  });

  await check('judge：发布时间差≤6个月=黄+箭头、更远=灰+箭头、同月=绿', () => {
    // 合成最小模型。旧实现把 6 个月的阈值错送进比值分支，月份序号比值恒
    // ≈1，任意不同月都给黄、灰灯永不出现——这里钉住差 1 个月与差 7 个月
    const mk = (released) => ({
      id: `zz-rel-${released}`, name: `ZZ Rel ${released}`, vendor: 'OpenAI',
      region: 'US', released, openWeights: false, contextK: 128,
      modalities: ['text'], reasoning: false, priceOut: null, priceTier: 2,
      popularity: 0, difficulty: 1,
    });
    const rel = (g, a) => judge(mk(g), mk(a)).attributes.released;
    assert.deepEqual(rel('2026-01', '2026-01'), { state: 'hit', arrow: null });
    assert.deepEqual(rel('2026-01', '2026-07'), { state: 'near', arrow: 'up' });
    assert.deepEqual(rel('2026-07', '2026-01'), { state: 'near', arrow: 'down' });
    // 恰好 6 个月（含首尾月）仍是黄；跨年同样按月差算
    assert.equal(rel('2026-02', '2026-08').state, 'near');
    assert.equal(rel('2025-11', '2026-05').state, 'near');
    assert.deepEqual(rel('2026-01', '2026-08'), { state: 'miss', arrow: 'up' });
    assert.equal(rel('2020-01', '2026-01').state, 'miss');
  });

  // ── 每日答案派生 ──
  await check('答案派生：同一天任何时刻调用结果一致（确定性）', () => {
    const noon = new Date('2026-10-01T04:00:00Z'); // UTC+8 12:00
    const night = new Date('2026-10-01T15:30:00Z'); // UTC+8 23:30
    assert.equal(answerForDate(noon).id, answerForDate(night).id);
  });

  await check('答案派生：UTC+8 日界正确切换', () => {
    const beforeMidnight = new Date('2026-10-01T15:59:00Z'); // UTC+8 23:59
    const afterMidnight = new Date('2026-10-01T16:01:00Z'); // UTC+8 00:01
    assert.notEqual(
      answerForDate(beforeMidnight).id,
      answerForDate(afterMidnight).id,
    );
  });

  await check('答案派生：90 天内无 30 天内重复出题', () => {
    const seen = new Map();
    for (let d = 0; d < 90; d++) {
      const date = new Date(2026, 8, 13 + d); // 从 epoch 当天开始扫 90 天
      const id = answerForDate(date).id;
      if (seen.has(id)) {
        const gap = d - seen.get(id);
        assert.ok(gap > 30, `${id} 相隔 ${gap} 天重现（<30 天）`);
      }
      seen.set(id, d);
    }
  });

  await check('答案派生：dayNumber 用真历法（月末无跳变）', () => {
    // 2026-10-13 → 2026-11-13：真实间隔 31 天，旧 months*30 近似会少 1
    const oct = dayNumber(new Date(2026, 9, 13));
    const nov = dayNumber(new Date(2026, 10, 13));
    assert.equal(nov - oct, 31);
    // 相邻日期 dayNumber 必差 1（扫含月末的一整月）
    for (let d = 0; d < 31; d++) {
      const a = dayNumber(new Date(2026, 9, 1 + d));
      const b = dayNumber(new Date(2026, 9, 2 + d));
      assert.equal(b - a, 1, `10月${1 + d}日→${2 + d}日: ${a}→${b}`);
    }
  });

  await check('答案派生：相邻两天必不同题', () => {
    for (let d = 0; d < 60; d++) {
      const a = answerForDate(new Date(2026, 8, 13 + d));
      const b = answerForDate(new Date(2026, 8, 14 + d));
      assert.notEqual(a.id, b.id, `day ${d} 与次日同题`);
    }
  });

  await check('答案派生：十年周期槽位全覆盖、组内版本均被实例化', () => {
    const slotOf = (m) => m.groupId ?? m.id;
    const slotCounts = new Map();
    const variantSeen = new Set();
    for (let d = 0; d < 3650; d++) {
      const a = answerForDate(new Date(2026, 8, 13 + d));
      const slot = slotOf(a);
      slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
      variantSeen.add(a.id);
    }
    // 槽位（组算一槽）十年全覆盖
    const slotTotal = new Set(GUESS_MODELS.map(slotOf)).size;
    assert.equal(slotCounts.size, slotTotal, `覆盖 ${slotCounts.size}/${slotTotal} 槽`);
    // 组内每个版本都至少被实例化过一次（两级散列确定性覆盖）
    for (const m of GUESS_MODELS)
      assert.ok(variantSeen.has(m.id), `${m.name} 十年从未被实例化为答案`);
    const values = [...slotCounts.values()];
    // 命中次数阈值随槽数走（均值 3650/槽数，081 数据集扩到 168 槽后绝对阈值失效）：
    // 下限 0.5×均值防「某槽几乎抽不到」，上限 1.6×均值防「某槽被刷爆」
    const avg = 3650 / slotTotal;
    assert.ok(
      Math.min(...values) >= Math.floor(avg * 0.5),
      `最少 ${Math.min(...values)} 次（均值 ${avg.toFixed(1)}）`,
    );
    assert.ok(
      Math.max(...values) <= Math.ceil(avg * 1.6),
      `最多 ${Math.max(...values)} 次（均值 ${avg.toFixed(1)}）`,
    );
  });

  await check('dayNumber：epoch 当天为 0、次日为 1', () => {
    assert.equal(dayNumber(new Date(2026, 8, 13, 12)), 0);
    assert.equal(dayNumber(new Date(2026, 8, 14, 12)), 1);
  });

  await check('guessDayKey：UTC+8 切日', () => {
    assert.equal(guessDayKey(new Date('2026-10-01T15:59:00Z')), '2026-10-01');
    assert.equal(guessDayKey(new Date('2026-10-01T16:01:00Z')), '2026-10-02');
  });

  await check('epoch 常量未被误改', () => {
    assert.equal(GUESS_EPOCH, '2026-09-13');
  });

  // ── resolveGuess ──
  await check('resolveGuess：大小写不敏感精确匹配', () => {
    const any = GUESS_MODELS[0];
    assert.equal(resolveGuess(any.name.toUpperCase())?.id, any.id);
    assert.equal(resolveGuess('  ' + any.name + '  ')?.id, any.id);
    assert.equal(resolveGuess('不存在的模型xyz'), null);
  });

  // ── searchGuessModels（搜索框补全）──
  await check('searchGuessModels：分隔符不敏感、乱序多词、前缀优先', () => {
    const has = (q, id) =>
      searchGuessModels(GUESS_MODELS, q, 50).some((m) => m.id === id);
    // 空格代替连字符 / 完全省略分隔符 / 省略小数点 都应命中
    assert.ok(has('gpt 5', 'gpt-5'));
    assert.ok(has('gpt5', 'gpt-5'));
    assert.ok(has('sonnet4.5', 'claude-sonnet-4-5'));
    assert.ok(has('llama3.3', 'llama-3-3-70b'));
    assert.ok(has('deepseekv3.2', 'deepseek-v3-2'));
    // 多词乱序（规范化子串拼不上，逐词全命中兜底）
    assert.ok(has('5.6 luna', 'gpt-5-6-luna'));
    assert.ok(has('luna gpt', 'gpt-5-6-luna'));
    // 前缀优先：精确前缀结果排在最前
    assert.equal(
      searchGuessModels(GUESS_MODELS, 'gpt-5', 8)[0].name,
      'GPT-5',
    );
    // 同档按 released 倒序：最新模型排最前
    const gptAll = searchGuessModels(GUESS_MODELS, 'gpt-', 50);
    assert.equal(gptAll[0].id, 'gpt-6-astra');
    for (let i = 1; i < gptAll.length; i++)
      assert.ok(
        gptAll[i - 1].released >= gptAll[i].released,
        `${gptAll[i - 1].name} 不应排在 ${gptAll[i].name} 前`,
      );
    // 全等档：输入完整旧名不被更新的兄弟抢走第一
    assert.equal(
      searchGuessModels(GUESS_MODELS, 'gpt-5', 8)[0].id,
      'gpt-5',
    );
    // 空查询与无命中
    assert.deepEqual(searchGuessModels(GUESS_MODELS, '   '), []);
    assert.deepEqual(searchGuessModels(GUESS_MODELS, '不存在的模型xyz'), []);
  });

  // ── 真实 server：/api/guess/* 与本地判定同口径 ──
  await check('服务端接口：today/check 与本地判定一致、答案不下发', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'guess-validate-'));
    const env = {
      ...process.env,
      PORT: '3997',
      DATA_DIR: dataDir,
      // 测试要打十几次写接口，放宽限流（生产默认 10 次/分钟）
      RATE_LIMIT_PER_MIN: '1000',
    };
    const child = spawn('node', ['server/index.js'], { env, stdio: 'ignore' });
    try {
      // 等 server 就绪
      let ready = false;
      for (let i = 0; i < 40 && !ready; i++) {
        await new Promise((r) => setTimeout(r, 250));
        try {
          const r = await fetch('http://127.0.0.1:3997/api/guess/today');
          ready = r.ok;
        } catch {
          /* not yet */
        }
      }
      assert.ok(ready, 'server 未就绪');

      const today = await (await fetch('http://127.0.0.1:3997/api/guess/today')).json();
      assert.equal(today.models.length, GUESS_MODELS.length);
      // 公开模型不带答案标记字段（答案就是模型之一，但响应里无『哪个是答案』信息）
      assert.equal(today.answer, undefined);
      // 难度标记下发，前端按它分池
      assert.ok(today.models.every((m) => GUESS_DIFFICULTIES.includes(m.difficulty)));

      const origin = 'http://127.0.0.1:3997';
      // 每日一题（决策 064/079）：答案从每日池（简单+标准）派生，困难与地狱档不进每日
      const answer = answerForDate(new Date(), dailyPool(GUESS_MODELS));
      assert.ok(
        DAILY_DIFFICULTIES.includes(answer.difficulty),
        '每日题只应从简单+标准池出',
      );
      const someOther = GUESS_MODELS.find((m) => m.id !== answer.id);

      // 错误猜测：不给答案
      const wrong = await (
        await fetch('http://127.0.0.1:3997/api/guess/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ guessId: someOther.id, final: false }),
        })
      ).json();
      assert.equal(wrong.answer, null);
      assert.equal(wrong.feedback.won, false);
      // 判定结果与本地 judge 一致
      const local = judge(someOther, answer);
      for (const key of ATTRIBUTE_KEYS)
        assert.deepEqual(wrong.feedback.attributes[key], local.attributes[key], key);

      // 命中：给答案
      const win = await (
        await fetch('http://127.0.0.1:3997/api/guess/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ guessId: answer.id, final: false }),
        })
      ).json();
      assert.equal(win.feedback.won, true);
      assert.equal(win.answer.id, answer.id);

      // final=true：即使没中也给答案（第 8 次揭晓口径）
      const final = await (
        await fetch('http://127.0.0.1:3997/api/guess/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ guessId: someOther.id, final: true }),
        })
      ).json();
      assert.equal(final.answer.id, answer.id);

      // 练习模式：开局发 gameId，判定走 gameId；过期局 404
      const start = await (
        await fetch('http://127.0.0.1:3997/api/guess/practice/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ difficulty: 3 }),
        })
      ).json();
      assert.ok(start.gameId, '练习开局应返回 gameId');
      const practiceGuess = await (
        await fetch('http://127.0.0.1:3997/api/guess/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ guessId: someOther.id, final: true, gameId: start.gameId }),
        })
      ).json();
      // 练习答案在该难度池里（层叠：≤所选档），且与每日答案无关
      assert.ok(practiceGuess.answer.difficulty <= 3);
      const expired = await fetch('http://127.0.0.1:3997/api/guess/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ guessId: someOther.id, gameId: 'no-such-game' }),
      });
      assert.equal(expired.status, 404);

      // 地狱档（079）：当前为空池，开局应被明确拒绝（503 带文案），
      // 而不是炸在空池取模；收录模型后应能正常开局
      const hellStart = await fetch(
        'http://127.0.0.1:3997/api/guess/practice/start',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ difficulty: 4 }),
        },
      );
      assert.equal(
        hellStart.status,
        poolForDifficulty(GUESS_MODELS, 4).length ? 200 : 503,
        '地狱档空池应明确拒开局，收录后应正常开局',
      );

      // 跨源拒绝
      const xorigin = await fetch('http://127.0.0.1:3997/api/guess/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
        body: JSON.stringify({ guessId: someOther.id }),
      });
      assert.equal(xorigin.status, 403);

      // 未知模型 400
      const unknown = await fetch('http://127.0.0.1:3997/api/guess/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ guessId: 'no-such-model' }),
      });
      assert.equal(unknown.status, 400);

      // ── 游玩数据上报（决策 063/064）：合法 204 落库、非法 400、跨源 403 ──
      // 064 起只有每日一题上报，不再带 difficulty；答案按每日池派生
      const okResult = await fetch('http://127.0.0.1:3997/api/guess/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ won: true, attempts: 3 }),
      });
      assert.equal(okResult.status, 204);
      // answer_id 由服务端按每日池派生，不是客户端说了算
      const resultDb = new Database(path.join(dataDir, 'comments.db'), {
        readonly: true,
      });
      const row = resultDb
        .prepare('SELECT answer_id, won, attempts, difficulty FROM guess_results')
        .get();
      resultDb.close();
      assert.equal(row.answer_id, answer.id);
      assert.equal(row.won, 1);
      assert.equal(row.attempts, 3);
      assert.equal(row.difficulty, 0, '每日题记 difficulty=0');

      const badAttempts = await fetch(
        'http://127.0.0.1:3997/api/guess/result',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ won: true, attempts: 9 }),
        },
      );
      assert.equal(badAttempts.status, 400);
      const badDay = await fetch('http://127.0.0.1:3997/api/guess/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({
          won: false,
          attempts: 8,
          dayKey: '2020-01-01',
        }),
      });
      assert.equal(badDay.status, 400);
      const xResult = await fetch('http://127.0.0.1:3997/api/guess/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
        body: JSON.stringify({ won: true, attempts: 3 }),
      });
      assert.equal(xResult.status, 403);

      // 后台接口未登录一律 401（requireAdmin 口径）
      const adminStats = await fetch(
        'http://127.0.0.1:3997/api/admin/guess/stats',
      );
      assert.equal(adminStats.status, 401);
      const adminAdd = await fetch(
        'http://127.0.0.1:3997/api/admin/guess/models',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ name: 'X' }),
        },
      );
      assert.equal(adminAdd.status, 401);
    } finally {
      child.kill();
      await new Promise((resolve) => {
        child.on('exit', resolve);
        setTimeout(resolve, 3000);
      });
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  // ── 追加契约（2026-09-14 修复）：增量模型 sinceDay 前不改答案 ──
  // 用独立 jiti 实例：registerExtraModels 会改模块内的 GUESS_MODELS，
  // 不能污染前面/真实 server 断言用的那份。
  await check('追加契约：增量模型不改当天与历史答案、次日起参与每日派生', () => {
    const jiti2 = createJiti(import.meta.url);
    const logic2 = jiti2.import('../lib/guess-logic.ts');
    return logic2.then((fresh) => {
      const poolBefore = fresh.dailyPool(fresh.GUESS_MODELS);
      const days = 120;
      const before = [];
      for (let d = 0; d < days; d++)
        before.push(
          fresh.answerForDate(new Date(2026, 8, 13 + d), poolBefore).id,
        );
      const tomorrow = fresh.dayNumber() + 1;
      const extraId = 'zz-extra-contract';
      fresh.registerExtraModels({
        models: [
          {
            id: extraId, name: 'ZZ Extra Contract', org: 'OpenAI', year: 2026,
            month: 9, openWeights: false, contextK: 128, modality: 'text',
            reasoning: false, priceOut: 5, popularity: 1, difficulty: 1,
            sinceDay: tomorrow,
          },
        ],
      });
      const poolAfter = fresh.dailyPool(fresh.GUESS_MODELS);
      // sinceDay 之前（含当天、全部历史）答案一字不差
      for (let d = 0; d < days; d++) {
        const date = new Date(2026, 8, 13 + d);
        if (fresh.dayNumber(date) < tomorrow)
          assert.equal(
            fresh.answerForDate(date, poolAfter).id,
            before[d],
            `day ${d} 因追加改答案`,
          );
      }
      // sinceDay 起十年内追加槽确实被抽到（进轮换而非永久旁置）
      let extraHits = 0;
      for (let d = tomorrow; d < tomorrow + 3650; d++)
        if (
          fresh.answerForDate(new Date(2026, 8, 13 + d), poolAfter).id ===
          extraId
        )
          extraHits++;
      assert.ok(extraHits > 0, '追加模型十年从未参与每日派生');
      // registerExtraModels 两阶段：批次里有 id 冲突时一个都不进数据集
      const sizeBefore = fresh.GUESS_MODELS.length;
      assert.throws(() =>
        fresh.registerExtraModels({
          models: [
            {
              id: 'zz-ok-entry', name: 'ZZ OK', org: 'OpenAI', year: 2026,
              month: 9, openWeights: false, contextK: 64, modality: 'text',
              reasoning: false, priceOut: 1, popularity: 0, difficulty: 1,
              sinceDay: tomorrow,
            },
            {
              id: extraId, name: 'Dup', org: 'OpenAI', year: 2026, month: 9,
              openWeights: false, contextK: 64, modality: 'text',
              reasoning: false, priceOut: 1, popularity: 0, difficulty: 1,
              sinceDay: tomorrow,
            },
          ],
        }),
      );
      assert.equal(fresh.GUESS_MODELS.length, sizeBefore, '坏批次不应部分注册');
      // 2026-09-15 收紧：缺 sinceDay 的增量条目整批拒收（防落进基础槽改历史答案）
      assert.throws(() =>
        fresh.registerExtraModels({
          models: [
            {
              id: 'zz-no-since', name: 'ZZ No Since', org: 'OpenAI', year: 2026,
              month: 9, openWeights: false, contextK: 64, modality: 'text',
              reasoning: false, priceOut: 1, popularity: 0, difficulty: 1,
            },
          ],
        }),
      );
      assert.equal(
        fresh.GUESS_MODELS.length,
        sizeBefore,
        '缺 sinceDay 的批次不应部分注册',
      );
      assert.ok(!fresh.GUESS_MODELS.some((m) => m.id === 'zz-no-since'));
      // 坏批次时 vendorRegions 整体回滚，不残留半套映射
      const zzOrg = 'ZZ Test Lab';
      assert.throws(() =>
        fresh.registerExtraModels({
          vendorRegions: { [zzOrg]: 'CN' },
          models: [
            {
              id: 'zz-vendor-bad', name: 'ZZ Vendor Bad', org: 'OpenAI',
              year: 2026, month: 9, openWeights: false, contextK: 64,
              modality: 'text', reasoning: false, priceOut: 1, popularity: 0,
              difficulty: 1, sinceDay: tomorrow,
            },
            {
              id: 'zz-vendor-bad', name: 'ZZ Dup 2', org: 'OpenAI', year: 2026,
              month: 9, openWeights: false, contextK: 64, modality: 'text',
              reasoning: false, priceOut: 1, popularity: 0, difficulty: 1,
              sinceDay: tomorrow,
            },
          ],
        }),
      );
      assert.equal(
        fresh.VENDOR_REGION[zzOrg],
        undefined,
        '坏批次后 vendorRegions 未回滚',
      );
    });
  });

  await check('跨零点守卫回归钉（2026-09-20 审查修复）：enterDaily 必须写回 today', async () => {
    // enterDaily 不写回 today 的话，跨零点守卫的收敛条件永不成立——每次提交
    // 都被丢弃，只能刷新页面（曾真实存在的 BUG，靠静态断言防回归）
    const source = readFileSync(new URL('../app/guess.tsx', import.meta.url), 'utf8');
    const body = source.match(/function enterDaily\([\s\S]*?\n  \}/)?.[0] ?? '';
    assert.ok(body.includes('setToday(data)'), 'enterDaily 必须写回 today');
    assert.ok(
      /fresh\.dayKey === today\.dayKey/.test(source),
      'dailyRolledOver 必须以服务端 dayKey 复核（防客户端时钟偏快误清盘）',
    );
  });

  console.log(`${tests} guess checks passed.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
