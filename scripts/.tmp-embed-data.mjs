// 临时脚本：把 lib/guess-models.json 嵌进 standalone/guess.html 的 __DATA__ 段，用完即删
import { readFileSync, writeFileSync } from 'node:fs';

const data = readFileSync('lib/guess-models.json', 'utf8').trim();
JSON.parse(data); // 校验合法
const html = readFileSync('standalone/guess.html', 'utf8');
if (!html.includes('__GUESS_DATA_JSON__')) {
  console.error('占位符不存在（已嵌过？）');
  process.exit(1);
}
writeFileSync(
  'standalone/guess.html',
  html.replace('__GUESS_DATA_JSON__', data),
);
console.log('embedded', data.length, 'bytes');
