import topics from '../../reference/tier-play/topics.json';
import brands from '../../reference/tier-play/brands.json';
import { configureTierCatalog } from '../../reference/tier-play/catalog-access.mjs';
import { createTierCatalog } from './catalog.mjs';
import { publicCatalog } from '../../lib/public-catalog';

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
    async readCatalog({ ids, promptIds }) {
      const [works, prompts] = await Promise.all([
        publicCatalog.works(ids, '/api/playground/works'),
        publicCatalog.prompts(promptIds),
      ]);
      return { works, prompts };
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
