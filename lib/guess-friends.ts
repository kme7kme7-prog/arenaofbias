import { apiFetch } from '@/lib/api';
import type {
  AttributeKey,
  Feedback,
  GuessDifficulty,
} from '@/lib/guess-logic';
import type { GuessApiModel } from '@/lib/guess';

export type FriendGuess = {
  attributes: Record<AttributeKey, Feedback>;
  won: boolean;
  model?: GuessApiModel;
};
export type FriendPlayer = {
  seat: number;
  name: string;
  ready: boolean;
  score: number;
  connected: boolean;
  reconnectUntil: number;
  left: boolean;
  guesses: FriendGuess[];
};
export type FriendRoom = {
  code: string;
  version: number;
  self: number;
  difficulty: GuessDifficulty;
  status:
    | 'waiting'
    | 'starting'
    | 'playing'
    | 'round_over'
    | 'finished'
    | 'closed';
  round: number;
  roundEndsAt: number | null;
  nextAt: number | null;
  serverNow: number;
  expiresAt: number;
  players: [FriendPlayer, FriendPlayer | null];
  rules: {
    attempts: number;
    roundMs: number;
    graceMs: number;
    wins: number;
    intermissionMs: number;
  };
  result: {
    winner: number | null;
    reason: string;
    matchWinner: number | null;
  } | null;
  answer: GuessApiModel | null;
};
export class FriendRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function friendRequest<T>(
  path: string,
  body?: object,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 12000);
  try {
    const response = await apiFetch(`/api/guess/friends/${path}`, {
      signal: controller.signal,
      ...(body
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw new FriendRequestError(
        result.error || '好友房暂时无法连接，请稍后再试。',
        response.status,
      );
    return result as T;
  } catch (error) {
    if (error instanceof FriendRequestError) throw error;
    throw new FriendRequestError(
      '连接暂时失败，对局进度保存在服务器，请重试。',
      0,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
