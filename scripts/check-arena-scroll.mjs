import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/arena-scroll.ts', import.meta.url), 'utf8');
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
console.log('PASS arena scroll: deferred alignment, smooth, reduced motion, cancellation, detached target');
