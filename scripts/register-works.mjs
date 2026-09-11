// 作品登记脚本（后台第二期「收件箱登记」的 CLI 伴生件，决策 043/044）：
// 把一个文件夹里的单文件 HTML 作品批量登记进 works 表并复制到 data/works。
// 解析、id、搬运与入库逻辑在 server/works-register.js（与后台收件箱共用）。
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
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  insertWork,
  modelIdOf,
  parseWorkFilename,
  transferPath,
} from '../server/works-register.js';

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

// 题号以 prompts 表为准（动态题库，决策 045）；表由服务端首次启动时迁移创建
if (!db.prepare('SELECT 1 FROM prompts WHERE id = ?').get(promptId)) {
  console.error(`未知题号 ${promptId}（题目须已存在于题库，可先在后台新增）`);
  process.exit(1);
}

const files = readdirSync(source)
  .filter((name) => name.toLowerCase().endsWith('.html'))
  .sort(); // 排序保证同批作品 id 稳定，重复执行幂等
if (files.length === 0) {
  console.error(`目录里没有 HTML 文件: ${source}`);
  process.exit(1);
}

const targetDir = path.join(worksDir, promptId);

const exists = db.prepare('SELECT id FROM works WHERE id = ?');

const seenIds = new Set();
let registered = 0;
let skipped = 0;
const perModelCount = new Map();

for (const file of files) {
  const { title, model } = parseWorkFilename(file.replace(/\.html$/i, ''));
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
  transferPath(path.join(source, file), target); // copy：原件不动
  try {
    insertWork(db, {
      id: workId,
      promptId,
      modelId,
      modelName: model,
      title: title || workId,
      content: { kind: 'html', src: `/works/${promptId}/${workId}.html` },
      published: !args.includes('--draft'),
    });
    registered++;
    console.log(`+ ${workId} ← ${title}（${model}）`);
  } catch (error) {
    // 同 id 竞争写入时按「已存在」计（旧行为 INSERT OR IGNORE 的等价语义）
    if (error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      skipped++;
      continue;
    }
    throw error;
  }
}

console.log(
  `\n完成：登记 ${registered} 件，跳过 ${skipped} 件（已存在）。作品目录：${targetDir}`,
);
if (registered > 0 && !args.includes('--draft'))
  console.log('已发布——前台刷新后即可在对局中看到。');
db.close();
