// 模一把校验（决策 057）：lib/guess-logic.ts 的判定规则、每日答案派生的
// 确定性与稳定性、数据集完整性。纯断言（同 validate-arena 模式），
// 后半段起真实 server 比对 /api/guess/* 接口的判定口径。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
  GUESS_EPOCH,
  PRICE_BAND_EDGES,
  PRICE_TIERS,
  GUESS_DIFFICULTIES,
  poolForDifficulty,
  dailyPool,
  VENDOR_REGION,
} = logic;

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
      ])
        assert.notEqual(e[f], undefined, `${e.id} 缺字段 ${f}`);
      assert.ok(!baseIds.has(e.id) && !seen.has(e.id), `增量 id 冲突: ${e.id}`);
      assert.ok(!baseNames.has(e.name.toLowerCase()), `增量 name 冲突: ${e.name}`);
      assert.ok(regions[e.org], `${e.id} 厂商 ${e.org} 未登记地区`);
      assert.ok(GUESS_DIFFICULTIES.includes(e.difficulty), `${e.id} difficulty`);
      seen.add(e.id);
    }
  });

  // ── 难度分池（决策 060）──
  await check('难度：difficulty ∈ 1-3，三池非空且互不重叠、并集为全集', () => {
    for (const m of GUESS_MODELS)
      assert.ok(
        GUESS_DIFFICULTIES.includes(m.difficulty),
        `${m.name}: difficulty=${m.difficulty}`,
      );
    const pools = GUESS_DIFFICULTIES.map((d) => poolForDifficulty(GUESS_MODELS, d));
    for (const [i, pool] of pools.entries())
      assert.ok(pool.length >= 10, `难度 ${i + 1} 池太小: ${pool.length}`);
    const union = new Set(pools.flat().map((m) => m.id));
    assert.equal(union.size, GUESS_MODELS.length, '三池并集应恰好覆盖全部模型');
    assert.equal(
      pools[0].length + pools[1].length + pools[2].length,
      GUESS_MODELS.length,
      '三池不应重叠',
    );
  });

  await check('难度：各池答案派生确定、相邻两天不同题、十年全覆盖', () => {
    for (const d of GUESS_DIFFICULTIES) {
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
      const slotOf = (m) => m.groupId ?? m.id;
      const counts = new Map();
      const variantSeen = new Set();
      for (let i = 0; i < 3650; i++) {
        const a = answerForDate(new Date(2026, 8, 13 + i), pool);
        assert.equal(a.difficulty, d, `难度 ${d} 出了池外模型 ${a.name}`);
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
        // contextK/priceTier 未公开时，自己对自己也是 unknown（诚实口径，非 hit）
        const open = key === 'contextK' ? m.contextK !== null
          : key === 'priceTier' ? m.priceTier !== null
          : true;
        assert.equal(
          fb.attributes[key].state,
          open ? 'hit' : 'unknown',
          `${m.name}.${key}`,
        );
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

  await check('judge：模态交集→near，无交集→miss', () => {
    const textOnly = GUESS_MODELS.find(
      (m) => m.modalities.length === 1 && m.modalities[0] === 'text',
    );
    const multi = GUESS_MODELS.find((m) => m.modalities.includes('image'));
    const fb = judge(textOnly, multi);
    assert.ok(['near', 'hit'].includes(fb.attributes.modalities.state));
    // 纯文本 vs 含图 = 有交集(text) → near；同一模型自身 → hit
    assert.equal(judge(multi, multi).attributes.modalities.state, 'hit');
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
    assert.ok(Math.min(...values) >= 20, `最少 ${Math.min(...values)} 次`);
    assert.ok(Math.max(...values) <= 55, `最多 ${Math.max(...values)} 次`);
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
      // 每日一题（决策 064）：答案从每日池（简单+标准）派生，困难档不进每日
      const answer = answerForDate(new Date(), dailyPool(GUESS_MODELS));
      assert.notEqual(answer.difficulty, 3, '每日题不应出困难档');
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
      // 练习答案在该难度池里（困难档），且与每日答案无关
      assert.equal(practiceGuess.answer.difficulty, 3);
      const expired = await fetch('http://127.0.0.1:3997/api/guess/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ guessId: someOther.id, gameId: 'no-such-game' }),
      });
      assert.equal(expired.status, 404);

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
            },
            {
              id: extraId, name: 'Dup', org: 'OpenAI', year: 2026, month: 9,
              openWeights: false, contextK: 64, modality: 'text',
              reasoning: false, priceOut: 1, popularity: 0, difficulty: 1,
            },
          ],
        }),
      );
      assert.equal(fresh.GUESS_MODELS.length, sizeBefore, '坏批次不应部分注册');
    });
  });

  console.log(`${tests} guess checks passed.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
