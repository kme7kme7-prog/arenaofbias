// 反应（点赞/点踩/大笑）回归校验（2026-09-20 刷计数 bug）：
// 独立临时库起服务，覆盖——切换态度覆盖旧态度、取消真正删槽、
// 来回刷不叠票、参数与登录守卫。POST 响应即权威 mine/counts。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(tmpdir(), `aob-reactions-${randomUUID().slice(0, 8)}`);
mkdirSync(dataDir, { recursive: true });
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(port),
    HOST: '127.0.0.1',
    RATE_LIMIT_PER_MIN: '100000',
  },
  stdio: 'ignore',
  windowsHide: true,
});
let tests = 0;
async function check(label, fn) {
  await fn();
  console.log(`PASS ${++tests} ${label}`);
}
const register = async (username) => {
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: base },
    body: JSON.stringify({ username, password: `validate-${randomUUID()}` }),
  });
  assert.equal(response.status, 201, `register ${username}`);
  return response.headers.get('set-cookie').split(';')[0];
};
const post = (body, cookie) =>
  fetch(`${base}/api/reactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: base, cookie },
    body: JSON.stringify({ id: randomUUID(), promptId: '002', mid: 'inkwell', ...body }),
  });
const mineOf = (data) => data.mine?.inkwell ?? null;
const countsOf = (data) => ({
  up: data.counts?.inkwell?.up ?? 0,
  down: data.counts?.inkwell?.down ?? 0,
  laugh: data.counts?.inkwell?.laugh ?? 0,
});

for (let i = 0; ; i++) {
  if (i > 100) throw new Error('测试服务端未就绪');
  try {
    if ((await fetch(`${base}/api/works`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

try {
  const cookie = await register('reactor_one');
  const other = await register('reactor_two');

  await check('点赞落库并回读权威计数', async () => {
    const data = await (await post({ kind: 'up' }, cookie)).json();
    assert.equal(mineOf(data), 'up');
    assert.deepEqual(countsOf(data), { up: 1, down: 0, laugh: 0 });
  });

  await check('切换态度覆盖旧态度：旧计数必须扣回去（刷计数 bug 回归）', async () => {
    const data = await (await post({ kind: 'down' }, cookie)).json();
    assert.equal(mineOf(data), 'down');
    assert.deepEqual(countsOf(data), { up: 0, down: 1, laugh: 0 });
  });

  await check('来回刷 up→down→up×5 仍是一人一槽，计数不叠', async () => {
    let data;
    for (let i = 0; i < 5; i++)
      data = await (await post({ kind: 'up' }, cookie)).json();
    assert.deepEqual(countsOf(data), { up: 1, down: 0, laugh: 0 });
  });

  await check('取消真正删槽：kind null 后计数归零且 GET 不回魂', async () => {
    assert.equal((await post({ kind: null }, cookie)).status, 201);
    const data = await (await fetch(`${base}/api/reactions?prompt=002`, { headers: { cookie } })).json();
    assert.equal(mineOf(data), null);
    assert.deepEqual(countsOf(data), { up: 0, down: 0, laugh: 0 });
  });

  await check('两人各占一槽互不覆盖，一人取消只掉自己那票', async () => {
    await post({ kind: 'up' }, cookie);
    const both = await (await post({ kind: 'laugh' }, other)).json();
    assert.deepEqual(countsOf(both), { up: 1, down: 0, laugh: 1 });
    const cancelled = await (await post({ kind: null }, other)).json();
    assert.deepEqual(countsOf(cancelled), { up: 1, down: 0, laugh: 0 });
    await post({ kind: null }, cookie);
  });

  await check('守卫：未登录 401、非法/缺失 kind 400、无此模型/题目 400', async () => {
    assert.equal((await post({ kind: 'up' }, '')).status, 401);
    assert.equal((await post({ kind: 'magic' }, cookie)).status, 400);
    assert.equal(
      (await fetch(`${base}/api/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: base, cookie },
        body: JSON.stringify({ id: randomUUID(), promptId: '002', mid: 'inkwell' }),
      })).status,
      400,
      '缺 kind 字段不得当成取消',
    );
    assert.equal((await post({ kind: 'up', mid: 'nosuch-model' }, cookie)).status, 400);
    assert.equal((await post({ kind: 'up', promptId: '999' }, cookie)).status, 400);
  });
} finally {
  child.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  for (let i = 0; i < 3; i++) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
console.log(`${tests} reaction checks passed`);
