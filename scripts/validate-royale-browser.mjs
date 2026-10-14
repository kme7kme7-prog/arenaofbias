import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.ROYALE_ORIGIN || 'http://127.0.0.1:5464';
const out = '.local/royale-qa/browser'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [], checks = [], games = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/**', r => r.fulfill({ json: { user: null } }));
try {
  await page.goto(`${origin}/tanks.html`);
  await page.getByRole('link', { name: '大逃杀 ↗', exact: true }).click();
  await page.locator('#r-start').waitFor();
  await page.waitForFunction(() => !window.PlaygroundEntry?.active);
  checks.push('four-player to royale wipe');
  assert(await page.locator('#r-start').isDisabled());
  for (const [width,height] of [[2560,1440],[1920,1080],[1366,768],[1024,900],[768,1024],[390,844],[320,720]]) {
    await page.setViewportSize({width,height});
    for (const theme of ['paper','ink']) {
      await page.evaluate(t => { document.documentElement.dataset.theme=t; },theme);
      await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
      // Wait on actual square layout after ResizeObserver updates.
      await page.waitForFunction(() => {const r=document.querySelector('#r-board').getBoundingClientRect();return Math.abs(r.width-r.height)<2 && r.width>100;});
      const layout=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,board:document.querySelector('#r-board').getBoundingClientRect().toJSON()}));
      assert(layout.sw<=width+1,JSON.stringify(layout));
      if(width>850)assert(layout.sh<=height+1,JSON.stringify(layout));
      checks.push({width,height,theme,layout});
      if([1920,390,1024].includes(width))await page.screenshot({path:`${out}/${width}-${theme}.png`,fullPage:true});
    }
  }
  await page.setViewportSize({width:1920,height:1080});await page.evaluate(()=>document.documentElement.dataset.theme='paper');
  await page.locator('#r-search').fill('Step');assert.equal(await page.locator('.r-card').count(),1);
  const titleWidth=await page.locator('.r-card-copy').evaluate(e=>e.clientWidth);assert(titleWidth>100);
  await page.locator('#r-search').fill('');
  await page.locator('#r-all').click();assert.equal(await page.locator('#r-count').innerText(),'21');
  await page.locator('#r-start').click();await page.locator('#r-cancel').click();
  await page.waitForFunction(()=>!document.querySelector('#r-start').disabled);assert(await page.locator('#r-computing').isHidden());checks.push('load/compute cancellation returns usable setup');
  for (const [terrain,scale,seed] of [['ruins','auto','2'],['grove','wide','81']]) {
    await page.locator(`[data-map="${terrain}"]`).click();await page.locator('#r-scale').selectOption(scale);await page.locator('#r-seed').fill(seed);await page.locator('#r-seed').blur();
    const start=Date.now();await page.locator('#r-start').click();
    await page.waitForFunction(()=>!document.querySelector('#r-play').disabled,{},{timeout:240000});
    const computeMs=Date.now()-start;
    await page.locator('#r-play').click();const max=await page.locator('#r-seek').getAttribute('max');await page.locator('#r-seek').fill(max);
    await page.locator('#r-result').waitFor({state:'visible'});
    const rows=await page.locator('.r-card-copy small').allTextContents();assert(!rows.some(t=>/程序异常|决策超时/.test(t)),JSON.stringify(rows));
    assert.equal(rows.length,21);assert((await page.locator('#r-winner').innerText()).length>0);
    games.push({terrain,scale,seed,computeMs,frames:Number(max)+1,winner:await page.locator('#r-winner').innerText(),rows});
    await page.screenshot({path:`${out}/result-${terrain}.png`});
    await page.locator('#r-seek').fill('180');await page.waitForFunction(()=>document.querySelector('#r-result').hidden);assert(await page.locator('#r-result').isHidden());
    await page.screenshot({path:`${out}/battle-${terrain}.png`});
    if (await page.locator('#r-ranking-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#r-ranking-toggle').click();
    await page.locator('.r-card').first().click();await page.waitForFunction(()=>document.querySelector('.r-card').getAttribute('aria-pressed')==='true');
    await page.locator('#r-reset').click();assert.equal(await page.locator('#r-count').innerText(),'21');checks.push(`${terrain} replay seek/focus/reset`);
  }
  await page.getByRole('link',{name:'← 返回四人赛'}).click();await page.locator('#open-library').waitFor();await page.waitForFunction(()=>!window.PlaygroundEntry?.active);checks.push('return wipe and original four-player controls');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({checks:checks.length,games,errors},null,2));
} finally { await writeFile(`${out}/results.json`,JSON.stringify({checks,games,errors},null,2));await browser.close(); }
