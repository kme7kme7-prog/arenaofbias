// 正式测评数据隔离：真实 HTTP + 临时 SQLite，迁移/重启不碰本地或线上真库。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import ts from 'typescript';
import { withApiFixture } from './api-fixture.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dataDir = await mkdtemp(path.join(tmpdir(), 'aob-formal-'));
let child;
let base;
let tests = 0;
const check = async (name, fn) => {
  await fn();
  console.log(`PASS ${name}`);
  tests++;
};
// 注册必填邮箱+验证码（2026-09-24）：MAIL_DEV_LOG 打日志由本脚本捕获。
// 服务中途会重启，codeLines 挂在模块层跨 start() 存活
const codeLines = [];
let pendingLog = '';
const collectCodes = chunk => {
  pendingLog += chunk;
  const parts = pendingLog.split('\n');
  pendingLog = parts.pop();
  codeLines.push(...parts);
};
const waitForCode = async (purpose, target) => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const line = codeLines.find(item =>
      item.includes(`purpose=${purpose}`) && item.includes(`email=${target}`) && item.includes('code='));
    if (line) return line.match(/code=(\d{6})/)[1];
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`未捕获到 ${purpose} ${target} 的验证码`);
};
async function start() {
  let output = '';
  // 用高位随机端口；抢占失败快速报错，不连接已有实例。
  const port = 41000 + Math.floor(Math.random() * 12000);
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, RATE_LIMIT_PER_MIN: '200',
      MAIL_DEV_LOG: '1', MAIL_COOLDOWN_MS: '1', MAIL_IP_MAX: '1000', MAIL_EMAIL_MAX: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { output += chunk; collectCodes(chunk); });
  child.stderr.on('data', chunk => { output += chunk; });
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(output);
    if (output.includes(`[arenaofbias] ${base}`)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`server start timeout: ${output}`);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}
const post = (route, body, cookie) => fetch(`${base}/api/${route}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});
const get = async route => {
  const response = await fetch(`${base}/api/${route}`);
  assert.equal(response.status, 200);
  return response.json();
};
const vote = (mode, promptId = '002') => ({
  id: randomUUID(), promptId, mode, outcome: 'win',
  winnerRid: `${promptId}-a`, winnerMid: promptId === '002' ? 'inkwell' : 'polyline',
  loserRid: `${promptId}-b`, loserMid: promptId === '002' ? 'echo' : 'starmap',
});
try {
  await start();
  const login = await post('auth/dev', {});
  assert.equal(login.status, 201);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const casual = vote('blind');
  const oldFormal = vote('formal', '003');
  assert.equal((await post('votes', casual, cookie)).status, 201);
  assert.equal((await post('votes', oldFormal, cookie)).status, 201);
  await stop();
  const db = new Database(path.join(dataDir, 'comments.db'));
  let originalRows;
  try {
    originalRows = db.prepare('SELECT * FROM votes ORDER BY id').all();
    // 恢复上一版索引与迁移版本，模拟已有真实娱乐/正式票的老库。
    db.exec(`DROP INDEX votes_user_pair_scope; DROP INDEX votes_scope_created;
      CREATE UNIQUE INDEX votes_user_pair ON votes(user_id, pair_key); PRAGMA user_version = 10;`);
  } finally { db.close(); }
  await start();
  await check('迁移保留全部历史票面，自动拆分读取口径', async () => {
    const migrated = new Database(path.join(dataDir, 'comments.db'), { readonly: true });
    try {
      assert.deepEqual(migrated.prepare('SELECT * FROM votes ORDER BY id').all(), originalRows);
      // 12 对应 012「模一把成绩记名」迁移。
      assert.equal(migrated.pragma('user_version', { simple: true }), 12);
    } finally { migrated.close(); }
    assert.deepEqual((await get('votes')).votes.map(v => v.id), [casual.id]);
    assert.deepEqual((await get('votes?scope=formal')).votes.map(v => v.id), [oldFormal.id]);
    assert.deepEqual((await get('votes?scope=entertainment')).votes.map(v => v.id), [casual.id]);
  });
  const formal = { ...vote('formal'), winnerRid: '002-b', winnerMid: 'echo', loserRid: '002-a', loserMid: 'inkwell' };
  await check('同人同对作品跨模式可投，各模式重复/翻面/平局仍去重', async () => {
    assert.equal((await post('votes', formal, cookie)).status, 201);
    assert.equal((await post('votes', formal, cookie)).status, 200);
    for (const draft of [
      { ...formal, id: randomUUID() },
      { ...casual, id: randomUUID(), mode: 'formal' },
      { ...formal, id: randomUUID(), outcome: 'draw' },
      { ...casual, id: randomUUID(), mode: 'party' },
    ]) {
      const res = await post('votes', draft, cookie);
      assert.equal(res.status, 409);
      assert.equal((await res.json()).code, 'pair');
    }
    const collision = await post('votes', { ...oldFormal, mode: 'blind' }, cookie);
    assert.equal(collision.status, 409);
    assert.equal((await collision.json()).code, 'id');
  });
  await check('声望分与出场次数独立，正式票不改变娱乐统计', async () => {
    const entertainment = await get('ratings');
    const formalScores = await get('ratings?scope=formal');
    assert.deepEqual(entertainment.ratings, { inkwell: 1216, echo: 1184 });
    assert.deepEqual(entertainment.games, { inkwell: 1, echo: 1 });
    assert.equal(formalScores.ratings.inkwell, 1184);
    assert.equal(formalScores.ratings.echo, 1216);
    assert.equal(formalScores.games.inkwell, 1);
    assert.equal(formalScores.games.polyline, 1);
    assert.equal((await get('votes')).votes.length, 1);
    assert.equal((await get('votes?scope=formal')).votes.length, 2);
  });
  await check('非管理员不能写正式票，非法统计范围返回400', async () => {
    const regularEmail = 'formal-regular@aob.test';
    assert.equal((await post('auth/email/send', { purpose: 'register', email: regularEmail })).status, 200);
    const registered = await post('auth/register', {
      username: 'formal_regular', password: 'formal-regular-test-2026',
      email: regularEmail, code: await waitForCode('register', regularEmail),
    });
    assert.equal(registered.status, 201);
    const regular = registered.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('votes', vote('formal'), regular)).status, 403);
    assert.equal((await post('votes', vote('formal'))).status, 401);
    for (const route of ['votes?scope=mixed', 'ratings?scope=invalid'])
      assert.equal((await fetch(`${base}/api/${route}`)).status, 400);
  });
  await check('已写跨模式票后重启成功，旧唯一索引不复活', async () => {
    await stop();
    await start();
    assert.equal((await get('votes')).votes.length, 1);
    assert.equal((await get('votes?scope=formal')).votes.length, 2);
    assert.equal((await post('votes', formal, cookie)).status, 200);
    const reopened = new Database(path.join(dataDir, 'comments.db'), { readonly: true });
    try {
      assert.equal(reopened.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='votes_user_pair'").get().n, 0);
    } finally { reopened.close(); }
  });
  await check('浏览器声望缓存按模式独立，晚到旧响应不覆盖新快照', async () => {
    const source = await readFile(path.join(root, 'lib/ratings.ts'), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const ratings = await import(`data:text/javascript;base64,${Buffer.from(withApiFixture(code)).toString('base64')}`);
    const realFetch = globalThis.fetch;
    const pending = [];
    globalThis.fetch = url => new Promise(resolve => pending.push({ url, resolve }));
    const respond = async (index, score) => {
      pending[index].resolve({ ok: true, json: async () => ({ ratings: { model: score }, games: { model: score } }) });
      await new Promise(resolve => setImmediate(resolve));
    };
    try {
      ratings.loadRatings(); ratings.loadRatings('formal');
      assert.match(pending[0].url, /scope=entertainment/);
      assert.match(pending[1].url, /scope=formal/);
      await respond(1, 1400); await respond(0, 900);
      assert.equal(ratings.currentRatings().model, 900);
      assert.equal(ratings.currentRatings('formal').model, 1400);
      ratings.refreshRatings('formal'); ratings.refreshRatings('formal');
      await respond(3, 1600); await respond(2, 1500);
      assert.equal(ratings.currentRatings('formal').model, 1600);
      assert.equal(ratings.currentGames().model, 900);
    } finally { globalThis.fetch = realFetch; }
  });
} finally {
  await stop();
  // 唯一清理目标来自本脚本 mkdtemp，绝不指向真实 DATA_DIR。
  await rm(dataDir, { recursive: true, force: true });
}
console.log(`${tests} formal checks passed.`);
