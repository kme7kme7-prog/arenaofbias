// 作品清单（身份 + 展示内容）存 lib/works-roster.json，三处共享同一份：
// 前端内置兜底（下方 modelResults）、服务端 works 表的种子（server/index.js）、
// 服务端投票校验的数据基础（经 works 表）。正常运行时前端以服务端
// GET /api/works 返回的已发布作品为准（lib/works.ts），本文件这份是启动前与
// 拉取失败时的回退。新增作品只改这一处 JSON。
import rosterData from './works-roster.json';
import promptsSeed from './prompts-seed.json';

export type Side = 'a' | 'b';
export type Phase =
  | 'loading'
  | 'intro'
  | 'voting'
  | 'locking'
  | 'result'
  | 'transition';
export type Mode = 'blind' | 'party' | 'formal';
export type ArenaState = {
  phase: Phase;
  round: number;
  pendingRound: number;
  run: number;
  mode: Mode;
  /** choice = 'draw'：「无法抉择」平局票（决策 048），揭晓时两侧都不显示选中态 */
  choice: Side | 'draw' | null;
};
export type ArenaAction =
  | { type: 'LOADED' | 'READY' | 'REVEAL' | 'ARRIVE' | 'REPLAY' }
  | { type: 'VOTE'; side: Side | 'draw' }
  | { type: 'SWITCH'; round: number }
  | { type: 'MODE'; mode: Mode };

export const initialState: ArenaState = {
  phase: 'loading',
  round: 0,
  pendingRound: 0,
  run: 0,
  mode: 'blind',
  choice: null,
};

export function arenaReducer(
  state: ArenaState,
  action: ArenaAction,
  // SWITCH 的越界守卫；动态题库（lib/prompts.ts）下由调用方传当前题目数
  promptCount = prompts.length,
): ArenaState {
  switch (action.type) {
    case 'LOADED':
      return state.phase === 'loading' ? { ...state, phase: 'intro' } : state;
    case 'READY':
      return state.phase === 'intro' ? { ...state, phase: 'voting' } : state;
    case 'VOTE':
      return state.phase === 'voting'
        ? { ...state, phase: 'locking', choice: action.side }
        : state;
    case 'REVEAL':
      return state.phase === 'locking' ? { ...state, phase: 'result' } : state;
    case 'SWITCH':
      return state.phase === 'loading' ||
        state.phase === 'transition' ||
        action.round < 0 ||
        !Number.isInteger(action.round) ||
        action.round >= promptCount
        ? state
        : { ...state, phase: 'transition', pendingRound: action.round };
    case 'ARRIVE':
      return state.phase === 'transition'
        ? {
            ...state,
            round: state.pendingRound,
            run: state.run + 1,
            phase: 'intro',
            choice: null,
          }
        : state;
    case 'REPLAY':
      return state.phase === 'loading' || state.phase === 'transition'
        ? state
        : { ...state, phase: 'transition', pendingRound: state.round };
    case 'MODE':
      return state.phase === 'loading' ||
        state.phase === 'transition' ||
        state.mode === action.mode
        ? state
        : {
            ...state,
            mode: action.mode,
            phase: 'transition',
            pendingRound: state.round,
          };
  }
}

export type Prompt = {
  id: string;
  kind: 'image' | 'text' | 'web';
  category: string;
  code: string;
  name: string;
  prompt: string;
  commentary: string;
  detail: string;
  /** 六维权重（决策 093，与 RADAR_DIMENSIONS 同序）：缺省 = 未配置 → 六维均分兜底 */
  weights?: number[];
};

// 题目清单存 lib/prompts-seed.json，两处共享同一份：前端内置兜底（下方 prompts）、
// 服务端 prompts 表的种子（server/index.js，迁移 003）。正常运行时前端以服务端
// GET /api/prompts 返回的已发布题目为准（lib/prompts.ts），本文件这份是启动前
// 与拉取失败时的回退；后台题目管理（决策 045）落库后，新增题目不再改这里。
const seedPrompts = promptsSeed as unknown as Prompt[];
for (const prompt of seedPrompts) {
  // 种子漏配身份字段会在启动时立刻暴露
  if (
    !/^\d{3}$/.test(String(prompt.id)) ||
    (prompt.kind !== 'image' &&
      prompt.kind !== 'text' &&
      prompt.kind !== 'web') ||
    !prompt.name ||
    !prompt.prompt
  )
    throw new Error(
      `lib/prompts-seed.json 的题目 ${String(prompt.id)} 缺少必要字段或 kind 非法`,
    );
  // weights 可缺省（未配置 → 六维均分），配了就必须是合法的六维权重
  if (
    prompt.weights !== undefined &&
    (!Array.isArray(prompt.weights) ||
      prompt.weights.length !== 6 ||
      !prompt.weights.every(
        (w) => typeof w === 'number' && Number.isFinite(w) && w >= 0 && w <= 1,
      ) ||
      Math.abs(prompt.weights.reduce((sum, w) => sum + w, 0) - 1) > 0.01)
  )
    throw new Error(
      `lib/prompts-seed.json 的题目 ${String(prompt.id)} weights 须为合计 1 的六维权重`,
    );
}
export const prompts: Prompt[] = seedPrompts;

// Legacy state-machine name; a round index now identifies a prompt only.
export const rounds = prompts;

export type Story = {
  /** 缺省 = 无标题作品（如 008 聊天回复），渲染时不出 h3 */
  heading?: string;
  paragraphs: string[];
  /** 缺省 = 不落款，渲染时不出 footer */
  ending?: string;
};

/** 视角校准（决策 102）：OrbitControls 相机位与目标点，服务端注入桥时套用 */
export type WorkCamera = { position: number[]; target: number[] };

export type ResultContent =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'text'; story: Story }
  | { kind: 'web'; template: Side }
  | { kind: 'html'; src: string; framing?: { width: number; height: number; zoom: number; offsetX: number; offsetY: number }; camera?: WorkCamera }
  | { kind: 'html'; html: string; framing?: { width: number; height: number; zoom: number; offsetX: number; offsetY: number } };

export type ModelResult = {
  id: string;
  promptId: string;
  modelId: string;
  modelName: string;
  title: string;
  isDemo?: boolean;
  content: ResultContent;
};

// Seed results are independent records: append any number of results for a prompt.
// 这份数组是「内置兜底清单」：站点在拉到服务端作品清单（lib/works.ts → GET /api/works）
// 之前、或拉取失败时使用；服务端首次启动时也用它作 works 表的种子。
const KNOWN_CONTENT_KINDS = new Set(['image', 'text', 'web', 'html']);
/** 作品 content.kind 的合法值（works.ts 解析远端行时复用同一白名单） */
export const knownContentKinds = KNOWN_CONTENT_KINDS;
const roster = rosterData as unknown as ModelResult[];
for (const work of roster) {
  // JSON 手改漏配 content 会在启动时立刻暴露，而不是渲染成空白作品
  if (
    !work.id ||
    !work.promptId ||
    !work.modelId ||
    !work.content ||
    !KNOWN_CONTENT_KINDS.has(work.content.kind)
  )
    throw new Error(
      `lib/works-roster.json 的作品 ${String(work.id)} 缺少身份字段或有效的 content`,
    );
}
export const modelResults: ModelResult[] = roster;

export type Matchup = [ModelResult, ModelResult];

export function resultsForPrompt(promptId: string, results = modelResults) {
  return results.filter((result) => result.promptId === promptId);
}

export function eligiblePairs(
  promptId: string,
  results = modelResults,
): Matchup[] {
  const entries = resultsForPrompt(promptId, results).filter(
    (entry) => !entry.isDemo,
  );
  return entries.flatMap((left, i) =>
    entries
      .slice(i + 1)
      .filter((right) => left.modelId !== right.modelId)
      .map((right): Matchup => [left, right]),
  );
}

/** 模型 → 该题下它的作品列表（决策 097：同名变体已合并为一个模型多件作品） */
export function modelGroups(
  promptId: string,
  results = modelResults,
): Map<string, ModelResult[]> {
  const groups = new Map<string, ModelResult[]>();
  for (const entry of resultsForPrompt(promptId, results)) {
    if (entry.isDemo) continue;
    const list = groups.get(entry.modelId);
    if (list) list.push(entry);
    else groups.set(entry.modelId, [entry]);
  }
  return groups;
}

/** 模型两两组合（保持 flatMap 的池序，与 eligiblePairs 一致） */
export function modelPairIds(groups: Map<string, ModelResult[]>): [string, string][] {
  const ids = [...groups.keys()];
  return ids.flatMap((left, i) =>
    ids.slice(i + 1).map((right): [string, string] => [left, right]),
  );
}

/** 组内抽一件作品；单作品组不消耗随机数（维持既有断言的随机序列） */
export function pickWorkFrom(group: ModelResult[], random: () => number): ModelResult {
  return group.length === 1 ? group[0] : group[Math.floor(random() * group.length)];
}

/** 上一轮作品回避后的分组：被清空的模型整组退出 */
export function groupsAvoiding(
  groups: Map<string, ModelResult[]>,
  previous?: Matchup,
): Map<string, ModelResult[]> {
  if (!previous) return groups;
  const filtered = new Map<string, ModelResult[]>();
  for (const [modelId, works] of groups) {
    const fresh = works.filter((work) => !previous.some((old) => old.id === work.id));
    if (fresh.length) filtered.set(modelId, fresh);
  }
  return filtered;
}

export function pickMatchup(
  promptId: string,
  previous?: Matchup,
  random = Math.random,
  results = modelResults,
): Matchup | null {
  // 两级抽取（决策 097）：先等概率抽两个不同模型，再各从该模型的作品里随机抽
  // 一件——对局均匀分布在模型对上，作品多的模型不再因作品数获得更高出场率。
  const groups = modelGroups(promptId, results);
  let active = groups;
  let pairs = modelPairIds(groups);
  // 上一轮亮相过的作品下一轮整体回避（防身份泄漏）；无可避开时回退全量，保证流程不断
  if (previous) {
    const avoided = groupsAvoiding(groups, previous);
    const fresh = modelPairIds(avoided);
    if (fresh.length) {
      active = avoided;
      pairs = fresh;
    }
  }
  if (!pairs.length) return null;
  const [a, b] = pairs[Math.floor(random() * pairs.length)];
  return finishPair(active, a, b, random);
}

/** 定下模型对后各抽一件作品，再随机左右 */
export function finishPair(
  groups: Map<string, ModelResult[]>,
  a: string,
  b: string,
  random: () => number,
): Matchup {
  const wa = pickWorkFrom(groups.get(a)!, random);
  const wb = pickWorkFrom(groups.get(b)!, random);
  return random() < 0.5 ? [wa, wb] : [wb, wa];
}

export function randomArenaHash(
  excludeId?: string,
  random = Math.random,
  results = modelResults,
  // 动态题库（决策 045）：调用方传当前生效题目，缺省用内置种子
  promptList: Prompt[] = prompts,
) {
  const available = promptList.filter(
    (prompt) => eligiblePairs(prompt.id, results).length > 0,
  );
  const other = available.filter((prompt) => prompt.id !== excludeId);
  const pool = other.length ? other : available;
  return pool.length
    ? `#arena/${pool[Math.floor(random() * pool.length)].id}`
    : '#prompts';
}
