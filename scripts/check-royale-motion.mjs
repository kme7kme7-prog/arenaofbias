import assert from 'node:assert/strict';
import { sampleStorm, sampleRecoil } from '../app/tanks/royale/motion.mjs';
import { zoneAt } from '../app/tanks/royale/engine.mjs';
const schedule = { startTick: 200, stepTicks: 30, stepSize: 1 };
for (const size of [42, 58]) {
  for (let n = 1; n <= size / 2; n++) {
    const tick = 200 + (n - 1) * 30, z = zoneAt(tick, size);
    assert.equal(sampleStorm(z, tick, schedule).margin, n - 1);
    assert.equal(sampleStorm(z, tick + 3, schedule).margin, n - .5);
    assert.equal(sampleStorm(z, tick + 6, schedule).margin, n);
    assert.equal(sampleStorm(z, tick, schedule, true).margin, n);
    let previous = n - 1;
    for (let time = tick; time <= tick + 7; time += .1) {
      const result = sampleStorm(z, time, schedule);
      assert(result.margin >= previous && result.margin <= n);
      assert.equal(result.target, z.min);
      previous = result.margin;
    }
  }
  const first = sampleStorm(zoneAt(203, size), 203, schedule);
  sampleStorm(zoneAt(600, size), 600, schedule);
  assert.deepEqual(sampleStorm(zoneAt(203, size), 203, schedule), first);
}
assert.equal(sampleStorm(zoneAt(199, 42), 199, schedule).margin, 0);
const shots = [{ kind: 'fire', side: 'A', tick: 9 }];
assert.equal(sampleRecoil(shots, 'A', 8), 0);
assert.equal(sampleRecoil(shots, 'A', 9), .18);
assert.equal(sampleRecoil(shots, 'A', 11), 0);
assert.equal(sampleRecoil(shots, 'B', 9), 0);
assert.equal(sampleRecoil(shots, 'A', 9, true), 0);
console.log('Royale motion: 50 contractions, endpoints, monotonicity, rewind, recoil and reduced motion passed.');
