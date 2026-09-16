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
  /** 厂商国家/地区代码（VENDOR_REGION 映射）：厂商不同但同地区时厂商格给黄 */
  region: string;
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
  /** 难度分池（层叠，决策 081）：1 简单 / 2 普通 / 3 困难 / 4 地狱——
   *  语义是「最低从哪一档开始出现」：难度 k 的池 = difficulty ≤ k 的全部模型，
   *  越高的档越全（地狱 = 全库）。4 = 够冷够老，连困难都不进，只在地狱出现 */
  difficulty: GuessDifficulty;
  /** 每日派生生效日（dayNumber 口径）：后台追加的模型从该日起参与每日题
   *  取模，当天与历史答案不受追加影响；undefined = 主数据集基础槽，恒生效 */
  sinceDay?: number;
  /** 合并组 id（决策 061）：同线小版本并入一组只占一个答案槽，组内版本
   *  仍是独立可猜模型。undefined = 独立条目（自己就是一槽） */
  groupId?: string;
};

/** 四档难度（决策 060 三档 → 079 扩四档 → 081 改层叠）：池是**层叠包含**的——
 *  难度 k 的池 = difficulty ≤ k 的全部模型（简单 ⊂ 普通 ⊂ 困难 ⊂ 地狱=全库）。
 *  分池已冻结（validate:guess 的槽位指纹断言把关）——调整 difficulty 必须
 *  走 docs/games/guess.md 的「分池定稿」流程，不得随手改 */
export type GuessDifficulty = 1 | 2 | 3 | 4;
export const GUESS_DIFFICULTIES: GuessDifficulty[] = [1, 2, 3, 4];
/** 难度显示文案（zh/en），index 0-3 对应难度 1-4。
 *  中档用「普通」不用「中等」——「中等」已被价格档占用（en=Mid），文案表按中文键查 */
export const DIFFICULTY_INFO: { zh: string; en: string }[] = [
  { zh: '简单', en: 'Easy' },
  { zh: '普通', en: 'Common' },
  { zh: '困难', en: 'Hard' },
  { zh: '地狱', en: 'Hell' },
];

/** 某难度的候选池（层叠：difficulty ≤ k，保持数据集原序即热度降序） */
export function poolForDifficulty(
  models: GuessModel[],
  difficulty: GuessDifficulty,
): GuessModel[] {
  return models.filter((m) => m.difficulty <= difficulty);
}

/** 每日一题的答案池：普通池上限 = 2（层叠语义下 = difficulty ≤ 2，即简单+普通），
 *  困难与地狱不进每日——每日题是全球同题的分享型玩法，答案太冷门不利于传播 */
export const DAILY_DIFFICULTIES: readonly GuessDifficulty[] = [1, 2];
export function dailyPool(models: GuessModel[]): GuessModel[] {
  return models.filter((m) => m.difficulty <= 2);
}

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

/** 厂商 → 国家/地区（2026-09-14 用户拍板：厂商格「同国家给黄」——
 *  猜 xAI 答 OpenAI 都是美国给黄，中美跨国才是灰）。
 *  数据集 org 原文 → 地区代码；新增厂商必须在这里补行，
 *  validate:guess 断言没有未登记厂商（回落 '??' 只兜底不告警）。 */
export const VENDOR_REGION: Record<string, string> = {
  // 中国
  'DeepSeek': 'CN',
  'Moonshot AI': 'CN',
  'Zhipu AI (Z.ai)': 'CN',
  'MiniMax': 'CN',
  'Alibaba': 'CN',
  'Xiaomi': 'CN',
  'StepFun': 'CN',
  'Tencent': 'CN',
  'Baidu': 'CN',
  'ByteDance': 'CN',
  '01.AI': 'CN',
  'inclusionAI': 'CN',
  'Meituan': 'CN',
  // 美国
  'OpenAI': 'US',
  'Anthropic': 'US',
  'Google': 'US',
  'Meta': 'US',
  'xAI': 'US',
  'Microsoft': 'US',
  'Thinking Machines': 'US',
  'LMSYS': 'US',
  'Stanford': 'US',
  'NVIDIA': 'US',
  'Poolside': 'US',
  'Amazon': 'US',
  'Inception': 'US',
  'Aion Labs': 'US',
  'Sao10K': 'US',
  'IBM': 'US',
  // 法国
  'Mistral': 'FR',
  // 韩国
  'Upstage': 'KR',
};

function priceBandOf(priceOut: number | null): number | null {
  if (priceOut === null || !Number.isFinite(priceOut)) return null;
  for (let i = 0; i < PRICE_BAND_EDGES.length; i++)
    if (priceOut < PRICE_BAND_EDGES[i]) return i;
  return PRICE_BAND_EDGES.length;
}

export type RawModel = {
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
  difficulty?: number;
  /** 每日派生生效日（dayNumber）；主数据集不写此字段（恒生效）。
   *  增量条目必填（registerExtraModels 校验）——缺了会落进基础槽改历史答案 */
  sinceDay?: number;
  variants?: RawModel[];
};

function toModel(entry: RawModel, group?: RawModel): GuessModel {
  return {
    id: entry.id,
    name: entry.name,
    vendor: entry.org,
    region: VENDOR_REGION[entry.org] ?? '??',
    released: `${entry.year}-${String(entry.month).padStart(2, '0')}`,
    openWeights: entry.openWeights,
    contextK: entry.contextK,
    modalities: entry.modality.split('+') as GuessModel['modalities'],
    reasoning: entry.reasoning,
    priceOut: entry.priceOut,
    priceTier: priceBandOf(entry.priceOut),
    popularity: entry.popularity,
    // 数据集写 number；合法值域由 validate:guess 断言，这里收窄类型。
    // 组内变体不带 difficulty，继承组的分池归属（分池以组为单位）
    difficulty: (entry.difficulty ?? group?.difficulty) as GuessDifficulty,
    sinceDay: entry.sinceDay ?? group?.sinceDay,
    groupId: group?.id,
  };
}

// 合并组（决策 061）：带 variants 的条目展开为「组内每个小版本一个可猜模型」，
// 组条目本身（"Qwen3.x 27B" 这种占位名）不可猜也不可当答案——答案抽中组后
// 再实例化为某个版本（见 answerForDate）
function normalizeEntry(entry: RawModel): GuessModel[] {
  if (!entry.variants?.length) return [toModel(entry)];
  return entry.variants.map((v) => toModel(v, entry));
}

export const GUESS_MODELS: GuessModel[] = rawData.models.flatMap(normalizeEntry);
export const modelById = new Map(GUESS_MODELS.map((m) => [m.id, m]));

// ── 后台增量模型 ──
// 后台「模一把」页手动追加的新模型存 data/guess-models-extra.json（服务器
// 本地数据，不入库），服务端启动时读出并调 registerExtraModels 追加到
// GUESS_MODELS 末尾。追加条目带 sinceDay（服务端写入 = 追加次日）：立即
// 可被猜、进练习池；从次日起才参与每日题派生（answerForDate 的追加槽
// 机制），当天与历史答案不受影响。前端从不调用它：浏览器包里只有基础集，
// 候选数据走 /api/guess/today 下发，本函数只影响服务端持有的那份。

/** 增量文件（data/guess-models-extra.json）格式 */
export type ExtraModelsFile = {
  /** 新厂商的地区登记（org 原文 → 地区码），合并进 VENDOR_REGION */
  vendorRegions?: Record<string, string>;
  /** 与主数据集同口径的条目；只允许独立条目（合并组请维护主数据集） */
  models?: RawModel[];
};

/**
 * 注册增量模型：先合并厂商地区映射（toModel 取 region 依赖它），再把条目
 * 展开追加到数据集末尾。追加契约（2026-09-15 收紧）：增量条目**必须带
 * sinceDay**——缺了会落进基础槽，改变当天与全部历史的每日答案；合并组
 * （variants）只允许维护主数据集，这里拒收。id 冲突（含批次内）或格式
 * 非法抛 GuessError——启动时让 server 记日志、接口层转 400；vendorRegions
 * 在批次失败时整体回滚，不残留半套映射。
 */
export function registerExtraModels(extra: ExtraModelsFile): number {
  // 地区映射先记快照：批次校验失败时回滚（两阶段提交对 vendorRegions 也成立）
  const savedRegions: [string, string | undefined][] = [];
  if (extra.vendorRegions)
    for (const [org, region] of Object.entries(extra.vendorRegions)) {
      savedRegions.push([org, VENDOR_REGION[org]]);
      VENDOR_REGION[org] = region;
    }
  const rollbackRegions = () => {
    for (const [org, old] of savedRegions)
      if (old === undefined) delete VENDOR_REGION[org];
      else VENDOR_REGION[org] = old;
  };
  // 两阶段：先整体归一与查重，全部通过才合并——坏条目不让前面的条目
  // 残留在数据集里（启动时每次重放都停在同一个坏条目，等于后面的全丢）
  const batch: GuessModel[] = [];
  const batchIds = new Set<string>();
  try {
    for (const entry of extra.models ?? []) {
      if (entry.variants?.length)
        throw new GuessError(
          'unknown-model',
          `增量模型不支持合并组（请维护主数据集）: ${entry.name}`,
        );
      if (!Number.isInteger(entry.sinceDay) || (entry.sinceDay ?? -1) < 0)
        throw new GuessError(
          'unknown-model',
          `增量模型必须带 sinceDay（每日派生生效日，dayNumber 口径）: ${entry.name}`,
        );
      for (const m of normalizeEntry(entry)) {
        if (modelById.has(m.id) || batchIds.has(m.id))
          throw new GuessError('unknown-model', `增量模型 id 重复: ${m.id}`);
        batchIds.add(m.id);
        batch.push(m);
      }
    }
  } catch (error) {
    rollbackRegions();
    throw error;
  }
  for (const m of batch) {
    GUESS_MODELS.push(m);
    modelById.set(m.id, m);
  }
  return batch.length;
}

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

  // 厂商：同厂商=绿；不同厂商但同国家/地区=黄（如 xAI 与 OpenAI 同为美国）；
  // 跨国=灰。无箭头。地区映射见 VENDOR_REGION
  attributes.vendor =
    guess.vendor === answer.vendor
      ? { state: 'hit', arrow: null }
      : guess.region === answer.region
        ? { state: 'near', arrow: null }
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

  // 价格档：档位序数比较（0-4）。相邻档（差 1）给黄、差 ≥2 给灰 + 箭头。
  // 不走 judgeNumeric——它的比值分支会把 0↔1（1/0=∞）和 1↔2（2>1.5 倍）
  // 误判成灰，相邻档的黄灯在低档位区间整体失效（2026-09-14 修复）
  if (guess.priceTier === null || answer.priceTier === null) {
    attributes.priceTier = { state: 'unknown', arrow: null };
  } else if (guess.priceTier === answer.priceTier) {
    attributes.priceTier = { state: 'hit', arrow: null };
  } else {
    attributes.priceTier = {
      state:
        Math.abs(guess.priceTier - answer.priceTier) === 1 ? 'near' : 'miss',
      arrow: answer.priceTier > guess.priceTier ? 'up' : 'down',
    };
  }

  return {
    guessId: guess.id,
    attributes,
    won: guess.id === answer.id,
  };
}

// ── 每日一题派生 ──
// 设计目标：① 同一天全世界同答案（分享的前提）② 不引随机源（可复现、
// React Compiler 与验证脚本都友好）③ 往数据集追加新模型不改变任何已发布
// 日期（含当天）的答案——昨天晒的图今天不能变卦，正在进行的对局更不能
// 被换答案。
//
// 方案（2026-09-14 修复版）：槽分「基础 / 追加」两类。基础槽 = 主数据集
// （上线后冻结，只允许末尾追加），槽序永远稳定；追加槽 = 后台增量条目，
// 带 sinceDay（生效日），只从该日起参与当日取模。某日的模数 = 基础槽数 +
// 当日已生效的追加槽数——新追加的条目 sinceDay 在明天，今天与历史日期的
// 模数和槽序都不动，答案一个不变。不能用「散列值 % 全量槽数」：池子变长
// 会让几乎所有日期取模移位（98→100 槽实测 60 天里 58 天换答案）。

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
 * 散列混合：day 先乘素数再折叠，把相邻日期打散到数组的不同区域。
 *
 * 难度（决策 060/079/081）：池是层叠的——难度 k 的池 = difficulty ≤ k 的模型
 * （poolForDifficulty），档越高池越全；同一天各档的答案各自独立；
 * dayNumber 共享，分享文案按难度区分。
 * 池内下标散列，所以**调整某模型的 difficulty 会重排历史答案**（层叠下会
 * 波及 ≥该档的所有池）——与追加契约同理，难度归档冻结（validate:guess
 * 槽位指纹断言把关），只能用户显式拍板后走 guess.md 的「分池定稿」流程。
 *
 * 合并组（决策 061）：同线小版本（如 Qwen3.5/3.6/3.8 27B）在数据集里并入
 * 一个组条目，答案池里只占一个槽——否则五六个近亲会把同一张脸刷成常客。
 * 两级派生：第一层散列选答案槽（组或独立条目）；第二层在组内按「该槽第
 * 几次被抽中」轮转实例化版本——比再散一次列可靠（哈希命中序列模组大小
 * 不保证全覆盖），且每次命中换一个版本，组题连续出现时呈现不同小版本。
 * 玩家视角：猜中邻近版本会拿到「全绿只差月份」的反馈，由此推出正确版本号。
 *
 * 追加契约（见上方「每日一题派生」注释）：基础槽序冻结 + 追加槽 sinceDay
 * 起才并入模数。validate:guess 有「追加不改今日及历史答案」的回归断言。
 */
export function answerForDate(
  date: Date = new Date(),
  pool: GuessModel[] = GUESS_MODELS,
): GuessModel {
  // 负序号（上线前的日期）clamp 到 0：上线前不存在历史对局，统一给 epoch 题
  const n = Math.max(0, dayNumber(date));
  // 第一层：答案槽去重（同组只占一槽），保持池内首次出现顺序保证确定性
  const slots = new Map<string, GuessModel[]>();
  for (const m of pool) {
    const key = m.groupId ?? m.id;
    const slot = slots.get(key);
    if (slot) slot.push(m);
    else slots.set(key, [m]);
  }
  // 基础槽 / 追加槽分流（「追加不改历史」的关键，见函数头注释）
  const baseSlots: GuessModel[][] = [];
  const extraSlots: GuessModel[][] = [];
  for (const slot of slots.values())
    (slot[0].sinceDay === undefined ? baseSlots : extraSlots).push(slot);
  const select = (d: number): GuessModel[] => {
    const h = (d * 2654435761) % 0xffffffff;
    const eligible = extraSlots.filter((s) => (s[0].sinceDay ?? 0) <= d);
    const r = h % (baseSlots.length + eligible.length);
    return r < baseSlots.length ? baseSlots[r] : eligible[r - baseSlots.length];
  };
  const slot = select(n);
  if (slot.length === 1) return slot[0];
  // 第二层：第 hitCount 次命中该槽取第 hitCount 个版本（轮转，天然全覆盖；
  // 扫描历史命中次数只依赖 dayNumber 与常量，O(n)、每日一次量级无压力）
  let hits = 0;
  for (let d = 0; d < n; d++) if (select(d) === slot) hits++;
  return slot[hits % slot.length];
}
