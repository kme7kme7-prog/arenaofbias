// 临时脚本：standalone/guess.html 内嵌判定核心 vs lib/guess-logic.ts 逐项对拍，用完即删
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJiti } from 'jiti';

const html = readFileSync('standalone/guess.html', 'utf8');

// 抽出 __DATA__ 与 __CORE__ 段在 node 里跑起来
const dataMatch = /\/\* __DATA_START__ \*\/([\s\S]*?)\/\* __DATA_END__ \*\//.exec(html);
const coreMatch = /\/\* __CORE_START__ \*\/([\s\S]*?)\/\* __CORE_END__ \*\//.exec(html);
assert(dataMatch && coreMatch, '标记段没找到');
const sandbox = new Function(
  `${dataMatch[1]}\n${coreMatch[1]}\nreturn __CORE__;`,
)();
const local = sandbox;

const jiti = createJiti(import.meta.url);
const ref = await jiti.import('../lib/guess-logic.ts');

// ── 1. 数据集归一结果一致（id 序、全部判定字段）──
assert.equal(local.GUESS_MODELS.length, ref.GUESS_MODELS.length, '模型数不一致');
for (let i = 0; i < ref.GUESS_MODELS.length; i++) {
  const a = local.GUESS_MODELS[i];
  const b = ref.GUESS_MODELS[i];
  assert.equal(a.id, b.id, `#${i} id`);
  for (const k of ['name','vendor','region','released','openWeights','contextK','reasoning','priceOut','priceTier','popularity','difficulty','sinceDay','groupId'])
    assert.deepEqual(a[k], b[k], `${a.id}.${k}`);
  assert.deepEqual(a.modalities, b.modalities, `${a.id}.modalities`);
}
console.log(`数据集归一一致：${local.GUESS_MODELS.length} 个可猜模型`);

// ── 2. judge 全量两两对拍（204×204，含组内变体与跨档）──
let judgeCases = 0;
for (const g of local.GUESS_MODELS)
  for (const a of ref.GUESS_MODELS) {
    // 两边各自用自己的对象判同 pair（按 id 对齐），结果必须逐字段相同
    const lg = local.GUESS_MODELS.find((m) => m.id === g.id);
    const la = local.GUESS_MODELS.find((m) => m.id === a.id);
    assert.deepEqual(local.judge(lg, la), ref.judge(g, a), `judge(${g.id},${a.id})`);
    judgeCases++;
  }
console.log(`judge 两两对拍一致：${judgeCases} 对`);

// ── 3. 每日答案派生对拍：3650 天（十年）× 每日池 + 四档练习池 ──
const base = Date.UTC(2026, 8, 13);
let dateCases = 0;
for (let d = -30; d < 3650; d++) {
  const date = new Date(base + d * 86400000);
  assert.equal(
    local.answerForDate(date, local.dailyPool(local.GUESS_MODELS)).id,
    ref.answerForDate(date, ref.dailyPool(ref.GUESS_MODELS)).id,
    `answerForDate(${d}) 每日池`,
  );
  dateCases++;
  for (const diff of [1, 2, 3, 4]) {
    assert.equal(
      local.answerForDate(date, local.poolForDifficulty(local.GUESS_MODELS, diff)).id,
      ref.answerForDate(date, ref.poolForDifficulty(ref.GUESS_MODELS, diff)).id,
      `answerForDate(${d}) 难度${diff}池`,
    );
  }
}
console.log(`每日答案派生一致：${dateCases} 天 × 5 池`);

// ── 4. 天数/日历/搜索/价格档/手感参数 ──
for (let d = -30; d < 400; d++) {
  const date = new Date(base + d * 86400000);
  assert.equal(local.guessDayKey(date), ref.guessDayKey(date), `guessDayKey(${d})`);
  assert.equal(local.dayNumber(date), ref.dayNumber(date), `dayNumber(${d})`);
}
const queries = ['gpt', 'GPT 5', 'gpt5', 'sonnet4.5', 'qwen3', 'claude sonnet', 'K2', '5.6 luna', 'zzz-不存在', '', ' deepseek '];
for (const q of queries) {
  assert.deepEqual(
    local.searchGuessModels(local.GUESS_MODELS, q).map((m) => m.id),
    ref.searchGuessModels(ref.GUESS_MODELS, q).map((m) => m.id),
    `search(${JSON.stringify(q)})`,
  );
}
// priceBandOf 主站未导出（内部函数）；priceTier 已在数据集对拍逐条比过，这里只做边界自校验
const bandExpected = [null, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
for (const [i, p] of [null, 0, 0.49, 0.5, 1.99, 2, 7.9, 8, 24.9, 25, 100].entries())
  assert.equal(local.priceBandOf(p), bandExpected[i], `priceBandOf(${p})`);
assert.deepEqual([...local.PRICE_BAND_EDGES], [...ref.PRICE_BAND_EDGES]);
assert.deepEqual({ ...local.GUESS_CONFIG }, { ...ref.GUESS_CONFIG });
assert.deepEqual([...local.ATTRIBUTE_KEYS], [...ref.ATTRIBUTE_KEYS]);
assert.deepEqual([...local.GUESS_EPOCH], [...ref.GUESS_EPOCH]);
console.log('日历/搜索/价格档/参数一致');

console.log('\nstandalone 判定核心与主站逐项对拍：全部一致 ✔');
