import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shareSvg } from '../lib/share-card.js';

const origin = 'https://arenaofbias.icu/';
const base = {
  type: 'site', kicker: 'THE HUMAN CHOICE / 偏见试验场',
  headline: '不看名字，\n你会选谁？', subtitle: '两份 AI 作品，一个属于你的答案。',
};
const pair = {
  type: 'duel', prompt: { id: '001', name: '鹈鹕大挑战' },
  names: ['Claude <script> & 特别长的模型名称', 'GPT-6-astra-extra-long-thinking-2026'],
  pair: ['left', 'right'], pick: 'a',
};
const guess = {
  type: 'guess', kicker: '模一把 / #001 / 2026-09-13', won: true,
  answer: '真实当日答案', rows: ['hmmnumh', 'hhhhhhh'],
};
let count = 0;
function check(label, fn) { fn(); console.log(`PASS ${++count} ${label}`); }

check('三种分享卡保持原版尺寸、文案和二维码', () => {
  for (const data of [base, pair, guess]) {
    const svg = shareSvg(data, origin);
    assert.match(svg, /width="1080"/);
    assert.match(svg, /height="(1600|1760)"/);
    assert.match(svg, /扫码打开 · ARENA OF BIAS/);
    assert.match(svg, /shape-rendering="crispEdges"/);
    assert.match(svg, /<path d="M[\d ]+/);
  }
});
check('A/B 身份与个人选择在图外，缺图使用旧版占位框', () => {
  const svg = shareSvg(pair, origin);
  assert.match(svg, /Claude &lt;script&gt; &amp; 特别长的模型名称/);
  assert.ok(!svg.includes('<script>'));
  assert.match(svg, /✓ 我的选择/);
  assert.match(svg, /扫码查看完整作品/);
  const withImages = shareSvg({ ...pair, thumbs: ['data:image/png;base64,AA', null] }, origin);
  assert.equal(withImages.match(/<image /g)?.length, 1);
  assert.match(withImages, /preserveAspectRatio="xMidYMid meet"/);
});
check('竞猜卡含答案、轨迹和个人记录说明', () => {
  const svg = shareSvg(guess, origin);
  assert.match(svg, /真实当日答案/);
  assert.match(svg, /推理轨迹/);
  assert.match(svg, /个人挑战记录 \/ 含当日模型答案/);
});
check('通用链接预览图为静态 1200×630 PNG', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /og:image" content="https:\/\/arenaofbias\.icu\/share-preview\.png"/);
  const png = fs.readFileSync(new URL('../public/share-preview.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});
check('前端不调用已退休的分享 API', () => {
  for (const path of ['../components/share.tsx', '../lib/share-client.ts', '../src/work-capture.tsx']) {
    const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\/api\/share(?:-work)?|\/share\/(?:card|og)\.png/);
  }
});
check('生成完成时若弹窗已关闭则释放图片 URL', () => {
  const sheet = fs.readFileSync(new URL('../components/share.tsx', import.meta.url), 'utf8');
  assert.match(sheet, /if \(disposed\) \{\s*URL\.revokeObjectURL\(objectUrl\);\s*return;/);
});
console.log(`${count} share checks passed`);
