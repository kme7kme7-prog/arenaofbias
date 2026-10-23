import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { createTierCatalog } from '../app/tier/catalog.mjs';
import { publicWorkURL } from '../lib/public-work-url.mjs';

const token = 'a'.repeat(32);
for (const source of [`https://w.arenaofbias.icu/v/w${token}/`, `https://w.arenaofbias.icu/v/c${token}/?aob=prev`,
  ...['w', 'p', 'c'].map(kind => `https://${kind}${token}.w.arenaofbias.icu/`)]) assert.ok(publicWorkURL(source), source);
for (const source of [null, '', '/relative', `http://w.arenaofbias.icu/v/w${token}/`,
  `https://user:password@w.arenaofbias.icu/v/w${token}/`, `https://w.arenaofbias.icu:8443/v/w${token}/`,
  `https://w.arenaofbias.icu.evil.test/v/w${token}/`, `https://evil.test/v/w${token}/`,
  `https://w.arenaofbias.icu/c/w${token}/`, `https://w.arenaofbias.icu/v/p${token}/`,
  `https://w.arenaofbias.icu/v/d${token}/`, `https://w.arenaofbias.icu/v/m${token}/`, `https://w.arenaofbias.icu/v/e${token}/`,
  `https://w.arenaofbias.icu/v/w${token.slice(1)}/`, `https://w.arenaofbias.icu/v/w${token}f/`,
  `https://w.arenaofbias.icu/v/w${token}/index.html`, `https://w.arenaofbias.icu/v/w${token}`,
  `https://w.arenaofbias.icu/v/w${token.toUpperCase()}/`, `https://w${token}.w.arenaofbias.icu.evil.test/`,
  `https://user@w${token}.w.arenaofbias.icu/`, `http://w${token}.w.arenaofbias.icu/`]) assert.equal(publicWorkURL(source), null, String(source));
assert.ok(publicWorkURL(`https://w.arenaofbias.icu:443/v/w${token}/`), 'the default HTTPS port is canonicalized');

const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('..', import.meta.url)) } });
const { createPublicCatalogReader, publicCatalog } = await jiti.import('../lib/public-catalog.ts');
const topics = JSON.parse(await readFile(new URL('../reference/tier-play/topics.json', import.meta.url)));
const brands = JSON.parse(await readFile(new URL('../reference/tier-play/brands.json', import.meta.url)));
const modelIds = Object.keys(brands);
const works = [...new Map(topics.flatMap(topic => topic.workIds.map((id, index) => [id, {
  id, promptId: topic.promptId, modelId: modelIds[index], modelName: `Model ${index}`, title: id, isDemo: 0,
  content: JSON.stringify(topic.kind === 'text' ? { kind: 'text', story: { paragraphs: ['Native text'] } } :
    { kind: 'html', src: index % 2 ? `https://w${index.toString(16).padStart(32, '0')}.w.arenaofbias.icu/` :
      `https://w.arenaofbias.icu/v/c${index.toString(16).padStart(32, '0')}/` }),
}]))).values()];
const prompts = topics.map(topic => ({ id: topic.promptId, kind: topic.kind === 'text' ? 'text' : 'web',
  name: topic.name, prompt: 'Public question', detail: 'Public detail' }));
let publicWorks = works, calls = [], fail = false;
const reader = createPublicCatalogReader(async path => {
  calls.push(path);
  await new Promise(resolve => setImmediate(resolve));
  if (fail) return null;
  const url = new URL(path, 'http://fixture');
  const ids = (url.searchParams.get('ids') ?? '').split(',');
  const promptIds = (url.searchParams.get('promptIds') ?? '').split(',');
  return url.pathname === '/api/prompts' ? { prompts: prompts.filter(row => promptIds.includes(row.id)) } :
    { works: publicWorks.filter(row => ids.includes(row.id) || promptIds.includes(row.promptId)) };
});
const catalog = createTierCatalog({ topics, brands, assetURL: name => '/' + name, origin: 'https://game.arenaofbias.icu',
  readCatalog: async ({ ids, promptIds }) => {
    const [works, prompts] = await Promise.all([reader.works(ids, '/api/playground/works'), reader.prompts(promptIds)]);
    return { works, prompts };
  } });
const [available, round] = await Promise.all([catalog.topics(), catalog.round('004')]);
assert.equal(available.length, 19);
assert.equal(round.works.length, 8);
const workCalls = calls.filter(path => path.includes('/works?'));
assert.equal(workCalls.length, 3, '147 indexed IDs and the initial round share three batches');
assert.equal(calls.filter(path => path.includes('/prompts?')).length, 1, 'only the current question needs its prompt');
const sentIds = workCalls.flatMap(path => new URL(path, 'http://fixture').searchParams.get('ids').split(','));
assert.equal(sentIds.length, 147);
assert.equal(new Set(sentIds).size, 147);
assert.ok(workCalls.every(path => new URL(path, 'http://fixture').searchParams.get('ids').split(',').length <= 50));
calls = [];
const identities = await catalog.identities('004');
assert.equal(Object.keys(identities).length, 8);
assert.equal(calls.length, 1, 'revealing reads only the selected IDs, without prompts');
publicWorks = works.filter(row => row.id !== topics.find(topic => topic.id === '004').workIds[0]);
await assert.rejects(catalog.identities('004'), /下架/);
assert.equal(calls.length, 2, 'completed results cannot hide a subsequent withdrawal');
publicWorks = works;
calls = [];
assert.deepEqual(await reader.works([]), []);
assert.deepEqual(await reader.prompts([]), []);
assert.equal(calls.length, 0, 'an empty selector never becomes an unfiltered request');
assert.deepEqual(await reader.works(['missing']), []);
fail = true;
const failed = await Promise.allSettled([reader.works(['retry']), reader.works(['retry'])]);
assert.ok(failed.every(result => result.status === 'rejected'));
assert.equal(calls.length, 2, 'overlapping failures also share one read');
fail = false;
assert.deepEqual(await reader.works(['retry']), []);
assert.equal(calls.length, 3, 'a failed batch can immediately be retried');
await assert.rejects(reader.works(['a,b']), /无效/);
await assert.rejects(reader.works(['a'.repeat(129)]), /无效/);
const legacy = createPublicCatalogReader(async () => ({ works }));
assert.deepEqual((await legacy.works([works[0].id])).map(row => row.id), [works[0].id], 'a legacy response is filtered locally');
let release, reads = 0;
const gate = new Promise(resolve => { release = resolve; });
const slow = createPublicCatalogReader(async () => { reads++; await gate; return { works: [works[0]] }; });
const first = slow.works([works[0].id]);
await new Promise(resolve => setImmediate(resolve));
const late = slow.works([works[0].id]);
assert.equal(reads, 1, 'a later consumer also shares an already dispatched read');
release();
assert.deepEqual(await first, await late);
await slow.works([works[0].id]);
assert.equal(reads, 2, 'only in-flight data is shared');

// Exercise the real consumers against the same selector reader, without touching their global full-catalog stores.
const original = { ...publicCatalog };
Object.assign(publicCatalog, reader);
globalThis.location = { origin: 'https://game.arenaofbias.icu' };
try {
  const { resolveShareData } = await jiti.import('../lib/share-client.ts');
  calls = [];
  const pair = works.filter(row => row.promptId === '004').slice(0, 2);
  const query = new URLSearchParams({ type: 'duel', prompt: '004', a: pair[0].id, b: pair[1].id, pick: 'a' }).toString();
  assert.deepEqual((await resolveShareData(query)).pair, pair.map(row => row.id));
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0], 'http://fixture').searchParams.get('promptIds'), '004');
  assert.deepEqual(new Set(new URL(calls[1], 'http://fixture').searchParams.get('ids').split(',')), new Set(pair.map(row => row.id)));
  publicWorks = works.filter(row => row.id !== pair[0].id);
  await assert.rejects(resolveShareData(query), /下架/);
  publicWorks = works;
  calls = [];
  await resolveShareData('type=site');
  assert.equal(calls.length, 0);
  const { loadObjectCatalog } = await jiti.import('../app/playground/object-catalog.ts');
  const result = await loadObjectCatalog();
  assert.equal(result.topics.length, 11);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(path => new URL(path, 'http://fixture').searchParams.get('promptIds').split(',').length === 11));
  assert.ok(result.topics.flatMap(topic => topic.works).every(work => new URL(work.src).searchParams.get('parent') === location.origin));
  const { getWorksState } = await jiti.import('../lib/works.ts');
  const { getPromptsState } = await jiti.import('../lib/prompts.ts');
  assert.equal(getWorksState().status, 'loading');
  assert.equal(getPromptsState().status, 'loading');
} finally {
  Object.assign(publicCatalog, original);
  delete globalThis.location;
}
console.log('PASS scoped catalogs: 50-ID batches, overlapping consumers, fresh withdrawal checks, failures/retry, legacy filtering, empty guards, share and object scope, untouched global stores');
