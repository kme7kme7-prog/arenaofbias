import { getQuickJS } from 'quickjs-emscripten';
import { LIMITS } from './config.mjs';

// Guest code is interpreted inside WASM. No Node objects, callbacks, module
// loader, filesystem, network, or other contestants are exposed to the guest.
// Workers provide crash/whole-match containment, not the security boundary.
export async function createSandbox(source, seed = 1, limits = LIMITS) {
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setMaxStackSize(64 * 1024);
  let interrupts = 0, deadline = 0, timedOut = false, disposed = false;
  runtime.setInterruptHandler(() => {
    timedOut ||= ++interrupts > limits.interrupts || performance.now() > deadline;
    return timedOut;
  });
  const ctx = runtime.newContext();
  const start = () => { interrupts = 0; timedOut = false; deadline = performance.now() + limits.wallMs; };
  const unwrap = result => {
    if (result.error) {
      result.error.dispose();
      // Do not inspect/stringify arbitrary guest exceptions in the host.
      throw Object.assign(Error(timedOut ? '达到本步计算上限' : '代码异常、内存上限或不支持的接口'), { code: timedOut ? 'timeout' : 'error' });
    }
    return result.value;
  };
  let bridge;
  const dispose = () => { if (disposed) return; disposed = true; bridge?.dispose(); ctx.dispose(); runtime.dispose(); };
  try {
    start();
    unwrap(ctx.evalCode(`(() => {
      const parse = JSON.parse.bind(JSON), stringify = JSON.stringify.bind(JSON);
      const isArray = Array.isArray, isFinite = Number.isFinite;
      let rng = ${seed >>> 0};
      Math.random = () => { rng = (Math.imul(rng,1664525)+1013904223)>>>0; return rng/4294967296; };
      globalThis.Date = undefined;
      globalThis.Promise = undefined;
      return Object.freeze({ parse, stringify, isArray, isFinite });
    })()`, 'bootstrap.js')).consume(h => { ctx.setProp(ctx.global, '__bridge_init', h); });
    // Capture pristine serialization in a lexical closure before executing source.
    bridge = unwrap(ctx.evalCode(`((b) => {
      delete globalThis.__bridge_init;
      return (raw) => {
        const action = decide(b.parse(raw));
        const move = action && action.move;
        const fire = action && action.fire;
        if (!action || typeof action !== 'object' || b.isArray(action) ||
            !['up','right','down','left','stay'].includes(move) || typeof fire !== 'boolean')
          throw new Error('Invalid action');
        return b.stringify({move, fire});
      };
    })(__bridge_init)`, 'bridge.js'));
    start();
    unwrap(ctx.evalCode(source + '\n;if(typeof decide!=="function") throw new Error("Missing decide(state)");', 'bot.js')).dispose();
    return {
      decide(state) {
        if (disposed) throw Error('Disposed sandbox');
        start();
        const input = ctx.newString(JSON.stringify(state));
        let output;
        try {
          output = unwrap(ctx.callFunction(bridge, ctx.undefined, input));
          if (ctx.typeof(output) !== 'string') throw Error('Invalid action serialization');
          const value = ctx.getString(output);
          if (value.length > 128) throw Error('Oversized action');
          const action = JSON.parse(value);
          // Guest may mutate its built-ins. Enforce the contract again in host.
          if (!action || !['up','right','down','left','stay'].includes(action.move) || typeof action.fire !== 'boolean') throw Error('Invalid action');
          return action;
        } finally { input.dispose(); output?.dispose(); }
      }, dispose,
    };
  } catch (e) { dispose(); throw e; }
}
