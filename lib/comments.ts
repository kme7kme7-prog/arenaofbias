export type ArenaComment = {
  username?: string | null;
  id: string;
  roundId: string;
  side: 'a' | 'b';
  body: string;
  createdAt: number;
};
export function validateComment(
  value: unknown,
): { id: string; roundId: string; side: 'a' | 'b'; body: string } | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate.id,
    )
  )
    return null;
  if (
    typeof candidate.roundId !== 'string' ||
    !['001', '002', '003', '004', '005', '006', '007'].includes(
      candidate.roundId,
    )
  )
    return null;
  if (candidate.side !== 'a' && candidate.side !== 'b') return null;
  if (
    typeof candidate.body !== 'string' ||
    !candidate.body.trim() ||
    candidate.body.trim().length > 280
  )
    return null;
  return {
    id: candidate.id,
    roundId: candidate.roundId,
    side: candidate.side,
    body: candidate.body.trim(),
  };
}
