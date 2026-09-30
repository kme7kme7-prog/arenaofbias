// 模一把的前端数据层：拉取今日题、提交猜测、本地对局与战绩的存取。
// 判定规则与类型在 lib/guess-logic.ts（那里的类型从服务端响应反推同构），
// 本文件只管「状态怎么存、接口怎么调」，不含游戏规则。
//
// ── 双模式（2026-09-26：每日按浏览器续局，完成后当日锁定）──
// 每日一题：全球同题，种子派生，只从简单+普通池出（困难与地狱不进每日）。
//   每次成功猜测立即保存；退出/刷新恢复，完成后只读。练习仍只在内存。
//   战绩 guess-stats（场次/胜场/连胜/最少步数）只算每日题，一天只结算一次
//   ——guess-settled:<dayKey> 标记防止反复进出刷战绩与重复上报。
// 练习模式：三档难度随机出题、不限次、「再来一把」开新局。答案服务端持有，
//   开局发 gameId；对局只在内存，退出重进=服务端开新局（服务器重启后接口
//   回 game-expired，前端自动开新局）。练习不计战绩、不上报。
// 旧键迁移：三档难度时期（060）的 guess-stats:1 在读取时并入 guess-stats。
//
// 没有账号体系绑定——未来联机/账号并入时按记录全量重算。

import { ATTRIBUTE_KEYS, type AttributeKey, type Feedback, type GuessDifficulty } from './guess-logic';

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
  /** 难度分池：1 简单 / 2 标准 / 3 困难（练习模式按它分池；每日池=1+2） */
  difficulty: GuessDifficulty;
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

const STATS_KEY = 'guess-stats';
/** 战绩里最近一天的 dayKey 快照。连胜是宽松口径（只有「玩了且输了」才断，
 *  隔天没玩不断——见 settleStats），本键目前只写不读，留给将来收紧口径用；
 *  若要改成「连续日历日」才+1，读它之前先过用户拍板（行为会变） */
const LAST_DAY_KEY = 'guess-last-day';
/** 「某日战绩已结算」标记（一天一条，防反复进出刷战绩与重复上报） */
const settledKey = (dayKey: string) => `guess-settled:${dayKey}`;
const dailyKey = (dayKey: string) => `guess-daily:${dayKey}`;
const memoryDaily = new Map<string, string>();
const memoryCounted = new Set<string>();
// 三档难度时期（决策 060）的战绩键，读取时并入每日战绩（一次性）
const LEGACY_STATS_060 = 'guess-stats:1';
const LEGACY_LAST_DAY_060 = 'guess-last-day:1';

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

/** 某日战绩是否已结算；旧版本只有此标记时，也能锁定已完成日期。 */
export function wasCounted(dayKey: string): boolean {
  try {
    return localStorage.getItem(settledKey(dayKey)) === '1' || memoryCounted.has(dayKey);
  } catch {
    return memoryCounted.has(dayKey);
  }
}

/** 标记某日战绩已结算（与 settleStats 同一时机写，一天只写一次） */
export function markCounted(dayKey: string) {
  memoryCounted.add(dayKey);
  try {
    localStorage.setItem(settledKey(dayKey), '1');
  } catch {
    /* 存储不可用：内存态照常，只是刷新后可能重复结算 */
  }
}

/** 跨标签页串行提交/结算；不支持 Web Locks 的浏览器仍有持久状态校验。 */
export async function withDailyLock<T>(dayKey: string, action: () => Promise<T> | T): Promise<T> {
  if (globalThis.navigator?.locks)
    return navigator.locks.request(`aob-guess:${dayKey}`, action);
  return action();
}

/** 存模型 id 而非整份模型资料，恢复时以今日接口的模型列表为准。 */
export function saveDailySession(dayKey: string, session: GuessSession) {
  const raw = JSON.stringify({
    version: 1,
    guesses: session.guesses.map(row => ({
      guessId: row.guess.id, attributes: row.attributes, won: row.won,
    })),
    finished: session.finished,
    revealed: session.revealed,
    answerId: session.answer?.id ?? null,
  });
  memoryDaily.set(dayKey, raw);
  try { localStorage.setItem(dailyKey(dayKey), raw); } catch { /* 当前页面内仍锁定 */ }
}

export function loadDailySession(dayKey: string, models: GuessApiModel[]): GuessSession | null {
  // 旧版只存结算标记：没有轨迹可恢复，也不能因此允许重开。
  const completed = (): GuessSession | null => wasCounted(dayKey)
    ? { guesses: [], finished: true, revealed: true, answer: null } : null;
  try {
    let raw: string | null | undefined;
    try { raw = localStorage.getItem(dailyKey(dayKey)); }
    catch { raw = memoryDaily.get(dayKey); }
    if (!raw) return completed();
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.guesses) || value.guesses.length > MAX_ATTEMPTS)
      return completed();
    const seen = new Set<string>();
    const guesses: GuessRow[] = [];
    for (const row of value.guesses) {
      const guess = models.find(model => model.id === row?.guessId);
      if (!guess || seen.has(guess.id) || typeof row.won !== 'boolean') return completed();
      if (!ATTRIBUTE_KEYS.every(key => {
        const feedback = row.attributes?.[key];
        return feedback && ['hit', 'near', 'miss', 'unknown'].includes(feedback.state)
          && [null, 'up', 'down'].includes(feedback.arrow);
      })) return completed();
      seen.add(guess.id);
      guesses.push({ guess, attributes: row.attributes, won: row.won });
    }
    const finished = value.finished === true || value.revealed === true
      || guesses.some(row => row.won) || guesses.length === MAX_ATTEMPTS || wasCounted(dayKey);
    return {
      guesses, finished, revealed: finished,
      answer: finished ? models.find(model => model.id === value.answerId) ?? null : null,
    };
  } catch { return completed(); }
}

export function loadStats(): GuessStats {
  // 060 时期的分难度战绩：简单档那份并入每日战绩（只迁一次）
  const legacy = readJson<GuessStats>(LEGACY_STATS_060);
  if (legacy) {
    if (!readJson<GuessStats>(STATS_KEY)) writeJson(STATS_KEY, legacy);
    try {
      localStorage.removeItem(LEGACY_STATS_060);
      localStorage.removeItem(LEGACY_LAST_DAY_060);
    } catch {
      /* 存储不可用时旧键留到下次 */
    }
  }
  return (
    readJson<GuessStats>(STATS_KEY) ?? {
      played: 0,
      won: 0,
      streak: 0,
      best: null,
    }
  );
}

/**
 * 结算一场每日一题并更新战绩。连胜口径：连续的日历日（dayKey 前缀逐日+1），
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

/** 调试用：清空战绩与对局相关记录（dev 面板可调用，正常用户路径不暴露）。
 *  guess-session:/guess-practice: 是对局落盘时期的旧键，一并清掉 */
export function resetGuessData() {
  memoryDaily.clear();
  memoryCounted.clear();
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys)
      if (
        key.startsWith('guess-session:') ||
        key.startsWith('guess-daily:') ||
        key.startsWith('guess-practice:') ||
        key.startsWith('guess-settled:') ||
        key.startsWith('guess-stats') ||
        key.startsWith('guess-last-day')
      )
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

/** 练习局已过期（服务器重启清内存）的信号：404 + code=game-expired */
export class PracticeExpiredError extends Error {}
export class DailyChangedError extends Error {}

/** 服务端限流（429）的信号：checkGuess 抛出，界面给「稍等几秒」的提示，
 *  不再与普通失败混在一起显示「网络不给力」 */
export class RateLimitedError extends Error {}

/** 提交一次猜测；final=第 8 次（用尽），服务端会附带答案。
 *  每日一题不带 gameId（种子派生答案）；练习模式带 gameId（服务端持答案）。
 *  当前共享后端忽略 check 的 dayKey，409 分支仅兼容未来跨日拒绝；
 *  前端会先用 today 接口复核日期，不能据此宣称服务器已校验跨日提交。 */
export async function checkGuess(
  guessId: string,
  final: boolean,
  gameId?: string,
  dayKey?: string,
): Promise<CheckResponse | null> {
  try {
    const response = await fetch('/api/guess/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameId ? { guessId, final, gameId } : { guessId, final, dayKey }),
    });
    if (!response.ok) {
      if (response.status === 404) throw new PracticeExpiredError();
      if (response.status === 429) throw new RateLimitedError();
      if (response.status === 409) throw new DailyChangedError();
      return null;
    }
    return (await response.json()) as CheckResponse;
  } catch (error) {
    if (
      error instanceof PracticeExpiredError ||
      error instanceof DailyChangedError ||
      error instanceof RateLimitedError
    )
      throw error;
    return null;
  }
}

/** 开一局练习：服务端从该难度池随机抽答案，返回局号 */
export async function startPractice(
  difficulty: GuessDifficulty,
): Promise<string | null> {
  try {
    const response = await fetch('/api/guess/practice/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty }),
    });
    if (!response.ok) return null;
    return ((await response.json()) as { gameId: string }).gameId;
  } catch {
    return null;
  }
}

/** 每日一题结束后上报游玩数据（后台「模一把」页统计用）。匿名一条：
 *  服务端按 dayKey 从每日池自己派生答案，这里只报结果。与战绩结算同一时机
 *  （一局一次），失败静默——统计丢了不碍玩，绝不阻塞结算流程。 */
export function reportResult(dayKey: string, won: boolean, attempts: number) {
  try {
    void fetch('/api/guess/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayKey, won, attempts }),
    }).catch(() => {});
  } catch {
    /* 网络不可用：忽略 */
  }
}
