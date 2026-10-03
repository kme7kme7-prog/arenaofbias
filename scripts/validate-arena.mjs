import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/arena.ts', import.meta.url),
  'utf8',
);
// arena.ts 从 lib/works-roster.json 与 lib/prompts-seed.json 导入清单：
// data URL 模块解析不了相对路径，转译后把清单内联成同名常量注入
const rosterJson = await readFile(
  new URL('../lib/works-roster.json', import.meta.url),
  'utf8',
);
const promptsSeedJson = await readFile(
  new URL('../lib/prompts-seed.json', import.meta.url),
  'utf8',
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    /^import\s+rosterData\s+from\s+['"]\.\/works-roster\.json['"];?\s*$/m,
    `const rosterData = ${rosterJson};`,
  )
  .replace(
    /^import\s+promptsSeed\s+from\s+['"]\.\/prompts-seed\.json['"];?\s*$/m,
    `const promptsSeed = ${promptsSeedJson};`,
  );
const {
  arenaReducer: reduce,
  initialState,
  rounds,
  modelResults,
  eligiblePairs,
  entertainmentPoolReady,
  entertainmentWorkCount,
  pickMatchup,
  randomArenaHash,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
let tests = 0;
function check(name, test) {
  test();
  tests++;
  console.log(`PASS ${name}`);
}
const intro = reduce(initialState, { type: 'LOADED' });
const voting = reduce(intro, { type: 'READY' });
const locked = reduce(voting, { type: 'VOTE', side: 'a' });

check(
  'Voting is blocked while loading and during the entrance sequence',
  () => {
    assert.equal(
      reduce(initialState, { type: 'VOTE', side: 'a' }),
      initialState,
    );
    assert.equal(reduce(intro, { type: 'VOTE', side: 'a' }), intro);
  },
);
check('Completing or skipping the entrance unlocks voting exactly once', () => {
  assert.equal(voting.phase, 'voting');
  assert.equal(reduce(voting, { type: 'READY' }), voting);
});
check('Rapid opposite-side clicks cannot change a locked vote', () => {
  assert.equal(locked.choice, 'a');
  assert.equal(reduce(locked, { type: 'VOTE', side: 'b' }), locked);
});
check('Reveal requires a locked choice and preserves it', () => {
  assert.equal(reduce(intro, { type: 'REVEAL' }), intro);
  const result = reduce(locked, { type: 'REVEAL' });
  assert.equal(result.phase, 'result');
  assert.equal(result.choice, 'a');
});
check('Draw vote (decision 048) locks like a side vote and survives reveal', () => {
  const drawLocked = reduce(voting, { type: 'VOTE', side: 'draw' });
  assert.equal(drawLocked.phase, 'locking');
  assert.equal(drawLocked.choice, 'draw');
  // 锁定后同样不可改票
  assert.equal(reduce(drawLocked, { type: 'VOTE', side: 'a' }), drawLocked);
  const drawResult = reduce(drawLocked, { type: 'REVEAL' });
  assert.equal(drawResult.phase, 'result');
  assert.equal(drawResult.choice, 'draw');
  // 换题/重播同样清掉平局选择
  const replay = reduce(reduce(drawResult, { type: 'REPLAY' }), {
    type: 'ARRIVE',
  });
  assert.equal(replay.choice, null);
});
check(
  'Switching during a reveal cancels the stale reveal and starts a clean round',
  () => {
    const switching = reduce(locked, { type: 'SWITCH', round: 2 });
    assert.equal(reduce(switching, { type: 'REVEAL' }), switching);
    assert.equal(reduce(switching, { type: 'SWITCH', round: 1 }), switching);
    const next = reduce(switching, { type: 'ARRIVE' });
    assert.equal(next.round, 2);
    assert.equal(next.choice, null);
    assert.equal(next.phase, 'intro');
    assert.equal(next.run, 1);
  },
);
check(
  'Replaying clears the previous result and restarts the same encounter',
  () => {
    const result = reduce(locked, { type: 'REVEAL' });
    const replay = reduce(reduce(result, { type: 'REPLAY' }), {
      type: 'ARRIVE',
    });
    assert.equal(replay.round, 0);
    assert.equal(replay.choice, null);
    assert.equal(replay.phase, 'intro');
  },
);
check('Mode changes use the transition and clear a previous vote', () => {
  const changed = reduce(locked, { type: 'MODE', mode: 'party' });
  assert.equal(changed.phase, 'transition');
  assert.equal(changed.mode, 'party');
  const fresh = reduce(changed, { type: 'ARRIVE' });
  assert.equal(fresh.choice, null);
  assert.equal(fresh.mode, 'party');
});
check(
  'Every encounter choice is reachable; invalid indexes are ignored',
  () => {
    for (let index = 0; index < rounds.length; index++) {
      const next = reduce(reduce(voting, { type: 'SWITCH', round: index }), {
        type: 'ARRIVE',
      });
      assert.equal(next.round, index);
    }
    assert.equal(reduce(voting, { type: 'SWITCH', round: -1 }), voting);
    assert.equal(
      reduce(voting, { type: 'SWITCH', round: rounds.length }),
      voting,
    );
    assert.equal(reduce(voting, { type: 'SWITCH', round: NaN }), voting);
  },
);
check('Matchups never cross prompts or compare a model with itself', () => {
  for (const prompt of rounds) {
    if (!eligiblePairs(prompt.id).length) {
      assert.equal(pickMatchup(prompt.id), null);
      continue;
    }
    for (let i = 0; i < 100; i++) {
      const pair = pickMatchup(prompt.id);
      assert.equal(pair.length, 2);
      assert.ok(pair.every((entry) => entry.promptId === prompt.id));
      assert.notEqual(pair[0].modelId, pair[1].modelId);
    }
  }
  assert.equal(pickMatchup('missing'), null);
});
check(
  'Multiple model results support new pairs, same-model exclusion and empty arenas',
  () => {
    const [first, second] = modelResults.filter((result) => !result.isDemo);
    const third = { ...first, id: 'third-result', modelId: 'third-model' };
    const sameModel = { ...first, id: 'same-model-second-result' };
    const results = [first, second, third, sameModel, ...modelResults.filter((result) => result.promptId !== first.promptId)];
    assert.equal(eligiblePairs(first.promptId, results).length, 5);
    const next = pickMatchup(first.promptId, [first, second], () => 0, results);
    assert.ok(next.some((entry) => entry.id === third.id));
    // 上一轮的作品不得再次出现：多次随机都必须与上一轮完全不相交
    for (let i = 0; i < 50; i++) {
      const fresh = pickMatchup(first.promptId, [first, second], Math.random, results);
      assert.ok(
        fresh.every(
          (entry) => entry.id !== first.id && entry.id !== second.id,
        ),
      );
    }
    // 只剩一组可配时回退到该组合（左右位置可能随机交换），流程不断
    const fallback = pickMatchup(first.promptId, [first, second], Math.random, [
      first,
      second,
    ]);
    assert.ok(fallback);
    assert.deepEqual(
      fallback.map((entry) => entry.id).sort((a, b) => a.localeCompare(b)),
      [first.id, second.id].sort((a, b) => a.localeCompare(b)),
    );
    assert.equal(
      pickMatchup(first.promptId, undefined, Math.random, [first, sameModel]),
      null,
    );
  },
);
check(
  'Two-level draw (decision 097): model pairs uniform, multi-work models grouped, previous works avoided at work level',
  () => {
    const mk = (id, modelId) => ({
      id,
      promptId: '900',
      modelId,
      modelName: modelId,
      title: id,
      content: { kind: 'html', src: '/works/x.html' },
    });
    const results = [
      mk('m1', 'm'), mk('m2', 'm'), mk('m3', 'm'),
      mk('n1', 'n'), mk('n2', 'n'),
      mk('k1', 'k'),
    ];
    for (let i = 0; i < 200; i++) {
      const pair = pickMatchup('900', undefined, Math.random, results);
      assert.notEqual(pair[0].modelId, pair[1].modelId);
    }
    // 上轮回避必须作用到作品层（097 曾把回避后的模型对配回未过滤的作品组）
    for (let i = 0; i < 200; i++) {
      const pair = pickMatchup('900', [results[0], results[3]], Math.random, results);
      assert.ok(
        pair.every((entry) => entry.id !== 'm1' && entry.id !== 'n1'),
        `previous work leaked: ${pair.map((e) => e.id).join(',')}`,
      );
    }
    // 均匀性在模型对上：m(3 作品)、n(2 作品)、k 两两组合各约 1/3
    const counts = {};
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const key = pickMatchup('900', undefined, Math.random, results)
        .map((entry) => entry.modelId)
        .sort()
        .join('+');
      counts[key] = (counts[key] ?? 0) + 1;
    }
    assert.deepEqual(Object.keys(counts).sort(), ['k+m', 'k+n', 'm+n']);
    for (const rate of Object.values(counts)) {
      assert.ok(
        rate / N > 0.26 && rate / N < 0.41,
        `model pair not uniform: ${JSON.stringify(counts)}`,
      );
    }
  },
);
check('Entertainment admission counts unique non-demo works at the 9/10 boundary', () => {
  const work = modelResults.find((entry) => !entry.isDemo);
  const pool = Array.from({ length: 10 }, (_, i) => ({ ...work, id: `threshold-${i}`, promptId: '022', modelId: `model-${i % 2}` }));
  assert.equal(entertainmentPoolReady('022', pool.slice(0, 9)), false);
  assert.equal(entertainmentPoolReady('022', pool), true);
  assert.equal(entertainmentPoolReady('022', pool.map(entry => ({ ...entry, modelId: 'one' }))), false);
  const nine = [...pool.slice(0, 9), pool[0], { ...pool[9], isDemo: true }];
  assert.equal(entertainmentWorkCount('022', nine), 9);
  assert.equal(entertainmentPoolReady('022', nine), false);
  const prompt = { ...rounds[0], id: '022' };
  assert.equal(randomArenaHash(undefined, () => 0, nine, [prompt]), '#prompts');
  assert.equal(randomArenaHash(undefined, () => 0, pool, [prompt]), '#arena/022');
  const other = pool.map(entry => ({ ...entry, id: `other-${entry.id}`, promptId: '023' }));
  assert.equal(randomArenaHash('022', () => 0, [...pool, ...other], [prompt, { ...prompt, id: '023' }]), '#arena/023');
});
for (const name of ['signal-a.webp', 'signal-b.webp', 'lunar.webp']) {
  const file = new URL(`../public/art/${name}`, import.meta.url);
  const details = await stat(file);
  assert.ok(
    details.size > 10000 && details.size < 500000,
    `${name} must be a real, optimized asset`,
  );
}
console.log(
  `${tests} interaction-state checks passed; all 3 artwork assets present and under 500 KB each.`,
);
