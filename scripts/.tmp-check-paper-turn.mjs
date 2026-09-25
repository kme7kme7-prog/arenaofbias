// 一次性目检：账号弹窗换纸动画是否可见（2026-09-24 验收反馈）。
// 先 npm run dev（5173 起服务）再跑本脚本；截图落在 output/playwright/。
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(root, 'output/playwright');
await mkdir(out, { recursive: true });
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({
  executablePath: process.env.THUMB_BROWSER || (existsSync(edge) ? edge : undefined),
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // 首访内测弹窗（aob-beta-notice，版本随文案升级）会挡住账号按钮，预置已读标记跳过
  await page.addInitScript(() => localStorage.setItem('aob-beta-notice', 'v3'));
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.locator('.account-entry').click();
  await page.locator('.account-dialog').waitFor();
  await page.waitForTimeout(900); // 入场动画走完
  await page.screenshot({ path: path.join(out, 'paper-turn-0-login.png') });

  await page.getByRole('button', { name: /02/ }).click(); // 切注册
  await page.waitForTimeout(90); // 翻页前段（应明显侧倾）
  await page.screenshot({ path: path.join(out, 'paper-turn-1-mid.png') });
  await page.waitForTimeout(210); // 翻页后段
  await page.screenshot({ path: path.join(out, 'paper-turn-2-settled.png') });
  await page.waitForTimeout(500); // 完全落定
  await page.screenshot({ path: path.join(out, 'paper-turn-3-back-mid.png') });
  console.log('shots saved');
} finally {
  await browser.close();
}
