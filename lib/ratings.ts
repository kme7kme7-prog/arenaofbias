// 声望分数据层（决策 046）：从服务端 GET /api/ratings 拉取配对参考分（「暗分」，
// 由 votes 表全量重放简易 Elo 得出），供 lib/matchmaking.ts 的软性匹配使用。
// 与 works/prompts 同构的小 store：拉不到时返回空对象——匹配层把未知模型按
// 基础分处理，等于退回均匀随机（站点行为不劣化）。
// 注意：这不是榜单分数。前台榜单照旧由页面重放 /api/votes 得出，两者解耦。

import type { Ratings } from '@/lib/matchmaking';

export async function fetchRatings(): Promise<Ratings | null> {
  try {
    const response = await fetch('/api/ratings');
    if (!response.ok) return null;
    const data = (await response.json()) as { ratings?: unknown };
    if (!data.ratings || typeof data.ratings !== 'object') return null;
    const ratings: Ratings = {};
    // 数值字段才收，坏行跳过——单行损坏不该让匹配退回
    for (const [modelId, value] of Object.entries(data.ratings)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        ratings[modelId] = value;
      }
    }
    return ratings;
  } catch {
    return null;
  }
}

type State = { status: 'loading' } | { status: 'ready'; ratings: Ratings };

let state: State = { status: 'loading' };
let started = false;

/** 启动拉取（幂等）。失败静默——匹配层按空声望分（=均匀随机）继续。 */
export function loadRatings(): void {
  if (started) return;
  started = true;
  void (async () => {
    const ratings = await fetchRatings();
    // null（拉取失败/结构坏）不覆盖空对象语义：未就绪与失败都按「无分」处理
    state = { status: 'ready', ratings: ratings ?? {} };
  })();
}

/** 测试/调试用：重置回未加载状态（生产代码不调用） */
export function resetRatingsForTest(): void {
  started = false;
  state = { status: 'loading' };
}

/** 当前生效的声望分；未就绪/失败时为空对象（匹配层按基础分兜底） */
export function currentRatings(): Ratings {
  return state.status === 'ready' ? state.ratings : {};
}
