// 轻量匹配机制（决策 046）：按声望分「软性回避」处刑局，不做强匹配。
//
// 声望分（内部暗分）：新模型 1200 起步（与 computeRatings / 服务端 /api/ratings
// 的重放基准一致——2026-09-15 修正：曾用 1000，比 Elo 基准低 200，导致无票
// 模型被隔两个档位、90% 同档匹配永远配不上它们），按 votes 表全量重放 K=32
// 的简易 Elo（与榜单前台口径同公式但独立维护——前台榜单永远只由真实票重放
// 得出，本模块的分数只供配对参考，两者不互相喂养）。
//
// 配对规则（参数集中在 MATCH_CONFIG，上线后可按真实数据微调）：
//   1. 档位：模型按声望分每 TIER_WIDTH 分一档；抽对局时 90% 在同档内随机、
//      10% 全池随机（保底锚——防止档位漂移、也给新模型跨档曝光机会）。
//   2. 熔断：全池分支抽出的对局若双方分差超过 BLOWOUT_GAP（大到闭眼知胜负），
//      重抽，最多 REROLL_LIMIT 次（同档宽 150 分，同档内分差上限 149，
//      恒小于 400，熔断实际只由 10% 全池分支触发）；重抽仍不行就照常返回
//      （流程优先于回避）。
//   3. 「换一组」的上轮作品回避（防身份泄漏，见 arena.ts pickMatchup）叠加在
//      之上：先按档位抽，再检查上轮回避；两者都尽量满足，满足不了优先保流程。
//   4. 冷门优先（决策 109）：池内抽组合不按均匀、按出场次数加权——
//      组合权重 = 1 / (1 + min(双方出场数))，出场少的一方越少权重越高。
//      新模型/冷门模型更快攒够场次（摘掉榜单「暂定」），全零时退化为均匀。
//      出场数来自 /api/ratings 同一次重放的 games 字段，缺省 {} = 全均匀。
// 占位模式不经本模块（占位作品无真实票，维持纯随机演示）。

import {
  finishPair,
  groupsAvoiding,
  modelGroups,
  modelPairIds,
  type Matchup,
  type ModelResult,
} from '@/lib/arena';

export type Ratings = Record<string, number>;

export const MATCH_CONFIG = {
  /** 新模型的初始声望分（须与 computeRatings 的 BASE 一致，见文件头） */
  baseRating: 1200,
  /** 档位宽度（分）：每档的声望分跨度 */
  tierWidth: 150,
  /** 同档抽取的概率（其余走全池随机保底） */
  sameTierRate: 0.9,
  /** 触发重抽的分差上限（实际只拦 10% 全池分支抽出的对局） */
  blowoutGap: 400,
  /** 分差熔断的重抽上限 */
  rerollLimit: 2,
} as const;

/** 档位号：声望分 → 档（未知模型按基准分算，与有票模型的起步档一致） */
export function tierOf(rating: number | undefined): number {
  return Math.floor((rating ?? MATCH_CONFIG.baseRating) / MATCH_CONFIG.tierWidth);
}

function ratingGap(pair: [string, string], ratings: Ratings): number {
  return Math.abs(
    (ratings[pair[0]] ?? MATCH_CONFIG.baseRating) -
      (ratings[pair[1]] ?? MATCH_CONFIG.baseRating),
  );
}

/**
 * 软性匹配抽一对（决策 097 起为两级抽取）：先按档位偏好抽两个不同模型，
 * 再各从该模型的作品里随机抽一件。池内按出场次数加权（决策 109，冷门优先）。
 * 保持既有全量语义——随机左右、上轮作品回避、可避开时避开、无可避开回退全量。
 * 返回 null = 本题无可配对。games 缺省 {}（= 全均匀，兼容旧调用与冷启动）。
 */
export function pickMatchedMatchup(
  promptId: string,
  results: ModelResult[],
  ratings: Ratings,
  previous?: Matchup,
  random: () => number = Math.random,
  games: Record<string, number> = {},
): Matchup | null {
  const groups = modelGroups(promptId, results);
  let active = groups;
  let pairs = modelPairIds(groups);
  if (!pairs.length) return null;

  // 上轮作品回避的语义与 pickMatchup 相同：能避开尽量避开，剩不下就回退全量
  if (previous) {
    const avoided = groupsAvoiding(groups, previous);
    const fresh = modelPairIds(avoided);
    if (fresh.length) {
      active = avoided;
      pairs = fresh;
    }
  }

  // 同档池与全量池：同档池是 pairs 里「双方档位相同」的子集
  const sameTier = pairs.filter(
    ([a, b]) => tierOf(ratings[a]) === tierOf(ratings[b]),
  );

  // 冷门优先（决策 109）：组合权重看双方里出场较少的一方，
  // 1/(1+min) —— 全新模型权重 1，已打 50 场的组合权重约 1/51
  const weightOf = ([a, b]: [string, string]) =>
    1 / (1 + Math.min(games[a] ?? 0, games[b] ?? 0));

  // 加权轮盘抽一组 + 随机左右；消耗随机数次数与原均匀版一致（票 + 左右各一）
  const pickFrom = (list: [string, string][]): [string, string] => {
    let total = 0;
    for (const pair of list) total += weightOf(pair);
    let ticket = random() * total;
    let pair = list[list.length - 1];
    for (const candidate of list) {
      ticket -= weightOf(candidate);
      if (ticket <= 0) {
        pair = candidate;
        break;
      }
    }
    return random() < 0.5 ? pair : [pair[1], pair[0]];
  };

  const candidate =
    sameTier.length && random() < MATCH_CONFIG.sameTierRate
      ? pickFrom(sameTier)
      : pickFrom(pairs);

  let chosen = candidate;
  // 分差熔断：分差过大重抽（换池），保底是原候选——流程优先于回避
  if (ratingGap(candidate, ratings) > MATCH_CONFIG.blowoutGap) {
    const reroll =
      sameTier.length && random() < MATCH_CONFIG.sameTierRate ? sameTier : pairs;
    for (let i = 0; i < MATCH_CONFIG.rerollLimit; i++) {
      const retry = pickFrom(reroll);
      if (ratingGap(retry, ratings) <= MATCH_CONFIG.blowoutGap) {
        chosen = retry;
        break;
      }
    }
  }

  return finishPair(active, chosen[0], chosen[1], random);
}

// ---------------------------------------------------------------------------
// 声望分：由投票流水重放（与 lib/leaderboard.ts 的简易 Elo 同公式：基准 1200 /
// K=32 / 按时间序迭代）。单独维护而不是复用 leaderboardData 的产物，是为了
// 让「配对参考分」与「前台榜单」彻底解耦——匹配机制不污染榜单，榜单变化也
// 不直接驱动匹配（两边的输入都是同一份流水，输出各自计算）。
// ---------------------------------------------------------------------------

export type RatingVote = {
  winnerId: string;
  loserId: string;
  ts: number;
  /** 流水行 id：同毫秒票以此打破平局，与服务端 ORDER BY created_at, id 同口径 */
  id?: string;
  /** 平局票（决策 048）双方各得半分；缺省按分胜负处理 */
  outcome?: 'win' | 'draw';
};

/** 全量流水重放声望分；只计真实票（占位票本来就不进这张流水） */
export function computeRatings(votes: RatingVote[]): Ratings {
  const K = 32;
  const BASE = 1200;
  const ratings: Ratings = {};
  for (const vote of [...votes].sort((a, b) =>
    a.ts !== b.ts ? a.ts - b.ts : a.id && b.id ? (a.id < b.id ? -1 : 1) : 0,
  )) {
    const a = ratings[vote.winnerId] ?? BASE;
    const b = ratings[vote.loserId] ?? BASE;
    const expectedA = 1 / (1 + 10 ** ((b - a) / 400));
    const actualA = vote.outcome === 'draw' ? 0.5 : 1;
    ratings[vote.winnerId] = a + K * (actualA - expectedA);
    ratings[vote.loserId] = b + K * (1 - actualA - (1 - expectedA));
  }
  return ratings;
}
