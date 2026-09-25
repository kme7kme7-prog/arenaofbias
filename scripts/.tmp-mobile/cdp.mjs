// 真机 Chrome 远程调试驱动（临时工具，用完即删）
// 前置：adb forward tcp:9222 localabstract:chrome_devtools_remote
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTTP = 'http://127.0.0.1:9222';
const STATE = fileURLToPath(new URL('./tab.json', import.meta.url));
const args = process.argv.slice(2);
const cmd = args[0];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('ws connect failed: ' + wsUrl));
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
      if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
      else p.res(msg.result);
    } else if (msg.method) events.push(msg);
  };
  const send = (method, params, timeout = 30000, sessionId) => {
    const n = ++id;
    return new Promise((res, rej) => {
      pending.set(n, { res, rej });
      ws.send(
        JSON.stringify({ id: n, method, params: params || {}, sessionId }),
      );
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

async function pageTargets() {
  const res = await fetch(HTTP + '/json');
  return (await res.json()).filter((t) => t.type === 'page');
}

// 复用受控标签页；不存在则新建
async function open() {
  const ws = await connect(
    (await (await fetch(HTTP + '/json/version')).json()).webSocketDebuggerUrl,
  );
  const rpc = makeRpc(ws);
  let targetId = null;
  if (existsSync(STATE)) {
    try {
      targetId = JSON.parse(readFileSync(STATE, 'utf8')).targetId;
    } catch {}
  }
  const list = await pageTargets();
  const known = new Set(list.map((t) => t.id));
  if (!targetId || !known.has(targetId)) {
    const url = process.env.AOB_URL || 'about:blank';
    const created = await rpc.send('Target.createTarget', { url, background: false });
    targetId = created.targetId;
    writeFileSync(STATE, JSON.stringify({ targetId, url }));
    await sleep(1500);
  }
  const attached = await rpc.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  const session = attached.sessionId;
  const call = (method, params, timeout) =>
    rpc.send(method, params, timeout, session);
  return { ws, rpc, call, session, targetId };
}

const out = (v) => console.log(typeof v === 'string' ? v : JSON.stringify(v));

switch (cmd) {
  case 'targets':
    out((await pageTargets()).map((t) => ({ id: t.id, url: t.url })));
    break;
  case 'eval': {
    const { ws, call } = await open();
    let code = args[1];
    if (code && code[0] === '@')
      code = readFileSync(fileURLToPath(new URL(code.slice(1), import.meta.url)), 'utf8');
    const r = await call('Runtime.evaluate', {
      expression: '(async () => {\n' + code + '\n})()',
      returnByValue: true,
      awaitPromise: true,
      timeout: 60000,
    });
    if (r.exceptionDetails)
      out({
        error:
          (r.exceptionDetails.exception &&
            r.exceptionDetails.exception.description) ||
          r.exceptionDetails.text,
      });
    else out({ value: r.result.value });
    ws.close();
    break;
  }
  case 'nav': {
    const { ws, call } = await open();
    await call('Page.enable');
    await call('Page.navigate', { url: args[1] });
    const deadline = Date.now() + Number(args[2] || 25000);
    let ready = '';
    while (Date.now() < deadline) {
      await sleep(500);
      const r = await call('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      });
      ready = r.result.value;
      if (ready === 'complete') break;
    }
    await sleep(Number(args[3] || 1500));
    out({ navigated: args[1], readyState: ready });
    ws.close();
    break;
  }
  case 'shot': {
    const { ws, call } = await open();
    await call('Page.enable');
    const r = await call(
      'Page.captureScreenshot',
      { format: 'png' },
      60000,
    );
    writeFileSync(args[1], Buffer.from(r.data, 'base64'));
    out({ saved: args[1] });
    ws.close();
    break;
  }
  case 'watch': {
    const { ws, call, rpc } = await open();
    await call('Runtime.enable');
    await call('Log.enable');
    await call('Page.enable');
    await call('Network.enable');
    if (args[2]) {
      await call('Page.navigate', { url: args[2] });
      await sleep(Number(args[3] || 4000));
    }
    await sleep(Number(args[1] || 8000));
    const rows = [];
    for (const e of rpc.events) {
      if (e.method === 'Runtime.exceptionThrown')
        rows.push([
          'exception',
          ((e.params.exceptionDetails.exception || {}).description ||
            e.params.exceptionDetails.text ||
            '')
            .split('\n')
            .slice(0, 4)
            .join(' | '),
        ]);
      else if (
        e.method === 'Runtime.consoleAPICalled' &&
        (e.params.type === 'error' || e.params.type === 'warning')
      )
        rows.push([
          e.params.type,
          (e.params.args || [])
            .map((a) => a.description || a.value)
            .join(' ')
            .slice(0, 400),
        ]);
      else if (e.method === 'Log.entryAdded') {
        const en = e.params.entry;
        if (en.level === 'error' || en.level === 'warning')
          rows.push([
            'log:' + en.level,
            String(en.text + ' @ ' + en.url).slice(0, 300),
          ]);
      } else if (e.method === 'Network.loadingFailed')
        rows.push([
          'netfail',
          String(e.params.errorText + ' ' + e.params.type).slice(0, 200),
        ]);
      else if (e.method === 'Network.responseReceived') {
        const re = e.params.response;
        if (re.status >= 400)
          rows.push(['http' + re.status, re.url.slice(0, 160)]);
      }
    }
    out(rows.length ? rows : 'clean');
    ws.close();
    break;
  }
  case 'tap': {
    const { ws, call } = await open();
    const [x, y] = args.slice(1).map(Number);
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, radiusX: 14, radiusY: 14 }],
    });
    await sleep(60);
    await call('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    out({ tapped: [x, y] });
    ws.close();
    break;
  }
  case 'swipe': {
    const { ws, call } = await open();
    const [x, y1, y2] = args.slice(1).map(Number);
    const steps = 16;
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: y1 }],
    });
    for (let i = 1; i <= steps; i++) {
      await call('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y1 + ((y2 - y1) * i) / steps }],
      });
      await sleep(16);
    }
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    out({ swiped: [x, y1, y2] });
    ws.close();
    break;
  }
  case 'rect': {
    const { ws, call } = await open();
    const r = await call('Runtime.evaluate', {
      expression:
        '(() => { const el = document.querySelector(' +
        JSON.stringify(args[1]) +
        '); if (!el) return "missing"; el.scrollIntoView({behavior:"instant", block:"center"}); const b = el.getBoundingClientRect(); return JSON.stringify({x:Math.round(b.x+b.width/2), y:Math.round(b.y+b.height/2), w:Math.round(b.width), h:Math.round(b.height)}); })()',
      returnByValue: true,
    });
    out({ rect: r.result.value });
    ws.close();
    break;
  }
  case 'metrics': {
    const { ws, call } = await open();
    if (args[1] === 'clear') await call('Emulation.clearDeviceMetricsOverride');
    else {
      const [w, h, d] = args[1].split('x').map(Number);
      await call('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: d || 3,
        mobile: true,
      });
    }
    out({ metrics: args[1] });
    ws.close();
    break;
  }
  case 'at': {
    // at <WxHxD> <url> <settleMs> <jsExpr> [shot.png] —— 单会话内改尺寸+导航+求值
    const { ws, call } = await open();
    const [w, h, d] = args[1].split('x').map(Number);
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: d || 3,
      mobile: true,
    });
    await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await call('Page.navigate', { url: args[2] });
    for (let i = 0; i < 40; i++) {
      await sleep(400);
      const r = await call('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      });
      if (r.result.value === 'complete') break;
    }
    await sleep(Number(args[3] || 5000));
    const r = await call(
      'Runtime.evaluate',
      {
        expression: '(async () => {\n' + args[4] + '\n})()',
        returnByValue: true,
        awaitPromise: true,
      },
      90000,
    );
    if (args[5]) {
      const shot = await call('Page.captureScreenshot', { format: 'png' }, 60000);
      writeFileSync(args[5], Buffer.from(shot.data, 'base64'));
    }
    await call('Emulation.clearDeviceMetricsOverride');
    if (r.exceptionDetails)
      out({ error: (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text });
    else out({ value: r.result.value, shot: args[5] || null });
    ws.close();
    break;
  }
  case 'close': {
    if (existsSync(STATE)) {
      const st = JSON.parse(readFileSync(STATE, 'utf8'));
      const ws = await connect(
        (await (await fetch(HTTP + '/json/version')).json())
          .webSocketDebuggerUrl,
      );
      const rpc = makeRpc(ws);
      try {
        await rpc.send('Target.closeTarget', { targetId: st.targetId });
      } catch {}
      ws.close();
      unlinkSync(STATE);
    }
    out('closed');
    break;
  }
  default:
    console.error(
      'usage: cdp.mjs targets|eval <js>|nav <url> [wait] [settle]|shot <file>|watch <ms> [url] [settle]|tap <x> <y>|swipe <x> <y1> <y2>|rect <sel>|close',
    );
    process.exit(2);
}
