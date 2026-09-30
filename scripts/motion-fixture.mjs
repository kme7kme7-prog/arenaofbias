// Deterministic browser clock for lifecycle contracts; no DOM rendering claims.
import fs from 'node:fs';
import ts from 'typescript';
export async function loadMotion(file) {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(js + '\n//# sourceURL=' + file).toString('base64')}`
  );
}
export function fixture(theme = 'paper') {
  let now = 0,
    id = 0;
  const timers = new Map(),
    active = new Set(),
    all = [],
    listeners = new Set();
  const media = {
    matches: false,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  const element = () => ({
    children: [],
    dataset: {},
    style: {},
    hidden: true,
    className: '',
    setAttribute(name, value) {
      this[name] = value;
    },
    append(...children) {
      children.forEach((child) => {
        child.parent = this;
        this.children.push(child);
      });
    },
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter(
          (node) => node !== this,
        );
    },
    animate(frames, options) {
      let resolve, reject;
      const finished = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      finished.catch(() => {});
      const a = {
        node: this,
        frames,
        options,
        start: now,
        finished,
        cancel() {
          active.delete(a);
          a.cancelled = true;
          reject(Error('cancelled'));
        },
        finish() {
          active.delete(a);
          resolve();
        },
      };
      active.add(a);
      all.push(a);
      return a;
    },
  });
  const body = element();
  const documentFixture = {
    body,
    createElement: element,
    documentElement: { dataset: { theme } },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.document = documentFixture;
  globalThis.window = {
    matchMedia: () => media,
    location: { hash: '' },
    setTimeout(fn, ms) {
      timers.set(++id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(token) {
      timers.delete(token);
    },
  };
  globalThis.getComputedStyle = () => ({
    backgroundColor: `rgba(0, 0, 0, ${Math.min(0.8, now / 1000)})`,
    opacity: '1',
    transform: 'none',
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return {
    body,
    media,
    all,
    active,
    listeners,
    element,
    flush,
    async advance(ms) {
      now += ms;
      for (const [token, timer] of timers)
        if (timer.at <= now) {
          timers.delete(token);
          timer.fn();
        }
      for (const animation of active)
        if (animation.start + animation.options.duration <= now)
          animation.finish();
      await flush();
    },
    reduce() {
      media.matches = true;
      [...listeners].forEach((fn) => fn());
    },
  };
}
