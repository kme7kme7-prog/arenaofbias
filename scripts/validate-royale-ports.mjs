import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { createRoyale, playerState } from '../app/tanks/royale/engine.mjs';

const originalDir = new URL('../app/tanks/bots/', import.meta.url);
const portDir = new URL('../app/tanks/royale/bots/', import.meta.url);
const originals = readdirSync(originalDir).filter((name) => name.endsWith('.js')).sort();
const ports = readdirSync(portDir).filter((name) => name.endsWith('.js')).sort();
const migrated = new Set(['apex-warden-spark.js', 'astra-knife.js', 'ghostline-haiku.js', 'harrier.js', 'iron-ambush-luna56.js', 'kestrel-kimi.js', 'ocelot-mimo.js', 'parallax-astra.js', 'parallax-opus.js', 'peregrine-step5.js', 'polaris-gemini38.js', 'raptor-openpangu.js', 'redline-minimax31.js', 'rift-harvest-sol56.js', 'shrike-deepseek.js', 'shrike26-glm.js', 'sidecut-grok.js', 'tank26.js', 'vector.js', 'viper-longcat.js', 'vortex-minimax.js']);
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const failures = [];
for (const name of originals) {
  if (!ports.includes(name)) failures.push(`missing Royale source: ${name}`);
  else if (migrated.has(name) === (hash(new URL(name, originalDir)) === hash(new URL(name, portDir)))) {
    failures.push(migrated.has(name) ? `expected migrated source to differ: ${name}` : `unported source changed: ${name}`);
  }
}
for (const name of ports) if (!originals.includes(name)) failures.push(`unregistered Royale source: ${name}`);
if (originals.length !== 21) failures.push(`expected 21 original bots, found ${originals.length}`);

function sampleState(size, tick = 0, royale = false) {
  const ids = royale ? ['A', 'B', 'P27', 'P28'] : ['A', 'B', 'C', 'D'];
  const scoreboard = ids.map((id, index) => ({ id, status: 'active', lives: 3, points: index ? 0 : 3, respawnTicks: 0 }));
  const tanks = ids.map((id, index) => ({
    id,
    x: Math.floor(size * (0.2 + index * 0.19)),
    y: Math.floor(size * (index % 2 ? 0.68 : 0.25)),
    dir: index % 4,
    hp: index ? 1 : 2,
    maxHp: 2,
    invincibleTicks: 0,
    hurtTicks: 0,
    rapidTicks: 0,
  }));
  const margin = royale
    ? tick < 200 ? 0 : Math.floor((tick - 200) / 30) + 1
    : tick < 200 ? 0 : Math.min(9, 2 + Math.floor((tick - 200) / 50));
  const nextShrinkTick = royale
    ? margin >= size - 1 ? null : tick < 200 ? 200 : 200 + (Math.floor((tick - 200) / 30) + 1) * 30
    : margin >= 9 ? null : tick < 200 ? 200 : 200 + (Math.floor((tick - 200) / 50) + 1) * 50;
  const nextMin = margin === 0 ? royale ? 1 : 2 : Math.min(size - 1, margin + 1);
  const safeZone = { min: margin, max: size - 1 - margin, nextShrinkTick, nextMin, nextMax: size - 1 - nextMin };
  return {
    mode: 'brawl', tick,
    map: Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) =>
      x === 0 || y === 0 || x === size - 1 || y === size - 1 ? 1 : 0)),
    random: 123456,
    self: { ...tanks[0], lives: 3, onField: 1, fireCooldown: 0 },
    opponents: scoreboard.slice(1), scoreboard,
    radar: { tanks: tanks.slice(1), bullets: [] },
    arena: {
      mode: royale ? 'royale' : undefined, safeZone, radarPulse: false, supply: null,
      ...(royale ? { zoneSchedule: { startTick: 200, stepTicks: 30, stepSize: 1, gridSize: size } } : {}),
    },
  };
}
function decide(source, state) {
  const context = { console, Math, Map, Set, Uint8Array, Uint16Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array };
  runInNewContext(source, context, { timeout: 3000 });
  return context.decide(state);
}
for (const name of migrated) {
  const original = readFileSync(new URL(name, originalDir), 'utf8');
  const port = readFileSync(new URL(name, portDir), 'utf8');
  for (const tick of [0, 20, 100, 199, 200, 250, 400, 599]) {
    const state = sampleState(26, tick);
    const before = decide(original, state);
    const after = decide(port, state);
    if (JSON.stringify(before) !== JSON.stringify(after)) failures.push(`${name}: 26x26 decision differs at tick ${tick}`);
  }
  for (const size of [42, 58]) for (const tick of [0, 199, 200, 230, 500]) {
    try {
      const action = decide(port, sampleState(size, tick, true));
      if (!action || !['up', 'right', 'down', 'left', 'stay'].includes(action.move)) throw Error('invalid action');
    } catch (error) {
      failures.push(`${name}: ${size}x${size} failed at tick ${tick}: ${error.message}`);
    }
  }
}
// Keep one VM per source across a continuous sequence, matching Worker lifetime.
function persistentBot(source) {
  const context = { console, Math, Map, Set, Uint8Array, Uint16Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array };
  runInNewContext(source, context, { timeout: 3000 });
  return (state) => context.decide(state);
}
function rethrowCaughtErrors(source) {
  const skipQuoted = (text, start) => {
    const quote = text[start]; let i = start + 1;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i] === quote) return i + 1;
      i++;
    }
    return i;
  };
  const skipTrivia = (text, start) => {
    let i = start;
    while (i < text.length) {
      if (/\s/.test(text[i])) { i++; continue; }
      if (text.startsWith('//', i)) { i = text.indexOf('\n', i + 2); if (i < 0) return text.length; continue; }
      if (text.startsWith('/*', i)) { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; continue; }
      break;
    }
    return i;
  };
  const matchPair = (text, start, open, close) => {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '"' || text[i] === "'" || text[i] === '`') { i = skipQuoted(text, i) - 1; continue; }
      if (text.startsWith('//', i)) { i = text.indexOf('\n', i + 2); if (i < 0) return -1; continue; }
      if (text.startsWith('/*', i)) { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 1; continue; }
      if (text[i] === open) depth++;
      else if (text[i] === close && --depth === 0) return i;
    }
    return -1;
  };
  const regions = [];
  const decidePattern = /function\s+decide\s*\([^)]*\)\s*\{/g;
  for (const match of source.matchAll(decidePattern)) {
    const open = source.indexOf('{', match.index);
    const close = matchPair(source, open, '{', '}');
    if (close >= 0) regions.push([open, close]);
  }
  const edits = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '"' || source[i] === "'" || source[i] === '`') { i = skipQuoted(source, i) - 1; continue; }
    if (source.startsWith('//', i)) { i = source.indexOf('\n', i + 2); if (i < 0) break; continue; }
    if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); i = end < 0 ? source.length : end + 1; continue; }
    if (!regions.some(([start, end]) => i > start && i < end) || source.slice(i, i + 5) !== 'catch' || /[\w$]/.test(source[i - 1] || '') || /[\w$]/.test(source[i + 5] || '')) continue;
    let p = skipTrivia(source, i + 5), arg = 'error';
    if (source[p] === '(') {
      const end = matchPair(source, p, '(', ')'); if (end < 0) continue;
      const m = source.slice(p + 1, end).match(/^\s*([\w$]+)/); if (m) arg = m[1];
      p = skipTrivia(source, end + 1);
    }
    if (source[p] !== '{') continue;
    const end = matchPair(source, p, '{', '}'); if (end < 0) continue;
    const replacement = arg === 'error' && !source.slice(i + 5, p).includes('(')
      ? '{ throw new Error("caught exception"); }'
      : `{ throw ${arg}; }`;
    edits.push([p, end + 1, replacement]); i = end;
  }
  for (let i = edits.length - 1; i >= 0; i--) {
    const [start, end, replacement] = edits[i]; source = source.slice(0, start) + replacement + source.slice(end);
  }
  return source;
}
function complexState(size, tick) {
  const s = sampleState(size, tick);
  // Deterministic brick/steel/grass clusters; preserve open escape lanes around tanks.
  for (let y = 3; y < size - 3; y += 7) for (let x = 4; x < size - 3; x += 8) {
    const type = ((x + y) % 3 === 0) ? 1 : ((x + y) % 3 === 1) ? 2 : 4;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s.map[y + dy][x + dx] = type;
  }
  s.radar.bullets = [
    { x: Math.max(1, s.self.x - 2), y: s.self.y, dir: 1 },
    { x: s.self.x, y: Math.max(1, s.self.y - 2), dir: 2 },
  ];
  s.arena.supplies = [{ id: 'qa', x: Math.max(1, s.self.x - 2), y: Math.max(1, s.self.y - 2), type: 'repair' }];
  return s;
}
for (const name of migrated) {
  const original = readFileSync(new URL(name, originalDir), 'utf8');
  const port = readFileSync(new URL(name, portDir), 'utf8');
  const before = persistentBot(original), after = persistentBot(port), strict = persistentBot(rethrowCaughtErrors(port));
  for (let tick = 0; tick < 18; tick++) {
    const state = complexState(26, tick);
    const a = before(state), b = after(state);
    if (JSON.stringify(a) !== JSON.stringify(b)) failures.push(`${name}: persistent 26x26 decision differs at tick ${tick}`);
    try { strict(state); } catch (error) { failures.push(`${name}: injected catch-rethrow 26x26 tick ${tick}: ${error.message}`); break; }
  }
}
// Exercise real Royale contracts: P27, 27 opponents, engine terrain and an empty final ring.
for (const sizeCase of [
  { count: 28, scale: 'auto', size: 42 },
  { count: 28, scale: 'wide', size: 58 },
]) {
  let sim;
  try { sim = createRoyale({ count: sizeCase.count, seed: 481516, scale: sizeCase.scale, terrain: 'ruins' }); }
  catch (error) { failures.push(`engine ${sizeCase.size}x${sizeCase.size} setup failed: ${error.message}`); continue; }
  if (sim.size !== sizeCase.size || !sim.ids.includes('P27')) failures.push(`engine ${sizeCase.size}x${sizeCase.size} contract mismatch`);
  const id = 'P27';
  sim.tanks[id].x = sim.size - 2; sim.tanks[id].y = sim.size - 2; sim.tanks[id].dir = 0;
  for (const name of migrated) {
    const source = readFileSync(new URL(name, portDir), 'utf8');
    const run = persistentBot(source), strictRun = persistentBot(rethrowCaughtErrors(source));
    for (const tick of [0, 199, 200, 230, 500, 200 + (sim.size / 2) * 30]) {
      sim.tick = tick;
      try {
        const state = playerState(sim, id);
        const action = run(state);
        strictRun(state);
        if (!action || !['up', 'right', 'down', 'left', 'stay'].includes(action.move)) throw Error('invalid action');
        if (state.opponents.length <= 4 || state.self.id !== 'P27') throw Error('missing extended roster state');
        if (tick >= 200 + (sim.size / 2) * 30 && state.arena.safeZone.max >= state.arena.safeZone.min) throw Error('final zone did not empty');
      } catch (error) {
        failures.push(`${name}: engine ${sim.size}x${sim.size} tick ${tick}: ${error.stack}`);
      }
    }
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Royale source boundary verified: ${originals.length} bots; twenty-one ports match legacy decisions at eight 26x26 ticks and match across 18 persistent complex-map ticks, and pass engine-backed P27/27-opponent 42x42/58x58 checks through the empty ring, including test-only catch-to-throw runs.`);
}
