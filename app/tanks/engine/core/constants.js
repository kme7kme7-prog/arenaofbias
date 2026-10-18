// 玩法数值的唯一出处。坐标也集中在这里，避免各处各写一遍。

export const GRID = 26;
export const TANK_SIZE = 2;
export const TANK_SPEED = 1;
export const BULLET_SPEED = 3;
export const FIRE_COOLDOWN = 8;
export const MAX_BULLETS = 1;
export const SELF_IMMUNE_TICKS = 3;
export const LIVES = 5;
export const BASE_HP = 5;
export const BASE_SHIELD_TICKS = 12;
export const BASE_RADAR_RANGE = 5;
export const RESPAWN_TICKS = 40;
export const INVINCIBLE_TICKS = 16;
export const TOTAL_TICKS = 1800;
export const RADAR_RANGE = 6;
export const BOT_BUDGET_MS = 50;
export const BOT_WATCHDOG_MS = 1000;
export const BOT_STARTUP_MS = 3000;
export const ENGINE_VERSION = '2.3.0';
export const MAX_BOT_BYTES = 65536;

export const TERRAIN_EMPTY = 0;
export const TERRAIN_BRICK = 1;
export const TERRAIN_STEEL = 2;
export const TERRAIN_RIVER = 3;
export const TERRAIN_GRASS = 4;
export const TERRAIN_BASE = 5;

export const DIR_UP = 0;
export const DIR_RIGHT = 1;
export const DIR_DOWN = 2;
export const DIR_LEFT = 3;

// 下标即方向编码：上、右、下、左。
export const DIR_DELTA = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export const MOVE_TO_DIR = {
  up: DIR_UP,
  right: DIR_RIGHT,
  down: DIR_DOWN,
  left: DIR_LEFT,
};

export const BASE_A_X = 12;
export const BASE_A_Y = 24;
export const BASE_B_X = 12;
export const BASE_B_Y = 0;
export const SPAWN_A_X = 12;
export const SPAWN_A_Y = 22;
export const SPAWN_B_X = 12;
export const SPAWN_B_Y = 2;
