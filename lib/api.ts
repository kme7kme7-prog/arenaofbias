export function apiUrl(path: string): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '') + path;
}

export function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  // oxlint-disable-next-line no-restricted-globals -- The shared API wrapper includes the session.
  return fetch(apiUrl(path), { ...options, credentials: 'include' });
}

/** Bound read requests, including a response whose body never finishes. */
export async function apiReadJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 12000);
  try {
    const response = await apiFetch(path, { signal: controller.signal });
    return response.ok ? await response.json() : null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

/** Initial catalog reads get one retry. Empty catalogs are successful results. */
export async function readCatalogWithRetry<T>(
  read: (signal: AbortSignal) => Promise<T | null>,
  signal: AbortSignal,
): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) return null;
    const result = await read(signal);
    if (signal.aborted) return null;
    if (result !== null) return result;
    if (attempt === 0) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', finish);
          resolve();
        };
        const timer = setTimeout(finish, 400);
        signal.addEventListener('abort', finish, { once: true });
      });
    }
  }
  return null;
}
