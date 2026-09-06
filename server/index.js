// BIAS ARENA —— VPS 后端（原 Cloudflare Workers + D1 版的 Node 等价实现）
//
// 职责：
//   1. 托管 vite build 产物（dist/）下的静态文件；
//   2. 提供 /api/comments GET/POST，数据存本地 SQLite（替代原 D1）；
//   3. 保留原接口行为：同源校验、按轮次隔离、幂等插入、演示级限流。
//
// 运行：npm run build 之后执行 npm start（或 node server/index.js）。
// 环境变量：
//   PORT            监听端口，默认 3000
//   HOST            监听地址，默认 0.0.0.0
//   DATA_DIR        SQLite 文件目录，默认 <项目根>/data
//   RATE_LIMIT_PER_MIN  每个 IP 每分钟可 POST 的条数，默认 10

import express from 'express';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
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

const insertComment = db.prepare(
  `INSERT OR IGNORE INTO comments (id, round_id, side, body, created_at)
   VALUES (?, ?, ?, ?, ?)`,
);
const selectById = db.prepare(
  `SELECT id, round_id AS roundId, side, body, created_at AS createdAt
   FROM comments WHERE id = ? AND round_id = ?`,
);
const listByRound = db.prepare(
  `SELECT id, round_id AS roundId, side, body, created_at AS createdAt
   FROM comments WHERE round_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
);

// ---------- 校验（与 lib/comments.ts 规则保持一致） ----------

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// 题目白名单，与界面侧 lib/comments.ts 保持一致；新增题目（如 '004'）时两处都要加。
const ALLOWED_ROUNDS = ['001', '002', '003'];

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

// ---------- 演示级限流（内存滑动窗口，按真实客户端 IP） ----------

const windows = new Map();
const limiter = (req, res, next) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (forwarded ? String(forwarded).split(',')[0].trim() : null) ||
    req.socket.remoteAddress ||
    'unknown';
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (windows.get(ip) || []).filter((t) => t > windowStart);
  if (hits.length >= postsPerMinute) {
    return res
      .status(429)
      .json({ error: '发言太快了，歇一分钟再试。' });
  }
  hits.push(now);
  windows.set(ip, hits);
  req.clientIp = ip;
  next();
};
setInterval(
  () => {
    const cutoff = Date.now() - 60_000;
    for (const [ip, hits] of windows) {
      const alive = hits.filter((t) => t > cutoff);
      if (alive.length) windows.set(ip, alive);
      else windows.delete(ip);
    }
  },
  60_000,
).unref();

// ---------- Express 应用 ----------

const app = express();
app.disable('x-powered-by');
app.use(
  express.json({
    limit: '4kb', // 原接口限制原始请求体 4000 字节
  }),
);

const noStore = { 'Cache-Control': 'no-store' };

// 同源校验：在反代（Caddy/nginx）之后用 X-Forwarded-Proto/Host 还原真实来源，
// 与原 Worker 版“请求来源必须等于站点来源”的语义一致。
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const proto = forwardedProto
    ? String(forwardedProto).split(',')[0].trim()
    : 'http';
  const headerHost = forwardedHost
    ? String(forwardedHost).split(',')[0].trim()
    : req.headers.host;
  return origin === `${proto}://${headerHost}`;
}

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
  if (!sameOrigin(req))
    return res.status(403).json({ error: '请求来源无效' });
  if (!req.headers['content-type']?.includes('application/json'))
    return res.status(415).json({ error: '请求格式无效' });
  const comment = validateComment(req.body);
  if (!comment)
    return res.status(400).json({ error: '请输入 1–280 字的留言' });
  try {
    insertComment.run(
      comment.id,
      comment.roundId,
      comment.side,
      comment.body,
      Date.now(),
    );
    const saved = selectById.get(comment.id, comment.roundId);
    if (!saved || saved.body !== comment.body || saved.side !== comment.side)
      return res.status(409).json({ error: '留言编号冲突，请重新提交' });
    res.set(noStore).status(201).json({ comment: saved });
  } catch {
    res
      .status(503)
      .set(noStore)
      .json({ error: '暂时没发出去，你的文字还在。再试一次？' });
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
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
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
    '[bias-arena] 未找到 dist/index.html——请先执行 npm run build。静态页面暂不可用，仅 API 生效。',
  );
}

// 请求体超过 4kb 等解析错误统一转成友好提示。
app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large')
    return res.status(413).json({ error: '留言过长' });
  console.error(error);
  res.status(500).json({ error: '服务暂时不可用' });
});

app.listen(port, host, () => {
  console.log(`[bias-arena] http://${host}:${port}`);
  console.log(`[bias-arena] SQLite: ${dbPath}`);
  console.log(
    `[bias-arena] 静态目录: ${fs.existsSync(path.join(distDir, 'index.html')) ? distDir : '(未构建)'}`,
  );
});
