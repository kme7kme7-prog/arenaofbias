// 真浏览器端到端：独立临时库与服务，真实登录/投票/分榜，不写任何真实用户数据。
// 先 npm run build:check，再 npm run validate:formal-ui。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(root, 'output/playwright');
await mkdir(out, { recursive: true });
const dataDir = await mkdtemp(path.join(tmpdir(), 'aob-formal-ui-'));
const port = 42000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
let output = '';
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, RATE_LIMIT_PER_MIN: '200' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', c => { output += c; });
child.stderr.on('data', c => { output += c; });
let browser;
try {
  for (let i = 0; ; i++) {
    if (child.exitCode !== null || i > 150) throw new Error(output);
    if (output.includes(`[arenaofbias] ${base}`)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser = await chromium.launch({ executablePath: process.env.THUMB_BROWSER || (existsSync(edge) ? edge : undefined), headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('arena-language', 'zh'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/#formal/002`);
  await page.getByText('需要资格', { exact: false }).first().waitFor();
  assert.equal(await page.locator('.arena-shell').count(), 0);
  const login = await context.request.post(`${base}/api/auth/dev`, { headers: { origin: base }, data: {} });
  assert.equal(login.status(), 201);
  await page.reload();
  console.log('PASS 游客直达正式地址仍受资格门禁保护');

  await page.goto(`${base}/#arena/002`);
  await page.waitForSelector('.phase-voting');
  await page.locator('.vote-a').click();
  await page.waitForSelector('.phase-result .vote-note[data-state="saved"]');
  assert.equal((await (await context.request.get(`${base}/api/votes`)).json()).votes.length, 1);
  const entertainmentRatings = await (await context.request.get(`${base}/api/ratings`)).json();

  await page.goto(`${base}/#formal/002`);
  await page.waitForSelector('.phase-voting');
  assert.deepEqual(await page.locator('.model-identity').allTextContents(), ['未知模型', '未知模型']);
  const posted = page.waitForRequest(req => req.url().endsWith('/api/votes') && req.method() === 'POST');
  await page.locator('.vote-b').click();
  assert.equal((await posted).postDataJSON().mode, 'formal');
  await page.waitForSelector('.phase-result .vote-note[data-state="saved"]');
  assert.match(await page.locator('.vote-note').innerText(), /正式测评榜/);
  assert.deepEqual(await page.locator('.model-identity').allTextContents(), ['未知模型', '未知模型']);
  assert.equal(await page.locator('.afterparty, .reaction-bar, .audience-verdict').count(), 0);
  assert.equal(await page.getByRole('button', { name: /分享/ }).count(), 0);
  assert.equal(await page.locator('.result-board-link').getAttribute('href'), '#rank/formal');
  assert.equal((await (await context.request.get(`${base}/api/votes?scope=formal`)).json()).votes.length, 1);
  assert.equal((await (await context.request.get(`${base}/api/votes`)).json()).votes.length, 1);
  assert.deepEqual(await (await context.request.get(`${base}/api/ratings`)).json(), entertainmentRatings);
  await page.screenshot({ path: path.join(out, 'formal-desktop.png'), fullPage: true });
  console.log('PASS 娱乐投过的同一对作品仍可正式评审；落库隔离且投后不揭晓、不互动、不分享');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const buttons = await page.locator('.continue-buttons button').evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width };
    }));
    assert.equal(buttons.length, 2);
    assert.ok(Math.abs(buttons[0].y - buttons[1].y) < 1);
    assert.ok(Math.abs(buttons[0].width - buttons[1].width) < 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(out, `formal-mobile-${width}.png`), fullPage: true });
  }
  console.log('PASS 390/320 手机布局无横向溢出，双继续按钮保持并排等宽');
  await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
  await page.waitForSelector('.phase-voting');
  assert.equal(new URL(page.url()).hash, '#formal/002');
  assert.equal(await page.locator('.vote-note').count(), 0);
  await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
  await page.waitForURL('**/#formal/003');
  await page.waitForSelector('.phase-voting');
  await page.keyboard.press('n');
  await page.waitForSelector('.phase-voting');
  assert.equal(new URL(page.url()).hash, '#formal/003');
  console.log('PASS 同题、换题及 N 键继续均留在正式模式');

  await page.goto(`${base}/#rank/formal`);
  await page.getByRole('button', { name: '正式测评榜', exact: true }).waitFor();
  await page.waitForSelector('.rank-board');
  const entertainmentRequest = page.waitForRequest('**/api/votes?scope=entertainment');
  await page.getByRole('button', { name: '正式测评榜', exact: true }).click();
  await entertainmentRequest;
  await page.getByRole('button', { name: '娱乐测评榜', exact: true }).waitFor();
  console.log('PASS 正式结果进入正式榜，切换榜单请求独立数据');
  await page.goto(`${base}/#play`);
  await page.getByRole('link', { name: /正式测评/ }).click();
  await page.waitForSelector('.phase-voting');
  assert.ok(new URL(page.url()).hash.startsWith('#formal/'));
  console.log('PASS 管理员从玩法菜单实际进入正式测评');
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    const exited = once(child, 'exit'); child.kill(); await exited;
  }
  await rm(dataDir, { recursive: true, force: true });
}
console.log('Formal browser checks passed.');
