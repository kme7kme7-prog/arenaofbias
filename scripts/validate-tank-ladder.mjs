import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { startServer } from '../tools/tank-ladder/server.mjs';

const out=path.resolve('.local/tank-ladder-qa',randomUUID());mkdirSync(out,{recursive:true});
let app=await startServer({port:0,directory:path.join(out,'data')});
const url=`http://127.0.0.1:${app.port}`;
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[],checks=[];
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#entry-count').textContent==='22');
  for(const [width,height] of [[2560,1440],[1920,1080],[1366,768],[768,1024],[390,844],[320,700]]){
    await page.setViewportSize({width,height});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}`);
    await page.screenshot({animations:'disabled',path:path.join(out,`paper-${width}.png`),fullPage:true});checks.push(`layout ${width}`);
  }
  await page.setViewportSize({width:1920,height:1080});await page.locator('#theme').click();
  assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(32, 43, 40)');
  await page.screenshot({animations:'disabled',path:path.join(out,'ink-1920.png'),fullPage:true});await page.locator('#theme').click();
  await page.locator('#upload-open').click();
  await page.locator('[name=name]').fill('浏览器试赛坦克');await page.locator('[name=model]').fill('测试 / 非模型作品');await page.locator('[name=effort]').selectOption('high');
  await page.locator('#bot-file').setInputFiles({name:'bot.js',mimeType:'text/javascript',buffer:readFileSync('tools/tank-ladder/public/starter.js')});
  await page.locator('#submit-bot').click();await page.locator('[data-batch]').waitFor({timeout:30000});checks.push('upload/check/activate');
  await page.locator('[data-batch]').click();
  await page.waitForFunction(()=>document.querySelector('#match-count').textContent!=='0',null,{timeout:180000});
  await page.locator('#queue-pause').click();
  await page.waitForFunction(()=>document.querySelector('#queue-resume').hidden===false);
  await page.locator('#queue-resume').click();
  const deadline=Date.now()+600000;
  while(true){
    const progress=await page.evaluate(async()=>await(await fetch('/api/state')).json());
    if(progress.jobs.filter(j=>j.kind==='match'&&['completed','failed'].includes(j.status)).length===12)break;
    assert(Date.now()<deadline,'real match batch exceeded ten-minute test limit');
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  const state=await page.evaluate(async()=>await(await fetch('/api/state')).json());
  assert.equal(state.mine[0].games,12);assert.equal(state.matches.length,12);assert.equal(state.jobs.filter(j=>j.status==='failed').length,0);
  assert.equal(state.rankings.reduce((n,r)=>n+r.games,0),48);checks.push('12 real games / 48 appearances / pause-resume');
  await page.getByRole('button',{name:'排位大厅',exact:true}).click();await page.screenshot({animations:'disabled',path:path.join(out,'hall-results.png'),fullPage:true});
  await page.locator('#featured-watch').click();await page.locator('#replay-dialog').waitFor();
  await page.locator('#play-toggle').click();await page.locator('#seek').fill('80');
  await page.locator('#speed').selectOption('2');await page.locator('#play-toggle').click();
  await page.screenshot({animations:'disabled',path:path.join(out,'replay.png'),fullPage:true});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#replay-dialog').evaluate(d=>d.open),false);checks.push('replay / seek / speed / close');
  await page.locator('[data-tab=mine]').click();await page.locator('[data-new-version]').click();
  await page.locator('#bot-file').setInputFiles({name:'broken.js',mimeType:'text/javascript',buffer:Buffer.from('function decide(){while(true){}}')});await page.locator('#submit-bot').click();
  await page.waitForFunction(()=>document.querySelector('#my-works').textContent.includes('检查未通过'),null,{timeout:30000});
  const next=await page.evaluate(async()=>await(await fetch('/api/state')).json());assert.equal(next.mine.find(v=>v.number===1).active,next.mine.find(v=>v.number===1).id);checks.push('bad update rejected / old active version preserved');
  const exported=await(await fetch(url+'/api/export')).json();assert.equal(exported.recentMatches.length,12);assert(!JSON.stringify(exported).includes('function decide'));checks.push('export / no source');
  await app.close();app=await startServer({port:0,directory:path.join(out,'data'),compute:false});
  await page.goto(`http://127.0.0.1:${app.port}`);await page.waitForFunction(()=>document.querySelector('#match-count').textContent==='12');
  const restored=await page.evaluate(async()=>await(await fetch('/api/state')).json());
  assert.equal(restored.mine.length,2);assert.equal(restored.mine.find(v=>v.number===1).games,12);assert.equal(restored.matches.length,12);
  checks.push('server restart / identity, versions, ratings and replays persist');
  assert.deepEqual(errors,[]);
  writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,state:{matches:state.counts.matches,appearances:48,faults:state.rankings.reduce((n,r)=>n+r.faults,0)}},null,2));
  mkdirSync('.local/tank-ladder-qa',{recursive:true});writeFileSync('.local/tank-ladder-qa/latest.json',JSON.stringify({out}));
  console.log(JSON.stringify({out,checks,errors}));
}finally{await browser.close();await app.close();}
