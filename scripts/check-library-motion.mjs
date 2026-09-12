import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/library-motion.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { revealLibrary } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture(reduced = false) {
  const animations = [];
  const listeners = new Set();
  const media = { matches: reduced, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const nodes = Array.from({ length: 4 }, () => ({ animate(frames, timing) {
    const a = { frames, timing, cancelled: false, onfinish: null, cancel() { this.cancelled = true; } };
    animations.push(a);
    return a;
  } }));
  return { root: { querySelectorAll: () => nodes }, media, animations, listeners };
}

const f = fixture();
const dispose = revealLibrary(f.root, f.media);
assert.equal(f.animations.length, 4);
for (const a of f.animations) {
  assert.ok(a.frames.every(frame => Object.keys(frame).every(key => ['opacity', 'transform'].includes(key))));
  assert.equal(a.frames.at(-1).opacity, 1);
  assert.equal(a.frames.at(-1).transform, 'translateY(0px)');
}
console.log('✓ 入场只用合成属性，终态可见');
f.animations[0].onfinish();
assert.ok(f.animations[0].cancelled);
console.log('✓ 完成后释放动画，不遗留填充效果');
dispose(); dispose();
assert.ok(f.animations.every(a => a.cancelled));
assert.equal(f.listeners.size, 0);
console.log('✓ 快速切题与卸载取消旧轨道，重复清理安全');

const reduced = fixture(true);
revealLibrary(reduced.root, reduced.media)();
assert.equal(reduced.animations.length, 0);
console.log('✓ 减少动态效果直接显示内容');

const changed = fixture();
const stop = revealLibrary(changed.root, changed.media);
changed.media.matches = true;
for (const listener of changed.listeners) listener();
assert.ok(changed.animations.every(a => a.cancelled));
stop();
console.log('✓ 播放中切换减少动态效果立即停止');

// 新选择直接由 React 更新，动画层不持有题号、路由或异步切换回调。
assert.ok(!/setTimeout|requestAnimationFrame|location\.|onCovered/.test(source));
console.log('✓ 动画不延迟数据或导航，不会回写过期选题');
