// 邮箱账号体系：注册（必填邮箱+验证码）、绑定/换绑、忘记密码（重置）。
// 接口都挂在 /api/auth 下，自动吃 auth.js 里对 /api/auth POST 的
// 同源 + JSON 守卫。安全口径：
//   - 验证码 6 位数字，默认 10 分钟有效、一次性、累计输错 5 次作废；
//     库里只存 sha256(键:验证码)，不存明文。
//   - 发码限流复用 auth_limits 表：按 IP（默认 8 次/15 分钟）与按邮箱
//     （默认 3 次/15 分钟）两个键；同一收件地址默认 60 秒冷却。
//   - reset 的发码接口永远回同样的成功话术，不泄露邮箱是否绑过账号；
//     register/bind 则明示邮箱占用（换一个再试比沉默更友好）。
//   - 重置密码成功后删除该账号全部会话，防旧设备残留登录态。
// 调参环境变量：MAIL_CODE_TTL_MS / MAIL_COOLDOWN_MS / MAIL_CODE_MAX_ATTEMPTS /
// MAIL_IP_MAX / MAIL_EMAIL_MAX（默认见下），发信配置见 mail.js 头注。
import { randomBytes, randomUUID, randomInt, timingSafeEqual } from 'node:crypto';
import { digest, normalize, validPassword, validEmail, derive } from './auth-util.js';
import { sendVerificationEmail, mailReady, mailDevLog } from './mail.js';
import { verifyTurnstile } from './turnstile.js';

export function installAuthEmail(app, db, auth) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_codes (key TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_sent_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS email_codes_expiry ON email_codes(expires_at);
  `);
  // users 表建在 auth.js 的 installAuth 里（比编号迁移先跑），邮箱两列也
  // 由 installAuth 追加（sessionUser 语句 prepare 时就要引用）；这里只管
  // 邮箱唯一性与验证码表
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL',
  );

  const { getUser, login, limited } = auth;
  const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const getUserById = db.prepare('SELECT * FROM users WHERE id = ?');
  const getCode = db.prepare('SELECT * FROM email_codes WHERE key = ?');
  const deleteCode = db.prepare('DELETE FROM email_codes WHERE key = ?');
  const bumpAttempts = db.prepare(
    'UPDATE email_codes SET attempts = attempts + 1 WHERE key = ?',
  );
  const upsertCode = db.prepare(
    'INSERT INTO email_codes VALUES (?, ?, ?, 0, ?) ON CONFLICT(key) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, last_sent_at = excluded.last_sent_at',
  );
  const restoreCode = db.prepare(
    'UPDATE email_codes SET code_hash = ?, expires_at = ?, attempts = ?, last_sent_at = ? WHERE key = ?',
  );

  const codeTtl = Number(process.env.MAIL_CODE_TTL_MS || 10 * 60 * 1000);
  const sendCooldown = Number(process.env.MAIL_COOLDOWN_MS || 60 * 1000);
  const maxAttempts = Number(process.env.MAIL_CODE_MAX_ATTEMPTS || 5);
  const ipMax = Number(process.env.MAIL_IP_MAX || 8);
  const emailMax = Number(process.env.MAIL_EMAIL_MAX || 3);

  const issueCode = async (purpose, email) => {
    const key = `${purpose}:${digest(email)}`;
    const now = Date.now();
    const previous = getCode.get(key);
    if (previous && now - previous.last_sent_at < sendCooldown)
      return {
        cooldown: Math.ceil(
          (previous.last_sent_at + sendCooldown - now) / 1000,
        ),
      };
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = digest(`${key}:${code}`);
    upsertCode.run(key, codeHash, now + codeTtl, now);
    try {
      await sendVerificationEmail({ to: email, code, purpose });
    } catch (error) {
      // 发信失败要回滚：否则用户没收到码还背上 60 秒冷却
      if (previous)
        restoreCode.run(
          previous.code_hash,
          previous.expires_at,
          previous.attempts,
          previous.last_sent_at,
          key,
        );
      else deleteCode.run(key);
      throw error;
    }
    return {};
  };

  const matchCode = (purpose, email, code, consume) => {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
    const key = `${purpose}:${digest(email)}`;
    const row = getCode.get(key);
    if (!row) return false;
    if (Date.now() > row.expires_at || row.attempts >= maxAttempts) {
      deleteCode.run(key);
      return false;
    }
    const candidate = digest(`${key}:${code}`);
    const matches =
      candidate.length === row.code_hash.length &&
      timingSafeEqual(
        Buffer.from(candidate, 'utf8'),
        Buffer.from(row.code_hash, 'utf8'),
      );
    if (!matches) {
      bumpAttempts.run(key);
      if (row.attempts + 1 >= maxAttempts) deleteCode.run(key);
      return false;
    }
    if (consume) deleteCode.run(key);
    return true;
  };
  // 预校验（分步表单「验证邮箱」按钮用）：正确只放行不消耗，真正消耗在
  // 注册/重置提交时；错误照常累计（5 次作废），不给枚举留放大器
  const checkCode = (purpose, email, code) => matchCode(purpose, email, code, false);
  const consumeCode = (purpose, email, code) => matchCode(purpose, email, code, true);
  // 打码展示邮箱：al***@163.com（本地段只露头两位）
  const maskEmail = (email) => {
    const at = email.indexOf('@');
    if (at <= 0) return email;
    return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
  };

  // 发码接口的专用限流：与 auth.js 的 limited 同款 DB 滑窗，
  // 但键换成按 IP / 按目标（邮箱或账号名；请求体里通常没有用户名可依）
  const limitedMail = (handler) => async (req, res, next) => {
    const now = Date.now();
    const target =
      normalize(req.body?.email) || normalize(req.body?.username);
    const keys = [
      [`mail:ip:${req.ip}`, ipMax],
      [`mail:target:${digest(target)}`, emailMax],
    ];
    db.prepare('DELETE FROM auth_limits WHERE expires_at <= ?').run(now);
    for (const [key, max] of keys) {
      const row = db.prepare('SELECT * FROM auth_limits WHERE key = ?').get(key);
      if (row && row.hits >= max)
        return res
          .set('Retry-After', String(Math.ceil((row.expires_at - now) / 1000)))
          .status(429)
          .json({ error: '发送太频繁，请稍后再试。' });
    }
    for (const [key] of keys)
      db.prepare(
        'INSERT INTO auth_limits VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET hits = hits + 1',
      ).run(key, now + 15 * 60 * 1000);
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };

  app.post(
    '/api/auth/register',
    limited(async (req, res) => {
      const username = normalize(req.body?.username);
      const email = normalize(req.body?.email);
      const code = req.body?.code;
      const password = req.body?.password;
      if (!/^[a-z0-9_]{3,24}$/.test(username))
        return res
          .status(400)
          .json({ error: '账号须为 3–24 位英文字母、数字或下划线。' });
      // dev 是系统保留名（2026-09-20 审查发现）：/api/auth/dev 会对名为 dev 的
      // 既有账号直接升管理员——不拦注册的话，任何人抢先注册 dev，运维随后在
      // 本机跑一次开发者登录就会把攻击者的账号提为 admin
      if (username === 'dev')
        return res
          .status(400)
          .json({ error: '这个账号名是系统保留的，请换一个。' });
      if (!validEmail(email))
        return res.status(400).json({ error: '请填写正确的邮箱地址。' });
      if (!validPassword(password))
        return res.status(400).json({ error: '密码须为 12–128 个字符。' });
      if (getUser.get(username))
        return res.status(409).json({ error: '这个账号已被使用，请换一个。' });
      if (getUserByEmail.get(email))
        return res
          .status(409)
          .json({ error: '该邮箱已被其他账号绑定，请换一个。' });
      // 先把格式/占用都排掉再烧验证码：验证码一次性，别让用户
      // 因为一个手滑白等一封邮件
      if (!consumeCode('register', email, code))
        return res
          .status(400)
          .json({ error: '验证码不正确或已过期，请重新获取。' });
      const salt = randomBytes(16).toString('hex');
      const hash = await derive(password, salt);
      const user = { id: randomUUID(), username, email };
      try {
        // role/email 列都是 ALTER 追加（全新库首条 INSERT 前就位），显式列出列名
        db.prepare(
          'INSERT INTO users (id, username, password_hash, created_at, email, email_verified_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(
          user.id,
          username,
          `scrypt:${salt}:${hash.toString('hex')}`,
          Date.now(),
          email,
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
    '/api/auth/email/send',
    limitedMail(async (req, res) => {
      const purpose = req.body?.purpose;
      if (!['register', 'bind', 'reset'].includes(purpose))
        return res.status(400).json({ error: '请求类型无效。' });
      // 人机验证（Turnstile）只卡这一道：注册/绑定/找回都先拿码，发码被守住
      // 就等于全链路被守住，登录与后续提交不打扰用户。限流计数在它之前已走，
      // 无 token 的脚本刷接口照样烧自己的配额
      const verdict = await verifyTurnstile(req.body?.turnstileToken, req.ip);
      if (verdict === 'fail')
        return res.status(400).json({ error: '人机验证未通过，请重试。' });
      if (verdict === 'down')
        return res
          .status(503)
          .json({ error: '人机验证服务暂时不可用，请稍后重试。' });
      // register/bind 以邮箱为目标；reset 以账号名找到绑定邮箱为目标
      let email = '';
      if (purpose === 'reset') {
        const username = normalize(req.body?.username);
        if (!/^[a-z0-9_]{3,24}$/.test(username))
          return res.status(400).json({ error: '请填写账号名。' });
        const owner = getUser.get(username);
        if (!owner) return res.status(400).json({ error: '没有这个账号。' });
        if (!owner.email)
          return res
            .status(400)
            .json({ error: '该账号未绑定邮箱，无法通过邮箱找回密码。' });
        email = owner.email;
      } else {
        email = normalize(req.body?.email);
        if (!validEmail(email))
          return res.status(400).json({ error: '请填写正确的邮箱地址。' });
        if (purpose === 'bind' && !req.user)
          return res.status(401).json({ error: '请先登录后再绑定邮箱。' });
        if (getUserByEmail.get(email))
          return res
            .status(409)
            .json({ error: '该邮箱已被其他账号绑定，请换一个。' });
      }
      if (!mailReady() && !mailDevLog())
        return res
          .status(503)
          .json({ error: '邮件服务未配置，暂时无法发送验证码。' });
      let result;
      try {
        result = await issueCode(purpose, email);
      } catch {
        return res
          .status(502)
          .json({ error: '验证码邮件发送失败，请稍后重试。' });
      }
      if (result.cooldown)
        return res
          .set('Retry-After', String(result.cooldown))
          .status(429)
          .json({ error: '发送太频繁，请稍后再试。' });
      // 返回打码邮箱供界面展示「已发送至 al***@…」
      res.json({ sent: true, email: maskEmail(email) });
    }),
  );

  // 分步表单第二步的门槛：验证码预校验（不消耗）
  app.post('/api/auth/email/verify', async (req, res, next) => {
    try {
      const purpose = req.body?.purpose;
      const code = req.body?.code;
      if (!['register', 'bind', 'reset'].includes(purpose))
        return res.status(400).json({ error: '请求类型无效。' });
      let email = '';
      if (purpose === 'reset') {
        const user = getUser.get(normalize(req.body?.username));
        if (!user || !user.email)
          return res
            .status(400)
            .json({ error: '验证码不正确或已过期，请重新获取。' });
        email = user.email;
      } else {
        email = normalize(req.body?.email);
        if (!validEmail(email))
          return res.status(400).json({ error: '请填写正确的邮箱地址。' });
        if (purpose === 'bind' && !req.user)
          return res.status(401).json({ error: '请先登录后再绑定邮箱。' });
      }
      if (!checkCode(purpose, email, code))
        return res
          .status(400)
          .json({ error: '验证码不正确或已过期，请重新获取。' });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/email/bind', async (req, res, next) => {
    try {
      if (!req.user)
        return res.status(401).json({ error: '请先登录后再绑定邮箱。' });
      const email = normalize(req.body?.email);
      const code = req.body?.code;
      if (!validEmail(email))
        return res.status(400).json({ error: '请填写正确的邮箱地址。' });
      const owner = getUserByEmail.get(email);
      if (owner && owner.id !== req.user.id)
        return res
          .status(409)
          .json({ error: '该邮箱已被其他账号绑定，请换一个。' });
      if (!consumeCode('bind', email, code))
        return res
          .status(400)
          .json({ error: '验证码不正确或已过期，请重新获取。' });
      db.prepare('UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?').run(
        email,
        Date.now(),
        req.user.id,
      );
      const user = getUserById.get(req.user.id);
      res.json({
        user: { id: user.id, username: user.username, role: user.role, email: user.email },
      });
    } catch (error) {
      next(error);
    }
  });

  // 重置密码走与登录相同的 scrypt 并发闸门，防止并发推导被打满
  let activeHashes = 0;
  app.post('/api/auth/password/reset', async (req, res, next) => {
    try {
      const username = normalize(req.body?.username);
      const code = req.body?.code;
      const password = req.body?.password;
      if (!validPassword(password))
        return res.status(400).json({ error: '密码须为 12–128 个字符。' });
      const user = getUser.get(username);
      if (!user || !user.email || !consumeCode('reset', user.email, code))
        return res
          .status(400)
          .json({ error: '验证码不正确或已过期，请重新获取。' });
      if (activeHashes >= 4)
        return res.status(503).json({ error: '登录服务繁忙，请稍后重试。' });
      activeHashes++;
      try {
        const salt = randomBytes(16).toString('hex');
        const hash = await derive(password, salt);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
          `scrypt:${salt}:${hash.toString('hex')}`,
          user.id,
        );
      } finally {
        activeHashes--;
      }
      // 密码已换：清掉该账号所有会话，逼各端重新登录
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      res.json({ reset: true });
    } catch (error) {
      next(error);
    }
  });
}
