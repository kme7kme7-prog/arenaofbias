// 给分享卡生成作品缩略图（决策 107）：每件已发布作品截一张 16:9 图落
// data/thumbs/<作品id>.png，服务端出题卡时嵌「正在对比的两件作品」。
//
// 为什么离线截而不是分享时截：作品形态太杂（WebGL / SVG / 整页 DOM），
// 浏览器里实时截 iframe 对 WebGL 要卡帧时序、对 DOM 根本没有原生快照口；
// 离线用 headless 浏览器逐件截，画面稳定、可目验，缺图的作品卡片自动回落
// 通用色块，不影响分享可用性。data/ 不入库，缩略图随作品重新接入后重跑本脚本。
//
//   node scripts/make-work-thumbs.mjs [--only id,id] [--budget 6000] [--jobs 3]
//   THUMB_BROWSER=/path/to/chrome 可指定浏览器（默认 Edge → Chrome 顺序找）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const thumbsDir = path.join(root, 'data', 'thumbs');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const only = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const budget = Number(arg('budget', '6000'));
const jobs = Math.max(1, Number(arg('jobs', '3')));
const WIDTH = 1280,
  HEIGHT = 720;

function findBrowser() {
  if (process.env.THUMB_BROWSER) return process.env.THUMB_BROWSER;
  const candidates =
    process.platform === 'win32'
      ? [
          'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
          'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
          'C:/Program Files/Google/Chrome/Application/chrome.exe',
          'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
          `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : ['google-chrome', 'chromium', 'microsoft-edge'];
  for (const candidate of candidates) {
    if (candidate.includes('/')) {
      if (fs.existsSync(candidate)) return candidate;
    } else if (
      spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0
    )
      return candidate;
  }
  return null;
}

function startServer(port) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  return child;
}
async function waitServer(base) {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`${base}/api/works`);
      if (response.ok) return await response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('服务起不来：/api/works 一直无响应');
}

// 首选用虚拟时钟跑完开场动画再截（确定、快）；截不出文件时退一次真实等待。
function shoot(browser, profile, url, out, virtual) {
  return new Promise((resolve) => {
    const flags = [
      '--headless=new',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      `--user-data-dir=${profile}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      `--screenshot=${out}`,
    ];
    if (virtual) flags.push(`--virtual-time-budget=${budget}`);
    else flags.push('--timeout=8000');
    const child = spawn(browser, [...flags, url], { stdio: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGKILL'), 90000);
    child.on('exit', () => {
      clearTimeout(timer);
      resolve(fs.existsSync(out) && fs.statSync(out).size > 0);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

const browser = findBrowser();
if (!browser) {
  console.error('找不到 headless 浏览器：装 Chrome/Edge，或用 THUMB_BROWSER 指定');
  process.exit(1);
}
fs.mkdirSync(thumbsDir, { recursive: true });
const port = 4300 + Math.floor(Math.random() * 700);
const server = startServer(port);
const base = `http://127.0.0.1:${port}`;
let listed;
try {
  listed = await waitServer(base);
} catch (error) {
  server.kill();
  console.error(error.message);
  process.exit(1);
}
const works = listed.works
  .map((work) => {
    let src = '';
    try {
      src = JSON.parse(work.content).src || '';
    } catch {}
    return { id: work.id, src };
  })
  .filter((work) => work.src.startsWith('/works/'))
  .filter((work) => !only.length || only.includes(work.id));
console.log(
  `浏览器 ${browser}｜作品 ${works.length} 件｜并发 ${jobs}｜虚拟时钟 ${budget}ms`,
);

const profiles = Array.from(
  { length: jobs },
  (_, i) => fs.mkdtempSync(path.join(os.tmpdir(), `aob-thumb-${i}-`)),
);
let cursor = 0,
  done = 0,
  failed = 0;
async function worker(slot) {
  for (;;) {
    const index = cursor++;
    if (index >= works.length) return;
    const work = works[index];
    const out = path.join(thumbsDir, `${work.id}.png`);
    fs.rmSync(out, { force: true });
    let ok = await shoot(browser, profiles[slot], base + work.src, out, true);
    if (!ok) {
      fs.rmSync(out, { force: true });
      ok = await shoot(browser, profiles[slot], base + work.src, out, false);
    }
    const size = ok ? fs.statSync(out).size : 0;
    if (!ok || size < 4000) failed++;
    console.log(
      `${ok ? (size < 4000 ? 'BLANK?' : 'ok  ') : 'FAIL'} ${work.id} ${(size / 1024).toFixed(0)}KB`,
    );
    done++;
    if (done === works.length)
      console.log(`完成 ${done}/${works.length}，可疑或失败 ${failed} 件`);
  }
}
await Promise.all(profiles.map((_, slot) => worker(slot)));
server.kill();
for (const profile of profiles)
  fs.rmSync(profile, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
