// Trusted, registered bots only. Build a classic Worker script without eval /
// Function so the website's existing CSP can remain unchanged.
export const DECISION_BUDGET = 500;
export function createBrowserAdapter(
  source,
  { budget = DECISION_BUDGET, watchdog = 10000 } = {},
) {
  const script = `(() => {
    const send = self.postMessage.bind(self), clock = performance.now.bind(performance);
    self.postMessage = () => { throw Error('bot 不能自行发送消息'); };
    Object.defineProperty(self, 'Promise', {value:undefined});
    Object.defineProperty(self, 'queueMicrotask', {value:undefined});
    ${source}
    const choose = decide;
    self.onmessage = ({data}) => {
      const started = clock();
      try {
        const raw = choose(data.state);
        const move = ['up','right','down','left','stay'].includes(raw?.move) ? raw.move : 'stay';
        const fire = typeof raw?.fire === 'boolean' ? raw.fire : false;
        const intent = ['advance','flank','hold','pursue','retreat','resupply','defend','siege'].includes(raw?.intent) ? raw.intent : null;
        if(clock()-started > ${budget}) send({id:data.id,error:'timeout',message:'这次决策用时过长'});
        else send({id:data.id,action:{move,fire,...(intent?{intent}:{})}});
      } catch(e) { send({id:data.id,error:'error',message:String(e.message||e).slice(0,160)}); }
    };
    send({ready:true});
  })();`;
  const url = URL.createObjectURL(
    new Blob([script], { type: 'text/javascript' }),
  );
  let worker;
  try {
    worker = new Worker(url);
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  let pending,
    timer,
    failure,
    serial = 0,
    resolveReady,
    rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => {});
  function fail(error) {
    if (failure) return;
    failure = error;
    clearTimeout(timer);
    worker.terminate();
    URL.revokeObjectURL(url);
    rejectReady(error);
    pending?.reject(error);
    pending = null;
  }
  const timeout = () =>
    fail(Object.assign(Error('该选手长时间没有响应'), { code: 'timeout' }));
  timer = setTimeout(timeout, watchdog);
  worker.addEventListener('error', (e) => {
    e.preventDefault();
    fail(Error(e.message || '选手运行异常'));
  });
  worker.addEventListener('messageerror', () =>
    fail(Error('选手返回的数据无法读取')),
  );
  worker.addEventListener('message', ({ data }) => {
    if (failure) return;
    if (data?.ready) {
      clearTimeout(timer);
      resolveReady();
      return;
    }
    if (!pending || data?.id !== pending.id) return;
    clearTimeout(timer);
    if (data.error) {
      fail(Object.assign(Error(data.message), { code: data.error }));
      return;
    }
    const request = pending;
    pending = null;
    request.resolve(data.action);
  });
  return {
    ready,
    async decide(state) {
      await ready;
      if (failure) throw failure;
      if (pending) throw Error('该选手仍在计算');
      return new Promise((resolve, reject) => {
        const id = ++serial;
        pending = { id, resolve, reject };
        timer = setTimeout(timeout, watchdog);
        try {
          worker.postMessage({ id, state });
        } catch (e) {
          fail(e);
        }
      });
    },
    dispose() {
      fail(Object.assign(Error('已取消计算'), { code: 'cancelled' }));
    },
  };
}
