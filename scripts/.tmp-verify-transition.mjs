// 临时验收（2026-09-25 用户反馈两处）：
// A. 换对/重播过渡：快门盖住→进度条→全就绪才退场，全程不可见加载过程
// B. 账号成功卡标题居中（max-width:330px 顶左修复）
// 只跑本地静态构建 + 路由拦截 fixtures，不连真库。先 npm run build。
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(root, 'output/playwright');
await mkdir(out, { recursive: true });
const app = express();
app.use(express.static(path.join(root, 'dist')));
const server = await new Promise(resolve => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const base = `http://127.0.0.1:${server.address().port}`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executablePath = process.env.THUMB_BROWSER || (existsSync(edge) ? edge : undefined);
let browser;

const PROBE = `<script data-aob-probe>(function(){
var posted=false;function post(){if(posted)return;posted=true;
document.body.dataset.sent='true';
try{parent.postMessage('aob:work-ready','*');}catch(e){}}
function arm(){var f=0;function tick(){f+=1;if(f>=3)setTimeout(post,300);else requestAnimationFrame(tick);}requestAnimationFrame(tick);}
if(document.readyState==='complete')arm();else window.addEventListener('load',arm);
setTimeout(post,5000);})();</script>`;

function fixtureHtml(id, delay, color) {
  return `<!doctype html><html><head>${PROBE}</head>
<body data-work="${id}" style="margin:0;background:${color};font:20px monospace;color:#fff">
<div style="padding:30px">${id} loaded after ${delay}ms</div></body></html>`;
}

// 双侧 fixture：A 快（250ms）B 慢（1600ms），进度条先后填满可观察
const works = [
  { id: 'fx-a1', promptId: '005', modelId: 'fx-m1', modelName: 'FixA1', title: 'A1', isDemo: 0,
    content: JSON.stringify({ kind: 'html', src: '/fx/a1.html' }) },
  { id: 'fx-b1', promptId: '005', modelId: 'fx-m2', modelName: 'FixB1', title: 'B1', isDemo: 0,
    content: JSON.stringify({ kind: 'html', src: '/fx/b1.html' }) },
  { id: 'fx-a2', promptId: '005', modelId: 'fx-m3', modelName: 'FixA2', title: 'A2', isDemo: 0,
    content: JSON.stringify({ kind: 'html', src: '/fx/a2.html' }) },
  { id: 'fx-b2', promptId: '005', modelId: 'fx-m4', modelName: 'FixB2', title: 'B2', isDemo: 0,
    content: JSON.stringify({ kind: 'html', src: '/fx/b2.html' }) },
];
const delays = { a1: 250, b1: 1600, a2: 250, b2: 1600 };
const colors = { a1: '#5a2d2d', b1: '#2d3a5a', a2: '#6a3d1d', b2: '#1d5a4a' };

const user = { id: 1, username: 'tester', role: 'user' };
let loggedIn = false;

async function setupRoutes(page) {
  await page.route('**/api/**', route => {
    const endpoint = new URL(route.request().url()).pathname;
    if (endpoint === '/api/works') return route.fulfill({ json: { works } });
    if (endpoint === '/api/prompts') return route.fulfill({ json: { prompts: [
      { id: '005', kind: 'web', name: '验收题', prompt: '比较两份作品', code: 'FX', category: '3D 场景' },
    ] } });
    if (endpoint === '/api/auth/me') return route.fulfill({ json: { user: loggedIn ? user : null } });
    if (endpoint === '/api/auth/login') {
      loggedIn = true;
      return route.fulfill({ json: { user } });
    }
    if (endpoint === '/api/auth/logout') {
      loggedIn = false;
      return route.fulfill({ json: {} });
    }
    if (endpoint === '/api/ratings') return route.fulfill({ json: { ratings: [], games: {} } });
    if (endpoint === '/api/reactions') return route.fulfill({ json: { counts: {}, mine: {} } });
    return route.fulfill({ json: {} });
  });
  await page.route('**/fx/**', route => {
    const id = new URL(route.request().url()).pathname.match(/(\w+)\.html$/)[1];
    return route.fulfill({
      contentType: 'text/html',
      body: fixtureHtml(id, delays[id] ?? 400, colors[id] ?? '#333'),
    });
  });
}

// 采样器：每帧重查全部元素（React 重渲染会让旧引用变死节点），异常落袋不炸循环
const SAMPLER = `(function(){
  window.__samples = [];
  window.__samplerError = null;
  window.__sampling = false;
  window.__startSampling = function() {
    window.__samples = [];
    window.__sampling = true;
    function frame() {
      if (!window.__sampling) return;
      try {
        const shell = document.querySelector('.arena-shell');
        const shutter = document.querySelector('.transition-shutter');
        const overlay = document.querySelector('.loading-overlay');
        const panels = document.querySelectorAll('.work-panel');
        const frames = document.querySelectorAll('iframe.html-work');
        window.__samples.push({
          t: performance.now(),
          phase: shell ? (shell.className.match(/phase-(\\w+)/) || [])[1] || null : null,
          exit: !!(shell && shell.classList.contains('shutter-exit')),
          shutterClip: shutter ? getComputedStyle(shutter).clipPath : null,
          overlay: !!overlay,
          panelOpacity: panels.length ? getComputedStyle(panels[0]).opacity : null,
          srcs: [...frames].map(f => (f.src || '').replace(location.origin, '')),
          ready: [...frames].map(f => {
            try {
              const d = f.contentDocument;
              if (!d) return 'opaque';
              if (d.location.href === 'about:blank') return 'blank';
              if (d.readyState === 'loading') return 'loading';
              return d.body && d.body.dataset.sent === 'true' ? 'sent' : 'dom';
            } catch { return 'opaque'; }
          }),
        });
        requestAnimationFrame(frame);
      } catch (e) {
        window.__samplerError = String((e && e.stack) || e);
        window.__sampling = false;
      }
    }
    requestAnimationFrame(frame);
  };
  window.__stopSampling = function() { window.__sampling = false; };
})();`;

// 覆盖判定：inset 各分量全为 0（Edge 会把 0 格式化成 0px/0% 混用）
function isFullCover(clip) {
  const m = clip && clip.match(/^inset\(([^)]+)\)$/);
  if (!m) return false;
  return m[1].split(' ').every(v => parseFloat(v) <= 0.001);
}

const results = [];
function report(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

try {
  browser = await chromium.launch({ executablePath, headless: true });

  // ============ 场景 1：换对（同一题库继续）============
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await setupRoutes(page);
    await page.addInitScript(() => {
      localStorage.setItem('arena-language', 'zh');
      localStorage.setItem('aob-test-pair', JSON.stringify({
        promptId: '005', a: 'fx-a1', b: 'fx-b1', at: Date.now(),
      }));
    });
    await page.goto(`${base}/#arena/005`);
    await page.addScriptTag({ content: SAMPLER });
    await page.waitForFunction(() => {
      const shell = document.querySelector('.arena-shell');
      return shell && shell.className.includes('phase-voting');
    }, null, { timeout: 20000 });
    await page.evaluate(() => window.__startSampling());
    await page.click('.continue-same');
    // 等快门进场，再等快速通道跑回投票
    await page.waitForFunction(() => {
      const shell = document.querySelector('.arena-shell');
      return shell && shell.className.includes('phase-transition');
    }, null, { timeout: 5000 });
    await page.waitForFunction(() => {
      const shell = document.querySelector('.arena-shell');
      return shell && shell.className.includes('phase-voting');
    }, null, { timeout: 20000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => window.__stopSampling());
    const samples = await page.evaluate(() => window.__samples);
    const samplerError = await page.evaluate(() => window.__samplerError);
    report('采样器：全程无异常', !samplerError, samplerError || `${samples.length} 帧`);
    await page.screenshot({ path: path.join(out, 'fx-after-reveal.png') });

    // 时间线转储：连续相似帧折叠
    const compact = [];
    for (const s of samples) {
      const key = `${s.phase}|${s.shutterClip}|${s.overlay}|${s.srcs.join(',')}|${s.ready.join(',')}|${s.exit}`;
      const last = compact[compact.length - 1];
      if (last && last.key === key) { last.count++; last.tEnd = s.t; continue; }
      compact.push({ key, t: Math.round(s.t), tEnd: Math.round(s.t), count: 1, s });
    }
    console.log('  —— 时间线（折叠连续同态帧）——');
    for (const c of compact)
      console.log(`  t=${c.t}..${c.tEnd} x${c.count} ${c.key}`);

    // 对局左右随机翻面：新稿判定看两侧合并（新作品 id 只在新稿里出现）
    const srcChangeAt = samples.find(s => s.srcs.join().includes('a2') || s.srcs.join().includes('b2'));
    const coverAt = samples.find(s => s.phase === 'transition' && isFullCover(s.shutterClip));
    report('换对：快门进入 transition 阶段且盖满', !!coverAt,
      coverAt ? `t=${Math.round(coverAt.t)} clip=${coverAt.shutterClip}` :
        `transition 帧数=${samples.filter(s => s.phase === 'transition').length}`);
    report('换对：新稿换源发生在盖满之后', !!srcChangeAt && !!coverAt && srcChangeAt.t >= coverAt.t,
      srcChangeAt && coverAt ? `srcChange=${Math.round(srcChangeAt.t)} cover=${Math.round(coverAt.t)}` : '未观察到换源');

    // 全程不可见加载：快门没盖满的帧里，若作品区可见（panel 不透明）而 iframe 未就绪 → 违规
    const leaks = samples.filter(s => {
      if (isFullCover(s.shutterClip)) return false;
      if (s.phase !== 'transition' && s.phase !== 'intro') return false;
      const visible = Number(s.panelOpacity) > 0.5;
      return visible && s.ready.some(r => r === 'blank' || r === 'loading');
    });
    report('换对：全程无裸加载帧（未盖住时可见作品必已就绪）', leaks.length === 0,
      leaks.length ? `违规 ${leaks.length} 帧，首帧 phase=${leaks[0].phase} ready=${leaks[0].ready}` : '');

    // 「正在接入试验场」遮罩在点击后不得出现（快速通道）
    const clickT = samples.find(s => s.phase === 'transition')?.t ?? 0;
    const overlayFrames = samples.filter(s => s.overlay && s.t >= clickT);
    report('换对：接入试验场遮罩全程未出现', overlayFrames.length === 0,
      overlayFrames.length ? `出现 ${overlayFrames.length} 帧` : '');

    const exitFrames = samples.filter(s => s.exit);
    report('换对：快门退场动画已播', exitFrames.length > 0, `${exitFrames.length} 帧`);

    const final = samples[samples.length - 1];
    report('换对：揭幕后双侧作品已上报就绪', final.ready.length === 2 && final.ready.every(r => r === 'sent'),
      JSON.stringify(final.ready));

    // 进度条元素存在且快门期间至少一条被填满（A 快侧先 done）
    const hasBars = await page.evaluate(() => !!document.querySelector('.shutter-progress i'));
    report('换对：快门进度条存在', hasBars, '');
    report('换对：无页面报错', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ============ 场景 2：重播入场（同一对作品）============
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupRoutes(page);
    await page.addInitScript(() => {
      localStorage.setItem('arena-language', 'zh');
    });
    await page.goto(`${base}/#arena/005`);
    await page.addScriptTag({ content: SAMPLER });
    await page.waitForFunction(() => {
      const shell = document.querySelector('.arena-shell');
      return shell && shell.className.includes('phase-voting');
    }, null, { timeout: 20000 });
    await page.click('.vote-a');
    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll('.text-button')]
        .find(b => b.textContent.includes('重播入场'));
      return btn && !btn.disabled;
    }, null, { timeout: 15000 });
    await page.evaluate(() => window.__startSampling());
    await page.evaluate(() => {
      [...document.querySelectorAll('.text-button')]
        .find(b => b.textContent.includes('重播入场')).click();
    });
    await page.waitForFunction(() => {
      const shell = document.querySelector('.arena-shell');
      return shell && shell.className.includes('phase-voting');
    }, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__stopSampling());
    const samples = await page.evaluate(() => window.__samples);
    const clickT = samples.find(s => s.phase === 'transition')?.t ?? 0;
    const overlayFrames = samples.filter(s => s.overlay && s.t >= clickT);
    report('重播：接入试验场遮罩全程未出现', overlayFrames.length === 0,
      overlayFrames.length ? `出现 ${overlayFrames.length} 帧` : '');
    const leaks = samples.filter(s => {
      if (isFullCover(s.shutterClip)) return false;
      if (s.phase !== 'transition' && s.phase !== 'intro') return false;
      const visible = Number(s.panelOpacity) > 0.5;
      return visible && s.ready.some(r => r === 'blank' || r === 'loading');
    });
    report('重播：全程无裸加载帧', leaks.length === 0,
      leaks.length ? `违规 ${leaks.length} 帧` : '');
    const exitFrames = samples.filter(s => s.exit);
    report('重播：快门退场动画已播', exitFrames.length > 0, `${exitFrames.length} 帧`);
    await context.close();
  }

  // ============ 场景 3：账号成功卡标题居中 ============
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupRoutes(page);
    await page.goto(`${base}/#arena/005`);
    await page.waitForFunction(() => document.querySelector('.account-entry'), null, { timeout: 15000 });
    await page.click('.account-entry');
    await page.waitForSelector('[data-slot="dialog-content"][data-open]');
    await page.fill('#account-name', 'tester');
    await page.fill('#account-password', 'password-123456');
    await page.click('.account-submit');
    await page.waitForSelector('.account-success h2', { timeout: 8000 });
    const m = await page.evaluate(() => {
      const h2 = document.querySelector('.account-success h2');
      const sheet = document.querySelector('.account-sheet');
      const hr = h2.getBoundingClientRect();
      const sr = sheet.getBoundingClientRect();
      return {
        h2Center: hr.left + hr.width / 2,
        sheetCenter: sr.left + sr.width / 2,
        h2Width: hr.width,
        text: h2.textContent,
      };
    });
    await page.screenshot({ path: path.join(out, 'fx-success-card.png') });
    report('成功卡：标题水平居中（偏差 ≤ 8px）',
      Math.abs(m.h2Center - m.sheetCenter) <= 8,
      `「${m.text}」h2中心=${Math.round(m.h2Center)} 纸面中心=${Math.round(m.sheetCenter)} 偏差=${Math.round(Math.abs(m.h2Center - m.sheetCenter))}px`);
    await context.close();
  }
} finally {
  await browser?.close();
  server.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length ? 1 : 0);
