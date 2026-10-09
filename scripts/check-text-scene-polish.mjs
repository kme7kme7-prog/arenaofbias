import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:5444';
const darkId = 'q-b23ef619e82dec65';
const letterId = 'q-1b9d4f59c2d7b31e';
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], captures = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => { if (window === top) localStorage.setItem('aob-theme', 'paper'); });
await mkdir('output/text-themes-review', { recursive: true });
const ready = async () => {
  await page.waitForSelector('.phase-voting');
  await page.waitForFunction(() => !document.querySelector('.game-transition'));
};
async function startRecording() {
  await page.evaluate(() => {
    window.__tones = []; window.__toneRecording = true;
    const sample = () => {
      const root = document.documentElement, layer = document.querySelector('.game-transition');
      const rect = layer?.getBoundingClientRect();
      const washes = [...document.querySelectorAll('.gt-scene-wash')];
      window.__tones.push({ scene: root.dataset.scene ?? null, theme: root.dataset.theme, preference: localStorage.getItem('aob-theme'), phase: layer?.dataset.gtPhase,
        rect: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null, width: innerWidth, height: innerHeight,
        washes: washes.map(el => ({ opacity: +getComputedStyle(el).opacity, color: getComputedStyle(el).backgroundColor })),
        safe: washes.every(el => el.getAnimations().every(animation => animation.effect.getKeyframes().every(frame => Object.keys(frame).every(key => ['offset', 'computedOffset', 'easing', 'composite', 'opacity'].includes(key))))),
      });
      if (window.__toneRecording) requestAnimationFrame(sample);
    }; requestAnimationFrame(sample);
  });
}
async function endRecording(direction) {
  const frames = await page.evaluate(() => { window.__toneRecording = false; return window.__tones; });
  assert.ok(frames.some(f => f.washes.some(w => w.opacity > .05 && w.opacity < .95)), `${direction} has a real material crossfade`);
  assert.ok(frames.every(f => f.safe), 'no repaint-heavy material animation');
  assert.ok(frames.filter(f => f.rect).every(f => f.rect.x <= 1 && f.rect.y <= 1 && f.rect.w >= f.width - 2 && f.rect.h >= f.height - 2), 'dark scene transition covers the entire viewport');
  assert.ok(frames.filter(f => f.washes.length && f.phase === 'exit').every(f => f.washes.every(w => w.opacity > .97)), 'target material settled before reveal');
  captures.push({ direction, frames: frames.length, blendFrames: frames.filter(f => f.washes.some(w => w.opacity > 0 && w.opacity < 1)).length });
  await writeFile(`output/text-themes-review/tone-${direction}.json`, JSON.stringify(frames));
}
try {
  await page.goto(`${base}/#arena/${letterId}`); await ready();
  const stored = await page.evaluate(() => localStorage.getItem('aob-theme'));
  await page.evaluate(() => { window.__oldRandom = Math.random; Math.random = () => .8; });
  await startRecording();
  await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
  await page.waitForURL(`**/#arena/${darkId}`); await ready();
  await endRecording('enter');
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.scene, document.documentElement.dataset.theme, localStorage.getItem('aob-theme')]), ['blackout', 'ink', stored]);
  await page.screenshot({ path: 'output/text-themes-review/blackout-polish-viewport.png' });
  await page.evaluate(() => Math.random = window.__oldRandom);
  await startRecording();
  await page.getByRole('link', { name: '提示词库', exact: true }).click();
  await page.waitForURL('**/#prompts');
  await page.waitForFunction(() => !document.querySelector('.game-transition'));
  await endRecording('exit');
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.scene ?? null, document.documentElement.dataset.theme, localStorage.getItem('aob-theme')]), [null, 'paper', stored]);
  // A genuine user ink preference survives both the scene and a direct hash/history exit.
  await page.getByRole('button', { name: '切换到墨色，当前纸面', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'ink' && !document.querySelector('.theme-curtain'));
  await page.evaluate(id => location.hash = `#arena/${id}`, darkId); await ready();
  await page.evaluate(id => location.hash = `#arena/${id}`, letterId); await ready();
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.scene ?? null, document.documentElement.dataset.theme, localStorage.getItem('aob-theme')]), ['letter', 'ink', 'ink']);
  await page.evaluate(id => location.hash = `#arena/${id}`, darkId); await ready();
  await page.getByRole('button', { name: '切换到纸面，当前墨色', exact: true }).click();
  await page.evaluate(id => location.hash = `#arena/${id}`, letterId); await ready();
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('aob-theme')]), ['paper', 'paper']);
  // Synchronized filters keep originals mounted and never reset selection or identity.
  await page.goto(`${base}/#arena/q-200d4b7f9c69b79c`); await ready();
  const originals = await page.locator('.text-original').allTextContents();
  for (const [label, key] of [['王家卫', 'cinema'], ['业主群大妈', 'voice'], ['看全篇', 'all'], ['张爱玲', 'prose']]) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
    assert.deepEqual(await page.locator('.text-reading').evaluateAll(els => els.map(el => el.dataset.channel)), [key, key]);
    assert.deepEqual(await page.locator('.text-original').allTextContents(), originals);
    if (key !== 'all') assert.ok(await page.locator(`.text-channel-${key}`).first().isVisible());
  }
  await page.getByRole('button', { name: /王家卫/ }).click();
  await page.locator('.vote-b').click(); await page.waitForSelector('.phase-result');
  await page.getByRole('button', { name: /看全篇/ }).click();
  assert.equal(await page.locator('.phase-result').count(), 1);
  await page.getByRole('button', { name: '同一题库继续', exact: true }).click(); await ready();
  assert.deepEqual(await page.locator('.text-reading').evaluateAll(els => els.map(el => el.dataset.channel)), ['prose', 'prose']);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /业主群大妈/ }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.getByRole('button', { name: /看全篇/ }).click();
  for (const reading of await page.locator('.text-reading').all()) {
    await reading.evaluate(el => el.scrollTop = el.scrollHeight);
    assert.ok(await reading.evaluate(el => Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 2));
  }
  await page.getByRole('button', { name: /王家卫/ }).click();
  assert.deepEqual(await page.locator('.text-reading').evaluateAll(els => els.map(el => el.scrollTop)), [0, 0]);
  await page.goto(`${base}/#arena/${letterId}`); await ready();
  await page.evaluate(() => Math.random = () => .8);
  await startRecording();
  await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
  await page.waitForURL(`**/#arena/${darkId}`); await ready();
  await endRecording('mobile-enter');
  await startRecording();
  await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
  await page.waitForFunction(id => location.hash !== `#arena/${id}`, darkId); await ready();
  await endRecording('mobile-next-exit');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'paper');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/#arena/${darkId}`); await ready();
  await page.getByRole('link', { name: '提示词库', exact: true }).click();
  await page.waitForURL('**/#prompts');
  await page.waitForFunction(() => !document.querySelector('.game-transition') && !document.documentElement.dataset.scene);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'paper');
  // Light scenes retain their own materials across the full surrounding page.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [id, scene] of [[letterId, 'letter'], ['013', 'forest'], ['q-200d4b7f9c69b79c', 'channels'], ['q-bfea3f9d2135205c', 'waiting']]) {
    await page.goto(`${base}/#arena/${id}`); await ready();
    const colors = await page.evaluate(() => {
      const root = document.documentElement;
      const shell = document.querySelector('.text-arena');
      const stage = document.querySelector('.arena-stage');
      return { scene: root.dataset.scene, theme: root.dataset.theme, outer: getComputedStyle(shell).backgroundColor, body: getComputedStyle(document.body).backgroundColor,
        surface: getComputedStyle(shell).getPropertyValue('--reading-stage').trim(), frame: getComputedStyle(stage).borderTopWidth,
        preference: localStorage.getItem('aob-theme') };
    });
    assert.equal(colors.scene, scene);
    assert.equal(colors.theme, 'paper');
    assert.equal(colors.preference, 'paper');
    assert.equal(colors.outer, colors.body);
    assert.equal(colors.frame, '0px');
    await startRecording();
    await page.getByRole('link', { name: '提示词库', exact: true }).click();
    await page.waitForURL('**/#prompts');
    await page.waitForFunction(() => !document.querySelector('.game-transition') && !document.documentElement.dataset.scene);
    await endRecording(`${scene}-exit`);
  }
  assert.deepEqual(errors, []);
  await writeFile('output/text-themes-review/polish-checks.json', JSON.stringify({ captures, errors, channels: 'sync/originals/reveal/continue/mobile/scroll passed', preference: 'paper/ink/change while dark/reduced exit passed' }, null, 2));
  console.log('PASS scene material blend, viewport coverage, preference restore, channel switches, originals and reduced motion', captures);
} finally { await browser.close(); }
