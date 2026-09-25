import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 评论接口回归：自起临时库服务（2026-09-24 前是打本机 3000 实库的集成检查，
// 注册改必填邮箱+验证码后没有稳定取码途径，遂改为 reactions 同款自包含），
// 结束整目录删除，不碰本地 data/。

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = await mkdtemp(path.join(tmpdir(), 'aob-comments-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(port),
    HOST: '127.0.0.1',
    RATE_LIMIT_PER_MIN: '100000',
    MAIL_DEV_LOG: '1',
    MAIL_COOLDOWN_MS: '1',
    MAIL_IP_MAX: '1000',
    MAIL_EMAIL_MAX: '1000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
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

const ids = [randomUUID(), randomUUID()];
const account = {
  username: `smoke_${randomUUID().slice(0, 8)}`,
  password: `validate-${randomUUID()}`,
  email: `smoke-${randomUUID().slice(0, 8)}@aob.test`,
};
const post = (value, originHeader = origin, cookie = '') => fetch(`${origin}/api/comments`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: originHeader, Cookie: cookie }, body: JSON.stringify(value),
});
const listing = async round => {
  const response = await fetch(`${origin}/api/comments?round=${round}`);
  assert.equal(response.status, 200);
  return (await response.json()).comments;
};
try {
  for (let attempt = 0; ; attempt++) {
    if (child.exitCode !== null) throw new Error('测试服务端提前退出');
    if (attempt > 100) throw new Error('测试服务端未就绪');
    try {
      if ((await fetch(`${origin}/api/works`)).ok) break;
    } catch { /* 还在启动 */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const sent = await fetch(`${origin}/api/auth/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ purpose: 'register', email: account.email }),
  });
  assert.equal(sent.status, 200);
  const register = await fetch(`${origin}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ ...account, code: await waitForCode('register', account.email) }),
  });
  assert.equal(register.status, 201);
  const cookie = register.headers.get('set-cookie').split(';')[0];

  const first = { id: ids[0], roundId: '001', side: 'a', body: '本地验证：这里的构图很有意思。' };
  assert.equal((await post(first)).status, 401);
  console.log('PASS posting without a login is rejected');
  assert.equal((await post(first, origin, cookie)).status, 201);
  assert.equal((await post(first, origin, cookie)).status, 201);
  const firstList = await listing('001');
  assert.equal(firstList.filter(item => item.id === ids[0]).length, 1);
  assert.equal(firstList.find(item => item.id === ids[0]).body, first.body);
  assert.equal(firstList.find(item => item.id === ids[0]).username, account.username);
  console.log('PASS comment persists with its author and retrying the same submission does not duplicate it');
  assert.equal((await post({ ...first, id: ids[1], roundId: '002', side: 'b' }, origin, cookie)).status, 201);
  assert.equal((await listing('001')).some(item => item.id === ids[1]), false);
  assert.equal((await listing('002')).some(item => item.id === ids[0]), false);
  console.log('PASS comments are isolated by question');
  for (const body of ['', '   ', '字'.repeat(281)]) assert.equal((await post({ ...first, body }, origin, cookie)).status, 400);
  assert.equal((await post({ ...first, roundId: '999' }, origin, cookie)).status, 400);
  assert.equal((await post({ ...first, side: 'invalid' }, origin, cookie)).status, 400);
  assert.equal((await post(first, 'https://unrelated.example', cookie)).status, 403);
  console.log('PASS empty, oversized, invalid-question and cross-origin submissions are rejected');
} finally {
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  await rm(dataDir, { recursive: true, force: true });
  console.log('Temporary server and data removed. No local data/ was touched.');
}
