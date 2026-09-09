// 投票数据层：竞技场的「直觉投票」落库（真实模式 → 服务端 votes 表）。
// 与 lib/comments.ts 同构：前端校验镜像 + 提交/拉取；服务端规则见 server/index.js。
// 占位模式的投票不经过本文件，走 lib/placeholder.ts 的本地占位投票。

import { prompts } from '@/lib/arena';

/** 投票发生的模式：blind 认真盲测 / party 娱乐站队（当前都计分，见决策 018） */
export type ArenaMode = 'blind' | 'party';

/** 一票 = 一次对局选择；rid 是作品 id（ModelResult.id），mid 是模型 id（决策 019） */
export type ArenaVote = {
  id: string;
  promptId: string;
  winnerRid: string;
  winnerMid: string;
  loserRid: string;
  loserMid: string;
  mode: ArenaMode;
  ts: number;
};

export type ArenaVoteDraft = Omit<ArenaVote, 'ts'>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// 题号白名单由题库派生；服务端 server/index.js 手写镜像，新增题目时两处同步
const ALLOWED_PROMPTS = new Set(prompts.map((prompt) => prompt.id));

export function validateVote(value: unknown): ArenaVoteDraft | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    !UUID_PATTERN.test(candidate.id)
  )
    return null;
  if (
    typeof candidate.promptId !== 'string' ||
    !ALLOWED_PROMPTS.has(candidate.promptId)
  )
    return null;
  for (const field of [
    'winnerRid',
    'winnerMid',
    'loserRid',
    'loserMid',
  ] as const) {
    const value = candidate[field];
    if (typeof value !== 'string' || !value.trim() || value.length > 64)
      return null;
  }
  if (candidate.winnerRid === candidate.loserRid) return null;
  if (candidate.winnerMid === candidate.loserMid) return null;
  if (candidate.mode !== 'blind' && candidate.mode !== 'party') return null;
  return {
    id: candidate.id as string,
    promptId: candidate.promptId as string,
    winnerRid: candidate.winnerRid as string,
    winnerMid: candidate.winnerMid as string,
    loserRid: candidate.loserRid as string,
    loserMid: candidate.loserMid as string,
    mode: candidate.mode as ArenaMode,
  };
}

/** 对局去重键：两份作品 id 与胜负无关的排序拼接（与服务端同一口径） */
export function pairKeyOf(ridA: string, ridB: string): string {
  return [ridA, ridB].sort().join('+');
}

export type VoteIssue = 'auth' | 'dup' | 'offline';

export type SubmitResult =
  | { ok: true }
  | { ok: false; issue: VoteIssue; error: string };

export async function submitVote(vote: ArenaVoteDraft): Promise<SubmitResult> {
  try {
    const response = await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vote),
    });
    if (response.ok) return { ok: true };
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (response.status === 401)
      return { ok: false, issue: 'auth', error: '登录后，你的选择会计入偏好榜。' };
    if (response.status === 409)
      return {
        ok: false,
        issue: 'dup',
        error: data.error ?? '这一对作品你已经投过票了。',
      };
    return {
      ok: false,
      issue: 'offline',
      error: data.error ?? '暂时没有记上这一票。',
    };
  } catch {
    return {
      ok: false,
      issue: 'offline',
      error: '暂时无法连接，这一票没有记上。',
    };
  }
}

/** 拉全量投票流水；失败返回 null（调用方区分「无票」与「加载失败」） */
export async function fetchVotes(): Promise<ArenaVote[] | null> {
  try {
    const response = await fetch('/api/votes');
    if (!response.ok) return null;
    const data = (await response.json()) as { votes?: unknown };
    if (!Array.isArray(data.votes)) return null;
    return data.votes.filter(
      (vote): vote is ArenaVote =>
        !!vote &&
        typeof vote === 'object' &&
        typeof vote.ts === 'number' &&
        validateVote(vote) !== null,
    );
  } catch {
    return null;
  }
}

/** 服务端流水 → 榜单聚合记录（模型层面，与占位投票同构） */
export function voteToRecord(vote: ArenaVote): {
  promptId: string;
  winnerId: string;
  loserId: string;
  ts: number;
} {
  return {
    promptId: vote.promptId,
    winnerId: vote.winnerMid,
    loserId: vote.loserMid,
    ts: vote.ts,
  };
}
