// 一次性数据脚本（2026-09-25，用户拍板「对局内显示具体型号、榜单合并计算」）：
// 把合并时被统一覆盖的具体型号名按作品 id 还原——对局揭晓/题库读 works.model_name
// （作品级），榜单家族名由 lib/leaderboard.ts 按 modelId 映射，两不耽误。幂等。
// 用法：node .tmp-restore-specific-names.mjs <db路径>
import Database from 'better-sqlite3';

const dbPath = process.argv[2] || 'data/comments.db';
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 合并后家族 model_id → 按作品 id 推导具体型号名（顺序敏感：长前缀在前）
const FAMILIES = [
  {
    id: 'claude-fable-5.x',
    rules: [
      ['claude-fable-5.2-max', 'Claude Fable 5.2 Max'],
      ['claude-fable-5.1', 'Claude Fable 5.1'],
      ['claude-fable-5', 'Claude Fable 5'],
    ],
  },
  {
    id: 'claude-opus-5.x',
    rules: [
      ['claude-opus-5.5-question', 'Claude Opus 5.5?'],
      ['claude-opus-5', 'Claude Opus 5'],
    ],
  },
  {
    id: 'gemini-3.8-flash',
    rules: [
      ['gemini-3.7-flash', 'Gemini 3.7 Flash'],
      ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
    ],
  },
  {
    id: 'muse-spark-1.3',
    rules: [
      ['muse-spark-1.2', 'Muse Spark 1.2'],
      ['muse-spark-1.3', 'Muse Spark 1.3'],
    ],
  },
];

const update = db.prepare('UPDATE works SET model_name = ? WHERE id = ?');
let changed = 0;
for (const family of FAMILIES) {
  const rows = db
    .prepare('SELECT id, model_name FROM works WHERE model_id = ?')
    .all(family.id);
  for (const row of rows) {
    const rule = family.rules.find(([slug]) => row.id.includes(slug));
    if (!rule) {
      console.log(`  ! ${row.id} 无匹配规则（保留现名 ${row.model_name}）`);
      continue;
    }
    if (row.model_name !== rule[1]) {
      update.run(rule[1], row.id);
      changed += 1;
      console.log(`  ${row.id}: ${row.model_name} → ${rule[1]}`);
    }
  }
}
console.log(`共更新 ${changed} 行`);

// 校验：家族内作品名分布
for (const family of FAMILIES) {
  const dist = db
    .prepare('SELECT model_name, COUNT(*) n FROM works WHERE model_id = ? GROUP BY model_name')
    .all(family.id);
  console.log(family.id, '→', JSON.stringify(dist));
}
db.close();
