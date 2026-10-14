const sources = import.meta.glob('./bots/*.js', {
  query: '?raw',
  import: 'default',
});

export async function loadRoyaleSource(entry) {
  const id = typeof entry === 'string' ? entry : entry?.id;
  if (!id || typeof id !== 'string') {
    throw new TypeError('Royale bot entry must include a string id');
  }
  const load = sources[`./bots/${id}.js`];
  if (!load) throw new Error(`No Royale port exists for bot: ${id}`);
  const source = await load();
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error(`Royale port is empty for bot: ${id}`);
  }
  return source;
}
