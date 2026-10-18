import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { startServer } from '../server.mjs';

test('HTTP enforces identity, origin, CSRF, private source and byte limits', async () => {
  const app=await startServer({port:0,directory:mkdtempSync(path.join(os.tmpdir(),'tank-ladder-http-')),compute:false});
  const origin=`http://127.0.0.1:${app.port}`;
  const post=(url,body,headers={})=>fetch(origin+url,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(body)});
  try {
    const res=await post('/api/session',{});const cookie=res.headers.get('set-cookie').split(';')[0];const session=await res.json();
    const headers={Cookie:cookie,'X-CSRF-Token':session.csrf};
    assert.match(res.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    const payload={name:'<img src=x onerror=alert(1)>',model:'测试',effort:'high',source:'function decide(){return {move:"stay",fire:false}}'};
    assert.equal((await post('/api/versions',payload)).status,401);
    assert.equal((await post('/api/versions',payload,{Cookie:cookie})).status,403);
    assert.equal((await post('/api/versions',payload,{...headers,Origin:'https://evil.test'})).status,403);
    const badHost=await new Promise((resolve,reject)=>{const r=http.get(origin+'/api/state',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);});
    assert.equal(badHost,403);
    const accepted=await post('/api/versions',payload,headers);assert.equal(accepted.status,201);const version=await accepted.json();
    const second=await post('/api/session',{});const s2=await second.json();const h2={Cookie:second.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':s2.csrf};
    assert.equal((await post('/api/versions',{...payload,workId:version.work},h2)).status,404);
    assert.equal((await post('/api/versions',{...payload,source:'x'.repeat(300001)},headers)).status,413);
    assert.equal((await fetch(origin+'/app/tanks/bots/harrier.js')).status,404);
    assert.equal((await fetch(origin+'/server.mjs')).status,404);
    assert.equal((await post('/api/matches/fake/result',{winners:['A']},headers)).status,404);
    const state=await (await fetch(origin+'/api/state',{headers:{Cookie:cookie}})).json();assert.equal(state.mine.length,1);assert.equal(state.mine[0].source,undefined);
    const foreign=await (await fetch(origin+'/api/state',{headers:{Cookie:h2.Cookie}})).json();assert.equal(foreign.mine.length,0);
    assert.equal((await fetch(origin+'/')).headers.get('x-frame-options'),'DENY');
  }finally{await app.close();}
});

test('occupied port leaves no lock, and an active database refuses a second owner', async () => {
  const firstDir=mkdtempSync(path.join(os.tmpdir(),'tank-ladder-owner-'));
  const failedDir=mkdtempSync(path.join(os.tmpdir(),'tank-ladder-port-'));
  const first=await startServer({port:0,directory:firstDir,compute:false});
  try {
    await assert.rejects(startServer({port:0,directory:firstDir,compute:false}),/已在使用/);
    await assert.rejects(startServer({port:first.port,directory:failedDir,compute:false}),{code:'EADDRINUSE'});
    assert.equal(existsSync(path.join(failedDir,'.lock')),false);
    const retry=await startServer({port:0,directory:failedDir,compute:false});await retry.close();
  } finally {await first.close();}
});
