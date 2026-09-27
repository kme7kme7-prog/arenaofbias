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
const calls = [];
globalThis.fetch = async (_url, init) => {
  calls.push(JSON.parse(init.body));
  return new Promise((resolve) => {
    finish = () => resolve({ ok: true, status: 201 });
  });
};
queueReaction('user', '001', 'work', 'up', null);
const first = flushReactions();
await Promise.resolve();
queueReaction('user', '001', 'work', null, null);
finish();
await first;
assert.equal(peekPending('user', 'work'), null, '取消不能被正在发送的 up 吞掉');
const second = flushReactions();
await Promise.resolve();
finish();
await second;
assert.deepEqual(
  calls.map((call) => call.kind),
  ['up', null],
);
assert.equal(peekPending('user', 'work'), undefined);
queueReaction('user', '001', 'work', 'laugh', null);
queueReaction('other', '001', 'work', 'down', null);
assert.equal(peekPending('user', 'work'), 'laugh');
assert.equal(peekPending('other', 'work'), 'down');
console.log(
  'PASS in-flight cancellation, latest intent preservation and account-separated queues',
);
