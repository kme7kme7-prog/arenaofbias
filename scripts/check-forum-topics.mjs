import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const config = JSON.parse(await readFile(new URL('../lib/forum-presentation.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../lib/forum-topics.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace(/^import presentation[^\n]+$/m, `const presentation = ${JSON.stringify(config)};`);
const { isForumPrompt, forumTopics, nextForumTopic } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const original = { id: config.promptId, kind: 'text' };
const added = { id: 'q-cobra', kind: 'text', tags: ['弱智吧', 'arena-only'] };
const unavailable = { id: 'q-held', kind: 'text', tags: ['弱智吧'] };
const other = { id: '008', kind: 'text' };
assert.equal(isForumPrompt(original), true);
assert.equal(isForumPrompt(added), true);
assert.equal(isForumPrompt({ ...added, kind: 'web' }), false);
assert.equal(isForumPrompt(other), false);
assert.equal(isForumPrompt(undefined), false);
const topics = forumTopics([original, added, unavailable, other], id => id !== unavailable.id);
assert.deepEqual(topics, [original, added]);
assert.equal(nextForumTopic(original.id, topics), added);
assert.equal(nextForumTopic(added.id, topics), original);
assert.equal(nextForumTopic('missing', topics), original);
assert.equal(nextForumTopic(original.id, [original]), original);
assert.equal(nextForumTopic(original.id, []), undefined);
console.log('Forum topic routing: 11 assertions passed');
