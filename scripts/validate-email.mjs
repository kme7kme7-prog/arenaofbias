// 邮箱账号体系回归（2026-09-24）：注册必填邮箱+验证码、绑定/换绑、
// 忘记密码重置（重置后全会话登出）、验证码冷却与错码作废、reset 不泄露
// 邮箱占用。全部跑在临时库 + MAIL_DEV_LOG=1（验证码从服务器日志捕获，
// 不真发信）。冷却与限流阈值用环境变量调小/调大以覆盖边界。
// 第二阶段另起一个开了 Turnstile 的服务端，用本地桩代替 Cloudflare siteverify，
// 密封验证发码的人机门禁（缺 token 拒、假 token 拒、真 token 放行）。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = await mkdtemp(path.join(tmpdir(), 'aob-email-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(port),
    HOST: '127.0.0.1',
    RATE_LIMIT_PER_MIN: '60',
    MAIL_DEV_LOG: '1',
    MAIL_COOLDOWN_MS: '300',
    MAIL_IP_MAX: '1000',
    MAIL_EMAIL_MAX: '1000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

// 服务器日志按行收集：转发到控制台的同时解析 MAIL_DEV_LOG 验证码行
const logLines = [];
let pendingLog = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    process[stream === child.stdout ? 'stdout' : 'stderr'].write(chunk);
    if (stream !== child.stdout) return;
    pendingLog += chunk;
    const parts = pendingLog.split('\n');
    pendingLog = parts.pop();
    logLines.push(...parts);
  });
}

let tests = 0;
async function check(label, fn) {
  await fn();
  console.log(`PASS ${++tests} ${label}`);
}
const post = async (pathname, body, cookie = '') => {
  const response = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: base,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json().catch(() => ({})) };
};
const codeLine = (purpose, email) =>
  logLines.find(
    (line) =>
      line.includes(`purpose=${purpose}`) &&
      line.includes(`email=${email}`) &&
      line.includes('code='),
  );
const waitForCode = async (purpose, email) => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const line = codeLine(purpose, email);
    if (line) return line.match(/code=(\d{6})/)[1];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`未捕获到 ${purpose} ${email} 的验证码`);
};
const sendCode = async (purpose, email, cookie = '') =>
  post('/api/auth/email/send', { purpose, email }, cookie);
// reset 按账号名发码（2026-09-24 验收反馈：先输账号，展示打码绑定邮箱）
const sendReset = async (username, cookie = '') =>
  post('/api/auth/email/send', { purpose: 'reset', username }, cookie);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const register = async (username, email) => {
  const { response: sent } = await sendCode('register', email);
  assert.equal(sent.status, 200, `send code for ${username}`);
  const code = await waitForCode('register', email);
  const password = `validate-${randomUUID()}`;
  const { response, data } = await post('/api/auth/register', {
    username,
    email,
    code,
    password,
  });
  assert.equal(response.status, 201, `register ${username}`);
  return { password, cookie: response.headers.get('set-cookie').split(';')[0], data };
};
const me = async (cookie) =>
  (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();

try {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${base}/api/works`);
      if (response.ok) break;
    } catch {
      /* 服务器还在启动，继续等 */
    }
    if (attempt >= 100) throw new Error('服务器未就绪');
    await sleep(100);
  }

  const emailA = `alice-${randomUUID().slice(0, 8)}@aob.test`;
  const emailB = `bob-${randomUUID().slice(0, 8)}@aob.test`;

  await check('发注册验证码', async () => {
    const { response } = await sendCode('register', emailA);
    assert.equal(response.status, 200);
    assert.ok(await waitForCode('register', emailA));
  });
  await check('缺验证码注册被拒', async () => {
    const { response } = await post('/api/auth/register', {
      username: 'alice_no_code',
      email: emailA,
      password: 'validate-no-code-2026',
    });
    assert.equal(response.status, 400);
  });
  await check('错验证码注册被拒', async () => {
    const { response } = await post('/api/auth/register', {
      username: 'alice_bad_code',
      email: emailA,
      code: '000000',
      password: 'validate-bad-code-2026',
    });
    assert.equal(response.status, 400);
  });
  await check('正确验证码注册成功且绑定邮箱', async () => {
    const code = await waitForCode('register', emailA);
    const password = 'validate-alice-2026';
    const { response, data } = await post('/api/auth/register', {
      username: 'alice',
      email: emailA,
      code,
      password,
    });
    assert.equal(response.status, 201);
    assert.equal(data.user.email, emailA);
  });
  await check('me 返回已验证邮箱', async () => {
    const { cookie } = await register('carol', `carol-${randomUUID().slice(0, 8)}@aob.test`);
    const session = await me(cookie);
    assert.ok(session.user.email.endsWith('@aob.test'));
  });
  await check('重复邮箱在发码时被明示占用', async () => {
    const { response, data } = await sendCode('register', emailA);
    assert.equal(response.status, 409);
    assert.match(data.error, /已被其他账号绑定/);
  });
  await check('非法邮箱格式被拒', async () => {
    const { response } = await sendCode('register', 'not-an-email');
    assert.equal(response.status, 400);
  });
  await check('同邮箱 60 秒冷却（429）', async () => {
    const email = `cool-${randomUUID().slice(0, 8)}@aob.test`;
    assert.equal((await sendCode('register', email)).response.status, 200);
    const { response } = await sendCode('register', email);
    assert.equal(response.status, 429);
    await sleep(400); // 测试环境冷却调到 300ms
    assert.equal((await sendCode('register', email)).response.status, 200);
  });
  await check('错码 5 次验证码作废', async () => {
    const email = `burn-${randomUUID().slice(0, 8)}@aob.test`;
    await sendCode('register', email);
    const code = await waitForCode('register', email);
    for (let i = 0; i < 5; i++) {
      const wrong = code === '000000' ? '000001' : '000000';
      const { response } = await post('/api/auth/register', {
        username: `burn_${i}`,
        email,
        code: wrong,
        password: 'validate-burn-2026xxxx',
      });
      assert.equal(response.status, 400);
    }
    const { response } = await post('/api/auth/register', {
      username: 'burn_after',
      email,
      code,
      password: 'validate-burn-2026xxxx',
    });
    assert.equal(response.status, 400, '正确码在 5 次错码后也必须失效');
  });
  await check('未登录不能发绑定码', async () => {
    const { response } = await sendCode('bind', emailB);
    assert.equal(response.status, 401);
  });
  await check('未登录不能绑定', async () => {
    const { response } = await post('/api/auth/email/bind', { email: emailB, code: '123456' });
    assert.equal(response.status, 401);
  });

  // 老账号（无邮箱）走 dev 入口创建，补绑定流程
  const dev = await post('/api/auth/dev', {});
  assert.equal(dev.response.status, 201, 'dev 登录');
  const devCookie = dev.response.headers.get('set-cookie').split(';')[0];
  await check('reset 对不存在的账号明示拒绝', async () => {
    const { response, data } = await sendReset('nobody_at_all');
    assert.equal(response.status, 400);
    assert.match(data.error, /没有这个账号/);
  });
  await check('reset 对未绑定邮箱的账号明示拒绝且不发码', async () => {
    const before = logLines.length;
    const { response, data } = await sendReset('dev');
    assert.equal(response.status, 400);
    assert.match(data.error, /未绑定邮箱/);
    await sleep(300);
    assert.equal(logLines.length, before, '不得出现新的验证码日志行');
  });
  await check('老账号绑定邮箱', async () => {
    const email = `bound-${randomUUID().slice(0, 8)}@aob.test`;
    assert.equal((await sendCode('bind', email, devCookie)).response.status, 200);
    const code = await waitForCode('bind', email);
    const { response, data } = await post(
      '/api/auth/email/bind',
      { email, code },
      devCookie,
    );
    assert.equal(response.status, 200);
    assert.equal(data.user.email, email);
    assert.equal((await me(devCookie)).user.email, email);
  });
  await check('绑定他人占用邮箱被拒', async () => {
    const { response } = await sendCode('bind', emailA, devCookie);
    assert.equal(response.status, 409);
  });
  await check('绑定错码被拒', async () => {
    const email = `bindbad-${randomUUID().slice(0, 8)}@aob.test`;
    await sendCode('bind', email, devCookie);
    await waitForCode('bind', email);
    const { response } = await post(
      '/api/auth/email/bind',
      { email, code: '999999' },
      devCookie,
    );
    assert.equal(response.status, 400);
  });

  // 忘记密码：重置成功、旧会话全灭、新密码可登录
  const daveEmail = `dave-${randomUUID().slice(0, 8)}@aob.test`;
  const dave = await register('dave', daveEmail);
  await check('按账号发重置码，响应带打码邮箱', async () => {
    const { response, data } = await sendReset('dave');
    assert.equal(response.status, 200);
    assert.equal(data.sent, true);
    assert.equal(data.email, 'da***@aob.test');
  });
  await check('verify 预校验：错码拒、对码放行且不消耗', async () => {
    const code = await waitForCode('reset', daveEmail);
    const wrong = code === '000000' ? '000001' : '000000';
    const bad = await post('/api/auth/email/verify', { purpose: 'reset', username: 'dave', code: wrong });
    assert.equal(bad.response.status, 400);
    const good = await post('/api/auth/email/verify', { purpose: 'reset', username: 'dave', code });
    assert.equal(good.response.status, 200);
    assert.equal(good.data.ok, true);
    // 不消耗：预校验通过后，正式重置仍可用同一枚码
    const reset = await post('/api/auth/password/reset', {
      username: 'dave',
      code,
      password: 'validate-dave-new-2026',
    });
    assert.equal(reset.response.status, 200);
  });
  await check('重置后旧会话失效', async () => {
    const session = await me(dave.cookie);
    assert.equal(session.user, null);
  });
  await check('旧密码登录被拒、新密码可登录', async () => {
    const old = await post('/api/auth/login', {
      username: 'dave',
      password: dave.password,
    });
    assert.equal(old.response.status, 401);
    const fresh = await post('/api/auth/login', {
      username: 'dave',
      password: 'validate-dave-new-2026',
    });
    assert.equal(fresh.response.status, 200);
    assert.equal(fresh.data.user.email, daveEmail);
  });
  await check('重置短密码被拒', async () => {
    const email = `short-${randomUUID().slice(0, 8)}@aob.test`;
    await register('erin', email);
    assert.equal((await sendReset('erin')).response.status, 200);
    const code = await waitForCode('reset', email);
    const { response } = await post('/api/auth/password/reset', {
      username: 'erin',
      code,
      password: 'short',
    });
    assert.equal(response.status, 400);
  });
  await check('reset 错码不消耗真实验证码', async () => {
    const email = `again-${randomUUID().slice(0, 8)}@aob.test`;
    await register('frank', email);
    assert.equal((await sendReset('frank')).response.status, 200);
    const code = await waitForCode('reset', email);
    const wrong = await post('/api/auth/password/reset', {
      username: 'frank',
      code: code === '000000' ? '000001' : '000000',
      password: 'validate-again-2026xx',
    });
    assert.equal(wrong.response.status, 400);
    const right = await post('/api/auth/password/reset', {
      username: 'frank',
      code,
      password: 'validate-again-2026xx',
    });
    assert.equal(right.response.status, 200, '错一次后正确码仍可用');
  });
  await check('未配 Turnstile 密钥时接口回 null、发码无需 token', async () => {
    const config = await (await fetch(`${base}/api/auth/turnstile`)).json();
    assert.equal(config.siteKey, null);
    // 本阶段全部 sendCode 都没带 token 且都发出去了，这里再显式确认一次
    const email = `nogate-${randomUUID().slice(0, 8)}@aob.test`;
    assert.equal((await sendCode('register', email)).response.status, 200);
  });

  // ---- 第二阶段：Turnstile 门禁（本地桩代替 Cloudflare siteverify）----
  {
    const stubBodies = [];
    const stub = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        stubBodies.push(body);
        const ok = new URLSearchParams(body).get('response') === 'good-token';
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: ok }));
      });
    });
    await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const stubUrl = `http://127.0.0.1:${stub.address().port}/siteverify`;
    const gateDataDir = await mkdtemp(path.join(tmpdir(), 'aob-email-gate-'));
    let gatePort = 20000 + Math.floor(Math.random() * 20000);
    if (gatePort === port) gatePort += 1;
    const gateBase = `http://127.0.0.1:${gatePort}`;
    const gateChild = spawn(process.execPath, ['server/index.js'], {
      cwd: root,
      env: {
        ...process.env,
        DATA_DIR: gateDataDir,
        PORT: String(gatePort),
        HOST: '127.0.0.1',
        RATE_LIMIT_PER_MIN: '60',
        MAIL_DEV_LOG: '1',
        MAIL_COOLDOWN_MS: '300',
        MAIL_IP_MAX: '1000',
        MAIL_EMAIL_MAX: '1000',
        TURNSTILE_SECRET_KEY: 'test-secret',
        TURNSTILE_SITE_KEY: 'test-site-key',
        TURNSTILE_VERIFY_URL: stubUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    gateChild.stdout.setEncoding('utf8');
    gateChild.stdout.on('data', (chunk) => process.stdout.write(chunk));
    gateChild.stderr.setEncoding('utf8');
    gateChild.stderr.on('data', (chunk) => process.stderr.write(chunk));
    const postGate = async (pathname, body) => {
      const response = await fetch(`${gateBase}${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: gateBase },
        body: JSON.stringify(body),
      });
      return { response, data: await response.json().catch(() => ({})) };
    };
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await fetch(`${gateBase}/api/works`);
          if (response.ok) break;
        } catch {
          /* 服务器还在启动，继续等 */
        }
        if (attempt >= 100) throw new Error('门禁服务器未就绪');
        await sleep(100);
      }
      await check('开启后接口下发站点密钥', async () => {
        const config = await (await fetch(`${gateBase}/api/auth/turnstile`)).json();
        assert.equal(config.siteKey, 'test-site-key');
      });
      await check('缺人机 token 发码被拒', async () => {
        const { response, data } = await postGate('/api/auth/email/send', {
          purpose: 'register',
          email: `gate1-${randomUUID().slice(0, 8)}@aob.test`,
        });
        assert.equal(response.status, 400);
        assert.match(data.error, /人机验证未通过/);
      });
      await check('假人机 token 发码被拒且校验确有发生', async () => {
        const before = stubBodies.length;
        const { response, data } = await postGate('/api/auth/email/send', {
          purpose: 'register',
          email: `gate2-${randomUUID().slice(0, 8)}@aob.test`,
          turnstileToken: 'bad-token',
        });
        assert.equal(response.status, 400);
        assert.match(data.error, /人机验证未通过/);
        assert.equal(stubBodies.length, before + 1, '假 token 也要送到校验端');
      });
      await check('真人机 token 发码放行且密钥只给校验端', async () => {
        const { response, data } = await postGate('/api/auth/email/send', {
          purpose: 'register',
          email: `gate3-${randomUUID().slice(0, 8)}@aob.test`,
          turnstileToken: 'good-token',
        });
        assert.equal(response.status, 200);
        assert.equal(data.sent, true);
        const last = new URLSearchParams(stubBodies.at(-1));
        assert.equal(last.get('secret'), 'test-secret');
        assert.equal(last.get('response'), 'good-token');
      });
    } finally {
      gateChild.kill();
      await new Promise((resolve) => {
        gateChild.once('exit', resolve);
        setTimeout(resolve, 3000);
      });
      stub.close();
      await rm(gateDataDir, { recursive: true, force: true });
    }
  }

  console.log(`${tests} checks passed.`);
} finally {
  child.kill();
  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(resolve, 3000);
  });
  await rm(dataDir, { recursive: true, force: true });
}
