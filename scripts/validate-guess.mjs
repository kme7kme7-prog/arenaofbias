// 模一把校验（决策 057）：lib/guess-logic.ts 的判定规则、每日答案派生的
// 确定性与稳定性、数据集完整性。纯断言（同 validate-arena 模式），
// 后半段起真实 server 比对 /api/guess/* 接口的判定口径。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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

  await check('judge：厂商不同必 miss；相同必 hit', () => {
    const a = GUESS_MODELS.find((m) => m.vendor === 'OpenAI');
    const b = GUESS_MODELS.find((m) => m.vendor !== 'OpenAI');
    assert.equal(judge(a, a).attributes.vendor.state, 'hit');
    assert.equal(judge(b, a).attributes.vendor.state, 'miss');
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

  await check('答案派生：十年周期全覆盖且分布均匀', () => {
    const counts = new Map();
    for (let d = 0; d < 3650; d++) {
      const a = answerForDate(new Date(2026, 8, 13 + d));
      counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
    }
    assert.equal(counts.size, GUESS_MODELS.length);
    const values = [...counts.values()];
    assert.ok(Math.min(...values) >= 15, `最少 ${Math.min(...values)} 次`);
    assert.ok(Math.max(...values) <= 30, `最多 ${Math.max(...values)} 次`);
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
    const env = { ...process.env, PORT: '3997', DATA_DIR: dataDir };
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

      const origin = 'http://127.0.0.1:3997';
      const answer = answerForDate(new Date());
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
    } finally {
      child.kill();
      await new Promise((resolve) => {
        child.on('exit', resolve);
        setTimeout(resolve, 3000);
      });
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  console.log(`${tests} guess checks passed.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
