import { MOVE_TO_DIR } from './constants.js';
import { INTENTS } from './showcase.js';

const MOVES = new Set(['up', 'down', 'left', 'right', 'stay']);

export function normalizeAction(action) {
  if (!action || typeof action !== 'object') {
    return { move: 'stay', fire: false };
  }
  const move = MOVES.has(action.move) ? action.move : 'stay';
  const fire = typeof action.fire === 'boolean' ? action.fire : false;
  return { move, fire, ...(INTENTS.includes(action.intent)?{intent:action.intent}:{}) };
}

export function dirFromMove(move) {
  if (move === 'stay') return -1;
  const dir = MOVE_TO_DIR[move];
  return dir === undefined ? -1 : dir;
}

// 同一拍里多种结局同时出现时的优先级。
export function judgeEnd(baseHits, livesA, livesB) {
  if (baseHits.A && baseHits.B) return { result: 'draw', reason: 'base' };
  if (baseHits.A) return { result: 'B', reason: 'base' };
  if (baseHits.B) return { result: 'A', reason: 'base' };
  if (livesA <= 0 && livesB <= 0) return { result: 'draw', reason: 'lives' };
  if (livesA <= 0) return { result: 'B', reason: 'lives' };
  if (livesB <= 0) return { result: 'A', reason: 'lives' };
  return null;
}

export function judgeLives(livesA, livesB) {
  if (livesA > livesB) return { result: 'A', reason: 'ticks' };
  if (livesB > livesA) return { result: 'B', reason: 'ticks' };
  return { result: 'draw', reason: 'ticks' };
}
