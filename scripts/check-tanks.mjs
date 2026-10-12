import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  createBrawl,
  runBrawl,
  stepBrawl,
} from '../app/tanks/engine/core/brawl.js';
import {
  BRAWL_SPAWNS,
  loadBrawlMap,
} from '../app/tanks/engine/core/brawl-maps.js';
import {
  validateStage,
  validateSeats,
} from '../app/tanks/engine/core/stage.js';
import { validateBrawlReplay } from '../app/tanks/engine/runner/brawl-replay.js';
import {
  readSeats,
  defaultColors,
  readColors,
  setSeatColor,
  validateDraft,
  vacantSpawn,
} from '../app/tanks/workbench.mjs';

const factory = () => ({
  ready: Promise.resolve(),
  decide: async (s) => ({
    move: ['up', 'right', 'down', 'left', 'stay'][s.random % 5],
    fire: s.tick % 3 === 0,
  }),
  dispose() {},
});
const settings = {
  seed: 20261012,
  botSources: ['a', 'b', 'c', 'd'],
  adapterFactory: factory,
};
// Generated with the unchanged organizer 2.6.0 engine and the same policy/seed.
const baseline = {
  crossroads:
    'df92ebf5ad4de33725b62a2255295c69358219e8ff46b393c492bd82937c9863',
  islands: '089fb57a0110112d5353b30d15bd48bb39e0c2f8bb3192639c570335c181bd25',
  ruins: 'da35fbb66d520f8c3b180684239510ba3d341d08a7d94546cb94ad62bbfc91d9',
};
const blank = () => ({
  map: Array.from({ length: 26 }, () => Array(26).fill(0)),
  spawns: structuredClone(BRAWL_SPAWNS),
});
for (const [mapId, hash] of Object.entries(baseline))
  await test(`${mapId}: unchanged default simulation and replay`, async () => {
    const replay = await runBrawl({ ...settings, mapId });
    validateBrawlReplay(replay);
    assert.equal(
      createHash('sha256').update(JSON.stringify(replay)).digest('hex'),
      hash,
    );
  });
await test('registered bot source bytes remain unchanged', async () => {
  const registry = JSON.parse(await readFile('app/tanks/provenance.json'));
  for (const bot of registry.bots)
    assert.equal(
      createHash('sha256')
        .update(await readFile(`app/tanks/bots/${bot.id}.js`))
        .digest('hex'),
      bot.sha256,
    );
});
await test('setup validation rejects bounds, overlap, partial wall and invalid terrain', () => {
  const a = blank();
  a.spawns.A.x = 25;
  assert.throws(() => validateStage(a));
  const b = blank();
  b.spawns.A = { ...b.spawns.B };
  assert.throws(() => validateStage(b));
  const c = blank();
  c.map[23][3] = 1;
  assert.throws(() => validateStage(c));
  const d = blank();
  d.map[10][10] = 5;
  assert.throws(() => validateStage(d));
  assert.throws(() => validateSeats({ A: 0, B: 0, C: 2, D: 3 }));
});
await test('asymmetric and enclosed experiments remain possible', () => {
  const s = blank();
  s.map[10][10] = 2;
  for (let x = 1; x <= 4; x++) {
    s.map[21][x] = 2;
    s.map[24][x] = 2;
  }
  validateStage(s);
});
await test('custom stage is copied; origin controls respawn', () => {
  const setup = blank();
  setup.spawns.A = { x: 7, y: 7, dir: 2 };
  const s = createBrawl('custom', 5, setup);
  setup.map[0][0] = 2;
  setup.spawns.A.x = 0;
  assert.equal(s.map[0][0], 0);
  assert.equal(s.tanks.A.x, 7);
  Object.assign(s.tanks.A, { onField: 0, respawnTicks: 1, lives: 2, hp: 0 });
  stepBrawl(s, {});
  assert.equal(s.tanks.A.x, 7);
  assert.equal(s.tanks.A.y, 7);
  assert.equal(s.tanks.A.dir, 2);
  assert.equal(s.tanks.A.onField, 1);
});
await test('custom replay retains map, spawn and model-seat mapping', async () => {
  const setup = blank(),
    seats = { A: 3, B: 2, C: 0, D: 1 };
  setup.map[13][3] = 4;
  setup.spawns.A = { x: 4, y: 20, dir: 1 };
  const replay = await runBrawl({
    ...settings,
    mapId: 'custom',
    stage: setup,
    seatSlots: seats,
  });
  validateBrawlReplay(replay);
  assert.deepEqual(replay.meta.stage, setup);
  assert.deepEqual(replay.meta.seatSlots, seats);
  const invalid = structuredClone(replay);
  invalid.meta.stage.spawns.B = { ...invalid.meta.stage.spawns.A };
  assert.throws(() => validateBrawlReplay(invalid));
});
await test('cancel disposes all adapters without a fake result', async () => {
  const abort = new AbortController();
  let disposed = 0;
  await assert.rejects(
    runBrawl({
      ...settings,
      signal: abort.signal,
      adapterFactory: () => ({
        ...factory(),
        dispose() {
          disposed++;
        },
      }),
      onProgress: (t) => {
        if (t === 3) abort.abort();
      },
    }),
    (e) => e.code === 'cancelled',
  );
  assert.ok(disposed >= 4);
});
await test('one failed bot does not stop the other three', async () => {
  const r = await runBrawl({
    ...settings,
    adapterFactory: (source) => ({
      ...factory(),
      decide: (s) => {
        if (source === 'a')
          throw Object.assign(Error('timeout'), { code: 'timeout' });
        return factory().decide(s);
      },
    }),
  });
  validateBrawlReplay(r);
  const side = Object.keys(r.meta.seatSlots).find(
    (id) => r.meta.seatSlots[id] === 0,
  );
  assert.equal(r.ranking.find((x) => x.id === side).status, 'timeout');
  assert.ok(!r.winners.includes(side));
});
await test('known stock stage is still valid for editing', () => {
  validateStage({ map: loadBrawlMap('islands'), spawns: BRAWL_SPAWNS });
});
await test('garage supports empty seats and a catalog larger than the match', () => {
  const roster = Array.from({ length: 12 }, (_, i) => ({ id: `bot-${i}` }));
  assert.deepEqual(readSeats({ A: null, B: null, C: null, D: null }, roster), {
    A: null,
    B: null,
    C: null,
    D: null,
  });
  const seats = { A: 'bot-10', B: 'bot-2', C: 'bot-8', D: 'bot-0' };
  assert.deepEqual(readSeats(seats, roster), seats);
  assert.throws(() => readSeats({ ...seats, D: 'bot-10' }, roster));
  assert.throws(() => readSeats({ ...seats, D: 'removed' }, roster));
});
await test('empty positions do not block painting or actual contestants', () => {
  const config = {
    stage: blank(),
    seats: { A: null, B: null, C: null, D: null },
  };
  config.stage.map[22][2] = 2;
  validateDraft(config);
  config.seats.A = 'bot';
  assert.throws(() => validateDraft(config));
  const p = vacantSpawn(config, 'A');
  assert.ok(p);
  assert.notDeepEqual(p, config.stage.spawns.A);
  config.stage.spawns.A = p;
  validateDraft(config);
  config.stage.map = Array.from({ length: 26 }, () => Array(26).fill(2));
  assert.equal(vacantSpawn(config, 'B'), null);
});
await test('a vacant seat cannot spawn on an occupied tank', () => {
  const config = {
    stage: blank(),
    seats: { A: 'bot', B: null, C: null, D: null },
  };
  config.stage.spawns.B = { ...config.stage.spawns.A };
  const p = vacantSpawn(config, 'B');
  assert.ok(p);
  config.stage.spawns.B = p;
  config.seats.B = 'other';
  validateDraft(config);
});
await test('colors exchange without collisions and old replays get defaults', () => {
  const config = { colors: defaultColors() };
  const before = { ...config.colors };
  setSeatColor(config, 'A', before.B);
  assert.equal(config.colors.B, before.A);
  assert.equal(config.colors.A, before.B);
  assert.equal(new Set(Object.values(config.colors)).size, 4);
  assert.deepEqual(readColors(undefined), defaultColors());
  assert.equal(readColors({ A: 'bad-value' }).A, before.A);
});
