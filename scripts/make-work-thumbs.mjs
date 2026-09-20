// Generate the same calibrated 16:9 view used by automatic share snapshots.
// npm run build && npm run thumbs:works -- --only work-id,work-id
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { captureWork, thumbFingerprint } from '../server/work-thumbnails.js';
const root = path.resolve(import.meta.dirname, '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const only = arg('only', '').split(',').filter(Boolean);
const settle = Math.max(2200, Number(arg('budget', '2200')) || 2200);
const directory = path.join(
  process.env.DATA_DIR || path.join(root, 'data'),
  'thumbs',
);
if (!fs.existsSync(path.join(root, 'dist/capture.html')))
  throw new Error('先运行 npm run build，生成快照入口');
const port = 4300 + Math.floor(Math.random() * 700);
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
  windowsHide: true,
});
const base = `http://127.0.0.1:${port}`;
try {
  let works;
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`${base}/api/works`);
      if (response.ok) {
        works = (await response.json()).works;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!works) throw new Error('快照服务未就绪');
  works = works.filter((work) => {
    const c = JSON.parse(work.content);
    return (
      c.kind === 'html' &&
      c.src?.startsWith('/works/') &&
      (!only.length || only.includes(work.id))
    );
  });
  let failed = 0;
  for (const work of works) {
    try {
      const png = await captureWork(
        base,
        work.id,
        directory,
        thumbFingerprint(work),
        settle,
      );
      console.log(`OK ${work.id} ${Math.round(png.length / 1024)} KB`);
    } catch (error) {
      failed++;
      console.error(`FAIL ${work.id}: ${error.message}`);
    }
  }
  console.log(`完成 ${works.length - failed}/${works.length}`);
  process.exitCode = failed ? 1 : 0;
} finally {
  child.kill();
}
