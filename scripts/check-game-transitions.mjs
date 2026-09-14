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
const { createGameTransition, guessNavigate, convoyNavigate } = await import(
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
for (const kind of ['frame', 'bands', 'convoy', 'deal', 'folio']) {
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
  } else if (kind === 'folio') {
    const leaf = tracks.find((t) => t.owner === 'gt-folio-leaf');
    assert.equal(leaf.frames[1].transform, 'translateX(0)');
    assert.equal(
      leaf.frames[1].offset,
      run.timing.covered / run.timing.duration,
    );
    assert.equal(
      leaf.frames[2].offset,
      run.timing.exitStart / run.timing.duration,
    );
    assert.ok(run.timing.duration < 650);
  } else if (kind === 'deal') {
    const shell = tracks.find((t) => t.owner === 'gt-deal-shell');
    const seal = tracks.find((t) => t.owner === 'gt-deal-seal');
    assert.equal(seal.frames.at(-1).opacity, 0);
    assert.equal(
      seal.options.delay + seal.options.duration,
      run.timing.covered,
      'opening frame decoration must disappear before the later scene',
    );
    const sheen = tracks.find((t) => t.owner === 'gt-deal-sheen');
    assert.equal(sheen.frames[0].opacity, 0);
    assert.equal(sheen.frames.at(-1).opacity, 0);
    assert.ok(
      sheen.options.delay + sheen.options.duration <=
        run.timing.exitStart + 150,
      'material highlight must finish with the card content',
    );
    assert.equal(
      shell.frames.at(-1).transform,
      'translateY(0) rotate(0deg) scale(1)',
    );
    assert.equal(shell.options.duration, run.timing.covered);
    const halves = tracks.filter((t) => t.owner?.startsWith('gt-deal-half '));
    assert.equal(halves.length, 2);
    assert.ok(halves.every((t) => t.options.delay === run.timing.exitStart));
    assert.equal(tracks.filter((t) => t.owner === 'gt-deal-clue').length, 7);
    console.log(
      'PASS deal: opaque card covers before routing, two halves hold until exit, seven clues',
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
  for (const kind of ['frame', 'bands', 'convoy', 'deal', 'folio']) {
    const bare = new RegExp(`(^|})\\s*\\.gt-${kind}\\s*[,{]`, 'm');
    assert.ok(
      !bare.test(css),
      `.gt-${kind} 规则必须加 .game-transition 前缀，否则会命中过场层自身`,
    );
  }
  console.log('PASS kind styles never match the transition layer itself');
}
console.log(
  'Game transition invariant checks passed (frame, bands, convoy, deal, folio).',
);

// Both menu transitions share a navigation lock; reduced motion releases it too.
window.location = { hash: '#play' };
guessNavigate();
guessNavigate();
convoyNavigate('#event');
assert.equal(document.body.children.length, 1);
step(0);
step(719);
assert.equal(window.location.hash, '#play');
step(720);
assert.equal(window.location.hash, '#guess');
step(2200);
assert.equal(document.body.children.length, 0);
window.matchMedia = () => ({ matches: true });
window.location.hash = '#play';
guessNavigate();
assert.equal(window.location.hash, '#guess');
assert.equal(document.body.children.length, 0);
convoyNavigate('#event');
assert.equal(window.location.hash, '#event');
assert.equal(document.body.children.length, 0);
console.log(
  'PASS menu navigation: duplicate/cross-entry lock, covered routing, normal and reduced cleanup',
);

{
  const run = createGameTransition('folio', { direction: 'back' });
  const leaf = tracks.filter((t) => t.owner === 'gt-folio-leaf').at(-1);
  assert.equal(leaf.frames[0].transform, 'translateX(-102%)');
  assert.equal(leaf.frames.at(-1).transform, 'translateX(102%)');
  run.dispose();
  console.log('PASS folio: return direction reverses both entry and exit');
}
