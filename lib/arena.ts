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
}
export const prompts: Prompt[] = seedPrompts;

// Legacy state-machine name; a round index now identifies a prompt only.
export const rounds = prompts;

export type Story = {
  heading: string;
  paragraphs: string[];
  ending: string;
};

export type ResultContent =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'text'; story: Story }
  | { kind: 'web'; template: Side }
  | { kind: 'html'; src: string }
  | { kind: 'html'; html: string };

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

export function pickMatchup(
  promptId: string,
  previous?: Matchup,
  random = Math.random,
  results = modelResults,
): Matchup | null {
  const pairs = eligiblePairs(promptId, results);
  // 上一轮亮相过的作品下一轮整体回避：已被揭晓身份的作品若再次出场，
  // 参与者会凭记忆认出它，盲测就失去了意义。无可避开时（如仅剩一组）
  // 回退到全量组合，保证流程不断。
  const fresh = previous
    ? pairs.filter(
        (pair) =>
          !pair.some((entry) => previous.some((old) => old.id === entry.id)),
      )
    : pairs;
  const candidates = fresh.length ? fresh : pairs;
  if (!candidates.length) return null;
  const pair = candidates[Math.floor(random() * candidates.length)];
  return random() < 0.5 ? pair : [pair[1], pair[0]];
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
