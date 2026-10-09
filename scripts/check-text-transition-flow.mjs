import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:5444';
const out = 'output/text-themes-review/transition-flow';
const baseline = process.argv.includes('--baseline');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], results = [];
page.on('pageerror', e => errors.push(e.message));
const ready = async () => {
  await page.waitForSelector('.phase-voting');
  await page.waitForFunction(() => !document.querySelector('.game-transition,.theme-curtain'));
};
const check = (pass, message) => { results.push({ message, pass }); if (!baseline) assert.ok(pass, message); };
try {
  await mkdir(out, { recursive: true });
  // A real same-topic swap: both halves must use the same fold on every theme.
  for (const [scene, id] of [['blackout','q-b23ef619e82dec65'], ['letter','q-1b9d4f59c2d7b31e']]) {
    await page.goto(`${base}/#arena/${id}`); await ready();
    await page.getByRole('button', { name: '同一题库继续', exact: true }).click();
    await page.waitForSelector('.shutter-exit');
    const names = await page.locator('.transition-shutter').evaluate(el => ['::before','::after'].map(pseudo => getComputedStyle(el, pseudo).animationName));
    results.push({ scene, names });
    check(names[0] === names[1] && names[0].startsWith('text-'), `${scene}: no legacy sweep mixed with fold`);
    await ready();
  }
  // Whole-screen paper already covers the heading. Old line masks must not start.
  await page.evaluate(() => Math.random = () => .8);
  await page.getByRole('button', { name: '换个题库继续', exact: true }).click();
  const masks = await page.locator('.swap-mask-window').count();
  results.push({ masks }); check(masks === 0, 'full-scene route has no second line-mask transition');
  await page.waitForSelector('.game-transition[data-gt-phase="exit"]');
  // The work-ready gate opens before the route curtain has finished leaving.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    [...document.querySelectorAll('button')].find(el => el.textContent.includes('重播入场'))?.click();
  });
  check(await page.locator('.phase-transition').count() === 0, 'keyboard and replay cannot start a local shutter during route exit');
  await ready();
  // Two actions queued before React commits must not own two routing curtains.
  const overlaps = await page.evaluate(() => {
    document.querySelector('.topbar a[href="#prompts"]').click();
    document.querySelector('.topbar a[href="#home"]').click();
    return document.querySelectorAll('.game-transition').length;
  });
  results.push({ overlaps }); check(overlaps === 1, 'different navigation entries share the active curtain guard');
  await page.waitForFunction(() => !document.querySelector('.game-transition'));
  if (!baseline) {
    // The regression was theme/order dependent. Exercise each carrier in ink,
    // and repeat the affected book and envelope on narrow screens.
    const cases = [
      ['forest','013',1440,''], ['letter','q-1b9d4f59c2d7b31e',1440,''],
      ['waiting','q-bfea3f9d2135205c',1440,''], ['channels','q-200d4b7f9c69b79c',1440,''],
      ['reading','q-1b9d4f59c2d7b31e',1440,'?presentation=reading'],
      ['blackout','q-b23ef619e82dec65',390,''], ['letter','q-1b9d4f59c2d7b31e',390,''],
    ];
    for (const [scene,id,width,query] of cases) {
      await page.evaluate(() => localStorage.setItem('aob-theme','ink'));
      await page.setViewportSize({width,height:1000});
      await page.goto(`${base}/${query}#arena/${id}`); await ready();
      await page.getByRole('button',{name:'同一题库继续',exact:true}).click();
      await page.waitForSelector('.shutter-exit');
      const names = await page.locator('.transition-shutter').evaluate(el => ['::before','::after'].map(p => getComputedStyle(el,p).animationName));
      check(names[0] === names[1] && names[0].startsWith('text-'), `${scene} ink ${width}: both leaves fold together`);
      await ready();
      check(await page.locator('.transition-shutter').evaluate(el => getComputedStyle(el).visibility === 'hidden'), `${scene}: no curtain left at rest`);
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(`${base}/#arena/q-1b9d4f59c2d7b31e`); await ready();
    // Starting with a theme wipe used to allow a route to be drawn underneath it.
    await page.locator('.theme-toggle-main').click();
    await page.waitForSelector('.theme-curtain');
    await page.getByRole('button',{name:'换个题库继续',exact:true}).evaluate(el => el.click());
    check(await page.locator('.game-transition').count() === 0, 'theme-first: route waits for the current surface wipe');
    await page.waitForFunction(() => !document.querySelector('.theme-curtain'));
    // Conversely, a theme request waits through the local shutter EXIT as well.
    await page.getByRole('button',{name:'同一题库继续',exact:true}).click();
    await page.waitForSelector('.shutter-exit');
    await page.evaluate(() => {
      window.__flowSampling = true; window.__flowOverlaps = 0;
      const sample = () => {
        if (document.querySelector('.shutter-exit') && document.querySelector('.theme-curtain')) window.__flowOverlaps++;
        if (window.__flowSampling) requestAnimationFrame(sample);
      }; sample(); document.querySelector('.theme-toggle-main').click();
    });
    await page.waitForSelector('.theme-curtain');
    await page.waitForFunction(() => !document.querySelector('.theme-curtain'));
    const doubleFrames = await page.evaluate(() => { window.__flowSampling=false; return window.__flowOverlaps; });
    check(doubleFrames === 0, 'shutter-first: theme never covers the fold exit');
    const original = await page.locator('.text-originals').allTextContents();
    await page.evaluate(() => {
      window.__replayPhases = [];
      const arena = document.querySelector('.arena-shell');
      const observer = new MutationObserver(() => {
        const phase = [...arena.classList].find(name => name.startsWith('phase-'));
        if (window.__replayPhases.at(-1)?.phase !== phase) window.__replayPhases.push({phase,time:performance.now()});
        if (phase === 'phase-voting') observer.disconnect();
      });
      observer.observe(arena,{attributes:true,attributeFilter:['class']});
      const buttons = [...document.querySelectorAll('button')];
      buttons.find(el=>el.textContent.trim()==='重播入场').click();
      buttons.find(el=>el.textContent.trim()==='同一题库继续').click();
    });
    await page.waitForFunction(() => window.__replayPhases.some(item => item.phase === 'phase-voting'));
    await ready();
    const phases = await page.evaluate(() => window.__replayPhases);
    check(phases.find(p=>p.phase==='phase-intro').time - phases.find(p=>p.phase==='phase-transition').time >= 450, 'cached replay finishes closing before it starts to open');
    assert.deepEqual(await page.locator('.text-originals').allTextContents(),original, 'replay keeps the pair when next is queued in the same turn');
    results.push({message:'replay/next burst keeps one action and unlocks afterward',pass:true});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.getByRole('button',{name:'同一题库继续',exact:true}).click();
    await page.waitForSelector('.phase-transition'); await ready();
    check(await page.locator('.transition-shutter').evaluate(el => getComputedStyle(el,'::before').visibility === 'hidden'), 'reduced motion finishes with no invisible input blocker');
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${out}/${baseline ? 'baseline' : 'checks'}.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
