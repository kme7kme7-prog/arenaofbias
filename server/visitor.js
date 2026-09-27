// 匿名娱乐投票：服务器签名的浏览器身份，账号与浏览器并行去重。
// 不收集硬件指纹；清 cookie/换设备仍受持久化 IP 限流约束。
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export function createVisitorIdentity(db, baseLimit) {
  db.exec(`CREATE TABLE IF NOT EXISTS site_secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS vote_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);`);
  db.prepare('INSERT OR IGNORE INTO site_secrets VALUES (?, ?)').run(
    'visitor-signing',
    randomBytes(32).toString('hex'),
  );
  const secret = db
    .prepare('SELECT value FROM site_secrets WHERE name = ?')
    .get('visitor-signing').value;
  const sign = (value) =>
    createHmac('sha256', secret).update(value).digest('hex');
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const name = 'arena_visitor';
  const hit = db.transaction((key, max, now) => {
    const hash = createHash('sha256')
      .update(secret + key)
      .digest('hex');
    const row = db.prepare('SELECT * FROM vote_limits WHERE key = ?').get(hash);
    if (row && row.expires_at > now && row.hits >= max) return false;
    db.prepare(`INSERT INTO vote_limits VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN expires_at > ? THEN hits + 1 ELSE 1 END,
      expires_at = CASE WHEN expires_at > ? THEN expires_at ELSE excluded.expires_at END`).run(
      hash,
      now + 60_000,
      now,
      now,
    );
    return true;
  });
  let lastCleanup = 0;
  return {
    identify(req, res) {
      const raw = String(req.headers.cookie || '')
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`))
        ?.slice(name.length + 1);
      const match = /^([a-f0-9]{32})\.(\d{13})\.([a-f0-9]{64})$/.exec(
        raw || '',
      );
      if (
        match &&
        Number(match[2]) > Date.now() &&
        Number(match[2]) <= Date.now() + lifetime &&
        timingSafeEqual(
          Buffer.from(match[3], 'hex'),
          Buffer.from(sign(`${match[1]}.${match[2]}`), 'hex'),
        )
      )
        return match[1];
      const id = randomBytes(16).toString('hex');
      const value = `${id}.${Date.now() + lifetime}`;
      res.cookie(name, `${value}.${sign(value)}`, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/api',
        maxAge: lifetime,
        secure: Boolean(
          process.env.APP_ORIGIN?.startsWith('https://') || req.secure,
        ),
      });
      return id;
    },
    limit(req, res, visitor) {
      const now = Date.now();
      if (now - lastCleanup > 60_000) {
        db.prepare('DELETE FROM vote_limits WHERE expires_at <= ?').run(now);
        lastCleanup = now;
      }
      const allowed =
        hit(`ip:${req.ip}`, baseLimit * 6, now) &&
        hit(`browser:${visitor}`, Math.max(12, baseLimit), now) &&
        (!req.user || hit(`user:${req.user.id}`, Math.max(12, baseLimit), now));
      if (!allowed)
        res
          .set('Retry-After', '60')
          .status(429)
          .json({ code: 'rate', error: '投票太快了，请稍后再试。' });
      return allowed;
    },
  };
}
