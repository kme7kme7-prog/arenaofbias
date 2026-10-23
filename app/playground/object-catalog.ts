import { publicCatalog } from '@/lib/public-catalog';
import { publicWorkURL } from '@/lib/public-work-url.mjs';
import catalog from './playground-object-catalog.json';

/** Public catalogs remain the authority for publication and model identity. */
export async function loadObjectCatalog() {
  const promptIds = catalog.map(item => item.promptId);
  const [works, prompts] = await Promise.all([
    publicCatalog.worksForPrompts(promptIds, '/api/playground/works'),
    publicCatalog.prompts(promptIds),
  ]);
  const topics = catalog.flatMap(item => {
    const prompt = prompts.find(prompt => prompt.id === item.promptId);
    if (!prompt || !['web', 'text', 'image'].includes(prompt.kind) ||
        typeof prompt.name !== 'string' || !prompt.name ||
        typeof prompt.prompt !== 'string' || !prompt.prompt) return [];
    const entries = works.filter(work => work.promptId === item.promptId).flatMap(work => {
      let content;
      try { content = JSON.parse(work.content); } catch { return []; }
      if (!content || content.kind !== 'html' || typeof content.src !== 'string' ||
          typeof work.id !== 'string' || typeof work.modelId !== 'string' ||
          typeof work.modelName !== 'string' || typeof work.title !== 'string' ||
          !work.id || !work.modelId || !work.modelName || !work.title || typeof work.isDemo !== 'number') return [];
      const url = publicWorkURL(content.src);
      if (!url) return [];
      for (const flag of ['arena-fold', 'prev', 'arena-scene', 'bridge', 'playground']) {
        if (!url.searchParams.getAll('aob').includes(flag)) url.searchParams.append('aob', flag);
      }
      url.searchParams.set('face', 'arena');
      url.searchParams.set('parent', location.origin);
      return [{ id: work.id, model: work.modelName, modelId: work.modelId, title: work.title, origin: url.origin, src: url.href }];
    });
    return [{ id: item.id, promptId: item.promptId, name: item.name, description: typeof prompt.detail === 'string' ? prompt.detail : '',
      prompt: prompt.prompt, eligible: entries.length >= 10 && new Set(entries.map(work => work.modelId)).size >= 2, works: entries }];
  });
  return { topics };
}
