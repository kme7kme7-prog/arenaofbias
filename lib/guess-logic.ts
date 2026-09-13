// 「模一把」（决策 057）—— Wordle 式猜 AI 模型的判定核心。
// 纯函数、无副作用：同一段代码在服务端（/api/guess/*）与验证脚本
// （scripts/validate-guess.mjs）里运行，保证判定口径永远一致。
// 服务端持数据集与每日答案，前端只拿判定结果，防「查看源码」作弊。
//
// ── 美化接手须知 ──────────────────────────────────────────────
// 反馈格的视觉状态只有 4 种：hit（绿）/ near（黄）/ miss（灰）/ unknown（?），
// 加 arrow: 'up' | 'down' | null 修饰数值属性（见 GuessFeedback）。
// 颜色/间距全部走 app/guess.css 的 CSS 变量（--guess-hit 等），不要改本文件
// 来实现视觉效果；判定逻辑（黄阈值、箭头方向）是游戏规则，调手感只改
// GUESS_CONFIG，不动 judge()。

import rawData from './guess-models.json';

export type GuessModel = {
  /** 稳定 id（kebab），持久化战绩与每日题只用 id，改名不炸 */
  id: string;
  /** 展示名（数据集口径的通用叫法，如 "GPT-5"、"Kimi K2"） */
  name: string;
  /** 厂商显示名（数据集原始字符串，如 "Zhipu AI (Z.ai)"）。判定按原文全等比较 */
  vendor: string;
  /** 发布年月 "YYYY-MM"。口径：正式发布/广泛可用，不算预告 */
  released: string;
  /** 是否开放权重可下载 */
  openWeights: boolean;
  /** 上下文窗口，单位 K token（128 = 128,000）。null = 未公开 */
  contextK: number | null;
  /** 输入模态集合；"text" 恒在 */
  modalities: ('text' | 'image' | 'audio' | 'video')[];
  /** 是否推理模型（思考链/深度思考型） */
  reasoning: boolean;
  /** 官方一手 API 输出单价（$/百万输出 token）。null = 无一手价（停产/无一手 API） */
  priceOut: number | null;
  /** 价格档 0-4，由 priceOut 按 PRICE_BAND_EDGES 划定（见下）。null = priceOut 未公开 */
  priceTier: number | null;
  /** 知名度分（数据集自带，0-85）。当前只用于搜索默认候选排序 */
  popularity: number;
};

// ── 数据集适配层 ──
// 外部维护的数据集（lib/guess-models.json）有自己的字段口径（org/year/month/
// modality/priceTier 字符串档），与上面的内部模型不同。所有转换集中在这里：
// 上游换字段只改这一段，判定逻辑（judge 等）永远吃内部模型。
// 数据集按 popularity 降序；每日答案按下标取模派生，所以**更新数据集时新模型
// 必须追加在数组末尾**，插入/重排会改变历史日期的答案（见 answerForDate）。
//
// 价格口径（决策 057 续，2026-09-13 定稿）：数据集 priceOut = 官方一手输出
// 单价；档位边界在下面 PRICE_BAND_EDGES，不依赖数据集的旧字符串档
// priceTier（该字段已弃用、仅为数据集 diff 校验保留）。旧口径「取各家最低价」
// 曾把 96/155 条标成 free（聚合商 :free 镜像污染），已废弃。

/** 价格档边界：priceOut < 0.5 → 0 档；< 2 → 1；< 8 → 2；< 25 → 3；≥ 25 → 4 */
export const PRICE_BAND_EDGES = [0.5, 2, 8, 25] as const;

function priceBandOf(priceOut: number | null): number | null {
  if (priceOut === null || !Number.isFinite(priceOut)) return null;
  for (let i = 0; i < PRICE_BAND_EDGES.length; i++)
    if (priceOut < PRICE_BAND_EDGES[i]) return i;
  return PRICE_BAND_EDGES.length;
}

function normalizeModel(entry: {
  id: string;
  name: string;
  org: string;
  year: number;
  month: number;
  openWeights: boolean;
  contextK: number | null;
  modality: string;
  reasoning: boolean;
  priceOut: number | null;
  popularity: number;
}): GuessModel {
  return {
    id: entry.id,
    name: entry.name,
    vendor: entry.org,
    released: `${entry.year}-${String(entry.month).padStart(2, '0')}`,
    openWeights: entry.openWeights,
    contextK: entry.contextK,
    modalities: entry.modality.split('+') as GuessModel['modalities'],
    reasoning: entry.reasoning,
    priceOut: entry.priceOut,
    priceTier: priceBandOf(entry.priceOut),
    popularity: entry.popularity,
  };
}

export const GUESS_MODELS: GuessModel[] = rawData.models.map(normalizeModel);
export const modelById = new Map(GUESS_MODELS.map((m) => [m.id, m]));

/** 价格档显示文案（zh/en），index = priceTier（0-4） */
export const PRICE_TIERS: { zh: string; en: string }[] = [
  { zh: '近免费', en: 'Near-free' },
  { zh: '便宜', en: 'Cheap' },
  { zh: '中等', en: 'Mid' },
  { zh: '贵', en: 'High' },
  { zh: '旗舰', en: 'Premium' },
];

/** 属性 key。顺序即反馈格渲染顺序，改顺序=改玩法，需用户拍板 */
export const ATTRIBUTE_KEYS = [
  'vendor',
  'released',
  'openWeights',
  'contextK',
  'modalities',
  'reasoning',
  'priceTier',
] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

// ── 手感参数：黄阈值是「接近但不中」的张力来源，调手感只动这里 ──
export const GUESS_CONFIG = {
  /** 发布时间差多少个月内算 near（黄）。0 = 不给黄，只给箭头 */
  releasedNearMonths: 6,
  /** 上下文窗口比值在多少倍以内算 near（黄）。1 = 不给黄 */
  contextNearRatio: 2,
} as const;

// ── 反馈模型 ──

export type FeedbackState = 'hit' | 'near' | 'miss' | 'unknown';
export type Feedback = {
  /** hit=绿 near=黄 miss=灰 unknown=?（该属性未公开，不惩罚） */
  state: FeedbackState;
  /** up=答案更大/更新 down=答案更小/更早。仅数值属性（released/contextK/priceTier）非 hit 时给 */
  arrow: 'up' | 'down' | null;
};

/** 一行猜测的完整判定结果 */
export type GuessFeedback = {
  guessId: string;
  /** 按 ATTRIBUTE_KEYS 顺序的每属性反馈 */
  attributes: Record<AttributeKey, Feedback>;
  /** 猜中答案 */
  won: boolean;
};

/** 找不到该模型时抛给上层转 400 的语义错误（上层catch后原样返回给前端） */
export class GuessError extends Error {
  constructor(
    public code: 'unknown-model' | 'invalid-date',
    message: string,
  ) {
    super(message);
  }
}

// ── 属性归一：把数据集字段转成可比较的值；null = 未公开 ──

function monthIndex(released: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(released);
  if (!match) throw new GuessError('invalid-date', `bad released: ${released}`);
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

/** 玩家输入 → 模型（name 不区分大小写匹配；null = 没猜到）。
 *  数据集没有别名表，"chatgpt" 这类俗称搜不到——搜索框的子串匹配
 *  兜底大部分场景，别名表列为数据集后续增强项。 */
export function resolveGuess(name: string): GuessModel | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return GUESS_MODELS.find((m) => m.name.toLowerCase() === key) ?? null;
}

function judgeNumeric(
  guessValue: number | null,
  answerValue: number | null,
  nearThreshold: number,
): Feedback {
  // 未公开：只标 unknown，不给箭头（答案也不知道，方向无从谈起）
  if (guessValue === null || answerValue === null)
    return { state: 'unknown', arrow: null };
  if (guessValue === answerValue) return { state: 'hit', arrow: null };
  const arrow: 'up' | 'down' =
    answerValue > guessValue ? 'up' : 'down';
  // 「接近」= 差值不超过阈值（数值型：绝对差；比值型：倍数）
  const near =
    nearThreshold > 1
      ? Math.max(guessValue, answerValue) / Math.min(guessValue, answerValue) <=
        nearThreshold
      : Math.abs(guessValue - answerValue) <= nearThreshold;
  return { state: near ? 'near' : 'miss', arrow };
}

/**
 * 判定一次猜测（核心函数，双端共用）。
 * answerId 由服务端的每日一题派生给出；这里只做纯比较。
 */
export function judge(guess: GuessModel, answer: GuessModel): GuessFeedback {
  const attributes = {} as Record<AttributeKey, Feedback>;

  // 厂商：纯绿/灰
  attributes.vendor =
    guess.vendor === answer.vendor
      ? { state: 'hit', arrow: null }
      : { state: 'miss', arrow: null };

  // 发布时间：月序号比较；near 阈值按月
  attributes.released = judgeNumeric(
    monthIndex(guess.released),
    monthIndex(answer.released),
    GUESS_CONFIG.releasedNearMonths,
  );

  // 开放权重：二值
  attributes.openWeights =
    guess.openWeights === answer.openWeights
      ? { state: 'hit', arrow: null }
      : { state: 'miss', arrow: null };

  // 上下文窗口：比值接近（nearThreshold>1 走倍数分支）
  attributes.contextK = judgeNumeric(
    guess.contextK,
    answer.contextK,
    GUESS_CONFIG.contextNearRatio,
  );

  // 模态：全等=绿；有交集=黄；无交集=灰（答案集∩猜测集）
  const overlap = answer.modalities.filter((m) =>
    guess.modalities.includes(m),
  );
  attributes.modalities =
    guess.modalities.length === answer.modalities.length &&
    overlap.length === answer.modalities.length
      ? { state: 'hit', arrow: null }
      : overlap.length > 0
        ? { state: 'near', arrow: null }
        : { state: 'miss', arrow: null };

  // 推理模型：二值
  attributes.reasoning =
    guess.reasoning === answer.reasoning
      ? { state: 'hit', arrow: null }
      : { state: 'miss', arrow: null };

  // 价格档：档位比较；相邻档算 near
  attributes.priceTier = judgeNumeric(
    guess.priceTier === null ? null : guess.priceTier,
    answer.priceTier === null ? null : answer.priceTier,
    1.5, // 相邻档（差1）给黄，差2档给灰
  );

  return {
    guessId: guess.id,
    attributes,
    won: guess.id === answer.id,
  };
}

// ── 每日一题派生 ──
// 设计目标：① 同一天全世界同答案（分享的前提）② 不引随机源（可复现、
// React Compiler 与验证脚本都友好）③ 数据集加新模型不改变历史日期的答案
//（昨天晒的图今天不能变卦）。
//
// 方案：epoch 日期序号 → 首选「序号 % 存量表长度」，但数据集追加会移位。
// 因此用两层混合：seedOffset 固定，日期序号先加偏移再对长度取模。追加模型
// 只在「取模环回」那天改变答案——用 anchor 日期把环回点钉死在数据集冻结日，
// 冻结日之前的历史答案不受追加影响。

/** 数据集冻结锚点：模一把上线日（决策 057）。改它=重排所有历史答案，上线后勿动 */
export const GUESS_EPOCH = '2026-09-13';

/** UTC+8 日历日（模一把的「一天」按东八区切，中文社区同天讨论） */
export function guessDayKey(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + 8 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** 距 epoch 的天数（epoch=0）。用 Date.UTC 真历法差，不用月份近似——
 *  30 天近似会在长月/短月交界产生跳变，导致两天同题或跳题 */
export function dayNumber(date: Date = new Date()): number {
  const key = guessDayKey(date);
  const ms = Date.UTC(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    Number(key.slice(8, 10)),
  );
  const epochMs = Date.UTC(
    Number(GUESS_EPOCH.slice(0, 4)),
    Number(GUESS_EPOCH.slice(5, 7)) - 1,
    Number(GUESS_EPOCH.slice(8, 10)),
  );
  return Math.round((ms - epochMs) / 86400000);
}

/**
 * 每日答案：确定性派生，无随机源。
 * 不是简单的 (day % N)——数据集按知名度排序，同系列模型（qwen 家族等）
 * 在数组里相邻，直接取模会连续几天出同一家族，可玩性差。这里做两层
 * 散列混合：day 先乘素数再异或折叠，把相邻日期打散到数组的不同区域。
 * 数据集追加新模型只影响「散列值恰好落在新区间」的未来日期，历史答案
 * 保持稳定的前提是**新模型只追加在数组末尾**（见文件头注释）。
 */
export function answerForDate(date: Date = new Date()): GuessModel {
  // 负序号（上线前的日期）clamp 到 0：上线前不存在历史对局，统一给 epoch 题
  const n = Math.max(0, dayNumber(date));
  // 乘大素数取模折叠：散列分布均匀且完全确定（无随机源）
  const hash = (n * 2654435761) % 0xffffffff;
  const index = hash % GUESS_MODELS.length;
  return GUESS_MODELS[index];
}
