import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const entry = process.argv[2] || process.env.PLAYGROUND_ENTRY || 'http://127.0.0.1:5446/reference/playground.html';
const production = new URL(entry).pathname === '/playground.html';
const output = production ? 'output/playground/main-integration/passage' : 'output/playground/reader-context-passage';
await mkdir(output, { recursive: true });
const catalog = JSON.parse(await readFile(`${production ? 'app/playground' : 'reference'}/playground-catalog.json`, 'utf8'));
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 880 } });
const checks = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
const check = (value, label) => { assert.ok(value, label); checks.push(label); };
await page.addInitScript(() => {
  window.__passageFrames = []; let previous = '';
  const sample = () => {
    const layers = document.querySelectorAll('.pg-passage');
    const layer = layers[0], sheet = layer?.querySelector('.pg-passage-sheet');
    const rect = sheet?.getBoundingClientRect();
    const works = [...document.querySelectorAll('.arena-stage [data-work-id]')].map(node => node.dataset.workId).join('|');
    const changed = !!previous && !!works && previous !== works;
    if (works) previous = works;
    const leaves = [...document.querySelectorAll('.pg-passage-leaf')];
    const targets = [...document.querySelectorAll('.arena-stage > .contender')];
    const localCovered = targets.length === 2 && targets.every((target, index) => {
      const a = target.getBoundingClientRect(), b = leaves[index]?.getBoundingClientRect();
      return b && b.top <= a.top + 2 && b.bottom >= a.bottom - 2 && b.left <= a.left + 2 && b.right >= a.right - 2 && Number(getComputedStyle(leaves[index]).opacity) >= .999;
    });
    const fullCovered = !!rect && rect.top <= 1 && rect.bottom >= innerHeight - 1 && rect.left <= 1 && rect.right >= innerWidth - 1 && Number(getComputedStyle(sheet).opacity) >= .999;
    const covered = fullCovered || (layer?.dataset.mode === 'round' && localCovered);
    const unfinishedCopy = [...document.querySelectorAll('.pg-scene-host :is(.forum-op,.forum-op-profile,.forum-op-body,.forum-reply-content,.panel-identity,.chat-message,.text-passage)')].filter(node => {
      if (!node.getClientRects().length || node.closest('[hidden]')) return false;
      return Number(getComputedStyle(node).opacity) < .999 || node.getAnimations().some(animation => animation instanceof CSSAnimation && animation.playState !== 'finished');
    }).map(node => node.className);
    window.__passageFrames.push({ at: performance.now(), layers: layers.length, mode: layer?.dataset.mode, sheetOpacity: sheet ? getComputedStyle(sheet).opacity : '', readerReady: !document.querySelector('.pg-scene-host') || !!document.querySelector('.phase-voting'), legacyMasks: document.querySelectorAll('.swap-mask-window,.pg-door:not(.pg-passage),.pg-journey-lock,.pg-passage-cover,.pg-passage-leaf').length, changed, covered, id: layer?.dataset.passageId, phase: layer?.dataset.phase, title: layer?.querySelector('.pg-passage-label')?.textContent, ink: layer ? getComputedStyle(layer).color : '', paper: sheet ? getComputedStyle(sheet).backgroundColor : '', book: document.querySelector('[data-book-opening]')?.dataset.bookOpening, pageTransform: targets[0]?.style.transform });
    window.__passageFrames.at(-1).unfinishedCopy = unfinishedCopy;
    if (window.__passageFrames.length > 3000) window.__passageFrames.shift();
    requestAnimationFrame(sample);
  }; requestAnimationFrame(sample);
});
const settled = async () => {
  await page.waitForSelector('.phase-voting');
  await page.waitForFunction(() => !document.querySelector('.pg-passage') && !document.getElementById('playground-root').inert);
};
const coverage = async label => {
  const frames = await page.evaluate(() => window.__passageFrames);
  await writeFile(`${output}/${label}-frames.json`, JSON.stringify(frames));
  check(frames.every(frame => frame.layers <= 1), `${label}: one passage owner`);
  check(frames.every(frame => frame.legacyMasks === 0), `${label}: no independent legacy masks`);
  check(frames.filter(frame => frame.changed).every(frame => frame.covered), `${label}: response changes only under full coverage`);
  check(frames.filter(frame => frame.layers).every(frame => frame.ink !== frame.paper), `${label}: ink and paper never become the same color`);
  const groups = new Map();
  for (const frame of frames.filter(frame => frame.id)) { if (!groups.has(frame.id)) groups.set(frame.id, []); groups.get(frame.id).push(frame); }
  check([...groups.values()].every(group => group.every(frame => frame.title === group[0].title && frame.ink === group[0].ink && frame.paper === group[0].paper)), `${label}: title and palette never jump during movement`);
  check(frames.filter(frame => frame.phase === 'hold').every(frame => frame.covered), `${label}: waiting keeps the changing content covered`);
  check([...groups.values()].filter(group => group[0].mode === 'entry').every(group => {
    // Loading can occupy the main thread after onCovered. The first observed
    // hold frame is then late; use the last closing sample as the boundary.
    const closing = group.findLast(frame => frame.phase === 'cover'), exit = group.find(frame => frame.phase === 'exit');
    return !closing || !exit || exit.at - closing.at >= 180;
  }), `${label}: doors keep the short minimum hold`);
  check([...groups.values()].filter(group => group[0].mode === 'round').every(group => {
    const hold = group.find(frame => frame.phase === 'hold'), exit = group.find(frame => frame.phase === 'exit');
    return !hold || !exit || exit.at - hold.at < 900;
  }), `${label}: same topic avoids repeating the long introduction`);
  check(frames.filter(frame => frame.phase === 'exit').every(frame => frame.readerReady), `${label}: final controls are committed before uncovering`);
  check(frames.filter(frame => frame.phase === 'exit' || !frame.layers).every(frame => frame.unfinishedCopy.length === 0), `${label}: nested text has no delayed second entrance`);
  const openingFrames = frames.filter(frame => frame.phase === 'exit' && frame.book !== undefined);
  if (openingFrames.length) check(openingFrames.some(frame => Number(frame.book) > .25 && Number(frame.book) < .8 && frame.sheetOpacity === '0' && frame.pageTransform.includes('rotateY')), `${label}: real pages visibly unfold while the doors open`);
  check(await page.locator('[data-book-opening],.pg-book-fold-shade').count() === 0, `${label}: page motion cleans up with the passage`);
};
try {
  for (const item of catalog) {
    console.log(`Checking ${item.skin}`);
    await page.goto(`${entry}?trial=passage-check#text`);
    await page.evaluate(() => { window.__passageFrames = []; });
    await page.locator(`.pg-story-${item.skin}:not([aria-disabled=true])`).click();
    await page.waitForFunction(() => document.querySelector('.pg-passage')?.dataset.phase === 'hold');
    check(await page.locator('.pg-passage > .pg-door-leaf').count() === 2, `${item.skin}: entry uses the original two paper doors`);
    check(await page.locator('.pg-door-pull').count() === 0, `${item.skin}: doors have no handles`);
    check(await page.locator('.pg-passage-label').textContent() === item.name, `${item.skin}: passage shows the destination topic name`);
    check(await page.locator('.pg-door-copy,.pg-door-scene,.pg-door-task,.pg-passage-next').count() === 0, `${item.skin}: doors carry no topic explanation or extra continue button`);
    await page.screenshot({ path: `${output}/${item.skin}-title.png` });
    await settled();
    await page.screenshot({ path: `${output}/${item.skin}-reader.png` });
    check(await page.locator('.pg-reader-header h1').textContent() === item.name, `${item.skin}: single header identifies topic`);
    check(!(await page.locator('.briefing').isVisible()), `${item.skin}: no duplicate heading bar`);
    if (item.skin === 'forest') {
      check(await page.locator('.text-reading:not(.text-reading-embedded)').evaluateAll(nodes => {
        const node = nodes.find(element => element.scrollHeight > element.clientHeight);
        if (!node) return false;
        node.scrollTop = node.scrollHeight;
        return Math.abs(node.scrollHeight - node.scrollTop - node.clientHeight) < 2;
      }), 'long text reaches its end inside the page');
      await page.locator('.expand-control').first().click();
      check(await page.locator('[role=dialog]:not(.pg-passage)').count() > 0, 'expanded reading still works');
      await page.keyboard.press('Escape');
    }
    for (const selector of ['.round-actions .text-button', '.continue-same']) {
      console.log(`  ${selector}`);
      await Promise.all([page.waitForFunction(() => document.querySelector('.pg-passage')?.dataset.phase === 'hold'), page.locator(selector).click()]);
      check(await page.locator('.pg-passage').getAttribute('data-mode') === 'round', `${item.skin}: continuation uses a short door cycle`);
      check(await page.locator('.pg-door-copy,.pg-passage-next').count() === 0, `${item.skin}: continuation keeps doors free of copy`);
      await settled();
    }
    check(await page.locator('.pg-reader-opening,.pg-reader-title,.pg-door,.pg-journey-lock').count() === 0, `${item.skin}: transition layers clean up after entry`);
    await coverage(item.skin);
    await page.locator('.pg-topic-toggle').click();
    check(await page.locator('.pg-topic-dialog').isVisible(), `${item.skin}: original prompt accessible`);
    await page.keyboard.press('Escape');
    await page.locator('.continue-other').click();
    await settled();
    check(!new URL(page.url()).hash.endsWith(`/${item.id}`), `${item.skin}: next topic works`);
    await coverage(`${item.skin}-next`);
  }
  // A delayed module must remain covered, be cancellable, and unlock the next visit.
  let release; const slow = new Promise(resolve => { release = resolve; });
  await page.route(production ? '**/assets/page-*.js' : '**/app/page.tsx*', async route => { await slow; await route.continue().catch(error => { if (!error.message.includes('already handled')) throw error; }); });
  await page.goto(`${entry}#text`);
  await page.locator('.pg-story-letter:not([aria-disabled=true])').click();
  await page.waitForFunction(() => { const status = document.querySelector('.pg-passage-status'); return status && !status.hidden; });
  check(await page.locator('.pg-passage[data-phase=hold]').count() === 1, 'slow module stays covered');
  check(await page.locator('.pg-passage-status').isVisible(), 'slow module shows waiting state');
  await page.keyboard.press('Enter');
  check(await page.locator('.pg-passage[data-phase=hold]').count() === 1, 'keyboard cannot bypass actual work readiness');
  await page.locator('.pg-passage-cancel').click();
  check(await page.evaluate(() => location.hash === '#text' && !document.querySelector('.game-transition') && !document.getElementById('playground-root').inert), 'cancel restores directory and input');
  release(); await page.unrouteAll({ behavior: 'wait' });
  await page.locator('.pg-story-orange').click(); await settled();
  check(await page.locator('.orange-arena').count() === 1, 'another topic opens after cancellation');
  // Cancellation during the closing segment must also release the works gate.
  await page.goto(`${entry}#text`);
  await page.locator('.pg-story-letter:not([aria-disabled=true])').click();
  await page.keyboard.press('Escape');
  await page.locator('.pg-story-forest').click(); await settled();
  check(await page.locator('[data-text-theme=forest]').count() === 1, 'early cancellation does not lock future entry');
  await page.locator('.continue-other').click();
  await page.keyboard.press('Escape');
  await page.waitForSelector('.pg-story-letter');
  await page.locator('.pg-story-letter').click(); await settled();
  check(await page.locator('.arena-stage > .contender').evaluateAll(nodes => nodes.every(node => !node.style.transform && !node.style.transformOrigin)), 'cancelling a transition leaves no transform on the next reader');
  await page.locator('.pg-reader-back').click();
  await page.waitForSelector('.pg-story-letter');
  await page.waitForFunction(() => !document.querySelector('.pg-passage'));
  await page.locator('.pg-story-letter').click();
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('.pg-passage'));
  check(await page.evaluate(() => !document.getElementById('playground-root').inert), 'browser back cancels the pending passage');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${entry}#text`);
  await page.locator('.pg-story-orange:not([aria-disabled=true])').click();
  await page.waitForFunction(() => document.querySelector('.pg-passage')?.dataset.phase === 'hold');
  await page.screenshot({ path: `${output}/mobile-title.png` }); await settled();
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile has no horizontal overflow');
  check(await page.locator('.pg-door-copy').count() === 0, 'mobile transition cleans up');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.continue-other').click(); await settled();
  check(await page.locator('.pg-passage').count() === 0, 'reduced motion completes and cleans up');
  check(errors.length === 0, 'no browser runtime errors');
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(`PASS ${checks.length} passage checks`);
} finally { await browser.close(); }
