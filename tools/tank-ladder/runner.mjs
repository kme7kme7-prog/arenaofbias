import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { execute } from './executor.mjs';
import { PROFILE, ENGINE_HASH, RUNTIME_HASH } from './config.mjs';

export async function runOnce({ url, token, signal }) {
  const target = new URL(url);
  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(target.hostname))) throw Error('计算连接必须使用 HTTPS 或本地 SSH 隧道。');
  const call = async (route, value) => {
    const res = await fetch(new URL(route, target), { method: 'POST', redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    if (!res.ok) throw Error(`计算接口返回 ${res.status}；请检查版本、密钥或连接。`);
    return res.json();
  };
  const task = await call('/claim', { profile: PROFILE, engineHash: ENGINE_HASH, runtimeHash: RUNTIME_HASH });
  if (!task.lease) return false;
  let answer;
  try { answer = { ok: true, result: await execute(task.payload, { signal, timeout: Math.min(task.timeout, 120000) }) }; }
  catch { if (signal?.aborted) return false; answer = { ok: false }; }
  // Retry delivery only, never repeat computation under the same lease.
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await call('/complete', { lease: task.lease, ...answer }); return true; }
    catch (error) { if (attempt === 2 || signal?.aborted) throw error; await delay(1000); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const token = readFileSync(process.env.TANK_RUNNER_TOKEN_FILE || '', 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('请设置 TANK_RUNNER_TOKEN_FILE，指向计算节点密钥文件。');
  const slots = Number(process.env.TANK_RUNNER_SLOTS || 1);
  if (!Number.isInteger(slots) || slots < 1 || slots > 8) throw Error('并发场数必须为 1–8。');
  const controller = new AbortController();
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => controller.abort());
  console.log(`计算节点已启动：${slots} 个并发槽位；Ctrl+C 停止，未完成任务会自动回收。`);
  await Promise.all(Array.from({ length: slots }, async () => {
    while (!controller.signal.aborted) {
      try { if (await runOnce({ url: process.env.TANK_RUNNER_URL || 'http://127.0.0.1:5473', token, signal: controller.signal })) continue; }
      catch (error) { if (!controller.signal.aborted) console.error(error.message); }
      try { await delay(3000, undefined, { signal: controller.signal }); } catch { break; }
    }
  }));
}
