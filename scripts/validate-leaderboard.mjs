// 榜单数据层校验：Elo 聚合、分类过滤、暂定判定、雷达生成的确定性。
// 做法与 validate-placeholder.mjs 相同：arena / works / placeholder / leaderboard
// 四个模块转译后拼为一个模块（去掉跨文件导入），localStorage 以 shim 代替。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => void store.set(key, String(value)),
  removeItem: (key) => void store.delete(key),
};
// lib/works.ts 顶层软引用 fetch；本脚本不触发 loadWorks，给个占位即可
globalThis.fetch = globalThis.fetch ?? (() => Promise.reject(new Error('no fetch in test')));

const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;

const stripImports = (code) =>
  code.replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"];?\s*$/gm, '');

// arena.ts 从 lib/works-roster.json 导入作品清单：data URL 模块解析不了相对路径，
// 转译后把清单内联成同名常量注入
const rosterJson = await readFile(
  new URL('../lib/works-roster.json', import.meta.url),
  'utf8',
);
const promptsSeedJson = await readFile(
  new URL('../lib/prompts-seed.json', import.meta.url),
  'utf8',
);
const injectData = (code) =>
  code
    .replace(
      /^import\s+rosterData\s+from\s+['"]\.\/works-roster\.json['"];?\s*$/m,
      `const rosterData = ${rosterJson};`,
    )
    .replace(
      /^import\s+promptsSeed\s+from\s+['"]\.\/prompts-seed\.json['"];?\s*$/m,
      `const promptsSeed = ${promptsSeedJson};`,
    );
const arenaCode = injectData(
  transpile(
    await readFile(new URL('../lib/arena.ts', import.meta.url), 'utf8'),
  ),
);
// lib/prompts.ts 合并进同一模块（stripImports 已去其导入）；
// 其内部 seedPrompts 改绑模块内 arena 的 prompts（arena 已声明 seedPrompts，避免撞名）
const promptsCode = stripImports(
  transpile(
    await readFile(new URL('../lib/prompts.ts', import.meta.url), 'utf8'),
  ),
)
  .replace(/\bseedPrompts\b/g, 'builtinPrompts')
  // 模块级私有名改名（state/started/listeners/emit），避免与拼进同一模块的 works 撞名
  .replace(/\bstate\b/g, 'promptsState')
  .replace(/\bstarted\b/g, 'promptsStarted')
  .replace(/\blisteners\b/g, 'promptsListeners')
  .replace(/\bemit\b/g, 'emitPrompts')
  .replace(/^let promptsState/m, 'const builtinPrompts = prompts;\nlet promptsState');
// works.ts 合并进同一模块：未加载状态 currentWorks 回退内置清单（浏览器拉取失败的同一回退）
const worksCode = stripImports(
  transpile(
    await readFile(new URL('../lib/works.ts', import.meta.url), 'utf8'),
  ),
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
  `data:text/javascript;base64,${Buffer.from(`${arenaCode}\n${promptsCode}\n${worksCode}\n${placeholderCode}\n${leaderboardCode}`).toString('base64')}`
);
const {
  prompts,
  writeDevSettings,
  generatePlaceholderVotes,
  writePlaceholderVotes,
  clearPlaceholderVotes,
  leaderboardData,
  currentVotes,
  computeRadarProfiles,
  PROMPT_DIMENSION_WEIGHTS,
  RADAR_BASE,
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

check('口径过滤（决策 026）：只看正式只计 mode=formal 的票', () => {
  // 手工构造带 mode 的票（真实流水经 voteToRecord 映射后同构）。
  // 用 001 题：占位生成的 200 票覆盖全部阵容，001 必然让任意两个模型进 meta
  const models = leaderboardData('all').rows.map((row) => row.modelId);
  assert.ok(models.length >= 2, '占位阵容至少两个模型');
  const vote = (winner, loser, mode, ts) => ({
    promptId: '001',
    winnerId: winner,
    loserId: loser,
    ts,
    mode,
  });
  const mixedVotes = [
    vote(models[0], models[1], 'formal', 1),
    vote(models[1], models[0], 'party', 2),
    vote(models[0], models[1], 'blind', 3),
  ];
  assert.equal(leaderboardData('all', mixedVotes, 'mixed').totalVotes, 3);
  const formalData = leaderboardData('all', mixedVotes, 'formal');
  assert.equal(formalData.totalVotes, 1);
  // 只有 formal 那一票：模型 0 一胜、模型 1 一负
  const winner = formalData.rows.find((row) => row.modelId === models[0]);
  const loser = formalData.rows.find((row) => row.modelId === models[1]);
  assert.equal(winner?.wins, 1);
  assert.equal(loser?.losses, 1);
  // 无 mode 的票（占位口径）在混入时计入、只看正式时排除
  const legacyVotes = [vote(models[0], models[1], undefined, 4)];
  assert.equal(leaderboardData('all', legacyVotes, 'mixed').totalVotes, 1);
  assert.equal(leaderboardData('all', legacyVotes, 'formal').totalVotes, 0);
});

check('平局票（决策 048）：双方各得半分、记平局不计胜负、场次含平局', () => {
  const models = leaderboardData('all').rows.map((row) => row.modelId);
  assert.ok(models.length >= 2, '占位阵容至少两个模型');
  const [a, b] = models;
  const winVote = {
    promptId: '001',
    winnerId: a,
    loserId: b,
    ts: 1,
    mode: 'blind',
    outcome: 'win',
  };
  const drawVote = { ...winVote, ts: 2, outcome: 'draw' };
  const data = leaderboardData('all', [winVote, drawVote], 'mixed');
  assert.equal(data.totalVotes, 2);
  const rowA = data.rows.find((row) => row.modelId === a);
  const rowB = data.rows.find((row) => row.modelId === b);
  // 一胜 + 一平：games 含平局，wins/losses/draws 自洽
  assert.equal(rowA.games, 2);
  assert.equal(rowA.wins, 1);
  assert.equal(rowA.losses, 0);
  assert.equal(rowA.draws, 1);
  assert.equal(rowA.games, rowA.wins + rowA.losses + rowA.draws);
  assert.equal(rowB.losses, 1);
  assert.equal(rowB.draws, 1);
  // Elo：第一票后 a 高 b 低；平局让高分方回跌、低分方回升
  const onlyWin = leaderboardData('all', [winVote], 'mixed');
  const aAfterWin = onlyWin.rows.find((row) => row.modelId === a).rating;
  const bAfterWin = onlyWin.rows.find((row) => row.modelId === b).rating;
  assert.ok(aAfterWin > 1200 && bAfterWin < 1200);
  assert.ok(rowA.rating < aAfterWin, '平局后领先方评分回落');
  assert.ok(rowB.rating > bAfterWin, '平局后落后方评分回升');
  // 无 outcome 字段的旧票（占位票/早期数据）按胜负处理
  const legacy = leaderboardData(
    'all',
    [{ promptId: '001', winnerId: a, loserId: b, ts: 3, mode: 'blind' }],
    'mixed',
  );
  assert.equal(legacy.rows.find((row) => row.modelId === a).wins, 1);
});

check('下架不丢票（决策 045 ⑤）：未知题与历史模型的历史票保留在榜', () => {
  const models = leaderboardData('all').rows.map((row) => row.modelId);
  assert.ok(models.length >= 2, '占位阵容至少两个模型');
  // 题已下架：promptId 不在当前题库，promptKind 由流水快照提供，赛道归类不丢
  const retiredPromptVote = {
    promptId: '999',
    winnerId: models[0],
    loserId: models[1],
    ts: 10,
    mode: 'blind',
    promptKind: 'web',
  };
  const retiredPromptData = leaderboardData('web', [retiredPromptVote], 'mixed');
  assert.equal(retiredPromptData.totalVotes, 1);
  assert.ok(retiredPromptData.rows.some((row) => row.modelId === models[0]));
  // 作品全下架：模型不在当前阵容，显示名用流水快照，票照常计入聚合
  const retiredVotes = [
    {
      promptId: '002',
      winnerId: 'gone-a',
      loserId: 'gone-b',
      ts: 11,
      mode: 'blind',
      winnerName: '退役甲',
      loserName: '退役乙',
    },
    {
      promptId: '002',
      winnerId: 'gone-a',
      loserId: models[0],
      ts: 12,
      mode: 'blind',
      winnerName: '退役甲',
      loserName: '现役',
    },
  ];
  const retiredData = leaderboardData('all', retiredVotes, 'mixed');
  assert.equal(retiredData.totalVotes, 2);
  const gone = retiredData.rows.find((row) => row.modelId === 'gone-a');
  assert.ok(gone);
  assert.equal(gone.name, '退役甲');
  assert.equal(gone.games, 2);
  assert.equal(gone.wins, 2);
  assert.equal(gone.sub, '历史阵容 / RETIRED');
  // 快照缺失（旧流水行）：历史模型以模型 id 兜底显示，票不丢
  const nameless = leaderboardData('all', [
    { promptId: '002', winnerId: 'gone-c', loserId: 'gone-d', ts: 13, mode: 'blind' },
  ], 'mixed');
  assert.equal(nameless.totalVotes, 1);
  assert.equal(nameless.rows.find((row) => row.modelId === 'gone-c')?.name, 'gone-c');
});

check('六维画像（决策 091）：重放确定、值域 0–100、每题权重归一', () => {
  const data = leaderboardData('all');
  assert.ok(data.rows.length > 0);
  for (const category of ['all', 'text', 'web']) {
    assert.equal(RADAR_LABELS[category].length, 6);
    const a = computeRadarProfiles(category);
    const b = computeRadarProfiles(category);
    assert.deepEqual([...a.profiles], [...b.profiles]);
    assert.deepEqual(a.average, b.average);
    for (const values of a.profiles.values()) {
      assert.equal(values.length, 6);
      for (const v of values) assert.ok(v >= 0 && v <= 100);
    }
    assert.equal(a.average.length, 6);
    for (const v of a.average) assert.ok(v >= 0 && v <= 100);
  }
  // 权重表：六维、和为 1、值域 0–1
  for (const weights of Object.values(PROMPT_DIMENSION_WEIGHTS)) {
    assert.equal(weights.length, 6);
    for (const w of weights) assert.ok(w >= 0 && w <= 1);
    assert.ok(Math.abs(weights.reduce((s, w) => s + w, 0) - 1) < 1e-9);
  }
});

check('六维画像权重语义：001 胜局只动带权维度，零权重维度停在基准', () => {
  const synthetic = [
    { promptId: '001', winnerId: 'radar-a', loserId: 'radar-b', ts: 1 },
    { promptId: '002', winnerId: 'radar-a', loserId: 'radar-b', ts: 2 },
  ];
  const { profiles } = computeRadarProfiles('all', synthetic);
  const a = profiles.get('radar-a');
  // 001（动态 0.6/视觉 0.3/创意 0.1）+ 002（文字 0.7/创意 0.3）连赢两题：
  // 带权维度高于基准，空间营造/思辨推理从未加权、必须精确停在基准
  assert.ok(a[0] > RADAR_BASE && a[2] > RADAR_BASE && a[5] > RADAR_BASE && a[3] > RADAR_BASE);
  assert.equal(a[1], RADAR_BASE);
  assert.equal(a[4], RADAR_BASE);
  // 败者带权维度低于基准
  const b = profiles.get('radar-b');
  assert.ok(b[2] < RADAR_BASE && b[3] < RADAR_BASE);
  // 平局（决策 048）：各得半分——先分出胜负拉开分差，再打平，
  // 强方回落、弱方回补，画像确实因平局变动
  const win = { promptId: '001', winnerId: 'radar-c', loserId: 'radar-d', ts: 1 };
  const g1 = computeRadarProfiles('all', [win]);
  const g2 = computeRadarProfiles('all', [
    win,
    { ...win, ts: 2, outcome: 'draw' },
  ]);
  assert.notDeepEqual(g1.profiles.get('radar-c'), g2.profiles.get('radar-c'));
  assert.notDeepEqual(g1.profiles.get('radar-d'), g2.profiles.get('radar-d'));
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
