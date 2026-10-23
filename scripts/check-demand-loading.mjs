import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createJiti } from 'jiti';
import { createBotSourceLoader } from '../public/generals/web/bot-sources.js';

const code = 'function decide(){return null;}';
const entry = { id: 'test-bot', name: 'Fixture', sha256: createHash('sha256').update(code).digest('hex') };
let calls = 0, release;
const gate = new Promise(resolve => { release = resolve; });
const load = createBotSourceLoader(async (url, options) => {
  calls++;
  assert.equal(url, '/generals/bots/test-bot.js');
  assert.equal(options.cache, 'no-cache');
  await gate;
  return new Response(code);
});
assert.equal(calls, 0, 'library metadata alone must not read code');
const first = load(entry), second = load(entry);
assert.equal(calls, 1, 'overlapping consumers share one request');
release();
assert.equal((await first).code, code);
assert.equal((await second).code, code);
assert.equal((await load(entry)).code, code);
assert.equal(calls, 1, 'verified code is reused');
assert.equal((await load({ human: true })).human, true);
assert.equal((await load({ id: 'local', code })).code, code);
await assert.rejects(load({ ...entry, id: '../outside' }), /不合法/);
assert.equal(calls, 1);

let attempt = 0;
const retry = createBotSourceLoader(async () => new Response(++attempt === 1 ? 'tampered' : code));
await assert.rejects(retry(entry), /校验失败/);
assert.equal((await retry(entry)).code, code);
assert.equal(attempt, 2, 'a failed verification does not poison the retry cache');

globalThis.__arrivalFixture = { works: { status: 'loading' }, prompts: { status: 'loading' }, ready: 0, failed: 0 };
const fixture = globalThis.__arrivalFixture;
globalThis.window = { ArenaEntry: { ready: () => { fixture.ready++; return Promise.resolve(); }, fail: () => { fixture.failed++; } } };
const source = (await readFile(new URL('../lib/portal-entry.ts', import.meta.url), 'utf8'))
  .replace("import { getWorksState } from './works';", 'const getWorksState=()=>globalThis.__arrivalFixture.works;')
  .replace("import { getPromptsState } from './prompts';", 'const getPromptsState=()=>globalThis.__arrivalFixture.prompts;');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { settlePortalHome } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
settlePortalHome({}, false);
assert.equal(fixture.ready, 1, 'the landing page does not wait for unrelated catalogs');
settlePortalHome({}, true);
assert.equal(fixture.ready, 1, 'a catalog consumer still waits for both catalogs');
fixture.works = { status: 'error' };
settlePortalHome({}, true);
assert.equal(fixture.failed, 1);
fixture.works = { status: 'ready', source: 'builtin' };
fixture.prompts = { status: 'ready', source: 'remote' };
settlePortalHome({}, true);
assert.equal(fixture.failed, 2);
assert.equal(fixture.ready, 1, 'a stand-in catalog never releases a successful arrival');
fixture.works.source = 'remote';
settlePortalHome({}, true);
assert.equal(fixture.ready, 2);

const jiti = createJiti(import.meta.url);
const { guessShareQuery } = await jiti.import('../lib/guess-share.ts');
const attributes = Object.fromEntries(['vendor','released','openWeights','contextK','modalities','reasoning','priceTier'].map((key, i) => [key, { state: ['hit','near','miss','unknown'][i % 4] }]));
const query = new URLSearchParams(guessShareQuery({ guesses: [{ attributes, won: true, guess: { name: 'Fixture' } }], answer: null }, '2026-10-23', true));
assert.equal(query.get('grid'), 'hnmuhnm');
assert.equal(query.get('answer'), 'Fixture');
console.log('PASS on-demand loading: selected code only, shared reads, integrity/retry, scoped arrival readiness and unchanged guess share order');
