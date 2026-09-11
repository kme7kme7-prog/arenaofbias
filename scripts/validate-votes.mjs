// 投票系统校验：lib/votes.ts 的校验规则、对局去重口径，以及服务端 votes 接口
// 的真实 HTTP 行为（登录门控、409 重复、幂等重试、未登录 401、
// 票面与作品清单核对、同 UUID 跨对局重放拒绝）。
// 做法：lib/arena.ts + lib/votes.ts 转译后拼入同一模块（Node 直跑前端代码），
// 服务端部分在临时目录起真实 SQLite + Express 实例。
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';

// --- localStorage shim（votes 校验只读题库，不触存储；占位投票路径归 placeholder 脚本） ---
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => void store.set(key, String(value)),
  removeItem: (key) => void store.delete(key),
};

const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;

// arena.ts 从 lib/works-roster.json 与 lib/prompts-seed.json 导入清单：
// data URL 模块解析不了相对路径，转译后把清单内联成同名常量注入
const rosterJson = await readFile(
  new URL('../lib/works-roster.json', import.meta.url),
  'utf8',
);
const promptsSeedJson = await readFile(
  new URL('../lib/prompts-seed.json', import.meta.url),
  'utf8',
);
const injectData = (code) =>
  code
    .replace(
      /^import\s+rosterData\s+from\s+['"]\.\/works-roster\.json['"];?\s*$/m,
      `const rosterData = ${rosterJson};`,
    )
    .replace(
      /^import\s+promptsSeed\s+from\s+['"]\.\/prompts-seed\.json['"];?\s*$/m,
      `const promptsSeed = ${promptsSeedJson};`,
    );
const arenaCode = injectData(
  transpile(
    await readFile(new URL('../lib/arena.ts', import.meta.url), 'utf8'),
  ),
);
// lib/prompts.ts 合并进同一模块：去掉对 arena 的导入；
// 其内部 seedPrompts 改绑模块内 arena 的 prompts（arena 已声明 seedPrompts，避免撞名）
const promptsCode = transpile(
  await readFile(new URL('../lib/prompts.ts', import.meta.url), 'utf8'),
)
  .replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]*arena['"];?\s*$/gm, '')
  .replace(/\bseedPrompts\b/g, 'builtinPrompts')
  // 模块级私有名改名（state/started/listeners/emit），避免与拼进同一模块的 works 撞名
  .replace(/\bstate\b/g, 'promptsState')
  .replace(/\bstarted\b/g, 'promptsStarted')
  .replace(/\blisteners\b/g, 'promptsListeners')
  .replace(/\bemit\b/g, 'emitPrompts')
  .replace(/^let promptsState/m, 'const builtinPrompts = prompts;\nlet promptsState');
const votesCode = transpile(
  await readFile(new URL('../lib/votes.ts', import.meta.url), 'utf8'),
).replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]*(arena|prompts)['"];?\s*$/gm, '');

const module = await import(
  `data:text/javascript;base64,${Buffer.from(`${arenaCode}\n${promptsCode}\n${votesCode}`).toString('base64')}`
);
const { validateVote, pairKeyOf, voteToRecord } = module;

let tests = 0;
// 异步检查必须 await 断言跑完后才算 PASS；抛错让脚本以非零码退出
async function check(name, test) {
  await test();
  tests++;
  console.log(`PASS ${name}`);
}

const validVote = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  promptId: '002',
  winnerRid: '002-ph-01',
  winnerMid: 'ph-01',
  loserRid: '002-ph-02',
  loserMid: 'ph-02',
  mode: 'blind',
};

// 服务端用例必须用真实清单里的作品：票面要与 lib/works-roster.json 核对（B2 修复），
// 伪造 rid 一律 400。「同模型换作品可再投」（决策 021）当前清单没有多作品的模型，
// 服务端无法演练，由上方 pairKey 单测覆盖；清单扩容后可在此补服务端用例。
const realVote = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  promptId: '002',
  winnerRid: '002-a',
  winnerMid: 'inkwell',
  loserRid: '002-b',
  loserMid: 'echo',
  mode: 'blind',
};

await check('合法票通过校验，题号白名单拦截未知题', () => {
  assert.deepEqual(validateVote(validVote), validVote);
  assert.equal(validateVote({ ...validVote, promptId: '999' }), null);
});

await check('UUID、胜负同体、未知 mode 全部拦截', () => {
  assert.equal(validateVote({ ...validVote, id: 'not-a-uuid' }), null);
  assert.equal(
    validateVote({ ...validVote, winnerRid: 'x', loserRid: 'x' }),
    null,
  );
  assert.equal(
    validateVote({ ...validVote, winnerMid: 'm', loserMid: 'm' }),
    null,
  );
  assert.equal(validateVote({ ...validVote, mode: 'ranked' }), null);
  assert.equal(validateVote(null), null);
});

await check('pairKey 与胜负、左右顺序无关（同对局同键）', () => {
  assert.equal(
    pairKeyOf('002-ph-01', '002-ph-02'),
    pairKeyOf('002-ph-02', '002-ph-01'),
  );
  assert.notEqual(
    pairKeyOf('002-ph-01', '002-ph-02'),
    pairKeyOf('002-ph-01', '002-ph-03'),
  );
  // 换作品（同模型不同作品）是新的对局
  assert.notEqual(
    pairKeyOf('002-ph-01', '002-ph-02'),
    pairKeyOf('002-ph-01b', '002-ph-02'),
  );
});

await check('voteToRecord 降到模型层（榜单聚合口径）', () => {
  const record = voteToRecord({ ...validVote, ts: 1725900000000 });
  assert.deepEqual(record, {
    promptId: '002',
    winnerId: 'ph-01',
    loserId: 'ph-02',
    ts: 1725900000000,
    // mode 随记录保留，供「只看正式」口径过滤（决策 026）
    mode: 'blind',
  });
});

// ---------------------------------------------------------------------------
// 服务端：子进程起真实 SQLite + Express（随机端口 + 临时数据目录），
// 覆盖登录门控（401）、去重（409）、幂等重试、公开读取
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';

const dataDir = await mkdtemp(path.join(tmpdir(), 'aob-votes-'));
// 随机高位端口：父进程选定后传给 server/index.js（PORT=0 拿不到真实端口）
const port = 20000 + Math.floor(Math.random() * 20000);
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  // 放宽限流：本脚本约 14 次 POST 会超过默认 10 条/分钟的 per-IP 限流
  //（400/401/403 等失败请求同样计数），限流本身不是本脚本的断言对象
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(port),
    HOST: '127.0.0.1',
    RATE_LIMIT_PER_MIN: '60',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
// 端口被占用等启动失败要快速失败，而不是干等 10 秒超时
let exitCode = -1; // -1 = 仍在运行
child.on('exit', (code) => {
  exitCode = code ?? -1;
});

const base = `http://127.0.0.1:${port}`;
// 等服务端就绪（端口可连）
for (let attempt = 0; ; attempt++) {
  if (exitCode >= 0)
    throw new Error(
      `测试服务端提前退出（code ${exitCode}，端口 ${port} 可能被占用）`,
    );
  if (attempt > 100) throw new Error('测试服务端未就绪');
  const ok = await fetch(`${base}/api/votes`)
    .then(() => true)
    .catch(() => false);
  if (ok) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
// 带重试的 fetch：undici 复用被服务端关闭的 keep-alive 连接时偶发 ECONNRESET
const robustFetch = async (url, options, tries = 3) => {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (i >= tries - 1 || error?.cause?.code !== 'ECONNRESET') throw error;
    }
  }
};
const login = async () => {
  const response = await robustFetch(`${base}/api/auth/dev`, {
    method: 'POST',
    // auth 中间件用 req.is() 判 JSON：无 Content-Type 的无 body POST 会被 415
    headers: { 'Content-Type': 'application/json', origin: base },
    body: '{}',
  });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie').split(';')[0];
};

const post = async (cookie, body) =>
  robustFetch(`${base}/api/votes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: base, // 缺 origin 会先被同源校验拦成 403，到不了登录门控
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

try {
  await check('未登录投票 401；跨源 403', async () => {
    const anonymous = await post(null, realVote);
    assert.equal(anonymous.status, 401);
    const wrongOrigin = await robustFetch(`${base}/api/votes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: await login(),
        origin: 'https://evil.example',
      },
      body: JSON.stringify(realVote),
    });
    assert.equal(wrongOrigin.status, 403);
  });
  await check('登录后写入 201；读取公开且不带 user_id', async () => {
    const cookie = await login();
    const response = await post(cookie, realVote);
    assert.equal(response.status, 201);
    const listed = await (await robustFetch(`${base}/api/votes`)).json();
    assert.equal(listed.votes.length, 1);
    assert.ok(!('userId' in listed.votes[0]));
    assert.equal(listed.votes[0].winnerMid, 'inkwell');
    // 决策 045 ⑤「历史票保留在榜单」：流水联表带展示快照——
    // 下架题靠 promptKind 归赛道，下架作品的模型靠双方显示名留在榜上
    assert.equal(listed.votes[0].winnerName, '墨池 / INKWELL');
    assert.equal(listed.votes[0].loserName, '回声 / ECHO');
    assert.equal(listed.votes[0].promptKind, 'text');
    // 流水必须能通过前端形态校验（含 UUID 形态的 id），否则 fetchVotes 会静默丢弃
    for (const vote of listed.votes) {
      assert.ok(
        validateVote(vote),
        `vote failed client validation: ${JSON.stringify(vote)}`,
      );
    }
    // 交换左右 = 同一对局，客户端换 UUID 重投 → 409
    const swapped = await post(cookie, {
      ...realVote,
      id: '3f2504e0-4f89-41d3-9a0c-0305e82c3302',
      winnerRid: '002-b',
      winnerMid: 'echo',
      loserRid: '002-a',
      loserMid: 'inkwell',
    });
    assert.equal(swapped.status, 409);
    // 同 UUID 重试（网络重试场景）→ 幂等成功
    const retry = await post(cookie, realVote);
    assert.equal(retry.status, 200);
  });

  await check(
    '票面与作品清单核对（B2）：伪造 rid / rid 与题号不符 / mid 与 rid 不符 / 演示作品 → 400',
    async () => {
      const cookie = await login();
      for (const body of [
        // 清单里不存在的 rid
        { ...realVote, id: '3f2504e0-4f89-41d3-9a0c-0305e82c3311', winnerRid: '002-ph-01', winnerMid: 'inkwell' },
        // rid 真实但不属于本题（002 的作品投成 003）
        { ...realVote, id: '3f2504e0-4f89-41d3-9a0c-0305e82c3312', promptId: '003' },
        // rid 真实但 mid 对不上
        { ...realVote, id: '3f2504e0-4f89-41d3-9a0c-0305e82c3313', winnerMid: 'echo' },
        // 演示样例不可投票
        {
          ...realVote,
          id: '3f2504e0-4f89-41d3-9a0c-0305e82c3314',
          promptId: '001',
          winnerRid: '001-sample',
          winnerMid: 'sample',
        },
      ]) {
        const response = await post(cookie, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      const listed = await (await robustFetch(`${base}/api/votes`)).json();
      assert.equal(listed.votes.length, 1); // 一张都没写进去
    },
  );

  await check(
    '同 UUID 跨对局重放被拒（B1）：回显旧票返回 409 而不是 201',
    async () => {
      const cookie = await login();
      // realVote 的 UUID 已投过 002；拿同一 UUID 投未投过的 003 对局——
      // 对局去重拦不住（003 没投过），INSERT OR IGNORE 会被旧 id 忽略，
      // 修复前这里回读只比对 userId，会 201 回显 002 的旧票
      const crossPair = await post(cookie, {
        ...realVote,
        promptId: '003',
        winnerRid: '003-a',
        winnerMid: 'polyline',
        loserRid: '003-b',
        loserMid: 'starmap',
      });
      assert.equal(crossPair.status, 409);
      assert.equal((await crossPair.json()).code, 'id');
      // 同 UUID 同对局但票面不同（翻转胜负）→ 幂等路径也要按冲突拒
      const flipped = await post(cookie, {
        ...realVote,
        winnerRid: '002-b',
        winnerMid: 'echo',
        loserRid: '002-a',
        loserMid: 'inkwell',
      });
      assert.equal(flipped.status, 409);
      assert.equal((await flipped.json()).code, 'id');
      // 被拒的 003 重放不能占坑：新 UUID 投 003 仍然成功
      const fresh = await post(cookie, {
        ...realVote,
        id: '3f2504e0-4f89-41d3-9a0c-0305e82c3303',
        promptId: '003',
        winnerRid: '003-a',
        winnerMid: 'polyline',
        loserRid: '003-b',
        loserMid: 'starmap',
      });
      assert.equal(fresh.status, 201);
      const listed = await (await robustFetch(`${base}/api/votes`)).json();
      assert.equal(listed.votes.length, 2);
    },
  );

  await check('非法 payload 400：坏 UUID / 未知题号 / mode 缺失', async () => {
    const cookie = await login();
    for (const body of [
      { ...validVote, id: 'bad' },
      {
        ...validVote,
        id: '3f2504e0-4f89-41d3-9a0c-0305e82c3304',
        promptId: '999',
      },
      {
        ...validVote,
        id: '3f2504e0-4f89-41d3-9a0c-0305e82c3305',
        mode: undefined,
      },
    ]) {
      const response = await post(cookie, body);
      assert.equal(response.status, 400, JSON.stringify(body));
    }
  });

  await check('全量流水按时间升序返回（Elo 重放顺序依赖）', async () => {
    const listed = await (await robustFetch(`${base}/api/votes`)).json();
    const times = listed.votes.map((vote) => vote.ts);
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  await check(
    'GET /api/works 迁移种子：5 条内置作品、已发布、content 为合法 JSON（决策 040）',
    async () => {
      const listed = await (await robustFetch(`${base}/api/works`)).json();
      assert.equal(listed.works.length, 5);
      assert.deepEqual(
        listed.works.map((work) => work.id),
        ['001-sample', '002-a', '002-b', '003-a', '003-b'],
      );
      for (const work of listed.works) {
        assert.equal(typeof work.content, 'string');
        const content = JSON.parse(work.content);
        assert.ok(['image', 'text', 'web', 'html'].includes(content.kind));
        // 身份字段与共享花名册一致——前端解析（parseWorkRow）依赖这些形态
        assert.equal(typeof work.modelId, 'string');
        assert.equal(typeof work.promptId, 'string');
      }
      // isDemo 转成 0/1 数字形态
      assert.equal(listed.works.find((work) => work.id === '001-sample').isDemo, 1);
      assert.equal(listed.works.find((work) => work.id === '002-a').isDemo, 0);
    },
  );
} finally {
  // 无论断言成败都回收子进程与临时库；检查串行跑完后才 kill，避免竞态
  child.kill();
  // Windows：SQLite WAL 文件要等子进程完全退出才能删
  await new Promise((resolve) => {
    child.on('exit', resolve);
    setTimeout(resolve, 3000);
  });
  await rm(dataDir, { recursive: true, force: true });
}
console.log(`${tests} votes checks passed.`);
