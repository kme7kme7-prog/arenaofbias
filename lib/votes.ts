// 投票数据层：竞技场的「直觉投票」落库（真实模式 → 服务端 votes 表）。
// 与 lib/comments.ts 同构：前端校验镜像 + 提交/拉取；服务端规则见 server/index.js。
// 占位模式的投票不经过本文件，走 lib/placeholder.ts 的本地占位投票。

import { apiFetch } from '@/lib/api';
import type { Mode } from '@/lib/arena';
import { currentPrompts } from '@/lib/prompts';

/** 正式与娱乐共用作品题库，评审数据按此范围独立。 */
export type EvaluationScope = 'entertainment' | 'formal';

/** 一票 = 一次对局选择；rid 是作品 id（ModelResult.id），mid 是模型 id（决策 021）。
 * outcome = draw 时（决策 048「无法抉择」平局票）winner/loser 四个字段只表示
 * 出场左右顺序（a 侧入 winner、b 侧入 loser），无胜负语义 */
export type ArenaVote = {
  id: string;
  promptId: string;
  winnerRid: string;
  winnerMid: string;
  loserRid: string;
  loserMid: string;
  mode: Mode;
  outcome: 'win' | 'draw';
  ts: number;
};

export type ArenaVoteDraft = Omit<ArenaVote, 'ts'>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 字段形态校验（不含题号白名单）：写入与读取共用一份字段规则 */
function voteShape(candidate: Record<string, unknown>): ArenaVoteDraft | null {
  if (typeof candidate.id !== 'string' || !UUID_PATTERN.test(candidate.id))
    return null;
  if (typeof candidate.promptId !== 'string' || !candidate.promptId)
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
  if (
    candidate.mode !== 'blind' &&
    candidate.mode !== 'party' &&
    candidate.mode !== 'formal'
  )
    return null;
  // outcome 缺省 win：旧客户端与早期流水行没有该字段（决策 048）
  if (
    candidate.outcome !== undefined &&
    candidate.outcome !== 'win' &&
    candidate.outcome !== 'draw'
  )
    return null;
  return {
    id: candidate.id as string,
    promptId: candidate.promptId as string,
    winnerRid: candidate.winnerRid as string,
    winnerMid: candidate.winnerMid as string,
    loserRid: candidate.loserRid as string,
    loserMid: candidate.loserMid as string,
    mode: candidate.mode as Mode,
    outcome: (candidate.outcome as 'win' | 'draw' | undefined) ?? 'win',
  };
}

export function validateVote(value: unknown): ArenaVoteDraft | null {
  if (!value || typeof value !== 'object') return null;
  const shape = voteShape(value as Record<string, unknown>);
  // 写入口径：题号白名单随当前生效题库派生（决策 045），服务端按 prompts 表核对。
  // 白名单只管写入——读取（fetchVotes）不按它过滤，下架题的历史票保留在榜单
  //（决策 045 ⑤，2026-09-12 用户再次确认）
  if (!shape || !currentPrompts().some((prompt) => prompt.id === shape.promptId))
    return null;
  return shape;
}

/** /api/votes 的流水行：ArenaVote 加服务端联表补充的展示快照——
 * 下架题/下架作品的历史票靠它们留在榜单（归类赛道、给历史模型一个名字） */
export type VoteFlowRow = ArenaVote & {
  /** 胜方作品当前的显示名（可能已被编辑过；作品行缺失时缺省） */
  winnerName?: string;
  loserName?: string;
  /** 题目当前类型（prompts 表含下架题——榜单赛道归类不依赖题库可见性） */
  promptKind?: 'image' | 'text' | 'web';
  /** 题目当前六维权重（决策 093——下架题的历史票仍按原权重重放） */
  promptWeights?: number[];
};

function parseVoteRow(row: unknown): VoteFlowRow | null {
  if (!row || typeof row !== 'object') return null;
  const candidate = row as Record<string, unknown>;
  const shape = voteShape(candidate);
  if (!shape || typeof candidate.ts !== 'number') return null;
  const parsed: VoteFlowRow = { ...shape, ts: candidate.ts };
  if (typeof candidate.winnerName === 'string' && candidate.winnerName)
    parsed.winnerName = candidate.winnerName;
  if (typeof candidate.loserName === 'string' && candidate.loserName)
    parsed.loserName = candidate.loserName;
  if (
    candidate.promptKind === 'image' ||
    candidate.promptKind === 'text' ||
    candidate.promptKind === 'web'
  )
    parsed.promptKind = candidate.promptKind;
  const weights = candidate.promptWeights;
  if (
    Array.isArray(weights) &&
    weights.length === 6 &&
    weights.every(
      (w) => typeof w === 'number' && Number.isFinite(w) && w >= 0 && w <= 1,
    )
  )
    parsed.promptWeights = weights;
  return parsed;
}

/**
 * 对局去重键：两份作品 id 与胜负无关的排序拼接。
 * 排序口径与服务端 pairKeyOf 一致（localeCompare）——当前 pair_key 只在服务端计算，
 * 但两边保持同口径，将来客户端预判去重时不会踩坑。
 */
export function pairKeyOf(ridA: string, ridB: string): string {
  return [ridA, ridB].sort((a, b) => a.localeCompare(b)).join('+');
}

export type VoteIssue = 'auth' | 'unbound' | 'dup' | 'offline';

export type SubmitResult =
  | { ok: true }
  | { ok: false; issue: VoteIssue; error: string };

export async function submitVote(vote: ArenaVoteDraft): Promise<SubmitResult> {
  // 提交超时（2026-09-20 审查修复）：POST 挂起（半开连接/代理劫持）时结果栏
  // 会永久停在「正在记录你的选择…」——加 8s 兜底，超时按未记上处理
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await apiFetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vote),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      counted?: boolean;
      reason?: string;
    };
    if (response.ok && data.counted === false && data.reason === 'unbound')
      return { ok: false, issue: 'unbound', error: '这一票未计入，绑定并验证邮箱后才能投票。' };
    if (response.ok) return { ok: true };
    if (response.status === 401)
      return { ok: false, issue: 'auth', error: '登录后，你的选择会计入偏好榜。' };
    if (response.status === 409) {
      // 服务端 409 有两种：pair = 同对局已投过；id = 投票编号冲突（可重新提交）
      if (data.code === 'id')
        return {
          ok: false,
          issue: 'offline',
          error: data.error ?? '投票编号冲突，请重新提交。',
        };
      return {
        ok: false,
        issue: 'dup',
        error: data.error ?? '这一对作品你已经投过票了。',
      };
    }
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
  } finally {
    clearTimeout(timeout);
  }
}

/** 拉指定测评范围的全量投票流水；失败返回 null（调用方区分「无票」与「加载失败」）。
 * 不按题号白名单过滤（决策 045 ⑤：下架题/下架作品的历史票保留在榜单），
 * 形态非法的行跳过 */
export async function fetchVotes(
  signal?: AbortSignal,
  scope: EvaluationScope = 'entertainment',
): Promise<VoteFlowRow[] | null> {
  try {
    const response = await apiFetch(`/api/votes?scope=${scope}`, { signal });
    if (!response.ok) return null;
    const data = (await response.json()) as { votes?: unknown };
    if (!Array.isArray(data.votes)) return null;
    const rows = data.votes.map(parseVoteRow);
    if (rows.some((row) => row === null)) {
      console.warn('[arenaofbias] /api/votes 返回了无法解析的投票行，已跳过');
    }
    return rows.filter((row): row is VoteFlowRow => row !== null);
  } catch {
    return null;
  }
}

/** 服务端流水 → 榜单聚合记录（模型层面，与占位投票同构；mode 供正式/娱乐分榜过滤）。
 * promptKind、promptWeights 与双方显示名随行透传——下架题的赛道归类、维度权重
 * 与历史模型的命名靠它们 */
export function voteToRecord(vote: VoteFlowRow): {
  promptId: string;
  winnerId: string;
  loserId: string;
  ts: number;
  id: string;
  mode: Mode;
  outcome: 'win' | 'draw';
  promptKind?: 'image' | 'text' | 'web';
  promptWeights?: number[];
  winnerName?: string;
  loserName?: string;
} {
  return {
    promptId: vote.promptId,
    winnerId: vote.winnerMid,
    loserId: vote.loserMid,
    ts: vote.ts,
    // 随行带流水 id：同毫秒票的重放次序在榜单/画像/服务端三处保持一致
    id: vote.id,
    mode: vote.mode,
    // 缺省 win：早期流水行与手工构造的记录可能没有该字段（决策 048）
    outcome: vote.outcome ?? 'win',
    ...(vote.promptKind ? { promptKind: vote.promptKind } : {}),
    ...(vote.promptWeights ? { promptWeights: vote.promptWeights } : {}),
    ...(vote.winnerName ? { winnerName: vote.winnerName } : {}),
    ...(vote.loserName ? { loserName: vote.loserName } : {}),
  };
}
