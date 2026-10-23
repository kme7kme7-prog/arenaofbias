import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/arena.ts', import.meta.url),
  'utf8',
);
const roster = await readFile(
  new URL('../lib/works-roster.json', import.meta.url),
  'utf8',
);
const prompts = await readFile(
  new URL('../lib/prompts-seed.json', import.meta.url),
  'utf8',
);
const code = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    /^import rosterData from ['"]\.\/works-roster\.json['"];?$/m,
    `const rosterData=${roster};`,
  )
  .replace(
    /^import promptsSeed from ['"]\.\/prompts-seed\.json['"];?$/m,
    `const promptsSeed=${prompts};`,
  );
const { eligiblePairs, eligiblePairCount, modelResults, randomArenaHash } =
  await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );
for (const promptId of new Set(modelResults.map((row) => row.promptId)))
  assert.equal(
    eligiblePairCount(promptId, modelResults),
    eligiblePairs(promptId, modelResults).length,
  );

// Include mixed prompts, demo rows and many variants per model. Count must keep
// the exact pairing semantics while avoiding quadratic temporary allocations.
const rows = Array.from({ length: 2000 }, (_, i) => ({
  ...modelResults[0],
  id: `variant-${i}`,
  promptId: 'large',
  modelId: `model-${i % 17}`,
  ...(i % 9 === 0 ? { isDemo: true } : { isDemo: false }),
}));
for (const size of [0, 1, 2, 20, 100]) {
  const sample = rows.slice(0, size);
  assert.equal(
    eligiblePairCount('large', sample),
    eligiblePairs('large', sample).length,
  );
  assert.equal(eligiblePairCount('other', sample), 0);
}
assert.equal(
  eligiblePairCount(
    'large',
    rows.map((row) => ({ ...row, modelId: 'same' })),
  ),
  0,
);
const before = performance.now();
const oldCount = eligiblePairs('large', rows).length;
const oldMs = performance.now() - before;
const after = performance.now();
const count = eligiblePairCount('large', rows);
const newMs = performance.now() - after;
assert.equal(count, oldCount);
assert.equal(
  randomArenaHash(undefined, () => 0, rows, [{ id: 'large' }]),
  '#arena/large',
);
console.log(JSON.stringify({ works: rows.length, pairs: count, oldMs, newMs }));
console.log(
  'PASS catalog pair counts: exact cross-model/demo/multi-work semantics, empty and large catalogs',
);
