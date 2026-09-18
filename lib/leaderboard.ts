// 榜单数据层：把投票聚合成排行榜行。
// 投票来源：占位模式读 localStorage（lib/placeholder.ts），真实模式由页面从
// /api/votes 拉取后传入（lib/votes.ts），本层不再关心来源。
// 评分是占位口径的简易 Elo（基准 1200、K=32，按时间序迭代），
// 仅用于演示榜单形态，正式算法待定（README 排名要表达什么一节）。

import type { Mode } from '@/lib/arena';
import { currentPrompts } from '@/lib/prompts';
import {
  currentResults,
  hashSeed,
  isPlaceholderMode,
  placeholderModels,
  readPlaceholderVotes,
} from '@/lib/placeholder';

export type BoardCategory = 'all' | 'text' | 'web';

export const BOARD_CATEGORIES: { id: BoardCategory; label: string }[] = [
  { id: 'all', label: '综合' },
  { id: 'text', label: '写作' },
  { id: 'web', label: '网页' },
];

export type BoardRow = {
  modelId: string;
  name: string;
  sub: string;
  sigil: string;
  accent: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  /** 平局场数（决策 048）；games = wins + losses + draws */
  draws: number;
  /** 胜率 0–1（平局计入分母场次、不计胜场） */
  winrate: number;
  /** 参与过比较的题数 */
  topics: number;
  trial: boolean;
  note: string;
};

export type BoardData = {
  rows: BoardRow[];
  totalVotes: number;
  modelCount: number;
  promptCount: number;
};

/** 胜场少于此数标记「暂定」，呼应 README：少量胜场不应呈现为稳定结论 */
export const TRIAL_GAME_THRESHOLD = 30;

const ELO_BASE = 1200;
const ELO_K = 32;

// 真实模型没有 accent 字段时按 id 播种取色；占位模型自带 accent
const FALLBACK_PALETTE = [
  '#8eaa6c',
  '#829eaa',
  '#9c88af',
  '#b39a6d',
  '#9f9874',
  '#829e88',
  '#a38b80',
  '#84a0a0',
];

const NOTE_POOL = [
  '出场稳定，偏好分布均匀，是榜单里的中坚成员。',
  '在部分题目里优势明显，样本再大一些会更可靠。',
  '风格鲜明，偏好它的参与者给出了稳定的支持率。',
  '发挥有波动，不同题目下的表现差异值得观察。',
  '胜场积累扎实，长尾题目里也有持续出场。',
  '偏好来源集中，换个赛道可能会看到不同的名次。',
];

function promptKindMap(): Map<string, 'image' | 'text' | 'web'> {
  return new Map(currentPrompts().map((prompt) => [prompt.id, prompt.kind]));
}

function matchesCategory(
  kind: 'image' | 'text' | 'web' | undefined,
  category: BoardCategory,
): boolean {
  if (!kind) return false;
  if (category === 'all') return true;
  return kind === category;
}

function modelMeta(votes: VoteRecord[]) {
  // 以当前数据源（占位或真实）中参与配对的结果为准：demo 样例不进榜
  const meta = new Map<
    string,
    { name: string; accent: string; sigil: string; sub: string }
  >();
  const placeholder = isPlaceholderMode()
    ? new Map(placeholderModels(16).map((m) => [m.id, m]))
    : null;
  for (const result of currentResults()) {
    if (result.isDemo || meta.has(result.modelId)) continue;
    const ph = placeholder?.get(result.modelId);
    const nn = result.modelId.replace(/^ph-/, '');
    meta.set(result.modelId, {
      name: result.modelName,
      accent:
        ph?.accent ??
        FALLBACK_PALETTE[hashSeed(result.modelId) % FALLBACK_PALETTE.length],
      sigil: ph ? nn : result.modelName.slice(0, 1).toUpperCase(),
      sub: ph ? `PLACEHOLDER / PH-${nn}` : '演示阵容 / DEMO',
    });
  }
  // 历史阵容：只出现在流水里的模型（作品已全部下架——决策 045 ⑤「历史票保留在
  // 榜单」）。仍进阵容参与聚合，显示名用流水里的作品名快照（缺失时回落模型 id），
  // 下架任何作品都不再让该模型的票消失、不再引发全榜重排
  for (const vote of votes) {
    const retired: [string, string | undefined][] = [
      [vote.winnerId, vote.winnerName],
      [vote.loserId, vote.loserName],
    ];
    for (const [modelId, name] of retired) {
      if (meta.has(modelId)) continue;
      const display = name ?? modelId;
      meta.set(modelId, {
        name: display,
        accent: FALLBACK_PALETTE[hashSeed(modelId) % FALLBACK_PALETTE.length],
        sigil: display.slice(0, 1).toUpperCase(),
        sub: '历史阵容 / RETIRED',
      });
    }
  }
  return meta;
}

/** 榜单聚合口径的一票：模型层面的胜负与时间（服务端流水经 voteToRecord 映射）。
 * outcome = draw（决策 048 平局票）时双方各得半分；占位投票无此字段，按 win 处理 */
export type VoteRecord = {
  promptId: string;
  winnerId: string;
  loserId: string;
  ts: number;
  /** 这票产生的模式（决策 026：混榜可切换只看正式）；占位投票无此字段，只在混入口径计入 */
  mode?: Mode;
  /** win = 分胜负；draw = 无法抉择的平局（缺省按 win——占位票与早期数据无此字段） */
  outcome?: 'win' | 'draw';
  /** 题目类型快照（服务端联表提供，含下架题——下架不改变赛道归类，决策 045 ⑤） */
  promptKind?: 'image' | 'text' | 'web';
  /** 双方模型显示名快照（作品已全部下架的模型靠它在榜上有名） */
  winnerName?: string;
  loserName?: string;
};

/** 榜单口径（决策 026）：mixed = 正式与娱乐混入；formal = 只看正式测评的票 */
export type BoardScope = 'mixed' | 'formal';

/** 当前生效的投票：占位模式读 localStorage；真实模式由页面拉取服务端后传入 */
export function currentVotes(): VoteRecord[] {
  return isPlaceholderMode() ? readPlaceholderVotes() : [];
}

export function leaderboardData(
  category: BoardCategory,
  votes: VoteRecord[] = currentVotes(),
  scope: BoardScope = 'mixed',
): BoardData {
  const kinds = promptKindMap();
  const meta = modelMeta(votes);
  // 阵容 = 已发布作品 ∪ 流水历史模型（决策 045 ⑤）：modelMeta 已把每条流水
  // 出现过的模型全部登记进 meta，meta.has 恒真，无需再按票面过滤（原先的
  // known 过滤是死代码，2026-09-15 移除）；服务端写入时也已核对过票面
  const scoped = votes.filter(
    (vote) =>
      matchesCategory(kinds.get(vote.promptId) ?? vote.promptKind, category) &&
      (scope === 'mixed' || vote.mode === 'formal'),
  );

  const rating = new Map<string, number>();
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const draws = new Map<string, number>();
  const topicSets = new Map<string, Set<string>>();
  const touch = (id: string) => {
    if (!rating.has(id)) rating.set(id, ELO_BASE);
    if (!topicSets.has(id)) topicSets.set(id, new Set());
  };
  const ordered = [...scoped].sort((a, b) => a.ts - b.ts);
  for (const vote of ordered) {
    touch(vote.winnerId);
    touch(vote.loserId);
    const ra = rating.get(vote.winnerId) ?? ELO_BASE;
    const rb = rating.get(vote.loserId) ?? ELO_BASE;
    const expected = 1 / (1 + 10 ** ((rb - ra) / 400));
    // 平局（决策 048）：双方实际得分各 0.5，胜场/负场都不计、记平局数
    const actual = vote.outcome === 'draw' ? 0.5 : 1;
    rating.set(vote.winnerId, ra + ELO_K * (actual - expected));
    rating.set(vote.loserId, rb + ELO_K * (1 - actual - (1 - expected)));
    if (vote.outcome === 'draw') {
      draws.set(vote.winnerId, (draws.get(vote.winnerId) ?? 0) + 1);
      draws.set(vote.loserId, (draws.get(vote.loserId) ?? 0) + 1);
    } else {
      wins.set(vote.winnerId, (wins.get(vote.winnerId) ?? 0) + 1);
      losses.set(vote.loserId, (losses.get(vote.loserId) ?? 0) + 1);
    }
    topicSets.get(vote.winnerId)?.add(vote.promptId);
    topicSets.get(vote.loserId)?.add(vote.promptId);
  }

  const rows: BoardRow[] = [];
  for (const [modelId, info] of meta) {
    const w = wins.get(modelId) ?? 0;
    const l = losses.get(modelId) ?? 0;
    const d = draws.get(modelId) ?? 0;
    const games = w + l + d;
    if (games === 0) continue;
    rows.push({
      modelId,
      name: info.name,
      sub: info.sub,
      sigil: info.sigil,
      accent: info.accent,
      rating: Math.round(rating.get(modelId) ?? ELO_BASE),
      games,
      wins: w,
      losses: l,
      draws: d,
      winrate: w / games,
      topics: topicSets.get(modelId)?.size ?? 0,
      trial: games < TRIAL_GAME_THRESHOLD,
      note: NOTE_POOL[hashSeed('note', modelId) % NOTE_POOL.length],
    });
  }
  rows.sort(
    (a, b) => b.rating - a.rating || b.games - a.games || a.modelId.localeCompare(b.modelId),
  );
  return {
    rows,
    totalVotes: scoped.length,
    modelCount: meta.size,
    promptCount:
      category === 'all'
        ? currentPrompts().length
        : currentPrompts().filter((prompt) => prompt.kind === category).length,
  };
}

// ---------------------------------------------------------------------------
// 六维画像（决策 091）：不再用播种演示值——把真实投票按「每道题的维度权重」
// 重放进分维 Elo，形成模型的六维画像。用户仍只选喜欢哪一边，不填任何评分。
// 画像与榜单共用同一套投票流水、赛道与口径过滤（category/scope）。
// ---------------------------------------------------------------------------

/** 维度顺序与 RADAR_LABELS 一致：视觉设计 / 空间营造 / 动态表现 / 文字表达 / 思辨推理 / 创意构思 */
export const RADAR_DIMENSIONS = ['视觉设计', '空间营造', '动态表现', '文字表达', '思辨推理', '创意构思'];

export const RADAR_LABELS: Record<BoardCategory, string[]> = {
  all: RADAR_DIMENSIONS,
  text: RADAR_DIMENSIONS,
  web: RADAR_DIMENSIONS,
};

/** 画像基准（0–100 展示量程的中点）；从未被相关题目加权到的维度停在基准 */
export const RADAR_BASE = 50;
/** 分维 Elo 步长上限（权重 1 时一票的最大变动量级，与榜单 ELO_K 同源） */
const RADAR_K = 32;

/** 每道题的六维权重（2026-09-18 用户拍板，按题号配置；各题权重和为 1）。
 * 未配置的题按六维均分兜底，保证新题投票不静默丢失。 */
export const PROMPT_DIMENSION_WEIGHTS: Record<string, number[]> = {
  // 001 鹈鹕大挑战（骑车动画）：动态表现 60 · 视觉设计 30 · 创意构思 10
  '001': [0.3, 0, 0.6, 0, 0, 0.1],
  // 002 最后一句：文字表达 70 · 创意构思 30
  '002': [0, 0, 0, 0.7, 0, 0.3],
  // 003 环游轨道（前端网页设计）：视觉设计 60 · 动态表现 20 · 文字表达 20
  '003': [0.6, 0, 0.2, 0.2, 0, 0],
  // 004 营造法式（体素中国建筑群）：空间营造 70 · 视觉设计 30
  '004': [0.3, 0.7, 0, 0, 0, 0],
  // 005 飞瀑穿云（体素山水）：空间营造 60 · 视觉设计 30 · 创意构思 10
  '005': [0.3, 0.6, 0, 0, 0, 0.1],
  // 006 整装出发（前端网页设计，2026-09-18 用户确认）：视觉设计 60 · 动态表现 20 · 文字表达 20
  '006': [0.6, 0, 0.2, 0.2, 0, 0],
  // 007 事件视界（黑洞可视化）：动态表现 30 · 空间营造 20 · 视觉设计 20 · 思辨推理 30
  '007': [0.2, 0.2, 0.3, 0, 0.3, 0],
};

const UNCONFIGURED_PROMPT_WEIGHTS = RADAR_DIMENSIONS.map(() => 1 / 6);

export type RadarProfiles = {
  /** modelId → 六维分（0–100，已收敛到展示量程） */
  profiles: Map<string, number[]>;
  /** 阵容平均（虚线）：参与过比较的模型逐维平均 */
  average: number[];
};

/** 按赛道与口径过滤后，把投票重放成分维 Elo。平局双方各半分（决策 048 同口径）；
 * 权重 0 的维度不因该题变动。重放内部不截断，展示值收敛到 0–100。 */
export function computeRadarProfiles(
  category: BoardCategory,
  votes: VoteRecord[] = currentVotes(),
  scope: BoardScope = 'mixed',
): RadarProfiles {
  const kinds = promptKindMap();
  const scoped = votes.filter(
    (vote) =>
      matchesCategory(kinds.get(vote.promptId) ?? vote.promptKind, category) &&
      (scope === 'mixed' || vote.mode === 'formal'),
  );
  const table = new Map<string, number[]>();
  const touch = (id: string) => {
    if (!table.has(id)) table.set(id, Array(6).fill(RADAR_BASE));
  };
  const ordered = [...scoped].sort((a, b) => a.ts - b.ts);
  for (const vote of ordered) {
    touch(vote.winnerId);
    touch(vote.loserId);
    const weights = PROMPT_DIMENSION_WEIGHTS[vote.promptId] ?? UNCONFIGURED_PROMPT_WEIGHTS;
    const ra = table.get(vote.winnerId)!;
    const rb = table.get(vote.loserId)!;
    const actual = vote.outcome === 'draw' ? 0.5 : 1;
    for (let d = 0; d < 6; d += 1) {
      const w = weights[d];
      if (w <= 0) continue;
      const expected = 1 / (1 + 10 ** ((rb[d] - ra[d]) / 400));
      ra[d] += RADAR_K * w * (actual - expected);
      rb[d] += RADAR_K * w * (1 - actual - (1 - expected));
    }
  }
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const profiles = new Map<string, number[]>();
  for (const [id, values] of table) profiles.set(id, values.map(clamp));
  const average = RADAR_DIMENSIONS.map((_, d) => {
    let sum = 0;
    for (const values of table.values()) sum += values[d];
    return table.size ? clamp(sum / table.size) : RADAR_BASE;
  });
  return { profiles, average };
}
