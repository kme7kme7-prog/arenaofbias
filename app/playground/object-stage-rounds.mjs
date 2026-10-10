// Exhaust the local pair combinations before repeating, while favouring new objects.
export class RoundDeck {
  topics = new Map();
  next(topic) {
    const works = [...new Map(topic.works.map(work => [work.id, work])).values()];
    if (works.length < 2) throw new Error('这个题目还没有两件作品');
    const state = this.topics.get(topic.id) || { counts: new Map(), pair: [], round: 0 };
    const model = work => work.modelId || work.model || work.id;
    const candidates = works.flatMap((work, index) => works.slice(index + 1).filter(other => model(work) !== model(other)).map(other => {
      const pair = [work, other];
      return { pair, key: pair.map(item => item.id).sort((a, b) => a.localeCompare(b)).join('|'),
        overlap: pair.filter(item => state.pair.includes(item.id)).length };
    }));
    if (!candidates.length) throw new Error('这个题目还没有两个不同模型的作品');
    const fresh = candidates.filter(item => item.overlap !== 2);
    const selected = (fresh.length ? fresh : candidates).sort((a, b) =>
      (state.counts.get(a.key) || 0) - (state.counts.get(b.key) || 0) || a.overlap - b.overlap)[0];
    state.counts.set(selected.key, (state.counts.get(selected.key) || 0) + 1);
    state.pair = selected.pair.map(work => work.id);
    state.round++;
    this.topics.set(topic.id, state);
    return state.round % 2 ? selected.pair : [...selected.pair].reverse();
  }
}
