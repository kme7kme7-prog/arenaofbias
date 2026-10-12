import {
  sampleProjectiles,
  battleImpulse,
  directionVector,
} from './presentation.mjs';
export const COLORS = ['#bc6349', '#568499', '#b49444', '#7c7998'];
const sides = ['A', 'B', 'C', 'D'];
const palettes = {
  paper: {
    ground: '#dddcca',
    alt: '#d9d8c6',
    grid: '#4a584a0b',
    brick: '#b88666',
    brickTop: '#d5b190',
    mortar: '#795840',
    steel: '#798477',
    steelTop: '#a8af96',
    water: '#9fbabd',
    wave: '#d8e8df',
    grass: '#849568',
    leaf: '#647b4d',
    text: '#526148',
  },
  ink: {
    ground: '#29372f',
    alt: '#2c3a31',
    grid: '#d7dfc407',
    brick: '#9b7358',
    brickTop: '#c09b73',
    mortar: '#574d39',
    steel: '#69766a',
    steelTop: '#93a088',
    water: '#3e646b',
    wave: '#82a1a1',
    grass: '#536e4b',
    leaf: '#789263',
    text: '#afbb9f',
  },
};

function terrain(ctx, map, u, p, tick = 0, simple = false) {
  for (let y = 0; y < 26; y++)
    for (let x = 0; x < 26; x++) {
      const px = x * u,
        py = y * u,
        t = map[y][x];
      ctx.fillStyle = (x + y) % 2 ? p.ground : p.alt;
      ctx.fillRect(px, py, u, u);
      if (t === 1) {
        ctx.fillStyle = p.mortar;
        ctx.fillRect(px + 0.7, py + 0.7, u - 1.4, u - 1.4);
        ctx.fillStyle = p.brick;
        ctx.fillRect(px + 1.4, py + 1, u - 2.8, u * 0.43);
        ctx.fillRect(px + 1.4, py + u * 0.53, u - 2.8, u * 0.4);
        if (!simple) {
          ctx.fillStyle = p.brickTop;
          ctx.fillRect(px + 1.4, py + 1, u - 2.8, 1.5);
          ctx.fillRect(px + 1.4, py + u * 0.53, u - 2.8, 1);
          ctx.fillStyle = p.mortar;
          ctx.fillRect(px + u * 0.6, py, 1, u * 0.43);
          ctx.fillRect(px + u * 0.3, py + u * 0.5, 1, u * 0.5);
        }
      } else if (t === 2) {
        ctx.fillStyle = '#1d332b30';
        ctx.fillRect(px + 2, py + 3, u - 2, u - 2);
        ctx.fillStyle = p.steel;
        ctx.fillRect(px + 0.6, py + 0.6, u - 2, u - 2);
        ctx.fillStyle = p.steelTop;
        ctx.fillRect(px + 0.6, py + 0.6, u - 2, Math.max(1, u * 0.13));
        if (!simple) {
          ctx.fillStyle = '#263b354a';
          ctx.fillRect(px + u * 0.25, py + u * 0.27, u * 0.5, u * 0.47);
        }
      } else if (t === 3) {
        ctx.fillStyle = p.water;
        ctx.fillRect(px, py, u, u);
        ctx.strokeStyle = p.wave;
        ctx.lineWidth = Math.max(0.7, u * 0.045);
        if (!simple)
          for (let k = 0; k < 2; k++) {
            const offset = Math.sin(tick * 0.06 + x + y) * u * 0.05;
            ctx.beginPath();
            ctx.moveTo(px + u * 0.12, py + u * (0.3 + k * 0.4) + offset);
            ctx.lineTo(px + u * 0.7, py + u * (0.3 + k * 0.4) + offset);
            ctx.stroke();
          }
      } else if (t === 4) {
        ctx.fillStyle = p.grass;
        ctx.globalAlpha = 0.65;
        ctx.fillRect(px, py, u, u);
        ctx.globalAlpha = 1;
        if (!simple) {
          ctx.strokeStyle = p.leaf;
          ctx.lineWidth = Math.max(1, u * 0.065);
          for (let k = 0; k < 3; k++) {
            const xx = px + u * (0.18 + k * 0.3);
            ctx.beginPath();
            ctx.moveTo(xx - u * 0.09, py + u * 0.35);
            ctx.lineTo(xx, py + u * 0.69);
            ctx.lineTo(xx + u * 0.08, py + u * 0.22);
            ctx.stroke();
          }
        }
      } else if (!simple && (x * 13 + y * 7) % 11 === 0) {
        ctx.fillStyle = '#59614a15';
        ctx.fillRect(px + u * 0.3, py + u * 0.45, u * 0.08, u * 0.08);
      }
      ctx.strokeStyle = p.grid;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, u, u);
    }
}

export function drawMini(canvas, map, theme = 'paper') {
  canvas.width = canvas.height = 156;
  terrain(canvas.getContext('2d'), map, 6, palettes[theme], 0, true);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let u = 20,
    activeColors = COLORS,
    combatEvents = [],
    now = 0,
    quiet = false;
  function box(x, y, w, h, color, radius = 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  }
  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function tank(id, t, next, blend, selected, dim) {
    if (!t.onField) return;
    if (
      combatEvents.some(
        (e) => e.kind === 'death' && e.side === id && e.tick > Math.floor(now),
      )
    )
      return;
    const c = activeColors[sides.indexOf(id)];
    const smooth =
      next?.onField &&
      next.lives === t.lives &&
      Math.abs(next.x - t.x) + Math.abs(next.y - t.y) <= 1;
    const x = t.x + (smooth ? (next.x - t.x) * blend : 0),
      y = t.y + (smooth ? (next.y - t.y) * blend : 0);
    let angle = (t.dir * Math.PI) / 2;
    if (smooth) {
      let d = next.dir - t.dir;
      if (d > 2) d -= 4;
      if (d < -2) d += 4;
      angle += ((d * Math.PI) / 2) * blend;
    }
    const cx = (x + 1) * u,
      cy = (y + 1) * u;
    const hit = combatEvents.findLast(
      (e) =>
        ['armorHit', 'zoneHit'].includes(e.kind) &&
        e.side === id &&
        now - e.at < 2.5,
    );
    const shot = combatEvents.findLast(
      (e) => e.kind === 'fire' && e.side === id && now - e.at < 1.5,
    );
    const kick =
      shot && !quiet
        ? Math.sin(Math.min(1, (now - shot.at) / 1.5) * Math.PI) * u * 0.15
        : 0;
    ctx.save();
    ctx.globalAlpha = dim ? 0.4 : 1;
    if (selected) {
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([u * 0.2, u * 0.16]);
      ctx.strokeRect(x * u - 4, y * u - 4, 2 * u + 8, 2 * u + 8);
      ctx.setLineDash([]);
    }
    ctx.save();
    ctx.translate(cx + u * 0.1, cy + u * 0.13);
    ctx.rotate(angle);
    box(-u * 0.8, -u * 0.8, u * 1.6, u * 1.6, '#26372d38', u * 0.14);
    ctx.restore();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.translate(0, kick);
    box(-u * 0.87, -u * 0.85, u * 0.34, u * 1.7, '#344039', u * 0.08);
    box(u * 0.53, -u * 0.85, u * 0.34, u * 1.7, '#344039', u * 0.08);
    for (let k = 0; k < 5; k++) {
      const roll =
        smooth && (next.x !== t.x || next.y !== t.y)
          ? (blend * 0.64) % 0.32
          : 0;
      box(
        -u * 0.83,
        (-0.7 + k * 0.32 + roll) * u,
        u * 0.25,
        u * 0.1,
        '#d0cdb177',
      );
      box(
        u * 0.58,
        (-0.7 + k * 0.32 + roll) * u,
        u * 0.25,
        u * 0.1,
        '#d0cdb177',
      );
    }
    box(-u * 0.57, -u * 0.75, u * 1.14, u * 1.5, c, u * 0.12);
    box(-u * 0.45, -u * 0.65, u * 0.9, u * 0.22, '#ffffff28', u * 0.03);
    box(-u * 0.38, u * 0.43, u * 0.76, u * 0.15, '#26362c55');
    box(-u * 0.12, -u * 1.08, u * 0.24, u * 1.08, '#3d4840', u * 0.03);
    box(-u * 0.07, -u * 1.08, u * 0.07, u * 0.6, '#faf5df80');
    circle(0, 0, u * 0.43, '#24332f88');
    circle(0, -u * 0.035, u * 0.35, c);
    circle(-u * 0.1, -u * 0.14, u * 0.12, '#fff8d657');
    if (hit) {
      ctx.globalAlpha = Math.max(0, 1 - (now - hit.at) / 2.5) * 0.7;
      box(-u * 0.58, -u * 0.76, u * 1.16, u * 1.52, '#fff3c3', u * 0.12);
      ctx.globalAlpha = 1;
    }
    ctx.rotate(-angle);
    if (t.invincibleTicks || t.hurtTicks) {
      ctx.strokeStyle = t.hurtTicks ? '#fff8d8' : c;
      ctx.lineWidth = u * 0.075;
      ctx.beginPath();
      ctx.arc(0, 0, u * 1.16, 0, Math.PI * 2);
      ctx.stroke();
    }
    box(-u * 0.32, u * 0.98, u * 0.64, u * 0.65, '#f4f0e4', u * 0.08);
    ctx.fillStyle = c;
    ctx.font = `700 ${u * 0.5}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(id, 0, u * 1.48);
    if (!selected) {
      for (let i = 0; i < 2; i++)
        box(
          (-0.42 + i * 0.46) * u,
          -u * 1.34,
          u * 0.38,
          u * 0.1,
          i <
            (hit
              ? Math.max(0, (hit.tick > Math.floor(now) ? next || t : t).hp)
              : t.hp)
            ? c
            : '#38413755',
          u * 0.035,
        );
    }
    ctx.restore();
  }
  function ring(x, y, radius, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  function caption(x, y, text, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${u * 0.49}px MiSans, sans-serif`;
    const w = ctx.measureText(text).width + u * 0.5;
    x = Math.max(w / 2 + u * 0.2, Math.min(26 * u - w / 2 - u * 0.2, x));
    y = Math.max(u * 0.9, Math.min(25.2 * u, y));
    box(x - w / 2, y - u * 0.5, w, u * 0.86, '#24382eed', u * 0.15);
    box(x - w / 2, y - u * 0.5, u * 0.1, u * 0.86, color, u * 0.03);
    ctx.fillStyle = '#fff4d6';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + u * 0.1);
    ctx.restore();
  }
  function effect(e) {
    const age = now - e.at;
    if (age < 0 || e.x < 0 || e.y < 0) return;
    const x = e.cx * u,
      y = e.cy * u,
      c = activeColors[sides.indexOf(e.side)] || '#d5934a';
    ctx.save();
    if (e.kind === 'fire' && age < 1.4) {
      const p = age / 1.4;
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.translate(x, y);
      ctx.rotate((e.dir * Math.PI) / 2);
      box(
        -u * 0.16,
        -u * (0.4 + p * 0.35),
        u * 0.32,
        u * (0.7 + p * 0.35),
        '#fff0aa',
        u * 0.05,
      );
      if (!quiet) {
        box(-u * 0.31, -u * 0.12, u * 0.62, u * 0.15, c, u * 0.04);
        circle(0, 0, u * 0.3 * (1 - p), '#fffced');
      }
    } else if (
      ['death', 'armorHit', 'zoneHit', 'brick', 'hit'].includes(e.kind)
    ) {
      // A lethal hit has one explosion, not three stacked hit effects.
      const lethal = combatEvents.some(
        (other) =>
          other.kind === 'death' &&
          other.tick === e.tick &&
          other.side === e.side,
      );
      if (e.kind !== 'death' && lethal) {
        ctx.restore();
        return;
      }
      const death = e.kind === 'death',
        damage = ['armorHit', 'zoneHit'].includes(e.kind);
      const duration = death ? 8 : damage ? 4 : 2.6,
        p = age / duration;
      if (p < 1) {
        const size = death ? 2 : damage ? 1 : 0.5;
        if (!quiet) {
          if (death) {
            ctx.globalAlpha = Math.sin(Math.PI * p) * 0.24;
            for (let k = 0; k < 4; k++) {
              const a = k * 2.1 + e.id;
              circle(
                x + Math.cos(a) * u * p * 0.8,
                y + Math.sin(a) * u * p * 0.8 - p * u * 0.5,
                u * (0.3 + p * 0.85),
                '#3d4238',
              );
            }
          }
          ctx.globalAlpha = (1 - p) ** 2;
          const glow = ctx.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            u * size * (0.65 + p),
          );
          glow.addColorStop(0, '#fff4ce');
          glow.addColorStop(0.3, '#ffc777b0');
          glow.addColorStop(1, '#d4753700');
          circle(x, y, u * size * (0.65 + p), glow);
          const count = death ? 12 : damage ? 8 : 5;
          for (let k = 0; k < count; k++) {
            const a = k * 2.39996 + e.id * 1.7;
            const radius =
              u * size * (0.15 + Math.sqrt(p) * (0.8 + (k % 3) * 0.22));
            ctx.save();
            ctx.translate(
              x + Math.cos(a) * radius,
              y + Math.sin(a) * radius + p * p * u * 0.35,
            );
            ctx.rotate(a + p);
            box(
              -u * 0.055,
              -u * 0.1,
              u * 0.11,
              u * (0.12 + (1 - p) * 0.18),
              k % 3 ? '#df914f' : '#fff4c2',
            );
            ctx.restore();
          }
        }
        ctx.globalAlpha = (1 - p) * (quiet ? 0.45 : 0.85);
        ring(
          x,
          y,
          u * size * (0.35 + (quiet ? 0.45 : p * 0.95)),
          death ? '#ae6543' : '#e5aa62',
          u * 0.075 * (1 - p) + 0.5,
        );
        if (!quiet && p < 0.23) {
          ctx.globalAlpha = (1 - p / 0.23) * 0.92;
          circle(x, y, u * size * (0.25 + p), '#fff9e1');
        }
      }
    } else if (['repair', 'rapid', 'respawn'].includes(e.kind) && age < 7) {
      const p = age / 7;
      ctx.globalAlpha = 1 - p;
      ring(x, y, u * (quiet ? 1.3 : 0.8 + p * 1.4), c, u * 0.07);
    }
    ctx.restore();
  }
  function labels() {
    // At most one current callout per tank, plus one recorded kill confirmation.
    for (const id of sides) {
      const e = combatEvents.findLast(
        (e) =>
          e.side === id &&
          [
            'death',
            'armorHit',
            'zoneHit',
            'repair',
            'rapid',
            'respawn',
          ].includes(e.kind) &&
          now - e.at < (e.kind === 'death' ? 12 : 7),
      );
      if (!e) continue;
      const age = now - e.at,
        duration = e.kind === 'death' ? 12 : 7;
      const text =
        e.kind === 'death'
          ? `${id} ${e.final ? '出局' : '被击毁'}`
          : e.kind === 'armorHit' || e.kind === 'zoneHit'
            ? `${id} 装甲 −1`
            : e.kind === 'repair'
              ? `${id} 装甲 +1`
              : e.kind === 'rapid'
                ? `${id} 速射就绪`
                : `${id} 重返战场`;
      caption(
        e.cx * u,
        (e.cy - 1.65 - (quiet ? 0 : Math.min(1, age / 5) * 0.35)) * u,
        text,
        activeColors[sides.indexOf(id)],
        Math.min(1, (duration - age) / 2),
      );
    }
    const frag = combatEvents.findLast(
      (e) => e.kind === 'frag' && e.target && now - e.at < 12,
    );
    if (frag)
      caption(
        13 * u,
        u * 1.1,
        `${frag.side}  击毁  ${frag.target}`,
        activeColors[sides.indexOf(frag.side)],
        Math.min(1, (12 - now + frag.at) / 2),
      );
  }
  return {
    draw(
      frame,
      {
        next = null,
        blend = 0,
        events = [],
        theme = 'paper',
        editing = false,
        selected = null,
        hover = null,
        ghost = null,
        colors = COLORS,
        reduced = false,
      } = {},
    ) {
      activeColors = colors;
      combatEvents = events;
      now = frame.tick + blend;
      quiet = reduced;
      const size = Math.round(
        canvas.clientWidth * Math.min(devicePixelRatio || 1, 2),
      );
      if (!size) return;
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = canvas.height = size;
      }
      u = size / 26;
      ctx.clearRect(0, 0, size, size);
      const p = palettes[theme],
        tick = frame.tick + blend;
      ctx.fillStyle = p.ground;
      ctx.fillRect(0, 0, size, size);
      ctx.save();
      const impulse = battleImpulse(combatEvents, now, quiet || editing);
      ctx.translate(impulse.x * u, impulse.y * u);
      terrain(ctx, frame.map, u, p, tick);
      // Open a destroyed brick exactly when its recorded projectile reaches it.
      if (next)
        for (const e of combatEvents)
          if (e.kind === 'brick' && e.tick === next.tick) {
            box(e.x * u, e.y * u, u, u, (e.x + e.y) % 2 ? p.ground : p.alt);
          }
      const margin = frame.arena.safeZone.min;
      if (margin) {
        ctx.fillStyle = '#b3513c32';
        ctx.fillRect(0, 0, size, margin * u);
        ctx.fillRect(0, (26 - margin) * u, size, margin * u);
        ctx.fillRect(0, margin * u, margin * u, (26 - 2 * margin) * u);
        ctx.fillRect(
          (26 - margin) * u,
          margin * u,
          margin * u,
          (26 - 2 * margin) * u,
        );
        ctx.strokeStyle = '#b75f44';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          margin * u,
          margin * u,
          (26 - 2 * margin) * u,
          (26 - 2 * margin) * u,
        );
      }
      const supply = frame.arena.supply;
      if (supply) {
        const x = (supply.x + 1) * u,
          y = (supply.y + 1) * u;
        ctx.save();
        ctx.globalAlpha = supply.available ? 1 : 0.5;
        box(x - u * 0.65, y - u * 0.65, u * 1.3, u * 1.3, '#ede8d7', u * 0.08);
        ctx.strokeStyle = supply.type === 'repair' ? '#577760' : '#9b7834';
        ctx.lineWidth = u * 0.13;
        ctx.strokeRect(x - u * 0.54, y - u * 0.54, u * 1.08, u * 1.08);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.textAlign = 'center';
        ctx.font = `bold ${u}px sans-serif`;
        ctx.fillText(supply.type === 'repair' ? '+' : '»', x, y + u * 0.35);
        ctx.restore();
      }
      for (const id of sides)
        tank(
          id,
          frame.tanks[id],
          next?.tanks[id],
          blend,
          editing && selected === id,
          ghost?.id === id,
        );
      for (const b of sampleProjectiles(frame, next, blend)) {
        const x = (b.x + 0.5) * u,
          y = (b.y + 0.5) * u,
          c = activeColors[sides.indexOf(b.owner)];
        const [dx, dy] = directionVector(b.dir);
        const tx = x - dx * u * b.trail,
          ty = y - dy * u * b.trail;
        const gradient = ctx.createLinearGradient(tx, ty, x, y);
        gradient.addColorStop(0, c + '00');
        gradient.addColorStop(1, c);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = u * 0.22;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        circle(x, y, u * 0.17, c);
        circle(x, y, u * 0.085, '#fff9da');
        ctx.lineCap = 'butt';
      }
      for (const e of combatEvents) effect(e);
      if (!editing) labels();
      ctx.restore();
      if (editing && hover) {
        ctx.fillStyle = hover.valid ? '#557b5133' : '#bb553e55';
        ctx.fillRect(hover.x * u, hover.y * u, hover.size * u, hover.size * u);
        ctx.strokeStyle = hover.valid ? '#577c52' : '#b45940';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          hover.x * u,
          hover.y * u,
          hover.size * u,
          hover.size * u,
        );
      }
      if (ghost) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        tank(
          ghost.id,
          { ...frame.tanks[ghost.id], ...ghost },
          null,
          0,
          true,
          false,
        );
        ctx.restore();
      }
    },
  };
}
