// Use the live public roster; never fall back to a cached work after it is hidden.
import { publicWorkURL } from '../../lib/public-work-url.mjs';

export function createTierCatalog({
  topics,
  brands,
  assetURL,
  readCatalog,
  origin,
}) {
  const pending = new Map();
  const rounds = new Map();
  const topicWorkIds = [...new Set(topics.flatMap(topic => topic.workIds))];
  const snapshot = (ids, promptIds = []) => {
    const compare = (a, b) => a.localeCompare(b);
    const key = JSON.stringify([[...ids].sort(compare), [...promptIds].sort(compare)]);
    if (!pending.has(key)) pending.set(key, readCatalog({ ids, promptIds }).finally(() => pending.delete(key)));
    return pending.get(key);
  };
  function select(topic, works) {
    const byId = new Map(works.map((work) => [work.id, work]));
    const models = new Set();
    return topic.workIds.flatMap((sourceId, index) => {
      const work = byId.get(sourceId);
      if (
        !work ||
        work.promptId !== topic.promptId ||
        !brands[work.modelId] ||
        models.has(work.modelId)
      )
        return [];
      let content;
      try {
        content = JSON.parse(work.content);
      } catch {
        return [];
      }
      if (topic.kind === 'text') {
        const paragraphs = content?.story?.paragraphs;
        if (
          content.kind !== 'text' ||
          !Array.isArray(paragraphs) ||
          !paragraphs.length ||
          paragraphs.some((p) => typeof p !== 'string')
        )
          return [];
      } else {
        if (content.kind !== 'html') return [];
        if (!publicWorkURL(content.src)) return [];
      }
      models.add(work.modelId);
      return [{ id: String.fromCharCode(97 + index), sourceId, work, content }];
    });
  }
  return {
    storageKey: 'aob-tier-v1',
    themeKey: 'aob-theme',
    async topics() {
      const { works } = await snapshot(topicWorkIds);
      return topics.flatMap((topic) => {
        const count = select(topic, works).length;
        return count >= 2
          ? [{ id: topic.id, name: topic.name, kind: topic.kind, count }]
          : [];
      });
    },
    async round(id) {
      const topic = topics.find((t) => t.id === id);
      if (!topic) throw Error('这道题暂时不可用');
      const { works, prompts } = await snapshot(topic.workIds, [topic.promptId]);
      const selected = select(topic, works);
      if (selected.length < 2)
        throw Error('这道题目前还没有足够的公开作品，换一道再试。');
      const prompt = prompts.find((p) => p.id === topic.promptId)?.prompt;
      rounds.set(id, selected);
      return {
        topicId: topic.id,
        topic: topic.name,
        kind: topic.kind,
        skin: topic.skin,
        prompt: topic.kind === 'text' ? prompt : undefined,
        context:
          topic.id === '008'
            ? '如果人生注定要分别，那相遇还有什么意义？'
            : topic.skin === 'forum'
              ? prompt
              : topic.context,
        works: selected.map(({ id: alias, content }) => {
          if (topic.kind === 'text')
            return { id: alias, paragraphs: content.story.paragraphs };
          const url = new URL(content.src);
          for (const flag of [
            'arena-fold',
            'prev',
            'arena-scene',
            'bridge',
            'playground',
          ]) {
            if (!url.searchParams.getAll('aob').includes(flag))
              url.searchParams.append('aob', flag);
          }
          url.searchParams.set('face', 'arena');
          url.searchParams.set('parent', origin);
          return {
            id: alias,
            src: url.href,
            poster: `/tier/posters/${topic.id}/${alias}.webp`,
          };
        }),
      };
    },
    async identities(id) {
      const selected = rounds.get(id);
      if (!selected) throw Error('请先加载题目');
      const { works } = await snapshot(selected.map(work => work.sourceId));
      const publicWorks = new Map(works.map((work) => [work.id, work]));
      return Object.fromEntries(
        selected.map(({ id: alias, sourceId }) => {
          const work = publicWorks.get(sourceId);
          if (!work || !brands[work.modelId])
            throw Error('有作品已下架，请换个题目重新排榜。');
          return [
            alias,
            {
              model: work.modelName,
              modelId: work.modelId,
              title: work.title,
              logo: assetURL(brands[work.modelId].split('/').at(-1)),
            },
          ];
        }),
      );
    },
  };
}
