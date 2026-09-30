// 共享后端兼容评价：接口按题号 + mid 读写，底层由服务端定位作品。
// 娱乐模式揭晓后展示；正式测评匿名口径不表态。
// 与 votes.ts 同构的小 store：拉不到静默空——反应是锦上添花，不能挡投票主流程。
//
// 本地优先、批量同步（2026-09-20 用户拍板，替代旧的实时逐击上报）：点击只改
// 本地并记进 pending；换组/换题/离开竞技场（组件卸载）与关页（pagehide）时
// 每个题目与 mid 只把最终意图补发一次。反应是覆盖写的一槽，只发最后一个意图不丢
// 信息，乱按也不再烧 social 限流桶。发送失败保留待下次补发；未登录/非法
// 直接丢弃（点了也白记）。

import { newId } from '@/lib/id';

export type ReactionKind = 'up' | 'down' | 'laugh';
export type ReactionCounts = Record<string, { up: number; down: number; laugh: number }>;
// mid → 我的态度
export type MyReactions = Record<string, ReactionKind>;

export type ReactionResponse = {
  counts: ReactionCounts;
  mine: MyReactions;
};

type PendingEntry = { userId: string; promptId: string; mid: string; kind: ReactionKind | null };
const pending = new Map<string, PendingEntry>();
const inFlight = new Set<string>();
const keyOf = (userId: string, promptId: string, mid: string) => `${userId}/${promptId}/${mid}`;

/** 记一次本地意图：与最近同步态相同则撤销待发送项。known 为服务端已确认的态度。 */
export function queueReaction(
  userId: string,
  promptId: string,
  mid: string,
  kind: ReactionKind | null,
  known: ReactionKind | null,
): void {
  const key = keyOf(userId, promptId, mid);
  if (kind === known && !inFlight.has(key)) pending.delete(key);
  else pending.set(key, { userId, promptId, mid, kind });
}

/** 未发送的最终意图；undefined = 无待同步（服务端即真相），null = 待取消 */
export function peekPending(
  userId: string,
  promptId: string,
  mid: string,
): ReactionKind | null | undefined {
  return pending.get(keyOf(userId, promptId, mid))?.kind;
}

async function postReaction(entry: PendingEntry): Promise<{
  ok: boolean;
  status: number;
}> {
  try {
    // keepalive：pagehide 补发时请求要能活过页面卸载
    const response = await fetch('/api/reactions', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newId(), ...entry }),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// 串行链：并发触发的 flush 排队执行，不会同一意图发两枪
let flushChain: Promise<unknown> = Promise.resolve();
/** 把所有待同步意图补发给服务端；返回仍未发送的条数。无待发送时是空操作。 */
export function flushReactions(): Promise<number> {
  const run = flushChain.then(async () => {
    if (!pending.size) return 0;
    let userId: string | null;
    try {
      // 兼容接口不校验 body.userId，发送前按当前 cookie 账号核对旧队列。
      const response = await fetch('/api/auth/me', { keepalive: true });
      if (!response.ok) return pending.size;
      const data = await response.json();
      userId = data.user?.id ?? null;
    } catch { return pending.size; }
    let failed = 0;
    for (const [key, entry] of pending) {
      if (entry.userId !== userId) {
        pending.delete(key);
        continue;
      }
      inFlight.add(key);
      const result = await postReaction(entry);
      inFlight.delete(key);
      if (result.ok || [400, 401, 409].includes(result.status)) {
        if (pending.get(key) === entry) pending.delete(key);
      }
      else failed++;
    }
    return failed;
  });
  flushChain = run.catch(() => 0);
  return run;
}

if (typeof window !== 'undefined')
  window.addEventListener('pagehide', () => void flushReactions());
