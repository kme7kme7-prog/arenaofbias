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
  'Random navigation targets an eligible prompt and can avoid the current arena',
  () => {
    for (const prompt of rounds) {
      const hash = randomArenaHash(prompt.id, () => 0);
      assert.notEqual(hash, `#arena/${prompt.id}`);
      assert.ok(eligiblePairs(hash.slice(7)).length > 0);
    }
  },
);
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
