// Only the guessing game needs its model catalog and clue order. Keeping its
// share query here prevents the global share button from loading that game.
import type { GuessSession } from './guess';
import { ATTRIBUTE_KEYS } from './guess-logic';

export function guessShareQuery(session: GuessSession, day: string, won: boolean) {
  const states = { hit: 'h', near: 'n', miss: 'm', unknown: 'u' };
  const grid = session.guesses.map(row => ATTRIBUTE_KEYS.map(key => states[row.attributes[key].state]).join('')).join('.');
  const answer = session.answer?.name ?? session.guesses.find(row => row.won)?.guess.name;
  return new URLSearchParams({ type: 'guess', day, won: won ? '1' : '0', grid, ...(answer ? { answer } : {}) }).toString();
}
