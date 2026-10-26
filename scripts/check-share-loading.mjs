import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('..', import.meta.url)) } });
const { publicCatalog } = await jiti.import('../lib/public-catalog.ts');
let client = new URL('../lib/share-client.ts', import.meta.url);
if (process.argv.includes('--baseline')) {
  // Keep the tracked source untouched while replaying HEAD against this test.
  const root = fileURLToPath(new URL('..', import.meta.url));
  const source = execFileSync('git', ['show', 'HEAD:lib/share-client.ts'], { cwd: root, encoding: 'utf8' })
    .replace(/from '\.\/([^']+)'/g, (_, name) => `from ${JSON.stringify(fileURLToPath(new URL(`../lib/${name}`, import.meta.url)))}`);
  client = new URL('../../../security-game/share-client-baseline.ts', import.meta.url);
  await mkdir(new URL('.', client), { recursive: true });
  await writeFile(client, source);
}
const { resolveShareData } = await jiti.import(client.href);
const original = { catalog: { ...publicCatalog }, fetch: globalThis.fetch, location: globalThis.location, setTimeout: globalThis.setTimeout };
let mode = 'headers', requested, signals = [], catalogCalls = 0;
const server = createServer((req, res) => {
  requested?.();
  if (mode === 'body') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.write('incomplete png'); }
  else if (mode === 'unavailable') { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const prompt = { id: '001', name: 'Public fixture', prompt: 'Public question' };
const works = ['left', 'right'].map(id => ({ id, promptId: prompt.id, modelId: id, modelName: id,
  content: JSON.stringify({ kind: 'image', src: `${origin}/image-${id}.png` }) }));
const query = new URLSearchParams({ type: 'duel', prompt: prompt.id, a: 'left', b: 'right', pick: 'a' }).toString();
const prompts = async () => { catalogCalls++; return [prompt]; };
const readWorks = async () => { catalogCalls++; return works; };
const bounded = async promise => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = original.setTimeout(() => reject(new Error('share image read did not settle')), 500);
    })]);
  } finally { clearTimeout(timer); }
};
try {
  publicCatalog.prompts = prompts; publicCatalog.works = readWorks;
  globalThis.location = { origin };
  globalThis.fetch = (url, options) => {
    assert.equal(options.credentials, 'omit', 'share images must never send account credentials');
    signals.push(options.signal);
    return original.fetch(url, options);
  };
  // Exercise the real HTTP abort at a short clock scale. Only the intended 12s
  // image deadline changes; the failure watchdog remains independent.
  globalThis.setTimeout = (callback, delay, ...args) => original.setTimeout(callback, delay === 12000 ? 30 : delay, ...args);
  for (const stalled of ['headers', 'body']) {
    mode = stalled; signals = [];
    const result = await bounded(resolveShareData(query));
    assert.deepEqual(result.thumbs, [null, null]);
    assert.equal(signals.length, 2);
    assert.ok(signals.every(signal => signal?.aborted), `${stalled} timeout must abort the actual image reads`);
    assert.deepEqual(result.pair, ['left', 'right']);
    console.log(`PASS stalled ${stalled}: bounded read, both images aborted, original missing-image fallback`);
  }
  mode = 'body'; signals = [];
  const controller = new AbortController();
  const began = new Promise(resolve => { requested = resolve; });
  const cancelled = resolveShareData(query, controller.signal);
  await began; requested = null; controller.abort();
  await assert.rejects(bounded(cancelled), { name: 'AbortError' });
  assert.ok(signals.every(signal => signal.aborted));
  console.log('PASS closing cancels in-flight image bodies and rejects the old generation');

  const alreadyClosed = new AbortController(); alreadyClosed.abort();
  catalogCalls = 0; signals = [];
  await assert.rejects(resolveShareData(query, alreadyClosed.signal), { name: 'AbortError' });
  assert.equal(catalogCalls, 0); assert.equal(signals.length, 0);
  console.log('PASS a closed share sheet starts no catalog or image requests');

  let release;
  publicCatalog.prompts = async () => { await new Promise(resolve => { release = resolve; }); return [prompt]; };
  const closedDuringCatalog = new AbortController(); catalogCalls = 0;
  const pending = resolveShareData(query, closedDuringCatalog.signal);
  closedDuringCatalog.abort(); release();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(catalogCalls, 0, 'a late shared prompt result must not start a work read');
  assert.equal(signals.length, 0);
  publicCatalog.prompts = prompts;
  console.log('PASS closing while the shared catalog loads stops subsequent requests');

  mode = 'unavailable'; signals = [];
  assert.deepEqual((await bounded(resolveShareData(query))).thumbs, [null, null]);
  assert.ok(signals.every(signal => !signal.aborted), 'a completed failure needs no forced abort');
  console.log('PASS ordinary missing images retain the existing fallback');
} finally {
  Object.assign(publicCatalog, original.catalog);
  globalThis.fetch = original.fetch; globalThis.location = original.location; globalThis.setTimeout = original.setTimeout;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
