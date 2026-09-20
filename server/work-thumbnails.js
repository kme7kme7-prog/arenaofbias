import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';

export function thumbFingerprint(work) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'arena-frame-v2',
        work.id,
        work.prompt_id ?? work.promptId,
        work.content,
      ]),
    )
    .digest('hex');
}
function browserOptions() {
  if (process.env.THUMB_BROWSER)
    return { executablePath: process.env.THUMB_BROWSER };
  if (process.platform === 'win32') return { channel: 'msedge' };
  return { channel: 'chrome' };
}

// Two isolated pages at most. No user profile, credentials, or arbitrary URL input.
let running = 0;
const waiting = [];
async function acquire() {
  if (running >= 2) {
    if (waiting.length >= 8) throw new Error('作品快照生成繁忙，请稍后重试');
    await new Promise((resolve) => waiting.push(resolve));
  } else running++;
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

export async function captureWork(
  base,
  id,
  directory,
  fingerprint,
  settleMs = 2200,
) {
  if (!/^[\w.-]+$/.test(id) || id === '.' || id === '..')
    throw new Error('无效作品 ID');
  const origin = new URL(base);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))
    throw new Error('快照只允许本地服务');
  await acquire();
  let browser;
  try {
    browser = await chromium.launch({
      ...browserOptions(),
      headless: true,
      timeout: 15000,
    });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    await page.goto(
      `${origin.origin}/capture.html?id=${encodeURIComponent(id)}`,
      { waitUntil: 'domcontentloaded', timeout: 15000 },
    );
    await page.waitForFunction(
      () => document.documentElement.dataset.captureReady === 'true',
      null,
      { timeout: 45000 },
    );
    // Real time: camera restore and initial scene animation need actual rendered frames.
    await page.waitForTimeout(settleMs);
    const png = await page
      .locator('#capture-stage')
      .screenshot({ type: 'png', timeout: 15000 });
    fs.mkdirSync(directory, { recursive: true });
    const temporary = path.join(directory, `${id}.${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, png);
      fs.renameSync(temporary, path.join(directory, `${id}.png`));
      fs.writeFileSync(
        path.join(directory, `${id}.json`),
        JSON.stringify({ fingerprint, width: 1280, height: 720 }),
      );
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    return png;
  } finally {
    try {
      await browser?.close();
    } finally {
      release();
    }
  }
}
