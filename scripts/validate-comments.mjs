import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 集成检查：先启动 Node 后端（npm run dev:server 或 npm start，默认 3000），
// 再运行本脚本。它只写本地 data/comments.db，结束后清掉自己产生的记录。

const origin = 'http://localhost:3000';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath =
  process.env.DATA_DIR && process.env.DATA_DIR !== 'data'
    ? path.join(process.env.DATA_DIR, 'comments.db')
    : path.join(projectRoot, 'data', 'comments.db');

const ids = [randomUUID(), randomUUID()];
const post = (value, originHeader = origin) => fetch(`${origin}/api/comments`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: originHeader }, body: JSON.stringify(value),
});
const listing = async round => {
  const response = await fetch(`${origin}/api/comments?round=${round}`);
  assert.equal(response.status, 200);
  return (await response.json()).comments;
};
try {
  const first = { id: ids[0], roundId: '001', side: 'a', body: '本地验证：这里的构图很有意思。' };
  assert.equal((await post(first)).status, 201);
  assert.equal((await post(first)).status, 201);
  const firstList = await listing('001');
  assert.equal(firstList.filter(item => item.id === ids[0]).length, 1);
  assert.equal(firstList.find(item => item.id === ids[0]).body, first.body);
  console.log('PASS comment persists and retrying the same submission does not duplicate it');
  assert.equal((await post({ ...first, id: ids[1], roundId: '002', side: 'b' })).status, 201);
  assert.equal((await listing('001')).some(item => item.id === ids[1]), false);
  assert.equal((await listing('002')).some(item => item.id === ids[0]), false);
  console.log('PASS comments are isolated by question');
  for (const body of ['', '   ', '字'.repeat(281)]) assert.equal((await post({ ...first, body })).status, 400);
  assert.equal((await post({ ...first, roundId: '999' })).status, 400);
  assert.equal((await post({ ...first, side: 'invalid' })).status, 400);
  assert.equal((await post(first, 'https://unrelated.example')).status, 403);
  console.log('PASS empty, oversized, invalid-question and cross-origin submissions are rejected');
} finally {
  const db = new Database(dbPath);
  const placeholders = ids.map(() => '?').join(', ');
  db.prepare(`DELETE FROM comments WHERE id IN (${placeholders})`).run(...ids);
  db.close();
  console.log('Local test comments removed. No production comments were posted.');
}
