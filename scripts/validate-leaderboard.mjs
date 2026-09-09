// 榜单数据层校验：Elo 聚合、分类过滤、暂定判定、雷达生成的确定性。
// 做法与 validate-placeholder.mjs 相同：arena / placeholder / leaderboard
// 三个模块转译后拼为一个模块（去掉跨文件导入），localStorage 以 shim 代替。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => void store.set(key, String(value)),
  removeItem: (key) => void store.delete(key),
};

const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;

const stripImports = (code) =>
  code.replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"];?\s*$/gm, '');

const arenaCode = transpile(
  await readFile(new URL('../lib/arena.ts', import.meta.url), 'utf8'),
);
const placeholderCode = stripImports(
  transpile(
    await readFile(new URL('../lib/placeholder.ts', import.meta.url), 'utf8'),
  ),
);
const leaderboardCode = stripImports(
  transpile(
    await readFile(new URL('../lib/leaderboard.ts', import.meta.url), 'utf8'),
  ),
);

const module = await import(
  `data:text/javascript;base64,${Buffer.from(`${arenaCode}\n${placeholderCode}\n${leaderboardCode}`).toString('base64')}`
);
const {
  prompts,
  writeDevSettings,
  generatePlaceholderVotes,
  writePlaceholderVotes,
  clearPlaceholderVotes,
  leaderboardData,
  currentVotes,
  radarProfile,
  radarAverage,
  RADAR_LABELS,
  TRIAL_GAME_THRESHOLD,
} = module;

let tests = 0;
function check(name, test) {
  test();
  tests++;
  console.log(`PASS ${name}`);
}

check('真实模式（占位关闭）下没有任何投票，榜单为空', () => {
  writeDevSettings({ placeholderMode: false, placeholderModelCount: 8 });
  clearPlaceholderVotes();
  assert.deepEqual(currentVotes(), []);
  assert.equal(leaderboardData('all').rows.length, 0);
  assert.equal(leaderboardData('all').totalVotes, 0);
});

check('开启占位并生成投票后：行数等于有场次的模型数，按评分降序', () => {
  writeDevSettings({ placeholderMode: true, placeholderModelCount: 8 });
  writePlaceholderVotes(generatePlaceholderVotes(200));
  const data = leaderboardData('all');
  assert.equal(data.totalVotes, 200);
  assert.ok(data.rows.length > 0 && data.rows.length <= 8);
  for (let i = 1; i < data.rows.length; i++) {
    assert.ok(data.rows[i - 1].rating >= data.rows[i].rating);
  }
});

check('胜负自洽：games = wins + losses，总场次 = 2 × 票数，胜率在 0–1', () => {
  const data = leaderboardData('all');
  let totalGames = 0;
  for (const row of data.rows) {
    assert.equal(row.games, row.wins + row.losses);
    assert.ok(row.winrate >= 0 && row.winrate <= 1);
    assert.ok(row.topics >= 1 && row.topics <= prompts.length);
    assert.equal(row.trial, row.games < TRIAL_GAME_THRESHOLD);
    totalGames += row.games;
  }
  assert.equal(totalGames, data.totalVotes * 2);
});

check('Elo 零和：全体评分均值保持在基准 1200 附近', () => {
  const data = leaderboardData('all');
  const mean =
    data.rows.reduce((sum, row) => sum + row.rating, 0) / data.rows.length;
  assert.ok(Math.abs(mean - 1200) < 2);
  // 强弱梯度：最高与最低应拉开差距
  assert.ok(data.rows[0].rating > data.rows.at(-1).rating);
});

check('分类过滤：写作榜只计入 text 题（002）的票', () => {
  const votes = currentVotes();
  const textVotes = votes.filter((v) => v.promptId === '002').length;
  const textData = leaderboardData('text');
  assert.equal(textData.totalVotes, textVotes);
  const totalGames = textData.rows.reduce((sum, row) => sum + row.games, 0);
  assert.equal(totalGames, textVotes * 2);
  // web 榜与综合榜票数互补
  const webData = leaderboardData('web');
  assert.equal(textData.totalVotes + webData.totalVotes, votes.length);
  assert.ok(webData.promptCount < textData.promptCount + webData.promptCount);
});

check('雷达维度：同一模型同一赛道两次生成完全一致，值域 60–100', () => {
  const data = leaderboardData('all');
  const id = data.rows[0].modelId;
  assert.deepEqual(radarProfile(id, 'all'), radarProfile(id, 'all'));
  for (const category of ['all', 'text', 'web']) {
    assert.equal(RADAR_LABELS[category].length, 6);
    for (const v of radarProfile(id, category)) {
      assert.ok(v >= 60 && v <= 100);
    }
    assert.equal(radarAverage(category).length, 6);
  }
});

check('行元数据：占位模型带 PH 编号 sigil 与强调色，demo 结果不进榜', () => {
  const data = leaderboardData('all');
  for (const row of data.rows) {
    assert.ok(/^PH-\d{2}$/.test(row.sub) === false); // sub 是完整文案
    assert.ok(row.sub.startsWith('PLACEHOLDER / PH-'));
    assert.ok(row.accent.startsWith('#'));
    assert.ok(row.sigil.length > 0);
  }
  assert.ok(!data.rows.some((row) => row.modelId === 'sample'));
});

clearPlaceholderVotes();
console.log(`${tests} leaderboard checks passed.`);
