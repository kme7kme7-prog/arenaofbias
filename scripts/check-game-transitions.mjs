import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/game-transitions.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { createGameTransition } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
let tracks = [],
  id = 0;
const raf = new Map();
function element() {
  return {
    children: [],
    style: { setProperty() {} },
    setAttribute(k, v) {
      this[k] = v;
    },
    append(node) {
      this.children.push(node);
      node.parent = this;
    },
    remove() {
      this.parent.children = this.parent.children.filter((n) => n !== this);
    },
    animate(frames, options) {
      const animation = {
        owner: this.className,
        frames,
        options,
        currentTime: 0,
        pause() {},
        cancel() {
          this.cancelled = true;
        },
      };
      tracks.push(animation);
      return animation;
    },
  };
}
const fakeDocument = { body: element(), createElement: element };
globalThis.document = fakeDocument;
globalThis.window = { matchMedia: () => ({ matches: false }) };
globalThis.requestAnimationFrame = (fn) => {
  raf.set(++id, fn);
  return id;
};
globalThis.cancelAnimationFrame = (token) => raf.delete(token);
const step = (stamp) => {
  const callbacks = [...raf.values()];
  raf.clear();
  callbacks.forEach((fn) => fn(stamp));
};
for (const kind of ['frame', 'bands', 'convoy']) {
  tracks = [];
  let covered = 0,
    finished = 0;
  const run = createGameTransition(kind, {
    onCovered: () => covered++,
    onFinish: () => finished++,
  });
  assert.equal(run.layer.parent, document.body);
  assert.equal(run.layer['aria-hidden'], 'true');
  if (kind === 'bands') {
    const field = tracks.find((t) => t.owner === 'gt-ink-field');
    const bands = tracks.filter((t) => t.owner?.startsWith('gt-band gt-band-'));
    assert.ok(field, 'the ink field must own route coverage');
    assert.equal(
      bands.length,
      3,
      'three independent diagonal ribbons are required',
    );
    assert.ok(bands.every((band) => band.frames.length === 4));
    assert.ok(
      bands.every((band) => band.frames[1].transform === 'translateX(0)'),
      'ribbons must align briefly in the center before separating',
    );
    assert.equal(
      field.frames[1].offset,
      run.timing.covered / run.timing.duration,
    );
    console.log(
      'PASS ink field covers the route while three diagonal ribbons cross',
    );
  } else if (kind === 'convoy') {
    const convoy = tracks.filter((t) => t.owner === 'gt-convoy');
    assert.equal(convoy.length, 1, 'colored sheets share one motion clock');
    const motion = convoy[0];
    assert.equal(motion.options.duration, run.timing.duration);
    assert.deepEqual(
      motion.frames.map((frame) => frame.transform),
      [
        'translateX(-110%)',
        'translateX(0%)',
        'translateX(3%)',
        'translateX(110%)',
      ],
      'assembly always advances, including the covered interval',
    );
    assert.equal(
      motion.frames[1].offset,
      run.timing.covered / run.timing.duration,
    );
    console.log('PASS integrated diagonal curtain owns full coverage');
  } else {
    const veil = tracks.find((t) => t.owner === 'gt-veil');
    assert.ok(veil.frames.every((f) => 'transform' in f && !('opacity' in f)));
    assert.equal(
      veil.options.delay + veil.options.duration,
      run.timing.covered,
    );
    console.log('PASS opaque paper finishes covering at the navigation gate');
  }
  for (const track of tracks)
    for (const frame of track.frames)
      for (const key of Object.keys(frame))
        assert.ok(
          ['transform', 'opacity', 'offset', 'easing'].includes(key),
          key,
        );
  run.seek(run.timing.duration);
  assert.equal(covered, 0, 'scrub must not navigate');
  run.seek(0);
  run.play();
  run.play();
  assert.equal(raf.size, 1, 'play is idempotent');
  step(0);
  step(run.timing.covered - 1);
  assert.equal(covered, 0);
  step(10000);
  assert.equal(covered, 1, 'late frame must stop at full coverage');
  assert.ok(tracks.every((a) => a.currentTime === run.timing.covered));
  run.pause();
  assert.equal(raf.size, 0);
  run.play();
  step(10001);
  step(20000);
  assert.equal(covered, 1);
  assert.equal(finished, 1);
  assert.equal(document.body.children.length, 0);
  assert.ok(tracks.every((a) => a.cancelled));
  const cancelled = createGameTransition(kind, { onCovered: () => covered++ });
  cancelled.play();
  cancelled.dispose();
  step(30000);
  assert.equal(covered, 1);
  const reduced = createGameTransition(kind, {
    reduced: true,
    onCovered: () => covered++,
    onFinish: () => finished++,
  });
  reduced.play();
  assert.equal(covered, 2);
  assert.equal(finished, 2);
  assert.equal(raf.size, 0);
  assert.equal(document.body.children.length, 0);
  console.log(
    `PASS ${kind}: body ownership, safe properties, scrub isolation, idempotent play, cover gate, late frames, pause/resume, cleanup, cancellation, reduced motion`,
  );
}
// 层选择器隔离（2026-09-13 回归）：过场层本身 class 就带 gt-<kind>，
// CSS 里任何不带 .game-transition 前缀的裸 .gt-<kind> 规则都会命中层自身——
// 曾把层从 fixed 变成 absolute 并被撑到 2800px 宽，导致标题巨大、切页后页面从底部漏出。
{
  const css = await readFile(
    new URL('../app/game-transitions.css', import.meta.url),
    'utf8',
  );
  for (const kind of ['frame', 'bands', 'convoy']) {
    const bare = new RegExp(`(^|})\\s*\\.gt-${kind}\\s*[,{]`, 'm');
    assert.ok(
      !bare.test(css),
      `.gt-${kind} 规则必须加 .game-transition 前缀，否则会命中过场层自身`,
    );
  }
  console.log('PASS kind styles never match the transition layer itself');
}
console.log('23 game transition invariant checks passed.');
