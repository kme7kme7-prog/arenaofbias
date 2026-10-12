import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleProjectiles,
  prepareEffects,
  recentEffects,
  battleImpulse,
} from '../app/tanks/presentation.mjs';
const bullet = { x: 3, y: 4, dir: 1, owner: 'A' };
const path = {
  owner: 'A',
  dir: 1,
  cells: [
    { x: 3, y: 4 },
    { x: 4, y: 4 },
    { x: 5, y: 4 },
    { x: 6, y: 4 },
  ],
};
await test('recorded flight has continuous sub-cell positions and exact boundaries', () => {
  const a = { bullets: [bullet] },
    b = { bullets: [{ ...bullet, x: 6 }], traces: [path] };
  const original = JSON.stringify([a, b]);
  assert.equal(sampleProjectiles(a, b, 0)[0].x, 3);
  assert.equal(sampleProjectiles(a, b, 0.25)[0].x, 3.75);
  assert.equal(sampleProjectiles(a, b, 1)[0].x, 6);
  assert.equal(JSON.stringify([a, b]), original);
});
await test('destroyed and short-lived shots stop at their recorded contact, never travel through a wall', () => {
  const next = {
    bullets: [],
    traces: [{ ...path, cells: path.cells.slice(0, 2) }],
  };
  assert.equal(sampleProjectiles({ bullets: [] }, next, 0.2)[0].x, 3.6);
  assert.deepEqual(sampleProjectiles({ bullets: [] }, next, 0.34), []);
  assert.deepEqual(
    sampleProjectiles(
      { bullets: [] },
      { bullets: [], traces: [{ ...path, cells: path.cells.slice(0, 1) }] },
      0.1,
    ),
    [],
  );
});
await test('effects follow actual contact timing and preserve only recorded attribution', () => {
  const frame = {
    tanks: { B: { x: 4, y: 3, lives: 0 } },
    traces: [{ ...path, cells: path.cells.slice(0, 2) }],
  };
  const r = {
    frames: [frame, frame],
    events: [
      { kind: 'death', tick: 1, side: 'B', x: 4, y: 4 },
      { kind: 'frag', tick: 1, side: 'A', target: 'B', x: 4, y: 4 },
    ],
  };
  const before = JSON.stringify(r),
    fx = prepareEffects(r);
  assert.equal(fx[0].at, 1 / 3);
  assert.equal(fx[0].cx, 5);
  assert.equal(fx[0].cy, 4);
  assert.equal(fx[1].target, 'B');
  assert.equal(fx[0].final, true);
  assert.equal(recentEffects(fx, 0.2).length, 0);
  assert.equal(recentEffects(fx, 0.4).length, 2);
  assert.equal(recentEffects(fx, 15).length, 0);
  assert.equal(JSON.stringify(r), before);
});
await test('camera feedback is deterministic, bounded and disabled with reduced motion', () => {
  const fx = [
    { at: 1, kind: 'death' },
    { at: 1, kind: 'death' },
  ];
  assert.deepEqual(battleImpulse(fx, 1.2), battleImpulse(fx, 1.2));
  assert.ok(Math.abs(battleImpulse(fx, 1.2).x) <= 0.14);
  assert.deepEqual(battleImpulse(fx, 1.2, true), { x: 0, y: 0 });
  assert.deepEqual(battleImpulse(fx, 9), { x: 0, y: 0 });
});
await test('exact-frame seeks do not expose a shot from the following tick', () => {
  const effects = [{ kind: 'fire', tick: 5, at: 4 }];
  assert.equal(recentEffects(effects, 4).length, 0);
  assert.equal(recentEffects(effects, 4.01).length, 1);
});
