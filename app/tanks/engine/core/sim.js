import {
  BASE_A_X,
  BASE_A_Y,
  BASE_B_X,
  BASE_B_Y,
  BASE_HP,
  BASE_SHIELD_TICKS,
  BULLET_SPEED,
  DIR_DELTA,
  DIR_DOWN,
  DIR_LEFT,
  DIR_RIGHT,
  DIR_UP,
  FIRE_COOLDOWN,
  GRID,
  INVINCIBLE_TICKS,
  LIVES,
  MAX_BULLETS,
  RESPAWN_TICKS,
  SELF_IMMUNE_TICKS,
  SPAWN_A_X,
  SPAWN_A_Y,
  SPAWN_B_X,
  SPAWN_B_Y,
  TANK_SIZE,
  TANK_SPEED,
  TERRAIN_BASE,
  TERRAIN_BRICK,
  TERRAIN_EMPTY,
  TERRAIN_GRASS,
  TERRAIN_RIVER,
  TERRAIN_STEEL,
  TOTAL_TICKS,
  ENGINE_VERSION,
} from './constants.js';
import { dirFromMove, judgeEnd, judgeLives, normalizeAction } from './judge.js';
import { cloneMap, loadMap } from './maps.js';
import { createPrng } from './prng.js';
import { buildBaseRadar, buildRadar } from './radar.js';
import { SHOWCASE_VERSION, SHOWCASE_RULES, createShowcase, arenaInfo, beginShowcaseTick, collectSupply, judgeShowcaseTime } from './showcase.js';

const SIDES = ['A', 'B'];

const SPAWN = {
  A: { x: SPAWN_A_X, y: SPAWN_A_Y, dir: DIR_UP },
  B: { x: SPAWN_B_X, y: SPAWN_B_Y, dir: DIR_DOWN },
};

const BASE = {
  A: { x: BASE_A_X, y: BASE_A_Y },
  B: { x: BASE_B_X, y: BASE_B_Y },
};

function otherSide(side) {
  return side === 'A' ? 'B' : 'A';
}

function makeTank(side) {
  const spawn = SPAWN[side];
  return {
    x: spawn.x,
    y: spawn.y,
    dir: spawn.dir,
    lives: LIVES,
    respawnTicks: 0,
    invincibleTicks: 0,
    fireCooldown: 0,
    onField: 1,
    hitThisTick: 0,
  };
}

export function createBattle(mapId, mode = 'classic') {
  if(!['classic','showcase'].includes(mode)) throw new Error(`未知玩法：${mode}`);
  const state = {
    tick: 0,
    mapId,
    map: loadMap(mapId),
    tanks: { A: makeTank('A'), B: makeTank('B') },
    bases: Object.fromEntries(SIDES.map(side => [side, {
      ...BASE[side], hp: BASE_HP, maxHp: BASE_HP, shieldTicks: 0, lastHitTick: -1, alert: false,
    }])),
    bullets: [],
  };
  if(mode==='showcase') {
    state.showcase=createShowcase(state.map);
    for(const tank of Object.values(state.tanks)) Object.assign(tank,{
      hp:SHOWCASE_RULES.tankHp,maxHp:SHOWCASE_RULES.tankHp,hurtTicks:0,rapidTicks:0,intent:'unknown',
    });
  }
  return state;
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < GRID && y < GRID;
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

function rectsOverlap(a, b) {
  return a.x < b.x + TANK_SIZE
    && a.x + TANK_SIZE > b.x
    && a.y < b.y + TANK_SIZE
    && a.y + TANK_SIZE > b.y;
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
    if (!inBounds(x, y)) return;
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
  if (!inBounds(muzzle.x, muzzle.y)) {
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
  if (!inBounds(x, y)) return 0;
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
      if (!inBounds(nx, ny)) {
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

function findRespawn(state, side) {
  const spawn = SPAWN[side];
  const foe = state.tanks[otherSide(side)];
  const rotation = side === 'A' ? 1 : -1;
  // 原位优先，再按曼哈顿距离选择四格内的空位；换边时搜索顺序也旋转。
  for (let radius = 0; radius <= 4; radius++) for (let dy = -radius; dy <= radius; dy++) {
    const width = radius - Math.abs(dy);
    for (const dx of width ? [-width, width] : [0]) {
      const candidate = { x: spawn.x + dx * rotation, y: spawn.y + dy * rotation, dir: spawn.dir };
      if (foe.onField === 1 && rectsOverlap(candidate, foe)) continue;
      let legal = true;
      for (let y = candidate.y; y < candidate.y + TANK_SIZE; y++) for (let x = candidate.x; x < candidate.x + TANK_SIZE; x++) {
        if (!inBounds(x,y) || terrainBlocksTank(state.map[y][x])) legal = false;
      }
      if (legal) return candidate;
    }
  }
  return null;
}

function resolveTimers(state, events) {
  for (let i = 0; i < SIDES.length; i += 1) {
    const side = SIDES[i];
    const tank = state.tanks[side];
    if (tank.hitThisTick === 1) {
      tank.hitThisTick = 0;
      if (tank.lives > 0) {
        tank.respawnTicks = state.showcase ? SHOWCASE_RULES.respawnTicks : RESPAWN_TICKS;
        tank.onField = 0;
      }
      continue;
    }
    if (tank.respawnTicks > 0) {
      tank.respawnTicks -= 1;
      if (tank.respawnTicks === 0) {
        const spawn = findRespawn(state, side);
        if (!spawn) {
          tank.respawnTicks = 1;
        } else {
          tank.x = spawn.x;
          tank.y = spawn.y;
          tank.dir = spawn.dir;
          tank.onField = 1;
          tank.invincibleTicks = INVINCIBLE_TICKS;
          if(state.showcase) { tank.hp=tank.maxHp; tank.hurtTicks=0; tank.rapidTicks=0; tank.intent='advance'; }
          const relocated = spawn.x !== SPAWN[side].x || spawn.y !== SPAWN[side].y;
          events.push(event(state.tick, 'respawn', side, spawn.x, spawn.y, `${side} ${relocated ? '出生点被占，在附近空位' : ''}复活`));
        }
      }
    } else if (tank.onField === 1 && tank.invincibleTicks > 0) {
      tank.invincibleTicks -= 1;
    }
  }
}

function copyTank(tank) {
  return {
    x: tank.x,
    y: tank.y,
    dir: tank.dir,
    lives: tank.lives,
    respawnTicks: tank.respawnTicks,
    invincibleTicks: tank.invincibleTicks,
    fireCooldown: tank.fireCooldown,
    onField: tank.onField,
    ...(tank.hp===undefined?{}:{hp:tank.hp,maxHp:tank.maxHp,hurtTicks:tank.hurtTicks,rapidTicks:tank.rapidTicks,intent:tank.intent}),
  };
}

function copyBullets(bullets) {
  const out = [];
  for (let i = 0; i < bullets.length; i += 1) {
    const b = bullets[i];
    out.push({ x: b.x, y: b.y, dir: b.dir, owner: b.owner });
  }
  return out;
}

export function snapshot(state, brickBreaks, traces) {
  return {
    tick: state.tick,
    map: cloneMap(state.map),
    tanks: { A: copyTank(state.tanks.A), B: copyTank(state.tanks.B) },
    bases: { A: { ...state.bases.A }, B: { ...state.bases.B } },
    bullets: copyBullets(state.bullets),
    brickBreaks: brickBreaks || [],
    traces: traces || [],
    ...(state.showcase?{arena:arenaInfo(state)}:{}),
  };
}

function viewOrigin(tank, side) {
  if (tank.onField === 1) return { x: tank.x, y: tank.y };
  return { x: SPAWN[side].x, y: SPAWN[side].y };
}

export function buildPlayerState(state, side) {
  const self = state.tanks[side];
  const enemy = state.tanks[otherSide(side)];
  const origin = viewOrigin(self, side);
  const arena=arenaInfo(state);
  const radar = buildRadar(state.map, origin, enemy, state.bullets, arena?.radarPulse);
  const baseRadar=buildBaseRadar(state.bases[side],enemy,state.bullets);
  if(state.showcase) for(const contact of [...radar.tanks,...baseRadar.tanks])
    Object.assign(contact,{hp:enemy.hp,maxHp:enemy.maxHp,hurtTicks:enemy.hurtTicks,rapidTicks:enemy.rapidTicks});
  return {
    tick: state.tick,
    mapId: state.mapId,
    random: createPrng((state.seed || 0) ^ Math.imul(state.tick + 1, 0x9e3779b9) ^ (side === 'A' ? 0x12345678 : 0x87654321)).next(),
    map: cloneMap(state.map),
    self: {
      x: origin.x,
      y: origin.y,
      dir: self.dir,
      lives: self.lives,
      respawnTicks: self.respawnTicks,
      invincibleTicks: self.invincibleTicks,
      fireCooldown: self.fireCooldown,
      ...(state.showcase?{hp:self.hp,maxHp:self.maxHp,hurtTicks:self.hurtTicks,rapidTicks:self.rapidTicks}:{}),
    },
    enemy: {
      lives: enemy.lives,
      respawnTicks: enemy.respawnTicks,
    },
    base: { ...state.bases[side], ...(state.showcase?{lockTicks:Math.max(0,SHOWCASE_RULES.baseOpenTick-state.tick)}:{}) },
    // 对方基地耐久公开，但防守雷达警报只给所属方。
    enemyBase: { x: state.bases[otherSide(side)].x, y: state.bases[otherSide(side)].y,
      hp: state.bases[otherSide(side)].hp, maxHp: BASE_HP,
      shieldTicks: state.bases[otherSide(side)].shieldTicks, lastHitTick: state.bases[otherSide(side)].lastHitTick,
      ...(state.showcase?{lockTicks:Math.max(0,SHOWCASE_RULES.baseOpenTick-state.tick)}:{}) },
    radar,
    baseRadar,
    ...(arena?{arena}:{}),
  };
}

export function stepTick(state, actionA, actionB) {
  const events = [];
  beginShowcaseTick(state,events);
  if(state.showcase) {
    state.tanks.A.intent=actionA.intent||'unknown';
    state.tanks.B.intent=actionB.intent||'unknown';
  }
  for (const side of SIDES) {
    if (state.bases[side].shieldTicks > 0) state.bases[side].shieldTicks -= 1;
  }
  applyFire(state, 'A', actionA.fire, events);
  applyFire(state, 'B', actionB.fire, events);
  applyMove(state, 'A', actionA.move);
  applyMove(state, 'B', actionB.move);
  const bullet = runBulletPhase(state);
  // 返回给下一拍 bot 的冷却值就是实际需要等待的拍数。
  for (const side of SIDES) {
    if (state.tanks[side].fireCooldown > 0) state.tanks[side].fireCooldown -= 1;
  }
  for (let i = 0; i < bullet.events.length; i += 1) events.push(bullet.events[i]);
  const end = judgeEnd(bullet.baseHits, state.tanks.A.lives, state.tanks.B.lives);
  if (!end) resolveTimers(state, events);
  else {
    state.tanks.A.hitThisTick = 0;
    state.tanks.B.hitThisTick = 0;
  }
  for (const side of SIDES) {
    const base = state.bases[side];
    const alert = base.hp > 0 && buildBaseRadar(base, state.tanks[otherSide(side)], []).tanks.length > 0;
    if (alert && !base.alert) events.push(event(state.tick, 'baseAlert', side, base.x, base.y, `${side} 基地雷达发现敌方坦克`));
    base.alert = alert;
  }
  if(!end)collectSupply(state,events);
  const frame = snapshot(state, bullet.brickBreaks, bullet.traces);
  return { events, frame, end };
}

function endText(result, reason) {
  const winner = result === 'draw' ? '平局' : `${result} 获胜`;
  const why = {
    base: '基地被毁',
    lives: '命耗尽',
    timeout: '超时',
    error: '异常',
    ticks: '回合时间结束',
  }[reason];
  return `${winner}（${why}）`;
}

function failCode(err) {
  return err && err.code === 'timeout' ? 'timeout' : 'error';
}

function pack(state, result, reason, frames, events, mapId, seed, swap) {
  return {
    result,
    reason,
    frames,
    events,
    meta: {
      engineVersion: state.showcase ? SHOWCASE_VERSION : ENGINE_VERSION,
      initialLives: LIVES,
      initialBaseHp: BASE_HP,
      mapId,
      seed,
      tickEnd: frames.length,
      swap,
      ...(state.showcase?{mode:'showcase',tankHp:SHOWCASE_RULES.tankHp,totalTicks:SHOWCASE_RULES.totalTicks}:{}),
    },
  };
}

async function disposeAdapter(adapter) {
  if (adapter && typeof adapter.dispose === 'function') {
    await adapter.dispose();
  }
}

export async function runMatch({ mapId, seed, botASrc, botBSrc, adapterFactory, signal, mode = 'classic' }) {
  const seedNum = seed >>> 0;
  const prng = createPrng(seedNum);
  const swap = prng.next() & 1;
  const srcA = swap ? botBSrc : botASrc;
  const srcB = swap ? botASrc : botBSrc;
  const state = createBattle(mapId,mode);
  state.seed = seedNum;
  const frames = [];
  const events = [];
  let adapterA = null;
  let adapterB = null;
  const checkCancelled = () => {
    if (signal && signal.aborted) throw Object.assign(new Error('对局已取消'), { code: 'cancelled' });
  };
  const abort = () => { adapterA?.dispose(); adapterB?.dispose(); };
  signal?.addEventListener('abort', abort, { once: true });

  try {
    checkCancelled();
    try {
      adapterA = await adapterFactory(srcA);
    } catch (err) {
      checkCancelled();
      frames.push(snapshot(state, [], []));
      const reason = failCode(err);
      events.push(event(state.tick, reason, 'A', -1, -1, `A 的 bot 无法装载: ${String(err.message || err).slice(0, 240)}`));
      events.push(event(state.tick, 'end', 'B', -1, -1, endText('B', reason)));
      return pack(state, 'B', reason, frames, events, mapId, seedNum, swap);
    }
    try {
      adapterB = await adapterFactory(srcB);
    } catch (err) {
      checkCancelled();
      frames.push(snapshot(state, [], []));
      const reason = failCode(err);
      events.push(event(state.tick, reason, 'B', -1, -1, `B 的 bot 无法装载: ${String(err.message || err).slice(0, 240)}`));
      events.push(event(state.tick, 'end', 'A', -1, -1, endText('A', reason)));
      return pack(state, 'A', reason, frames, events, mapId, seedNum, swap);
    }

    let result = '';
    let reason = '';
    while (state.tick < (state.showcase?SHOWCASE_RULES.totalTicks:TOTAL_TICKS) && !result) {
      checkCancelled();
      let actionA;
      try {
        actionA = normalizeAction(await adapterA.decide(buildPlayerState(state, 'A')));
      } catch (err) {
        checkCancelled();
        reason = failCode(err);
        result = 'B';
        const kind = reason === 'timeout' ? 'timeout' : 'error';
        events.push(event(state.tick, kind, 'A', -1, -1, `A ${reason === 'timeout' ? '超时' : '异常'}判负：${String(err.message || err).slice(0, 240)}`));
        events.push(event(state.tick, 'end', 'B', -1, -1, endText('B', reason)));
        frames.push(snapshot(state, [], []));
        break;
      }
      let actionB;
      try {
        actionB = normalizeAction(await adapterB.decide(buildPlayerState(state, 'B')));
      } catch (err) {
        checkCancelled();
        reason = failCode(err);
        result = 'A';
        const kind = reason === 'timeout' ? 'timeout' : 'error';
        events.push(event(state.tick, kind, 'B', -1, -1, `B ${reason === 'timeout' ? '超时' : '异常'}判负：${String(err.message || err).slice(0, 240)}`));
        events.push(event(state.tick, 'end', 'A', -1, -1, endText('A', reason)));
        frames.push(snapshot(state, [], []));
        break;
      }
      const stepped = stepTick(state, actionA, actionB);
      for (let i = 0; i < stepped.events.length; i += 1) events.push(stepped.events[i]);
      frames.push(stepped.frame);
      if (stepped.end) {
        result = stepped.end.result;
        reason = stepped.end.reason;
        events.push(event(state.tick, 'end', result === 'draw' ? '' : result, -1, -1, endText(result, reason)));
        break;
      }
      state.tick += 1;
    }
    if (!result) {
      const timed = state.showcase?judgeShowcaseTime(state):judgeLives(state.tanks.A.lives, state.tanks.B.lives);
      result = timed.result;
      reason = timed.reason;
      events.push(event(Math.max(0, state.tick - 1), 'end', result === 'draw' ? '' : result, -1, -1, endText(result, reason)));
    }
    return pack(state, result, reason, frames, events, mapId, seedNum, swap);
  } finally {
    signal?.removeEventListener('abort', abort);
    await disposeAdapter(adapterA);
    await disposeAdapter(adapterB);
  }
}
