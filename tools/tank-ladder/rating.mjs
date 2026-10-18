import { rate, ordinal } from 'openskill';
export const skill = r => Math.round(1000 + 40 * ordinal(r));
export function updateRatings(players, ranks) {
  if (players.length !== 4 || ranks.length !== 4 || ranks.some(r => !Number.isInteger(r) || r < 1 || r > 4)) throw Error('Invalid four-player ranking');
  return rate(players.map(p => [{ mu: p.mu, sigma: p.sigma }]), { rank: ranks, tau: 0 }).map(r => r[0]);
}
