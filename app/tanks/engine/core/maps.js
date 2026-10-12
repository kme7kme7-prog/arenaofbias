import {
  BASE_A_X, BASE_A_Y, BASE_B_X, BASE_B_Y, GRID,
  SPAWN_A_X, SPAWN_A_Y, SPAWN_B_X, SPAWN_B_Y, TANK_SIZE,
} from './constants.js';

export const MAP_IDS = ['m1', 'm2', 'm3'];
export const MAP_INFO = [
  { id: 'm1', name: '断墙街区', desc: '三条进攻路线，砖墙切断长射线。绕过中央掩体，从侧翼进入基地后方。' },
  { id: 'm2', name: '三桥争夺', desc: '河道把战场分层，三座宽桥连接两岸。桥头草丛适合伏击，过河前先观察弹道。' },
  { id: 'm3', name: '折线要塞', desc: '错位钢墙形成折线通道。可破坏的侧门提供捷径，绕行与拦截同样重要。' },
];

// 每个矩形连同其旋转副本一起绘制；通道按 2×2 坦克而非单格寻路设计。
function mirroredRect(map, x, y, w, h, terrain) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const px = x + dx, py = y + dy;
    map[py][px] = terrain;
    map[GRID - 1 - py][GRID - 1 - px] = terrain;
  }
}

export function assertRotationalSymmetry(grid, mapId) {
  if (grid.length !== GRID || grid.some(row => row.length !== GRID)) throw new Error(`地图 ${mapId} 尺寸错误`);
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (grid[y][x] !== grid[GRID - 1 - y][GRID - 1 - x]) throw new Error(`地图 ${mapId} 不对称: (${x},${y})`);
  }
}

export function loadMap(mapId) {
  if (!MAP_IDS.includes(mapId)) throw new Error(`未知地图 ${mapId}`);
  const map = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  const rect = (x, y, w, h, t) => mirroredRect(map, x, y, w, h, t);
  // 基地正面防远射，左右保留两条无须拆墙的进出路线。
  rect(10, 5, 6, 2, 2);
  rect(10, 0, 2, 2, 1);
  rect(14, 0, 2, 2, 1);
  // 外侧钢翼切断地图边缘的横向狙击线；进攻者须进入近距防守雷达区。
  rect(8, 0, 2, 2, 2);
  rect(16, 0, 2, 2, 2);
  rect(4, 3, 3, 2, 4);
  rect(19, 3, 3, 2, 4);
  if (mapId === 'm1') {
    rect(3, 8, 5, 2, 2);
    rect(18, 8, 5, 2, 2);
    rect(11, 10, 4, 2, 1);
    rect(3, 12, 4, 1, 4);
    rect(8, 5, 2, 2, 1);
    rect(16, 5, 2, 2, 1);
    rect(0, 6, 2, 2, 1);
  } else if (mapId === 'm2') {
    rect(0, 10, 26, 2, 3);
    for (const x of [3, 11, 19]) rect(x, 10, 4, 2, 0);
    rect(3, 8, 4, 2, 4);
    rect(19, 12, 4, 1, 4);
    rect(11, 8, 4, 1, 1);
    rect(7, 6, 2, 2, 2);
    rect(17, 6, 2, 2, 2);
    rect(8, 12, 2, 1, 1);
  } else {
    rect(3, 7, 7, 2, 2);
    rect(16, 7, 7, 2, 2);
    rect(7, 11, 5, 2, 2);
    rect(14, 11, 5, 2, 2);
    rect(3, 11, 2, 2, 1);
    rect(21, 11, 2, 2, 1);
    rect(11, 8, 4, 2, 4);
    rect(1, 3, 2, 2, 1);
  }
  for (const [x,y] of [[BASE_A_X,BASE_A_Y],[BASE_B_X,BASE_B_Y], [SPAWN_A_X,SPAWN_A_Y],[SPAWN_B_X,SPAWN_B_Y]]) {
    for (let dy=0;dy<TANK_SIZE;dy++) for(let dx=0;dx<TANK_SIZE;dx++) {
      if (map[y+dy][x+dx] !== 0) throw new Error(`地图 ${mapId} 的出生点或基地被遮挡`);
    }
  }
  rect(BASE_B_X, BASE_B_Y, TANK_SIZE, TANK_SIZE, 5);
  assertRotationalSymmetry(map, mapId);
  return map;
}

export function cloneMap(map) { return map.map(row => row.slice()); }
