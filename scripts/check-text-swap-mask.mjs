// TextSwapMask（换题盖区外文字的先遮后揭）不变量断言。
// 核心契约：cover 把纸条滑入盖住每个 [data-swap] 元素的每行文本；
// reveal 按新行位铺纸条、错峰退开后必须自清理（无残留节点、无残留 rAF）；
// reduced 两阶段都直达、不起动画；armed 标记读取即复位。
// 行测量细节依赖真实排版，本脚本只钉生命周期与方向，不测像素。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/text-swap-mask.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const {
  TextSwapMask,
  armTextSwap,
  consumeTextSwap,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

// ---- 假浏览器环境 ----
const raf = new Map();
let rafId = 0;
globalThis.requestAnimationFrame = (fn) => {
  raf.set(++rafId, fn);
  return rafId;
};
globalThis.cancelAnimationFrame = (token) => raf.delete(token);
globalThis.NodeFilter = { SHOW_TEXT: 4 };
const step = (stamp) => {
  const callbacks = [...raf.values()];
  raf.clear();
  callbacks.forEach((fn) => fn(stamp));
};

function fakeElement(extra = {}) {
  return {
    children: [],
    style: {},
    textContent: '',
    dataset: {},
    setAttribute(k, v) {
      this[k] = v;
    },
    append(node) {
      this.children.push(node);
      node.parent = this;
    },
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter((n) => n !== this);
    },
    classList: {
      add(name) {
        (this._set ??= new Set()).add(name);
      },
      contains(name) {
        return this._set?.has(name) ?? false;
      },
    },
    ...extra,
  };
}

// 每个文本节点给一组 getClientRects 行盒；一个元素可含多个文本节点
function fakeTarget(rectGroups, { width = 300, clientWidth = 300 } = {}) {
  const textNodes = rectGroups.map((rects) => ({ textContent: 'x'.repeat(20), rects }));
  return fakeElement({
    offsetWidth: width,
    clientWidth,
    _textNodes: textNodes,
    getBoundingClientRect() {
      return { left: 0, top: 0, width, height: 20, right: width, bottom: 20 };
    },
  });
}

function fakeRoot(targets) {
  return fakeElement({
    querySelectorAll: (selector) =>
      selector === '[data-swap]' ? targets : [],
  });
}

globalThis.document = {
  createElement: () => fakeElement(),
  createTreeWalker: (root) => {
    const nodes = root._textNodes ?? [];
    let i = -1;
    return { nextNode: () => nodes[++i] ?? null };
  },
  createRange: () => ({
    node: null,
    selectNodeContents(node) {
      this.node = node;
    },
    getClientRects() {
      return this.node?.rects ?? [];
    },
  }),
};

const mask = new TextSwapMask();
const twoLine = [
  [{ left: 0, top: 0, right: 200, bottom: 20, width: 200, height: 20 }],
  [{ left: 0, top: 22, right: 140, bottom: 42, width: 140, height: 20 }],
];
const target = fakeTarget(twoLine);
const root = fakeRoot([target]);

// 1. cover：每个文本行盒一条纸条，滑入后 ink 停在 translateX(0) 盖住文字
mask.cover(root, false);
const strips = target.children.filter((c) => c.className === 'swap-mask-window');
assert.equal(strips.length, 2, 'one strip per measured text line');
assert.ok(
  strips.every((s) => s['aria-hidden'] === 'true'),
  'strips must be aria-hidden',
);
assert.ok(
  strips.every((s) => s.children[0]?.className === 'swap-mask-ink'),
  'each window must carry an ink strip',
);
step(500); // 首帧摆位
assert.match(
  strips[0].children[0].style.transform,
  /translateX\(-1/,
  'ink must start outside the left edge',
);
step(1000); // 340ms 遮入跑完
assert.equal(strips[0].children[0].style.transform, 'translateX(0%)');
assert.equal(strips[1].children[0].style.transform, 'translateX(0%)');
assert.equal(raf.size, 0, 'cover must not leave rAF loops running');
console.log('PASS cover slides one paper strip over each text line');

// 2. reveal：新行位铺好纸条（初值即盖住），错峰退开后全部移除
mask.reveal(root, false);
const fresh = target.children.filter((c) => c.className === 'swap-mask-window');
assert.equal(fresh.length, 2);
assert.ok(
  fresh.every((s) => !s.children[0].style.transform),
  'reveal strips must start fully covering',
);
step(2000); // 首帧：建立 started 并画 t=0（仍盖住）
assert.equal(fresh[0].children[0].style.transform, 'translateX(0%)');
step(2150); // 起揭延迟窗口内（089 与纸幕开幕对齐）：仍须盖住
assert.equal(
  fresh[0].children[0].style.transform,
  'translateX(0%)',
  'reveal must hold coverage through its start delay',
);
step(2400); // 中段：错峰退开，所有 ink 都已离开 0%
const moved = fresh.map((s) =>
  Number(/translateX\((-?[\d.]+)%\)/.exec(s.children[0].style.transform)[1]),
);
assert.ok(
  moved.every((v) => v > 0),
  `reveal must send every ink out to the right, got ${moved}`,
);
step(4000); // 700ms 跑完 + 清理
assert.equal(
  target.children.filter((c) => c.className === 'swap-mask-window').length,
  0,
  'reveal must remove every strip after finishing',
);
assert.equal(raf.size, 0, 'reveal must not leave rAF loops running');
console.log('PASS reveal uncovers staggered strips and cleans up all residue');

// 3. reduced：两阶段都不造纸条、不起动画
mask.cover(root, true);
assert.equal(
  target.children.filter((c) => c.className === 'swap-mask-window').length,
  0,
);
mask.reveal(root, true);
assert.equal(
  target.children.filter((c) => c.className === 'swap-mask-window').length,
  0,
);
assert.equal(raf.size, 0);
console.log('PASS reduced motion skips both phases entirely');

// 4. dispose：遮入中途取消，纸条移除且不再推进
mask.cover(root, false);
step(500);
mask.dispose();
assert.equal(
  target.children.filter((c) => c.className === 'swap-mask-window').length,
  0,
  'dispose must remove in-flight strips',
);
assert.equal(raf.size, 0);
console.log('PASS dispose cancels mid-cover and removes strips');

// 5. armed 标记：置位 → 读取 true → 已复位；未置位读取 false
assert.equal(consumeTextSwap(), false, 'flag must start unset');
armTextSwap();
assert.equal(consumeTextSwap(), true);
assert.equal(consumeTextSwap(), false, 'consuming must reset the flag');
console.log('PASS arm/consume flag semantics are single-shot');

// 6. 目标元素获得定位类（纸条坐标挂在元素内）
assert.ok(
  target.classList.contains('text-swap-masked'),
  'targets must become positioning contexts',
);
console.log('PASS targets are marked as positioning contexts');

console.log('6 text-swap-mask invariant checks passed.');
