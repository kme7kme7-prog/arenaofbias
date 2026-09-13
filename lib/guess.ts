// 模一把的前端数据层：拉取今日题、提交猜测、本地对局与战绩的存取。
// 判定规则与类型在 lib/guess-logic.ts（那里的类型从服务端响应反推同构），
// 本文件只管「状态怎么存、接口怎么调」，不含游戏规则。
//
// ── 对局存储口径（美化与后续接手须知）──
// 对局按 dayKey 存在 localStorage（guess-session:<dayKey>），一天一条：
//   { guesses: GuessRow[], finished: boolean, revealed: boolean }
// 当天没玩完，刷新/换标签回来接着玩；昨天及更早的记录保留（战绩统计靠
// 汇总历史条目），不需要迁移。
//
// 战绩是全期汇总（guess-stats）：场次、胜场、连胜、最多用几步。
// 没有账号体系绑定——未来联机/账号并入时，以 dayKey 全量重算即可。

import type { AttributeKey, Feedback } from './guess-logic';

export type GuessApiModel = {
  id: string;
  name: string;
  vendor: string;
  released: string;
  openWeights: boolean;
  contextK: number | null;
  modalities: string[];
  reasoning: boolean;
  /** 官方一手输出单价（$/M），null = 未公开。揭晓条展示用；格子里显示档位 */
  priceOut: number | null;
  priceTier: number | null;
};

export type TodayResponse = {
  dayKey: string;
  dayNumber: number;
  attributes: AttributeKey[];
  models: GuessApiModel[];
};

/** 一行已提交的猜测（前端渲染历史行用；guess 持全量模型信息做属性展示） */
export type GuessRow = {
  guess: GuessApiModel;
  attributes: Record<AttributeKey, Feedback>;
  won: boolean;
};

export type GuessSession = {
  guesses: GuessRow[];
  /** 赢了或 8 次用尽 */
  finished: boolean;
  /** 答案已经揭晓过（含手动「看答案」）——揭晓后不再接受猜测 */
  revealed: boolean;
  /** 揭晓时服务端给的答案模型（可能为 null：老记录/极端情况），揭晓后展示用 */
  answer: GuessApiModel | null;
};

export type GuessStats = {
  played: number;
  won: number;
  streak: number;
  /** 单局最少用几步猜中（没赢过为 null） */
  best: number | null;
};

export const MAX_ATTEMPTS = 8;

const sessionKey = (dayKey: string) => `guess-session:${dayKey}`;
const STATS_KEY = 'guess-stats';
/** 战绩里最近多少天的 dayKey 快照（判断连胜：最后一条记录是否昨天） */
const LAST_DAY_KEY = 'guess-last-day';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用：当次会话内存态继续可用，只是刷新丢进度 */
  }
}

/** 读取某天的对局（不存在返回 null；不当天不清除——历史保留做战绩） */
export function loadSession(dayKey: string): GuessSession | null {
  const session = readJson<GuessSession>(sessionKey(dayKey));
  if (!session || !Array.isArray(session.guesses)) return null;
  // 数据集将来扩字段（150 版替换 23 版）不影响旧记录渲染：老行缺新属性
  // 字段时按 unknown 显示，这里不强行补
  return session;
}

export function saveSession(dayKey: string, session: GuessSession) {
  writeJson(sessionKey(dayKey), session);
}

export function loadStats(): GuessStats {
  return readJson<GuessStats>(STATS_KEY) ?? { played: 0, won: 0, streak: 0, best: null };
}

/**
 * 结算一场对局并更新战绩。连胜口径：连续的日历日（dayKey 前缀逐日+1），
 * 隔天没玩不断连——只有「玩了且输了」才断（Wordle 同款宽松口径）。
 */
export function settleStats(dayKey: string, won: boolean, attempts: number) {
  const stats = loadStats();
  const next: GuessStats = {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    streak: won ? stats.streak + 1 : 0,
    best: won
      ? stats.best === null
        ? attempts
        : Math.min(stats.best, attempts)
      : stats.best,
  };
  writeJson(STATS_KEY, next);
  writeJson(LAST_DAY_KEY, dayKey);
}

/** 调试用：清空战绩与全部对局记录（dev 面板可调用，正常用户路径不暴露） */
export function resetGuessData() {
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys)
      if (key.startsWith('guess-session:') || key === STATS_KEY || key === LAST_DAY_KEY)
        localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ── API ──

export async function fetchToday(): Promise<TodayResponse | null> {
  try {
    const response = await fetch('/api/guess/today');
    if (!response.ok) return null;
    return (await response.json()) as TodayResponse;
  } catch {
    return null;
  }
}

export type CheckResponse = {
  feedback: {
    guessId: string;
    attributes: Record<AttributeKey, Feedback>;
    won: boolean;
  };
  answer: GuessApiModel | null;
};

/** 提交一次猜测；final=第 8 次（用尽），服务端会附带答案 */
export async function checkGuess(
  guessId: string,
  final: boolean,
): Promise<CheckResponse | null> {
  try {
    const response = await fetch('/api/guess/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guessId, final }),
    });
    if (!response.ok) return null;
    return (await response.json()) as CheckResponse;
  } catch {
    return null;
  }
}
