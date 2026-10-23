// Exercise the real reader and unchanged intention queue without network or production writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { withApiFixture } from './api-fixture.mjs';
const source = (await readFile(new URL('../lib/reactions.ts', import.meta.url), 'utf8'))
  .replace("import { newId } from '@/lib/id';", 'const newId = () => crypto.randomUUID();');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { readReactions, queueReaction, peekPending, flushReactions } = await import(`data:text/javascript;base64,${Buffer.from(withApiFixture(code)).toString('base64')}`);
const realTimeout = globalThis.setTimeout, realClear = globalThis.clearTimeout;
let nextTimer = 0;
const timers = new Map();
globalThis.setTimeout = (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; };
globalThis.clearTimeout = id => timers.delete(id);
const flush = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); };
const aborted = signal => new Promise((_resolve, reject) => {
  const abort = () => reject(new DOMException('Aborted', 'AbortError'));
  if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
});
const success = { counts: { model: { up: 3, down: 0, laugh: 0 } }, mine: { model: 'up' } };
let calls = [], release, response = success, mode = 'deferred';
globalThis.fetch = async (path, options) => {
  calls.push({ path, options });
  if (path === '/api/auth/me') return { ok: true, json: async () => ({ user: { id: 'a' } }) };
  if (mode === 'headers') return aborted(options.signal);
  return { ok: true, json: mode === 'body' ? () => aborted(options.signal)
    : mode === 'deferred' ? () => new Promise(resolve => { release = () => resolve(response); })
      : async () => response };
};
try {
  const a = new AbortController(), b = new AbortController();
  const first = readReactions('001', 'a', a.signal), second = readReactions('001', 'a', b.signal);
  await flush(); assert.equal(calls.length, 1);
  a.abort(); assert.equal(await first, null); assert.equal(calls[0].options.signal.aborted, false, 'one bar cannot cancel its sibling');
  release(); assert.deepEqual(await second, success); assert.equal(timers.size, 0);
  mode = 'ready'; await readReactions('001', 'a', new AbortController().signal);
  assert.equal(calls.length, 2, 'successful results do not hide later live changes');
  mode = 'headers'; calls = [];
  const c = new AbortController(), d = new AbortController();
  const oldOwner = readReactions('001', 'a', c.signal), newOwner = readReactions('001', 'b', d.signal);
  await flush(); assert.equal(calls.length, 2, 'different identities never share a request');
  c.abort(); assert.equal(await oldOwner, null); assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(calls[1].options.signal.aborted, false); d.abort(); await newOwner; await flush(); assert.equal(timers.size, 0);
  for (const failed of ['headers', 'body']) {
    mode = failed; calls = [];
    const pending = readReactions('001', 'a', new AbortController().signal); await flush();
    const deadlines = [...timers].filter(([, t]) => t.ms === 12000); assert(deadlines.length > 0);
    for (const [id, timer] of deadlines) { timers.delete(id); timer.fn(); }
    assert.equal(await pending, null); await flush(); assert.equal(calls.length, 1); assert.equal(timers.size, 0);
  }
  mode = 'ready';
  for (response of [null, {}, { counts: [], mine: {} }, { counts: { m: { up: -1 } }, mine: {} }, { counts: {}, mine: { m: 'other' } }])
    assert.equal(await readReactions('001', 'a', new AbortController().signal), null);
  response = success; assert.deepEqual(await readReactions('001', 'a', new AbortController().signal), success);
  // A blocked identity check must not hold a read forever or send stale intentions later.
  let resolveIdentity;
  calls = [];
  queueReaction('a', '001', 'model', 'laugh', null);
  globalThis.fetch = async path => {
    calls.push({ path });
    return new Promise(resolve => { resolveIdentity = () => resolve({ ok: true, json: async () => ({ user: { id: 'b' } }) }); });
  };
  const blocked = readReactions('001', 'a', new AbortController().signal); await flush();
  for (const [id, timer] of timers) { timers.delete(id); timer.fn(); }
  assert.equal(await blocked, null);
  assert.equal(peekPending('a', '001', 'model'), 'laugh', 'read cancellation never drops a write intention');
  resolveIdentity(); await flush(); await flushReactions();
  assert.equal(peekPending('a', '001', 'model'), undefined, 'existing account fence discards the old identity intention');
  assert.deepEqual(calls.map(c => c.path), ['/api/auth/me'], 'a timed-out reader does not send a late GET or replay old writes under B');
  assert.equal(timers.size, 0);
  console.log('PASS sibling sharing/cancellation, identity separation, fresh reads, header/body/queue deadlines, bad shapes and unchanged account-fenced intentions');
} finally { globalThis.setTimeout = realTimeout; globalThis.clearTimeout = realClear; }
