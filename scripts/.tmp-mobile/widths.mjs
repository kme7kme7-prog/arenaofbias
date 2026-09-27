// 多视口巡检（CDP 设备度量模拟，非真机旋转）：node scripts/.tmp-mobile/widths.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTTP = 'http://127.0.0.1:9222';
const BASE = process.env.AOB_BASE || 'http://192.168.1.203:5173';
const STATE = fileURLToPath(new URL('./tab.json', import.meta.url));
const probe = readFileSync(
  fileURLToPath(new URL('./probe.js', import.meta.url)),
  'utf8',
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SIZES = (process.env.AOB_SIZES ||
  '360x740x3,393x852x3,412x915x3,740x360x3,852x393x3').split(',').map((s) => {
  const [w, h, d] = s.split('x').map(Number);
  return { w, h, d };
});
const PAGES = (process.env.AOB_PAGES || 'home,arena,rank,guess,prompts')
  .split(',')
  .map((n) => {
    const map = {
      home: '/?w=1#home',
      arena: '/?w=2#arena/001',
      rank: '/?w=3#rank',
      guess: '/?w=4#guess',
      prompts: '/?w=5#prompts',
      play: '/?w=6#play',
    };
    return [n, map[n]];
  });

function connect(u) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(u);
    ws.onopen = () => res(ws);
    ws.onerror = () => rej(new Error('ws failed'));
  });
}
function makeRpc(ws) {
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.rej(new Error(JSON.stringify(m.error)));
      else p.res(m.result);
    }
  };
  return (method, params, timeout = 30000, sessionId) => {
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
}

const version = await (await fetch(HTTP + '/json/version')).json();
const ws = await connect(version.webSocketDebuggerUrl);
const raw = makeRpc(ws);
const st = JSON.parse(readFileSync(STATE, 'utf8'));
const { sessionId } = await raw('Target.attachToTarget', {
  targetId: st.targetId,
  flatten: true,
});
const call = (m, p, t) => raw(m, p, t, sessionId);
await call('Page.enable');
await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

for (const size of SIZES) {
  for (const [name, path] of PAGES) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: size.w,
      height: size.h,
      deviceScaleFactor: size.d,
      mobile: true,
    });
    await call('Page.navigate', { url: BASE + path });
    for (let i = 0; i < 30; i++) {
      await sleep(400);
      const r = await call('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      });
      if (r.result.value === 'complete') break;
    }
    await sleep(name === 'arena' ? 7000 : 2500);
    const p = await call(
      'Runtime.evaluate',
      {
        expression: '(async () => {\n' + probe + '\n})()',
        returnByValue: true,
        awaitPromise: true,
      },
      90000,
    );
    const v = p.result.value || {};
    const flags = [];
    if (v.pageOverflow > 0) flags.push('横向溢出 ' + v.pageOverflow + 'px');
    const unclipped = (v.beyond || []).filter((b) => !b.clipped);
    if (unclipped.length)
      flags.push(
        '越界 ' +
          unclipped.length +
          ': ' +
          unclipped.slice(0, 4).map((b) => b.t + '@r' + b.r).join(', '),
      );
    if (v.clippedCount)
      flags.push(
        '文字被裁 ' +
          v.clippedCount +
          ': ' +
          (v.clipped || []).slice(0, 4).map((c) => c.t + ' ' + (c.sw || c.sh) + '>' + (c.cw || c.ch)).join(' | '),
      );
    if (v.longWords && v.longWords.length)
      flags.push('长词撑破: ' + v.longWords.map((c) => c.t).join(','));
    if (v.vhMismatch && v.vhMismatch.length)
      flags.push('fixed 超高: ' + v.vhMismatch.map((c) => c.t + ' h' + c.h).join(' | '));
    console.log(
      size.w +
        'x' +
        size.h +
        ' ' +
        name.padEnd(8) +
        ' 视口' +
        v.vw +
        'x' +
        v.vh +
        ' 页高' +
        (v.scrollable || {}).y +
        ' 小热区' +
        v.smallCount +
        (flags.length ? '\n   ! ' + flags.join('\n   ! ') : '\n   ok'),
    );
    if (flags.length) {
      const shot = await call('Page.captureScreenshot', { format: 'png' }, 60000);
      writeFileSync(
        fileURLToPath(new URL('./bad-' + size.w + '-' + name + '.png', import.meta.url)),
        Buffer.from(shot.data, 'base64'),
      );
    }
  }
}
await call('Emulation.clearDeviceMetricsOverride');
ws.close();
process.exit(0);
