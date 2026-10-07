import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { withApiFixture } from './api-fixture.mjs';

// Exercise the real stores and HTTP deadlines with no network or production writes.
async function moduleOf(file, adapt) {
  const source = adapt(await readFile(new URL(file, import.meta.url), 'utf8'));
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(withApiFixture(code)).toString('base64')}`);
}
const prompts = await moduleOf('../lib/prompts.ts', source => source.replace(
  "import { prompts as seedPrompts } from '@/lib/arena';",
  'const seedPrompts = [{ id: "001", name: "Local seed" }];'));
const works = await moduleOf('../lib/works.ts', source => source.replace(
  "import { knownContentKinds, modelResults } from '@/lib/arena';",
  'const knownContentKinds = new Set(["text", "html"]); const modelResults = [];'));

let nextTimer = 0;
const timers = new Map();
globalThis.setTimeout = (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; };
globalThis.clearTimeout = id => timers.delete(id);
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
async function expire(ms) {
  const pending = [...timers].filter(([, timer]) => timer.ms === ms);
  assert.ok(pending.length, `expected a ${ms}ms timer`);
  for (const [id, timer] of pending) { timers.delete(id); timer.fn(); }
  await flush();
}
const aborted = signal => new Promise((_resolve, reject) => {
  const fail = () => reject(new DOMException('Aborted', 'AbortError'));
  if (signal.aborted) fail(); else signal.addEventListener('abort', fail, { once: true });
});
const promptRows = ['022', 'q-48c3b43eeb284f6d', 'new-season'].map(id => ({
  id, kind: 'web', name: `Question ${id}`, prompt: 'Compare the works',
}));
const workRow = id => ({ id, promptId: promptRows[1].id, modelId: id, modelName: id,
  title: 'Work', isDemo: 0, content: JSON.stringify({ kind: 'text', story: { paragraphs: ['Original'] } }),
});
let queues, calls;
function fixture(promptResponses, workResponses = []) {
  calls = [];
  queues = { '/api/prompts': [...promptResponses], '/api/works': [...workResponses] };
  globalThis.fetch = async (url, options) => {
    const path = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    assert.equal(options.credentials, 'include');
    calls.push(path);
    const next = queues[path]?.shift();
    assert.notEqual(next, undefined, `unexpected request ${path}`);
    if (next === 'network') throw new TypeError('Network unavailable');
    if (next === 'headers') return aborted(options.signal);
    if (next === 'body') return { ok: true, json: () => aborted(options.signal) };
    if (typeof next === 'function') return next(options.signal);
    return { ok: next !== 'http', json: async () => next };
  };
}

for (const failure of ['headers', 'body']) {
  prompts.resetPromptsForTest();
  fixture([failure, { prompts: promptRows }]);
  const first = prompts.loadPrompts();
  assert.equal(prompts.loadPrompts(), first, 'concurrent callers share one read');
  await flush();
  await expire(12000);
  assert.equal(prompts.getPromptsState().status, 'loading', 'do not declare the seed a successful catalog');
  await expire(400);
  await first;
  assert.deepEqual(prompts.currentPrompts().map(prompt => prompt.id), promptRows.map(row => row.id));
  assert.equal(prompts.getPromptsState().source, 'remote');
  await prompts.loadPrompts();
  assert.equal(calls.length, 2, 're-entry after success makes no extra request');
  assert.equal(timers.size, 0);
}
console.log('PASS hanging headers/body recover once; concurrent reads deduplicate; success stays remote');

prompts.resetPromptsForTest();
fixture(['network', 'http']);
let read = prompts.loadPrompts();
await flush();
await expire(400);
await read;
assert.equal(prompts.getPromptsState().source, 'builtin');
assert.equal(calls.length, 2);
assert.equal(timers.size, 0, 'two failures stop without a retry loop');
fixture([{ prompts: promptRows }]);
await prompts.loadPrompts();
assert.equal(prompts.getPromptsState().source, 'remote', 'manual/online/re-entry can recover the same session');
assert.equal(calls.length, 1);

prompts.resetPromptsForTest();
fixture([{ prompts: [] }]);
await prompts.loadPrompts();
await prompts.loadPrompts();
assert.deepEqual(prompts.currentPrompts(), []);
assert.equal(prompts.getPromptsState().source, 'remote');
assert.equal(calls.length, 1, 'a published empty catalog never resurrects seeds or retries');
console.log('PASS two failures stop; same-session recovery works; published empty prompts stay empty');

prompts.resetPromptsForTest();
fixture(['network']);
read = prompts.loadPrompts();
await flush();
prompts.resetPromptsForTest();
await read;
assert.equal(prompts.getPromptsState().status, 'loading');
assert.equal(calls.length, 1);
assert.equal(timers.size, 0, 'cancellation clears retry wait and cannot publish a stale seed');

works.resetWorksForTest();
fixture([], ['network', { works: [workRow('recovered')] }]);
read = works.loadWorks();
assert.equal(works.loadWorks(), read);
await flush();
await expire(400);
await read;
assert.equal(works.getWorksState().source, 'remote');
assert.equal(works.currentWorks()[0].id, 'recovered');
await works.loadWorks();
assert.equal(calls.length, 2);
fixture([], ['http']);
assert.equal(await works.refreshWorks(new AbortController().signal), false);
assert.equal(calls.length, 1, 'match failure refresh retains its single-request contract');
assert.equal(works.currentWorks()[0].id, 'recovered', 'failed match refresh retains the good roster');
fixture([], [{ works: [] }]);
assert.equal(await works.refreshWorks(new AbortController().signal), true);
assert.deepEqual(works.currentWorks(), []);
assert.equal(works.getWorksState().source, 'remote');
console.log('PASS canceled retry cleans up; works recover; match refresh stays single and preserves valid empty data');

works.resetWorksForTest();
let resolveOld;
fixture([], [() => ({ ok: true, json: () => new Promise(resolve => { resolveOld = resolve; }) }),
  { works: [workRow('fresh')] }]);
read = works.loadWorks();
await flush();
await works.refreshWorks(new AbortController().signal);
resolveOld({ works: [workRow('old')] });
await read;
assert.equal(works.currentWorks()[0].id, 'fresh', 'late initial response cannot overwrite a recovered roster');
assert.equal(timers.size, 0);
console.log('PASS late initial response cannot overwrite fresh match recovery');
