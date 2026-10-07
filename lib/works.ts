// 远端作品清单：从服务端 GET /api/works 拉取已发布作品（works 表，决策 040），
// 拉到后全站以它为准（lib/placeholder.ts 的 currentResults 会优先使用）；
// 拉不到时调用方回退到 lib/arena.ts 的内置花名册，站点行为与改造前一致。
// 后台内容管理（登记/发布开关）落地后，这里就是「后台点了、前台即刻生效」的通道。

import { apiReadJson, readCatalogWithRetry } from '@/lib/api';
import { knownContentKinds, modelResults } from '@/lib/arena';
import type { ModelResult } from '@/lib/arena';

// /api/works 返回的行：身份字段与 ModelResult 同构，content 是 JSON 字符串
type WorkRow = Omit<ModelResult, 'content' | 'isDemo'> & {
  isDemo: 0 | 1;
  content: string;
};

function parseWorkRow(row: unknown): ModelResult | null {
  if (!row || typeof row !== 'object') return null;
  const candidate = row as Record<string, unknown>;
  for (const field of [
    'id',
    'promptId',
    'modelId',
    'modelName',
    'title',
    'content',
  ] as const) {
    if (typeof candidate[field] !== 'string' || !candidate[field]) return null;
  }
  if (typeof candidate.isDemo !== 'number') return null;
  let content: unknown;
  try {
    content = JSON.parse(candidate.content as string);
  } catch {
    return null;
  }
  if (
    !content ||
    typeof content !== 'object' ||
    typeof (content as Record<string, unknown>).kind !== 'string' ||
    // kind 白名单与内置花名册同一套（2026-09-15）：未知类型不让进清单，
    // 渲染层对陌生 kind 是未定义行为——坏行按「单行损坏」口径跳过
    !knownContentKinds.has((content as Record<string, unknown>).kind as string)
  )
    return null;
  // Public work hosts are cross-origin: document inspection cannot detect their 410 pages.
  // Ask only the platform content service for a probe; ordinary external/local HTML stays unchanged.
  const resultContent = content as ModelResult['content'];
  if (resultContent.kind === 'html' && 'src' in resultContent) {
    try {
      const url = new URL(resultContent.src);
      if (/^[wpc][0-9a-f]{32}\.(?:w\.arenaofbias\.icu|localhost)$/.test(url.hostname)) {
        url.searchParams.append('aob', 'prev');
        resultContent.src = url.href;
        resultContent.readyProbe = true;
      }
    } catch { /* Relative legacy pages use document inspection. */ }
  }
  return {
    id: candidate.id as string,
    promptId: candidate.promptId as string,
    modelId: candidate.modelId as string,
    modelName: candidate.modelName as string,
    title: candidate.title as string,
    ...(candidate.isDemo ? { isDemo: true } : {}),
    content: resultContent,
  };
}

/** 拉已发布作品清单；失败返回 null（调用方回退内置花名册）。空清单是合法结果
 *（作品全部下架——发布开关语义），原样返回 []，不回退内置清单 */
export async function fetchWorks(signal?: AbortSignal): Promise<ModelResult[] | null> {
  try {
    const data = (await apiReadJson('/api/works', signal)) as { works?: unknown } | null;
    if (!data) return null;
    if (!Array.isArray(data.works)) return null;
    const parsed = data.works.map(parseWorkRow);
    // 单行损坏不该让整站回退；跳过坏行，其余照常使用
    if (parsed.some((work) => work === null)) {
      console.warn('[arenaofbias] /api/works 返回了无法解析的作品行，已跳过');
    }
    const works = parsed.filter(
      (work): work is ModelResult => work !== null,
    );
    // 全部行损坏：与拉取失败同等对待（回退内置清单，站点可用）；
    // 服务端本来就返回了空清单则视为合法的空（作品全部下架），不回退
    if (data.works.length > 0 && works.length === 0) return null;
    return works;
  } catch {
    return null;
  }
}

export type WorksState =
  | { status: 'loading' }
  | { status: 'ready'; source: 'remote' | 'builtin'; works: ModelResult[] };

type Listener = () => void;

let state: WorksState = { status: 'loading' };
let worksLoad: Promise<void> | null = null;
let worksController: AbortController | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

/** 订阅清单变化；返回取消订阅函数 */
export function subscribeWorks(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWorksState(): WorksState {
  return state;
}

/** 是否已拉到过远端清单（getWorksState 的便捷判断，语义见 WorksState.source） */
export function worksReady(): boolean {
  return state.status === 'ready';
}

/** Share pending reads; retry only failed catalogs, never replace a successful roster. */
export function loadWorks(): Promise<void> {
  if (worksLoad) return worksLoad;
  if (state.status === 'ready' && state.source === 'remote') return Promise.resolve();
  const controller = new AbortController();
  worksController = controller;
  state = { status: 'loading' };
  emit();
  worksLoad = (async () => {
    const works = await readCatalogWithRetry(fetchWorks, controller.signal);
    const current = getWorksState();
    if (controller.signal.aborted || (current.status === 'ready' && current.source === 'remote')) return;
    state =
      works === null
        ? { status: 'ready', source: 'builtin', works: modelResults }
        : { status: 'ready', source: 'remote', works };
    emit();
  })().finally(() => {
    if (worksController === controller) {
      worksController = null;
      worksLoad = null;
    }
  });
  return worksLoad;
}

/** Recovery refresh: retain the current roster on failure, publish a valid empty roster. */
export async function refreshWorks(signal: AbortSignal): Promise<boolean> {
  const works = await fetchWorks(signal);
  if (signal.aborted || works === null) return false;
  state = { status: 'ready', source: 'remote', works };
  emit();
  return true;
}

/** 测试/调试用：重置回未加载状态（生产代码不调用） */
export function resetWorksForTest(): void {
  worksController?.abort();
  worksController = null;
  worksLoad = null;
  state = { status: 'loading' };
}

export function currentWorks(): ModelResult[] {
  return state.status === 'ready' ? state.works : modelResults;
}

// 未使用类型导出占位：WorkRow 供将来管理后台读取接口复用
export type { WorkRow };
