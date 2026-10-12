import { BASE_RADAR_RANGE, GRID, RADAR_RANGE, TANK_SIZE, TERRAIN_GRASS } from './constants.js';

function abs(n) {
  return n < 0 ? -n : n;
}

export function chebyshev(x1, y1, x2, y2) {
  const dx = abs(x1 - x2);
  const dy = abs(y1 - y2);
  return dx > dy ? dx : dy;
}

export function tankTouchesGrass(map, tank) {
  for (let dy = 0; dy < TANK_SIZE; dy += 1) {
    for (let dx = 0; dx < TANK_SIZE; dx += 1) {
      const x = tank.x + dx;
      const y = tank.y + dy;
      if (x >= 0 && y >= 0 && x < GRID && y < GRID && map[y][x] === TERRAIN_GRASS) {
        return true;
      }
    }
  }
  return false;
}

// origin 是观察者左上角。敌方不在场、超出距离、或踩到任意一格草，都不进 tanks。
export function buildRadar(map, origin, enemy, bullets, pulse = false) {
  const tanks = [];
  if (enemy.onField === 1) {
    const dist = chebyshev(origin.x, origin.y, enemy.x, enemy.y);
    if (pulse || (dist <= RADAR_RANGE && !tankTouchesGrass(map, enemy))) {
      tanks.push({ x: enemy.x, y: enemy.y, dir: enemy.dir, invincibleTicks: enemy.invincibleTicks });
    }
  }
  const seenBullets = [];
  for (let i = 0; i < bullets.length; i += 1) {
    const b = bullets[i];
    if (chebyshev(origin.x, origin.y, b.x, b.y) <= RADAR_RANGE) {
      seenBullets.push({ x: b.x, y: b.y, dir: b.dir });
    }
  }
  return { tanks, bullets: seenBullets };
}

// 基地近距传感器独立于坦克位置，能发现草丛目标，但不会暴露圈外目标。
export function buildBaseRadar(base, enemy, bullets) {
  const visible = t => chebyshev(base.x, base.y, t.x, t.y) <= BASE_RADAR_RANGE;
  return {
    range: BASE_RADAR_RANGE,
    tanks: enemy.onField === 1 && visible(enemy) ? [{ x: enemy.x, y: enemy.y, dir: enemy.dir, invincibleTicks: enemy.invincibleTicks }] : [],
    bullets: bullets.filter(visible).map(b => ({ x: b.x, y: b.y, dir: b.dir })),
  };
}
