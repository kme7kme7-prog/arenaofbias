import { getWorksState, loadWorks } from '@/lib/works';
import { getPromptsState, loadPrompts } from '@/lib/prompts';
import catalog from './playground-object-catalog.json';

/** Public catalogs remain the authority for publication and model identity. */
export async function loadObjectCatalog() {
  await Promise.all([loadWorks(), loadPrompts()]);
  const works = getWorksState(), prompts = getPromptsState();
  if (works.status !== 'ready' || works.source !== 'remote' || prompts.status !== 'ready' || prompts.source !== 'remote') {
    throw new Error('公开作品清单暂时不可用');
  }
  const topics = catalog.flatMap(item => {
    const prompt = prompts.prompts.find(prompt => prompt.id === item.promptId);
    if (!prompt) return [];
    const entries = works.works.filter(work => work.promptId === item.promptId).flatMap(work => {
      if (work.content.kind !== 'html' || !('src' in work.content)) return [];
      let url: URL;
      try { url = new URL(work.content.src); } catch { return []; }
      if (!/^[wpc][0-9a-f]{32}\.(?:w\.arenaofbias\.icu|localhost)$/.test(url.hostname)) return [];
      for (const flag of ['arena-fold', 'prev', 'arena-scene', 'bridge', 'playground']) {
        if (!url.searchParams.getAll('aob').includes(flag)) url.searchParams.append('aob', flag);
      }
      url.searchParams.set('face', 'arena');
      url.searchParams.set('parent', location.origin);
      return [{ id: work.id, model: work.modelName, modelId: work.modelId, title: work.title, origin: url.origin, src: url.href }];
    });
    return [{ id: item.id, promptId: item.promptId, name: item.name, description: prompt.detail,
      prompt: prompt.prompt, eligible: entries.length >= 10 && new Set(entries.map(work => work.modelId)).size >= 2, works: entries }];
  });
  return { topics };
}
