import type { Matchup, ModelResult } from './arena';

export function parseSharedDuel(
  search: string,
): [string, string, string] | null {
  const value = new URLSearchParams(search).get('duel');
  if (!value || value.length > 1500) return null;
  try {
    const ids: unknown = JSON.parse(value);
    if (
      !Array.isArray(ids) ||
      ids.length !== 3 ||
      !ids.every(
        (id) => typeof id === 'string' && id.length > 0 && id.length <= 200,
      ) ||
      !/^\d{3}$/.test(ids[0]) ||
      ids[1] === ids[2]
    )
      return null;
    return ids as [string, string, string];
  } catch {
    return null;
  }
}
export function resolveSharedDuel(
  ids: [string, string, string],
  works: ModelResult[],
): Matchup | null {
  const a = works.find(
    (work) => work.id === ids[1] && work.promptId === ids[0],
  );
  const b = works.find(
    (work) => work.id === ids[2] && work.promptId === ids[0],
  );
  return a && b && a.modelId !== b.modelId ? [a, b] : null;
}
