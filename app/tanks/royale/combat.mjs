// Royale combat fork: preserves 2.6 projectile ordering and 2x2 tank geometry.
import { BASE_A_X, BASE_A_Y, BASE_B_X, BASE_B_Y, TANK_SIZE, TANK_SPEED, DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT, DIR_DELTA, TERRAIN_BRICK, TERRAIN_STEEL, TERRAIN_RIVER, TERRAIN_BASE, TERRAIN_EMPTY, TERRAIN_GRASS, MAX_BULLETS, FIRE_COOLDOWN, SELF_IMMUNE_TICKS, BULLET_SPEED, BASE_SHIELD_TICKS } from '../engine/core/constants.js';
import { dirFromMove } from '../engine/core/judge.js';
import { SHOWCASE_RULES } from '../engine/core/showcase.js';
function inBounds(state, x, y) {
  return x >= 0 && y >= 0 && x < state.map[0].length && y < state.map.length;
}

function baseOwner(x, y) {
  if (x >= BASE_A_X && x < BASE_A_X + TANK_SIZE && y >= BASE_A_Y && y < BASE_A_Y + TANK_SIZE) {
    return 'A';
  }
  if (x >= BASE_B_X && x < BASE_B_X + TANK_SIZE && y >= BASE_B_Y && y < BASE_B_Y + TANK_SIZE) {
    return 'B';
  }
  return '';
}

// 1×1 子弹取正面两格里坐标较小的那一格：上下走左列，左右走上排。
export function muzzleCell(tank) {
  if (tank.dir === DIR_UP) return { x: tank.x, y: tank.y - 1 };
  if (tank.dir === DIR_RIGHT) return { x: tank.x + TANK_SIZE, y: tank.y };
  if (tank.dir === DIR_DOWN) return { x: tank.x, y: tank.y + TANK_SIZE };
  return { x: tank.x - 1, y: tank.y };
}

function enteredCells(x, y, dir) {
  if (dir === DIR_UP) return [[x, y - TANK_SPEED], [x + 1, y - TANK_SPEED]];
  if (dir === DIR_DOWN) return [[x, y + TANK_SIZE], [x + 1, y + TANK_SIZE]];
  if (dir === DIR_LEFT) return [[x - TANK_SPEED, y], [x - TANK_SPEED, y + 1]];
  return [[x + TANK_SIZE, y], [x + TANK_SIZE, y + 1]];
}

function terrainBlocksTank(terrain) {
  return terrain === TERRAIN_BRICK
    || terrain === TERRAIN_STEEL
    || terrain === TERRAIN_RIVER
    || terrain === TERRAIN_BASE;
}

function tankCovers(tank, x, y) {
  return tank.onField === 1
    && x >= tank.x
    && x < tank.x + TANK_SIZE
    && y >= tank.y
    && y < tank.y + TANK_SIZE;
}

export function applyMove(state, side, move) {
  const tank = state.tanks[side];
  if (tank.onField !== 1) return;
  const dir = dirFromMove(move);
  if (dir < 0) return;
  tank.dir = dir;
  const foes = Object.entries(state.tanks).filter(([id])=>id!==side).map(([,t])=>t);
  const cells = enteredCells(tank.x, tank.y, dir);
  for (let i = 0; i < cells.length; i += 1) {
    const x = cells[i][0];
    const y = cells[i][1];
    if (!inBounds(state, x, y)) return;
    if (terrainBlocksTank(state.map[y][x])) return;
    if (foes.some(foe=>tankCovers(foe, x, y))) return;
  }
  tank.x += DIR_DELTA[dir][0] * TANK_SPEED;
  tank.y += DIR_DELTA[dir][1] * TANK_SPEED;
}

function countBullets(state, side) {
  let n = 0;
  for (let i = 0; i < state.bullets.length; i += 1) {
    if (state.bullets[i].owner === side && state.bullets[i].alive !== 0) n += 1;
  }
  return n;
}

function event(tick, kind, side, x, y, text) {
  return { tick, kind, side, x, y, text };
}

export function applyFire(state, side, fire, events) {
  const tank = state.tanks[side];
  if (tank.onField !== 1) return;
  if (fire !== true) return;
  if (tank.fireCooldown !== 0) return;
  const combat=state.combatRules||(state.showcase?SHOWCASE_RULES:null);
  if (countBullets(state, side) >= (combat ? combat.maxBullets : MAX_BULLETS)) return;
  // 复活保护用于脱身。实际开火前解除，双方这一拍的子弹都能正常命中。
  if (tank.invincibleTicks > 0) {
    tank.invincibleTicks = 0;
    events.push(event(state.tick, 'protectionEnd', side, tank.x, tank.y, `${side} 主动开火，复活保护解除`));
  }
  const muzzle = muzzleCell(tank);
  tank.fireCooldown = combat ? (tank.rapidTicks>0?combat.rapidCooldown:combat.fireCooldown) : FIRE_COOLDOWN;
  if (!inBounds(state, muzzle.x, muzzle.y)) {
    events.push(event(state.tick, 'fire', side, -1, -1, `${side} 开火（出界）`));
    return;
  }
  state.bullets.push({
    x: muzzle.x,
    y: muzzle.y,
    dir: tank.dir,
    owner: side,
    immune: SELF_IMMUNE_TICKS,
    alive: 1,
    trace: [],
  });
  events.push(event(state.tick, 'fire', side, muzzle.x, muzzle.y, `${side} 开火`));
}

function tankAt(state, x, y) {
  for (const side of Object.keys(state.tanks)) {
    if (tankCovers(state.tanks[side], x, y)) return side;
  }
  return '';
}

// 子弹留在这一格则返回 1。调用方负责在飞行步里改坐标。
function settleCell(state, bullet, x, y, brickBreaks, baseHits, events, checkBullets = true) {
  if (!inBounds(state, x, y)) return 0;
  const terrain = state.map[y][x];
  if (terrain === TERRAIN_STEEL) return 0;
  if (terrain === TERRAIN_BRICK) {
    state.map[y][x] = TERRAIN_EMPTY;
    brickBreaks.push({ x, y });
    events.push(event(state.tick, 'brick', '', x, y, `砖墙被摧毁 (${x},${y})`));
    return 0;
  }
  if (terrain === TERRAIN_BASE) {
    const owner = baseOwner(x, y);
    const base = state.bases[owner];
    if (base && base.hp > 0) {
      if(state.showcase && state.tick<SHOWCASE_RULES.baseOpenTick) {
        return 0;
      } else if (base.shieldTicks > 0) {
        events.push(event(state.tick, 'baseShield', owner, x, y, `${owner} 基地保护吸收炮弹`));
      } else {
        base.hp -= 1;
        base.lastHitTick = state.tick;
        base.shieldTicks = base.hp > 0 ? BASE_SHIELD_TICKS : 0;
        events.push(event(state.tick, 'baseHit', owner, x, y, `${owner} 基地受损，耐久 ${base.hp}/${base.maxHp}`));
        if (base.hp === 0) {
          baseHits[owner] = true;
          events.push(event(state.tick, 'base', owner, x, y, `${owner} 的基地被摧毁`));
        }
      }
    }
    return 0;
  }
  for (let i = 0; checkBullets && i < state.bullets.length; i += 1) {
    const other = state.bullets[i];
    if (other === bullet || other.alive === 0) continue;
    if (other.x === x && other.y === y) {
      other.alive = 0;
      events.push(event(state.tick, 'hit', '', x, y, `子弹对撞 (${x},${y})`));
      return 0;
    }
  }
  const victim = tankAt(state, x, y);
  if (victim) {
    const tank = state.tanks[victim];
    const ownImmune = victim === bullet.owner && bullet.immune > 0;
    if (ownImmune || tank.invincibleTicks > 0) return 1;
    if(state.showcase || state.combatRules) {
      if(tank.hurtTicks>0)return 0;
      if(tank.shield>0){tank.shield--;tank.hurtTicks=4;events.push(event(state.tick,'shieldHit',victim,x,y,`${victim} 护盾吸收一发炮弹`));return 0;}
      tank.hp=Math.max(0,tank.hp-1);
      tank.hurtTicks=(state.combatRules||SHOWCASE_RULES).hurtTicks;
      events.push(event(state.tick,'armorHit',victim,x,y,`${victim} 装甲受损，剩余 ${tank.hp}/${tank.maxHp}`));
      if(state.scores && victim!==bullet.owner) {
        const score=state.scores[bullet.owner];
        score.damage++;score.points++;
        if(tank.hp===0){
          score.kills++;score.points+=2;
          events.push({...event(state.tick,'frag',bullet.owner,x,y,`${bullet.owner} 击毁 ${victim}，+2 击毁分`),target:victim});
        }
      }
      if(tank.hp>0)return 0;
      tank.rapidTicks=0;
    }
    tank.lives -= 1;
    tank.onField = 0;
    tank.hitThisTick = 1;
    events.push(event(state.tick, 'hit', victim, x, y, `子弹命中 ${victim}`));
    events.push(event(state.tick, 'death', victim, x, y, `${victim} 被击毁，剩余 ${tank.lives} 命`));
    return 0;
  }
  if (terrain === TERRAIN_EMPTY || terrain === TERRAIN_RIVER || terrain === TERRAIN_GRASS) return 1;
  return 1;
}

export function runBulletPhase(state) {
  const events = [];
  const brickBreaks = [];
  const baseHits = { A: false, B: false };
  const list = state.bullets;
  for (let i = 0; i < list.length; i += 1) {
    const b = list[i];
    if (b.alive !== 0) b.alive = 1;
    b.immune = b.immune | 0;
    b.trace = [{ x: b.x, y: b.y }];
  }
  // 先结算当前所在格（贴脸炮、以及这一拍刚挪到子弹上的车），再飞 3 格。
  for (let i = 0; i < list.length; i += 1) {
    const b = list[i];
    if (b.alive === 0) continue;
    if (settleCell(state, b, b.x, b.y, brickBreaks, baseHits, events) === 0) b.alive = 0;
  }
  for (let step = 0; step < BULLET_SPEED; step += 1) {
    // 同一微步先计算所有落点，避免追着飞的子弹撞到尚未更新的旧坐标。
    const moving = list.filter(b => b.alive === 1).map(b => ({
      b, x: b.x + DIR_DELTA[b.dir][0], y: b.y + DIR_DELTA[b.dir][1],
    }));
    for (let i = 0; i < moving.length; i++) for (let j = i + 1; j < moving.length; j++) {
      const a = moving[i], b = moving[j];
      if ((a.x === b.x && a.y === b.y)
        || (a.x === b.b.x && a.y === b.b.y && b.x === a.b.x && b.y === a.b.y)) {
        a.b.alive = b.b.alive = 0;
        a.b.trace.push({ x: a.x, y: a.y });
        b.b.trace.push({ x: b.x, y: b.y });
        events.push(event(state.tick, 'hit', '', a.x, a.y, `子弹对撞 (${a.x},${a.y})`));
      }
    }
    for (let i = 0; i < list.length; i += 1) {
      const b = list[i];
      if (b.alive === 0) continue;
      const nx = b.x + DIR_DELTA[b.dir][0];
      const ny = b.y + DIR_DELTA[b.dir][1];
      if (!inBounds(state, nx, ny)) {
        b.alive = 0;
        continue;
      }
      b.trace.push({ x: nx, y: ny });
      if (settleCell(state, b, nx, ny, brickBreaks, baseHits, events, false) === 0) {
        b.alive = 0;
      } else {
        b.x = nx;
        b.y = ny;
      }
    }
  }
  for (let i = 0; i < list.length; i += 1) {
    const b = list[i];
    if (b.alive === 1 && b.immune > 0) b.immune -= 1;
  }
  const traces = [];
  for (let i = 0; i < list.length; i += 1) {
    traces.push({ owner: list[i].owner, dir: list[i].dir, cells: list[i].trace });
  }
  const kept = [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].alive === 1) kept.push(list[i]);
  }
  state.bullets = kept;
  return { events, brickBreaks, baseHits, traces };
}
