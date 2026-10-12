import { validateStage } from './engine/core/stage.js';
import { BRAWL_SPAWNS } from './engine/core/brawl-maps.js';
import { COLORS } from './render.mjs';

export const SIDES = ['A', 'B', 'C', 'D'];
export const PAINTS = [
  { name: '陶红', value: COLORS[0] },
  { name: '湖蓝', value: COLORS[1] },
  { name: '麦金', value: COLORS[2] },
  { name: '雾紫', value: COLORS[3] },
  { name: '松绿', value: '#53775f' },
  { name: '珊瑚', value: '#cc7d72' },
  { name: '青碧', value: '#438c87' },
  { name: '石墨', value: '#69717b' },
];
export const occupied = (config) =>
  SIDES.filter((id) => config.seats[id] !== null);
export const defaultColors = () =>
  Object.fromEntries(SIDES.map((id, i) => [id, COLORS[i]]));
export function readColors(value) {
  return Object.fromEntries(
    SIDES.map((id, i) => [
      id,
      PAINTS.some((c) => c.value === value?.[id]) ? value[id] : COLORS[i],
    ]),
  );
}
export function readSeats(value, roster) {
  if (
    !value ||
    !SIDES.every(
      (id) => value[id] === null || roster.some((r) => r.id === value[id]),
    )
  )
    throw Error('选手登记已变化，请重新挑选。');
  const picked = SIDES.map((id) => value[id]).filter(Boolean);
  if (new Set(picked).size !== picked.length)
    throw Error('同一份坦克程序只能入场一次。');
  return Object.fromEntries(SIDES.map((id) => [id, value[id]]));
}
export function validateDraft(config) {
  return validateStage(config.stage, occupied(config));
}
export function vacantSpawn(config, side) {
  const origin = config.stage.spawns[side] || BRAWL_SPAWNS[side];
  const cells = [];
  for (let y = 0; y < 25; y++)
    for (let x = 0; x < 25; x++) cells.push({ x, y, dir: origin.dir });
  cells.sort(
    (a, b) =>
      Math.abs(a.x - origin.x) +
      Math.abs(a.y - origin.y) -
      (Math.abs(b.x - origin.x) + Math.abs(b.y - origin.y)),
  );
  for (const p of cells) {
    try {
      validateStage(
        { ...config.stage, spawns: { ...config.stage.spawns, [side]: p } },
        [...new Set([...occupied(config), side])],
      );
      return p;
    } catch {}
  }
  return null;
}
export function setSeatColor(config, side, color) {
  if (!PAINTS.some((p) => p.value === color)) return;
  const other = SIDES.find((id) => id !== side && config.colors[id] === color);
  if (other) config.colors[other] = config.colors[side];
  config.colors[side] = color;
}
