// Presentation is sampled from recorded paths and events, never from wall-clock state.
const VECTORS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const same = (a, b) => a.x === b.x && a.y === b.y;
export function sampleProjectiles(frame, next, blend) {
  if (!next || blend <= 0)
    return frame.bullets.map((b) => ({ ...b, trail: 0.55 }));
  const paths = next.traces || [];
  // Old recordings without traces retain their recorded positions.
  if (!paths.length) return frame.bullets.map((b) => ({ ...b, trail: 0.35 }));
  return paths.flatMap((path) => {
    if (!path.cells.length) return [];
    const last = path.cells.at(-1),
      distance = path.cells.length - 1;
    const survives = next.bullets.some(
      (b) => b.owner === path.owner && b.dir === path.dir && same(b, last),
    );
    const travel = Math.min(distance, Math.max(0, blend) * 3);
    if (!survives && blend * 3 >= distance) return [];
    const i = Math.min(Math.floor(travel), distance),
      a = path.cells[i],
      b = path.cells[Math.min(i + 1, distance)];
    const t = travel - i;
    return [
      {
        owner: path.owner,
        dir: path.dir,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        trail: Math.min(0.9, travel + 0.2),
      },
    ];
  });
}
function impactPhase(frame, e) {
  const traces = (frame.traces || []).filter(
    (path) =>
      path.cells.length &&
      same(path.cells.at(-1), e) &&
      (e.kind !== 'frag' || path.owner === e.side),
  );
  return traces.length
    ? Math.min(...traces.map((path) => (path.cells.length - 1) / 3))
    : 1;
}
export function prepareEffects(replay) {
  const useful = new Set([
    'fire',
    'armorHit',
    'zoneHit',
    'death',
    'frag',
    'hit',
    'brick',
    'respawn',
    'repair',
    'rapid',
    'zone',
    'eliminated',
  ]);
  return replay.events
    .filter((e) => useful.has(e.kind))
    .map((e, id) => {
      const frame = replay.frames[e.tick],
        tank = frame.tanks[e.side];
      const phase =
        e.kind === 'fire'
          ? 0
          : ['armorHit', 'death', 'frag', 'hit', 'brick'].includes(e.kind)
            ? impactPhase(frame, e)
            : 1;
      // Events locate bullet contact cells; tank-size effects use the actual tank center.
      const centered = [
        'death',
        'respawn',
        'repair',
        'rapid',
        'zoneHit',
        'eliminated',
      ].includes(e.kind);
      return {
        ...e,
        id,
        at: Math.max(0, e.tick - 1 + phase),
        cx: centered && tank ? tank.x + 1 : e.x + 0.5,
        cy: centered && tank ? tank.y + 1 : e.y + 0.5,
        dir:
          frame.traces.find(
            (p) => p.owner === e.side && p.cells.length && same(p.cells[0], e),
          )?.dir ??
          tank?.dir ??
          0,
        final: e.kind === 'death' && tank?.lives === 0,
      };
    })
    .sort((a, b) => a.at - b.at || a.id - b.id);
}
export function recentEffects(effects, time) {
  return effects.filter(
    (e) => e.at <= time && (e.at < time || e.tick <= time) && time - e.at < 14,
  );
}
export function battleImpulse(events, time, reduced = false) {
  if (reduced) return { x: 0, y: 0 };
  let energy = 0;
  for (const e of events) {
    const age = time - e.at;
    if (age < 0 || age > 2.4) continue;
    const power = e.kind === 'death' ? 0.12 : e.kind === 'armorHit' ? 0.035 : 0;
    energy += power * (1 - age / 2.4) ** 2;
  }
  energy = Math.min(0.14, energy);
  if (!energy) return { x: 0, y: 0 };
  return {
    x: Math.sin(time * 24) * energy,
    y: Math.cos(time * 31) * energy * 0.65,
  };
}
export const directionVector = (dir) => VECTORS[dir] || VECTORS[0];
