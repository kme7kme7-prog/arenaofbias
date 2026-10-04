// 远端题库：从服务端 GET /api/prompts 拉取已发布题目（prompts 表，决策 045），
// 拉到后全站以它为准（currentPrompts 的消费方随之更新）；
// 拉不到时回退到 lib/arena.ts 的内置题库种子，站点行为与改造前一致。
// 与 lib/works.ts 同构：后台题目管理（新增/编辑/上下架）落库后，
// 这里就是「后台点了、前台刷新即生效」的通道。

import { apiReadJson } from '@/lib/api';
import { prompts as seedPrompts } from '@/lib/arena';
import type { Prompt } from '@/lib/arena';
import { isPromptId } from './prompt-id';

function parsePromptRow(row: unknown): Prompt | null {
  if (!row || typeof row !== 'object') return null;
  const candidate = row as Record<string, unknown>;
  if (
    !isPromptId(candidate.id) ||
    (candidate.kind !== 'image' &&
      candidate.kind !== 'text' &&
      candidate.kind !== 'web') ||
    typeof candidate.name !== 'string' ||
    !candidate.name ||
    typeof candidate.prompt !== 'string' ||
    !candidate.prompt
  )
    return null;
  const parsed: Prompt = {
    id: candidate.id,
    kind: candidate.kind,
    category: typeof candidate.category === 'string' ? candidate.category : '',
    code: typeof candidate.code === 'string' ? candidate.code : '',
    name: candidate.name,
    prompt: candidate.prompt,
    commentary:
      typeof candidate.commentary === 'string' ? candidate.commentary : '',
    detail: typeof candidate.detail === 'string' ? candidate.detail : '',
  };
  if (Array.isArray(candidate.promptVariants)) {
    parsed.promptVariants = candidate.promptVariants.filter(
      (variant): variant is { id: string; label: string; prompt: string } =>
        variant && typeof variant.id === 'string' &&
        typeof variant.label === 'string' && typeof variant.prompt === 'string',
    );
  }
  // 六维权重（决策 093）：非法/缺失按「未配置」处理——不丢整行，重放时走均分兜底
  const weights = candidate.weights;
  if (
    Array.isArray(weights) &&
    weights.length === 6 &&
    weights.every(
      (w) => typeof w === 'number' && Number.isFinite(w) && w >= 0 && w <= 1,
    ) &&
    Math.abs(weights.reduce((sum, w) => sum + w, 0) - 1) <= 0.01
  )
    parsed.weights = weights;
  return parsed;
}

/** 拉已发布题目清单；失败返回 null（调用方回退内置题库）。空清单是合法结果
 *（题目全部下架——决策 045「完全隐藏」），原样返回 []，不回退内置题库 */
export async function fetchPrompts(): Promise<Prompt[] | null> {
  try {
    const data = (await apiReadJson('/api/prompts')) as { prompts?: unknown } | null;
    if (!data) return null;
    if (!Array.isArray(data.prompts)) return null;
    const parsed = data.prompts.map(parsePromptRow);
    if (parsed.some((prompt) => prompt === null)) {
      console.warn('[arenaofbias] /api/prompts 返回了无法解析的题目行，已跳过');
    }
    const prompts = parsed.filter((prompt): prompt is Prompt => prompt !== null);
    // 全部行损坏：与拉取失败同等对待（回退内置题库，站点可用）；
    // 服务端本来就返回了空清单则视为合法的空，不回退
    if (data.prompts.length > 0 && prompts.length === 0) return null;
    return prompts;
  } catch {
    return null;
  }
}

export type PromptsState =
  | { status: 'loading' }
  | { status: 'ready'; source: 'remote' | 'builtin'; prompts: Prompt[] };

type Listener = () => void;

let state: PromptsState = { status: 'loading' };
let started = false;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

/** 订阅题库变化；返回取消订阅函数 */
export function subscribePrompts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPromptsState(): PromptsState {
  return state;
}

/** 是否已拉到过远端题库（getPromptsState 的便捷判断，语义见 PromptsState.source） */
export function promptsReady(): boolean {
  return state.status === 'ready';
}

/** 启动拉取（幂等）。失败时落到 builtin，站点用内置题库继续运行。 */
export function loadPrompts(): void {
  if (started) return;
  started = true;
  void (async () => {
    const prompts = await fetchPrompts();
    state =
      prompts === null
        ? { status: 'ready', source: 'builtin', prompts: seedPrompts }
        : { status: 'ready', source: 'remote', prompts };
    emit();
  })();
}

/** 测试/调试用：重置回未加载状态（生产代码不调用） */
export function resetPromptsForTest(): void {
  started = false;
  state = { status: 'loading' };
}

/** 当前生效的题目清单：远端已发布题，未就绪/失败时为内置种子 */
export function currentPrompts(): Prompt[] {
  return state.status === 'ready' ? state.prompts : seedPrompts;
}
