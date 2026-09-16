// arenaofbias —— VPS 后端（原 Cloudflare Workers + D1 版的 Node 等价实现）
//
// 职责：
//   1. 托管 vite build 产物（dist/）下的静态文件；
//   2. 提供 /api/comments GET/POST 与 /api/votes GET/POST，数据存本地 SQLite（替代原 D1）；
//   3. 保留原接口行为：同源校验、按轮次/对局隔离、幂等插入、演示级限流。
//
// 运行：npm run build 之后执行 npm start（或 node server/index.js）。
// 环境变量：
//   PORT            监听端口，默认 3000
//   HOST            监听地址，默认 0.0.0.0
//   DATA_DIR        SQLite 文件目录，默认 <项目根>/data
//   RATE_LIMIT_PER_MIN  限流基础额度（每 IP 每分钟），默认 10；社交接口按原值、
//                     猜模型判定 ×3、埋点 ×6（分组见 limiterFor）
//   TRUST_PROXY     反代部署必设（如 loopback 或代理 IP 白名单）——不设时
//                   req.ip 是代理地址，/api/auth/dev 等回环门禁不可信
//   APP_ORIGIN      站点完整来源（如 https://example.com），反代后必设

import express from 'express';
import { installAuth } from './auth.js';
import {
  insertWork,
  modelIdOf,
  nextFreeWorkId,
  parseWorkFilename,
  transferPath,
} from './works-register.js';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(serverDir, '..');
const distDir = path.join(projectRoot, 'dist');
const dataDir = process.env.DATA_DIR || path.join(projectRoot, 'data');
const dbPath = path.join(dataDir, 'comments.db');
// 作品文件目录（决策 043）：大文件不入 git，住 data/works（与库同级的本地数据）。
// VPS 上通过 WORKS_DIR 指到固定位置，宝塔直接往里传文件。
const worksDir = process.env.WORKS_DIR || path.join(dataDir, 'works');
// 收件箱（决策 044）：宝塔/本机把待登记文件丢这里，后台「收件箱」页逐个登记进
// 作品库；登记即把文件搬进 worksDir——收件箱里只留待处理件。
const inboxDir = process.env.WORKS_INBOX_DIR || path.join(dataDir, 'inbox');
fs.mkdirSync(inboxDir, { recursive: true });
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const postsPerMinute = Number(process.env.RATE_LIMIT_PER_MIN || 10);

// ---------- 数据库 ----------

fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// 与 Cloudflare D1 版同一份表结构（见原 drizzle/0000_chunky_micromax.sql）。
db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id         TEXT PRIMARY KEY NOT NULL,
    round_id   TEXT NOT NULL,
    side       TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS comments_round_created
    ON comments (round_id, created_at);
`);

if (
  !db
    .prepare('PRAGMA table_info(comments)')
    .all()
    .some((column) => column.name === 'user_id')
)
  db.exec('ALTER TABLE comments ADD COLUMN user_id TEXT');

// 投票流水：一行 = 一次对局选择。去重单位是「对局」（两份作品，pair_key），
// 同一对作品同一账号只计一票；同一对模型换作品（不同 rid）是新的对局，可以再投
// （见 docs/DECISIONS.md 决策 021）。mode 记录投票发生的模式（blind/party），
// 为将来「娱乐是否计入正式榜」的分流留位，当前两类都计入。
db.exec(`
  CREATE TABLE IF NOT EXISTS votes (
    id         TEXT PRIMARY KEY NOT NULL,
    prompt_id  TEXT NOT NULL,
    winner_rid TEXT NOT NULL,
    winner_mid TEXT NOT NULL,
    loser_rid  TEXT NOT NULL,
    loser_mid  TEXT NOT NULL,
    pair_key   TEXT NOT NULL,
    mode       TEXT NOT NULL,
    user_id    TEXT,
    created_at INTEGER NOT NULL
  );
  -- 唯一索引按 (user_id, pair_key) 去重；user_id 为 NULL 的行不受唯一约束
  --（SQLite 的 NULL 互不相等），但 API 层写票必先登录，不会写入 NULL
  CREATE UNIQUE INDEX IF NOT EXISTS votes_user_pair
    ON votes (user_id, pair_key);
  CREATE INDEX IF NOT EXISTS votes_created ON votes (created_at);
`);

// ---------- 结构迁移（PRAGMA user_version 驱动） ----------
// 加字段/加表时在 MIGRATIONS 末尾追加一项、内容用幂等 SQL（CREATE ... IF NOT EXISTS /
// 先查列再 ALTER），已有线上库启动时自动补齐，不动存量数据。

const MIGRATIONS = [
  {
    // 001 · 作品表：后台内容管理的数据基础（决策 040）。
    // content 存 ResultContent 同构的 JSON（四种 kind 都装得下，以后加字段不用动表）；
    // published 是发布开关——新登记的作品默认未发布，前端 /api/works 只吐已发布的。
    up() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS works (
          id         TEXT PRIMARY KEY NOT NULL,
          prompt_id  TEXT NOT NULL,
          model_id   TEXT NOT NULL,
          model_name TEXT NOT NULL,
          title      TEXT NOT NULL,
          is_demo    INTEGER NOT NULL DEFAULT 0,
          content    TEXT NOT NULL,
          published  INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS works_prompt ON works (prompt_id);
      `);
      // 种子：仅当 works 表为空时，把内置花名册（与前端共享的 lib/works-roster.json）
      // 全量种入并置为已发布——不覆盖库里已有的任何行，重复启动无副作用。
      const count = db.prepare('SELECT COUNT(*) AS n FROM works').get();
      if (count.n === 0) {
        const roster = JSON.parse(
          fs.readFileSync(
            path.join(projectRoot, 'lib', 'works-roster.json'),
            'utf8',
          ),
        );
        const seed = db.prepare(
          `INSERT INTO works (id, prompt_id, model_id, model_name, title, is_demo, content, published, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        );
        const now = Date.now();
        const insertAll = db.transaction(() => {
          for (const work of roster) {
            seed.run(
              work.id,
              work.promptId,
              work.modelId,
              work.modelName,
              work.title,
              work.isDemo ? 1 : 0,
              JSON.stringify(work.content),
              now,
            );
          }
        });
        insertAll();
        console.log(`[arenaofbias] works 表已播种 ${roster.length} 条内置作品`);
      }
    },
  },
  {
    // 002 · 访客统计（后台体系，决策 040）：一行 = 一次页面浏览。
    // 不存 IP、不存 UA 明文——按日聚合时只需要日期桶，访客识别用 IP 哈希
    //（仅当日有效盐，无法反推原 IP，也跨不了日追踪）。
    up() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS page_views (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          day        TEXT NOT NULL,
          path       TEXT NOT NULL,
          ip_hash    TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS page_views_day ON page_views (day, created_at);
      `);
    },
  },
  {
    // 003 · 题目表（决策 045）：题库从写死的前端常量搬进数据库，后台才能管理。
    // kind 驱动榜单赛道分类（写作=text、网页=web）；published 下架 = 前台完全隐藏。
    up() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS prompts (
          id         TEXT PRIMARY KEY NOT NULL,
          kind       TEXT NOT NULL,
          category   TEXT NOT NULL DEFAULT '',
          code       TEXT NOT NULL DEFAULT '',
          name       TEXT NOT NULL,
          prompt     TEXT NOT NULL,
          commentary TEXT NOT NULL DEFAULT '',
          detail     TEXT NOT NULL DEFAULT '',
          published  INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL
        );
      `);
      // 种子：仅当表空时把内置 7 题种入并置为已发布（与前端共享 lib/prompts-seed.json），
      // 不覆盖库里已有的任何行，重复启动无副作用。
      const count = db.prepare('SELECT COUNT(*) AS n FROM prompts').get();
      if (count.n === 0) {
        const seed = JSON.parse(
          fs.readFileSync(
            path.join(projectRoot, 'lib', 'prompts-seed.json'),
            'utf8',
          ),
        );
        const insert = db.prepare(
          `INSERT INTO prompts (id, kind, category, code, name, prompt, commentary, detail, published, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        );
        const now = Date.now();
        db.transaction(() => {
          for (const prompt of seed) {
            insert.run(
              prompt.id,
              prompt.kind,
              prompt.category ?? '',
              prompt.code ?? '',
              prompt.name,
              prompt.prompt,
              prompt.commentary ?? '',
              prompt.detail ?? '',
              now,
            );
          }
        })();
        console.log(`[arenaofbias] prompts 表已播种 ${seed.length} 道内置题目`);
      }
    },
  },
  {
    // 004 · 投票 outcome 列：「无法抉择」平局票（决策 048）。
    // win（默认，存量票）= 分胜负；draw = 平局，榜单与声望分重放时双方各得半分。
    // 平局行的 winner_*/loser_* 按出场左右顺序登记（a 侧入 winner、 b 侧入 loser），
    // 只表示票面登记顺序，无胜负语义；对局去重（pair_key）口径不变——弃权也占用这一对。
    up() {
      if (
        !db
          .prepare('PRAGMA table_info(votes)')
          .all()
          .some((column) => column.name === 'outcome')
      )
        db.exec(
          `ALTER TABLE votes ADD COLUMN outcome TEXT NOT NULL DEFAULT 'win'`,
        );
    },
  },
  {
    // 005 · 反应表：娱乐模式揭晓后给模型点赞/点踩/大笑（2026-09-13 用户拍板）。
    // 一人对一题一模型占一个反应槽（UNIQUE 约束），换一种态度即覆盖 kind，不叠票；
    // 读取只回聚合计数与本人选择，不暴露他人身份。
    up() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS reactions (
          id         TEXT PRIMARY KEY NOT NULL,
          prompt_id  TEXT NOT NULL,
          mid        TEXT NOT NULL,
          kind       TEXT NOT NULL,
          user_id    TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS reactions_slot
          ON reactions (user_id, prompt_id, mid);
        CREATE INDEX IF NOT EXISTS reactions_prompt ON reactions (prompt_id);
      `);
    },
  },
  {
    // 006 · 模一把游玩数据（后台「模一把」页）：一局结束前端匿名上报一行。
    // answer_id 由服务端按 day_key+难度 自行派生（客户端报的是结果不是答案）。
    // 无需登录、可伪造但没有收益；ip_hash 当日盐，仅作粗略去重观察。
    up() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS guess_results (
          id         TEXT PRIMARY KEY NOT NULL,
          day_key    TEXT NOT NULL,
          difficulty INTEGER NOT NULL,
          answer_id  TEXT NOT NULL,
          won        INTEGER NOT NULL,
          attempts   INTEGER NOT NULL,
          ip_hash    TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS guess_results_day ON guess_results (day_key);
        CREATE INDEX IF NOT EXISTS guess_results_answer ON guess_results (answer_id);
      `);
    },
  },
];

{
  const applied = db.pragma('user_version', { simple: true });
  for (let v = applied; v < MIGRATIONS.length; v++) {
    MIGRATIONS[v].up();
    db.pragma(`user_version = ${v + 1}`);
    console.log(`[arenaofbias] 数据库迁移 ${String(v + 1).padStart(3, '0')} 已应用`);
  }
}

const insertComment = db.prepare(
  `INSERT OR IGNORE INTO comments (id, round_id, side, body, created_at, user_id)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
const selectById = db.prepare(
  `SELECT id, round_id AS roundId, side, body, created_at AS createdAt, user_id AS userId
   FROM comments WHERE id = ? AND round_id = ?`,
);

const insertVote = db.prepare(
  `INSERT OR IGNORE INTO votes (id, prompt_id, winner_rid, winner_mid, loser_rid, loser_mid, pair_key, mode, user_id, created_at, outcome)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const selectVoteById = db.prepare(
  `SELECT id, prompt_id AS promptId, winner_rid AS winnerRid, winner_mid AS winnerMid,
          loser_rid AS loserRid, loser_mid AS loserMid, pair_key AS pairKey,
          mode, created_at AS ts, user_id AS userId, outcome
   FROM votes WHERE id = ?`,
);
const selectVoteIdByPair = db.prepare(
  'SELECT id FROM votes WHERE user_id = ? AND pair_key = ?',
);
// 反应（迁移 005）：一人一题一模型一槽，换态度覆盖 kind
const upsertReaction = db.prepare(
  `INSERT INTO reactions (id, prompt_id, mid, kind, user_id, created_at)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(user_id, prompt_id, mid)
   DO UPDATE SET kind = excluded.kind, created_at = excluded.created_at`,
);
const listReactionCounts = db.prepare(
  `SELECT mid, kind, COUNT(*) AS n FROM reactions WHERE prompt_id = ? GROUP BY mid, kind`,
);
const listMyReactions = db.prepare(
  'SELECT mid, kind FROM reactions WHERE prompt_id = ? AND user_id = ?',
);
// 防伪造：只允许对这道题已发布作品的模型表态
const reactionModelExists = db.prepare(
  'SELECT 1 FROM works WHERE prompt_id = ? AND model_id = ? AND published = 1',
);
// 流水联表补三样展示快照（决策 045 ⑤「历史票保留在榜单」）：
// 题目当前 kind（prompts 表含下架题——下架题的历史票仍按原赛道归类）、
// 双方作品当前显示名（作品全下架后，模型仍能以名字上榜而不是裸 id）。
// 票本身永不过滤：/api/votes 始终全量返回，榜单口径由客户端聚合。
const listVotes = db.prepare(
  `SELECT v.id, v.prompt_id AS promptId, v.winner_rid AS winnerRid, v.winner_mid AS winnerMid,
          v.loser_rid AS loserRid, v.loser_mid AS loserMid, v.mode, v.created_at AS ts, v.outcome,
          wp.model_name AS winnerName, lp.model_name AS loserName, p.kind AS promptKind
   FROM votes v
   LEFT JOIN works wp ON wp.id = v.winner_rid
   LEFT JOIN works lp ON lp.id = v.loser_rid
   LEFT JOIN prompts p ON p.id = v.prompt_id
   ORDER BY v.created_at ASC, v.id ASC`,
);
// ---------- 校验（与 lib/comments.ts 规则保持一致） ----------

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// 题号白名单收口到 prompts 表（决策 045）：投票/评论/收件箱登记都以表为准，
// 加题不再改代码。评论与投票要求题目已发布；收件箱登记只要题目存在
//（先加题、再往里登记作品、检查后发布是正常流程）；评论读取只要题目存在
//（下架题的历史评论不丢）。
const promptExists = (promptId) =>
  !!db.prepare('SELECT 1 FROM prompts WHERE id = ?').get(promptId);
const promptPublished = (promptId) =>
  !!db
    .prepare('SELECT 1 FROM prompts WHERE id = ? AND published = 1')
    .get(promptId);

// ---------- 作品表查询（迁移 001 建立，种子来自 lib/works-roster.json） ----------

const selectPublishedWorks = db.prepare(
  `SELECT id, prompt_id AS promptId, model_id AS modelId, model_name AS modelName,
          title, is_demo AS isDemo, content
   FROM works WHERE published = 1 ORDER BY created_at ASC, id ASC`,
);
// 票面核对（B2）用：rid → 该作品的题号/模型/发布与演示状态
const selectWorkForVote = db.prepare(
  `SELECT prompt_id AS promptId, model_id AS modelId, is_demo AS isDemo, published
   FROM works WHERE id = ?`,
);

function validateComment(value) {
  if (!value || typeof value !== 'object') return null;
  const { id, roundId, side, body } = value;
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return null;
  if (typeof roundId !== 'string' || !promptPublished(roundId))
    return null;
  if (side !== 'a' && side !== 'b') return null;
  if (typeof body !== 'string' || !body.trim() || body.trim().length > 280)
    return null;
  return { id, roundId, side, body: body.trim() };
}

// ---------- 投票校验（与 lib/votes.ts 规则保持一致） ----------

const VOTE_MODES = ['blind', 'party', 'formal'];
const pairKeyOf = (ridA, ridB) =>
  [...[ridA, ridB].sort((a, b) => a.localeCompare(b))].join('+');

function validateVote(value) {
  if (!value || typeof value !== 'object') return null;
  const { id, promptId, winnerRid, winnerMid, loserRid, loserMid, mode } = value;
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return null;
  if (typeof promptId !== 'string' || !promptPublished(promptId))
    return null;
  // rid/mid 与评论 body 一样 trim 后再入库，避免两端空格口径不一
  const trimmed = {};
  for (const [field, value] of Object.entries({
    winnerRid,
    winnerMid,
    loserRid,
    loserMid,
  })) {
    if (typeof value !== 'string' || !value.trim() || value.length > 64)
      return null;
    trimmed[field] = value.trim();
  }
  const vote = { id, promptId, ...trimmed };
  if (vote.winnerRid === vote.loserRid || vote.winnerMid === vote.loserMid)
    return null;
  if (!VOTE_MODES.includes(mode)) return null;
  // 决策 048：outcome 缺省 win（旧客户端与存量票），draw = 无法抉择的平局票
  const outcome = value.outcome ?? 'win';
  if (outcome !== 'win' && outcome !== 'draw') return null;
  // 票面与作品表核对（B2）：rid 必须真实存在、已发布、非演示、属于本题，并与 mid 一致
  const winner = selectWorkForVote.get(vote.winnerRid);
  const loser = selectWorkForVote.get(vote.loserRid);
  if (!winner || !winner.published || winner.isDemo) return null;
  if (!loser || !loser.published || loser.isDemo) return null;
  if (winner.promptId !== vote.promptId || loser.promptId !== vote.promptId)
    return null;
  if (winner.modelId !== vote.winnerMid || loser.modelId !== vote.loserMid)
    return null;
  return { ...vote, mode, outcome };
}

// 回读比对：同 UUID 必须是同一笔票——用户、题号、双方 rid/mid、模式全一致。
// INSERT OR IGNORE 被旧票忽略后回读到的是旧记录，不比对就会跨对局回显旧票（B1）。
const isSameVote = (saved, vote, userId) =>
  !!saved &&
  saved.userId === userId &&
  saved.promptId === vote.promptId &&
  saved.winnerRid === vote.winnerRid &&
  saved.winnerMid === vote.winnerMid &&
  saved.loserRid === vote.loserRid &&
  saved.loserMid === vote.loserMid &&
  saved.mode === vote.mode &&
  saved.outcome === vote.outcome;

// ---------- 演示级限流（内存滑动窗口，按真实客户端 IP） ----------
// 按路由分组各自计桶（2026-09-15 拆分）：原先全站 POST 共享一个 10 次/分钟
// 桶，模一把一局要 8 次判定 + 1 次上报正好占满，紧接着开练习局会中途 429。
// social=评论/投票/反应（维持原额度）；guess=猜模型判定与上报（高频路径，
// 额度×3）；track=匿名埋点（正常导航连开几页就会触发，额度×6 最宽）。
// RATE_LIMIT_PER_MIN 仍是总开关：测试环境调大后各组同步放大。
const RATE_GROUPS = {
  social: { max: postsPerMinute, error: '发言太快了，歇一分钟再试。' },
  guess: { max: postsPerMinute * 3, error: '请求太频繁，稍等几秒再试。' },
  track: { max: postsPerMinute * 6, error: '请求太频繁，稍后再试。' },
};
const windows = new Map();
const limiterFor = (group) => {
  const { max, error } = RATE_GROUPS[group];
  return (req, res, next) => {
    const key = `${group}:${req.ip}`;
    const now = Date.now();
    const windowStart = now - 60_000;
    const hits = (windows.get(key) || []).filter((t) => t > windowStart);
    if (hits.length >= max) return res.status(429).json({ error });
    hits.push(now);
    windows.set(key, hits);
    req.clientIp = req.ip;
    next();
  };
};
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [ip, hits] of windows) {
    const alive = hits.filter((t) => t > cutoff);
    if (alive.length) windows.set(ip, alive);
    else windows.delete(ip);
  }
}, 60_000).unref();

// ---------- Express 应用 ----------

const app = express();
app.disable('x-powered-by');
// Explicit proxy allowlist only, e.g. loopback when nginx runs on the same VPS.
if (process.env.TRUST_PROXY)
  app.set('trust proxy', process.env.TRUST_PROXY.split(','));
// 管理接口的请求体单独放宽：题目提示词允许 8000 字（UTF-8 下约 24KB），
// 全局 4kb 会把长题的保存拦成 413。body-parser 对已解析的请求体会跳过，
// 两段中间件叠加不冲突；公开接口维持原限制不变。
app.use('/api/admin', express.json({ limit: '64kb' }));
app.use(
  express.json({
    limit: '4kb', // 原接口限制原始请求体 4000 字节
  }),
);

const noStore = { 'Cache-Control': 'no-store' };

// 同源校验：在反代（Caddy/nginx）之后用 X-Forwarded-Proto/Host 还原真实来源，
// 与原 Worker 版“请求来源必须等于站点来源”的语义一致。
function sameOrigin(req) {
  const expected =
    process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
  return req.headers.origin === expected;
}
installAuth(app, db, sameOrigin);
const listByRound = db.prepare(
  `SELECT comments.id, round_id AS roundId, side, body, comments.created_at AS createdAt, users.username
   FROM comments LEFT JOIN users ON users.id = comments.user_id
   WHERE round_id = ? ORDER BY comments.created_at DESC, comments.id DESC LIMIT 100`,
);

app.get('/api/comments', (req, res) => {
  const roundId = String(req.query.round || '');
  if (!promptExists(roundId))
    return res.status(400).json({ error: '题目不存在' });
  try {
    const rows = listByRound.all(roundId);
    res.set(noStore).json({ comments: rows });
  } catch {
    res
      .status(503)
      .set(noStore)
      .json({ error: '留言暂时无法加载，请稍后重试' });
  }
});

app.post('/api/comments', limiterFor('social'), (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  if (!req.user) return res.status(401).json({ error: '请先登录再留言。' });
  const comment = validateComment(req.body);
  if (!comment) return res.status(400).json({ error: '请输入 1–280 字的留言' });
  try {
    insertComment.run(
      comment.id,
      comment.roundId,
      comment.side,
      comment.body,
      Date.now(),
      req.user.id,
    );
    const saved = selectById.get(comment.id, comment.roundId);
    if (
      !saved ||
      saved.body !== comment.body ||
      saved.side !== comment.side ||
      saved.userId !== req.user.id
    )
      return res.status(409).json({ error: '留言编号冲突，请重新提交' });
    res
      .set(noStore)
      .status(201)
      .json({ comment: { ...saved, username: req.user.username } });
  } catch {
    res
      .status(503)
      .set(noStore)
      .json({ error: '暂时没发出去，你的文字还在。再试一次？' });
  }
});

// ---------- 作品：读取公开（只吐已发布），写入留给后台（未建） ----------

app.get('/api/works', (_req, res) => {
  try {
    // 全量已发布作品，按登记时间升序；content 是 JSON 字符串，原样返回由前端解析
    res.set(noStore).json({ works: selectPublishedWorks.all() });
  } catch {
    res
      .status(503)
      .set(noStore)
      .json({ error: '作品数据暂时无法加载，请稍后重试' });
  }
});

// ---------- 题目：读取公开（只吐已发布，决策 045） ----------

const selectPublishedPrompts = db.prepare(
  `SELECT id, kind, category, code, name, prompt, commentary, detail
   FROM prompts WHERE published = 1 ORDER BY id ASC`,
);

app.get('/api/prompts', (_req, res) => {
  try {
    res.set(noStore).json({ prompts: selectPublishedPrompts.all() });
  } catch {
    res
      .status(503)
      .set(noStore)
      .json({ error: '题目数据暂时无法加载，请稍后重试' });
  }
});

// ---------- 声望分：匹配机制的数据源（决策 046，公开读取、内部用途） ----------
//
// 由 votes 表全量重放简易 Elo（基准 1200 / K=32 / 按时间序，与前端榜单同公式
// 但独立维护）。这不是排行榜——前台榜单照旧由页面重放 /api/votes 得出；
// 这里只是给 lib/matchmaking.ts 的配对参考分（「暗分」）。无票时返回空对象，
// 调用方把未知模型按基础分处理。规模大后可换落表缓存，当前全量重放演示规模够用。

app.get('/api/ratings', (_req, res) => {
  try {
    const rows = db
      .prepare(
        'SELECT winner_mid, loser_mid, created_at AS ts, outcome FROM votes ORDER BY created_at ASC, id ASC',
      )
      .all();
    const K = 32;
    const BASE = 1200;
    const ratings = {};
    for (const vote of rows) {
      const a = ratings[vote.winner_mid] ?? BASE;
      const b = ratings[vote.loser_mid] ?? BASE;
      const expectedA = 1 / (1 + 10 ** ((b - a) / 400));
      // 平局（决策 048）：双方实际得分各 0.5——强于预期的一方涨得少甚至微跌
      const actualA = vote.outcome === 'draw' ? 0.5 : 1;
      ratings[vote.winner_mid] = a + K * (actualA - expectedA);
      ratings[vote.loser_mid] = b + K * (1 - actualA - (1 - expectedA));
    }
    res.set(noStore).json({ ratings });
  } catch {
    res
      .status(503)
      .set(noStore)
      .json({ error: '声望分暂时无法加载' });
  }
});

// ---------- 投票：写入要求登录（决策 020），读取公开、不带用户信息 ----------

app.get('/api/votes', (_req, res) => {
  try {
    // 全量流水，按时间升序；榜单在客户端重放 Elo（演示规模够用，
    // 数据量上来后再换聚合接口，勿在此静默截断——截断会让 Elo 失真）
    res.set(noStore).json({ votes: listVotes.all() });
  } catch {
    res
      .status(503)
      .set(noStore)
      .json({ error: '投票数据暂时无法加载，请稍后重试' });
  }
});

app.post('/api/votes', limiterFor('social'), (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  if (!req.user) return res.status(401).json({ error: '请先登录再投票。' });
  const vote = validateVote(req.body);
  if (!vote) return res.status(400).json({ error: '投票内容无效' });
  // 正式测评资格制（决策 026）：前端菜单只对管理员解锁，这里服务端再拦一道——
  // 任何登录用户直接输 #formal/xxx 的 hash 也进不了正式榜（2026-09-15 收口）
  if (vote.mode === 'formal' && req.user.role !== 'admin')
    return res.status(403).json({ error: '正式测评为资格制，暂未开放。' });
  const pairKey = pairKeyOf(vote.winnerRid, vote.loserRid);
  try {
    const existing = selectVoteIdByPair.get(req.user.id, pairKey);
    if (existing) {
      // 同 UUID 重试视为成功（幂等，但票面必须完全一致）；换一个 UUID 重投同一对局才叫重复
      if (existing.id === vote.id) {
        const saved = selectVoteById.get(vote.id);
        if (!isSameVote(saved, vote, req.user.id))
          return res
            .status(409)
            .json({ code: 'id', error: '投票编号冲突，请重新提交' });
        return res.set(noStore).json({ vote: saved });
      }
      // code 字段给前端区分 409 语义：pair = 对局已投过；id = 编号冲突
      return res
        .status(409)
        .json({ code: 'pair', error: '这一对作品你已经投过票了。' });
    }
    insertVote.run(
      vote.id,
      vote.promptId,
      vote.winnerRid,
      vote.winnerMid,
      vote.loserRid,
      vote.loserMid,
      pairKey,
      vote.mode,
      req.user.id,
      Date.now(),
      vote.outcome,
    );
    const saved = selectVoteById.get(vote.id);
    if (!isSameVote(saved, vote, req.user.id))
      return res.status(409).json({
        code: 'id',
        error: '投票编号冲突，请重新提交',
      });
    res.set(noStore).status(201).json({ vote: saved });
  } catch {
    res
      .status(503)
      .set(noStore)
      .json({ error: '暂时没有记上这一票，稍后再试？' });
  }
});

// ---------- 反应：点赞 / 点踩 / 大笑（迁移 005；写入要求登录，读取公开） ----------

const REACTION_KINDS = new Set(['up', 'down', 'laugh']);
// 反应跟着题号走（跨对局累计同一模型在这道题下的反应），换态度覆盖不叠票
app.post('/api/reactions', limiterFor('social'), (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  if (!req.user) return res.status(401).json({ error: '请先登录再表态。' });
  const { id, promptId, mid, kind } = req.body ?? {};
  if (!id || !UUID_PATTERN.test(id)) return res.status(400).json({ error: '反应内容无效' });
  if (!promptId || !promptPublished(promptId))
    return res.status(400).json({ error: '反应内容无效' });
  if (typeof mid !== 'string' || !mid.trim() || !REACTION_KINDS.has(kind))
    return res.status(400).json({ error: '反应内容无效' });
  if (!reactionModelExists.get(promptId, mid.trim()))
    return res.status(400).json({ error: '反应内容无效' });
  try {
    upsertReaction.run(id, promptId, mid.trim(), kind, req.user.id, Date.now());
    const mine = new Map(
      listMyReactions.all(promptId, req.user.id).map((row) => [row.mid, row.kind]),
    );
    const counts = {};
    for (const row of listReactionCounts.all(promptId)) {
      counts[row.mid] ??= { up: 0, down: 0, laugh: 0 };
      counts[row.mid][row.kind] = row.n;
    }
    res.set(noStore).status(201).json({ mine: Object.fromEntries(mine), counts });
  } catch {
    res
      .status(503)
      .set(noStore)
      .json({ error: '暂时没有记上这一下，稍后再试？' });
  }
});

app.get('/api/reactions', (req, res) => {
  const promptId = String(req.query.prompt ?? '');
  if (!promptId || !promptExists(promptId))
    return res.status(400).json({ error: '题目不存在' });
  try {
    const counts = {};
    for (const row of listReactionCounts.all(promptId)) {
      counts[row.mid] ??= { up: 0, down: 0, laugh: 0 };
      counts[row.mid][row.kind] = row.n;
    }
    // 本人选择只有登录时返回；未登录只看得到聚合计数
    const mine = req.user
      ? Object.fromEntries(
          listMyReactions
            .all(promptId, req.user.id)
            .map((row) => [row.mid, row.kind]),
        )
      : {};
    res.set(noStore).json({ counts, mine });
  } catch {
    res
      .status(503)
      .set(noStore)
      .json({ error: '反应数据暂时无法加载，请稍后重试' });
  }
});

// ---------- 管理后台 API（管理员专用，决策 040） ----------

const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  if (req.user.role !== 'admin')
    return res.status(404).json({ error: '接口不存在' });
  next();
};

const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);

// 仪表盘统计：今日/昨日浏览与访客、近 N 日趋势、累计票数评论数注册数、服务器体检
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const today = dayKey(Date.now());
    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
    const rows = db
      .prepare(
        `SELECT day, COUNT(*) AS views, COUNT(DISTINCT ip_hash) AS visitors
         FROM page_views WHERE day >= date('now', ?) GROUP BY day ORDER BY day`,
      )
      .all(`-${days - 1} day`);
    const counts = {
      votes: db.prepare('SELECT COUNT(*) AS n FROM votes').get().n,
      comments: db.prepare('SELECT COUNT(*) AS n FROM comments').get().n,
      users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
      works: db.prepare('SELECT COUNT(*) AS n FROM works').get().n,
      worksPublished: db
        .prepare('SELECT COUNT(*) AS n FROM works WHERE published = 1')
        .get().n,
    };
    const todayRow = rows.find((row) => row.day === today);
    const yesterday = dayKey(Date.now() - 86_400_000);
    const yesterdayRow = rows.find((row) => row.day === yesterday);
    // 服务器体检：os 自带，无需额外依赖（宝塔有完整监控，这里只是日常速览）
    const health = {
      uptime: Math.round(process.uptime()),
      memory: process.memoryUsage.rss(),
      heapTotal: process.memoryUsage.heapTotal,
      loadavg: os.loadavg?.() ?? null,
      platform: `${os.type()} ${os.release()}`,
      node: process.version,
    };
    res.set(noStore).json({
      today: {
        day: today,
        views: todayRow?.views ?? 0,
        visitors: todayRow?.visitors ?? 0,
      },
      yesterday: {
        day: yesterday,
        views: yesterdayRow?.views ?? 0,
        visitors: yesterdayRow?.visitors ?? 0,
      },
      trend: rows,
      totals: counts,
      health,
    });
  } catch {
    res.status(503).set(noStore).json({ error: '统计数据暂时无法加载' });
  }
});

// 数据流水：投票 / 评论 / 注册，各自支持关键字过滤与分页（倒序）
app.get('/api/admin/log', requireAdmin, (req, res) => {
  const kind = String(req.query.kind || 'votes');
  const q = String(req.query.q || '').trim().slice(0, 64);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  try {
    let rows;
    if (kind === 'votes') {
      rows = db
        .prepare(
          `SELECT v.id, v.prompt_id AS promptId, v.winner_mid AS winnerMid, v.loser_mid AS loserMid,
                  v.mode, v.created_at AS ts, v.outcome, u.username
           FROM votes v LEFT JOIN users u ON u.id = v.user_id
           ${q ? 'WHERE u.username LIKE ? OR v.prompt_id LIKE ? OR v.winner_mid LIKE ? OR v.loser_mid LIKE ?' : ''}
           ORDER BY v.created_at DESC LIMIT ?`,
        )
        .all(...(q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : []), limit);
    } else if (kind === 'comments') {
      rows = db
        .prepare(
          `SELECT c.id, c.round_id AS roundId, c.side, c.body, c.created_at AS ts, u.username
           FROM comments c LEFT JOIN users u ON u.id = c.user_id
           ${q ? 'WHERE u.username LIKE ? OR c.round_id LIKE ? OR c.body LIKE ?' : ''}
           ORDER BY c.created_at DESC LIMIT ?`,
        )
        .all(...(q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []), limit);
    } else if (kind === 'users') {
      rows = db
        .prepare(
          `SELECT id, username, role, created_at AS ts FROM users
           ${q ? 'WHERE username LIKE ?' : ''}
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(...(q ? [`%${q}%`] : []), limit);
    } else {
      return res.status(400).json({ error: '未知的流水类型' });
    }
    res.set(noStore).json({ rows });
  } catch {
    res.status(503).set(noStore).json({ error: '流水暂时无法加载' });
  }
});

// ---------- 管理后台：作品管理（决策 044） ----------
//
// 约束：不提供删除——投票流水引用作品（winner_rid/loser_rid），删除会打断历史，
// 只允许「下架」（关发布开关）。model_id 不可改——榜单统计按它归组（票面存 mid），
// 改模型名只动显示名。content JSON 损坏的作品照常列出，仅预览地址留空。

const selectWorkById = db.prepare(
  `SELECT id, prompt_id AS promptId, model_id AS modelId, model_name AS modelName,
          title, is_demo AS isDemo, published, created_at AS createdAt, content
   FROM works WHERE id = ?`,
);

// 后台作品视图：从 content JSON 里摘出预览地址（html/image 有 src；text/web 没有）
const adminWorkView = (row) => {
  if (!row) return null;
  let src = null;
  try {
    const content = JSON.parse(row.content);
    if (content && typeof content.src === 'string') src = content.src;
  } catch {
    // content 损坏时预览留空，不影响列表与管理
  }
  return {
    id: row.id,
    promptId: row.promptId,
    modelId: row.modelId,
    modelName: row.modelName,
    title: row.title,
    isDemo: !!row.isDemo,
    published: !!row.published,
    createdAt: row.createdAt,
    src,
  };
};

// 作品全量清单（含未发布），按题号/状态/关键字筛选，倒序分页
app.get('/api/admin/works', requireAdmin, (req, res) => {
  const prompt = req.query.prompt ? String(req.query.prompt) : '';
  if (prompt && !promptExists(prompt))
    return res.status(400).json({ error: '未知题号' });
  const status = String(req.query.status || 'all');
  if (!['all', 'published', 'draft'].includes(status))
    return res.status(400).json({ error: '未知状态筛选' });
  const q = String(req.query.q || '').trim().slice(0, 64);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const where = [];
  const params = [];
  if (prompt) {
    where.push('prompt_id = ?');
    params.push(prompt);
  }
  if (status === 'published') where.push('published = 1');
  if (status === 'draft') where.push('published = 0');
  if (q) {
    where.push('(title LIKE ? OR model_name LIKE ? OR model_id LIKE ? OR id LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  try {
    const total = db
      .prepare(`SELECT COUNT(*) AS n FROM works ${whereSql}`)
      .get(...params).n;
    const rows = db
      .prepare(
        `SELECT id, prompt_id AS promptId, model_id AS modelId, model_name AS modelName,
                title, is_demo AS isDemo, published, created_at AS createdAt, content
         FROM works ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset);
    res.set(noStore).json({ total, works: rows.map(adminWorkView) });
  } catch {
    res.status(503).set(noStore).json({ error: '作品清单暂时无法加载' });
  }
});

// 编辑作品：标题 / 模型名（显示名）/ 发布开关。发布切换即时生效——
// /api/works 只吐已发布作品，前台拉取时自然多出或少了这一件。
app.patch('/api/admin/works/:id', requireAdmin, (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  const row = db.prepare('SELECT id FROM works WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '作品不存在' });
  const body = req.body || {};
  const updates = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120)
      return res.status(400).json({ error: '标题须为 1–120 字' });
    updates.title = body.title.trim();
  }
  if (body.modelName !== undefined) {
    const modelName = String(body.modelName).trim();
    if (!modelName || modelName.length > 64)
      return res.status(400).json({ error: '模型名须为 1–64 字' });
    updates.model_name = modelName;
  }
  if (body.published !== undefined) {
    if (typeof body.published !== 'boolean')
      return res.status(400).json({ error: 'published 须为布尔值' });
    updates.published = body.published ? 1 : 0;
  }
  if (Object.keys(updates).length === 0)
    return res.status(400).json({ error: '没有要修改的内容' });
  try {
    const setSql = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(', ');
    db.prepare(`UPDATE works SET ${setSql} WHERE id = ?`).run(
      ...Object.values(updates),
      row.id,
    );
    res.set(noStore).json({ work: adminWorkView(selectWorkById.get(row.id)) });
  } catch {
    res.status(503).set(noStore).json({ error: '暂时没保存上，稍后再试' });
  }
});

// ---------- 管理后台：收件箱（决策 044） ----------
//
// 宝塔/本机把待登记文件放进 inboxDir，这里列出、登记、清理。
// 登记 = 文件搬进 worksDir/<题号>/ + works 表入库（默认草稿）。

// 收件箱条目名只接受单段路径——防路径穿越（../、分隔符、盘符都进不来）
const safeEntryName = (value) => {
  if (typeof value !== 'string' || !value || value.length > 255) return null;
  if (/[\\/]/.test(value) || value.includes('\0') || value === '.' || value === '..')
    return null;
  return value;
};

app.get('/api/admin/inbox', requireAdmin, (_req, res) => {
  try {
    const entries = fs
      .readdirSync(inboxDir, { withFileTypes: true })
      .flatMap((entry) => {
        const full = path.join(inboxDir, entry.name);
        if (entry.isDirectory()) {
          const hasIndex = fs.existsSync(path.join(full, 'index.html'));
          return [
            {
              name: entry.name,
              type: 'dir',
              size: null,
              registerable: hasIndex,
              reason: hasIndex ? null : '文件夹里没有 index.html，无法作为作品登记',
              suggest: { title: entry.name, model: '' },
            },
          ];
        }
        if (!entry.isFile()) return []; // 符号链接等非常规条目不进清单
        const isHtml = entry.name.toLowerCase().endsWith('.html');
        const parsed = isHtml
          ? parseWorkFilename(entry.name.replace(/\.html$/i, ''))
          : null;
        return [
          {
            name: entry.name,
            type: 'file',
            size: fs.statSync(full).size,
            registerable: isHtml,
            reason: isHtml
              ? null
              : '只登记 .html 文件；多文件作品请整个文件夹放进收件箱',
            suggest: parsed
              ? { title: parsed.title, model: parsed.model }
              : null,
          },
        ];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    res.set(noStore).json({ dir: inboxDir, entries });
  } catch {
    res.status(503).set(noStore).json({ error: '收件箱暂时无法读取' });
  }
});

// 登记一件收件箱作品：单文件或含 index.html 的文件夹（多文件作品）。
// 同模型重复登记自动让位（-2、-3……），库与磁盘遗留文件都避开。
app.post('/api/admin/inbox/register', requireAdmin, (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  const name = safeEntryName(req.body?.name);
  if (!name) return res.status(400).json({ error: '文件名不合法' });
  const promptId = String(req.body?.promptId || '');
  if (!promptExists(promptId))
    return res.status(400).json({ error: '未知题号' });
  const modelName = String(req.body?.modelName || '').trim();
  if (!modelName || modelName.length > 64)
    return res.status(400).json({ error: '请填写 1–64 字的模型名' });
  const publish = req.body?.publish === true;

  const source = path.join(inboxDir, name);
  let stats;
  try {
    stats = fs.statSync(source);
  } catch {
    return res.status(404).json({ error: '收件箱里已经没有这个文件了，刷新看看' });
  }
  const isDir = stats.isDirectory();
  if (!isDir && !(stats.isFile() && name.toLowerCase().endsWith('.html')))
    return res
      .status(400)
      .json({ error: '只能登记 .html 文件或包含 index.html 的文件夹' });
  if (isDir && !fs.existsSync(path.join(source, 'index.html')))
    return res.status(400).json({ error: '文件夹里没有 index.html，无法作为作品登记' });

  // 标题：调用方给了用调用方的，否则按文件名解析（文件夹用目录名）
  let title = String(req.body?.title || '').trim().slice(0, 120);
  if (!title)
    title = isDir
      ? name
      : parseWorkFilename(name.replace(/\.html$/i, '')).title ||
        name.replace(/\.html$/i, '');

  const modelId = modelIdOf(modelName);
  const workId = nextFreeWorkId({ db, worksDir, promptId, modelId });
  const dest = isDir
    ? path.join(worksDir, promptId, workId)
    : path.join(worksDir, promptId, `${workId}.html`);
  try {
    transferPath(source, dest, { move: true });
  } catch {
    return res.status(503).set(noStore).json({ error: '文件搬移失败，稍后再试' });
  }
  try {
    insertWork(db, {
      id: workId,
      promptId,
      modelId,
      modelName,
      title,
      content: {
        kind: 'html',
        src: isDir
          ? `/works/${promptId}/${workId}/index.html`
          : `/works/${promptId}/${workId}.html`,
      },
      published: publish,
    });
  } catch (error) {
    // 落库失败把文件退回收件箱——收件箱不吞件（best effort）
    console.error('[arenaofbias] inbox register failed:', error?.code || 'internal');
    try {
      transferPath(dest, source, { move: true });
    } catch {}
    return res
      .status(503)
      .set(noStore)
      .json({ error: '登记没写进数据库，文件已退回收件箱' });
  }
  res.set(noStore).status(201).json({ work: adminWorkView(selectWorkById.get(workId)) });
});

// 清理收件箱：不认识或不要的文件直接删除（不进作品库）
app.delete('/api/admin/inbox', requireAdmin, (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  const name = safeEntryName(String(req.query.name || ''));
  if (!name) return res.status(400).json({ error: '文件名不合法' });
  const target = path.join(inboxDir, name);
  let stats;
  try {
    stats = fs.statSync(target);
  } catch {
    return res.status(404).json({ error: '收件箱里没有这个文件' });
  }
  try {
    fs.rmSync(target, { recursive: stats.isDirectory() });
    res.set(noStore).status(204).end();
  } catch {
    res.status(503).set(noStore).json({ error: '删除失败，稍后再试' });
  }
});

// ---------- 管理后台：题目管理（决策 045） ----------
//
// 约束：不提供删除——作品与投票流水引用题目，只允许下架（前台完全隐藏，
// 历史票保留在榜单）。已发布题目的文案允许修改（用户拍板），不影响已有投票。

const PROMPT_KINDS = ['image', 'text', 'web'];

const adminPromptView = (id) => {
  const row = db
    .prepare(
      `SELECT p.id, p.kind, p.category, p.code, p.name, p.prompt, p.commentary, p.detail,
              p.published, p.created_at AS createdAt,
              (SELECT COUNT(*) FROM works w WHERE w.prompt_id = p.id) AS worksCount,
              (SELECT COUNT(*) FROM votes v WHERE v.prompt_id = p.id) AS voteCount
       FROM prompts p WHERE p.id = ?`,
    )
    .get(id);
  return row ? { ...row, published: !!row.published } : null;
};

// 校验并归一化题目字段：partial=false 全量必填（POST），true 只校验出现的字段（PATCH）
function normalizePromptFields(body, { partial }) {
  const out = {};
  const need = (key) => !partial || body[key] !== undefined;
  if (need('kind')) {
    if (!PROMPT_KINDS.includes(body.kind))
      return { error: '类型须为 image / text / web' };
    out.kind = body.kind;
  }
  if (need('name')) {
    const name = String(body.name ?? '').trim();
    if (!name || name.length > 60) return { error: '名称须为 1–60 字' };
    out.name = name;
  }
  if (need('prompt')) {
    const text = String(body.prompt ?? '').trim();
    if (!text || text.length > 8000) return { error: '提示词须为 1–8000 字' };
    out.prompt = text;
  }
  if (need('category')) {
    const value = String(body.category ?? '').trim();
    if (value.length > 30) return { error: '分类最多 30 字' };
    out.category = value;
  }
  if (need('code')) {
    const value = String(body.code ?? '').trim();
    if (value.length > 12) return { error: '代号最多 12 字' };
    out.code = value;
  }
  if (need('commentary')) {
    const value = String(body.commentary ?? '').trim();
    if (value.length > 120) return { error: '一句话点评最多 120 字' };
    out.commentary = value;
  }
  if (need('detail')) {
    const value = String(body.detail ?? '').trim();
    if (value.length > 60) return { error: '题库页副标最多 60 字' };
    out.detail = value;
  }
  if (body.published !== undefined) {
    if (typeof body.published !== 'boolean')
      return { error: 'published 须为布尔值' };
    out.published = body.published ? 1 : 0;
  }
  return { fields: out };
}

// 题目全量清单（含下架）+ 每题作品数与票数
app.get('/api/admin/prompts', requireAdmin, (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT p.id, p.kind, p.category, p.code, p.name, p.prompt, p.commentary, p.detail,
                p.published, p.created_at AS createdAt,
                (SELECT COUNT(*) FROM works w WHERE w.prompt_id = p.id) AS worksCount,
                (SELECT COUNT(*) FROM votes v WHERE v.prompt_id = p.id) AS voteCount
         FROM prompts p ORDER BY p.id ASC`,
      )
      .all()
      .map((row) => ({ ...row, published: !!row.published }));
    res.set(noStore).json({ prompts: rows });
  } catch {
    res.status(503).set(noStore).json({ error: '题目清单暂时无法加载' });
  }
});

// 新增题目：编号自动往下排（内置种子到 007，故从 008 起）；默认草稿
app.post('/api/admin/prompts', requireAdmin, (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  const result = normalizePromptFields(req.body || {}, { partial: false });
  if (result.error) return res.status(400).json({ error: result.error });
  const nextId = (() => {
    const row = db
      .prepare(
        "SELECT id FROM prompts WHERE id GLOB '[0-9][0-9][0-9]' ORDER BY id DESC LIMIT 1",
      )
      .get();
    return String((row ? Number(row.id) : 7) + 1).padStart(3, '0');
  })();
  try {
    const fields = result.fields;
    db.prepare(
      `INSERT INTO prompts (id, kind, category, code, name, prompt, commentary, detail, published, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      nextId,
      fields.kind,
      fields.category,
      fields.code,
      fields.name,
      fields.prompt,
      fields.commentary,
      fields.detail,
      fields.published ?? 0,
      Date.now(),
    );
    res.set(noStore).status(201).json({ prompt: adminPromptView(nextId) });
  } catch (error) {
    console.error('[arenaofbias] prompt create failed:', error?.code || 'internal');
    res.status(503).set(noStore).json({ error: '题目没能保存，稍后再试' });
  }
});

// 编辑题目：文案字段与上下架开关。文案自由改（用户拍板），不影响已有投票。
app.patch('/api/admin/prompts/:id', requireAdmin, (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  if (!promptExists(req.params.id))
    return res.status(404).json({ error: '题目不存在' });
  const result = normalizePromptFields(req.body || {}, { partial: true });
  if (result.error) return res.status(400).json({ error: result.error });
  const fields = result.fields;
  if (Object.keys(fields).length === 0)
    return res.status(400).json({ error: '没有要修改的内容' });
  try {
    const setSql = Object.keys(fields)
      .map((key) => `${key} = ?`)
      .join(', ');
    db.prepare(`UPDATE prompts SET ${setSql} WHERE id = ?`).run(
      ...Object.values(fields),
      req.params.id,
    );
    res.set(noStore).json({ prompt: adminPromptView(req.params.id) });
  } catch {
    res.status(503).set(noStore).json({ error: '暂时没保存上，稍后再试' });
  }
});

// 页面浏览记录（后台访客统计，决策 040）：由前端在文档加载时 POST /api/track
// 上报（服务端中间件方案在 dev 下失效——vite 自己发页面，Express 看不到请求；
// 上报方案 dev 与生产行为一致）。前端每加载一次文档报一次，hash 路由切换不计。
// ip_hash = sha256(IP + 当日盐)，盐每天轮换——既不能反推 IP，也不能跨日追踪。
const insertPageView = db.prepare(
  'INSERT INTO page_views (day, path, ip_hash, created_at) VALUES (?, ?, ?, ?)',
);
let daySalt = '';
let daySaltDay = '';
const ipHashOfDay = (ip, day) => {
  if (daySaltDay !== day) {
    daySalt = randomBytes(8).toString('hex');
    daySaltDay = day;
  }
  return createHash('sha256').update(`${daySalt}:${ip}`).digest('hex');
};
// ---------- 模一把（决策 057）：Wordle 式猜 AI 模型 ----------
//
// 判定逻辑与数据集在 lib/guess-logic.ts（前端类型同源）。服务端持答案、
// 只吐判定结果，防止「查看源码」直接看答案。这里用 jiti 在启动时加载
// TS 模块（能解析其中的 json 导入），与验证脚本 scripts/validate-guess.mjs
// 同一加载方式——判定口径永远同一份代码。
//
// GET /api/guess/today  → 数据集（无答案字段）+ 今天的日子编号。匿名可读。
// POST /api/guess/check → body { guessId }，返回该猜测的逐属性反馈。
//                         8 次的机会计数、战绩都在前端本地，接口无状态。
import { createJiti } from 'jiti';

const guessModule = await createJiti(import.meta.url)(
  '../lib/guess-logic.ts',
);
const {
  GUESS_MODELS: guessModels,
  ATTRIBUTE_KEYS: guessAttributeKeys,
  answerForDate: guessAnswerForDate,
  dayNumber: guessDayNumber,
  guessDayKey: guessDayKeyOf,
  modelById: guessModelById,
  resolveGuess: resolveGuessByName,
  judge: judgeGuess,
  poolForDifficulty: guessPoolFor,
  dailyPool: guessDailyPool,
  registerExtraModels: guessRegisterExtra,
  VENDOR_REGION: guessVendorRegion,
  GUESS_EPOCH: guessEpoch,
  GUESS_DIFFICULTIES: guessDifficulties,
} = guessModule;

// 后台手动追加的模型（决策 063）：增量文件住 data/，与主数据集同口径、
// 只允许追加到末尾。注册进模块后候选/判定/每日派生即时生效；文件损坏
// 只记日志不影响启动（基础集照常可用）。
const guessExtraPath = path.join(dataDir, 'guess-models-extra.json');
const guessExtraIds = new Set();
try {
  if (fs.existsSync(guessExtraPath)) {
    const extra = JSON.parse(fs.readFileSync(guessExtraPath, 'utf8'));
    for (const entry of extra.models ?? [])
      for (const v of entry.variants?.length ? entry.variants : [entry])
        guessExtraIds.add(v.id);
    console.log(
      `[arenaofbias] 模一把增量模型 ${guessRegisterExtra(extra)} 个（${guessExtraPath}）`,
    );
  }
} catch (error) {
  console.error(
    `[arenaofbias] 模一把增量文件加载失败（已跳过）: ${error.message}`,
  );
}

// 四档难度（决策 060 三档 → 079 四档 → 081 层叠）：难度 k 的池 = difficulty ≤ k
// 的全部模型（地狱=全库）。参数非法时回落简单档
const parseGuessDifficulty = (value) => {
  const n = Number(value);
  return guessDifficulties.includes(n) ? n : 1;
};

// 公开字段：比 GuessModel 少不了什么（答案本身就是公开模型），但保持
// 「服务端→前端」的显式白名单，未来数据集加私密字段（如出题权重）不会
// 意外泄漏。
const publicGuessModel = (m) => ({
  id: m.id,
  name: m.name,
  vendor: m.vendor,
  released: m.released,
  openWeights: m.openWeights,
  contextK: m.contextK,
  modalities: m.modalities,
  reasoning: m.reasoning,
  // priceOut（官方一手输出单价 $/M）与 priceTier（代码内 PRICE_BAND_EDGES 划的档）
  // 都下发：格子显示用档位，揭晓条展示具体价格
  priceOut: m.priceOut,
  priceTier: m.priceTier,
  // 难度分池标记下发，前端按所选难度过滤候选与搜索（答案仍只在服务端派生）
  difficulty: m.difficulty,
});

app.get('/api/guess/today', (_req, res) => {
  try {
    res.set(noStore).json({
      dayKey: guessDayKeyOf(),
      // dayNumber 给分享文案用（「模一把 #12」），epoch 见 lib/guess-logic.ts
      dayNumber: guessDayNumber(),
      attributes: guessAttributeKeys,
      models: guessModels.map(publicGuessModel),
    });
  } catch {
    res.status(503).set(noStore).json({ error: '题目暂时无法加载，请稍后重试' });
  }
});

app.post('/api/guess/check', limiterFor('guess'), (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  // 无需登录：对局全部在前端本地，接口只做纯判定（答案不在请求里，无法伪造）。
  // final=true 表示这是本日第 8 次（最后机会）：无论对错都随反馈附带答案，
  // 供前端揭晓。次数计数在客户端，这里不校验——多拿一次答案没有收益
  //（对局与战绩都不在服务端），不值得为它加状态。
  const guessId = typeof req.body?.guessId === 'string' ? req.body.guessId : '';
  const final = req.body?.final === true;
  const guess = guessModelById.get(guessId) ?? resolveGuessByName(guessId);
  if (!guess)
    return res
      .status(400)
      .set(noStore)
      .json({ code: 'unknown-model', error: '没有找到这个模型' });
  // 两种模式（决策 064）：带 gameId = 练习模式（答案在练习局表里，见下）；
  // 不带 = 每日一题（每日池=简单+普通派生，困难与地狱档不进每日）
  const gameId =
    typeof req.body?.gameId === 'string' ? req.body.gameId : null;
  let answer;
  if (gameId) {
    const game = guessPracticeGames.get(gameId);
    if (!game)
      return res
        .status(404)
        .set(noStore)
        .json({ code: 'game-expired', error: '这局练习已过期，开一把新的吧' });
    answer = game.answer;
  } else {
    answer = guessAnswerForDate(new Date(), guessDailyPool(guessModels));
  }
  try {
    const feedback = judgeGuess(guess, answer);
    // 猜中或最后一次：随反馈附带答案（前端揭晓用）；否则不给，防试探
    res.set(noStore).json({
      feedback,
      answer: feedback.won || final ? publicGuessModel(answer) : null,
    });
  } catch {
    res.status(503).set(noStore).json({ error: '暂时判不了，稍后再试？' });
  }
});

// ── 练习模式（决策 064/079）：四档难度随机出题、不限次、可「再来一把」──
// 答案服务端持有（与每日一题同一个防偷看口径），开局发 gameId，判定走
// /api/guess/check 带 gameId。局全在内存：服务器重启即失效（前端收到
// game-expired 会开新局），不为练习局落库。练习不计战绩也不上报统计——
// 无限刷的局统计胜率没意义。
const guessPracticeGames = new Map(); // gameId → { answer, createdAt }
const GUESS_PRACTICE_MAX_GAMES = 5000;

app.post('/api/guess/practice/start', limiterFor('guess'), (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  try {
    const difficulty = parseGuessDifficulty(req.body?.difficulty);
    const pool = guessPoolFor(guessModels, difficulty);
    // 空池守卫：新档（如地狱档）尚未收录模型时明确拒绝，别让空池取模
    // 炸成不明所以的 503
    if (!pool.length)
      return res
        .status(503)
        .set(noStore)
        .json({ error: '这一档还没有收录模型，先玩别的难度吧' });
    // 随机选一槽（合并组算一槽），组内再随机一个版本——练习局用真随机，
    // 不需要每日题那种可复现派生
    const slots = new Map();
    for (const m of pool) {
      const key = m.groupId ?? m.id;
      if (!slots.has(key)) slots.set(key, []);
      slots.get(key).push(m);
    }
    const groups = [...slots.values()];
    const slot = groups[randomInt(groups.length)];
    const answer = slot[randomInt(slot.length)];
    // 容量兜底：超上限时从最老的开始清（Map 迭代即插入序）
    if (guessPracticeGames.size >= GUESS_PRACTICE_MAX_GAMES) {
      const excess = guessPracticeGames.size - GUESS_PRACTICE_MAX_GAMES + 1;
      let i = 0;
      for (const key of guessPracticeGames.keys()) {
        guessPracticeGames.delete(key);
        if (++i >= excess) break;
      }
    }
    const gameId = randomBytes(12).toString('hex');
    guessPracticeGames.set(gameId, { answer, createdAt: Date.now() });
    res.set(noStore).json({ gameId });
  } catch {
    res.status(503).set(noStore).json({ error: '暂时开不了局，稍后再试？' });
  }
});

// 游玩数据上报：一局结束时前端报一次（与本地战绩结算同一时机，一局一条）。
// 匿名、无需登录——对局本来就在浏览器本地；answer_id 由服务端按 dayKey 从
// 每日池（决策 064/081：简单+普通）重新派生，客户端只报「几步、中没中」，伪造不了
// 答案归属。可刷假数据但没有收益，限流兜底；多刷也只是把统计弄脏。
// 决策 064 起只有每日一题上报（练习模式不限次、不上报）；请求不再带
// difficulty，guess_results.difficulty 对每日题记 0，历史 1-3 记录保留。
const insertGuessResult = db.prepare(
  `INSERT INTO guess_results (id, day_key, difficulty, answer_id, won, attempts, ip_hash, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);
app.post('/api/guess/result', limiterFor('guess'), (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  try {
    const won = req.body?.won === true;
    const attempts = Number(req.body?.attempts);
    const reportDay =
      typeof req.body?.dayKey === 'string' ? req.body.dayKey : guessDayKeyOf();
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 8)
      return res.status(400).set(noStore).json({ error: '步数无效' });
    // 只收 epoch 起到今天的 UTC+8 日历日；'YYYY-MM-DD' 字典序即日期序。
    // 再做一次往返核对挡幽灵日期（'2026-11-31' 这类不存在的日子会被 V8
    // 进位成 12-01，不核对就能落库、answer_id 却按 12-01 派生）
    const reportDate = new Date(`${reportDay}T00:00:00+08:00`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(reportDay) ||
      Number.isNaN(reportDate.getTime()) ||
      guessDayKeyOf(reportDate) !== reportDay ||
      reportDay < guessEpoch ||
      reportDay > guessDayKeyOf()
    )
      return res.status(400).set(noStore).json({ error: '日期无效' });
    const answer = guessAnswerForDate(
      reportDate,
      guessDailyPool(guessModels),
    );
    const now = Date.now();
    insertGuessResult.run(
      randomBytes(8).toString('hex'),
      reportDay,
      0, // difficulty=0 表示每日一题（064 起）；练习模式不上报
      answer.id,
      won ? 1 : 0,
      attempts,
      ipHashOfDay(req.ip || 'unknown', dayKey(now)),
      now,
    );
    res.set(noStore).status(204).end();
  } catch {
    res.status(503).set(noStore).json({ error: '暂时记不了，不影响这局' });
  }
});

// ── 后台「模一把」页：游玩统计 + 数据集清单 + 手动追加模型 ──

app.get('/api/admin/guess/stats', requireAdmin, (_req, res) => {
  try {
    const totals = db
      .prepare(
        `SELECT COUNT(*) AS played, COALESCE(SUM(won), 0) AS won,
                AVG(CASE WHEN won = 1 THEN attempts END) AS avgSteps
         FROM guess_results`,
      )
      .get();
    const todayRow = db
      .prepare(
        `SELECT COUNT(*) AS played, COALESCE(SUM(won), 0) AS won
         FROM guess_results WHERE day_key = ?`,
      )
      .get(guessDayKeyOf());
    const byDifficulty = db
      .prepare(
        `SELECT difficulty, COUNT(*) AS played, SUM(won) AS won,
                AVG(CASE WHEN won = 1 THEN attempts END) AS avgSteps
         FROM guess_results GROUP BY difficulty ORDER BY difficulty`,
      )
      .all();
    const byDay = db
      .prepare(
        `SELECT day_key AS day, COUNT(*) AS played, SUM(won) AS won
         FROM guess_results GROUP BY day_key ORDER BY day_key DESC LIMIT 14`,
      )
      .all()
      .reverse();
    const byModel = db
      .prepare(
        `SELECT answer_id AS id, COUNT(*) AS times, SUM(won) AS won,
                AVG(CASE WHEN won = 1 THEN attempts END) AS avgSteps
         FROM guess_results GROUP BY answer_id ORDER BY times DESC, id`,
      )
      .all()
      .map((row) => ({
        ...row,
        name: guessModelById.get(row.id)?.name ?? row.id,
      }));
    res.set(noStore).json({
      day: guessDayKeyOf(),
      totals,
      today: todayRow,
      byDifficulty,
      byDay,
      byModel,
    });
  } catch {
    res.status(503).set(noStore).json({ error: '统计数据暂时无法加载' });
  }
});

// 模型清单：后台加模型时参照（厂商下拉、查重）。extra 标记 = 来自增量文件
app.get('/api/admin/guess/models', requireAdmin, (_req, res) => {
  try {
    const vendors = [
      ...new Map(
        guessModels.map((m) => [m.vendor, m.region]),
      ).entries(),
    ].map(([org, region]) => ({ org, region }));
    res.set(noStore).json({
      total: guessModels.length,
      extraCount: guessExtraIds.size,
      vendors,
      models: guessModels.map((m) => ({
        id: m.id,
        name: m.name,
        vendor: m.vendor,
        released: m.released,
        difficulty: m.difficulty,
        extra: guessExtraIds.has(m.id),
      })),
    });
  } catch {
    res.status(503).set(noStore).json({ error: '清单暂时无法加载' });
  }
});

// 手动追加模型：写入 data/guess-models-extra.json 末尾并即时注册进内存，
// 不重启即生效。候选与练习池立即包含新模型；每日题从追加次日起才可能抽到
// 它（sinceDay，见 guess-logic 的 answerForDate）——当天与历史答案不受追加
// 影响。已有条目不可改（改难度会重排历史答案，要走改主数据集 + 人工拍板
// 的流程）。
app.post('/api/admin/guess/models', requireAdmin, (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  const bad = (message) => res.status(400).set(noStore).json({ error: message });
  try {
    const body = req.body ?? {};
    const name = String(body.name ?? '').trim();
    const org = String(body.org ?? '').trim();
    if (!name || name.length > 60) return bad('显示名必填（60 字内）');
    if (!org || org.length > 60) return bad('厂商名必填（60 字内）');
    if (resolveGuessByName(name))
      return bad('已存在同名模型（不区分大小写）');
    const year = Number(body.year);
    const month = Number(body.month);
    if (!Number.isInteger(year) || year < 2015 || year > 2100)
      return bad('发布年份无效');
    if (!Number.isInteger(month) || month < 1 || month > 12)
      return bad('发布月份无效');
    const difficulty = Number(body.difficulty);
    if (!guessDifficulties.includes(difficulty))
      return bad(`难度必须是 ${guessDifficulties.join('/')}`);
    const knownModalities = new Set(['text', 'image', 'audio', 'video']);
    const modalities = [
      ...new Set(Array.isArray(body.modalities) ? body.modalities : []),
    ];
    if (
      !modalities.includes('text') ||
      modalities.some((m) => !knownModalities.has(m))
    )
      return bad('模态至少包含 text，且只能是 text/image/audio/video');
    const nullableNumber = (v) =>
      v === null || v === undefined || v === '' ? null : Number(v);
    const contextK = nullableNumber(body.contextK);
    const priceOut = nullableNumber(body.priceOut);
    if (contextK !== null && (!Number.isFinite(contextK) || contextK <= 0))
      return bad('上下文窗口须为正数（K token），未公开留空');
    if (priceOut !== null && (!Number.isFinite(priceOut) || priceOut < 0))
      return bad('输出单价须为非负数（$/M），无一手价留空');
    const popularity = Number(body.popularity);
    if (!Number.isInteger(popularity) || popularity < 0 || popularity > 100)
      return bad('知名度须为 0-100 的整数');
    const slug = String(body.id ?? '').trim() || name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!/^[\w.-]+$/.test(slug)) return bad('id 只能含字母数字与 - _ .');
    if (guessModelById.has(slug)) return bad(`id「${slug}」已被占用`);
    // 新厂商必须登记地区码（决策 062 的 VENDOR_REGION 契约）；
    // 已有厂商沿用登记，以数据集口径为准
    let region = null;
    if (!guessVendorRegion[org]) {
      region = String(body.region ?? '')
        .trim()
        .toUpperCase();
      if (!/^[A-Z]{2}$/.test(region))
        return bad('新厂商需要登记两位地区码（如 CN/US/JP）');
    }
    const entry = {
      id: slug,
      name,
      org,
      year,
      month,
      openWeights: body.openWeights === true,
      contextK,
      modality: modalities.join('+'),
      reasoning: body.reasoning === true,
      priceOut,
      popularity,
      difficulty,
      // 追加次日起才参与每日题派生（answerForDate 的追加槽机制）：当天与
      // 历史答案不受影响，正在进行的对局不会被换答案；候选与练习池立即生效
      sinceDay: guessDayNumber() + 1,
    };
    const file = fs.existsSync(guessExtraPath)
      ? JSON.parse(fs.readFileSync(guessExtraPath, 'utf8'))
      : { models: [] };
    file.models = [...(file.models ?? []), entry];
    if (region)
      file.vendorRegions = { ...file.vendorRegions, [org]: region };
    // 原子写（2026-09-15）：先写临时文件再改名——直接覆盖原文件时进程若在
    // 写入中途崩溃，文件损坏会让下次启动整体跳过，此前追加的模型全部失效
    const tmpPath = `${guessExtraPath}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(file, null, 2)}\n`);
    fs.renameSync(tmpPath, guessExtraPath);
    guessRegisterExtra({
      models: [entry],
      vendorRegions: region ? { [org]: region } : {},
    });
    guessExtraIds.add(slug);
    res.set(noStore).json({ ok: true, model: publicGuessModel(guessModelById.get(slug)) });
  } catch {
    res.status(503).set(noStore).json({ error: '保存失败，稍后再试' });
  }
});

app.post('/api/track', limiterFor('track'), (req, res) => {
  // 同源即可上报，无需登录（访客也要统计）；失败吞错不影响页面。
  // 限流 2026-09-15 补上：这是唯一匿名写库的接口，不限流可被脚本无限刷
  // page_views（DB 膨胀 + 后台访客统计失真）；额度最宽，正常导航不受影响
  try {
    if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
    const path = String(req.body?.path || '/').slice(0, 64);
    const now = Date.now();
    insertPageView.run(dayKey(now), path, ipHashOfDay(req.ip || 'unknown', dayKey(now)), now);
    res.set(noStore).status(204).end();
  } catch {
    res.set(noStore).status(204).end();
  }
});

// 开发者调试：清空自己（dev）的真实投票。仅 dev 账号 + 本机回环可用，
// 与 /api/auth/dev 的门禁口径一致——本地反复测试投票流程用，不绕过任何
// 校验，只是删掉重投（榜单与流水会随之更新，语义干净）。
app.post('/api/dev/clear-my-votes', (req, res) => {
  const isLoopback = (ip) =>
    ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  // 反代防误开（与 /api/auth/dev 同一口径）：见 auth.js 的说明——
  // 带 X-Forwarded-For 且未配置 TRUST_PROXY 时 req.ip 恒为代理地址，回环不可信
  const proxyTrusted = () => {
    const setting = app.get('trust proxy');
    return setting !== false && setting !== true;
  };
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.user || req.user.username !== 'dev')
    return res.status(403).json({ error: '仅 dev 账号可用' });
  if (
    ('x-forwarded-for' in req.headers || 'x-real-ip' in req.headers) &&
    !proxyTrusted() &&
    process.env.ALLOW_DEV_LOGIN !== '1'
  )
    return res.status(403).json({ error: '检测到反向代理但未配置 TRUST_PROXY，该接口已禁用。' });
  if (!(isLoopback(req.ip) || process.env.ALLOW_DEV_LOGIN === '1'))
    return res.status(403).json({ error: '仅本机可用' });
  try {
    const result = db
      .prepare('DELETE FROM votes WHERE user_id = ?')
      .run(req.user.id);
    res
      .set(noStore)
      .json({ cleared: result.changes });
  } catch {
    res.status(503).set(noStore).json({ error: '暂时没有清掉，稍后再试？' });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));
// ---------- 静态资源 ----------

// 作品文件目录（决策 043）：data/works 优先（后台登记的作品在这里），
// 找不到时回落到 dist 里 public/works 的小型演示样例（pelican-cycle）。
// 两个来源共用 /works 前缀，沙盒 iframe 引用 /works/xxx.html 不区分来源。
// 无条件挂载——目录可能在本进程启动后才被登记脚本/宝塔创建
app.use(
  '/works',
  express.static(worksDir, {
    // 作品文件按 id 唯一，但内容可被登记/取景补丁重写，且预览 iframe 的 URL
    // 固定（?aob=prev）不带版本——必须协商缓存（ETag 304）保证改动即刻生效
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  }),
);

if (fs.existsSync(path.join(distDir, 'index.html'))) {
  // 带内容哈希的构建产物与图片可长缓存；index.html 始终即时更新。
  app.use(
    express.static(distDir, {
      index: 'index.html',
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html'))
          res.setHeader('Cache-Control', 'no-cache');
        else if (/[\\/](assets|art)[\\/]/.test(filePath))
          res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      },
    }),
  );
  // SPA 回退：未知 GET 路径交给前端入口。
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  console.warn(
    '[arenaofbias] 未找到 dist/index.html——请先执行 npm run build。静态页面暂不可用，仅 API 生效。',
  );
}

// 请求体超过 4kb 等解析错误统一转成友好提示。
app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large')
    return res.status(413).json({ error: '内容过长' });
  if (error?.type === 'entity.parse.failed')
    return res.status(400).json({ error: '请求内容格式不正确。' });
  console.error('[arenaofbias] Request failed:', error.code || 'internal');
  res.status(500).json({ error: '服务暂时不可用' });
});

app.listen(port, host, () => {
  console.log(`[arenaofbias] http://${host}:${port}`);
  console.log(`[arenaofbias] SQLite: ${dbPath}`);
  console.log(
    `[arenaofbias] 作品目录: ${fs.existsSync(worksDir) ? worksDir : '(未创建，仅用内置演示样例)'}`,
  );
  console.log(`[arenaofbias] 收件箱目录: ${inboxDir}`);
  console.log(
    `[arenaofbias] 静态目录: ${fs.existsSync(path.join(distDir, 'index.html')) ? distDir : '(未构建)'}`,
  );
});
