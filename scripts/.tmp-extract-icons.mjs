// 临时脚本：提取 lucide 图标 SVG 内嵌到 standalone/guess.html，用完即删
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const names = [
  'arrow-left',
  'arrow-up-right',
  'search',
  'trophy',
  'brain-circuit',
  'fingerprint-pattern', // 本版 lucide-react 的 Fingerprint 别名指向它
  'check',
  'arrow-up',
  'arrow-down',
  'corner-down-left',
  'loader-circle',
  'rotate-ccw',
  'chevron-down',
  'sprout',
  'compass',
  'flame',
  'skull',
];
const out = {};
for (const n of names) {
  const p = path.join(
    process.cwd(),
    'node_modules',
    'lucide-react',
    'dist',
    'esm',
    'icons',
    `${n}.mjs`,
  );
  const m = await import(pathToFileURL(p).href);
  out[n] = m.__iconNode
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag}${a ? ' ' + a : ''}/>`;
    })
    .join('');
}
console.log(JSON.stringify(out, null, 1));
