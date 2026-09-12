// 模型反应（点赞/点踩/大笑，2026-09-13 用户拍板）：跟着题号走、一人一题一模型
// 一槽（服务端 UNIQUE 覆盖）。娱乐模式揭晓后展示；正式测评匿名口径不表态。
// 与 votes.ts 同构的小 store：拉不到静默空——反应是锦上添花，不能挡投票主流程。

export type ReactionKind = 'up' | 'down' | 'laugh';
export type ReactionCounts = Record<string, { up: number; down: number; laugh: number }>;
// mid → 我的态度
export type MyReactions = Record<string, ReactionKind>;

export type ReactionResponse = {
  counts: ReactionCounts;
  mine: MyReactions;
};

/** 提交/切换态度；返回最新的 counts+mine（服务端在写入后一并回读）。 */
export async function submitReaction(input: {
  id: string;
  promptId: string;
  mid: string;
  kind: ReactionKind;
}): Promise<ReactionResponse | null> {
  try {
    const response = await fetch('/api/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    return (await response.json()) as ReactionResponse;
  } catch {
    return null;
  }
}
