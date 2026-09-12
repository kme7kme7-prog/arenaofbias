// 开发者占位符系统 —— 仅在开发者面板手动开启后生效。
// 用途：真实模型作品体积过大无法入库时，按题库自动生成可区分的占位作品，
// 演示配对、投票、榜单等机制。与真实数据严格隔离：
//   - 不写入作品数据源，开启时作为独立数据源读取（真实数据 = 服务端已发布
//     清单 lib/works.ts，未拉到时回退 lib/arena.ts 的内置花名册，决策 040）；
//   - 占位投票只存 localStorage，永不进入后端；
//   - 后期剥离：删除本文件、components/dev-panel.tsx、app/dev.css 与
//     scripts/validate-placeholder.mjs，并把各调用点的 current* 帮助函数
//     还原为对应数据源的默认调用即可。
// 本文件除 lib/arena.ts、lib/prompts.ts 与 lib/works.ts 外不依赖任何模块，纯函数不触碰
// localStorage 的部分可在 Node 校验脚本（scripts/validate-placeholder.mjs）中直接运行。

import {
  eligiblePairs,
  pickMatchup,
  randomArenaHash,
  resultsForPrompt,
} from '@/lib/arena';
import type { Matchup, ModelResult, Prompt } from '@/lib/arena';
import { pickMatchedMatchup } from '@/lib/matchmaking';
import { currentPrompts } from '@/lib/prompts';
import { currentRatings } from '@/lib/ratings';
import { currentWorks } from '@/lib/works';

// ---------------------------------------------------------------------------
// 设置与存储
// ---------------------------------------------------------------------------

const DEV_SETTINGS_KEY = 'arenaofbias:dev';
const PLACEHOLDER_VOTES_KEY = 'arenaofbias:placeholder-votes';

export type DevSettings = {
  placeholderMode: boolean;
  placeholderModelCount: number;
  /** 随机强弱：开启后每次生成占位投票都重新随机名次格局（观察榜单换位动画用） */
  randomStrength: boolean;
};

const DEFAULT_SETTINGS: DevSettings = {
  placeholderMode: false,
  placeholderModelCount: 8,
  randomStrength: false,
};

function clampModelCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.placeholderModelCount;
  return Math.min(16, Math.max(2, Math.floor(n)));
}

export function readDevSettings(): DevSettings {
  try {
    const raw =
      typeof localStorage === 'undefined'
        ? null
        : localStorage.getItem(DEV_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<DevSettings>;
    return {
      placeholderMode: parsed.placeholderMode === true,
      placeholderModelCount: clampModelCount(parsed.placeholderModelCount),
      randomStrength: parsed.randomStrength === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeDevSettings(settings: DevSettings) {
  try {
    localStorage.setItem(DEV_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 存储不可用时静默失败：面板是开发工具，不值得打断页面
  }
}

export function isPlaceholderMode(): boolean {
  return readDevSettings().placeholderMode;
}

// ---------------------------------------------------------------------------
// 稳定伪随机（同一输入永远得到同一输出，刷新/重建后内容不变）
// ---------------------------------------------------------------------------

export function hashSeed(...parts: string[]): number {
  let h = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h = (Math.imul(h ^ 0x9e3779b9, 2654435761)) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// 占位模型阵容：同一批模型出现在所有题，保证榜单跨题聚合语义与真实模型一致
// ---------------------------------------------------------------------------

export type PlaceholderModel = {
  id: string;
  name: string;
  accent: string;
};

const PLACEHOLDER_PALETTE = [
  '#d9fb51',
  '#4fd1ff',
  '#ff7a6b',
  '#b28dff',
  '#5cf2a0',
  '#ffb84d',
  '#ff5c9e',
  '#7ea2ff',
  '#d4ff5c',
  '#5cc8ff',
  '#ff9d5c',
  '#c95cff',
];

export function placeholderModels(count: number): PlaceholderModel[] {
  const total = clampModelCount(count);
  return Array.from({ length: total }, (_, index) => {
    const nn = String(index + 1).padStart(2, '0');
    return {
      id: `ph-${nn}`,
      name: `占位 · 模型 ${nn}`,
      accent: PLACEHOLDER_PALETTE[index % PLACEHOLDER_PALETTE.length],
    };
  });
}

// 每题的占位作品语境词（如"模型 07 · 体素建筑"）
const PLACEHOLDER_WORK_LABEL: Record<string, string> = {
  '001': 'SVG 鹈鹕',
  '002': '最后一封信',
  '003': '月球旅行页',
  '004': '体素建筑',
  '005': '体素山水',
  '006': '机能落地页',
  '007': '黑洞模拟',
};

function workLabel(prompt: Prompt): string {
  return PLACEHOLDER_WORK_LABEL[prompt.id] ?? prompt.name;
}

// ---------------------------------------------------------------------------
// 文字题（002）占位内容：结构与 stories.a 完全一致，长度按模型播种
// ---------------------------------------------------------------------------

const STORY_SENTENCES = [
  '这是一份占位作品，用来填满界面直到真实结果到来。',
  '写下这句话的时候，没有任何模型真正思考过它。',
  '占位符的世界里，所有观点都同样正确，也 equally 空洞。',
  '如果这段文字让你停下来想了想，说明排版已经及格了。',
  '根据种子计算，本段落在重建后仍会一字不差。',
  '真实作品会替换这里的一切，包括这个略显心虚的语气。',
  '字数的差异也是设计的一部分：有的模型啰嗦，有的克制。',
  '请忽略内容本身，关注滚动节奏与卡片表现。',
  '这句话存在的唯一意义，是让段落看起来像一篇文章。',
  '占位文本不需要文采，但需要足够的长度来测试巡览。',
];

function placeholderStory(prompt: Prompt, model: PlaceholderModel) {
  const rng = mulberry32(hashSeed(model.id, prompt.id));
  const nn = model.id.slice(3);
  const paragraphCount = 4 + Math.floor(rng() * 3);
  const paragraphs = Array.from({ length: paragraphCount }, () => {
    const sentenceCount = 2 + Math.floor(rng() * 3);
    return Array.from({ length: sentenceCount }, () => {
      const pick = STORY_SENTENCES[Math.floor(rng() * STORY_SENTENCES.length)];
      return pick;
    }).join('');
  });
  return {
    heading: `占位作品 · 模型 ${nn} 的信`,
    paragraphs,
    ending: `占位数据 / PH-${nn} · 不计入统计`,
  };
}

// ---------------------------------------------------------------------------
// 网页题（001/003–007）占位内容：内联 HTML，纯 CSS 动画，无外部依赖
// ---------------------------------------------------------------------------

function placeholderHtml(prompt: Prompt, model: PlaceholderModel): string {
  const rng = mulberry32(hashSeed(model.id, prompt.id));
  const nn = model.id.slice(3);
  const variant = Math.floor(rng() * 3);
  const itemCount = 5 + Math.floor(rng() * 4);
  const speed = 5 + Math.floor(rng() * 7);

  const stage = ((): string => {
    if (variant === 0) {
      const bars = Array.from({ length: itemCount }, (_, i) => {
        const width = 18 + Math.floor(rng() * 64);
        const delay = (rng() * speed).toFixed(2);
        const duration = (speed * (0.6 + rng() * 0.8)).toFixed(2);
        return `<div class="ph-bar-row"><span>PASS ${String(i + 1).padStart(2, '0')}</span><div class="ph-bar-track"><div class="ph-bar-fill" style="width:${width}%;animation-duration:${duration}s;animation-delay:-${delay}s"></div></div><b>${width}%</b></div>`;
      }).join('');
      return `<div class="ph-bars">${bars}</div>`;
    }
    if (variant === 1) {
      const dots = Array.from({ length: itemCount + 3 }, () => {
        const radius = 14 + Math.floor(rng() * 30);
        const size = 4 + Math.floor(rng() * 8);
        const duration = (speed * (0.5 + rng())).toFixed(2);
        const tilt = Math.floor(rng() * 180);
        return `<i class="ph-orbit" style="--r:${radius}%;width:${size}px;height:${size}px;animation-duration:${duration}s;transform:rotate(${tilt}deg) translateX(var(--r))"></i>`;
      }).join('');
      return `<div class="ph-orbits"><div class="ph-core">${nn}</div>${dots}</div>`;
    }
    const cells = Array.from({ length: itemCount * 4 }, () => {
      const on = rng() > 0.4;
      const delay = (rng() * speed).toFixed(2);
      const duration = (speed * (0.4 + rng() * 0.6)).toFixed(2);
      return `<i class="${on ? 'ph-cell on' : 'ph-cell'}" style="animation-duration:${duration}s;animation-delay:-${delay}s"></i>`;
    }).join('');
    return `<div class="ph-blocks">${cells}</div>`;
  })();

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>占位 · 模型 ${nn} · ${workLabel(prompt)}</title>
<style>
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;overflow:hidden;background:#141814;color:#edf3e8;display:flex;flex-direction:column;font:12px/1.5 ui-monospace,Consolas,monospace}
body::before{content:"";position:fixed;inset:0;border:1px solid ${model.accent}4d;pointer-events:none;margin:6px}
.ph-top{display:flex;justify-content:space-between;padding:14px 18px 0;color:#788773;font-size:10px;letter-spacing:.18em}
.ph-main{flex:1;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:0 18px}
h1{margin:0;font-size:clamp(28px,7vw,54px);line-height:1.05;color:${model.accent}}
.ph-sub{margin:0;color:#aab69f}
.ph-sub b{color:#edf3e8}
.ph-stage{flex:1;min-height:120px;max-height:46vh;display:flex;align-items:center}
.ph-bars{width:100%;display:flex;flex-direction:column;gap:9px}
.ph-bar-row{display:flex;align-items:center;gap:10px;color:#788773;font-size:10px}
.ph-bar-row span{width:52px;text-align:right}
.ph-bar-track{flex:1;height:8px;background:#232b24;overflow:hidden}
.ph-bar-fill{height:100%;background:${model.accent};animation:ph-grow ease-in-out infinite alternate}
@keyframes ph-grow{from{transform:scaleX(.25);transform-origin:left}to{transform:scaleX(1);transform-origin:left}}
.ph-bar-row b{width:36px;font-size:10px;color:#aab69f}
.ph-orbits{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.ph-core{position:relative;z-index:1;width:74px;height:74px;border:2px solid ${model.accent};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;color:${model.accent};background:#141814}
.ph-orbit{position:absolute;border-radius:50%;background:${model.accent};animation:ph-spin linear infinite}
@keyframes ph-spin{to{transform:rotate(360deg) translateX(var(--r))}}
.ph-blocks{display:grid;grid-template-columns:repeat(${itemCount},1fr);gap:6px;width:100%}
.ph-cell{height:26px;background:#232b24;opacity:.5}
.ph-cell.on{background:${model.accent};animation:ph-blink steps(1) infinite}
@keyframes ph-blink{0%{opacity:1}50%{opacity:.25}100%{opacity:1}}
.ph-foot{padding:0 18px 12px;color:#788773;font-size:10px;text-align:right}
</style>
</head>
<body>
<div class="ph-top"><span>PLACEHOLDER WORK</span><span>PH-${nn} / ${prompt.code}</span></div>
<div class="ph-main">
<h1>模型 ${nn}</h1>
<p class="ph-sub"><b>${workLabel(prompt)}</b> · ${prompt.name} · 占位生成</p>
<div class="ph-stage">${stage}</div>
</div>
<div class="ph-foot">开发者模式生成 · 不代表任何真实模型水平</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 占位结果集：每题 × 每模型一份，id 唯一，跨题复用同一 modelId
// ---------------------------------------------------------------------------

export function buildPlaceholderResults(modelCount: number): ModelResult[] {
  const models = placeholderModels(modelCount);
  const results: ModelResult[] = [];
  // 按当前生效题库生成（动态题库，决策 045）：后台新增的题也有占位作品可演示
  for (const prompt of currentPrompts()) {
    for (const model of models) {
      const nn = model.id.slice(3);
      results.push({
        id: `${prompt.id}-${model.id}`,
        promptId: prompt.id,
        modelId: model.id,
        modelName: model.name,
        title: `模型 ${nn} · ${workLabel(prompt)}`,
        content:
          prompt.kind === 'text'
            ? { kind: 'text', story: placeholderStory(prompt, model) }
            : { kind: 'html', html: placeholderHtml(prompt, model) },
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 当前生效数据源：占位模式关闭时返回真实数据，真实数据优先用服务端已发布清单
// （lib/works.ts，决策 040），未拉到时回退 arena.ts 的内置花名册——两份清单
// 同构，站点行为不因加载失败而变化
// ---------------------------------------------------------------------------

let placeholderCache: { key: string; results: ModelResult[] } | null = null;

export function currentResults(): ModelResult[] {
  const settings = readDevSettings();
  if (!settings.placeholderMode) return currentWorks();
  const key = `ph:${settings.placeholderModelCount}`;
  if (placeholderCache?.key === key) return placeholderCache.results;
  const results = buildPlaceholderResults(settings.placeholderModelCount);
  placeholderCache = { key, results };
  return placeholderCache.results;
}

export function currentResultsForPrompt(promptId: string): ModelResult[] {
  return resultsForPrompt(promptId, currentResults());
}

export function currentPairs(promptId: string): Matchup[] {
  return eligiblePairs(promptId, currentResults());
}

export function currentMatchup(
  promptId: string,
  previous?: Matchup,
): Matchup | null {
  // 占位模式维持纯随机（占位作品无真实票，声望分对它无意义）；
  // 真实模式走软性匹配（决策 046）：按声望分同档优先，避开处刑局
  if (isPlaceholderMode()) {
    return pickMatchup(promptId, previous, Math.random, currentResults());
  }
  return pickMatchedMatchup(
    promptId,
    currentResults(),
    currentRatings(),
    previous,
    Math.random,
  );
}

export function currentRandomArenaHash(excludeId?: string): string {
  return randomArenaHash(excludeId, Math.random, currentResults(), currentPrompts());
}

// ---------------------------------------------------------------------------
// 占位投票：仅 localStorage，用于榜单界面演示；每个模型有稳定的隐藏强弱，
// 生成的榜单有明显的梯度而非均匀分布
// ---------------------------------------------------------------------------

export type PlaceholderVote = {
  promptId: string;
  winnerId: string;
  loserId: string;
  ts: number;
};

export function generatePlaceholderVotes(count = 200): PlaceholderVote[] {
  const settings = readDevSettings();
  const models = placeholderModels(settings.placeholderModelCount);
  // 随机强弱：掺入生成时间与随机盐，每次生成重掷整套强弱（名次格局会变，
  // 便于观察榜单换位动画）。默认关闭，走固定种子，同一阵容名次可复现。
  // 注意关闭分支的种子必须保持原样，否则会悄悄改变既有稳定名次。
  const generationSalt = settings.randomStrength
    ? `${Date.now()}:${Math.random()}`
    : '';
  const strength = new Map(
    models.map((model) => [
      model.id,
      0.6 +
        mulberry32(
          generationSalt
            ? hashSeed('strength', model.id, generationSalt)
            : hashSeed('strength', model.id),
        )() *
          0.8,
    ]),
  );
  const rng = mulberry32(hashSeed('votes', String(Date.now())));
  const now = Date.now();
  const votes: PlaceholderVote[] = [];
  for (let i = 0; i < count; i++) {
    const pool = currentPrompts();
    const prompt = pool[Math.floor(rng() * pool.length)];
    const left = models[Math.floor(rng() * models.length)];
    let right = models[Math.floor(rng() * models.length)];
    while (right.id === left.id)
      right = models[Math.floor(rng() * models.length)];
    const leftScore = (strength.get(left.id) ?? 1) * (0.75 + rng() * 0.5);
    const rightScore = (strength.get(right.id) ?? 1) * (0.75 + rng() * 0.5);
    const winner = leftScore >= rightScore ? left : right;
    const loser = winner === left ? right : left;
    votes.push({
      promptId: prompt.id,
      winnerId: winner.id,
      loserId: loser.id,
      ts: now - Math.floor(rng() * 1000 * 60 * 60 * 24 * 7),
    });
  }
  return votes.sort((a, b) => a.ts - b.ts);
}

export function readPlaceholderVotes(): PlaceholderVote[] {
  try {
    const raw =
      typeof localStorage === 'undefined'
        ? null
        : localStorage.getItem(PLACEHOLDER_VOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 只保留当前阵容内的投票：切换模型数量后，旧阵容的票引用着当前不存在的
    // 模型 id（面板切换时已在写入侧清空，这里兜底手工改 localStorage 的残留）
    const lineup = new Set(
      placeholderModels(readDevSettings().placeholderModelCount).map(
        (model) => model.id,
      ),
    );
    return parsed.filter(
      (vote): vote is PlaceholderVote =>
        typeof vote?.promptId === 'string' &&
        typeof vote?.winnerId === 'string' &&
        typeof vote?.loserId === 'string' &&
        typeof vote?.ts === 'number' &&
        lineup.has(vote.winnerId) &&
        lineup.has(vote.loserId),
    );
  } catch {
    return [];
  }
}

export function writePlaceholderVotes(votes: PlaceholderVote[]) {
  try {
    localStorage.setItem(PLACEHOLDER_VOTES_KEY, JSON.stringify(votes));
  } catch {
    // 同 readDevSettings：存储不可用时静默失败
  }
}

export function clearPlaceholderVotes() {
  try {
    localStorage.removeItem(PLACEHOLDER_VOTES_KEY);
  } catch {
    // 同上
  }
}

/**
 * 竞技场内亲手投出的一票（占位模式）：写入本地占位投票，让榜单演示形成闭环。
 * 去重口径与真实投票一致——同题同模型对（占位阵容每模型每题一份作品，
 * 模型对即对局）只计一次；返回 false 表示这一对已经投过。
 */
export function appendPlaceholderVote(
  vote: Omit<PlaceholderVote, 'ts'>,
): boolean {
  const existing = readPlaceholderVotes();
  const pairOf = (v: Omit<PlaceholderVote, 'ts'>) =>
    [v.winnerId, v.loserId].sort().join('+');
  const incoming = pairOf(vote);
  if (
    existing.some(
      (item) => item.promptId === vote.promptId && pairOf(item) === incoming,
    )
  )
    return false;
  existing.push({ ...vote, ts: Date.now() });
  existing.sort((a, b) => a.ts - b.ts);
  writePlaceholderVotes(existing);
  return true;
}
