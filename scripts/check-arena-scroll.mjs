import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/arena-scroll.ts', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { schedulePromptScroll } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
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
// 娱乐「下一题」：convoy 斜幕只盖场内区域，层挂 body 活过卸载，盖满才切 hash
const pageSource = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert.match(pageSource, /createGameTransition\('convoy'/);
assert.match(pageSource, /onCovered:[\s\S]{0,120}window\.location\.hash = next/);
assert.match(pageSource, /layerStyle\.top = `\$\{top\}px`/);
assert.doesNotMatch(pageSource, /arenaTransition[\s\S]{0,80}dispose/, 'route-owned layer must not be disposed on unmount');
console.log('PASS arena scroll: deferred alignment, smooth, reduced motion, cancellation, detached target, no double route reset, next-prompt regional convoy');
