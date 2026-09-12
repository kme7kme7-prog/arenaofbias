// 轻量匹配机制（决策 046）：按声望分「软性回避」处刑局，不做强匹配。
//
// 声望分（内部暗分）：新模型 1000 起步，按 votes 表全量重放 K=32 的简易 Elo
//（与榜单前台口径同公式但独立维护——前台榜单永远只由真实票重放得出，
// 本模块的分数只供配对参考，两者不互相喂养）。服务端 /api/ratings 由此重放。
//
// 配对规则（参数集中在 MATCH_CONFIG，上线后可按真实数据微调）：
//   1. 档位：模型按声望分每 TIER_WIDTH 分一档；抽对局时 90% 在同档内随机、
//      10% 全池随机（保底锚——防止档位漂移、也给新模型跨档曝光机会）。
//   2. 熔断：同档抽出的对局若双方分差超过 BLOWOUT_GAP（大到闭眼知胜负），
//      重抽，最多 REROLL_LIMIT 次；重抽仍不行就照常返回（流程优先于回避）。
//   3. 「换一组」的上轮作品回避（防身份泄漏，见 arena.ts pickMatchup）叠加在
//      之上：先按档位抽，再检查上轮回避；两者都尽量满足，满足不了优先保流程。
// 占位模式不经本模块（占位作品无真实票，维持纯随机演示）。

import { eligiblePairs, type Matchup, type ModelResult } from '@/lib/arena';

export type Ratings = Record<string, number>;

export const MATCH_CONFIG = {
  /** 新模型的初始声望分 */
  baseRating: 1000,
  /** 档位宽度（分）：每档的声望分跨度 */
  tierWidth: 150,
  /** 同档抽取的概率（其余走全池随机保底） */
  sameTierRate: 0.9,
  /** 触发重抽的分差上限（同档内也可能出现大分差） */
  blowoutGap: 400,
  /** 分差熔断的重抽上限 */
  rerollLimit: 2,
} as const;

/** 档位号：声望分 → 档（未知模型按基础分算，落在中间档） */
export function tierOf(rating: number | undefined): number {
  return Math.floor((rating ?? MATCH_CONFIG.baseRating) / MATCH_CONFIG.tierWidth);
}

function ratingGap(pair: Matchup, ratings: Ratings): number {
  return Math.abs(
    (ratings[pair[0].modelId] ?? MATCH_CONFIG.baseRating) -
      (ratings[pair[1].modelId] ?? MATCH_CONFIG.baseRating),
  );
}

/**
 * 软性匹配抽一对：保持 pickMatchup 的全量语义（随机左右、上轮作品回避、
 * 可避开时避开、无可避开回退全量），只在「抽哪一组」上引入档位偏好。
 * 返回 null = 本题无可配对（与 pickMatchup 一致）。
 */
export function pickMatchedMatchup(
  promptId: string,
  results: ModelResult[],
  ratings: Ratings,
  previous?: Matchup,
  random: () => number = Math.random,
): Matchup | null {
  const pairs = eligiblePairs(promptId, results);
  if (!pairs.length) return null;

  // 上轮作品回避的语义与 pickMatchup 相同：能避开尽量避开，剩不下就回退全量
  const fresh = previous
    ? pairs.filter(
        (pair) =>
          !pair.some((entry) => previous.some((old) => old.id === entry.id)),
      )
    : pairs;
  const pool = fresh.length ? fresh : pairs;

  // 同档池与全量池：同档池是 pool 里「双方档位相同」的子集
  const sameTier = pool.filter(
    (pair) => tierOf(ratings[pair[0].modelId]) === tierOf(ratings[pair[1].modelId]),
  );

  const pickFrom = (list: Matchup[]): Matchup => {
    const pair = list[Math.floor(random() * list.length)];
    return random() < 0.5 ? pair : [pair[1], pair[0]];
  };

  const candidate =
    sameTier.length && random() < MATCH_CONFIG.sameTierRate
      ? pickFrom(sameTier)
      : pickFrom(pool);

  // 分差熔断：分差过大重抽（换池），保底是原候选——流程优先于回避
  if (ratingGap(candidate, ratings) > MATCH_CONFIG.blowoutGap) {
    const reroll =
      sameTier.length && random() < MATCH_CONFIG.sameTierRate ? sameTier : pool;
    for (let i = 0; i < MATCH_CONFIG.rerollLimit; i++) {
      const retry = pickFrom(reroll);
      if (ratingGap(retry, ratings) <= MATCH_CONFIG.blowoutGap) return retry;
    }
  }
  return candidate;
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
};

/** 全量流水重放声望分；只计真实票（占位票本来就不进这张流水） */
export function computeRatings(votes: RatingVote[]): Ratings {
  const K = 32;
  const BASE = 1200;
  const ratings: Ratings = {};
  for (const vote of [...votes].sort((a, b) => a.ts - b.ts)) {
    const a = ratings[vote.winnerId] ?? BASE;
    const b = ratings[vote.loserId] ?? BASE;
    const expectedA = 1 / (1 + 10 ** ((b - a) / 400));
    ratings[vote.winnerId] = a + K * (1 - expectedA);
    ratings[vote.loserId] = b + K * (0 - (1 - expectedA));
  }
  return ratings;
}
