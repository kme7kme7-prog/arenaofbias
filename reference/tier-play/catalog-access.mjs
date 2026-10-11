// The standalone review and production entry share the same interaction code.
let catalog;
export function configureTierCatalog(value) {
  catalog = value;
}
export function tierConfig() {
  return catalog || {};
}
async function demo(path, topic) {
  const response = await fetch(
    `/demo/${path}${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`,
    {
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok) throw Error('作品清单暂时不可用');
  return response.json();
}
export const readTierRound = (topic) =>
  catalog ? catalog.round(topic) : demo('round', topic);
export const readTierIdentities = (topic) =>
  catalog ? catalog.identities(topic) : demo('identities', topic);
export const readTierTopics = () =>
  catalog ? catalog.topics() : demo('topics');
