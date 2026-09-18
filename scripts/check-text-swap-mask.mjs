// TextSwapMask（换题盖区外文字的先遮后揭）不变量断言。
// 核心契约：cover 把纸条滑入盖住每个 [data-swap] 元素的每行文本；
// reveal 等纸幕进扫出段才按新行位铺纸条、错峰退开后必须自清理
// （无残留节点、无残留 rAF）；reduced 两阶段都直达、不起动画；armed 标记读取即复位。
// 帧时契约（2026-09-19 卡顿轮）：单帧阻塞数秒只前进一个封顶步——纸条原地冻、
// 恢复续播，不许按墙钟一把追到终态。驱动用 16ms 正常帧间隔，掉帧单独注入。
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
let curtain = null;
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

const fakeDocument = {
  createElement: () => fakeElement(),
  // 纸幕层替身：reveal 的起揭门凭它的 gtPhase 放行（null = 幕已离场）
  querySelector: (selector) =>
    selector === '.game-transition' ? curtain : null,
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
globalThis.document = fakeDocument;

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
// 掉帧不变量：单帧阻塞 5s 只前进一个封顶步——遮入不得被一把追完
step(5500);
assert.notEqual(
  strips[0].children[0].style.transform,
  'translateX(0%)',
  'a stalled frame must not finish the cover',
);
assert.equal(raf.size, 1, 'cover keeps driving after a stall');
for (let stamp = 5516; stamp <= 5500 + 1200; stamp += 16) step(stamp);
assert.equal(strips[0].children[0].style.transform, 'translateX(0%)');
assert.equal(strips[1].children[0].style.transform, 'translateX(0%)');
assert.equal(raf.size, 0, 'cover must not leave rAF loops running');
console.log(
  'PASS cover slides one paper strip over each text line; a stalled frame freezes instead of jumping',
);

// 2. reveal：纸幕进扫出段才起揭；新行位铺好纸条（初值即盖住），错峰退开后全部移除
curtain = fakeElement(); // gtPhase 未置 = 仍在入场/钉幕：reveal 必须等
mask.reveal(root, false);
const fresh = target.children.filter((c) => c.className === 'swap-mask-window');
assert.equal(fresh.length, 2);
assert.ok(
  fresh.every((s) => !s.children[0].style.transform),
  'reveal strips must start fully covering',
);
step(2000);
step(2150);
step(2400);
assert.ok(
  fresh.every((s) => !s.children[0].style.transform),
  'reveal must hold coverage while the curtain has not entered exit',
);
assert.equal(raf.size, 1, 'reveal polls until the curtain exits');
curtain.dataset.gtPhase = 'exit';
step(4100); // 轮询帧：纸幕进扫出段，起揭接上（drive 下一帧才画）
assert.equal(raf.size, 1, 'reveal starts driving once the curtain exits');
step(4116); // 起揭首帧：画 t=0（仍盖住）
assert.equal(fresh[0].children[0].style.transform, 'translateX(0%)');
for (let stamp = 4132; stamp <= 4260; stamp += 16) step(stamp);
assert.equal(
  fresh[0].children[0].style.transform,
  'translateX(0%)',
  'reveal must hold coverage through its start delay',
);
for (let stamp = 4276; stamp <= 4700; stamp += 16) step(stamp);
const moved = fresh.map((s) =>
  Number(/translateX\((-?[\d.]+)%\)/.exec(s.children[0].style.transform)[1]),
);
assert.ok(
  moved.every((v) => v > 0),
  `reveal must send every ink out to the right, got ${moved.join(',')}`,
);
// 掉帧不变量：揭到中途单帧阻塞 5s——不得直接跳到揭完/清理
step(9000);
assert.ok(
  target.children.filter((c) => c.className === 'swap-mask-window').length === 2,
  'a stalled frame must not jump to the cleaned-up end state',
);
assert.equal(raf.size, 1, 'reveal keeps driving after a stall');
for (let stamp = 9016; stamp <= 9000 + 2000; stamp += 16) step(stamp);
assert.equal(
  target.children.filter((c) => c.className === 'swap-mask-window').length,
  0,
  'reveal must remove every strip after finishing',
);
assert.equal(raf.size, 0, 'reveal must not leave rAF loops running');
console.log(
  'PASS reveal waits for the curtain exit, uncovers staggered strips, freezes on stalls and cleans up',
);

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

// 5b. armed 标记带 TTL：目的地不是竞技场时（如落进 PromptPreview）无人
// 消费，超时后自动作废——之后进任意竞技场不得凭空揭字
{
  const realNow = Date.now;
  let fake = realNow();
  Date.now = () => fake;
  try {
    armTextSwap();
    assert.equal(consumeTextSwap(), true, 'fresh mark must still consume');
    armTextSwap();
    fake += 5001; // 超过 ARMED_TTL_MS
    assert.equal(consumeTextSwap(), false, 'stale mark must expire');
    assert.equal(consumeTextSwap(), false, 'expired read must reset the flag');
  } finally {
    Date.now = realNow;
  }
}
console.log('PASS armed mark expires after TTL when never consumed');

// 6. 目标元素获得定位类（纸条坐标挂在元素内）
assert.ok(
  target.classList.contains('text-swap-masked'),
  'targets must become positioning contexts',
);
console.log('PASS targets are marked as positioning contexts');

console.log('7 text-swap-mask invariant checks passed.');
