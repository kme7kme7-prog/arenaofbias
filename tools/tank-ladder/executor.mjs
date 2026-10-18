import { fork } from 'node:child_process';
import { LIMITS } from './config.mjs';

export function execute(payload, { signal, timeout = LIMITS.matchMs } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Error('已取消'));
    const worker = fork(new URL('./match-worker.mjs', import.meta.url), [], {
      env: {}, execArgv: ['--max-old-space-size=192', '--stack-size=4096'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
    });
    let settled = false;
    const finish = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      worker.kill('SIGKILL');
      // Reap before granting the next slot; an aborted match must not overlap it.
      worker.once('close', () => { if (error) reject(error); else resolve(value); });
    };
    const abort = () => finish(Error('计算已暂停，未完成场次保留待重试。'));
    const timer = setTimeout(() => finish(Error('单场计算达到进程时限，本场未计分。')), timeout);
    signal?.addEventListener('abort', abort, { once: true });
    worker.on('message', value => value.ok ? finish(null, value.result ?? value) : finish(Error(value.error)));
    worker.on('error', () => finish(Error('计算进程异常，本场未计分。')));
    worker.on('exit', code => { if (!settled) finish(Error(`计算进程退出（${code}），本场未计分。`)); });
    worker.send(payload, error => { if (error) finish(Error('计算任务发送失败。')); });
  });
}
