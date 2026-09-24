import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const files = ['README.md', 'design-kit.css', 'preview.html', 'preview.css', 'preview.js', 'VALIDATION.md'];
await Promise.all(files.map(name => access(new URL(name, import.meta.url))));
const [css, html, demoCss] = await Promise.all(['design-kit.css', 'preview.html', 'preview.css'].map(read));
assert(!/@import\b|url\s*\(/i.test(css), 'Core CSS must not load external resources');
assert(!/:root\b|@font-face\b/.test(css), 'Core must stay scoped and font-independent');
const definitions = new Map([...css.matchAll(/(--pdk-[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
for (const [, token] of (css + demoCss).matchAll(/var\((--pdk-[\w-]+)/g)) {
  assert(definitions.has(token), `Undefined token: ${token}`);
}
for (const [name, value] of [['paper','#dfe3dd'],['ink','#1c2423'],['acid','#d9fb51']]) {
  assert.equal(definitions.get(`--pdk-${name}`), value);
}
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML id');
for (const [, value] of html.matchAll(/(?:aria-controls|aria-labelledby|aria-describedby|for)="([^"]+)"/g)) {
  for (const id of value.split(/\s+/)) assert(ids.includes(id), `Missing id: ${id}`);
}
for (const [, href] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (href.startsWith('#')) assert(ids.includes(href.slice(1)), `Missing anchor: ${href}`);
  else {
    assert(!/^(?:https?:|\/|\.\.\/)/.test(href), `Nonportable resource: ${href}`);
    await access(new URL(href.split('#')[0], import.meta.url));
  }
}
function luminance(hex) {
  const c = hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
}
export function contrast(a,b) {
  const values = [luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (values[0]+.05)/(values[1]+.05);
}
const pairs = [
  ['正文 / 纸面','#1c2423','#dfe3dd',4.5],
  ['次级文字 / 纸面','#5b655f','#dfe3dd',4.5],
  ['次级文字 / 面板','#5b655f','#e8eae6',4.5],
  ['酸黄 / 深墨主按钮','#d9fb51','#1c2423',4.5],
  ['反色正文 / 深墨','#e8eae6','#1c2423',4.5],
  ['反色次级文字','#b7c2b3','#1c2423',4.5],
  ['成功','#335937','#dae5d5',4.5],
  ['警告','#775016','#f1e6c4',4.5],
  ['错误','#923b31','#f3dfda',4.5],
  ['危险按钮','#ffffff','#923b31',4.5],
  ['焦点 / 纸面','#536627','#dfe3dd',3],
  ['输入边界 / 表面','#788577','#f0f2ec',3],
  ['次级按钮边界','#788577','#e8eae6',3],
];
for (const [name,fg,bg,minimum] of pairs) {
  const ratio = contrast(fg,bg);
  assert(ratio >= minimum, `${name}: ${ratio.toFixed(2)} < ${minimum}`);
  console.log(`PASS ${name}: ${ratio.toFixed(2)}:1 (>= ${minimum})`);
}
console.log(`PASS ${files.length} files, ${definitions.size} tokens, local resources, unique IDs and reference anchors`);
console.log('Scope: static checks and selected contrast pairs only; visual and keyboard checks are recorded in VALIDATION.md.');
