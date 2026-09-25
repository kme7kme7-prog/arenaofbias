// 一次性数据治理脚本（2026-09-25 内测开闸前，用户逐项拍板）：
// 把匿名代号/多版本条目合并进规范条目。幂等——from 清单清零后再跑是无操作。
// 用法：node .tmp-merge-models.mjs <db路径> [--dry]
//   --dry 只打印将发生的变更，不写库；不带 --dry 会先做 SQLite 在线备份再动手。
// 动三张表：works(model_id/model_name)、votes(winner_mid/loser_mid)、reactions(mid)。
// reactions 的唯一槽是 (user_id, prompt_id, mid)：同一用户对同题在「旧 mid」和
// 「目标 mid」都有反应时合并为一行——保留 created_at 较新一方的 kind，删掉旧行。
import Database from 'better-sqlite3';

const dbPath = process.argv[2] || 'data/comments.db';
const dry = process.argv.includes('--dry');

const MERGES = [
  {
    from: ['ox-alpha'],
    to: 'glm-5.3-flash',
    name: 'GLM-5.3-Flash',
  },
  {
    from: ['claude-fable-5', 'claude-fable-5.1', 'claude-fable-5.2-max'],
    to: 'claude-fable-5.x',
    name: 'Claude Fable 5.x',
  },
  {
    from: ['gemini-3.7-flash'],
    to: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
  },
  {
    from: ['muse-spark-1.2'],
    to: 'muse-spark-1.3',
    name: 'Muse Spark 1.3',
  },
  {
    from: ['claude-opus-5', 'claude-opus-5.5-question'],
    to: 'claude-opus-5.x',
    name: 'Claude Opus 5.x',
  },
];

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const count = (sql, ...params) => db.prepare(sql).get(...params).n;
const placeholder = MERGES.flatMap((m) => m.from).map(() => '?').join(',');
const allFrom = MERGES.flatMap((m) => m.from);

console.log(`库：${dbPath}（${dry ? 'DRY 预览' : '实跑'}）`);
console.log(
  '前置总量：works=%d votes=%d reactions=%d',
  count('SELECT COUNT(*) n FROM works'),
  count('SELECT COUNT(*) n FROM votes'),
  count('SELECT COUNT(*) n FROM reactions'),
);

for (const m of MERGES) {
  const marks = m.from.map(() => '?').join(',');
  const worksRows = db
    .prepare(
      `SELECT id, prompt_id, model_name FROM works WHERE model_id IN (${marks})`,
    )
    .all(...m.from);
  const votesWin = count(
    `SELECT COUNT(*) n FROM votes WHERE winner_mid IN (${marks})`,
    ...m.from,
  );
  const votesLose = count(
    `SELECT COUNT(*) n FROM votes WHERE loser_mid IN (${marks})`,
    ...m.from,
  );
  const reactionsRows = db
    .prepare(`SELECT id, user_id, prompt_id, kind, created_at FROM reactions WHERE mid IN (${marks})`)
    .all(...m.from);
  console.log(
    `\n== ${m.from.join(' + ')} → ${m.to}（${m.name}）：works=${worksRows.length} votes(胜${votesWin}/负${votesLose}) reactions=${reactionsRows.length}`,
  );
  for (const w of worksRows) console.log(`   作品 ${w.id}（题${w.prompt_id}，原名${w.model_name}）`);
}

if (dry) {
  console.log('\n-- DRY 结束，未写库 --');
  process.exit(0);
}

// ---- 在线备份（WAL 一致性快照），失败即中止 ----
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = dbPath.replace(/[^/\\]+$/, '') + `comments.db.pre-merge-${stamp}.bak`;
await db.backup(backupPath);
console.log(`\n已备份 → ${backupPath}`);

const totalsBefore = {
  works: count('SELECT COUNT(*) n FROM works'),
  votes: count('SELECT COUNT(*) n FROM votes'),
  reactions: count('SELECT COUNT(*) n FROM reactions'),
};

const run = db.transaction(() => {
  const summary = [];
  for (const m of MERGES) {
    const marks = m.from.map(() => '?').join(',');
    const worksMoved = db
      .prepare(
        `UPDATE works SET model_id = ?, model_name = ? WHERE model_id IN (${marks})`,
      )
      .run(m.to, m.name, ...m.from).changes;
    // 幸存行的显示名统一成规范名（幂等：本就规范时 0 行变化）
    const renamed = db
      .prepare('UPDATE works SET model_name = ? WHERE model_id = ? AND model_name != ?')
      .run(m.name, m.to, m.name).changes;
    const votesWinMoved = db
      .prepare(`UPDATE votes SET winner_mid = ? WHERE winner_mid IN (${marks})`)
      .run(m.to, ...m.from).changes;
    const votesLoseMoved = db
      .prepare(`UPDATE votes SET loser_mid = ? WHERE loser_mid IN (${marks})`)
      .run(m.to, ...m.from).changes;

    // reactions：先把「旧 mid 行」与「目标 mid 行」同用户同题的冲突合并——
    // 保留 created_at 较新一方的 kind，删掉其中一行，再把剩余旧 mid 改归属
    let reactionMerged = 0;
    let reactionMoved = 0;
    const oldRows = db
      .prepare(
        `SELECT id, user_id, prompt_id, kind, created_at FROM reactions WHERE mid IN (${marks})`,
      )
      .all(...m.from);
    for (const old of oldRows) {
      const keep = db
        .prepare(
          'SELECT id, kind, created_at FROM reactions WHERE user_id = ? AND prompt_id = ? AND mid = ?',
        )
        .get(old.user_id, old.prompt_id, m.to);
      if (keep) {
        const winner = old.created_at > keep.created_at ? old : keep;
        const loserRow = winner === old ? keep : old;
        db.prepare('UPDATE reactions SET kind = ? WHERE id = ?').run(winner.kind, keep.id);
        db.prepare('DELETE FROM reactions WHERE id = ?').run(loserRow.id);
        reactionMerged += 1;
      } else {
        db.prepare('UPDATE reactions SET mid = ? WHERE id = ?').run(m.to, old.id);
        reactionMoved += 1;
      }
    }
    summary.push({ to: m.to, worksMoved, renamed, votesWinMoved, votesLoseMoved, reactionMoved, reactionMerged });
  }
  return summary;
});

const summary = run();

console.log('\n== 变更明细 ==');
for (const s of summary)
  console.log(
    `${s.to}: 作品${s.worksMoved} 改名${s.renamed} 票(胜${s.votesWinMoved}/负${s.votesLoseMoved}) 反应迁移${s.reactionMoved}/冲突合并${s.reactionMerged}`,
  );

// ---- 断言：旧 mid 零残留；总量守恒（works/votes 不变，reactions 只减不增）----
const leftoversWorks = count(
  `SELECT COUNT(*) n FROM works WHERE model_id IN (${placeholder})`,
  ...allFrom,
);
const leftoversVotes = count(
  `SELECT COUNT(*) n FROM votes WHERE winner_mid IN (${placeholder}) OR loser_mid IN (${placeholder})`,
  ...allFrom,
  ...allFrom,
);
const leftoversReactions = count(
  `SELECT COUNT(*) n FROM reactions WHERE mid IN (${placeholder})`,
  ...allFrom,
);
const totalsAfter = {
  works: count('SELECT COUNT(*) n FROM works'),
  votes: count('SELECT COUNT(*) n FROM votes'),
  reactions: count('SELECT COUNT(*) n FROM reactions'),
};

console.log('\n== 断言 ==');
console.log('旧 mid 残留 works=%d votes=%d reactions=%d（应全为 0）', leftoversWorks, leftoversVotes, leftoversReactions);
console.log('总量 works %d→%d votes %d→%d reactions %d→%d',
  totalsBefore.works, totalsAfter.works, totalsBefore.votes, totalsAfter.votes, totalsBefore.reactions, totalsAfter.reactions);

const fail =
  leftoversWorks || leftoversVotes || leftoversReactions ||
  totalsAfter.works !== totalsBefore.works ||
  totalsAfter.votes !== totalsBefore.votes ||
  totalsAfter.reactions > totalsBefore.reactions;
if (fail) {
  console.error('!! 断言失败——请检查备份并回滚');
  process.exit(1);
}
console.log('全部断言通过');

console.log('\n== 合并后各目标条目 ==');
for (const m of MERGES) {
  const r = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM works WHERE model_id = ?) works,
              (SELECT COUNT(*) FROM votes WHERE winner_mid = ? OR loser_mid = ?) votes`,
    )
    .get(m.to, m.to, m.to);
  console.log(`${m.to}（${m.name}）: 作品 ${r.works}，票 ${r.votes}`);
}
db.close();
