import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const lifetime = 7 * 24 * 60 * 60 * 1000;
const cookieName = 'arena_session';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';
const validPassword = (value) =>
  typeof value === 'string' && value.length >= 12 && value.length <= 128;
const derive = (password, salt) =>
  scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
const dummySalt = randomBytes(16).toString('hex');

export function installAuth(app, db, sameOrigin) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);
  `);
  const getUser = db.prepare('SELECT * FROM users WHERE username = ?');
  const sessionUser = db.prepare(
    'SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?',
  );
  const token = (req) => {
    const value = String(req.headers.cookie || '')
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
  };
  const cookieOptions = (req) => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.APP_ORIGIN?.startsWith('https://') || req.secure,
    path: '/api',
  });
  const clearSession = (req, res) => {
    const current = token(req);
    if (current)
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(
        digest(current),
      );
    res.clearCookie(cookieName, cookieOptions(req));
  };
  const login = (req, res, user) => {
    const raw = randomBytes(32).toString('hex');
    const current = token(req);
    db.transaction(() => {
      if (current)
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(
          digest(current),
        );
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(
        digest(raw),
        user.id,
        Date.now() + lifetime,
      );
    })();
    res.cookie(cookieName, raw, { ...cookieOptions(req), maxAge: lifetime });
    return { id: user.id, username: user.username };
  };
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const current = token(req);
    req.user = current
      ? sessionUser.get(digest(current), Date.now()) || null
      : null;
    next();
  });
  app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));
  app.use('/api/auth', (req, res, next) => {
    if (req.method !== 'POST') return next();
    if (!sameOrigin(req))
      return res.status(403).json({ error: '请求来源无效，请从本站重试。' });
    if (!req.is('application/json'))
      return res.status(415).json({ error: '请使用 JSON 请求。' });
    next();
  });
  let activeHashes = 0;
  const limited = (handler) => async (req, res, next) => {
    const now = Date.now();
    const keys = [
      [`ip:${req.ip}`, 30],
      [`account:${digest(normalize(req.body?.username))}`, 10],
    ];
    db.prepare('DELETE FROM auth_limits WHERE expires_at <= ?').run(now);
    for (const [key, max] of keys) {
      const row = db
        .prepare('SELECT * FROM auth_limits WHERE key = ?')
        .get(key);
      if (row && row.hits >= max)
        return res
          .set('Retry-After', String(Math.ceil((row.expires_at - now) / 1000)))
          .status(429)
          .json({ error: '尝试次数过多，请稍后再试。' });
    }
    if (activeHashes >= 4)
      return res.status(503).json({ error: '登录服务繁忙，请稍后重试。' });
    for (const [key] of keys)
      db.prepare(
        'INSERT INTO auth_limits VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET hits = hits + 1',
      ).run(key, now + 15 * 60 * 1000);
    activeHashes++;
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    } finally {
      activeHashes--;
    }
  };
  app.post(
    '/api/auth/register',
    limited(async (req, res) => {
      const username = normalize(req.body?.username);
      const password = req.body?.password;
      if (!/^[a-z0-9_]{3,24}$/.test(username))
        return res
          .status(400)
          .json({ error: '账号须为 3–24 位英文字母、数字或下划线。' });
      if (!validPassword(password))
        return res.status(400).json({ error: '密码须为 12–128 个字符。' });
      if (getUser.get(username))
        return res.status(409).json({ error: '这个账号已被使用，请换一个。' });
      const salt = randomBytes(16).toString('hex');
      const hash = await derive(password, salt);
      const user = { id: randomUUID(), username };
      try {
        db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(
          user.id,
          username,
          `scrypt:${salt}:${hash.toString('hex')}`,
          Date.now(),
        );
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE')
          return res
            .status(409)
            .json({ error: '这个账号已被使用，请换一个。' });
        throw error;
      }
      res.status(201).json({ user: login(req, res, user) });
    }),
  );
  app.post(
    '/api/auth/login',
    limited(async (req, res) => {
      const username = normalize(req.body?.username);
      const password = req.body?.password;
      if (!/^[a-z0-9_]{3,24}$/.test(username) || !validPassword(password))
        return res.status(401).json({ error: '账号或密码不正确。' });
      const user = getUser.get(username);
      const [, salt, saved] = user
        ? user.password_hash.split(':')
        : ['', dummySalt, '00'.repeat(64)];
      const candidate = await derive(password, salt);
      if (!timingSafeEqual(candidate, Buffer.from(saved, 'hex')) || !user)
        return res.status(401).json({ error: '账号或密码不正确。' });
      res.json({ user: login(req, res, user) });
    }),
  );
  app.post('/api/auth/logout', (req, res) => {
    clearSession(req, res);
    res.json({ user: null });
  });
  // 开发者免登录：开发者面板一键以固定 'dev' 账号登录（见决策 018）。
  // 只在本机回环（本地 vite 代理 / 直接访问）或显式 ALLOW_DEV_LOGIN=1 时开放，
  // 账号首次使用时创建，密码随机生成且不留存，无人能凭密码登录。
  const isLoopback = (ip) =>
    ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  app.post('/api/auth/dev', async (req, res) => {
    if (!(isLoopback(req.ip) || process.env.ALLOW_DEV_LOGIN === '1'))
      return res
        .status(403)
        .json({ error: '开发者登录未开放（仅本机回环或 ALLOW_DEV_LOGIN=1）。' });
    let user = getUser.get('dev');
    if (!user) {
      const salt = randomBytes(16).toString('hex');
      const hash = await derive(randomBytes(32).toString('hex'), salt);
      const candidate = { id: randomUUID(), username: 'dev' };
      try {
        db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(
          candidate.id,
          'dev',
          `scrypt:${salt}:${hash.toString('hex')}`,
          Date.now(),
        );
        user = candidate;
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') user = getUser.get('dev');
        else throw error;
      }
    }
    res.status(201).json({ user: login(req, res, user) });
  });
}
