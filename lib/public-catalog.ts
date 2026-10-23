import { apiReadJson, readCatalogWithRetry } from './api';
import type { Prompt } from './arena';
import type { WorkRow } from './works';

type ReadJson = (path: string, signal?: AbortSignal) => Promise<unknown>;
type Deferred<T> = { promise: Promise<T[]>; resolve: (rows: T[]) => void; reject: (error: Error) => void };
type WorksEndpoint = '/api/works' | '/api/playground/works';

/** Merge overlapping selectors while they are in flight. Completed reads are deliberately
 * discarded: a new round or identity reveal must observe a work being unpublished. */
export function createPublicCatalogReader(readJson: ReadJson = apiReadJson) {
  function pool<T extends { id: string }>(path: string, field: string, selector: 'ids' | 'promptIds', key: keyof T) {
    const pending = new Map<string, Deferred<T>>();
    const queued = new Set<string>();
    let scheduled = false;

    async function batch(ids: string[]) {
      try {
        const query = new URLSearchParams({ [selector]: ids.join(',') });
        const rows = await readCatalogWithRetry(async signal => {
          const data = await readJson(`${path}?${query}`, signal);
          if (!data || typeof data !== 'object') return null;
          const value = (data as Record<string, unknown>)[field];
          return Array.isArray(value) ? value as T[] : null;
        }, new AbortController().signal);
        if (!rows) throw new Error('公开作品清单暂时不可用，请稍后重试。');
        const groups = new Map(ids.map(id => [id, [] as T[]]));
        for (const row of rows) {
          if (row && typeof row === 'object') {
            const id = row[key];
            if (typeof id === 'string') groups.get(id)?.push(row);
          }
        }
        for (const id of ids) {
          const deferred = pending.get(id)!;
          pending.delete(id);
          deferred.resolve(groups.get(id)!);
        }
      } catch (error) {
        for (const id of ids) {
          const deferred = pending.get(id)!;
          pending.delete(id);
          deferred.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }

    return async (requested: readonly string[]): Promise<T[]> => {
      const ids = [...new Set(requested)].sort((a, b) => a.localeCompare(b));
      if (ids.some(id => !id || id.length > 128 || id.includes(','))) throw new Error('作品选择无效。');
      const reads = ids.map(id => {
        if (!pending.has(id)) {
          let resolve!: Deferred<T>['resolve'], reject!: Deferred<T>['reject'];
          const promise = new Promise<T[]>((yes, no) => { resolve = yes; reject = no; });
          pending.set(id, { promise, resolve, reject });
          queued.add(id);
        }
        return pending.get(id)!.promise;
      });
      if (queued.size && !scheduled) {
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          const next = [...queued].sort((a, b) => a.localeCompare(b));
          queued.clear();
          for (let offset = 0; offset < next.length; offset += 50) void batch(next.slice(offset, offset + 50));
        });
      }
      return (await Promise.all(reads)).flat();
    };
  }
  const workPools = new Map<WorksEndpoint, ReturnType<typeof pool<WorkRow>>>();
  const promptWorkPools = new Map<WorksEndpoint, ReturnType<typeof pool<WorkRow>>>();
  const prompts = pool<Prompt>('/api/prompts', 'prompts', 'promptIds', 'id');
  return {
    prompts,
    works(ids: readonly string[], endpoint: WorksEndpoint = '/api/works') {
      if (!workPools.has(endpoint)) workPools.set(endpoint, pool<WorkRow>(endpoint, 'works', 'ids', 'id'));
      return workPools.get(endpoint)!(ids);
    },
    worksForPrompts(ids: readonly string[], endpoint: WorksEndpoint = '/api/works') {
      if (!promptWorkPools.has(endpoint)) promptWorkPools.set(endpoint, pool<WorkRow>(endpoint, 'works', 'promptIds', 'promptId'));
      return promptWorkPools.get(endpoint)!(ids);
    },
  };
}

export const publicCatalog = createPublicCatalogReader();
