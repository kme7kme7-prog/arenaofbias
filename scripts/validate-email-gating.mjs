// Frontend shared-backend response checks; all requests use local stubs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const load = async (path, replace) => {
  const source = replace(await readFile(new URL(path, import.meta.url), 'utf8'));
  return import(`data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`);
};
const { submitVote } = await load('../lib/votes.ts', (source) => source.replace(
  "import { currentPrompts } from '@/lib/prompts';", 'const currentPrompts = () => [];',
));
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ counted: false, reason: 'unbound' }) });
assert.equal((await submitVote({})).issue, 'unbound', 'uncounted HTTP 200 must not be marked saved');
globalThis.fetch = async () => ({ ok: true, status: 201, json: async () => ({ counted: true }) });
assert.deepEqual(await submitVote({}), { ok: true });
globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
assert.equal((await submitVote({})).issue, 'auth');

globalThis.window = new EventTarget();
const { queueReaction, flushReactions, peekPending } = await load('../lib/reactions.ts', (source) => source.replace(
  "import { newId } from '@/lib/id';", 'const newId = () => crypto.randomUUID();',
));
let bindingPrompts = 0;
window.addEventListener('account-email-required', () => bindingPrompts++);
globalThis.fetch = async (url) => url === '/api/auth/me'
  ? { ok: true, json: async () => ({ user: { id: 'unbound' } }) }
  : { ok: false, status: 403, json: async () => ({ code: 'email_required' }) };
queueReaction('unbound', '001', 'model', 'up', null);
assert.equal(await flushReactions(), 0);
assert.equal(bindingPrompts, 1, 'email rejection prompts account binding');
assert.equal(peekPending('unbound', '001', 'model'), undefined, 'rejected reaction is not retried after binding');
console.log('PASS uncounted votes and email-required reaction handling');
