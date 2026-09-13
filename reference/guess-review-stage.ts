// 仅对照页加载：调用真实页面与判定函数，存储和猜测接口在本 iframe 内隔离。
import { GUESS_MODELS, ATTRIBUTE_KEYS, judge } from '../lib/guess-logic';
const scene = new URLSearchParams(location.search).get('scene');
const answer = GUESS_MODELS[0];
const dayKey = 'preview-day';
const memory = new Map<string, string>();
memory.set(
  'arena-language',
  new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh',
);
const wrong = GUESS_MODELS.filter((m) => m.id !== answer.id);
const chosen =
  scene === 'win'
    ? [wrong[75], wrong[40], answer]
    : scene === 'loss'
      ? wrong.slice(30, 38)
      : scene === 'feedback'
        ? [wrong[75], wrong[40]]
        : [];
const guesses = chosen.map((guess) => ({ guess, ...judge(guess, answer) }));
const finished = scene === 'win' || scene === 'loss';
memory.set(
  'guess-session:' + dayKey,
  JSON.stringify({
    guesses,
    finished,
    revealed: finished,
    answer: finished ? answer : null,
  }),
);
memory.set(
  'guess-stats',
  JSON.stringify({ played: 12, won: 9, streak: 3, best: 2 }),
);
// Native methods deliberately retain the calling Storage receiver below.
// oxlint-disable-next-line typescript/unbound-method
const get = Storage.prototype.getItem;
// oxlint-disable-next-line typescript/unbound-method
const set = Storage.prototype.setItem;
Storage.prototype.getItem = function (key) {
  return key.startsWith('guess-') || key === 'arena-language'
    ? (memory.get(key) ?? null)
    : get.call(this, key);
};
Storage.prototype.setItem = function (key, value) {
  if (key.startsWith('guess-') || key === 'arena-language')
    memory.set(key, value);
  else set.call(this, key, value);
};
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url.endsWith('/api/guess/today'))
    return Response.json({
      dayKey,
      dayNumber: 42,
      attributes: ATTRIBUTE_KEYS,
      models: GUESS_MODELS,
    });
  if (url.endsWith('/api/guess/check')) {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
    const model = GUESS_MODELS.find((m) => m.id === body.guessId);
    if (!model) return Response.json({}, { status: 400 });
    const feedback = judge(model, answer);
    return Response.json({
      feedback,
      answer: feedback.won || body.final ? answer : null,
    });
  }
  if (url.endsWith('/api/track')) return new Response(null, { status: 204 });
  return realFetch(input, init);
};
location.hash = 'guess';
await import('../src/main');
