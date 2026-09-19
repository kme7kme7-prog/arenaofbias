// 移动端不变量（真机巡检 2026-09-19 立下的规矩，改一条就红）：
//   1. 客户端不得直接调 crypto.randomUUID —— 局域网 http://<IP> 属非安全上下文，
//      它是 undefined，投票/表情/评论会在点击瞬间同步抛错并静默不发请求；
//   2. 兜底 id 必须过服务端 UUID_PATTERN（server/index.js 的 v4 校验）；
//   3. 两个入口的 viewport 策略齐备：键盘压缩布局视口 + 刘海屏安全区 + theme-color；
//   4. 声明 color-scheme: light，避免系统深色模式把原生控件画成深色；
//   5. 全站不用裸 100vh（带动态工具栏时比可视区高一个地址栏）；
//   6. 粗指针热区扩展块还在，且覆盖巡检点名的那批控件。
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const walk = (dir) =>
  readdirSync(new URL(dir, import.meta.url)).flatMap((name) => {
    const url = new URL(`${dir}/${name}`, import.meta.url);
    if (statSync(url).isDirectory()) return walk(`${dir}/${name}/`);
    return /\.(ts|tsx)$/.test(name) ? [url] : [];
  });

// 1) 客户端源码里不许出现裸 crypto.randomUUID()
const offenders = [];
for (const url of [...walk('../app'), ...walk('../components'), ...walk('../lib'), ...walk('../src')]) {
  const source = readFileSync(url, 'utf8');
  if (/crypto\.randomUUID\s*\(/.test(source))
    offenders.push(url.pathname.split('/').slice(-1)[0]);
}
assert.deepEqual(offenders, [], `客户端直接调用 crypto.randomUUID：${offenders.join(', ')}`);

// 2) 非安全上下文里跑一遍兜底实现，产物必须是服务端认得的 v4 UUID
const idSource = await readFile(new URL('../lib/id.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(idSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { newId } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
assert.ok(UUID_PATTERN.test(newId()), '产出的不是合法 v4 UUID');
const originalCrypto = globalThis.crypto;
const stripped = new Proxy(originalCrypto, {
  get(target, key) {
    // 模拟手机用 http://<局域网 IP> 打开：randomUUID 整个不存在
    if (key === 'randomUUID') return undefined;
    const value = Reflect.get(target, key);
    // Node 的 webcrypto 方法会校验 this，穿过 Proxy 调用会 ERR_INVALID_THIS
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
// Node 的 globalThis.crypto 只有 getter，得用 defineProperty 换掉
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
Object.defineProperty(globalThis, 'crypto', {
  value: stripped,
  configurable: true,
});
try {
  const ids = new Set(Array.from({ length: 200 }, () => newId()));
  for (const id of ids) assert.ok(UUID_PATTERN.test(id), `兜底 UUID 不合服务端口径：${id}`);
  assert.equal(ids.size, 200, '兜底 id 撞车');
} finally {
  Object.defineProperty(globalThis, 'crypto', descriptor);
}

// 3) 两个入口的视口策略
for (const entry of ['../index.html', '../admin.html']) {
  const html = await readFile(new URL(entry, import.meta.url), 'utf8');
  const viewport = /<meta\s+name="viewport"\s+content="([^"]+)"/.exec(html)?.[1] || '';
  assert.ok(/width=device-width/.test(viewport), `${entry} 缺 width=device-width`);
  assert.ok(
    /interactive-widget=resizes-content/.test(viewport),
    `${entry} 缺 interactive-widget=resizes-content：键盘会盖住登录框提交按钮`,
  );
  assert.ok(
    /viewport-fit=cover/.test(viewport),
    `${entry} 缺 viewport-fit=cover：env(safe-area-inset-*) 取不到值`,
  );
  assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}" \/>/i);
}

// 4) UA 控件配色锚定浅色站点
const globals = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
assert.match(globals, /color-scheme:\s*light/);

// 5) 裸 100vh 一律不许出现（svh/dvh 除外）
for (const name of readdirSync(new URL('../app', import.meta.url))) {
  if (!name.endsWith('.css')) continue;
  const css = await readFile(new URL(`../app/${name}`, import.meta.url), 'utf8');
  assert.doesNotMatch(
    css,
    /[^sd]100vh/,
    `app/${name} 用了裸 100vh：带动态工具栏的手机会比可视区高一个地址栏`,
  );
}

// 6) 粗指针热区扩展：点名控件都要在 (pointer: coarse) 块里被覆盖
const coarse = /\(pointer: coarse\)\s*\{([\s\S]*)$/m.exec(globals)?.[1] || '';
assert.ok(coarse.length, 'globals.css 缺 @media (pointer: coarse) 块');
for (const selector of [
  '.language-switch',
  '.account-entry',
  '.arena-home-link',
  '.rank-tab',
  '.rank-scope',
  '.vote-draw',
  '.text-button',
  '.lobby-small-entry',
  '.expand-control',
])
  assert.ok(coarse.includes(selector), `coarse 块没覆盖 ${selector}`);
const devCss = await readFile(new URL('../app/dev.css', import.meta.url), 'utf8');
assert.match(devCss, /\.dev-entry\s*\{[^}]*bottom:\s*calc\(8px \+ env\(safe-area-inset-bottom/);
assert.match(devCss, /@media \(pointer: coarse\)[\s\S]*\.dev-row\s*\{\s*min-height:\s*44px/);

// 7) 榜单装饰扫光不再越界
const ranking = await readFile(new URL('../app/ranking.css', import.meta.url), 'utf8');
assert.match(
  ranking,
  /\.rank-board \.rank-row:not\(\.first\) \.rank-row-flash\s*\{\s*display: none/,
);

console.log(
  'PASS 非安全上下文 id 兜底过服务端 v4 口径且不撞车; 客户端零裸 randomUUID; 两入口 viewport 策略齐备; color-scheme light; 无裸 100vh; coarse 热区覆盖点名控件; dev 角落吃安全区; 榜单扫光不越界',
);
