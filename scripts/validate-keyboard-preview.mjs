// Local-only regression for scene presentation; never submits votes or changes works.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:5441';
const { works } = await (await fetch('http://127.0.0.1:5190/api/works')).json();
const ids = ['dp-010-kimi-k3-max', 'dp-010-gpt-5.6-luna-max'];
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
await mkdir('.local/work-controls', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1050 } });
  await page.addInitScript(({ base, ids }) => {
    if (location.origin === base) localStorage.setItem('aob-test-pair', JSON.stringify({ promptId: '010', a: ids[0], b: ids[1], at: Date.now() }));
  }, { base, ids });
  await page.goto(`${base}/#arena/010`);
  await page.waitForSelector('.phase-voting', { timeout: 35000 });
  const frames = page.frames().filter(frame => frame.url().includes('arena-scene'));
  assert.equal(frames.length, 2);
  for (const frame of frames) {
    await frame.waitForSelector('html[data-aob-scene]');
    await frame.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      const r = canvas.getBoundingClientRect();
      return Math.abs(r.width - innerWidth) < 2 && Math.abs(r.height - innerHeight) < 2 && Math.abs(canvas.width / canvas.height - r.width / r.height) < .02;
    });
    assert.ok(await frame.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
    await frame.evaluate(() => { window.savedCanvas = document.querySelector('canvas'); });
  }
  const kimi = frames.find(frame => new URL(frame.url()).origin === new URL(JSON.parse(works.find(work => work.id === ids[0]).content).src).origin);
  assert.equal(await kimi.locator('#panel').isVisible(), false);
  const box = await kimi.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 40, { steps: 12 });
  await page.mouse.up();
  await page.screenshot({ path: '.local/work-controls/keyboard-preview.png' });
  await page.getByRole('button', { name: /放大查看作品/ }).first().click();
  const expanded = page.locator('.expanded-work iframe');
  await expanded.waitFor();
  const expandedFrame = await (await expanded.elementHandle()).contentFrame();
  assert.ok(!expandedFrame.url().includes('arena-scene'));
  await expandedFrame.waitForSelector('#panel');
  assert.equal(await expandedFrame.locator('[data-aob-scene]').count(), 0);
  await page.getByRole('button', { name: '关闭作品预览' }).click();
  for (const frame of frames) assert.ok(await frame.evaluate(() => window.savedCanvas === document.querySelector('canvas')));
  console.log('PASS both keyboard canvases fill panes with matching renderer aspect; sidebar hidden; drag retains canvas; expanded original; close preserves scene');
  const formal = await browser.newPage({ viewport: { width: 1800, height: 1050 } });
  await formal.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'fixture-admin', username: 'fixture-admin', role: 'admin' } } }));
  await formal.route('**/api/works', route => route.fulfill({ json: { works: works.filter(work => ids.includes(work.id)) } }));
  await formal.goto(`${base}/#formal/010`);
  await formal.waitForSelector('.phase-voting', { timeout: 35000 });
  const originals = formal.frames().filter(frame => frame.url().includes('.localhost:5191'));
  assert.equal(originals.length, 2);
  for (const frame of originals) {
    assert.ok(!frame.url().includes('arena-scene'));
    assert.equal(await frame.locator('[data-aob-scene]').count(), 0);
  }
  console.log('PASS formal keyboard comparison retains original pages');
  const fixture = await browser.newPage({ viewport: { width: 800, height: 500 } });
  const adapter = await readFile('../Show2/fusion/arenaofbias-server/server/arena-fold.js', 'utf8');
  await fixture.route('http://fixture.local/**', route => route.fulfill({ contentType: 'text/html', body: '<body><aside>产品描述</aside><main></main></body>' }));
  await fixture.goto('http://fixture.local/?aob=arena-scene');
  await fixture.addScriptTag({ content: adapter });
  assert.equal(await fixture.locator('[data-aob-scene]').count(), 0, 'no canvas remains untouched');
  await fixture.evaluate(() => {
    document.querySelector('main').innerHTML = '<canvas width="400" height="250"></canvas><form><input type="email"><button>提交</button></form>';
  });
  await fixture.waitForTimeout(700);
  assert.equal(await fixture.locator('[data-aob-scene]').count(), 0, 'credential forms are not hidden by scene isolation');
  assert.ok(await fixture.locator('form').isVisible());
  await fixture.evaluate(() => {
    document.querySelector('main').innerHTML = '<canvas width="400" height="250"></canvas><button>开始体验</button>';
  });
  await fixture.waitForTimeout(700);
  assert.equal(await fixture.locator('[data-aob-scene]').count(), 0, 'scene entry buttons remain usable');
  assert.ok(await fixture.getByRole('button', { name: '开始体验' }).isVisible());
  await fixture.evaluate(() => {
    document.querySelector('main').innerHTML = '<canvas width="400" height="250"></canvas><canvas width="400" height="250"></canvas>';
  });
  await fixture.waitForTimeout(700);
  assert.equal(await fixture.locator('[data-aob-scene]').count(), 0, 'multiple views are not chosen arbitrarily');
  await fixture.evaluate(() => document.querySelector('canvas').remove());
  await fixture.waitForSelector('html[data-aob-scene]');
  assert.equal(await fixture.locator('aside').isVisible(), false, 'late single scene isolated');
  await fixture.evaluate(() => { document.querySelector('main').innerHTML = '<canvas width="400" height="250"></canvas>'; });
  await fixture.waitForSelector('canvas[data-aob-scene-path]');
  assert.ok(await fixture.locator('canvas').isVisible(), 'replacement canvas recovers');
  await fixture.evaluate(() => {
    document.querySelector('main').innerHTML = '<canvas width="400" height="250"></canvas><form><input type="radio" name="shell"><input type="text" value="我的键盘"><button>保存配置</button></form>';
  });
  await fixture.waitForSelector('canvas[data-aob-scene-path]');
  assert.equal(await fixture.locator('form').isVisible(), false, 'product configuration form is hidden');
  assert.equal(await fixture.locator('input[type="text"]').inputValue(), '我的键盘', 'configuration is retained');
  console.log('PASS no-canvas, multi-canvas, form and entry protection; late and replaced scene recovery');
} finally { await browser.close(); }
