// 占位符系统校验：生成器结构、与竞技场配对函数的集成、以及与真实数据的严格隔离。
// 做法：lib/arena.ts + lib/works.ts + lib/placeholder.ts 转译后拼入同一个模块
// （去掉跨文件导入），并 shim localStorage 与 fetch，使 currentResults /
// 占位投票的读写路径可以在 Node 中直接断言。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// --- localStorage shim（仅本脚本进程内生效） ---
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => void store.set(key, String(value)),
  removeItem: (key) => void store.delete(key),
};
// --- fetch shim：lib/works.ts 的 loadWorks 不被本脚本调用，但 import 顶层
// 引用了 fetch（软引用，不触发即可）；currentResults 在 works 未就绪时回退
// 内置清单，正是本脚本要断言的真实数据路径 ---
globalThis.fetch = globalThis.fetch ?? (() => Promise.reject(new Error('no fetch in test')));

const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;

// arena.ts 从 lib/works-roster.json 导入作品清单：data URL 模块解析不了相对路径，
// 转译后把清单内联成同名常量注入
const rosterJson = await readFile(
  new URL('../lib/works-roster.json', import.meta.url),
  'utf8',
);
const injectRoster = (code) =>
  code.replace(
    /^import\s+rosterData\s+from\s+['"]\.\/works-roster\.json['"];?\s*$/m,
    `const rosterData = ${rosterJson};`,
  );
const arenaCode = injectRoster(
  transpile(
    await readFile(new URL('../lib/arena.ts', import.meta.url), 'utf8'),
  ),
);
// works.ts 合并进同一模块：去掉对 arena 的导入后，currentWorks 在
// 未加载状态返回内置 modelResults——与浏览器拉取失败时的回退一致
const worksCode = transpile(
  await readFile(new URL('../lib/works.ts', import.meta.url), 'utf8'),
).replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]*arena['"];?\s*$/gm, '');
let placeholderCode = transpile(
  await readFile(new URL('../lib/placeholder.ts', import.meta.url), 'utf8'),
);
// 三份代码合并为一个模块：去掉 placeholder 对 arena / works 的值导入
placeholderCode = placeholderCode.replace(
  /^import\s*\{[^}]*\}\s*from\s*['"][^'"]*(arena|works)['"];?\s*$/gm,
  '',
);

const module = await import(
  `data:text/javascript;base64,${Buffer.from(`${arenaCode}\n${worksCode}\n${placeholderCode}`).toString('base64')}`
);
const {
  prompts,
  modelResults,
  eligiblePairs,
  pickMatchup,
  placeholderModels,
  buildPlaceholderResults,
  currentResults,
  generatePlaceholderVotes,
  readPlaceholderVotes,
  writePlaceholderVotes,
  clearPlaceholderVotes,
} = module;

let tests = 0;
function check(name, test) {
  test();
  tests++;
  console.log(`PASS ${name}`);
}

check('模型数量收在 2–16，id 唯一且带固定强调色', () => {
  assert.equal(placeholderModels(1).length, 2);
  assert.equal(placeholderModels(8).length, 8);
  assert.equal(placeholderModels(99).length, 16);
  const models = placeholderModels(12);
  assert.equal(new Set(models.map((m) => m.id)).size, 12);
  assert.ok(models.every((m) => /^ph-\d{2}$/.test(m.id) && m.accent[0] === '#'));
});

check('占位结果覆盖每题每模型，id 唯一、类型正确、内容非空', () => {
  const results = buildPlaceholderResults(8);
  assert.equal(results.length, prompts.length * 8);
  assert.equal(new Set(results.map((r) => r.id)).size, results.length);
  const ids = new Set(prompts.map((p) => p.id));
  assert.ok(results.every((r) => ids.has(r.promptId)));
  for (const result of results) {
    const prompt = prompts.find((p) => p.id === result.promptId);
    if (prompt.kind === 'text') {
      assert.equal(result.content.kind, 'text');
      const { story } = result.content;
      assert.equal(typeof story.heading, 'string');
      assert.ok(story.paragraphs.length >= 4);
      assert.ok(story.paragraphs.every((p) => p.length > 0));
      assert.equal(typeof story.ending, 'string');
    } else {
      assert.equal(result.content.kind, 'html');
      assert.ok(result.content.html.includes('模型'));
      assert.ok(result.content.html.length > 500);
    }
    assert.ok(result.title.includes('模型'));
    assert.ok(result.modelName.startsWith('占位 · 模型'));
  }
});

check('同一输入两次构建结果完全一致（刷新后内容不变）', () => {
  assert.deepEqual(
    buildPlaceholderResults(6),
    buildPlaceholderResults(6),
  );
});

check('占位结果可被竞技场配对：同题、跨模型、避开上一轮', () => {
  const results = buildPlaceholderResults(8);
  assert.equal(eligiblePairs('004', results).length, 28); // C(8,2)
  for (let i = 0; i < 50; i++) {
    const pair = pickMatchup('004', undefined, Math.random, results);
    assert.equal(pair.length, 2);
    assert.ok(pair.every((entry) => entry.promptId === '004'));
    assert.notEqual(pair[0].modelId, pair[1].modelId);
  }
  const previous = pickMatchup('005', undefined, () => 0, results);
  for (let i = 0; i < 50; i++) {
    const fresh = pickMatchup('005', previous, Math.random, results);
    assert.ok(
      fresh.every(
        (entry) => !previous.some((old) => old.id === entry.id),
      ),
    );
  }
});

check('默认关闭时 currentResults 原样返回真实数据（同一引用）', () => {
  localStorage.removeItem('arenaofbias:dev');
  assert.equal(currentResults(), modelResults);
});

check('开启后两套数据严格隔离：无任何 id 或对象重叠', () => {
  localStorage.setItem(
    'arenaofbias:dev',
    JSON.stringify({ placeholderMode: true, placeholderModelCount: 6 }),
  );
  const placeholder = currentResults();
  assert.equal(placeholder.length, prompts.length * 6);
  const realIds = new Set(modelResults.map((r) => r.id));
  assert.ok(placeholder.every((r) => !realIds.has(r.id)));
  assert.equal(modelResults.length, 5); // 真实数据原封不动
  assert.equal(modelResults[0].id, '001-sample');
});

check('占位投票：数量、合法性、时间分布与强弱梯度', () => {
  const votes = generatePlaceholderVotes(300);
  assert.equal(votes.length, 300);
  const modelIds = new Set(placeholderModels(6).map((m) => m.id));
  const weekAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
  assert.ok(
    votes.every(
      (vote) =>
        vote.winnerId !== vote.loserId &&
        modelIds.has(vote.winnerId) &&
        modelIds.has(vote.loserId) &&
        Number.isFinite(vote.ts) &&
        vote.ts >= weekAgo &&
        vote.ts <= Date.now(),
    ),
  );
  const wins = new Map();
  for (const vote of votes)
    wins.set(vote.winnerId, (wins.get(vote.winnerId) ?? 0) + 1);
  assert.ok(Math.max(...wins.values()) > Math.min(...wins.values()));
});

check('占位投票只在 localStorage 读写，坏数据安全回落为空', () => {
  writePlaceholderVotes(generatePlaceholderVotes(24));
  assert.equal(readPlaceholderVotes().length, 24);
  clearPlaceholderVotes();
  assert.equal(readPlaceholderVotes().length, 0);
  localStorage.setItem('arenaofbias:placeholder-votes', '{{{not json');
  assert.deepEqual(readPlaceholderVotes(), []);
});

check('切换模型数量后，旧阵容的占位投票被自动过滤', () => {
  localStorage.setItem(
    'arenaofbias:dev',
    JSON.stringify({ placeholderMode: true, placeholderModelCount: 2 }),
  );
  writePlaceholderVotes([
    { promptId: '001', winnerId: 'ph-01', loserId: 'ph-02', ts: 1 },
    { promptId: '001', winnerId: 'ph-01', loserId: 'ph-05', ts: 2 },
    { promptId: '002', winnerId: 'ph-07', loserId: 'ph-08', ts: 3 },
  ]);
  assert.deepEqual(readPlaceholderVotes(), [
    { promptId: '001', winnerId: 'ph-01', loserId: 'ph-02', ts: 1 },
  ]);
  clearPlaceholderVotes();
});

check('随机强弱：开启后每次生成的名次格局不同，关闭时榜首稳定', () => {
  const winCounts = (votes) => {
    const wins = new Map();
    for (const vote of votes)
      wins.set(vote.winnerId, (wins.get(vote.winnerId) ?? 0) + 1);
    return [...wins.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, n]) => `${id}:${n}`);
  };
  const topOf = (votes) => {
    const wins = new Map();
    for (const vote of votes)
      wins.set(vote.winnerId, (wins.get(vote.winnerId) ?? 0) + 1);
    return [...wins.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  localStorage.setItem(
    'arenaofbias:dev',
    JSON.stringify({
      placeholderMode: true,
      placeholderModelCount: 8,
      randomStrength: true,
    }),
  );
  // 开启后掺入随机盐：两次生成的胜场分布不应相同（同分布概率可忽略）
  assert.notDeepEqual(
    winCounts(generatePlaceholderVotes(300)),
    winCounts(generatePlaceholderVotes(300)),
  );
  localStorage.setItem(
    'arenaofbias:dev',
    JSON.stringify({
      placeholderMode: true,
      placeholderModelCount: 8,
      randomStrength: false,
    }),
  );
  // 关闭时强弱固定：两次生成虽然对阵随机，但榜首都应是种子最强的 ph-03
  assert.equal(topOf(generatePlaceholderVotes(300)), 'ph-03');
  assert.equal(topOf(generatePlaceholderVotes(300)), 'ph-03');
});

console.log(`${tests} placeholder checks passed.`);
