// Website-only setup. The original 2.6 simulation remains the default path.
const sides = ['A', 'B', 'C', 'D'];
export function validateStage(value, activeSides = sides) {
  if (
    !value ||
    !Array.isArray(value.map) ||
    value.map.length !== 26 ||
    !value.map.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 26 &&
        row.every((tile) => Number.isInteger(tile) && tile >= 0 && tile <= 4),
    )
  ) {
    throw Error('地图需要是 26 × 26 格，只能使用五种地形。');
  }
  const spawns = {};
  for (const id of sides) {
    const p = value.spawns?.[id];
    if (
      !p ||
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y) ||
      p.x < 0 ||
      p.y < 0 ||
      p.x > 24 ||
      p.y > 24 ||
      !Number.isInteger(p.dir) ||
      p.dir < 0 ||
      p.dir > 3
    )
      throw Error(`${id} 的出生位置或朝向不正确。`);
    if (activeSides.includes(id)) {
      for (let y = p.y; y < p.y + 2; y++)
        for (let x = p.x; x < p.x + 2; x++) {
          if (![0, 4].includes(value.map[y][x]))
            throw Error(`${id} 的整个车身需要放在空地或草地上。`);
        }
      if (
        Object.entries(spawns)
          .filter(([side]) => activeSides.includes(side))
          .map(([, spawn]) => spawn)
          .some(
            (q) =>
              p.x < q.x + 2 && p.x + 2 > q.x && p.y < q.y + 2 && p.y + 2 > q.y,
          )
      ) {
        throw Error('两辆坦克不能重叠。');
      }
    }
    spawns[id] = { x: p.x, y: p.y, dir: p.dir };
  }
  return { map: value.map.map((row) => row.slice()), spawns };
}

export function validateSeats(value) {
  if (
    !value ||
    !sides.every(
      (id) => Number.isInteger(value[id]) && value[id] >= 0 && value[id] < 4,
    ) ||
    new Set(sides.map((id) => value[id])).size !== 4
  )
    throw Error('四名选手与坦克的对应不正确。');
  return Object.fromEntries(sides.map((id) => [id, value[id]]));
}
