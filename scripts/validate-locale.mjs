import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
const dataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const messages = dataUrl(
  compile(
    await readFile(new URL('../lib/messages.ts', import.meta.url), 'utf8'),
  ),
);
const source = compile(
  await readFile(new URL('../lib/locale.ts', import.meta.url), 'utf8'),
)
  .replace(
    /from ['"]react['"]/,
    `from '${pathToFileURL(require.resolve('react')).href}'`,
  )
  .replace(/from ['"].\/messages['"]/, `from '${messages}'`);
const saved = new Map();
let onStorage;
globalThis.document = { documentElement: { lang: '' }, title: '' };
globalThis.localStorage = {
  getItem: (key) => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
};
globalThis.window = {
  addEventListener: (event, listener) => {
    if (event === 'storage') onStorage = listener;
  },
};
const locale = await import(dataUrl(source));
assert.equal(locale.getLocale(), 'zh');
assert.equal(document.documentElement.lang, 'zh-CN');
assert.equal(locale.translate('TRUST YOUR INSTINCT', 'zh'), '相信你的直觉');
assert.equal(
  locale.translate('TRUST YOUR INSTINCT', 'en'),
  'Trust your instinct',
);
assert.equal(locale.translate('我寻思这边能行', 'en'), 'This one wins me over');
assert.equal(
  locale.translate('gpt-6-astra-medium', 'en'),
  'gpt-6-astra-medium',
);
assert.equal(
  locale.translate('用户写下的原文，不自动翻译。', 'en'),
  '用户写下的原文，不自动翻译。',
);
console.log(
  'PASS default Chinese, single-language labels, and unknown content fallback',
);
locale.setLocale('en');
assert.equal(saved.get('arena-language'), 'en');
assert.equal(document.documentElement.lang, 'en');
const reloaded = await import(
  dataUrl(`${source}\n// Simulate a fresh page load.`)
);
assert.equal(reloaded.getLocale(), 'en');
saved.set('arena-language', 'zh');
onStorage({ key: 'arena-language' });
assert.equal(reloaded.getLocale(), 'zh');
saved.delete('arena-language');
onStorage({ key: null });
assert.equal(reloaded.getLocale(), 'zh');
console.log('PASS persistence, cross-tab updates, and cleared preferences');
localStorage.setItem = () => {
  throw new Error('Storage disabled');
};
reloaded.setLocale('en');
assert.equal(reloaded.getLocale(), 'en');
assert.equal(document.documentElement.lang, 'en');
console.log('PASS session language still works when storage is unavailable');
