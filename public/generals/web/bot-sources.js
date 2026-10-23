// Roster metadata is enough for setup. Fetch and verify only entrants in the
// requested match, sharing in-flight reads and keeping verified code in memory.
export function createBotSourceLoader(fetchSource = (...args) => fetch(...args)) {
  const pending = new Map();
  return async entry => {
    if (entry.human || typeof entry.code === 'string') return entry;
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(entry.id) || !/^[a-f0-9]{64}$/.test(entry.sha256))
      throw Error('选手信息不合法，请刷新重试');
    const key = `${entry.id}:${entry.sha256}`;
    if (!pending.has(key)) {
      const read = (async () => {
        const response = await fetchSource(`/generals/bots/${entry.id}.js`, { cache: 'no-cache', signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw Error('无法加载作品：' + entry.name);
        const bytes = await response.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
        if (hash !== entry.sha256) throw Error('作品校验失败，请刷新重试：' + entry.name);
        return new TextDecoder().decode(bytes);
      })();
      pending.set(key, read);
      read.catch(() => { if (pending.get(key) === read) pending.delete(key); });
    }
    return { ...entry, code: await pending.get(key) };
  };
}
