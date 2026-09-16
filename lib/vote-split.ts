import type { ArenaVote } from './votes';

export type VoteSplit = { left: number; right: number; draw: number };

/** Match by work IDs, never by historical A/B position or model totals. */
export function summarizePairVotes(
  votes: readonly ArenaVote[],
  promptId: string,
  leftRid: string,
  rightRid: string,
): VoteSplit {
  const counts: VoteSplit = { left: 0, right: 0, draw: 0 };
  const seen = new Set<string>();
  for (const vote of votes) {
    if (vote.promptId !== promptId || seen.has(vote.id)) continue;
    if (
      !(
        (vote.winnerRid === leftRid && vote.loserRid === rightRid) ||
        (vote.winnerRid === rightRid && vote.loserRid === leftRid)
      )
    )
      continue;
    seen.add(vote.id);
    if (vote.outcome === 'draw') counts.draw += 1;
    else if (vote.winnerRid === leftRid) counts.left += 1;
    else counts.right += 1;
  }
  return counts;
}
