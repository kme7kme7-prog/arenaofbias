import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/scroll-tour.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { scrollWorkToBottom } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const originalRequest = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;
const frames = new Map();
let nextId = 0;
let time = 0;
globalThis.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
function step(delta = 16) {
  time += delta;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach(callback => callback(time));
}
function finish() {
  let count = 0;
  while (frames.size && count < 10000) { step(); count++; }
  assert.equal(frames.size, 0, 'animation must finish');
  return count;
}
try {
  const short = { scrollHeight: 200, clientHeight: 300, scrollTop: 90 };
  await scrollWorkToBottom(short, new AbortController().signal, 28);
  assert.equal(short.scrollTop, 0); assert.equal(frames.size, 0);
  console.log('PASS short content stays at the top without scheduling frames');

  const article = { scrollHeight: 580, clientHeight: 300, scrollTop: 80 };
  const tour = scrollWorkToBottom(article, new AbortController().signal, 28);
  step();
  for (let i = 0; i < 310; i++) step();
  assert.ok(article.scrollTop > 130 && article.scrollTop < 150, 'half the reading duration should reveal half the article');
  finish(); await tour;
  assert.equal(article.scrollTop, 280);
  console.log('PASS article scrolls gradually and reaches the exact bottom');

  const long = { scrollHeight: 860, clientHeight: 300, scrollTop: 0 };
  const longerTour = scrollWorkToBottom(long, new AbortController().signal, 28);
  const longerFrames = finish(); await longerTour;
  assert.ok(longerFrames > 1200, 'longer content must receive more time');
  console.log('PASS reading duration grows with content height');

  const controller = new AbortController();
  const cancelled = scrollWorkToBottom(article, controller.signal, 28);
  const rejection = assert.rejects(cancelled, { name: 'AbortError' });
  step(); step(); const before = article.scrollTop;
  controller.abort(); await rejection; step();
  assert.equal(frames.size, 0); assert.equal(article.scrollTop, before);
  console.log('PASS skipping or switching cancels all pending scroll frames');

  const background = scrollWorkToBottom(article, new AbortController().signal, 28);
  step(); step(60000);
  assert.ok(article.scrollTop < 1, 'returning from a background tab must not skip the article');
  article.scrollHeight = 700;
  finish(); await background;
  assert.equal(article.scrollTop, 400);
  console.log('PASS background pauses and resized content preserve a complete tour');
} finally {
  globalThis.requestAnimationFrame = originalRequest;
  globalThis.cancelAnimationFrame = originalCancel;
}
