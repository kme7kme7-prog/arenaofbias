import registry from './provenance.json';
import openai from '../../reference/tier-play/assets/brands/openai.svg';
import zai from '../../reference/tier-play/assets/brands/zai.svg';
import deepseek from '../../reference/tier-play/assets/brands/deepseek.ico';
import kimi from '../../reference/tier-play/assets/brands/kimi.ico';
const sources = import.meta.glob('./bots/*.js', {
  query: '?raw',
  import: 'default',
});
export const ROSTER = registry.bots.map((entry) => ({
  ...entry,
  name: entry.id === 'harrier' ? '红隼' : entry.name,
  logo: entry.model.startsWith('GLM')
    ? zai
    : entry.model.startsWith('GPT')
      ? openai
      : entry.model.startsWith('DeepSeek')
        ? deepseek
        : entry.model.startsWith('Kimi')
          ? kimi
          : null,
  source: () => sources[`./bots/${entry.id}.js`](),
}));
