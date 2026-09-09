// 榜单数据层：把投票聚合成排行榜行。
// 投票来源：占位模式读 localStorage（lib/placeholder.ts），真实模式由页面从
// /api/votes 拉取后传入（lib/votes.ts），本层不再关心来源。
// 评分是占位口径的简易 Elo（基准 1200、K=32，按时间序迭代），
// 仅用于演示榜单形态，正式算法待定（README 排名要表达什么一节）。

import { prompts } from '@/lib/arena';
import {
  currentResults,
  hashSeed,
  isPlaceholderMode,
  mulberry32,
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
  /** 胜率 0–1 */
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
  return new Map(prompts.map((prompt) => [prompt.id, prompt.kind]));
}

function matchesCategory(
  kind: 'image' | 'text' | 'web' | undefined,
  category: BoardCategory,
): boolean {
  if (!kind) return false;
  if (category === 'all') return true;
  return kind === category;
}

function modelMeta() {
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
  return meta;
}

/** 榜单聚合口径的一票：模型层面的胜负与时间（服务端流水经 voteToRecord 映射） */
export type VoteRecord = {
  promptId: string;
  winnerId: string;
  loserId: string;
  ts: number;
};

/** 当前生效的投票：占位模式读 localStorage；真实模式由页面拉取服务端后传入 */
export function currentVotes(): VoteRecord[] {
  return isPlaceholderMode() ? readPlaceholderVotes() : [];
}

export function leaderboardData(
  category: BoardCategory,
  votes: VoteRecord[] = currentVotes(),
): BoardData {
  const kinds = promptKindMap();
  const meta = modelMeta();
  // 先过阵容：真实投票由服务端形态校验（不认识阵容），伪造或已下架模型的票
  // 在此过滤；占位投票读入时已按当前阵容过滤
  const known = votes.filter(
    (vote) => meta.has(vote.winnerId) && meta.has(vote.loserId),
  );
  const scoped = known.filter((vote) =>
    matchesCategory(kinds.get(vote.promptId), category),
  );

  const rating = new Map<string, number>();
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
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
    rating.set(vote.winnerId, ra + ELO_K * (1 - expected));
    rating.set(vote.loserId, rb - ELO_K * (1 - expected));
    wins.set(vote.winnerId, (wins.get(vote.winnerId) ?? 0) + 1);
    losses.set(vote.loserId, (losses.get(vote.loserId) ?? 0) + 1);
    topicSets.get(vote.winnerId)?.add(vote.promptId);
    topicSets.get(vote.loserId)?.add(vote.promptId);
  }

  const rows: BoardRow[] = [];
  for (const [modelId, info] of meta) {
    const w = wins.get(modelId) ?? 0;
    const l = losses.get(modelId) ?? 0;
    const games = w + l;
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
        ? prompts.length
        : prompts.filter((prompt) => prompt.kind === category).length,
  };
}

// ---------------------------------------------------------------------------
// 雷达维度：演示用播种值，不代表真实测量（原型 disclaimer 同款语义）
// ---------------------------------------------------------------------------

export const RADAR_LABELS: Record<BoardCategory, string[]> = {
  all: ['指令遵循', '语言表达', '创意表现', '结构组织', '实用程度', '完成质量'],
  text: ['主题贴合', '语言质感', '叙事节奏', '情感表达', '创意表现', '内容完整'],
  web: ['视觉表现', '布局层次', '交互体验', '实现完整', '适配能力', '细节质感'],
};

export function radarProfile(modelId: string, category: BoardCategory): number[] {
  const rng = mulberry32(hashSeed('radar', modelId, category));
  return Array.from({ length: 6 }, () => 62 + Math.floor(rng() * 36));
}

/** 全阵容的模拟平均（虚线），按类别播种一次 */
export function radarAverage(category: BoardCategory): number[] {
  const rng = mulberry32(hashSeed('radar-average', category));
  return Array.from({ length: 6 }, () => 70 + Math.floor(rng() * 12));
}
