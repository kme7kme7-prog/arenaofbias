import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../reference/shutter-transition.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { createShutterTransition } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
let token = 0;
const frames = new Map();
const animations = [];
function element() {
  return {
    children: [],
    style: { setProperty() {} },
    dataset: {},
    setAttribute(key, value) {
      this[key] = value;
    },
    append(node) {
      this.children.push(node);
      node.parent = this;
    },
    remove() {
      this.parent.children = this.parent.children.filter(
        (node) => node !== this,
      );
    },
    getAnimations() {
      const animation = {
        currentTime: 0,
        pause() {},
        cancel() {
          this.cancelled = true;
        },
      };
      animations.push(animation);
      return [animation];
    },
  };
}
const fakeDocument = {
  body: element(),
  createElement: element,
  createElementNS: element,
};
globalThis.document = fakeDocument;
globalThis.window = { matchMedia: () => ({ matches: false }) };
globalThis.requestAnimationFrame = (callback) => {
  frames.set(++token, callback);
  return token;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
const step = (stamp) => {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(stamp));
};
let finished = 0;
const run = createShutterTransition({ onFinish: () => finished++ });
assert.equal(run.layer['aria-hidden'], 'true');
run.seek(-100);
assert.equal(run.layer.dataset.time, '0');
run.seek(100000);
assert.equal(run.layer.dataset.time, String(run.timing.duration));
assert.equal(finished, 0, 'seeking never finishes playback');
run.seek(0);
run.play();
run.play();
assert.equal(frames.size, 1, 'play is idempotent');
step(0);
step(700);
run.pause();
assert.equal(frames.size, 0);
run.play();
step(10000);
assert.equal(run.layer.dataset.time, '700', 'resume excludes paused wall time');
step(20000);
assert.equal(finished, 1);
assert.equal(frames.size, 0);
assert.equal(run.layer.dataset.time, String(run.timing.duration));
assert.equal(
  document.body.children.length,
  1,
  'the final color stays visible for review',
);
run.play();
assert.equal(frames.size, 0, 'finished playback cannot leave a stray frame');
run.dispose();
run.dispose();
assert.equal(document.body.children.length, 0);
assert.ok(animations.every((animation) => animation.cancelled));
console.log(
  'PASS seek bounds, scrub isolation, idempotent play, pause/resume, late frames, final hold, disposal',
);

const parent = element();
const reduced = createShutterTransition({
  parent,
  reduced: true,
  onFinish: () => finished++,
});
reduced.play();
assert.equal(finished, 2);
assert.equal(reduced.layer.dataset.time, String(reduced.timing.duration));
assert.equal(frames.size, 0);
assert.equal(parent.children.length, 1);
reduced.dispose();
assert.equal(parent.children.length, 0);
const cancelled = createShutterTransition({ onFinish: () => finished++ });
cancelled.play();
cancelled.dispose();
step(30000);
assert.equal(finished, 2, 'cancelling does not finish');
assert.equal(document.body.children.length, 0);
assert.equal(frames.size, 0);
console.log(
  'PASS contained ownership, reduced motion, cancellation without callbacks or leaked layers',
);
