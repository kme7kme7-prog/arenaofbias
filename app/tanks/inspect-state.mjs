export const INSPECT_HOLD = 2800;
export const INSPECT_SWITCH = 650;

// Wall-clock hold is intentional: a fast replay still leaves enough reading time.
export function createInspectState() {
  return {
    id: null, pinned: false, collapsed: true, until: 0, changedAt: -Infinity, blocked: null,
    hover(id, now) {
      if (!id) { this.blocked = null; return; }
      if (this.pinned || id === this.blocked) return;
      if (id !== this.id && now - this.changedAt < INSPECT_SWITCH) return;
      if (id !== this.id) { this.id = id; this.collapsed = true; this.changedAt = now; }
      this.until = now + INSPECT_HOLD;
    },
    select(id, now) {
      this.id = id; this.pinned = !!id; this.collapsed = true; this.changedAt = now; this.blocked = null;
    },
    close() { this.blocked = this.id; this.id = null; this.pinned = false; this.collapsed = true; },
    tick(now, held = false) {
      if (held) this.until = now + INSPECT_HOLD;
      if (!this.pinned && now > this.until) this.id = null;
    },
  };
}

export function sampleTank(t, next, fraction) {
  const smooth = next?.onField && next.lives === t.lives && Math.abs(next.x - t.x) + Math.abs(next.y - t.y) <= 1;
  return { ...t, x: t.x + (smooth ? (next.x - t.x) * fraction : 0), y: t.y + (smooth ? (next.y - t.y) * fraction : 0) };
}

export function hitTank(items, point, padding = 0) {
  return items.filter(t => t.onField && point.x >= t.x - padding && point.x <= t.x + 2 + padding && point.y >= t.y - padding && point.y <= t.y + 2 + padding)
    .sort((a, b) => Math.hypot(point.x - a.x - 1, point.y - a.y - 1) - Math.hypot(point.x - b.x - 1, point.y - b.y - 1))[0]?.id || null;
}

export function survivalRows(frame, ids) {
  const key = id => ['error', 'timeout'].includes(frame.scores[id].status) ? -1 : frame.scores[id].eliminatedAt ?? Infinity;
  const sorted = [...ids].sort((a, b) => key(b) - key(a) || frame.scores[b].kills - frame.scores[a].kills);
  let previous, rank;
  return sorted.map((id, index) => {
    const time = key(id); if (!index || time !== previous) rank = index + 1; previous = time;
    return { id, rank, alive: frame.tanks[id].lives > 0 && !['error', 'timeout'].includes(frame.scores[id].status) };
  });
}
