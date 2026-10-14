const clamp = value => Math.max(0, Math.min(1, value));

// Pure replay-time sampling: seeking backwards never inherits a later boundary.
// The fine rule line stays at the true boundary while the storm wash catches up.
export function sampleStorm(zone, tick, schedule, reduced = false) {
  const target = zone.min;
  if (reduced || target <= 0 || !schedule) return { margin: target, target, moving: false };
  const changedAt = schedule.startTick + (target / schedule.stepSize - 1) * schedule.stepTicks;
  const t = clamp((tick - changedAt) / 6);
  const eased = t * t * (3 - 2 * t);
  return { margin: Math.max(0, target - schedule.stepSize) + schedule.stepSize * eased, target, moving: t < 1 };
}

export function sampleRecoil(events, id, tick, reduced = false) {
  if (reduced) return 0;
  const shot = events.findLast(e => e.kind === 'fire' && e.side === id && e.tick <= tick);
  if (!shot) return 0;
  const age = tick - shot.tick;
  return age < 2 ? .18 * (1 - age / 2) ** 2 : 0;
}
