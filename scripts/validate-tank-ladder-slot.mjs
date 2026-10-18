import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startServer } from '../tools/tank-ladder/server.mjs';

const out=path.resolve('.local/tank-ladder-slot-qa',randomUUID());mkdirSync(out,{recursive:true});
const app=await startServer({port:0,directory:path.join(out,'data')});
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${app.port}`);
  await page.waitForFunction(()=>document.querySelector('#entry-count').textContent==='22');
  for(const name of ['主力一号','候选二号']){
    await page.locator('#upload-open').click();await page.locator('[name=name]').fill(name);await page.locator('[name=model]').fill('测试模型');
    await page.locator('#bot-file').setInputFiles({name:'bot.js',mimeType:'text/javascript',buffer:Buffer.from(`function decide(){return {move:'stay',fire:false}}\n// ${name}`)});
    await page.locator('#submit-bot').click();
    if(name==='主力一号')await page.locator('[data-batch]').waitFor();else await page.locator('[data-activate]').waitFor();
  }
  const read=()=>page.evaluate(async()=>await(await fetch('/api/state')).json());
  const before=await read();const first=before.mine.find(v=>v.name==='主力一号'),second=before.mine.find(v=>v.name==='候选二号');
  assert.deepEqual(before.rankings.filter(r=>!r.official).map(r=>r.id),[first.id]);
  await page.locator(`[data-activate="${second.id}"]`).click();await page.locator(`[data-batch="${second.id}"]`).waitFor();
  const after=await read();assert.deepEqual(after.rankings.filter(r=>!r.official).map(r=>r.id),[second.id]);assert.equal(after.mine.length,2);
  assert.equal(await page.locator('#my-works .badge.active').count(),1);
  await page.screenshot({path:path.join(out,'one-active.png'),fullPage:true,animations:'disabled'});
  await page.reload();await page.locator('[data-tab=mine]').click();await page.locator(`[data-batch="${second.id}"]`).waitFor();
  await page.locator(`[data-activate="${first.id}"]`).click();await page.locator(`[data-batch="${first.id}"]`).waitFor();
  const restored=await read();assert.deepEqual(restored.rankings.filter(r=>!r.official).map(r=>r.id),[first.id]);assert.equal(restored.mine.length,2);
  assert.deepEqual(errors,[]);const result={checks:['first upload auto-selects','second upload stays candidate','switch has one ranked entry','both works preserved','reload preserves selection','switch back succeeds'],errors};
  writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({out,...result}));
}finally{await browser.close();await app.close();}
