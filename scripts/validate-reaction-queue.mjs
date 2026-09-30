// 并发补发期间用户取消/改态度，最终意图不得被旧响应吞掉。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = (
  await readFile(new URL('../lib/reactions.ts', import.meta.url), 'utf8')
).replace(
  "import { newId } from '@/lib/id';",
  'const newId = () => crypto.randomUUID();',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { queueReaction, flushReactions, peekPending } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
let finish;
let started;
const calls = [];
globalThis.fetch = async (url, init) => {
  if (url === '/api/auth/me') return { ok: true, json: async () => ({ user: { id: 'user' } }) };
  calls.push(JSON.parse(init.body));
  return new Promise((resolve) => {
    finish = () => resolve({ ok: true, status: 201 });
    started?.();
  });
};
queueReaction('user', '001', 'model', 'up', null);
const firstPosted = new Promise((resolve) => { started = resolve; });
const first = flushReactions();
await firstPosted;
queueReaction('user', '001', 'model', null, null);
finish();
await first;
assert.equal(peekPending('user', '001', 'model'), null, '取消不能被正在发送的 up 吞掉');
const secondPosted = new Promise((resolve) => { started = resolve; });
const second = flushReactions();
await secondPosted;
finish();
await second;
assert.deepEqual(
  calls.map((call) => call.kind),
  ['up', null],
);
assert.deepEqual(calls.map((call) => call.mid), ['model', 'model'], '补发遵循当前 mid 接口');
assert.equal(peekPending('user', '001', 'model'), undefined);
queueReaction('user', '001', 'model', 'laugh', null);
queueReaction('other', '001', 'model', 'down', null);
queueReaction('user', '002', 'model', 'up', null);
assert.equal(peekPending('user', '001', 'model'), 'laugh');
assert.equal(peekPending('other', '001', 'model'), 'down');
assert.equal(peekPending('user', '002', 'model'), 'up', '同模型不同题目队列不混');
globalThis.fetch = async () => { throw new Error('offline'); };
assert.equal(await flushReactions(), 3, '身份读取失败保留待重试');
assert.equal(peekPending('other', '001', 'model'), 'down');
const switchedCalls = [];
globalThis.fetch = async (url, init) => {
  if (url === '/api/auth/me') return { ok: true, json: async () => ({ user: { id: 'other' } }) };
  switchedCalls.push(JSON.parse(init.body));
  return { ok: true, status: 201 };
};
assert.equal(await flushReactions(), 0);
assert.deepEqual(switchedCalls.map((call) => [call.userId, call.promptId, call.mid]), [['other', '001', 'model']], '切号后不发送旧账号意图');
assert.equal(peekPending('user', '001', 'model'), undefined);
globalThis.fetch = async () => { throw new Error('empty queue must not fetch'); };
assert.equal(await flushReactions(), 0);
console.log(
  'PASS in-flight cancellation, mid contract, per-question queues and account changes',
);
