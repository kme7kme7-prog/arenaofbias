import topics from '../../reference/tier-play/topics.json';
import brands from '../../reference/tier-play/brands.json';
import { configureTierCatalog } from '../../reference/tier-play/catalog-access.mjs';
import { createTierCatalog } from './catalog.mjs';
import { apiReadJson } from '../../lib/api';

const assets = import.meta.glob(
  '../../reference/tier-play/assets/brands/*.{svg,png,ico}',
  { eager: true, query: '?url', import: 'default' },
);
configureTierCatalog(
  createTierCatalog({
    topics,
    brands,
    origin: location.origin,
    assetURL: (name) =>
      assets[`../../reference/tier-play/assets/brands/${name}`],
    async readCatalog() {
      const [roster, questions] = await Promise.all([
        apiReadJson('/api/playground/works'),
        apiReadJson('/api/prompts'),
      ]);
      if (!Array.isArray(roster?.works) || !Array.isArray(questions?.prompts))
        throw Error('题库暂时无法加载，请刷新再试。');
      return { works: roster.works, prompts: questions.prompts };
    },
  }),
);
const brand = document.querySelector('.brand');
brand.addEventListener('click', (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.PlaygroundEntry?.navigate('/#play', true);
});
await import('../../reference/tier-play/app.mjs');
