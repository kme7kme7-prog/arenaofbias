// 独立临时账号/数据库，复现旧 dev 入口死路并验证管理员不切号进入正式测评。
// 先 npm run build；--expect-bug 可对旧构建检查入口死路与重登录后面板失效。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const dataDir = await mkdtemp(path.join(tmpdir(), 'aob-admin-access-'));
const out = path.join(root, 'output/playwright');
await mkdir(out, { recursive: true });
const base = `http://127.0.0.1:${44000 + Math.floor(Math.random() * 9000)}`;
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, DATA_DIR: dataDir, PORT: new URL(base).port, HOST: '127.0.0.1', ADMIN_OWNER: 'kme7' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', c => { output += c; });
child.stderr.on('data', c => { output += c; });
const expectBug = process.argv.includes('--expect-bug');
const password = 'admin-access-test-password';
let browser;
try {
  for (let i = 0; ; i++) {
    if (child.exitCode !== null || i > 150) throw new Error(output);
    if (output.includes(`[arenaofbias] ${base}`)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser = await chromium.launch({ executablePath: process.env.THUMB_BROWSER || (existsSync(edge) ? edge : undefined), headless: true });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('arena-language', 'zh'));
  for (const username of ['wujisuan', 'kme7']) {
    const res = await context.request.post(`${base}/api/auth/register`, { headers: { origin: base }, data: { username, password } });
    assert.equal(res.status(), 201);
  }
  const db = new Database(path.join(dataDir, 'comments.db'));
  db.prepare("UPDATE users SET role='admin' WHERE username='wujisuan'").run();
  db.close();
  const page = await context.newPage();
  const errors = [];
  let devRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().endsWith('/api/auth/dev')) devRequests++; });
  await page.goto(`${base}/#play`);
  const entry = page.getByRole('button', { name: '开发者面板', exact: true });
  await entry.click();
  await page.locator('.dev-panel:visible').waitFor();
  if (expectBug) {
    assert.ok(await page.getByRole('button', { name: '免登录进入', exact: true }).isDisabled());
    console.log('REPRO 只有登录 kme7 才有面板，但 dev 登录按钮始终禁用');
  } else {
    assert.equal(await page.getByRole('button', { name: '免登录进入', exact: true }).count(), 0);
    await page.getByRole('button', { name: '前往玩法菜单', exact: true }).click();
    await page.getByRole('link', { name: /正式测评/ }).click();
    await page.waitForSelector('.phase-voting');
    assert.equal((await (await context.request.get(`${base}/api/auth/me`)).json()).user.username, 'kme7');
    console.log('PASS kme7 保持原账号，从面板指引进入正式测评');
    await page.goto(`${base}/#play`);
    await entry.click();
    await page.locator('.dev-panel:visible').waitFor();
    await page.screenshot({ path: path.join(out, 'admin-access-panel.png'), fullPage: true });
  }
  // 保持面板打开，真实退出，再在同一个页面登录，不能依靠刷新修复状态。
  await page.locator('.account-entry').click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await entry.waitFor({ state: 'detached' });
  await page.locator('.account-entry').click();
  await page.locator('#account-name').fill('kme7');
  await page.locator('#account-password').fill(password);
  await page.locator('.account-submit').click();
  await entry.waitFor();
  await entry.click();
  await entry.click();
  if (expectBug) {
    assert.ok(await page.locator('.dev-panel').evaluate(el => el.hidden));
    console.log('REPRO 打开面板→退出→重登录后，旧动画引用使面板一直隐藏');
  } else {
    // 新会话初始关闭：连点两次回到关闭，再点击应该正常打开。
    await entry.click();
    await page.locator('.dev-panel:visible').waitFor();
    console.log('PASS 退出后面板隐藏，重新登录后仍可正常开合');
    await context.request.post(`${base}/api/auth/login`, { headers: { origin: base }, data: { username: 'wujisuan', password } });
    await page.reload();
    await page.getByRole('link', { name: /正式测评/ }).waitFor();
    assert.equal(await entry.count(), 0);
    await page.getByRole('link', { name: /正式测评/ }).click();
    await page.waitForSelector('.phase-voting');
    assert.equal((await (await context.request.get(`${base}/api/auth/me`)).json()).user.username, 'wujisuan');
    console.log('PASS wujisuan 无开发者面板，仍可用原管理员账号进入正式测评');
  }
  assert.equal(devRequests, 0);
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser?.close();
  if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  await rm(dataDir, { recursive: true, force: true });
}
