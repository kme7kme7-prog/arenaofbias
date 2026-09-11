// 管理后台校验（决策 040 后台第一期）：
// 服务端部分起真实 server + 临时 SQLite，覆盖——
//   ① users.role 列迁移与 ADMIN_OWNER 首位管理员标记；
//   ② /api/admin/* 门禁：未登录 401、普通用户 404（不泄露后台存在）、管理员放行；
//   ③ 访客统计：页面访问被记录、/api/admin/stats 的今日/趋势/累计字段自洽；
//   ④ 数据流水：投票/评论/注册三类的过滤与形态；
//   ⑤ 后台构建产物存在（admin.html 双入口）。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tests = 0;
async function check(name, test) {
  await test();
  tests++;
  console.log(`PASS ${name}`);
}

const dataDir = await mkdtemp(path.join(tmpdir(), 'aob-admin-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(port),
    HOST: '127.0.0.1',
    RATE_LIMIT_PER_MIN: '60',
    ADMIN_OWNER: 'theowner', // 首位管理员标记（启动时应用）
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
let exitCode = -1;
child.on('exit', (code) => {
  exitCode = code ?? -1;
});

for (let attempt = 0; ; attempt++) {
  if (exitCode >= 0) throw new Error(`测试服务端提前退出（code ${exitCode}）`);
  if (attempt > 100) throw new Error('测试服务端未就绪');
  const ok = await fetch(`${base}/api/works`).then(() => true).catch(() => false);
  if (ok) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const robustFetch = async (url, options, tries = 3) => {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (i >= tries - 1 || error?.cause?.code !== 'ECONNRESET') throw error;
    }
  }
};

const register = async (username, password) => {
  const response = await robustFetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: base },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 201, `register ${username}`);
  return response.headers.get('set-cookie').split(';')[0];
};

try {
  // owner 是 ADMIN_OWNER 指定的账号：注册即被标为 admin（启动时已标记用户名）
  const ownerCookie = await register('theowner', 'owner-password-123');
  const userCookie = await register('plainuser', 'plain-user-pass-123');

  await check('管理员标记：ADMIN_OWNER 账号 role=admin，普通账号 role=null', async () => {
    const me = await (await robustFetch(`${base}/api/auth/me`, { headers: { cookie: ownerCookie } })).json();
    assert.equal(me.user.role, 'admin');
    const plain = await (await robustFetch(`${base}/api/auth/me`, { headers: { cookie: userCookie } })).json();
    assert.equal(plain.user.role, null);
  });

  await check('admin 门禁：未登录 401；普通用户 404；管理员 200', async () => {
    const anonymous = await robustFetch(`${base}/api/admin/stats`);
    assert.equal(anonymous.status, 401);
    const forbidden = await robustFetch(`${base}/api/admin/stats`, {
      headers: { cookie: userCookie },
    });
    assert.equal(forbidden.status, 404); // 与未知接口一致，不泄露后台存在
    const allowed = await robustFetch(`${base}/api/admin/stats`, {
      headers: { cookie: ownerCookie },
    });
    assert.equal(allowed.status, 200);
  });

  await check('访客统计：/api/track 上报被记录，stats 字段自洽；跨源 403 拒收', async () => {
    // 前端上报方案（dev 下 vite 发页面，Express 中间件记不到，见 lib/track.ts）
    const track = (path) =>
      robustFetch(`${base}/api/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: base },
        body: JSON.stringify({ path }),
      });
    let response = await track('/#home');
    assert.equal(response.status, 204);
    response = await track('/admin.html');
    assert.equal(response.status, 204);
    response = await track('/#home');
    assert.equal(response.status, 204);
    const stats = await (await robustFetch(`${base}/api/admin/stats`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.ok(stats.today.views >= 3, `today.views = ${stats.today.views}`);
    assert.ok(stats.today.visitors >= 1);
    assert.equal(stats.trend.length, 1);
    assert.equal(stats.trend[0].day, stats.today.day);
    // 跨源上报拒收（不重复计数）
    const crossOrigin = await robustFetch(`${base}/api/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ path: '/#home' }),
    });
    assert.equal(crossOrigin.status, 403);
    const after = await (await robustFetch(`${base}/api/admin/stats`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(after.today.views, stats.today.views);
    // 体检字段形态
    assert.ok(stats.health.memory > 0);
    assert.ok(stats.health.uptime >= 0);
  });

  await check('数据流水：投票/评论/注册三类记录与关键字过滤', async () => {
    // 制造一票（owner 投 002）
    await robustFetch(`${base}/api/votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: ownerCookie },
      body: JSON.stringify({
        id: '44444444-4444-4444-8444-444444444444',
        promptId: '002',
        winnerRid: '002-a',
        winnerMid: 'inkwell',
        loserRid: '002-b',
        loserMid: 'echo',
        mode: 'blind',
      }),
    });
    const votes = await (await robustFetch(`${base}/api/admin/log?kind=votes`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(votes.rows.length, 1);
    assert.equal(votes.rows[0].username, 'theowner');
    assert.equal(votes.rows[0].winnerMid, 'inkwell');
    // 关键字过滤：搜不到的词返回空
    const none = await (await robustFetch(`${base}/api/admin/log?kind=votes&q=nonexistent`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(none.rows.length, 0);
    // 命中模型名
    const hit = await (await robustFetch(`${base}/api/admin/log?kind=votes&q=inkwell`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(hit.rows.length, 1);
    // 注册流水
    const users = await (await robustFetch(`${base}/api/admin/log?kind=users`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(users.rows.length, 2);
    assert.equal(users.rows.find((row) => row.username === 'theowner').role, 'admin');
    // 未知类型 400
    const bad = await robustFetch(`${base}/api/admin/log?kind=magic`, {
      headers: { cookie: ownerCookie },
    });
    assert.equal(bad.status, 400);
  });

  await check('dev 登录即管理员；清票接口仅 dev 可用且清后可重投', async () => {
    // dev 免登录（测试环境是回环）
    const devLogin = await robustFetch(`${base}/api/auth/dev`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base },
      body: '{}',
    });
    assert.equal(devLogin.status, 201);
    const devCookie = devLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await devLogin.json()).user.role, 'admin');
    // dev 投一票
    const devVote = await robustFetch(`${base}/api/votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: devCookie },
      body: JSON.stringify({
        id: '66666666-6666-4666-8666-666666666666',
        promptId: '003',
        winnerRid: '003-a',
        winnerMid: 'polyline',
        loserRid: '003-b',
        loserMid: 'starmap',
        mode: 'blind',
      }),
    });
    assert.equal(devVote.status, 201);
    // 普通用户不能清别人的票（仅 dev 账号）
    const forbidden = await robustFetch(`${base}/api/dev/clear-my-votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: userCookie },
      body: '{}',
    });
    assert.equal(forbidden.status, 403);
    // dev 清自己的票
    const cleared = await robustFetch(`${base}/api/dev/clear-my-votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: devCookie },
      body: '{}',
    });
    assert.equal(cleared.status, 200);
    const { cleared: n } = await cleared.json();
    assert.ok(n >= 1, `cleared = ${n}`);
    // 清后重投成功（对局去重已解除）
    const revote = await robustFetch(`${base}/api/votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: devCookie },
      body: JSON.stringify({
        id: '77777777-7777-4777-8777-777777777777',
        promptId: '003',
        winnerRid: '003-a',
        winnerMid: 'polyline',
        loserRid: '003-b',
        loserMid: 'starmap',
        mode: 'blind',
      }),
    });
    assert.equal(revote.status, 201);
    // owner 的票不受影响
    const all = await (await robustFetch(`${base}/api/votes`)).json();
    assert.ok(all.votes.some((vote) => vote.winnerMid === 'inkwell'));
  });

  await check('评论流水：写一条评论后可按内容搜到', async () => {
    await robustFetch(`${base}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: userCookie },
      body: JSON.stringify({
        id: '55555555-5555-4555-8555-555555555555',
        roundId: '002',
        side: 'a',
        body: '占位评论：这篇小说的结尾很妙。',
      }),
    });
    const rows = await (await robustFetch(`${base}/api/admin/log?kind=comments&q=结尾`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].username, 'plainuser');
  });

  await check('双入口构建产物：dist/admin.html 存在', async () => {
    const info = await stat(new URL('../dist/admin.html', import.meta.url));
    assert.ok(info.size > 0);
  });
} finally {
  child.kill();
  await new Promise((resolve) => {
    child.on('exit', resolve);
    setTimeout(resolve, 3000);
  });
  await rm(dataDir, { recursive: true, force: true });
}
console.log(`${tests} admin checks passed.`);
