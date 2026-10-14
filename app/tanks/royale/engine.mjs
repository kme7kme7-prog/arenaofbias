import { applyMove, applyFire, runBulletPhase } from './combat.mjs';
import { normalizeAction } from '../engine/core/judge.js';
import { createPrng } from '../engine/core/prng.js';

export const VERSION = 'royale-2';
export const RULES = Object.freeze({ fireCooldown: 6, rapidCooldown: 4, maxBullets: 2, hurtTicks: 4 });
export const SUPPLIES = { repair: '维修', rapid: '速射', shield: '护盾', radar: '雷达' };
export const seatId = (i) => i < 26 ? String.fromCharCode(65 + i) : `P${i + 1}`;
export const gridSize = (count, scale = 'auto') => Math.max(scale === 'wide' ? 58 : 42, Math.ceil(Math.sqrt(count) * 6 / 2) * 2);
const copy = (value) => structuredClone(value);
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const overlaps = (a, b) => a.x < b.x + 2 && a.x + 2 > b.x && a.y < b.y + 2 && a.y + 2 > b.y;
const event = (s, kind, side, text, x = -1, y = -1) => ({ tick: s.tick, kind, side, text, x, y });
export const free = (map, x, y) => x >= 0 && y >= 0 && x + 1 < map.length && y + 1 < map.length && [map[y][x], map[y][x + 1], map[y + 1][x], map[y + 1][x + 1]].every(t => t === 0 || t === 4);

export function zoneAt(tick, size) {
  const min = tick < 200 ? 0 : Math.min(size / 2, 1 + Math.floor((tick - 200) / 30));
  const next = Math.min(size / 2, min + 1);
  return { min, max: size - 1 - min, nextShrinkTick: min === size / 2 ? null : tick < 200 ? 200 : 200 + min * 30, nextMin: next, nextMax: size - 1 - next };
}
export const inside = (t, z) => t.x >= z.min && t.y >= z.min && t.x + 1 <= z.max && t.y + 1 <= z.max;

export function createRoyale({ count, seed = 2, scale = 'auto', terrain = 'ruins' }) {
  if (!Number.isInteger(count) || count < 2) throw Error('至少选择两件坦克作品');
  if (!['auto', 'wide'].includes(scale) || !['ruins', 'grove', 'open'].includes(terrain)) throw Error('未知战场配置');
  const size = gridSize(count, scale), rng = createPrng(seed >>> 0);
  const map = Array.from({ length: size }, () => Array(size).fill(0));
  // Open connected avenues between 2x2 terrain clusters leave every spawn an exit.
  for (let y = 2; y < size - 2; y += 6) for (let x = 2; x < size - 2; x += 6) {
    const roll = rng.next() % 10;
    const type = terrain === 'open' ? (roll < 2 ? 1 : 0) : terrain === 'grove' ? (roll < 6 ? 4 : roll < 8 ? 1 : 0) : (roll < 5 ? 1 : roll < 7 ? 2 : roll < 8 ? 4 : 0);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) map[y + dy][x + dx] = type;
  }
  const candidates = [];
  for (let y = 0; y < size - 1; y += 4) for (let x = 0; x < size - 1; x += 4) if (free(map, x, y)) candidates.push({ x, y });
  const positions = [candidates.splice(rng.next() % candidates.length, 1)[0]];
  while (positions.length < count) {
    let best = -1, score = -1;
    candidates.forEach((p, i) => { const d = Math.min(...positions.map(q => distance(p, q))); if (d > score) { best = i; score = d; } });
    if (best < 0) throw Error('地图没有足够的出生位置');
    positions.push(candidates.splice(best, 1)[0]);
  }
  // Shuffle seat assignments so roster order does not decide the outermost spawn.
  for (let i = positions.length - 1; i > 0; i--) { const j = rng.next() % (i + 1); [positions[i], positions[j]] = [positions[j], positions[i]]; }
  const ids = Array.from({ length: count }, (_, i) => seatId(i));
  return { tick: 0, seed: seed >>> 0, size, terrain, scale, ids, map, bullets: [], bases: {}, combatRules: RULES, supplies: [], exposedUntil: {},
    tanks: Object.fromEntries(ids.map((id, i) => [id, { ...positions[i], dir: rng.next() % 4, hp: 2, maxHp: 2, lives: 2, onField: 1, respawnTicks: 0, invincibleTicks: 0, fireCooldown: 0, rapidTicks: 0, hurtTicks: 0, shield: 0, radarTicks: 0, hitThisTick: 0 }])),
    scores: Object.fromEntries(ids.map(id => [id, { points: 0, damage: 0, kills: 0, deaths: 0, status: 'active', eliminatedAt: null }])) };
}
function arena(s, id) {
  const z = zoneAt(s.tick, s.size);
  const supplies = s.supplies.map(b => ({ ...b }));
  const nearest = id ? supplies.toSorted((a, b) => distance(a, s.tanks[id]) - distance(b, s.tanks[id]))[0] : supplies[0];
  return { mode: 'royale', totalTicks: 200 + s.size / 2 * 30 + 30, phase: z.max - z.min < 12 ? 'finale' : s.tick >= 200 ? 'collapse' : 'skirmish',
    safeZone: z, zoneSchedule: { startTick: 200, stepTicks: 30, stepSize: 1, gridSize: s.size }, radarPulse: z.max - z.min < 12,
    supply: nearest || null, supplies, nextDropTick: Math.floor(s.tick / 80 + 1) * 80 };
}
const score = (s, id) => ({ id, ...s.scores[id], lives: s.tanks[id].lives, respawnTicks: 0 });
export function playerState(s, id) {
  const t = s.tanks[id], a = arena(s, id);
  const grass = e => [s.map[e.y][e.x], s.map[e.y][e.x + 1], s.map[e.y + 1][e.x], s.map[e.y + 1][e.x + 1]].includes(4);
  return { mode: 'brawl', tick: s.tick, mapId: `royale-${s.terrain}`, map: copy(s.map), random: createPrng(s.seed ^ Math.imul(s.tick + 1, 0x9e3779b9) ^ Math.imul(s.ids.indexOf(id) + 1, 0x1234567)).next(),
    self: { id, ...t }, opponents: s.ids.filter(other => other !== id).map(other => score(s, other)), scoreboard: s.ids.map(other => score(s, other)), arena: a,
    radar: { tanks: s.ids.filter(other => other !== id && s.tanks[other].onField).filter(other => {
      const e = s.tanks[other], d = distance(t, e);
      return a.radarPulse || t.radarTicks > 0 || s.exposedUntil[other] >= s.tick || (d <= 6 && (d <= 2 || !grass(e)));
    }).map(other => ({ id: other, ...s.tanks[other] })), bullets: s.bullets.filter(b => distance(t, b) <= 6).map(({ x, y, dir }) => ({ x, y, dir })) } };
}
export function snapshot(s, traces = [], brickBreaks = []) {
  // Terrain is stored once plus destruction events; avoid a full NxN copy per frame.
  return { tick: s.tick, tanks: copy(s.tanks), scores: copy(s.scores), bullets: s.bullets.map(({ x, y, dir, owner }) => ({ x, y, dir, owner })), arena: arena(s), traces, brickBreaks };
}
export function rank(s) {
  const rows = s.ids.map(id => ({ ...score(s, id), hp: s.tanks[id].hp }));
  const key = r => ['error', 'timeout'].includes(r.status) ? -1 : r.eliminatedAt ?? Infinity;
  rows.sort((a, b) => key(b) - key(a) || b.kills - a.kills);
  let last, place;
  return rows.map((r, i) => { const k = key(r); if (i === 0 || k !== last) place = i + 1; last = k; return { ...r, rank: place }; });
}
function respawn(s, id, zone) {
  const others = s.ids.filter(other => other !== id && s.tanks[other].onField).map(other => s.tanks[other]);
  let best, bestScore = -Infinity;
  const rng = createPrng(s.seed ^ Math.imul(s.tick + 1, 2654435761) ^ s.ids.indexOf(id));
  for (let y = 0; y < s.size - 1; y++) for (let x = 0; x < s.size - 1; x++) {
    const p = { x, y };
    if (!free(s.map, x, y) || others.some(t => overlaps(t, p))) continue;
    // Prefer the current safe zone, then distance from opponents and live shells.
    const hazards = [...others, ...s.bullets];
    const clearance = hazards.length ? Math.min(...hazards.map(t => distance(t, p))) : 0;
    const value = (inside(p, zone) ? s.size * 2 : 0) + clearance + (rng.next() % 1000) / 1000;
    if (value > bestScore) { best = p; bestScore = value; }
  }
  if (!best) return false;
  Object.assign(s.tanks[id], best, { hp: 2, onField: 1, fireCooldown: 0, hurtTicks: 0, shield: 0, rapidTicks: 0, radarTicks: 0, hitThisTick: 0 });
  return true;
}
export function step(s, actions) {
  const events = [], z = zoneAt(s.tick, s.size);
  const offset = s.tick % s.ids.length, order = [...s.ids.slice(offset), ...s.ids.slice(0, offset)];
  for (const t of Object.values(s.tanks)) for (const field of ['hurtTicks', 'rapidTicks', 'radarTicks']) if (t[field] > 0) t[field]--;
  if (s.tick >= 200 && (s.tick - 200) % 30 === 0) events.push(event(s, 'zone', '', z.max < z.min ? '安全区消失' : '安全区正在收缩'));
  if (s.tick % 80 === 0 && z.max - z.min >= 4) {
    const rng = createPrng(s.seed ^ Math.imul(s.tick + 1, 2654435761));
    for (let i = 0; i < Math.max(2, Math.ceil(s.ids.length / 4)); i++) {
      for (let attempt = 0; attempt < 80; attempt++) {
        const x = z.min + rng.next() % (z.max - z.min), y = z.min + rng.next() % (z.max - z.min);
        if (!free(s.map, x, y) || s.supplies.some(b => overlaps(b, { x, y }))) continue;
        s.supplies.push({ id: `${s.tick}-${i}`, x, y, type: Object.keys(SUPPLIES)[rng.next() % 4], appearTick: s.tick, expireTick: s.tick + 180, available: true }); break;
      }
    }
  }
  s.supplies = s.supplies.filter(b => s.tick < b.expireTick && inside(b, z));
  for (const id of order) {
    const a = normalizeAction(actions[id]), before = events.length;
    applyFire(s, id, a.fire, events);
    if (events.length > before) s.exposedUntil[id] = s.tick + 8;
  }
  for (const id of order) applyMove(s, id, normalizeAction(actions[id]).move);
  const bullet = runBulletPhase(s); events.push(...bullet.events);
  for (const id of order) {
    const t = s.tanks[id];
    if (t.fireCooldown > 0) t.fireCooldown--;
    if (t.onField && s.tick >= 200 && s.tick % 10 === 0 && !inside(t, z)) {
      t.hp = Math.max(0, t.hp - 1); events.push(event(s, 'zoneHit', id, `${id} 受到风暴伤害`, t.x, t.y));
      if (!t.hp) { t.onField = 0; t.lives--; events.push(event(s, 'death', id, `${id} 被风暴击毁，剩余 ${t.lives} 命`, t.x, t.y)); }
    }
    if (!t.onField && s.scores[id].status === 'active') {
      s.scores[id].deaths++;
      if (t.lives > 0 && respawn(s, id, z)) {
        events.push(event(s, 'respawn', id, `${id} 重新入场 · 剩余 ${t.lives} 命`, t.x, t.y));
      } else {
        t.lives = 0;
        Object.assign(s.scores[id], { status: 'eliminated', eliminatedAt: s.tick });
        events.push(event(s, 'eliminated', id, `${id} 出局`, t.x, t.y));
      }
    }
    if (!t.onField) continue;
    s.supplies = s.supplies.filter(b => {
      if (!overlaps(t, b) || b.type === 'repair' && t.hp === t.maxHp) return true;
      if (b.type === 'repair') t.hp = Math.min(t.maxHp, t.hp + 1);
      if (b.type === 'rapid') t.rapidTicks = 80;
      if (b.type === 'shield') t.shield = 1;
      if (b.type === 'radar') t.radarTicks = 80;
      events.push(event(s, 'pickup', id, `${id} 拾取${SUPPLIES[b.type]}`, b.x, b.y)); return false;
    });
  }
  const alive = s.ids.filter(id => s.tanks[id].onField);
  const end = alive.length <= 1 ? { reason: 'survivor', winners: alive, ranking: rank(s) } : null;
  if (end) events.push(event(s, 'end', alive[0] || '', alive.length ? '最后一辆坦克，留在场上。' : '风暴吞没战场 · 无人生还'));
  return { frame: snapshot(s, bullet.traces, bullet.brickBreaks), events, end };
}
export async function runRoyale({ sources, entrants, seed, scale, terrain, adapterFactory, signal, onProgress }) {
  const s = createRoyale({ count: sources.length, seed, scale, terrain }), initialMap = copy(s.map);
  const frames = [snapshot(s)], events = [], adapters = {};
  const cancel = () => { if (signal?.aborted) throw Object.assign(Error('已取消本场计算'), { code: 'cancelled' }); };
  const dispose = () => Object.values(adapters).forEach(a => a?.dispose());
  const fail = (id, error) => {
    Object.assign(s.tanks[id], { hp: 0, lives: 0, onField: 0 });
    Object.assign(s.scores[id], { status: error?.code === 'timeout' ? 'timeout' : 'error', eliminatedAt: s.tick });
    s.bullets = s.bullets.filter(b => b.owner !== id);
    events.push(event(s, s.scores[id].status, id, String(error?.message || error).slice(0, 160))); adapters[id]?.dispose();
  };
  signal?.addEventListener('abort', dispose, { once: true });
  try {
    for (const [i, id] of s.ids.entries()) {
      cancel();
      try { adapters[id] = await adapterFactory(sources[i]); await adapters[id].ready; } catch (e) { cancel(); fail(id, e); }
    }
    while (true) {
      cancel(); const actions = {};
      // Sequential worker decisions make runtime budget independent of CPU contention.
      for (const id of s.ids) if (s.tanks[id].onField) {
        try { actions[id] = await adapters[id].decide(playerState(s, id)); } catch (e) { cancel(); fail(id, e); }
      }
      cancel(); const result = step(s, actions); frames.push(result.frame); events.push(...result.events);
      if (s.tick % 5 === 0) onProgress?.({ tick: s.tick, alive: s.ids.filter(id => s.tanks[id].onField).length, zone: zoneAt(s.tick, s.size) });
      if (result.end) return { ...result.end, frames, events, meta: { engineVersion: VERSION, mode: 'royale', seed: s.seed, size: s.size, terrain, scale, initialMap, entrants, ids: s.ids } };
      s.tick++;
      if (s.tick % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally { signal?.removeEventListener('abort', dispose); dispose(); }
}
