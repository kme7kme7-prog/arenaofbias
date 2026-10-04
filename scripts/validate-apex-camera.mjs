// Local downloaded-copy validation. No calibration or vote writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const { works } = await (await fetch('http://127.0.0.1:5190/api/works')).json();
const work = works.find(item => item.id === 'dp-010-longcat-2.5');
assert.ok(work, 'APEX-65 is available in the local copy');
const original = JSON.parse(work.content).src;
const url = new URL(original);
for (const flag of ['bridge', 'arena-fold', 'arena-scene', 'prev']) url.searchParams.append('aob', flag);
url.searchParams.set('face', 'arena');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
await mkdir('.local/work-controls', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 550 } });
  await page.goto(url.href);
  await page.waitForFunction(() => window.__AOB__?.controls.length === 1);
  assert.equal(await page.evaluate(() => window.__AOB__.controls[0].maxDistance), 2200);
  await page.mouse.move(450, 275);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1400);
  const saved = await page.evaluate(() => {
    const c = window.__AOB__.controls[0];
    return { camera: window.__AOB__.getState(), distance: c.object.position.distanceTo(c.target) };
  });
  assert.ok(saved.distance > 220 && saved.distance < 2200, 'wheel can retreat past the original ceiling');
  await page.screenshot({ path: '.local/work-controls/apex-camera.png' });
  const capture = await page.evaluate(() => new Promise(resolve => {
    const listener = event => {
      if (event.data?.aob === 'camera') { removeEventListener('message', listener); resolve(event.data.camera); }
    };
    addEventListener('message', listener);
    postMessage({ aob: 'get-camera' }, location.origin);
  }));
  assert.deepEqual(capture, saved.camera);
  // Same boot-time saved value embedded by bridgeTags for persisted calibration.
  await page.addInitScript(camera => { window.__AOB_SAVED__ = camera; }, saved.camera);
  const entertainment = new URL(url);
  entertainment.searchParams.delete('face');
  entertainment.searchParams.delete('aob');
  for (const flag of ['arena-fold', 'arena-scene', 'prev']) entertainment.searchParams.append('aob', flag);
  await page.goto(entertainment.href);
  await page.waitForFunction(() => window.__AOB__?.controls.length === 1);
  await page.waitForTimeout(1800);
  const restored = await page.evaluate(() => window.__AOB__.getState());
  for (const key of ['position', 'target']) restored[key].forEach((value, i) => assert.ok(Math.abs(value - saved.camera[key][i]) < .01, 'saved camera is not clamped back to 220'));
  const unadapted = await browser.newPage();
  for (const suffix of ['', '?aob=bridge&face=gallery', '?aob=fold']) {
    await unadapted.goto(original + suffix);
    assert.equal(await unadapted.locator('script[src="/__aob_apex_camera.mjs"]').count(), 0);
    assert.equal(await unadapted.locator('script[src="./assets/index-KBcdZwxF.js"]').count(), 1);
  }
  console.log('PASS APEX wheel range, camera capture, entertainment saved-camera restore; original/gallery/formal-style pages retain original bundle');
} finally { await browser.close(); }
