import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.argv[2] || process.env.PLAYGROUND_INTEGRATION_URL || 'http://127.0.0.1:5450';
const output = 'output/playground/main-integration';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const checks = [], errors = [], writes = [];
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
const page = await browser.newPage({ viewport: { width: 1920, height: 880 }, reducedMotion: 'reduce' });
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.method() !== 'GET' && /\/api\/(?:votes|reactions|comments)/.test(request.url())) writes.push(request.url()); });
const voting = () => page.waitForFunction(() => document.querySelector('.arena-shell.phase-voting') && !document.querySelector('.pg-passage'), null, { timeout: 30000 });
try {
  await page.goto(`${base}/#play`);
  await page.getByRole('link', { name: /随心玩/ }).waitFor();
  check(!await page.getByRole('link', { name: /娱乐测评/ }).count(), 'main menu renamed');
  await page.getByRole('link', { name: /随心玩/ }).click();
  await page.waitForURL('**/playground.html');
  for (const [width, height] of [[1920,880], [2560,1240], [1280,620], [390,844]]) {
    await page.setViewportSize({ width, height });
    check(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2), `hub fits ${width}`);
    await page.screenshot({ path: `${output}/home-${width}.png` });
  }
  await page.setViewportSize({ width: 1920, height: 880 });
  await page.getByRole('link', { name: /文字题目.*一句话/ }).click();
  await page.locator('.pg-story[aria-disabled="false"]').first().waitFor();
  check(await page.locator('.pg-story').count() === 8, 'eight approved text topics');
  const topics = JSON.parse(await readFile('app/playground/playground-catalog.json', 'utf8'));
  for (const item of topics) {
    await page.goto(`${base}/playground.html#arena/${item.id}`);
    await voting();
    check(await page.locator('.pg-reader-header h1').textContent() === item.name, `${item.skin} original topic title`);
    check(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2), `${item.skin} single screen`);
    await page.locator('.vote-button').first().click();
    await page.locator('.phase-result').waitFor();
    check(await page.getByRole('button', { name: '本题继续', exact: true }).isEnabled(), `${item.skin} local reveal and continue`);
    await page.getByRole('button', { name: '本题继续', exact: true }).click();
    await voting();
    check(await page.locator('.contender').count() === 2, `${item.skin} new pair`);
  }
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await voting();
  check(topics.some(item => locationHash(page.url()) === item.id), 'next restricted to text catalog');
  await page.goto(`${base}/objects.html?topic=keyboards`);
  await page.waitForFunction(() => window.__objectStageReview?.snapshot().phase === 'exploring', null, { timeout: 60000 });
  let state = await page.evaluate(() => window.__objectStageReview.snapshot());
  check(state.frames.length === 2 && state.frames.every(frame => frame.ready && frame.rendered && frame.cameraSettled), 'actual keyboard draws and ready bridge');
  await page.locator('#topics-toggle').click();
  check(await page.locator('#topic-list button').count() === 11, 'eleven approved 3D topics');
  await page.locator('#close-picker').click();
  await page.locator('.choose-button').first().click();
  await page.waitForFunction(() => window.__objectStageReview.snapshot().phase === 'revealed');
  await page.locator('#continue').click();
  await page.waitForFunction(() => window.__objectStageReview.snapshot().phase === 'exploring', null, { timeout: 60000 });
  check(await page.locator('iframe').count() === 2, 'continue unloads old iframes');
  await page.locator('#next').click();
  await page.waitForFunction(() => window.__objectStageReview.snapshot().phase === 'exploring', null, { timeout: 60000 });
  state = await page.evaluate(() => window.__objectStageReview.snapshot());
  check(state.topic === 'lamps' && state.frames.every(frame => frame.ready), 'next lamp actual render');
  await page.screenshot({ path: `${output}/objects.png` });
  await page.locator('.brand').click();
  await page.waitForURL('**/#play');
  await page.getByRole('link', { name: /随心玩/ }).waitFor();
  check(await page.evaluate(() => !document.documentElement.hasAttribute('data-playground')), 'main returns without full-screen style state');
  check(writes.length === 0, 'preference choices do not write old leaderboards');
  check(errors.length === 0, 'no browser runtime errors');
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors, writes }, null, 2));
  await browser.close();
}
function locationHash(url) { return new URL(url).hash.slice(7); }
console.log(`Main integration: ${checks.length} checks passed`);
