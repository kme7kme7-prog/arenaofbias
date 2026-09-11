// 作品登记脚本（后台第二期「作品登记」的雏形，决策 043）：
// 把一个文件夹里的单文件 HTML 作品批量登记进 works 表并复制到 data/works。
//
// 文件名约定：`标题，模型名.html`（全角逗号分隔；缺逗号时按结尾的 ASCII 模型名回退解析）。
// 标题里的「普通-」之类分类前缀会被剥掉。
//
// 用法：node scripts/register-works.mjs --source "新建文件夹/tihu" --prompt 001
//   --source  作品源目录（原件不动，复制进作品目录）
//   --prompt  题号（须是 arena.ts 题库里的合法题号）
//   --draft   可选：登记为未发布（默认登记即发布）
//
// 幂等：同一批文件按文件名排序生成稳定的作品 id，重复执行跳过已存在的 id。
import Database from 'better-sqlite3';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
};
const source = flag('source');
const promptId = flag('prompt');
if (!source || !promptId) {
  console.error('用法: node scripts/register-works.mjs --source <目录> --prompt <题号> [--draft]');
  process.exit(1);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(projectRoot, 'data');
const worksDir = process.env.WORKS_DIR || path.join(dataDir, 'works');
const db = new Database(path.join(dataDir, 'comments.db'));

// 题号须在服务端白名单内（与 server/index.js 的 ALLOWED_ROUNDS 同步维护）
const ALLOWED = ['001', '002', '003', '004', '005', '006', '007'];
if (!ALLOWED.includes(promptId)) {
  console.error(`未知题号 ${promptId}（允许：${ALLOWED.join(' ')}）`);
  process.exit(1);
}

// 模型 id：小写 slug；原文含非 ASCII 或 slug 为空时掺文件名无关的短哈希，
// 保证「gpt-6-astra-降智」不会和「gpt-6-astra」塌成同一个模型。
const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
const hash5 = (value) => {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).padStart(7, '0').slice(0, 5);
};
const modelIdOf = (raw) => {
  const base = slug(raw);
  // 含非可打印 ASCII（中文模型名等）或 slug 为空时掺短哈希，
  // 保证「gpt-6-astra-降智」不会和「gpt-6-astra」塌成同一个模型
  if (/[^\x21-\x7e]/.test(raw) || !base) return `${base || 'model'}-${hash5(raw)}`;
  return base;
};

// 解析文件名 → { title, model }
const parseName = (stem) => {
  const commaIndex = stem.lastIndexOf('，');
  if (commaIndex > 0)
    return {
      title: stem.slice(0, commaIndex).replace(/^[^-]-/, '').replace(/^普通-/, ''),
      model: stem.slice(commaIndex + 1),
    };
  // 无全角逗号：结尾连续的 ASCII 段视作模型名
  const match = stem.match(/([A-Za-z][A-Za-z0-9._-]*)$/);
  if (!match) return { title: stem.replace(/^普通-/, ''), model: 'unknown' };
  return {
    title: stem.slice(0, match.index).replace(/^普通-/, ''),
    model: match[1],
  };
};

const files = readdirSync(source)
  .filter((name) => name.toLowerCase().endsWith('.html'))
  .sort(); // 排序保证同批作品 id 稳定，重复执行幂等
if (files.length === 0) {
  console.error(`目录里没有 HTML 文件: ${source}`);
  process.exit(1);
}

const targetDir = path.join(worksDir, promptId);
mkdirSync(targetDir, { recursive: true });

const insert = db.prepare(
  `INSERT OR IGNORE INTO works (id, prompt_id, model_id, model_name, title, is_demo, content, published, created_at)
   VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
);
const exists = db.prepare('SELECT id FROM works WHERE id = ?');

const seenIds = new Set();
let registered = 0;
let skipped = 0;
const perModelCount = new Map();

for (const file of files) {
  const { title, model } = parseName(file.replace(/\.html$/i, ''));
  const modelId = modelIdOf(model);
  const nth = (perModelCount.get(modelId) ?? 0) + 1;
  perModelCount.set(modelId, nth);
  const workId = nth === 1 ? `${promptId}-${modelId}` : `${promptId}-${modelId}-${nth}`;
  if (seenIds.has(workId) || exists.get(workId)) {
    skipped++;
    continue;
  }
  seenIds.add(workId);
  const target = path.join(targetDir, `${workId}.html`);
  copyFileSync(path.join(source, file), target);
  const result = insert.run(
    workId,
    promptId,
    modelId,
    model,
    title || workId,
    JSON.stringify({ kind: 'html', src: `/works/${promptId}/${workId}.html` }),
    args.includes('--draft') ? 0 : 1,
    Date.now(),
  );
  if (result.changes > 0) {
    registered++;
    console.log(`+ ${workId} ← ${title}（${model}）`);
  } else {
    skipped++;
  }
}

console.log(
  `\n完成：登记 ${registered} 件，跳过 ${skipped} 件（已存在）。作品目录：${targetDir}`,
);
if (registered > 0 && !args.includes('--draft'))
  console.log('已发布——前台刷新后即可在对局中看到。');
db.close();
