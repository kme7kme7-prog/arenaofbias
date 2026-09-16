import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/arena-scroll.ts', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { schedulePromptScroll, alignArenaTransition } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
let sequence = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (callback) => { frames.set(++sequence, callback); return sequence; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
const calls = [];
const target = { isConnected: true, scrollIntoView: options => calls.push(options) };
schedulePromptScroll(target, false);
assert.equal(calls.length, 0, 'defer until route reset and DOM commit finish');
flush();
assert.deepEqual(calls.pop(), { behavior: 'smooth', block: 'start', inline: 'nearest' });
schedulePromptScroll(target, true);
flush();
assert.equal(calls.pop().behavior, 'instant');
schedulePromptScroll(target, false)();
flush();
assert.equal(calls.length, 0, 'unmount cancels pending scroll');
schedulePromptScroll({ ...target, isConnected: false }, false);
flush();
assert.equal(calls.length, 0, 'detached target cannot scroll a new route');
assert.match(mainSource, /currentPairs\(arenaPromptId\)\.length === 0/);
assert.match(mainSource, /if \(!arenaPromptId \|\|[\s\S]{0,80}window\.scrollTo\(0, 0\)/);
// 娱乐「下一题」：双页纸幕只盖场内区域，层挂 body 活过卸载，盖满才切 hash
const pageSource = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert.match(pageSource, /createGameTransition\('match'/);
assert.match(pageSource, /onCovered:[\s\S]{0,120}window\.location\.hash = next/);
assert.match(pageSource, /onFrame:[\s\S]{0,100}alignArenaTransition/);
// Document coordinates follow native scrolling; fresh selectors survive route unmount.
let bounds = [{ top: 200, bottom: 220, left: 40, right: 940 }, { top: 220, bottom: 900, left: 40, right: 940 }];
globalThis.window = { scrollX: 0, scrollY: 100 };
const regionDocument = { querySelectorAll: () => bounds.map(rect => ({ getBoundingClientRect: () => rect })) };
globalThis.document = regionDocument;
const layer = { style: {} };
alignArenaTransition(layer);
assert.equal(layer.style.position, 'absolute');
assert.equal(layer.style.top, '300px');
window.scrollY = 400;
bounds = bounds.map(r => ({ ...r, top: r.top - 300, bottom: r.bottom - 300 }));
alignArenaTransition(layer);
assert.equal(layer.style.top, '300px', 'wheel movement must keep document anchor unchanged');
bounds = [{ top: 90, bottom: 890, left: 16, right: 376 }];
alignArenaTransition(layer);
assert.equal(layer.style.top, '490px', 'new route nodes replace old geometry');
assert.equal(layer.style.width, '360px');
bounds = [];
alignArenaTransition(layer);
assert.equal(layer.style.top, '490px', 'missing route during commit retains last bounds');
assert.doesNotMatch(pageSource, /arenaTransition[\s\S]{0,80}dispose/, 'route-owned layer must not be disposed on unmount');
console.log('PASS arena scroll: deferred alignment, smooth, reduced motion, cancellation, detached target, no double route reset, next-prompt regional match');
