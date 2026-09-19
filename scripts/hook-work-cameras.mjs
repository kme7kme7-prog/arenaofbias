// 给「three 整库内联」的作品补上视角校准钩子（决策 104 后续，用户授权改作品文件）。
//
// 这些作品的 OrbitControls 类封在压缩闭包里，服务端注入桥的两条路径（全局 THREE、
// importmap）都够不着，只能在构造点自己上报一句：
//     window.__AOB__ && window.__AOB__.register(<实例>)
// 没注入桥时 `window.__AOB__` 是 undefined，整句短路成一次属性读取——画面、交互、
// 性能都不受影响，只加这一个上报口。
//
// data/works 不入库、重新接入会覆盖掉这里的改动，所以补丁写在这里：锚文本唯一才改、
// 改过就跳过、注入前后各做一次 `node --check` 语法闸门（原文能过而改后过不了就不落盘），
// 随时可重放。首次注入前的原文件备份在 data/.hook-backup/。
// 跑完必须用浏览器逐件确认：带桥能上报 controls 且画面正常、不带桥 __AOB__ 为
// undefined（空操作）、机位写回 3 秒后仍在。
//
//   node scripts/hook-work-cameras.mjs [--dry|--check]
//   --check：只查不改，有作品缺钩子就以退出码 1 报出来（重新接入后先跑这个）
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../data/works/007');
const REPORT = (ref) => `,window.__AOB__&&window.__AOB__.register(${ref})`;

// anchor 必须**不含**尾随分隔符：插入文本自带前导逗号/分号，锚点再带一个就会
// 写出 `,,` 把整包语法改坏（2026-09-19 首版就在 opus-5/astra 上踩过）。
const PATCHES = [
  {
    work: '007-claude-opus-5',
    file: 'index.html',
    anchor: 'this.controls=new hA(this.camera,this.renderer.domElement)',
    insert: REPORT('this.controls'),
  },
  {
    work: '007-gpt-4o',
    file: 'assets/index-BEgZo9Vl.js',
    anchor: 'var el=new Rc(Qc,$c.domElement);',
    insert: `window.__AOB__&&window.__AOB__.register(el);`,
  },
  {
    work: '007-gpt-5.6-cyber-0mxzh',
    file: 'assets/index-BV3B2Z3D.js',
    anchor: 'let l=new nl(c,e);',
    insert: `window.__AOB__&&window.__AOB__.register(l);`,
  },
  {
    work: '007-gpt-5.6-cyber-0mxzh-2',
    file: 'assets/index-BV3B2Z3D.js',
    anchor: 'let l=new nl(c,e);',
    insert: `window.__AOB__&&window.__AOB__.register(l);`,
  },
  {
    work: '007-gpt-5.6-sol-0829',
    file: 'assets/index-C0ScTAZ9.js',
    anchor: 'const wt=new kp(gt,al);',
    insert: `window.__AOB__&&window.__AOB__.register(wt);`,
  },
  {
    work: '007-gpt-6-astra-0xbqp',
    file: 'index.html',
    anchor: 'this.controls=new Ha(this.camera,this.canvas)',
    insert: REPORT('this.controls'),
  },
  {
    work: '007-gpt-6-astra-0xbqp-2',
    file: 'index.html',
    anchor: 'this.controls=new Ha(this.camera,this.canvas)',
    insert: REPORT('this.controls'),
  },
  {
    work: '007-muse-spark-1.2-contributor',
    file: 'assets/index-Mpa6RC5G.js',
    anchor: 'const ii=new If(Rt,Rn.domElement);',
    insert: `window.__AOB__&&window.__AOB__.register(ii);`,
  },
  {
    work: '007-deepseek-v4.1-flash-e0910-2',
    file: 'src/camera/controls.js',
    anchor: 'const controls = new OrbitControls(camera, domElement);',
    insert: `\n  window.__AOB__ && window.__AOB__.register(controls);`,
  },
];

/**
 * 语法闸门：把改动点所在的那段脚本单独抽出来 `node --check`。
 * 作品是压缩产物，插错一个逗号就是整包解析失败、画面全黑——而这正是
 * 「只加钩子、不改表现」的反面。原文能过、改后过不了就不落盘。
 */
let seq = 0;
function parses(file, text, anchor) {
  let body;
  let ext = 'mjs';
  if (file.endsWith('.js')) {
    body = text;
  } else {
    // 不能拿「最近的 <script」当起点：压缩产物里有 "<script>" 这种字符串字面量。
    // 逐个 script 配对来找（HTML 里的 </script> 只能是真终止符，JS 里必须写 <\/script）
    body = null;
    for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (!m[2].includes(anchor)) continue;
      body = m[2];
      if (!/type\s*=\s*["']?module/i.test(m[1])) ext = 'cjs';
      break;
    }
    if (body === null) return { ok: false, why: '找不到包裹脚本' };
  }
  const tmp = path.join(os.tmpdir(), `aob-hook-check-${process.pid}-${seq++}.${ext}`);
  fs.writeFileSync(tmp, body);
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  fs.rmSync(tmp, { force: true });
  return { ok: r.status === 0, why: (r.stderr || '').split('\n').slice(1, 3).join(' ') };
}

const dry = process.argv.includes('--dry');
const checkOnly = process.argv.includes('--check');
let changed = 0;
let skipped = 0;
const missing = [];

for (const { work, file, anchor, insert } of PATCHES) {
  const p = path.join(root, work, file);
  if (!fs.existsSync(p)) {
    missing.push(`${work}/${file}（文件不在）`);
    console.log(`缺失 ${work}/${file} —— 作品未接入或文件名变了，跳过`);
    continue;
  }
  const text = fs.readFileSync(p, 'utf8');
  const tagged = anchor + insert;
  if (text.includes(tagged)) {
    skipped++;
    console.log(`已钩 ${work}/${file}`);
    continue;
  }
  const hits = text.split(anchor).length - 1;
  if (hits !== 1) {
    missing.push(`${work}/${file}（锚点 ${hits} 次）`);
    console.log(`跳过 ${work}/${file}：锚点出现 ${hits} 次（需要恰好 1 次），未改`);
    continue;
  }
  if (checkOnly || dry) {
    missing.push(`${work}/${file}（待注入）`);
    console.log(`${checkOnly ? '待注入' : '将改'} ${work}/${file}`);
    continue;
  }
  const next = text.replace(anchor, tagged);
  if (!parses(file, text, anchor).ok) {
    missing.push(`${work}/${file}（原文就过不了语法检查）`);
    console.log(`跳过 ${work}/${file}：原文语法检查未过，不动它`);
    continue;
  }
  const after = parses(file, next, anchor);
  if (!after.ok) {
    missing.push(`${work}/${file}（注入后语法失败）`);
    console.log(`拒绝 ${work}/${file}：注入后语法失败 —— ${after.why}`);
    continue;
  }
  fs.writeFileSync(p, next);
  changed++;
  console.log(`已改 ${work}/${file}`);
}

const mode = checkOnly ? 'check' : dry ? 'dry-run' : '完成';
console.log(
  `${mode}：${changed} 处已改，${skipped}/${PATCHES.length} 处已是最新`,
);
if (missing.length) {
  console.log(`缺钩子 ${missing.length} 处：\n  ${missing.join('\n  ')}`);
  process.exitCode = 1;
}
