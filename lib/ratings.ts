// 声望分数据层（决策 046）：从服务端 GET /api/ratings 拉取配对参考分（「暗分」，
// 由 votes 表全量重放简易 Elo 得出），供 lib/matchmaking.ts 的软性匹配使用。
// 与 works/prompts 同构的小 store：拉不到时返回空对象——匹配层把未知模型按
// 基础分处理，等于退回均匀随机（站点行为不劣化）。
// 注意：这不是榜单分数。前台榜单照旧由页面重放 /api/votes 得出，两者解耦。

import type { Ratings } from '@/lib/matchmaking';

/** 模型出场次数（决策 109）：与声望分同一份响应，供匹配层冷门优先加权 */
export type Games = Record<string, number>;

export async function fetchRatings(): Promise<{
  ratings: Ratings;
  games: Games;
} | null> {
  try {
    const response = await fetch('/api/ratings');
    if (!response.ok) return null;
    const data = (await response.json()) as {
      ratings?: unknown;
      games?: unknown;
    };
    if (!data.ratings || typeof data.ratings !== 'object') return null;
    const ratings: Ratings = {};
    // 数值字段才收，坏行跳过——单行损坏不该让匹配退回
    for (const [modelId, value] of Object.entries(data.ratings)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        ratings[modelId] = value;
      }
    }
    // games 是 109 新增字段：旧服务端/缺失时按空对象（= 全均匀）兜底
    const games: Games = {};
    if (data.games && typeof data.games === 'object') {
      for (const [modelId, value] of Object.entries(data.games)) {
        // 负数不收：1/(1+min) 权重遇负值会变 Infinity，轮盘退化成恒抽末组
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          games[modelId] = value;
        }
      }
    }
    return { ratings, games };
  } catch {
    return null;
  }
}

type State = {
  status: 'loading' | 'ready';
  ratings: Ratings;
  games: Games;
};

let state: State = { status: 'loading', ratings: {}, games: {} };
let started = false;
// 请求代次：loadRatings 与 refreshRatings 可能并发，晚到的旧响应不得覆盖新快照
let requestSeq = 0;

/** 启动拉取（幂等）。失败静默——匹配层按空声望分（=均匀随机）继续。 */
export function loadRatings(): void {
  if (started) return;
  started = true;
  const seq = ++requestSeq;
  void (async () => {
    const data = await fetchRatings();
    if (seq !== requestSeq) return;
    // null（拉取失败/结构坏）不覆盖空对象语义：未就绪与失败都按「无分」处理
    if (data) state = { status: 'ready', ...data };
    else state = { status: 'ready', ratings: {}, games: {} };
  })();
}

/** 重新拉取（进入竞技场、投票落库后调用）：暗分会话内不刷新会随投票漂移。
 * 与 loadRatings 的失败语义不同——拉不到时保留旧分，宁可略旧不退回均匀随机。 */
export function refreshRatings(): void {
  const seq = ++requestSeq;
  void (async () => {
    const data = await fetchRatings();
    if (data && seq === requestSeq) state = { status: 'ready', ...data };
  })();
}

/** 测试/调试用：重置回未加载状态（生产代码不调用） */
export function resetRatingsForTest(): void {
  started = false;
  requestSeq += 1; // 让在途的旧响应作废
  state = { status: 'loading', ratings: {}, games: {} };
}

/** 当前生效的声望分；未就绪/失败时为空对象（匹配层按基础分兜底） */
export function currentRatings(): Ratings {
  return state.ratings;
}

/** 当前生效的出场次数（决策 109）；未就绪/失败时为空对象（= 全部均匀） */
export function currentGames(): Games {
  return state.games;
}
