// SurfaceTransition（可打断过渡）的不变量断言（决策 029）。
// 核心契约：开/关中途反向时，新动画第一帧必须从当前透明度/位移接续（不跳变）；
// 其次是状态机（opening/open/closing/closed 与 hidden 托管）、reduced 直达、
// dispose 取消后续回调。进出场时长/缓动是设计参数，由
// reference/surface-review.html 调，不在本脚本断言之列。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/ui-transitions.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { SurfaceTransition } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

// ---- 假浏览器环境：手写时钟 + 会插值的 FakeAnimation（getComputedStyle 可采样进行中的值） ----
let now = 0;

class FakeAnimation {
  constructor(element, keyframes, options) {
    this.element = element;
    this.keyframes = keyframes;
    this.options = options;
    this.startTime = now;
    this.state = 'running';
    this.finished = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    // 与浏览器一致：cancel 触发的拒绝允许无人订阅（类内部只链了 fade 的
    // finished，panel 的被 cancel 时没人接），预挂空 catch 防 Node 崩进程
    this.finished.catch(() => {});
    element.animations.push(this);
  }
  cancel() {
    if (this.state === 'running') {
      this.state = 'cancelled';
      this._reject(new Error('aborted'));
    }
  }
  finish() {
    if (this.state === 'running') {
      this.state = 'finished';
      now = Math.max(now, this.startTime + this.options.duration);
      this._resolve();
    }
  }
}
function advance(ms) {
  now += ms;
  for (const animation of runningAnimations()) {
    if (now >= animation.startTime + animation.options.duration) {
      animation.state = 'finished';
      animation._resolve();
    }
  }
}
const runningAnimations = () =>
  elements.flatMap((el) => el.animations.filter((a) => a.state === 'running'));
const flush = () => new Promise((resolve) => setImmediate(resolve));

const elements = [];
function makeElement() {
  const el = { hidden: true, dataset: {}, animations: [] };
  el.animate = (keyframes, options) => new FakeAnimation(el, keyframes, options);
  elements.push(el);
  return el;
}

// 线性采样某属性在当前时刻的动画值（fill:both，忽略缓动——断言只要求"在半路上"）
function sample(element, property) {
  const animation = element.animations
    .filter((a) => a.state === 'running' && property in a.keyframes[0])
    .at(-1);
  if (!animation) return property === 'opacity' ? 1 : 'none';
  const progress = Math.min(
    1,
    Math.max(0, (now - animation.startTime) / animation.options.duration),
  );
  const from = animation.keyframes[0][property];
  const to = animation.keyframes.at(-1)[property];
  if (property === 'opacity')
    return Number(from) + (Number(to) - Number(from)) * progress;
  const px = (value) =>
    value === 'none' ? 0 : Number(/translateY\((-?[\d.]+)(?:px)?\)/.exec(value)[1]);
  return `translateY(${px(from) + (px(to) - px(from)) * progress}px)`;
}
globalThis.getComputedStyle = (element) => ({
  get opacity() {
    return sample(element, 'opacity');
  },
  get transform() {
    return sample(element, 'transform');
  },
});

try {
  const root = makeElement();
  const panel = makeElement();
  const transition = new SurfaceTransition(root, panel, 300, 200);

  // 1. 完整开：opening → open，动画结束后清理，hidden 托管为 false
  transition.show(false);
  assert.equal(root.dataset.transition, 'opening');
  assert.equal(root.hidden, false, 'show must unhide the root immediately');
  assert.ok(root.animations.length > 0 && panel.animations.length > 0);
  advance(299);
  await flush();
  assert.equal(root.dataset.transition, 'opening', 'must still be opening before the duration ends');
  advance(1);
  await flush();
  assert.equal(root.dataset.transition, 'open');
  assert.equal(root.hidden, false);
  assert.equal(runningAnimations().length, 0, 'animations must be cancelled after completing');
  console.log('PASS show runs opening → open and cleans up its animations');

  // 2. 完整关：closing → closed，hidden 回到 true，finished 回调触发一次
  let closed = 0;
  transition.hide(false, () => closed++);
  assert.equal(root.dataset.transition, 'closing');
  advance(200);
  await flush();
  assert.equal(root.dataset.transition, 'closed');
  assert.equal(root.hidden, true);
  assert.equal(closed, 1);
  console.log('PASS hide runs closing → closed, hides root, fires finished once');

  // 3. 核心不变量：开到一半立即关——新动画第一帧从当前透明度/位移接续，不从 0/12px 跳变
  transition.show(false);
  advance(150); // 开到一半：opacity ≈ 0.5、panel ≈ translateY(6px)
  const midOpacity = sample(root, 'opacity');
  const midTransform = sample(panel, 'transform');
  assert.ok(midOpacity > 0.2 && midOpacity < 0.8, `sanity: mid-flight opacity, got ${midOpacity}`);
  transition.hide(false);
  const reverseFade = root.animations.at(-1);
  const reversePanel = panel.animations.at(-1);
  assert.equal(
    reverseFade.keyframes[0].opacity,
    midOpacity,
    'reverse fade must start from the mid-flight opacity, not jump to 0',
  );
  assert.equal(
    reversePanel.keyframes[0].transform,
    midTransform,
    'reverse panel must start from the mid-flight transform, not jump back',
  );
  advance(200);
  await flush();
  assert.equal(root.dataset.transition, 'closed');
  assert.equal(root.hidden, true);
  console.log('PASS interrupting an opening resumes the close from the current values');

  // 4. 已隐藏时再 hide：立即完成，不起动画
  transition.hide(false);
  assert.equal(root.dataset.transition, 'closed');
  assert.equal(root.hidden, true);
  assert.equal(runningAnimations().length, 0, 'hiding a hidden root must not animate');
  console.log('PASS hide on an already-hidden root is an immediate no-op');

  // 5. reduced-motion：立即到位，不起动画
  transition.show(true);
  assert.equal(root.dataset.transition, 'open');
  assert.equal(root.hidden, false);
  assert.equal(runningAnimations().length, 0, 'reduced motion must not animate');
  transition.hide(true);
  assert.equal(root.dataset.transition, 'closed');
  assert.equal(root.hidden, true);
  console.log('PASS reduced motion jumps straight to the end state');

  // 6. dispose：取消在跑的动画、拦下完成回调，且之后还能正常复用
  transition.show(false);
  advance(150);
  transition.dispose();
  await flush();
  assert.equal(runningAnimations().length, 0, 'dispose must cancel running animations');
  assert.equal(root.dataset.transition, 'opening', 'cancelled completion must not flip the state');
  transition.show(false);
  advance(300);
  await flush();
  assert.equal(root.dataset.transition, 'open', 'transition must be reusable after dispose');
  console.log('PASS dispose cancels animations, drops stale callbacks, and stays reusable');

  // 7. finish()：主动收尾，等价于动画自然结束
  transition.hide(false);
  transition.finish();
  await flush();
  assert.equal(root.dataset.transition, 'closed');
  assert.equal(root.hidden, true);
  console.log('PASS finish() completes an in-flight close synchronously');

  console.log('7 surface invariant checks passed.');
} finally {
  delete globalThis.getComputedStyle;
}
