export function apiUrl(path: string): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '') + path;
}

export function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  // oxlint-disable-next-line no-restricted-globals -- The shared API wrapper includes the session.
  return fetch(apiUrl(path), { ...options, credentials: 'include' });
}

/** A read worth repeating: no answer, a timeout, a body that is not JSON, or 429. */
export class RetryableRead extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs = 0) {
    super(message);
    this.name = 'RetryableRead';
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfterMs(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? 0 : Math.max(0, at - Date.now());
}

/** Bound read requests, including a response whose body never finishes. Other HTTP errors read as null. */
export async function apiReadJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 12000);
  const retryable = (error: unknown): never => {
    if (signal?.aborted) throw error;
    throw new RetryableRead(error instanceof Error ? error.message : String(error));
  };
  try {
    const response = await apiFetch(path, { signal: controller.signal }).catch(retryable);
    if (response.status === 429)
      throw new RetryableRead('访问较频繁，请稍后再试', retryAfterMs(response.headers.get('Retry-After')));
    return response.ok ? await response.json().catch(retryable) : null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

const RETRY_DELAYS = [1000, 3000, 6000];
const RETRY_BUDGET = 45000;

/** Initial catalog reads back off (1s/3s/6s, at least Retry-After) after a RetryableRead, all
 * within one 45s budget that also cuts off a late attempt. Other failures are final; empty
 * catalogs are successful results. */
export async function readCatalogWithRetry<T>(
  read: (signal: AbortSignal) => Promise<T | null>,
  signal: AbortSignal,
): Promise<T | null> {
  const budget = new AbortController();
  const stop = () => budget.abort();
  const deadline = Date.now() + RETRY_BUDGET;
  const cutoff = setTimeout(stop, RETRY_BUDGET);
  if (signal.aborted) stop();
  else signal.addEventListener('abort', stop, { once: true });
  try {
    for (let attempt = 0; ; attempt++) {
      if (budget.signal.aborted) return null;
      let wait: number;
      try {
        const result = await read(budget.signal);
        return signal.aborted ? null : result;
      } catch (error) {
        if (budget.signal.aborted || !(error instanceof RetryableRead) || attempt >= RETRY_DELAYS.length) return null;
        wait = Math.max(RETRY_DELAYS[attempt], error.retryAfterMs);
        if (Date.now() + wait + 2000 > deadline) return null;
      }
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          budget.signal.removeEventListener('abort', finish);
          resolve();
        };
        const timer = setTimeout(finish, wait);
        budget.signal.addEventListener('abort', finish, { once: true });
      });
    }
  } finally {
    clearTimeout(cutoff);
    signal.removeEventListener('abort', stop);
  }
}
