// 管理后台校验（决策 040 后台第一期）：
// 服务端部分起真实 server + 临时 SQLite，覆盖——
//   ① users.role 列迁移与 ADMIN_OWNER 首位管理员标记；
//   ② /api/admin/* 门禁：未登录 401、普通用户 404（不泄露后台存在）、管理员放行；
//   ③ 访客统计：页面访问被记录、/api/admin/stats 的今日/趋势/累计字段自洽；
//   ④ 数据流水：投票/评论/注册三类的过滤与形态；
//   ⑤ 后台构建产物存在（admin.html 双入口）；
//   ⑥ 作品管理（决策 044）：全量清单/筛选、编辑与发布开关（含下架后投票核对收紧）；
//   ⑦ 收件箱（决策 044）：清单建议、单文件与文件夹登记、同模型让位、路径穿越防护；
//   ⑧ 题目管理（决策 045）：门禁、新增自动编号 008、编辑文案、上下架即公开清单增减、
//     评论白名单认题目表（草稿拒写、上架放行）。
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
    await writeFile(path.join(inbox, 'junk.txt'), 'not a work');
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
    const junk = list.entries.find((entry) => entry.name === 'junk.txt');
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
    assert.equal((await register({ name: 'junk.txt', promptId: '999', modelName: 'x' })).status, 400);
    assert.equal((await register({ name: 'junk.txt', promptId: '001' })).status, 400);
    assert.equal((await register({ name: '../evil.html', promptId: '001', modelName: 'x' })).status, 400);
    assert.equal(
      (await robustFetch(`${base}/api/admin/inbox?name=../secret`, {
        method: 'DELETE',
        headers: { origin: base, cookie: ownerCookie },
      })).status,
      400,
    );

    // 清理 junk.txt → 收件箱已空
    const removed = await robustFetch(`${base}/api/admin/inbox?name=${encodeURIComponent('junk.txt')}`, {
      method: 'DELETE',
      headers: { origin: base, cookie: ownerCookie },
    });
    assert.equal(removed.status, 204);
    const finalList = await (await robustFetch(`${base}/api/admin/inbox`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(finalList.entries.length, 0);
  });

  await check('题目管理：门禁、新增自动编号、编辑与上下架（下架=公开清单隐藏，白名单认表）', async () => {
    // 门禁
    assert.equal((await robustFetch(`${base}/api/admin/prompts`)).status, 401);
    assert.equal(
      (await robustFetch(`${base}/api/admin/prompts`, { headers: { cookie: userCookie } })).status,
      404,
    );
    // 公开题目接口：迁移 003 播种的 7 道内置题
    const publicSeeds = await (await robustFetch(`${base}/api/prompts`)).json();
    assert.equal(publicSeeds.prompts.length, 7);

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

    // 正常新增（草稿）：自动编号 008；公开清单不见；草稿题评论拒写、可读（空列表）
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
    assert.equal(draft.id, '008');
    assert.equal(draft.published, false);
    assert.equal(draft.worksCount, 0);
    assert.equal(draft.voteCount, 0);
    let publicNow = await (await robustFetch(`${base}/api/prompts`)).json();
    assert.ok(!publicNow.prompts.some((item) => item.id === '008'));
    const adminList = await (await robustFetch(`${base}/api/admin/prompts`, {
      headers: { cookie: ownerCookie },
    })).json();
    assert.equal(adminList.prompts.length, 8);
    const commentDraft = await robustFetch(`${base}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: userCookie },
      body: JSON.stringify({ id: '99999999-9999-4999-8999-999999999999', roundId: '008', side: 'a', body: '太早了' }),
    });
    assert.equal(commentDraft.status, 400); // 白名单认题目表：草稿题拒评论
    assert.equal((await robustFetch(`${base}/api/comments?round=008`)).status, 200);

    // 编辑：非法值 400 / 空改动 400 / 未知题 404；改文案 + 上架 → 公开清单出现
    const patch = (body) =>
      robustFetch(`${base}/api/admin/prompts/008`, {
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
    const live = publicNow.prompts.find((item) => item.id === '008');
    assert.ok(live && live.name === '冒泡题目·改');
    // 上架后评论可写（白名单已随题目表放行）
    const commentOk = await robustFetch(`${base}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: base, cookie: userCookie },
      body: JSON.stringify({ id: '99999999-9999-4999-8999-999999999998', roundId: '008', side: 'a', body: '上架后可以讨论了' }),
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
      publicNow.prompts.find((item) => item.id === '008')?.weights,
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
      publicNow.prompts.find((item) => item.id === '008')?.weights,
      undefined,
    );

    // 下架 → 公开清单立即隐藏（下架 = 前台完全隐藏）
    response = await patch({ published: false });
    assert.equal(response.status, 200);
    publicNow = await (await robustFetch(`${base}/api/prompts`)).json();
    assert.ok(!publicNow.prompts.some((item) => item.id === '008'));

    // 请求体上限回归：提示词允许 8000 字（UTF-8 下超全局 4kb 上限），
    // /api/admin 的请求体须单独放宽，长题保存不得 413
    const longPrompt = '长'.repeat(6000);
    const longCreated = await create({ kind: 'text', name: '长文题目', prompt: longPrompt });
    assert.equal(longCreated.status, 201);
    assert.equal((await longCreated.json()).prompt.prompt.length, 6000);
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
