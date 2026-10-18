import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const MAPS = [
  { id: 'crossroads', name: '十字猎场' },
  { id: 'islands', name: '四桥孤岛' },
  { id: 'ruins', name: '环形废墟' },
];
export const SIDES = ['A', 'B', 'C', 'D'];
export const LIMITS = Object.freeze({ sourceBytes: 262144, bodyBytes: 300000, memoryBytes: 64 * 1024 ** 2,
  interrupts: 4000, wallMs: 2000, matchMs: 120000, placements: 12, dailyMatches: 120, dailyUploads: 20 });
export const sha = value => createHash('sha256').update(value).digest('hex');
const core = path.join(ROOT, 'app/tanks/engine/core');
export const ENGINE_HASH = sha(readdirSync(core).filter(f => f.endsWith('.js')).sort().map(f => `${f}\n${readFileSync(path.join(core, f), 'utf8')}`).join('\n'));
export const SEASON = 'local-s01';
export const PROFILE = 'tank-2.6-quickjs-0.32-v1';
export const RUNTIME_HASH = sha(['config.mjs','sandbox.mjs','executor.mjs','match-worker.mjs','runner-broker.mjs','runner.mjs','rating.mjs','store.mjs','server.mjs','package-lock.json'].map(f => `${f}\n${readFileSync(path.join(HERE, f), 'utf8')}`).join('\n'));

export function failure(message, status = 400) { return Object.assign(new Error(message), { status }); }
function hasControl(text) {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 32 || text.charCodeAt(i) === 127) return true;
  return false;
}
export function metadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('提交格式不正确。');
  const clean = (key, max, fallback = '') => {
    const s = input[key] ?? fallback;
    if (typeof s !== 'string' || !s.trim() || s.length > max || hasControl(s)) throw failure(`${key} 长度或格式不正确。`);
    return s.trim();
  };
  const effort = clean('effort', 16, 'default');
  if (!['default', 'low', 'medium', 'high', 'max'].includes(effort)) throw failure('请选择支持的思考强度。');
  if (typeof input.source !== 'string' || !input.source.trim() || Buffer.byteLength(input.source) > LIMITS.sourceBytes || input.source.includes('\0')) throw failure('请上传不超过 256 KiB 的单文件 JavaScript。');
  return { name: clean('name', 48), model: clean('model', 64, '未声明'), effort,
    note: input.note === '' || input.note === undefined ? '' : clean('note', 240), source: input.source };
}
