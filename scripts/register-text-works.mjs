// 文字作品登记脚本（008 深夜聊天题首批接入，2026-09-21）：
// 源目录里每个模型一个 .txt，文件内用单独一行 `//` 分隔六段回复，
// 每段登记为一件 kind:'text' 的作品（content 直接入库，磁盘不落作品文件）。
// 对局抽到该模型时由两级抽取（决策 097）从六件里随机挑一件。
//
// 用法：node scripts/register-text-works.mjs --source Temp/TEXT --prompt 008
//   --draft  可选：登记为未发布（默认登记即发布）
//
// 幂等：作品 id 按「题号-模型id-序号」稳定生成，重复执行跳过已存在的 id。
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { insertWork } from '../server/works-register.js';

// 文件名主干 → 库里既有的规范模型（model_id | model_name），与 004–007 同一套身份
const MODELS = {
  'GLM-5.3': ['glm-5.3', 'GLM-5.3'],
  'GLM-5.3F': ['glm-5.3-flash', 'GLM-5.3-Flash'],
  'MiniMAXM3': ['minimax-m3', 'MiniMax-M3'],
  'Qwen3.8Flash': ['qwen3.8-flash', 'Qwen3.8 Flash'],
  'Qwen3.8MAX': ['qwen3.8-max', 'Qwen3.8 Max'],
  'deepseekV4.1': ['deepseek-v4.1-flash', 'DeepSeek V4.1 Flash'],
  'fable5.1': ['claude-fable-5.1', 'Claude Fable 5.1'],
  'gemini3.8': ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
  'gpt-6astra': ['gpt-6-astra', 'GPT-6 Astra'],
  'opus5': ['claude-opus-5', 'Claude Opus 5'],
};

// 每模型段数以源文件实况为准（2026-09-21 用户确认）：
// MiniMAXM3 的第 4 段单字回复「操。」算一件，共 7 件；
// gpt-6astra 源文件是聊天记录导出、暂只有 5 条，第 6 条后补——
// 补进源文件后重跑本脚本即幂等登记为 -6。
const SEGMENT_COUNTS = {
  'gpt-6astra': 5,
  'MiniMAXM3': 7,
};
const DEFAULT_SEGMENTS = 6;

// 分隔符：行首 `//`（fable5.1/opus5 各有一处 `//正文` 粘连——换行被吃，同样算分段；
// 正文里的 URL 不会以行首 // 出现，不误伤）
const splitSegments = (raw) =>
  raw
    .split(/^\/\//m)
    .map((text) => text.trim())
    .filter(Boolean);

// gpt-6astra.txt 是聊天工具导出：每条回复前有两行头（`openai/gpt-6-astra` + 时间戳）
const splitChatExport = (raw) =>
  raw
    .split(/^openai\/[\w.-]+\r?\n(?:[^\n]*\n)?/m)
    .map((text) => text.trim())
    .filter(Boolean);

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
};
const source = flag('source');
const promptId = flag('prompt');
if (!source || !promptId) {
  console.error(
    '用法: node scripts/register-text-works.mjs --source <目录> --prompt <题号> [--draft]',
  );
  process.exit(1);
}

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const dataDir = process.env.DATA_DIR || path.join(projectRoot, 'data');
const db = new Database(path.join(dataDir, 'comments.db'));

if (!db.prepare('SELECT 1 FROM prompts WHERE id = ?').get(promptId)) {
  console.error(`未知题号 ${promptId}（题目须已存在于题库）`);
  process.exit(1);
}

const files = readdirSync(source)
  .filter((name) => name.toLowerCase().endsWith('.txt'))
  .sort(); // 排序保证同批作品 id 稳定，重复执行幂等
if (files.length === 0) {
  console.error(`目录里没有 txt 文件: ${source}`);
  process.exit(1);
}

const exists = db.prepare('SELECT id FROM works WHERE id = ?');
const published = !args.includes('--draft');
const dry = args.includes('--dry');
let registered = 0;
let skipped = 0;

const insertAll = db.transaction(() => {
  for (const file of files) {
    const stem = file.replace(/\.txt$/i, '');
    const model = MODELS[stem];
    if (!model) throw new Error(`没有「${stem}」对应的规范模型映射，请先在脚本 MODELS 里补一行`);
    const [modelId, modelName] = model;
    const raw = readFileSync(path.join(source, file), 'utf8').replace(/\r\n/g, '\n');
    let segments = splitSegments(raw);
    // 聊天工具导出（每条回复带 `openai/xxx` 头）：整文件不含 `//` 分隔时按头切
    if (segments.length === 1 && /^openai\/[\w.-]+$/m.test(segments[0]))
      segments = splitChatExport(raw);
    const expected = SEGMENT_COUNTS[stem] ?? DEFAULT_SEGMENTS;
    if (segments.length !== expected)
      console.warn(
        `注意：${file} 解析出 ${segments.length} 段（预期 ${expected}），仍按实际段数登记`,
      );
    segments.forEach((segment, index) => {
      const nth = index + 1;
      const workId =
        nth === 1 ? `${promptId}-${modelId}` : `${promptId}-${modelId}-${nth}`;
      const paragraphs = segment.split(/\n{2,}/).map((p) => p.replace(/\n/g, ''));
      console.log(
        `${dry ? '~' : exists.get(workId) ? '=' : '+'} ${workId}（${modelName} · ${paragraphs.length} 段 · ${segment.length} 字）`,
      );
      if (dry || exists.get(workId)) {
        if (!dry) skipped++;
        return;
      }
      insertWork(db, {
        id: workId,
        promptId,
        modelId,
        modelName,
        title: `深夜回复 · 其${'一二三四五六七八九'[index] ?? nth}`,
        content: { kind: 'text', story: { paragraphs } },
        published,
      });
      registered++;
    });
  }
});
insertAll();

if (dry) console.log('\n试跑完成，未写库。');
else
  console.log(
    `\n完成：登记 ${registered} 件，跳过 ${skipped} 件（已存在）。${published ? '已发布——前台刷新后即可在对局中看到。' : '登记为草稿。'}`,
  );
db.close();
