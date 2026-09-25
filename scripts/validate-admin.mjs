// 管理后台校验（决策 040 后台第一期）：
// 服务端部分起真实 server + 临时 SQLite，覆盖——
//   ① users.role 列迁移与 ADMIN_OWNER 首位管理员标记；
//   ② /api/admin/* 门禁：未登录 401、普通用户 404（不泄露后台存在）、管理员放行；
//   ③ 访客统计：页面访问被记录、/api/admin/stats 的今日/趋势/累计字段自洽；
//   ④ 数据流水：投票/评论/注册三类的过滤与形态；
//   ⑤ 后台构建产物存在（admin.html 双入口）；
//   ⑥ 作品管理（决策 044）：全量清单/筛选、编辑与发布开关（含下架后投票核对收紧）；
//   ⑦ 收件箱（决策 044）：清单建议、单文件与文件夹登记、同模型让位、路径穿越防护；
//     改版（2026-09-25）：模型清单接口、页面直传（重名 409/覆盖）、文字作品登记
//    （一文件一作品、空行分段、源文件删除）、预览路由、modelId 复用规范显示名；
//   ⑧ 题目管理（决策 045）：门禁、新增自动编号 009、编辑文案、上下架即公开清单增减、
//     评论白名单认题目表（草稿拒写、上架放行）。
//   ⑨ 用户管理（2026-09-25）：清单计数/搜索、授权撤权+自操作防呆、重置密码
//    （新密码可登录/旧会话失效）、强制下线、删账号保流水（作者变匿名）。
//   ⑩ 模一把记名+用户动态（2026-09-25）：登录上报记 user_id/游客匿名、log guess
//    页签、activity 汇总（胜率/平均步数/答案显示名）与门禁。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
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
    // 注册必填邮箱+验证码（2026-09-24）：MAIL_DEV_LOG 把验证码打进日志，
    // 这里按行捕获解析，不真发信；限流阈值放宽避免误伤套件
    MAIL_DEV_LOG: '1',
    MAIL_COOLDOWN_MS: '1',
    MAIL_IP_MAX: '1000',
    MAIL_EMAIL_MAX: '1000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let exitCode = -1;
child.on('exit', (code) => {
  exitCode = code ?? -1;
});
// 服务器日志按行转发到控制台，同时解析 MAIL_DEV_LOG 验证码行供注册用
const codeLines = [];
let pendingLog = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  pendingLog += chunk;
  const parts = pendingLog.split('\n');
  pendingLog = parts.pop();
  codeLines.push(...parts);
});
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => process.stderr.write(chunk));
const waitForCode = async (purpose, target) => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const line = codeLines.find(
      (item) =>
        item.includes(`purpose=${purpose}`) &&
        item.includes(`email=${target}`) &&
        item.includes('code='),
    );
    if (line) return line.match(/code=(\d{6})/)[1];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`未捕获到 ${purpose} ${target} 的验证码`);
};

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
  const email = `${username}@aob.test`;
  const sent = await robustFetch(`${base}/api/auth/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: base },
    body: JSON.stringify({ purpose: 'register', email }),
  });
  assert.equal(sent.status, 200, `send code ${username}`);
  const code = await waitForCode('register', email);
  const response = await robustFetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: base },
    body: JSON.stringify({ username, password, email, code }),
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
    // 分页：total 反映过滤后总数；offset 跳过行，超页返回空但 total 不变
    assert.equal(votes.total, 1);
    assert.equal(users.total, 2);
    assert.equal(none.total, 0);
    const pageTwo = await (await robustFetch(`${base}/api/admin/log?kind=users&limit=1&offset=1`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(pageTwo.rows.length, 1);
    assert.equal(pageTwo.total, 2);
    const pageBeyond = await (await robustFetch(`${base}/api/admin/log?kind=users&limit=50&offset=50`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(pageBeyond.rows.length, 0);
    assert.equal(pageBeyond.total, 2);
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

  await check('作品管理：门禁、全量清单（含草稿）、筛选与搜索', async () => {
    const anonymous = await robustFetch(`${base}/api/admin/works`);
    assert.equal(anonymous.status, 401);
    const forbidden = await robustFetch(`${base}/api/admin/works`, {
      headers: { cookie: userCookie },
    });
    assert.equal(forbidden.status, 404);
    const list = await (await robustFetch(`${base}/api/admin/works`, {
      headers: { cookie: ownerCookie },
    })).json();
    // 种子 5 件：001-sample、002-a/b、003-a/b，全部已发布
    assert.equal(list.total, 5, `total = ${list.total}`);
    assert.equal(list.works.length, 5);
    for (const work of list.works) {
      assert.ok(work.id && work.promptId && work.modelId && work.modelName);
      assert.equal(work.published, true);
    }
    // html 类种子作品带预览地址
    assert.ok(list.works.some((work) => work.src?.startsWith('/works/')));
    // 未知题号筛选 400
    assert.equal(
      (await robustFetch(`${base}/api/admin/works?prompt=999`, { headers: { cookie: ownerCookie } })).status,
      400,
    );
    // 题号筛选
    const only001 = await (await robustFetch(`${base}/api/admin/works?prompt=001`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(only001.total, 1);
    assert.equal(only001.works[0].promptId, '001');
    // 草稿筛选（种子全为已发布 → 空）
    const drafts = await (await robustFetch(`${base}/api/admin/works?status=draft`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(drafts.total, 0);
    // 关键字命中模型（002-a 的 Inkwell；002-b 是 Echo）
    const hit = await (await robustFetch(`${base}/api/admin/works?q=inkwell`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(hit.total, 1);
    assert.equal(hit.works[0].id, '002-a');
  });

  await check('作品编辑与发布开关：下架即从 /api/works 消失，投票核对同步收紧', async () => {
    const patch = (body, extra = {}) =>
      robustFetch(`${base}/api/admin/works/002-a`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', origin: base, cookie: ownerCookie, ...extra.headers },
        body: JSON.stringify(body),
      });
    // 非管理员 404 / 未带来源 403 / 非 JSON 415
    assert.equal(
      (await robustFetch(`${base}/api/admin/works/002-a`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: userCookie },
        body: JSON.stringify({ published: false }),
      })).status,
      404,
    );
    assert.equal(
      (await patch({ published: false }, { headers: { origin: 'https://evil.example' } })).status,
      403,
    );
    assert.equal(
      (await robustFetch(`${base}/api/admin/works/002-a`, {
        method: 'PATCH',
        headers: { origin: base, cookie: ownerCookie },
        body: JSON.stringify({ published: false }),
      })).status,
      415,
    );
    // 空改动 400、非法值 400、未知作品 404
    assert.equal((await patch({})).status, 400);
    assert.equal((await patch({ published: 'yes' })).status, 400);
    assert.equal(
      (await robustFetch(`${base}/api/admin/works/no-such-work`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', origin: base, cookie: ownerCookie },
        body: JSON.stringify({ published: false }),
      })).status,
      404,
    );
    // 下架 → 公开清单不再吐它；B2 票面核对（published）同步拒绝对它的票
    let response = await patch({ published: false });
    assert.equal(response.status, 200);
    let work = (await response.json()).work;
    assert.equal(work.published, false);
    let publicWorks = await (await robustFetch(`${base}/api/works`)).json();
    assert.ok(!publicWorks.works.some((item) => item.id === '002-a'));
    const blockedVote = await robustFetch(`${base}/api/votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: userCookie },
      body: JSON.stringify({
        id: '88888888-8888-4888-8888-888888888888',
        promptId: '002',
        winnerRid: '002-a',
        winnerMid: 'inkwell',
        loserRid: '002-b',
        loserMid: 'echo',
        mode: 'blind',
      }),
    });
    assert.equal(blockedVote.status, 400);
    // 重新发布 → 回到公开清单
    response = await patch({ published: true });
    assert.equal(response.status, 200);
    publicWorks = await (await robustFetch(`${base}/api/works`)).json();
    assert.ok(publicWorks.works.some((item) => item.id === '002-a'));
    // 标题/模型名可改；model_id 不随显示名变（榜单归组键）
    response = await patch({ title: '  改后的标题  ', modelName: 'Inkwell 2.0' });
    work = (await response.json()).work;
    assert.equal(work.title, '改后的标题');
    assert.equal(work.modelName, 'Inkwell 2.0');
    assert.equal(work.modelId, 'inkwell');
  });

  await check('收件箱：门禁、清单建议、单文件与文件夹登记、路径穿越防护', async () => {
    const inbox = path.join(dataDir, 'inbox');
    await writeFile(path.join(inbox, '测试作品，test-model.html'), '<html>test</html>');
    await writeFile(path.join(inbox, '另一个，test-model.html'), '<html>test-2</html>');
    await writeFile(path.join(inbox, 'junk.csv'), 'not a work');
    await mkdir(path.join(inbox, 'dirwork', 'assets'), { recursive: true });
    await writeFile(
      path.join(inbox, 'dirwork', 'index.html'),
      '<html><link rel="stylesheet" href="./assets/style.css">dir work</html>',
    );
    await writeFile(path.join(inbox, 'dirwork', 'assets', 'style.css'), 'body{}');

    // 门禁
    assert.equal((await robustFetch(`${base}/api/admin/inbox`)).status, 401);
    assert.equal(
      (await robustFetch(`${base}/api/admin/inbox`, { headers: { cookie: userCookie } })).status,
      404,
    );

    // 清单：建议字段与可登记性
    const list = await (await robustFetch(`${base}/api/admin/inbox`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(list.entries.length, 4);
    const file = list.entries.find((entry) => entry.name === '测试作品，test-model.html');
    assert.equal(file.registerable, true);
    assert.equal(file.suggest.title, '测试作品');
    assert.equal(file.suggest.model, 'test-model');
    const dir = list.entries.find((entry) => entry.name === 'dirwork');
    assert.equal(dir.registerable, true); // 目录含 index.html
    const junk = list.entries.find((entry) => entry.name === 'junk.csv');
    assert.equal(junk.registerable, false);

    // 单文件登记（发布）→ 文件搬走、可直访、出现在公开清单
    const register = (body) =>
      robustFetch(`${base}/api/admin/inbox/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: base, cookie: ownerCookie },
        body: JSON.stringify(body),
      });
    let response = await register({
      name: '测试作品，test-model.html',
      promptId: '001',
      modelName: 'test-model',
      publish: true,
    });
    assert.equal(response.status, 201);
    let work = (await response.json()).work;
    assert.equal(work.id, '001-test-model');
    assert.equal(work.src, '/works/001/001-test-model.html');
    assert.equal(work.published, true);
    assert.equal((await robustFetch(`${base}/works/001/001-test-model.html`)).status, 200);
    let publicWorks = await (await robustFetch(`${base}/api/works`)).json();
    assert.ok(publicWorks.works.some((item) => item.id === '001-test-model'));

    // Calibration is persisted metadata; public rendering consumes it unchanged.
    const calibration = { width: 1280, height: 1200, zoom: 1.25, offsetX: .1, offsetY: -.15 };
    const patchFrame = (framing, cookie = ownerCookie) => robustFetch(`${base}/api/admin/works/001-test-model`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', origin: base, cookie },
      body: JSON.stringify({ framing }),
    });
    assert.equal((await patchFrame(calibration, userCookie)).status, 404);
    for (const bad of [{ ...calibration, height: 0 }, { ...calibration, zoom: 9 }, { ...calibration, offsetX: 2 }, { ...calibration, width: '1280' }, { ...calibration, surprise: 1 }])
      assert.equal((await patchFrame(bad)).status, 400);
    const sourceBefore = await (await robustFetch(`${base}${work.src}`)).text();
    const savedFrame = await patchFrame(calibration);
    assert.equal(savedFrame.status, 200);
    assert.deepEqual((await savedFrame.json()).work.content.framing, calibration);
    publicWorks = await (await robustFetch(`${base}/api/works`)).json();
    assert.deepEqual(JSON.parse(publicWorks.works.find(item => item.id === '001-test-model').content).framing, calibration);
    assert.equal(await (await robustFetch(`${base}${work.src}`)).text(), sourceBefore, 'source HTML is untouched');
    assert.equal((await patchFrame(null)).status, 200);
    publicWorks = await (await robustFetch(`${base}/api/works`)).json();
    assert.equal(JSON.parse(publicWorks.works.find(item => item.id === '001-test-model').content).framing, undefined);
    console.log('PASS calibration: admin-only, numeric bounds, persisted public metadata, reset, unchanged HTML');

    // 同模型第二件自动让位 -2（modelName 必填——UI 表单会带出建议值）
    response = await register({
      name: '另一个，test-model.html',
      promptId: '001',
      modelName: 'test-model',
      publish: false,
    });
    assert.equal(response.status, 201);
    work = (await response.json()).work;
    assert.equal(work.id, '001-test-model-2');
    assert.equal(work.published, false);
    publicWorks = await (await robustFetch(`${base}/api/works`)).json();
    assert.ok(!publicWorks.works.some((item) => item.id === '001-test-model-2'));

    // 文件夹登记为草稿 → index.html 与资产可经 /works 访问
    response = await register({ name: 'dirwork', promptId: '005', modelName: 'web-model' });
    assert.equal(response.status, 201);
    work = (await response.json()).work;
    assert.equal(work.id, '005-web-model');
    assert.equal(work.src, '/works/005/005-web-model/index.html');
    assert.equal((await robustFetch(`${base}/works/005/005-web-model/index.html`)).status, 200);
    assert.equal((await robustFetch(`${base}/works/005/005-web-model/assets/style.css`)).status, 200);

    // 登记校验：未知题号 / 缺模型名 / 路径穿越（登记与删除两条路）
    assert.equal((await register({ name: 'junk.csv', promptId: '999', modelName: 'x' })).status, 400);
    assert.equal((await register({ name: 'junk.csv', promptId: '001' })).status, 400);
    assert.equal((await register({ name: '../evil.html', promptId: '001', modelName: 'x' })).status, 400);
    assert.equal(
      (await robustFetch(`${base}/api/admin/inbox?name=../secret`, {
        method: 'DELETE',
        headers: { origin: base, cookie: ownerCookie },
      })).status,
      400,
    );

    // 清理 junk.csv → 收件箱已空
    const removed = await robustFetch(`${base}/api/admin/inbox?name=${encodeURIComponent('junk.csv')}`, {
      method: 'DELETE',
      headers: { origin: base, cookie: ownerCookie },
    });
    assert.equal(removed.status, 204);
    const finalList = await (await robustFetch(`${base}/api/admin/inbox`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(finalList.entries.length, 0);
  });

  await check('收件箱改版：模型清单、页面直传、文字登记、预览路由、modelId 复用', async () => {
    const inbox = path.join(dataDir, 'inbox');

    // 模型清单：门禁 + 种子模型（此前各用例已登记 test-model/web-model 等）
    assert.equal((await robustFetch(`${base}/api/admin/models`)).status, 401);
    assert.equal(
      (await robustFetch(`${base}/api/admin/models`, { headers: { cookie: userCookie } })).status,
      404,
    );
    const models = await (await robustFetch(`${base}/api/admin/models`, {
      headers: { cookie: ownerCookie },
    })).json();
    const testModel = models.models.find((m) => m.modelId === 'test-model');
    assert.ok(testModel, '模型清单含 test-model');
    assert.equal(testModel.works, 2); // 001-test-model 与 001-test-model-2

    // 页面直传：门禁 / 扩展名 / 重名 409 / overwrite 放行
    const upload = (name, body, extra = '') =>
      robustFetch(`${base}/api/admin/inbox/upload?name=${encodeURIComponent(name)}${extra}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', origin: base, cookie: ownerCookie },
        body,
      });
    assert.equal(
      (await robustFetch(`${base}/api/admin/inbox/upload?name=x.txt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', origin: base },
        body: 'hi',
      })).status,
      401,
    );
    assert.equal((await upload('evil.exe', 'MZ')).status, 400);
    assert.equal((await upload('../escape.txt', 'x')).status, 400);
    assert.equal((await upload('深夜回复，glm-5.3.txt', '第一段。\n\n第二段。\n\n第三段。')).status, 201);
    assert.equal((await upload('深夜回复，glm-5.3.txt', '覆盖内容')).status, 409);
    assert.equal((await upload('深夜回复，glm-5.3.txt', '第一段。\n\n第二段。', '&overwrite=1')).status, 201);

    // 清单：文字条目可登记、带段数与摘录；网页条目 kind=html
    const list = await (await robustFetch(`${base}/api/admin/inbox`, {
      headers: { cookie: ownerCookie },
    })).json();
    const txt = list.entries.find((entry) => entry.name === '深夜回复，glm-5.3.txt');
    assert.equal(txt.kind, 'text');
    assert.equal(txt.registerable, true);
    assert.equal(txt.paragraphs, 2);
    assert.ok(txt.excerpt.includes('第一段'));
    assert.equal(txt.suggest.model, 'glm-5.3');

    // 预览路由：门禁 / 纯文本吐正文 / 穿越 400 / 不支持的扩展名 404
    const preview = (name, cookie) =>
      robustFetch(`${base}/api/admin/inbox/file?name=${encodeURIComponent(name)}`, {
        headers: cookie ? { cookie } : {},
      });
    assert.equal((await preview('深夜回复，glm-5.3.txt')).status, 401);
    const shown = await preview('深夜回复，glm-5.3.txt', ownerCookie);
    assert.equal(shown.status, 200);
    assert.ok((shown.headers.get('content-type') || '').includes('text/plain'));
    assert.ok((await shown.text()).includes('第二段'));
    assert.equal((await preview('../secret.txt', ownerCookie)).status, 400);

    const register = (body) =>
      robustFetch(`${base}/api/admin/inbox/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: base, cookie: ownerCookie },
        body: JSON.stringify(body),
      });

    // 文字登记：一文件一作品、空行分段、content 为 text 形态、源文件已删
    let response = await register({
      name: '深夜回复，glm-5.3.txt',
      promptId: '008',
      modelName: 'GLM-5.3',
      publish: true,
    });
    assert.equal(response.status, 201);
    let work = (await response.json()).work;
    assert.equal(work.id, '008-glm-5.3');
    assert.equal(work.content.kind, 'text');
    assert.deepEqual(work.content.story.paragraphs, ['第一段。', '第二段。']);
    assert.equal(work.src, null); // 文字作品无预览文件
    await stat(path.join(inbox, '深夜回复，glm-5.3.txt')).then(
      () => { throw new Error('源文件没被删掉'); },
      () => {},
    );
    // 公开清单原样带出 text content
    const publicWorks = await (await robustFetch(`${base}/api/works`)).json();
    const publicText = publicWorks.works.find((item) => item.id === '008-glm-5.3');
    assert.equal(JSON.parse(publicText.content).kind, 'text');

    // modelId 复用：传现有 modelId 时沿用规范显示名（忽略表单里的大小写差异）
    await writeFile(path.join(inbox, '其二，glm-5.3.txt'), '另一件正文。');
    response = await register({
      name: '其二，glm-5.3.txt',
      promptId: '008',
      modelName: 'GLM-5.3', // 表单显示名与库内一致；modelId 决定身份
      modelId: 'glm-5.3',
    });
    assert.equal(response.status, 201);
    work = (await response.json()).work;
    assert.equal(work.id, '008-glm-5.3-2');
    assert.equal(work.modelName, 'GLM-5.3'); //  canonical 显示名
    // 未知 modelId 拒收（文件得真实存在，否则先撞 404）
    await writeFile(path.join(inbox, 'x.txt'), '正文。');
    assert.equal(
      (await register({ name: 'x.txt', promptId: '008', modelName: 'x', modelId: 'no-such-model' })).status,
      400,
    );
    // 顺手覆盖中文名删除：x.txt 之外的残留走 DELETE 路由清掉
    assert.equal(
      (await robustFetch(`${base}/api/admin/inbox?name=${encodeURIComponent('x.txt')}`, {
        method: 'DELETE',
        headers: { origin: base, cookie: ownerCookie },
      })).status,
      204,
    );
    // 中文名文件夹删除（removeEntry 递归路径回归：rmSync 在本机对非 ASCII 静默失败）
    await mkdir(path.join(inbox, '中文目录', 'sub'), { recursive: true });
    await writeFile(path.join(inbox, '中文目录', 'sub', '内部文件.txt'), 'x');
    assert.equal(
      (await robustFetch(`${base}/api/admin/inbox?name=${encodeURIComponent('中文目录')}`, {
        method: 'DELETE',
        headers: { origin: base, cookie: ownerCookie },
      })).status,
      204,
    );
    await stat(path.join(inbox, '中文目录')).then(
      () => { throw new Error('中文目录没被删掉'); },
      () => {},
    );

    // 空文字文件拒收
    await writeFile(path.join(inbox, 'empty.txt'), '   \n\n  ');
    assert.equal(
      (await register({ name: 'empty.txt', promptId: '008', modelName: 'x' })).status,
      400,
    );
    // 登记后预览路由 404（文件已搬走/删掉）
    assert.equal((await preview('其二，glm-5.3.txt', ownerCookie)).status, 404);
  });

  await check('题目管理：门禁、新增自动编号、编辑与上下架（下架=公开清单隐藏，白名单认表）', async () => {
    // 门禁
    assert.equal((await robustFetch(`${base}/api/admin/prompts`)).status, 401);
    assert.equal(
      (await robustFetch(`${base}/api/admin/prompts`, { headers: { cookie: userCookie } })).status,
      404,
    );
    // 公开题目接口：迁移播种的 8 道内置题
    const publicSeeds = await (await robustFetch(`${base}/api/prompts`)).json();
    assert.equal(publicSeeds.prompts.length, 8);

    // 新增：跨源 403 / 非 JSON 415 / 非法 kind 400 / 缺名称 400
    const create = (body, headers = {}) =>
      robustFetch(`${base}/api/admin/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: base, cookie: ownerCookie, ...headers },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await create({ kind: 'text', name: 'x', prompt: 'y' }, { origin: 'https://evil.example' })).status,
      403,
    );
    assert.equal(
      (await robustFetch(`${base}/api/admin/prompts`, {
        method: 'POST',
        headers: { origin: base, cookie: ownerCookie },
        body: JSON.stringify({ kind: 'text' }),
      })).status,
      415,
    );
    assert.equal((await create({ kind: 'video', name: 'x', prompt: 'y' })).status, 400);
    assert.equal((await create({ kind: 'text', prompt: 'y' })).status, 400);

    // 正常新增（草稿）：自动编号 009；公开清单不见；草稿题评论拒写、可读（空列表）
    const created = await create({
      kind: 'text',
      name: '冒泡题目',
      prompt: '冒泡提示词全文',
      category: '测试',
      code: 'T',
      commentary: '一句话',
      detail: '同一测试',
    });
    assert.equal(created.status, 201);
    const draft = (await created.json()).prompt;
    assert.equal(draft.id, '009');
    assert.equal(draft.published, false);
    assert.equal(draft.worksCount, 0);
    assert.equal(draft.voteCount, 0);
    let publicNow = await (await robustFetch(`${base}/api/prompts`)).json();
    assert.ok(!publicNow.prompts.some((item) => item.id === '009'));
    const adminList = await (await robustFetch(`${base}/api/admin/prompts`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(adminList.prompts.length, 9);
    const commentDraft = await robustFetch(`${base}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: userCookie },
      body: JSON.stringify({ id: '99999999-9999-4999-8999-999999999999', roundId: '009', side: 'a', body: '太早了' }),
    });
    assert.equal(commentDraft.status, 400); // 白名单认题目表：草稿题拒评论
    assert.equal((await robustFetch(`${base}/api/comments?round=008`)).status, 200);

    // 编辑：非法值 400 / 空改动 400 / 未知题 404；改文案 + 上架 → 公开清单出现
    const patch = (body) =>
      robustFetch(`${base}/api/admin/prompts/009`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', origin: base, cookie: ownerCookie },
        body: JSON.stringify(body),
      });
    assert.equal((await patch({ published: 'yes' })).status, 400);
    assert.equal((await patch({})).status, 400);
    assert.equal(
      (await robustFetch(`${base}/api/admin/prompts/999`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', origin: base, cookie: ownerCookie },
        body: JSON.stringify({ name: 'x' }),
      })).status,
      404,
    );
    let response = await patch({ name: '冒泡题目·改', published: true });
    assert.equal(response.status, 200);
    const saved = (await response.json()).prompt;
    assert.equal(saved.name, '冒泡题目·改');
    assert.equal(saved.published, true);
    publicNow = await (await robustFetch(`${base}/api/prompts`)).json();
    const live = publicNow.prompts.find((item) => item.id === '009');
    assert.ok(live && live.name === '冒泡题目·改');
    // 上架后评论可写（白名单已随题目表放行）
    const commentOk = await robustFetch(`${base}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: userCookie },
      body: JSON.stringify({ id: '99999999-9999-4999-8999-999999999998', roundId: '009', side: 'a', body: '上架后可以讨论了' }),
    });
    assert.equal(commentOk.status, 201);

    // 六维权重（决策 093）：非法形 400 / 合计≠1 400；合法值保存后经公开清单带出
    assert.equal((await patch({ weights: [1, 1, 1, 1, 1, 1] })).status, 400);
    assert.equal((await patch({ weights: 'half' })).status, 400);
    response = await patch({ weights: [0.5, 0.5, 0, 0, 0, 0] });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).prompt.weights, [0.5, 0.5, 0, 0, 0, 0]);
    publicNow = await (await robustFetch(`${base}/api/prompts`)).json();
    assert.deepEqual(
      publicNow.prompts.find((item) => item.id === '009')?.weights,
      [0.5, 0.5, 0, 0, 0, 0],
    );
    // 种子题经迁移 007 回填，公开行自带合法权重
    const seedRow = publicNow.prompts.find((item) => item.id === '001');
    assert.equal(seedRow?.weights?.length, 6);
    // weights:null = 清空回「未配置」（前台六维均分兜底），公开行不再带该字段
    response = await patch({ weights: null });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).prompt.weights, undefined);
    publicNow = await (await robustFetch(`${base}/api/prompts`)).json();
    assert.equal(
      publicNow.prompts.find((item) => item.id === '009')?.weights,
      undefined,
    );

    // 下架 → 公开清单立即隐藏（下架 = 前台完全隐藏）
    response = await patch({ published: false });
    assert.equal(response.status, 200);
    publicNow = await (await robustFetch(`${base}/api/prompts`)).json();
    assert.ok(!publicNow.prompts.some((item) => item.id === '009'));

    // 请求体上限回归：提示词允许 8000 字（UTF-8 下超全局 4kb 上限），
    // /api/admin 的请求体须单独放宽，长题保存不得 413
    const longPrompt = '长'.repeat(6000);
    const longCreated = await create({ kind: 'text', name: '长文题目', prompt: longPrompt });
    assert.equal(longCreated.status, 201);
    assert.equal((await longCreated.json()).prompt.prompt.length, 6000);
  });

  await check('用户管理：门禁、清单计数/搜索、授权撤权+自操作防呆、重置密码、强制下线、删账号保流水', async () => {
    // 门禁
    assert.equal((await robustFetch(`${base}/api/admin/users`)).status, 401);
    assert.equal(
      (await robustFetch(`${base}/api/admin/users`, { headers: { cookie: userCookie } })).status,
      404,
    );

    // 清单：字段与计数（plainuser 有 1 评论 0 票；dev/theowner 是管理员）
    const list = await (await robustFetch(`${base}/api/admin/users`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.ok(list.total >= 3, `total = ${list.total}`);
    const plain = list.users.find((u) => u.username === 'plainuser');
    assert.ok(plain, '清单含 plainuser');
    assert.equal(plain.role, null);
    assert.equal(plain.email, 'plainuser@aob.test');
    assert.equal(plain.emailVerified, true);
    assert.ok(plain.comments >= 1, `comments = ${plain.comments}`); // 前面用例已发过评论
    const devRow = list.users.find((u) => u.username === 'dev');
    assert.equal(devRow.role, 'admin'); // dev 登录即管理员
    // 搜索
    const hit = await (await robustFetch(`${base}/api/admin/users?q=plainuser`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(hit.total, 1);
    assert.equal(hit.users[0].username, 'plainuser');
    const none = await (await robustFetch(`${base}/api/admin/users?q=no-such-user`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(none.total, 0);

    // 授权/撤权：普通用户 ↔ 管理员往返
    const patch = (id, body, cookie = ownerCookie) =>
      robustFetch(`${base}/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', origin: base, cookie },
        body: JSON.stringify(body),
      });
    let response = await patch(plain.id, { role: 'admin' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.role, 'admin');
    response = await patch(plain.id, { role: null });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.role, null);
    // 非法值 400 / 未知用户 404 / 自操作防呆 400 / 跨源 403 / 非 JSON 415
    assert.equal((await patch(plain.id, { role: 'superadmin' })).status, 400);
    assert.equal((await patch(plain.id, {})).status, 400);
    assert.equal(
      (await patch('00000000-0000-4000-8000-000000000000', { role: null })).status,
      404,
    );
    // 非管理员操作 404（requireAdmin 门禁）
    assert.equal((await patch(plain.id, { role: null }, userCookie)).status, 404);
    const me = await (await robustFetch(`${base}/api/auth/me`, { headers: { cookie: ownerCookie } })).json();
    assert.equal((await patch(me.user.id, { role: null })).status, 400);
    assert.equal(
      (await robustFetch(`${base}/api/admin/users/${plain.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', origin: 'https://evil.example', cookie: ownerCookie },
        body: JSON.stringify({ role: null }),
      })).status,
      403,
    );
    assert.equal(
      (await robustFetch(`${base}/api/admin/users/${plain.id}`, {
        method: 'PATCH',
        headers: { origin: base, cookie: ownerCookie },
        body: JSON.stringify({ role: null }),
      })).status,
      415,
    );

    // 重置密码：临时账号注册 → 投一票 → 重置 → 新密码可登录、旧会话失效
    const tempCookie = await register('resetme', 'resetme-password-123');
    const voteResponse = await robustFetch(`${base}/api/votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: tempCookie },
      body: JSON.stringify({
        id: 'aaaaaaa1-0000-4000-8000-000000000001',
        promptId: '002',
        winnerRid: '002-a',
        winnerMid: 'inkwell',
        loserRid: '002-b',
        loserMid: 'echo',
        mode: 'blind',
      }),
    });
    assert.equal(voteResponse.status, 201);
    const tempRow = (await (await robustFetch(`${base}/api/admin/users?q=resetme`, {
      headers: { cookie: ownerCookie },
    })).json()).users[0];
    response = await robustFetch(`${base}/api/admin/users/${tempRow.id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: ownerCookie },
      body: '{}',
    });
    assert.equal(response.status, 200);
    const { password: fresh } = await response.json();
    assert.ok(fresh.length >= 12);
    // 旧会话已被清掉
    assert.equal(
      (await (await robustFetch(`${base}/api/auth/me`, { headers: { cookie: tempCookie } })).json()).user,
      null,
    );
    // 新密码能登录
    const relogin = await robustFetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base },
      body: JSON.stringify({ username: 'resetme', password: fresh }),
    });
    assert.equal(relogin.status, 200);
    const reloginCookie = relogin.headers.get('set-cookie').split(';')[0];

    // 强制下线：清掉刚登录的会话
    assert.equal(
      (await robustFetch(`${base}/api/admin/users/${tempRow.id}/force-offline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: base, cookie: ownerCookie },
        body: '{}',
      })).status,
      200,
    );
    assert.equal(
      (await (await robustFetch(`${base}/api/auth/me`, { headers: { cookie: reloginCookie } })).json()).user,
      null,
    );

    // 删账号：清单消失、会话清空、票保留但作者变匿名
    assert.equal(
      (await robustFetch(`${base}/api/admin/users/${tempRow.id}`, {
        method: 'DELETE',
        headers: { origin: base, cookie: ownerCookie },
      })).status,
      204,
    );
    assert.equal(
      (await (await robustFetch(`${base}/api/admin/users?q=resetme`, {
        headers: { cookie: ownerCookie },
      })).json()).total,
      0,
    );
    const votesAfter = await (await robustFetch(`${base}/api/admin/log?kind=votes&q=inkwell`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.ok(votesAfter.total >= 2, `votes total = ${votesAfter.total}`);
    assert.ok(
      votesAfter.rows.some((row) => row.username === null && row.winnerMid === 'inkwell'),
      '被删账号的票应保留且作者为匿名',
    );
  });

  await check('模一把记名+用户动态：登录记 user_id、游客匿名、log 四类页签、activity 汇总', async () => {
    // 门禁
    assert.equal((await robustFetch(`${base}/api/admin/users`)).status, 401);

    // 上报两局：owner 登录记名、匿名一局（body 只带 won/attempts，日期服务端派生）
    const report = (cookie) =>
      robustFetch(`${base}/api/guess/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ won: true, attempts: 3 }),
      });
    assert.equal((await report(ownerCookie)).status, 204);
    assert.equal((await report(null)).status, 204);
    assert.equal((await report(null)).status, 204);

    // 数据流水 guess 页签：记名行带用户名，匿名行玩家为空
    const guessLog = await (await robustFetch(`${base}/api/admin/log?kind=guess`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(guessLog.total, 3);
    assert.ok(guessLog.rows.some((row) => row.username === 'theowner' && row.won === 1));
    assert.equal(guessLog.rows.filter((row) => row.username === null).length, 2);
    const guessHit = await (await robustFetch(`${base}/api/admin/log?kind=guess&q=theowner`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(guessHit.total, 1);
    assert.equal((await robustFetch(`${base}/api/admin/log?kind=guess`, { headers: { cookie: userCookie } })).status, 404);

    // 用户动态：owner 的 activity 汇总（模一把 1 局全胜 + 有投票记录）
    const ownerRow = (await (await robustFetch(`${base}/api/admin/users?q=theowner`, {
      headers: { cookie: ownerCookie },
    })).json()).users[0];
    const activity = await (await robustFetch(`${base}/api/admin/users/${ownerRow.id}/activity`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(activity.user.username, 'theowner');
    assert.equal(activity.guess.played, 1);
    assert.equal(activity.guess.won, 1);
    assert.equal(activity.guess.avgSteps, 3);
    assert.ok(activity.guess.rows[0].answerName, '答案带显示名');
    assert.ok(activity.votes.length >= 1, 'owner 有投票记录');
    // 门禁：匿名 401 / 非管理员 404 / 未知用户 404
    assert.equal((await robustFetch(`${base}/api/admin/users/${ownerRow.id}/activity`)).status, 401);
    assert.equal(
      (await robustFetch(`${base}/api/admin/users/${ownerRow.id}/activity`, { headers: { cookie: userCookie } })).status,
      404,
    );
    assert.equal(
      (await robustFetch(`${base}/api/admin/users/00000000-0000-4000-8000-00000000000x/activity`, {
        headers: { cookie: ownerCookie },
      })).status,
      404,
    );
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
