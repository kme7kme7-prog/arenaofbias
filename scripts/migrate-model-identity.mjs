// 模型身份统一迁移（决策 097）：变体 model_id 归并到规范 id + 显示名统一为
// 「Kimi K3 / Gemini 3.7 Flash」风格，同名变体成为一个模型的多件作品。
// 副作用：合并后同场内战的历史票变成自票，Elo 重放无法容纳，删除（数量打印出来）。
// 用法：node scripts/migrate-model-identity.mjs [dbPath]   默认 data/comments.db
// 幂等：映射键是旧 id，跑过后不再命中；二次执行为 no-op。
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.argv[2] || 'data/comments.db';

// 旧 model_id → { id: 规范 id, name: 规范显示名 }。id 不变时省略 id 字段。
const MERGE = {
  'deepseek-v4-pro-0813-high': { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  'deepseek-v4-pro--0821-1ligi': { name: 'DeepSeek V4 Pro（灰测0821凌晨）' }, // 用户点名保留灰测标注
  'deepseek-v4-flash-0731': { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  'deepseek-v4-flash-vision-exp-ocgo': { id: 'deepseek-v4-flash-vision', name: 'DeepSeek V4 Flash Vision' },
  'deepseek-v4.1-flash-e0910': { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
  'deepseek-v4.1-flash-wb-high': { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
  'deepseek-v4.1-flash-expires-on-0910': { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
  'claude-fable-5': { name: 'Claude Fable 5' },
  'claude-fable-5.1-19cvx': { id: 'claude-fable-5.1', name: 'Claude Fable 5.1' },
  'claude-opus-5': { name: 'Claude Opus 5' },
  'gemini-3.5-flash-lite': { name: 'Gemini 3.5 Flash Lite' },
  'gemini-3.7-flash': { name: 'Gemini 3.7 Flash' },
  'gemini-3.8-flash-0qoeh': { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
  'gemini-3.8-flash-high': { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
  'glm-5.3': { name: 'GLM-5.3' },
  'glm-5.3-flash': { name: 'GLM-5.3-Flash' },
  'gpt-4o': { name: 'GPT-4o' },
  'gpt-5.6-cyber-0mxzh': { id: 'gpt-5.6-cyber', name: 'GPT-5.6 Cyber' },
  'gpt-5.6-sol-0829': { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
  'gpt-6-astra': { name: 'GPT-6 Astra' },
  'gpt-6-astra-0xbqp': { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
  'gpt-6-astra-low': { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
  'gpt-6-astra-medium': { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
  'gpt-6-astra-1hhmw': { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
  'gpt-6-astra-low-0nd6u': { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
  'grok-4.6': { name: 'Grok 4.6' },
  'hy3': { name: 'Hy3' },
  'hy4-preview': { id: 'hy4', name: 'Hy4' },
  'inkling': { name: 'Inkling' },
  'kimi-k2.8-preview': { id: 'kimi-k2.8', name: 'Kimi K2.8' },
  'kimi-k3': { name: 'Kimi K3' },
  'minimax-m3': { name: 'MiniMax-M3' },
  'muse-spark-1.2-contributor': { id: 'muse-spark-1.2', name: 'Muse Spark 1.2' },
  'muse-spark-1.3-18356': { id: 'muse-spark-1.3', name: 'Muse Spark 1.3' },
  'omen-alpha': { name: 'Omen Alpha' },
  'ox-alpha': { name: 'Ox Alpha' },
  'qwen3.5-4b-thinking': { name: 'Qwen3.5 4B Thinking' },
  'qwen3.8-flash': { name: 'Qwen3.8 Flash' },
  'qwen3.8-max-0902': { id: 'qwen3.8-max', name: 'Qwen3.8 Max' },
  'qwen3.8-max-0gzl3': { id: 'qwen3.8-max', name: 'Qwen3.8 Max' },
  'qwen3.8-27b-gsq-rco-iq3-s-xhigh': { id: 'qwen3.8-27b', name: 'Qwen3.8 27B' },
  'seed-2.1-pro': { name: 'Seed 2.1 Pro' },
  'seed-2.1-pro-high': { id: 'seed-2.1-pro', name: 'Seed 2.1 Pro' },
  'lfm2.5-2.6b': { name: 'LFM2.5 2.6B' },
  'mimo-x-flash-preview': { id: 'mimo-x-flash', name: 'MiMo X Flash' },
  'dots3-note-prev': { id: 'dots3-note', name: 'Dots3 Note' },
};

const canonId = (mid) => MERGE[mid]?.id ?? mid;
const target = (row) => {
  const m = MERGE[row.modelId ?? row.model_id];
  if (!m) return null;
  const id = m.id ?? row.modelId ?? row.model_id;
  const name = m.name ?? (row.modelName ?? row.model_name);
  if (id === row.modelId && name === row.modelName) return null;
  return { id, name };
};

if (!fs.existsSync(dbPath)) {
  console.error(`找不到数据库：${dbPath}`);
  process.exit(1);
}
const db = new DatabaseSync(dbPath);

// 预演：先算出要动的行与会被删的自票，任何异常都在写盘前暴露
const works = db
  .prepare('SELECT id, model_id AS modelId, model_name AS modelName FROM works')
  .all();
const workPlans = works
  .map((w) => ({ row: w, to: target(w) }))
  .filter((p) => p.to);

const votes = db
  .prepare('SELECT id, winner_mid AS wm, loser_mid AS lm FROM votes')
  .all();
const selfVotes = votes.filter((v) => canonId(v.wm) === canonId(v.lm));

const reactions = db
  .prepare(
    'SELECT id, prompt_id AS promptId, mid, user_id AS userId, kind, created_at AS ts FROM reactions',
  )
  .all()
  .map((r) => ({ ...r, mid: canonId(r.mid) }));
// 归并后同 (user, prompt, mid) 撞槽的只留最新一条（一人一题一模型一槽）
const keep = new Map();
for (const r of reactions) {
  const key = `${r.userId}|${r.promptId}|${r.mid}`;
  const prev = keep.get(key);
  if (!prev || r.ts > prev.ts) keep.set(key, r);
}
const droppedReactions = reactions.filter((r) => keep.get(`${r.userId}|${r.promptId}|${r.mid}`) !== r);

const updateWork = db.prepare('UPDATE works SET model_id = ?, model_name = ? WHERE id = ?');
const updateVoteMids = db.prepare('UPDATE votes SET winner_mid = ?, loser_mid = ? WHERE id = ?');
const deleteVote = db.prepare('DELETE FROM votes WHERE id = ?');
const updateReaction = db.prepare('UPDATE reactions SET mid = ? WHERE id = ?');
const deleteReaction = db.prepare('DELETE FROM reactions WHERE id = ?');

// node:sqlite 没有 better-sqlite3 的 .transaction API，手动包事务
db.exec('BEGIN IMMEDIATE');
try {
  for (const v of selfVotes) deleteVote.run(v.id);
  for (const { row, to } of workPlans) updateWork.run(to.id, to.name, row.id);
  for (const v of votes) {
    if (canonId(v.wm) === v.wm && canonId(v.lm) === v.lm) continue;
    if (selfVotes.includes(v)) continue;
    updateVoteMids.run(canonId(v.wm), canonId(v.lm), v.id);
  }
  for (const r of droppedReactions) deleteReaction.run(r.id);
  for (const r of keep.values()) updateReaction.run(r.mid, r.id);
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

// 复核：每个 model_id 只有一个显示名；显示名互不重复；票面 mid 与作品表一致；无自票
const problems = [];
const names = db
  .prepare('SELECT model_id AS id, COUNT(DISTINCT model_name) n FROM works GROUP BY model_id HAVING n > 1')
  .all();
for (const n of names) problems.push(`model_id ${n.id} 仍有多个显示名`);
const dupNames = db
  .prepare(
    'SELECT model_name AS name, COUNT(DISTINCT model_id) n FROM works WHERE is_demo = 0 GROUP BY model_name HAVING n > 1',
  )
  .all();
for (const d of dupNames) problems.push(`显示名「${d.name}」挂在多个 model_id 上`);
const orphan = db
  .prepare(
    `SELECT COUNT(*) n FROM votes v
     JOIN works w1 ON w1.id = v.winner_rid JOIN works w2 ON w2.id = v.loser_rid
     WHERE w1.model_id != v.winner_mid OR w2.model_id != v.loser_mid OR v.winner_mid = v.loser_mid`,
  )
  .get();
if (orphan.n > 0) problems.push(`有 ${orphan.n} 条票面 mid 与作品表不一致或仍是自票`);

const after = db
  .prepare(
    'SELECT model_id AS id, model_name AS name FROM works WHERE is_demo = 0 GROUP BY model_id, name ORDER BY name',
  )
  .all();

console.log(
  `迁移完成：works 改写 ${workPlans.length} 行，删除自票 ${selfVotes.length} 条，` +
    `删除撞槽反应 ${droppedReactions.length} 条，合并后真实模型 ${new Set(after.map((a) => a.id)).size} 个`,
);
for (const a of after) console.log(`  ${a.id}  ${a.name}`);
if (problems.length) {
  console.error('复核未通过：');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('复核通过：一 id 一名、显示名无重复、票面与作品表一致。');
db.close();
