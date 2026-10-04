// Public question IDs through real parsers/share resolution; fixture-only requests.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { withApiFixture } from './api-fixture.mjs';

const load = async (file, replace = source => source) => {
  const source = replace(await readFile(new URL(file, import.meta.url), 'utf8'));
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(withApiFixture(code)).toString('base64')}`);
};
const ids = ['022', 'q-48c3b43eeb284f6d', 'new-season'];
const prompts = ids.map(id => ({ id, kind: 'web', name: `题目 ${id}`, prompt: '比较作品' }));
const works = ids.flatMap(promptId => [0, 1].map(i => ({ id: `${promptId}-work-${i}`, promptId,
  modelId: `model-${i}`, modelName: `模型 ${i}`, title: '作品', content: JSON.stringify({ kind: 'text' }) })));
globalThis.fetch = async path => ({ ok: true, json: async () => (typeof path === 'string' ? path : path.url).includes('/api/prompts') ? { prompts } : { works } });
const promptApi = await load('../lib/prompts.ts', source => source.replace(
  "import { prompts as seedPrompts } from '@/lib/arena';", 'const seedPrompts = [];'));
assert.deepEqual((await promptApi.fetchPrompts()).map(prompt => prompt.id), ids);
console.log('PASS remote catalog accepts legacy, community and canonical package IDs');
const shared = await load('../lib/shared-duel.ts');
const share = await load('../lib/share-client.ts', source => source.replace(
  "import { shareSvg } from './share-card.js';", 'const shareSvg = () => "";'));
for (const id of ids) {
  const pair = [id, `${id}-work-0`, `${id}-work-1`];
  const query = `?duel=${encodeURIComponent(JSON.stringify(pair))}`;
  assert.deepEqual(shared.parseSharedDuel(query), pair);
  assert.ok(shared.resolveSharedDuel(pair, works));
  const prompt = await share.resolveShareData(`type=prompt&prompt=${id}`);
  assert.equal(prompt.target, `/#arena/${id}`);
  const duel = await share.resolveShareData(`type=duel&prompt=${id}&a=${pair[1]}&b=${pair[2]}&pick=a`);
  assert.equal(duel.prompt.id, id);
  assert.ok(duel.target.endsWith(`#arena/${id}`));
  assert.deepEqual(shared.parseSharedDuel(new URL(duel.target, 'https://game.test').search), pair);
}
console.log('PASS prompt cards and shared duels round-trip all three ID formats');
for (const id of ['../secret', 'q-<script>', '题目', 'a'.repeat(65), '']) {
  assert.equal(shared.parseSharedDuel(`?duel=${encodeURIComponent(JSON.stringify([id, 'a', 'b']))}`), null);
  await assert.rejects(share.resolveShareData(`type=prompt&prompt=${encodeURIComponent(id)}`));
}
console.log('PASS invalid IDs stay rejected');
