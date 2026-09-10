// 页面横扫过渡 wipeNavigate 的不变量断言（决策 029）。
// 只断言不随设计重排而碎的契约：层挂在 body、盖满才换路由、只动 transform、
// 结束必清理、运行中防重入、reduced-motion 直达。节奏/文案/缓动是设计参数，
// 由 reference/wipe-review.html 调，不在本脚本断言之列。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/ui-transitions.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { wipeNavigate, defaultWipeTiming } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

// ---- 假浏览器环境：手写时钟驱动的 FakeAnimation + 最小 DOM ----
let now = 0;
const timers = [];
const animations = new Set();

class FakeAnimation {
  constructor(keyframes, options) {
    this.keyframes = keyframes;
    this.options = options;
    this.startTime = now;
    this.finished = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    animations.add(this);
  }
  cancel() {
    this._reject(new Error('aborted'));
    animations.delete(this);
  }
}
function fireDue() {
  for (const timer of timers.filter((t) => t.at <= now)) {
    timers.splice(timers.indexOf(timer), 1);
    timer.fn();
  }
  for (const animation of animations) {
    if (now >= animation.startTime + animation.options.duration) {
      animations.delete(animation);
      animation._resolve();
    }
  }
}
function advance(ms) {
  now += ms;
  fireDue();
}
function makeElement(tag) {
  return {
    tagName: tag,
    className: '',
    children: [],
    parent: null,
    setAttribute(name, value) {
      this[`attr:${name}`] = value;
    },
    append(...nodes) {
      for (const node of nodes) {
        node.parent = this;
        this.children.push(node);
      }
    },
    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    },
    animate(keyframes, options) {
      return new FakeAnimation(keyframes, options);
    },
  };
}
const body = makeElement('body');
let reduced = false;
// @types/node 把 globalThis.document 标了 deprecated，先落地普通对象再赋值绕开误报
const fakeDocument = { createElement: makeElement, body };
globalThis.document = fakeDocument;
globalThis.window = {
  matchMedia: () => ({ matches: reduced }),
  setTimeout: (fn, ms) => timers.push({ at: now + ms, fn }),
  location: { hash: '' },
};

// 供断言用的小工具
const wipeLayers = () => body.children.filter((child) => child.className === 'page-wipe');
const startWipe = (hash, copy, timing) => {
  wipeNavigate(hash, copy, timing);
  const [layer] = wipeLayers();
  const sweep = [...animations].at(-1);
  return { layer, sweep };
};
// 跑完整轮并等 finished.then 链（layer.remove / wipeRunning 复位）执行完
const settle = async (sweep) => {
  advance(sweep.options.duration + 1);
  await sweep.finished;
  await Promise.resolve();
  await Promise.resolve();
};

try {
  // 1. 默认参数就是线上节奏（改这里必须同步 reference/wipe-review.html 的基线）
  assert.deepEqual(
    { ...defaultWipeTiming },
    { cover: 360, hold: 150, exit: 400, ease: 'cubic-bezier(0.76, 0, 0.24, 1)' },
  );
  console.log('PASS default timing stays the shipped 360/150/400 sweep');

  // 2. 层的结构：body 直接子级、aria-hidden、note/title 文案进 span/b
  const first = startWipe('#target', { note: 'NOTE.', title: 'Title' });
  assert.equal(first.layer.parent, body, 'wipe layer must be a direct child of body (survives route changes)');
  assert.equal(first.layer.className, 'page-wipe');
  assert.equal(first.layer['attr:aria-hidden'], 'true', 'wipe layer is decorative and must be hidden from a11y');
  const [note, title] = first.layer.children;
  assert.equal(note.tagName, 'span');
  assert.equal(note.textContent, 'NOTE.');
  assert.equal(title.tagName, 'b');
  assert.equal(title.textContent, 'Title');
  console.log('PASS layer mounts on body with aria-hidden and destination copy');

  // 3. 生命周期：结束后层移除、可再次触发
  await settle(first.sweep);
  assert.equal(wipeLayers().length, 0, 'layer must be removed after the sweep finishes');
  const second = startWipe('#again', { note: 'N', title: 'T' });
  await settle(second.sweep);
  assert.equal(wipeLayers().length, 0);
  console.log('PASS layer is cleaned up and a second wipe can start');

  // 4. 防重入：运行中再次调用不产生第二个层、不改目的地
  const third = startWipe('#a', { note: 'n', title: 't' });
  wipeNavigate('#b', { note: 'n', title: 't' });
  assert.equal(wipeLayers().length, 1, 'a running wipe must swallow re-entry instead of stacking layers');
  await settle(third.sweep);
  assert.equal(window.location.hash, '#a', 're-entered call must not retarget the navigation');
  console.log('PASS re-entry during a running wipe is ignored');

  // 5. 换路由时机：盖满（cover）那一刻才切，之前不动
  const fourth = startWipe('#target', { note: 'n', title: 't' });
  advance(defaultWipeTiming.cover - 1);
  assert.equal(window.location.hash, '#a', 'hash must not change before the layer covers the screen');
  advance(1);
  assert.equal(window.location.hash, '#target', 'hash must flip exactly when the screen is covered');
  await settle(fourth.sweep);
  console.log('PASS route change happens exactly at full cover, never before');

  // 6. 合成器不变量：关键帧只允许 transform（+easing/offset），杜绝整屏重绘属性
  const fifth = startWipe('#target', { note: 'n', title: 't' });
  const sweep = fifth.sweep;
  assert.equal(sweep.options.duration, 910);
  for (const frame of sweep.keyframes) {
    for (const key of Object.keys(frame)) {
      assert.ok(
        key === 'transform' || key === 'easing' || key === 'offset',
        `wipe keyframes must stay compositor-only, found "${key}"`,
      );
    }
  }
  assert.equal(sweep.keyframes[0].transform, 'translateX(-101%)');
  assert.equal(sweep.keyframes[1].offset, 360 / 910);
  assert.equal(sweep.keyframes[2].offset, (360 + 150) / 910);
  assert.equal(sweep.keyframes.at(-1).transform, 'translateX(101%)');
  await settle(sweep);
  console.log('PASS sweep animates transform only, cover/hold/exit offsets are exact');

  // 7. 自定义节奏（reference 页调参的契约）：时长与换路由时机跟随覆盖值
  const custom = startWipe('#custom', { note: 'n', title: 't' }, { cover: 500, hold: 100, exit: 200 });
  assert.equal(custom.sweep.options.duration, 800);
  advance(499);
  assert.equal(window.location.hash, '#target', 'hash must stay put before the custom cover moment');
  advance(1);
  assert.equal(window.location.hash, '#custom');
  await settle(custom.sweep);
  assert.equal(wipeLayers().length, 0);
  console.log('PASS timing overrides drive duration and the cover moment');

  // 8. reduced-motion：不出层、不排队，直接换路由
  reduced = true;
  wipeNavigate('#plain', { note: 'n', title: 't' });
  assert.equal(window.location.hash, '#plain', 'reduced motion must navigate immediately');
  assert.equal(wipeLayers().length, 0, 'reduced motion must not mount a wipe layer');
  assert.equal(animations.size, 0, 'reduced motion must not start any animation');
  console.log('PASS prefers-reduced-motion skips the layer entirely');

  console.log('8 wipe invariant checks passed.');
} finally {
  delete globalThis.document;
  delete globalThis.window;
}
