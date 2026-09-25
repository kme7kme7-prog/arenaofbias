// 真机逐页巡检：导航 -> 探针 -> 截图（临时工具）
// node scripts/.tmp-mobile/sweep.mjs [页名过滤]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTTP = 'http://127.0.0.1:9222';
const BASE = process.env.AOB_BASE || 'http://192.168.1.203:5173';
const STATE = fileURLToPath(new URL('./tab.json', import.meta.url));
const probe = readFileSync(
  fileURLToPath(new URL('./probe.js', import.meta.url)),
  'utf8',
);
const filter = process.argv[2];

const PAGES = [
  ['home', '/?s=1#home', 4000],
  ['arena', '/?s=2#arena/001', 9000],
  ['play', '/?s=3#play', 3500],
  ['event', '/?s=4#event', 3500],
  ['guess', '/?s=5#guess', 5000],
  ['prompts', '/?s=6#prompts', 4000],
  ['rank', '/?s=7#rank', 4500],
  ['admin', '/admin?s=8#works', 5000],
];

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('ws failed'));
  });
}
function makeRpc(ws) {
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
    } else if (msg.method) events.push(msg);
  };
  const send = (method, params, timeout = 30000, sessionId) => {
    const n = ++id;
    return new Promise((res, rej) => {
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params: params || {}, sessionId }));
      setTimeout(() => {
        if (pending.has(n)) {
          pending.delete(n);
          rej(new Error('timeout ' + method));
        }
      }, timeout);
    });
  };
  return { send, events };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const version = await (await fetch(HTTP + '/json/version')).json();
const ws = await connect(version.webSocketDebuggerUrl);
const rpc = makeRpc(ws);
const st = JSON.parse(readFileSync(STATE, 'utf8'));
const { sessionId } = await rpc.send('Target.attachToTarget', {
  targetId: st.targetId,
  flatten: true,
});
const call = (m, p, t) => rpc.send(m, p, t, sessionId);
await call('Page.enable');
await call('Runtime.enable');
await call('Log.enable');
await call('Network.enable');

for (const [name, path, settle] of PAGES) {
  if (filter && filter !== name) continue;
  rpc.events.length = 0;
  const url = BASE + path;
  await call('Page.navigate', { url });
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const r = await call('Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true,
    });
    if (r.result.value === 'complete') break;
  }
  await sleep(settle);
  await call('Page.captureScreenshot', { format: 'png' }, 60000).then((r) =>
    writeFileSync(
      fileURLToPath(new URL('./shot-' + name + '.png', import.meta.url)),
      Buffer.from(r.data, 'base64'),
    ),
  );
  const p = await call(
    'Runtime.evaluate',
    {
      expression: '(async () => {\n' + probe + '\n})()',
      returnByValue: true,
      awaitPromise: true,
    },
    90000,
  );
  const issues = [];
  const v = p.result.value || {};
  if (v.pageOverflow > 0) issues.push('横向溢出 ' + v.pageOverflow + 'px');
  const unclipped = (v.beyond || []).filter((b) => !b.clipped);
  if (unclipped.length)
    issues.push('越界 ' + unclipped.length + ': ' + unclipped.map((b) => b.t + '@' + b.r).join(', '));
  if (v.smallCount)
    issues.push('小热区 ' + v.smallCount + ': ' + (v.small || []).slice(0, 6).map((s) => s.t + ' ' + s.w + 'x' + s.h).join(' | '));
  if (v.clippedCount)
    issues.push('文字被裁 ' + v.clippedCount + ': ' + (v.clipped || []).map((c) => c.t + ' ' + (c.sw || c.sh) + '>' + (c.cw || c.ch)).join(' | '));
  if (v.longWords && v.longWords.length)
    issues.push('长词撑破 ' + v.longWords.map((c) => c.t).join(','));
  if (v.vhMismatch && v.vhMismatch.length)
    issues.push('fixed 超出可视高 ' + v.vhMismatch.map((c) => c.t + ' h' + c.h).join(' | '));
  const errs = rpc.events
    .filter(
      (e) =>
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') ||
        (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'),
    )
    .map((e) =>
      e.method === 'Runtime.exceptionThrown'
        ? ((e.params.exceptionDetails.exception || {}).description ||
            e.params.exceptionDetails.text || '')
            .split('\n')[0]
            .slice(0, 120)
        : e.method === 'Log.entryAdded'
          ? (e.params.entry.text || '').slice(0, 120)
          : (e.params.args || []).map((a) => a.description || a.value).join(' ').slice(0, 120),
    );
  console.log(
    [
      '### ' + name,
      'viewport ' + v.vw + 'x' + v.vh + ' dpr' + v.dpr + ' scrollH ' + (v.scrollable || {}).y,
      issues.length ? issues.join('\n   ! ') : '   ok',
      errs.length ? '   ERR: ' + [...new Set(errs)].join('\n   ERR: ') : '',
    ].join('\n   '),
  );
}
ws.close();
process.exit(0);
