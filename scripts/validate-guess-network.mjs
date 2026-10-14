// Exercise the real request code against a local HTTP server, never production.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createJiti } from 'jiti';
import ts from 'typescript';
import { withApiFixture } from './api-fixture.mjs';

const jiti = createJiti(import.meta.url);
const { ATTRIBUTE_KEYS } = await jiti.import('../lib/guess-logic.ts');
const source = await readFile(new URL('../lib/guess.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(/^import .* from '\.\/guess-logic';$/m,
  `const ATTRIBUTE_KEYS = ${JSON.stringify(ATTRIBUTE_KEYS)};`);
const api = await import(`data:text/javascript;base64,${Buffer.from(withApiFixture(code)).toString('base64')}`);
const friendSource = await readFile(new URL('../lib/guess-friends.ts', import.meta.url), 'utf8');
const friendCode = ts.transpileModule(friendSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const friends = await import(`data:text/javascript;base64,${Buffer.from(withApiFixture(friendCode)).toString('base64')}`);

let behavior = 'ok';
let requests = 0;
const received = [];
const server = createServer(async (req, res) => {
  requests++;
  let body = '';
  for await (const chunk of req) body += chunk;
  received.push({ path: req.url, body: body ? JSON.parse(body) : null });
  if (behavior === 'headers-stalled') return;
  if (behavior === 'body-stalled') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{');
    return;
  }
  if (behavior === 'disconnected') { res.destroy(); return; }
  res.writeHead(Number(behavior) || 200, { 'Content-Type': 'application/json' });
  res.end(behavior === 'invalid-json' ? '{broken' : JSON.stringify({ gameId: 'test-room', ok: true }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const nativeFetch = globalThis.fetch;
const nativeTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const deadlines = new Set();
let accelerated = false;
let deadlineCount = 0;
globalThis.fetch = (path, options) => nativeFetch(new URL(path, origin), options);
globalThis.setTimeout = (callback, ms, ...args) => {
  if (ms !== 12000) return nativeTimeout(callback, ms, ...args);
  deadlineCount++;
  const timer = nativeTimeout(callback, accelerated ? 150 : ms, ...args);
  deadlines.add(timer);
  return timer;
};
globalThis.clearTimeout = timer => {
  deadlines.delete(timer);
  return nativeClearTimeout(timer);
};
let checks = 0;
const pass = message => { checks++; console.log(`PASS ${message}`); };
try {
  assert.deepEqual(await api.fetchToday(), { gameId: 'test-room', ok: true });
  assert.equal(await api.startPractice(3), 'test-room');
  await api.checkGuess('model-a', false, 'test-room');
  await api.checkGuess('model-b', true, undefined, '2026-10-14');
  assert.deepEqual(received.map(row => row.body), [
    null, { difficulty: 3 }, { guessId: 'model-a', final: false, gameId: 'test-room' },
    { guessId: 'model-b', final: true, dayKey: '2026-10-14' },
  ]);
  assert.equal(deadlines.size, 0);
  pass('Successful daily/practice/guess requests preserve payloads and clear deadlines');

  for (const [status, error] of [[404, api.PracticeExpiredError], [409, api.DailyChangedError], [429, api.RateLimitedError]]) {
    behavior = String(status);
    await assert.rejects(() => api.checkGuess('model-a', false), error);
    assert.equal(await api.fetchToday(), null);
    assert.equal(await api.startPractice(3), null);
    assert.equal(deadlines.size, 0);
    pass(`HTTP ${status} keeps its existing game recovery semantics`);
  }
  for (const failure of ['500', 'invalid-json', 'disconnected']) {
    behavior = failure;
    assert.equal(await api.checkGuess('model-a', false), null);
    assert.equal(deadlines.size, 0);
    pass(`${failure} releases the request without throwing an unhandled error`);
  }

  accelerated = true;
  for (const failure of ['headers-stalled', 'body-stalled']) {
    behavior = failure;
    for (const [name, request] of [
      ['today', () => api.fetchToday()],
      ['practice', () => api.startPractice(3)],
      ['guess', () => api.checkGuess('model-a', false, 'test-room')],
      ['reveal', () => api.checkGuess('model-a', true, 'test-room')],
    ]) {
      const before = requests;
      const beforeDeadline = deadlineCount;
      assert.equal(await request(), null);
      assert.equal(requests - before, 1, 'No automatic resubmission');
      assert.equal(deadlineCount - beforeDeadline, 1, 'The production deadline is 12 seconds');
      assert.equal(deadlines.size, 0);
      pass(`${String(name)}: ${failure} aborts including response body and clears its deadline`);
    }
  }
  behavior = 'ok';
  assert.equal((await api.checkGuess('model-a', false, 'test-room')).ok, true);
  assert.equal(deadlines.size, 0);
  pass('Manual retry succeeds after a timed-out request');
  assert.equal((await friends.friendRequest('create', { difficulty: 2 })).ok, true);
  assert.deepEqual(received.at(-1), { path: '/api/guess/friends/create', body: { difficulty: 2 } });
  pass('Friend commands use the authenticated API wrapper and preserve payloads');
  for (const status of [401, 403, 404, 409, 429]) {
    behavior = String(status);
    await assert.rejects(() => friends.friendRequest('current'), error => error instanceof friends.FriendRequestError && error.status === status);
    assert.equal(deadlines.size, 0);
    pass(`Friend HTTP ${status} preserves the recovery status`);
  }
  for (const failure of ['headers-stalled', 'body-stalled']) {
    behavior = failure;
    const before = requests, beforeDeadline = deadlineCount;
    await assert.rejects(() => friends.friendRequest('ABCDEFGH/guess', { round: 1, guessId: 'a', requestId: 'same_request_id_01' }), error => error.status === 0);
    assert.equal(requests - before, 1);
    assert.equal(deadlineCount - beforeDeadline, 1);
    assert.equal(deadlines.size, 0);
    pass(`Friend ${failure} times out once without automatic resubmission`);
  }
  const cancelled = new AbortController(); cancelled.abort();
  const before = requests;
  await assert.rejects(() => friends.friendRequest('current', undefined, cancelled.signal), error => error.status === 0);
  assert.equal(requests, before);
  assert.equal(deadlines.size, 0);
  pass('Unmount cancellation prevents a friend request and clears its deadline');
  console.log(`${checks} guess network checks passed.`);
} finally {
  globalThis.fetch = nativeFetch;
  globalThis.setTimeout = nativeTimeout;
  globalThis.clearTimeout = nativeClearTimeout;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
