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
//   RATE_LIMIT_PER_MIN  每个 IP 每分钟可 POST 的条数，默认 10

import express from 'express';
import { installAuth } from './auth.js';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(serverDir, '..');
const distDir = path.join(projectRoot, 'dist');
const dataDir = process.env.DATA_DIR || path.join(projectRoot, 'data');
const dbPath = path.join(dataDir, 'comments.db');
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
  `INSERT OR IGNORE INTO votes (id, prompt_id, winner_rid, winner_mid, loser_rid, loser_mid, pair_key, mode, user_id, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const selectVoteById = db.prepare(
  `SELECT id, prompt_id AS promptId, winner_rid AS winnerRid, winner_mid AS winnerMid,
          loser_rid AS loserRid, loser_mid AS loserMid, pair_key AS pairKey,
          mode, created_at AS ts, user_id AS userId
   FROM votes WHERE id = ?`,
);
const selectVoteIdByPair = db.prepare(
  'SELECT id FROM votes WHERE user_id = ? AND pair_key = ?',
);
const listVotes = db.prepare(
  `SELECT id, prompt_id AS promptId, winner_rid AS winnerRid, winner_mid AS winnerMid,
          loser_rid AS loserRid, loser_mid AS loserMid, mode, created_at AS ts
   FROM votes ORDER BY created_at ASC, id ASC`,
);
// ---------- 校验（与 lib/comments.ts 规则保持一致） ----------

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// 题目白名单，与界面侧 lib/comments.ts、lib/votes.ts 保持一致；新增题目（如 '004'）时各处都要加。
const ALLOWED_ROUNDS = ['001', '002', '003', '004', '005', '006', '007'];

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
  if (typeof roundId !== 'string' || !ALLOWED_ROUNDS.includes(roundId))
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
  if (typeof promptId !== 'string' || !ALLOWED_ROUNDS.includes(promptId))
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
  // 票面与作品表核对（B2）：rid 必须真实存在、已发布、非演示、属于本题，并与 mid 一致
  const winner = selectWorkForVote.get(vote.winnerRid);
  const loser = selectWorkForVote.get(vote.loserRid);
  if (!winner || !winner.published || winner.isDemo) return null;
  if (!loser || !loser.published || loser.isDemo) return null;
  if (winner.promptId !== vote.promptId || loser.promptId !== vote.promptId)
    return null;
  if (winner.modelId !== vote.winnerMid || loser.modelId !== vote.loserMid)
    return null;
  return { ...vote, mode };
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
  saved.mode === vote.mode;

// ---------- 演示级限流（内存滑动窗口，按真实客户端 IP） ----------

const windows = new Map();
const limiter = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (windows.get(ip) || []).filter((t) => t > windowStart);
  if (hits.length >= postsPerMinute) {
    return res.status(429).json({ error: '发言太快了，歇一分钟再试。' });
  }
  hits.push(now);
  windows.set(ip, hits);
  req.clientIp = ip;
  next();
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
  if (!ALLOWED_ROUNDS.includes(roundId))
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

app.post('/api/comments', limiter, (req, res) => {
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

app.post('/api/votes', limiter, (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  if (!req.user) return res.status(401).json({ error: '请先登录再投票。' });
  const vote = validateVote(req.body);
  if (!vote) return res.status(400).json({ error: '投票内容无效' });
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
                  v.mode, v.created_at AS ts, u.username
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
app.post('/api/track', (req, res) => {
  // 同源即可上报，无需登录（访客也要统计）；失败吞错不影响页面
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
  if (!sameOrigin(req)) return res.status(403).json({ error: '请求来源无效' });
  if (!req.user || req.user.username !== 'dev')
    return res.status(403).json({ error: '仅 dev 账号可用' });
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
    return res.status(413).json({ error: '留言过长' });
  if (error?.type === 'entity.parse.failed')
    return res.status(400).json({ error: '请求内容格式不正确。' });
  console.error('[arenaofbias] Request failed:', error.code || 'internal');
  res.status(500).json({ error: '服务暂时不可用' });
});

app.listen(port, host, () => {
  console.log(`[arenaofbias] http://${host}:${port}`);
  console.log(`[arenaofbias] SQLite: ${dbPath}`);
  console.log(
    `[arenaofbias] 静态目录: ${fs.existsSync(path.join(distDir, 'index.html')) ? distDir : '(未构建)'}`,
  );
});
