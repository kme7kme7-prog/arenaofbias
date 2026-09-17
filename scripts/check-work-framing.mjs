import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/work-framing.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { containCanvas, workCanvas, framedCanvas } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const work = {
  id: 'example',
  promptId: '001',
  content: { kind: 'html', src: '/example.html' },
};
const canvas = workCanvas(work);
assert.deepEqual(canvas, { width: 1280, height: 720 });
const custom = { width: 1280, height: 1200, zoom: 1.5, offsetX: .1, offsetY: -.2 };
assert.deepEqual(workCanvas({ ...work, content: { ...work.content, framing: custom } }), custom);
const desktop = framedCanvas(custom, 640, 360);
const phone = framedCanvas(custom, 320, 180);
assert.equal(desktop.scale, phone.scale * 2);
assert.equal(desktop.left, phone.left * 2);
assert.equal(desktop.top, phone.top * 2);
const dialog = framedCanvas(custom, 320, 604);
assert.equal(dialog.scale, phone.scale);
assert.equal(dialog.viewHeight, 180);
assert.equal(dialog.viewTop, 212);
assert.equal(
  workCanvas({ ...work, promptId: '003' }),
  undefined,
  'responsive webpage tasks are not normalized',
);
assert.equal(workCanvas({ ...work, content: { kind: 'image' } }), undefined);
for (const [width, height] of [
  [640, 360],
  [320, 180],
  [320, 604],
  [1000, 300],
  [0, 0],
]) {
  const fit = containCanvas(canvas, width, height);
  assert.ok(Number.isFinite(fit.scale));
  assert.ok(fit.left >= 0 && fit.top >= 0);
  assert.ok(canvas.width * fit.scale <= width + 1e-8);
  assert.ok(canvas.height * fit.scale <= height + 1e-8);
  assert.ok(Math.abs(fit.left * 2 + canvas.width * fit.scale - width) < 1e-8);
  assert.ok(Math.abs(fit.top * 2 + canvas.height * fit.scale - height) < 1e-8);
}
assert.equal(containCanvas(canvas, 320, 180).scale, 0.25);
console.log(
  'PASS fixed canvas: task opt-in, non-HTML exclusion, desktop/mobile/portrait/landscape containment, centered letterbox, hidden host',
);
