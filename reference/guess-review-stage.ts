// 仅对照页加载：调用真实页面与判定函数，存储和猜测接口在本 iframe 内隔离。
// 对局不落盘（2026-09-14 起）：win/loss/feedback 场景不再种子注入存档，
// 而是在页面进入每日模式后用真实输入事件逐条提交猜测（check 已 mock），
// 走与真实用户完全一致的提交流程到达对应状态。
import {
  GUESS_MODELS,
  ATTRIBUTE_KEYS,
  judge,
  dailyPool,
} from '../lib/guess-logic';
const scene = new URLSearchParams(location.search).get('scene');
// 双模式（决策 064）：对照页固定演示每日一题；guess-force-mode 让页面
// 跳过选择屏直接进每日模式（真实用户路径没有该键，永远先选模式）
const answer = dailyPool(GUESS_MODELS)[0];
const dayKey = 'preview-day';
const memory = new Map<string, string>();
memory.set(
  'arena-language',
  new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh',
);
if (scene !== 'picker') memory.set('guess-force-mode', 'daily');
const wrong = GUESS_MODELS.filter((m) => m.id !== answer.id);
const chosen =
  scene === 'win'
    ? [wrong[75], wrong[40], answer]
    : scene === 'loss'
      ? wrong.slice(30, 38)
      : scene === 'feedback'
        ? [wrong[75], wrong[40]]
        : [];
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
// oxlint-disable-next-line typescript/unbound-method
const remove = Storage.prototype.removeItem;
Storage.prototype.removeItem = function (key) {
  if (key.startsWith('guess-') || key === 'arena-language') memory.delete(key);
  else remove.call(this, key);
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
  if (url.endsWith('/api/guess/practice/start'))
    return Response.json({ gameId: 'practice-demo' });
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
  if (url.endsWith('/api/guess/result'))
    return new Response(null, { status: 204 });
  if (url.endsWith('/api/track')) return new Response(null, { status: 204 });
  return realFetch(input, init);
};
location.hash = 'guess';
await import('../src/main');

// ── 场景驱动：等游戏屏就绪后按场景提交猜测（真实输入事件，非状态注入）──
const waitFor = async (
  predicate: () => boolean,
  timeout = 5000,
): Promise<boolean> => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

if (chosen.length) {
  const ready = await waitFor(
    () => !!document.querySelector<HTMLInputElement>('.guess-input input'),
  );
  if (!ready) throw new Error('对照页：游戏屏未就绪');
  // oxlint-disable-next-line typescript/unbound-method -- called with the input as receiver on purpose
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!;
  for (const model of chosen) {
    const input = document.querySelector<HTMLInputElement>(
      '.guess-input input',
    )!;
    valueSetter.call(input, model.name);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // 等候选列表按 query 重算（React 渲染一拍）
    await new Promise((r) => setTimeout(r, 120));
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    // 等提交完成（mocked check 即时返回）与翻格动效起步，再喂下一猜
    await new Promise((r) => setTimeout(r, 200));
  }
}
