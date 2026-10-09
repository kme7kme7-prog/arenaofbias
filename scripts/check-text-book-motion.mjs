import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:5444', out = 'output/text-themes-review/book-motion';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], results = [];
const snapshot = JSON.parse(await readFile('.local/text-themes-review/snapshot.json','utf8'));
const pool = snapshot.prompts.filter(p => {
  const works = snapshot.works.filter(w=>w.promptId===p.id && w.modelId && !w.isDemo);
  return works.length>=10 && new Set(works.map(w=>w.modelId)).size>=2;
});
page.on('pageerror', e => errors.push(e.message));
const ready = async () => { await page.waitForSelector('.phase-voting'); await page.waitForFunction(() => !document.querySelector('.game-transition')); };
try {
  await page.goto(`${base}/reference/text-book-motion-review.html`);
  for (const scene of ['forest','letter','blackout','waiting','channels','reading']) {
    const result = await page.evaluate(async scene => {
      const { createGameTransition } = await import('/lib/game-transitions.ts');
      let swaps = 0, finishes = 0, open = false;
      const run = createGameTransition('match', { readingScene: scene, holdGate: () => open, onCovered: () => swaps++, onFinish: () => finishes++ });
      run.play();
      await new Promise(resolve => {
        const sample = () => run.layer.dataset.gtHold ? resolve() : requestAnimationFrame(sample); sample();
      });
      const backing = run.layer.querySelector('.gt-reading-ground');
      const rect = backing.getBoundingClientRect();
      const held = { swaps, opacity: +getComputedStyle(backing).opacity, covered: rect.width >= innerWidth && rect.height >= innerHeight, phase: run.layer.dataset.gtPhase };
      const tracks = run.layer.getAnimations({ subtree: true }).flatMap(a => a.effect.getKeyframes());
      const safe = tracks.every(f => Object.keys(f).every(k => ['offset','computedOffset','easing','composite','transform','opacity'].includes(k)));
      // Flat leaves must meet at the seam, including letter's horizontal fold.
      run.seek(run.timing.exitStart);
      const leaves = [...run.layer.querySelectorAll('.gt-reading-leaf')].map(el => { const r=el.getBoundingClientRect(); return { x:r.x,y:r.y,w:r.width,h:r.height }; });
      const joined = scene === 'letter'
        ? leaves.every(r=>r.w>=innerWidth) && leaves[0].y<=0 && leaves[1].y+leaves[1].h>=innerHeight && leaves[0].y+leaves[0].h>=leaves[1].y
        : leaves.every(r=>r.h>=innerHeight) && leaves[0].x<=0 && leaves[1].x+leaves[1].w>=innerWidth && leaves[0].x+leaves[0].w>=leaves[1].x;
      open = true;
      await new Promise(resolve => { const sample = () => finishes ? resolve() : requestAnimationFrame(sample); sample(); });
      return { scene, held, safe, joined, swaps, finishes, removed: !run.layer.isConnected };
    }, scene);
    assert.deepEqual(result.held, { swaps: 1, opacity: 1, covered: true, phase: 'entry' });
    assert.ok(result.safe && result.joined && result.removed && result.swaps === 1 && result.finishes === 1);
    results.push(result);
  }
  for (const [scene,id] of [['forest','013'],['blackout','q-b23ef619e82dec65'],['letter','q-1b9d4f59c2d7b31e']]) {
    const catalog = Promise.all(['prompts','works'].map(name=>page.waitForResponse(r=>r.url().includes(`/api/${name}`) && r.status()===200)));
    await page.goto(`${base}/?motion-check=${scene}#play`,{waitUntil:'domcontentloaded'});
    await catalog;
    await page.waitForSelector('.play-classic');
    await page.evaluate(value=>{window.__oldRandom=Math.random;Math.random=()=>value;},(pool.findIndex(p=>p.id===id)+.5)/pool.length);
    await page.getByRole('link',{name:/娱乐测评/}).evaluate(el=>{el.click();el.click();});
    assert.equal(await page.locator('.game-transition').count(),1,'repeated entry clicks share one curtain');
    assert.equal(await page.locator('.game-transition').getAttribute('data-reading-scene'),scene);
    await page.waitForURL(url=>url.hash===`#arena/${id}`,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>Math.random=window.__oldRandom);
    await ready();
    await page.getByRole('button', {name:'同一题库继续',exact:true}).click();
    await page.waitForSelector('.phase-transition');
    await page.waitForTimeout(460);
    const cover = await page.locator('.transition-shutter').evaluate(el => ({ before: getComputedStyle(el,'::before').transform, opacity: getComputedStyle(el,'::before').opacity, bg: getComputedStyle(el,'::before').backgroundColor, text:el.textContent }));
    assert.ok(!cover.text.includes('SWITCHING FREQUENCY'));
    assert.equal(cover.opacity, '1');
    assert.ok(cover.bg !== 'rgba(0, 0, 0, 0)');
    await ready();
    await page.waitForTimeout(700);
    const pages = await page.locator('.contender').evaluateAll(els => els.map(el => {
      const style=getComputedStyle(el), matrix=new DOMMatrixReadOnly(style.transform);
      return { transform: [matrix.m11,matrix.m22,matrix.m33,matrix.m41,matrix.m42], edge:parseFloat(getComputedStyle(el,'::after').height) };
    }));
    assert.ok(pages.every(p => JSON.stringify(p.transform) === JSON.stringify([1,1,1,0,0])));
    if(scene!=='letter') assert.ok(pages.every(p => p.edge >= 9 && p.edge <= 14));
    results.push({scene,sameTopic:true,cover,pages});
    await page.screenshot({path:`${out}/${scene}-rest.png`,fullPage:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.reload(); await ready();
  assert.equal(await page.locator('.contender').first().evaluate(el => el.getAnimations().length),0);
  assert.equal(await page.locator('.transition-shutter').evaluate(el=>getComputedStyle(el,'::before').visibility),'hidden');
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/checks.json`,JSON.stringify(results,null,2));
  console.log(`PASS: six material curtains preserve the ready gate; three same-topic transitions; book depth; settled pages; reduced motion; ${errors.length} page errors.`);
} finally { await browser.close(); }
