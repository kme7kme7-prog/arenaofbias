import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox } from '../sandbox.mjs';
import { execute } from '../executor.mjs';
import { LIMITS } from '../config.mjs';

test('guest has no host capabilities; constructor escape stays inside WASM', async () => {
  const bot = await createSandbox(`function decide(){
    if(typeof process!=='undefined'||typeof require!=='undefined'||typeof fetch!=='undefined'||typeof WebSocket!=='undefined'||typeof setTimeout!=='undefined')throw Error('host leak');
    if(({}).constructor.constructor('return typeof process')()!=='undefined')throw Error('escape');
    return {move:'stay',fire:false};
  }`);
  assert.deepEqual(bot.decide({}), { move:'stay',fire:false }); bot.dispose();
});
test('loop, recursion, allocation, invalid output and getter attacks are bounded', async () => {
  const tight = { ...LIMITS, wallMs:150,interrupts:10,memoryBytes:4*1024**2 };
  for (const source of [
    'while(true){};function decide(){}',
    'function decide(){while(true){}}',
    'function decide(){return decide()}',
    'function decide(){let a=[];while(true)a.push(new Uint8Array(1024*1024))}',
    'function decide(){return {move:"teleport",fire:true}}',
    'function decide(){return {get move(){while(true){}},fire:true}}',
    'function decide(){throw {get message(){while(true){}}}}',
  ]) {
    let bot; const start=performance.now();
    try { bot=await createSandbox(source,1,tight); assert.throws(()=>bot.decide({})); }
    catch(e){ assert.notEqual(e.code,'ERR_ASSERTION'); }
    finally { bot?.dispose(); }
    assert(performance.now()-start<1500);
  }
});
test('guest mutation cannot alter another bot, input state, or host prototype', async () => {
  const a=await createSandbox('Object.prototype.hostile=1;function decide(s){s.self.x=900;return {move:"stay",fire:false}}');
  const b=await createSandbox('function decide(s){if(({}).hostile||s.self.x!==2)throw Error();return {move:"up",fire:true}}');
  const state={self:{x:2}};a.decide(state);assert.equal(state.self.x,2);assert.equal({}.hostile,undefined);assert.equal(b.decide(state).move,'up');a.dispose();b.dispose();
});
test('random stream reproduces and whole-worker deadline terminates execution', async () => {
  const source='function decide(){return {move:["up","down","left","right"][Math.floor(Math.random()*4)],fire:false}}';
  const a=await createSandbox(source,38),b=await createSandbox(source,38);
  for(let i=0;i<10;i++)assert.deepEqual(a.decide({}),b.decide({}));a.dispose();b.dispose();
  await assert.rejects(execute({kind:'validate',source:'while(true){}'},{timeout:20}),/时限/);
});
