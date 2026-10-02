// 浏览器每日进度契约：临时内存 storage，不读写用户数据。
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('..', import.meta.url)) } });
const { GUESS_MODELS, judge } = await jiti.import('../lib/guess-logic.ts');
const {
  loadDailySession,
  saveDailySession,
  markCounted,
  wasCounted,
  withDailyLock,
} = await jiti.import('../lib/guess.ts');
const [a, b] = GUESS_MODELS;
const row = { guess: a, attributes: judge(a, b).attributes, won: false };
const day = '2026-09-26';
assert.equal(loadDailySession(day, GUESS_MODELS), null);
saveDailySession(day, {
  guesses: [row],
  finished: false,
  revealed: false,
  answer: null,
});
let restored = loadDailySession(day, GUESS_MODELS);
assert.equal(restored.guesses[0].guess.id, a.id);
assert.equal(restored.finished, false);
assert.equal(loadDailySession('2026-09-27', GUESS_MODELS), null);
saveDailySession(day, {
  ...restored,
  finished: true,
  revealed: true,
  answer: b,
});
restored = loadDailySession(day, GUESS_MODELS);
assert.equal(restored.finished, true);
assert.equal(restored.answer.id, b.id);
markCounted('2026-09-25');
assert.equal(
  loadDailySession('2026-09-25', GUESS_MODELS).finished,
  true,
  'legacy completion stays locked',
);
storage.set('guess-daily:2026-09-25', '{broken');
assert.equal(
  loadDailySession('2026-09-25', GUESS_MODELS).finished,
  true,
  'bad record cannot reopen settled day',
);
storage.set(
  'guess-daily:2026-09-27',
  JSON.stringify({ version: 1, guesses: [null] }),
);
assert.equal(
  loadDailySession('2026-09-27', GUESS_MODELS),
  null,
  'invalid rows do not crash',
);
assert.equal(await withDailyLock(day, () => 42), 42);
globalThis.localStorage.getItem = () => {
  throw new Error('blocked');
};
globalThis.localStorage.setItem = () => {
  throw new Error('blocked');
};
saveDailySession(day, restored);
markCounted(day);
assert.equal(loadDailySession(day, GUESS_MODELS).finished, true);
assert.equal(wasCounted(day), true);
console.log(
  'PASS daily resume / completion / next day / legacy / corrupt storage / storage denied',
);
