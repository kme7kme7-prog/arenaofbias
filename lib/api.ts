export function apiUrl(path: string): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '') + path;
}

export function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  // oxlint-disable-next-line no-restricted-globals -- The shared API wrapper includes the session.
  return fetch(apiUrl(path), { ...options, credentials: 'include' });
}
