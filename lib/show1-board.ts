import { apiFetch } from '@/lib/api';
import { presentServerBoard } from '@/lib/leaderboard';
import type { BoardCategory, BoardData, BoardScope, RadarProfiles, ServerBoardData } from '@/lib/leaderboard';

export type BoardSnapshot = {
  board: BoardData;
  allBoard: BoardData;
  radar: RadarProfiles;
  scopedPromptCount: number;
};

/** 真实模式只消费聚合结果，接口不可用时显示加载失败。 */
export async function fetchShow1Board(
  scope: BoardScope,
  category: BoardCategory,
  signal: AbortSignal,
): Promise<BoardSnapshot> {
  const query = new URLSearchParams({ scope, category });
  const response = await apiFetch(`/api/show1/leaderboard?${query}`, { signal });
  if (!response.ok) throw new Error('榜单暂时无法载入');
  const data = await response.json() as {
    scope: BoardScope;
    category: BoardCategory;
    board: ServerBoardData;
    allBoard: ServerBoardData;
    radar: { profiles: Record<string, number[]>; average: number[] };
    scopedPromptCount: number;
  };
  if (data.scope !== scope || data.category !== category || !Array.isArray(data.board?.rows)
    || !Array.isArray(data.allBoard?.rows) || !data.radar?.profiles || data.radar.average?.length !== 6)
    throw new Error('榜单数据格式无效');
  return {
    board: presentServerBoard(data.board),
    allBoard: presentServerBoard(data.allBoard),
    radar: { profiles: new Map(Object.entries(data.radar.profiles)), average: data.radar.average },
    scopedPromptCount: data.scopedPromptCount,
  };
}
