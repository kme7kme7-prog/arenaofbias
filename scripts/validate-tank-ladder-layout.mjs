import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { startServer } from '../tools/tank-ladder/server.mjs';

const out=path.resolve('.local/tank-ladder-layout-qa',randomUUID());mkdirSync(out,{recursive:true});
const app=await startServer({port:0,directory:path.join(out,'data'),compute:false});
const browser=await chromium.launch({channel:'msedge',headless:true});
const checks=[],errors=[],shots=[];
const url=`http://127.0.0.1:${app.port}`;
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>document.querySelectorAll('#rankings [data-detail]').length===6);
  const state=await page.evaluate(async()=>await(await fetch('/api/state')).json());
  assert.equal(state.rankings.length,22);
  const seen=new Set();
  for(let i=1;i<=4;i++){
    if(i>1)await page.locator('#rank-pages').getByRole('button',{name:`第 ${i} 页`,exact:true}).click();
    for(const id of await page.locator('#rankings [data-detail]').evaluateAll(els=>els.map(el=>el.dataset.detail)))seen.add(id);
  }
  assert.equal(seen.size,22);checks.push('all 22 entries reachable across 4 pages');
  const target=state.rankings.at(-1);
  await page.locator('#search').fill(target.name);
  assert((await page.locator('#rankings').innerText()).includes(target.name));
  assert((await page.locator('#rank-pages').innerText()).startsWith('1–'));
  await page.locator('#search').fill('没有这样的坦克----');assert.equal(await page.locator('#rankings .empty-row').count(),1);
  await page.locator('#search').fill('');checks.push('search resets last page / empty result / restores');

  // Visual fixtures stay in this browser context and never write to the live preview.
  const fixture=structuredClone(state);
  fixture.rankings=fixture.rankings.map((r,i)=>({...r,games:i<17?24:8,provisional:i>=17,rating:1520-i*23,winRate:(22-i)/40,avgKills:3.8-i*.08,avgPoints:12.5-i*.2}));
  fixture.mine=Array.from({length:6},(_,w)=>Array.from({length:4},(_,v)=>({...fixture.rankings[w],id:`fixture-v-${w}-${v}`,work:`fixture-w-${w}`,name:`训练坦克 ${w+1}`,official:false,number:4-v,active:w===0?'fixture-v-0-0':null,status:v===0&&w===1?'rejected':'ready',issue:v===0&&w===1?'运行检查未通过：这是一条用于布局验证的较长错误信息。':'',note:v===0?'测试候选版本；历史版本需要完整展开查看。':''}))).flat();
  fixture.jobs=Array.from({length:19},(_,i)=>({id:`job-${i}`,created:Date.now()-i*90000,kind:i%4?'match':'validate',status:i<2?'held':'completed',issue:i===3?'布局样本：完整显示任务信息，不使用内部滚动条。':''}));
  let replay;
  const historical=path.resolve('.local/tank-ladder-qa/4cba53cb-b28d-446f-b1d9-84244e4facfb/data/ladder.sqlite');
  if(existsSync(historical)){
    const db=new DatabaseSync(historical,{readOnly:true});const row=db.prepare('SELECT summary,replay FROM matches LIMIT 1').get();db.close();
    replay=JSON.parse(gunzipSync(row.replay));const summary=JSON.parse(row.summary);
    fixture.matches=Array.from({length:14},(_,i)=>({...summary,id:`fixture-match-${i}`,created:Date.now()-i*900000}));fixture.counts.matches=14;
  }
  await page.route('**/api/state',route=>route.fulfill({json:fixture}));
  if(replay)await page.route('**/api/matches/*/replay',route=>route.fulfill({json:replay}));
  await page.reload();await page.waitForFunction(()=>{const score=document.querySelector('#rankings .score');return score&&score.textContent!=='—';});
  await page.locator('[data-sort=winRate]').click();assert.equal(await page.locator('[aria-sort=descending] button').getAttribute('data-sort'),'winRate');
  await page.locator('[data-sort=rating]').click();
  await page.locator('#rank-pages').getByRole('button',{name:'第 2 页',exact:true}).click();
  // A genuine poll with changed state must preserve the selected page.
  const nextPoll=page.waitForResponse(r=>r.url().endsWith('/api/state'));
  fixture.rankings[0].rating++;await nextPoll;
  assert.equal(await page.locator('#rank-pages [aria-current=page]').innerText(),'2');
  await page.locator('#rank-pages').getByRole('button',{name:'第 1 页',exact:true}).click();checks.push('sort and live refresh retain pagination state');

  async function layout(label){
    const result=await page.evaluate(()=>({
      horizontal:document.documentElement.scrollWidth>innerWidth+1,
      nested:[...document.querySelectorAll('body *')].filter(el=>{
        if(!el.getClientRects().length || el.matches('dialog,input,select,option,textarea') || el.closest('[hidden],details:not([open]) .version-row'))return false;
        const s=getComputedStyle(el);return /auto|scroll/.test(s.overflowY)&&el.scrollHeight>el.clientHeight+2;
      }).map(el=>el.id||el.className),
      clipped:[...document.querySelectorAll('.tank-info strong,.tank-info small,.contender strong,.version-row,.job')].filter(el=>el.getClientRects().length && el.scrollWidth>el.clientWidth+2).map(el=>el.className)
    }));
    assert.equal(result.horizontal,false,`${label}: horizontal overflow`);assert.deepEqual(result.nested,[],`${label}: nested scroll`);assert.deepEqual(result.clipped,[],`${label}: clipped text`);
    const file=path.join(out,`${label}.png`);await page.screenshot({path:file,fullPage:!(await page.locator('dialog[open]').count()),animations:'disabled'});shots.push(file);
  }
  for(const [width,height] of [[2560,1440],[1920,1080],[1366,768],[768,1024],[390,844],[320,700]]){
    await page.setViewportSize({width,height});
    for(const tab of ['hall','mine','matches','guide']){
      await page.locator(`[data-tab=${tab}]`).click();
      if(tab==='guide')await page.locator('.rules').evaluate(el=>el.open=true);
      if(tab==='mine')await page.locator('[data-history]').first().evaluate(el=>el.open=true);
      await layout(`${tab}-${width}`);
    }
    await page.locator('#upload-open').click();await layout(`upload-${width}`);
    await page.locator('#submit-bot').scrollIntoViewIfNeeded();
    assert(await page.locator('#submit-bot').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1;}),'submit reachable inside the single dialog scroll surface');
    await page.keyboard.press('Escape');
    await page.locator('[data-tab=hall]').click();await page.locator('[data-detail]').first().click();await layout(`detail-${width}`);await page.keyboard.press('Escape');
    if(replay){
      await page.locator('#featured-watch').click();await page.locator('#replay-dialog[open]').waitFor();await layout(`replay-${width}`);
      if(width>=1000)assert(await page.locator('#replay-dialog').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'desktop replay and controls fit together');
      await page.locator('#speed').selectOption('2');await page.locator('#seek').fill('60');await page.keyboard.press('Escape');
    }
    checks.push(`all views + dialogs ${width}x${height}`);
  }
  await page.setViewportSize({width:1920,height:1080});await page.locator('#theme').click();await layout('hall-ink');
  await page.locator('#upload-open').click();await layout('upload-ink');await page.keyboard.press('Escape');
  await page.locator('[data-tab=mine]').click();
  await page.locator('#works-pages').getByRole('button',{name:'第 2 页',exact:true}).click();assert.equal(await page.locator('.work-card').count(),2);
  await page.locator('#jobs-pages').getByRole('button',{name:'第 4 页',exact:true}).click();assert.equal(await page.locator('.job').count(),1);
  await page.locator('[data-tab=matches]').click();
  if(replay){await page.locator('#matches-pages').getByRole('button',{name:'第 3 页',exact:true}).click();assert.equal(await page.locator('.match-card').count(),2);}
  checks.push('works, queue and match pagination; ink theme; replay controls');assert.deepEqual(errors,[]);
  writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,shots,fixtureOnly:true,historicalReplay:!!replay},null,2));
  writeFileSync('.local/tank-ladder-layout-qa/latest.json',JSON.stringify({out}));console.log(JSON.stringify({out,checks,errors,shots:shots.length}));
}finally{await browser.close();await app.close();}
