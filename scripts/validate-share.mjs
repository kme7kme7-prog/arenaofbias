import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installShare, resolveShare } from '../server/share.js';
import { thumbFingerprint } from '../server/work-thumbnails.js';
import { shareSvg } from '../server/share-card.js';
import { fileURLToPath } from 'node:url';

const db = new Database(':memory:');
db.exec(`CREATE TABLE prompts(id TEXT, name TEXT, prompt TEXT, published INTEGER);
CREATE TABLE works(id TEXT, prompt_id TEXT, model_name TEXT, model_id TEXT, is_demo INTEGER, published INTEGER);
INSERT INTO prompts VALUES('001', '鹈鹕大挑战', '用 SVG 画一只骑车的鹈鹕', 1), ('002', '草稿', '隐藏', 0);
INSERT INTO works VALUES('left', '001', 'Claude <script> & "特别长的模型名称"', 'claude', 0, 1), ('right', '001', 'GPT-6-astra-extra-long-thinking-2026', 'gpt', 0, 1), ('hidden', '001', '隐藏模型', 'hidden', 0, 0), ('other', '002', '另题模型', 'other', 0, 1);`);
db.exec(
  'ALTER TABLE works ADD COLUMN title TEXT DEFAULT \'快照测试\'; ALTER TABLE works ADD COLUMN content TEXT DEFAULT \'{"kind":"html","src":"/works/test.html"}\';',
);
const thumbsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aob-share-thumbs-'));
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
for (const id of ['left', 'right']) {
  fs.writeFileSync(path.join(thumbsDir, `${id}.png`), TINY_PNG);
  fs.writeFileSync(
    path.join(thumbsDir, `${id}.json`),
    JSON.stringify({
      fingerprint: thumbFingerprint(
        db.prepare('SELECT * FROM works WHERE id=?').get(id),
      ),
    }),
  );
}
const app = express();
installShare(
  app,
  db,
  fileURLToPath(new URL('../dist', import.meta.url)),
  thumbsDir,
  () => ({ name: '真实当日答案' }),
);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let tests = 0;
async function check(label, fn) {
  await fn();
  console.log(`PASS ${++tests} ${label}`);
}
const params = new URLSearchParams({
  type: 'duel',
  prompt: '001',
  a: 'left',
  b: 'right',
  pick: 'a',
});
try {
  await check('分享元数据来自已发布作品；无需登录、无投票写入', async () => {
    const response = await fetch(`${base}/api/share?${params}`);
    assert.equal(response.status, 200);
    const meta = await response.json();
    assert.ok(meta.url.startsWith(base + '/share?'));
    assert.match(meta.description, /Claude/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM works').get().n, 4);
  });
  await check('A/B 顺序与平局选择保留；固定同一对作品返回入口', () => {
    const data = resolveShare(Object.fromEntries(params), db);
    assert.equal(data.names[0], 'Claude <script> & "特别长的模型名称"');
    assert.match(data.target, /duel=/);
    assert.match(data.target, /#arena\/001$/);
    assert.equal(
      resolveShare({ ...Object.fromEntries(params), pick: 'draw' }, db).pick,
      'draw',
    );
  });
  await check('拒绝跨题、下架、自对决、重复参数与未定义的模式', async () => {
    for (const extra of [
      { b: 'other' },
      { b: 'hidden' },
      { b: 'left' },
      { pick: 'bad' },
      { type: 'formal' },
      { prompt: '002' },
    ]) {
      const q = new URLSearchParams({
        ...Object.fromEntries(params),
        ...extra,
      });
      assert.equal((await fetch(`${base}/share?${q}`)).status, 404);
    }
    assert.equal((await fetch(`${base}/share?${params}&a=right`)).status, 404);
  });
  await check(
    '爬虫无需执行 JS 就能读到绝对 OG/Twitter 地址，字段 HTML 转义',
    async () => {
      const html = await (await fetch(`${base}/share?${params}`)).text();
      assert.match(html, /og:image:width.*1200/);
      assert.match(html, /summary_large_image/);
      assert.match(html, /&lt;script&gt;/);
      assert.ok(!html.includes('<script>'));
      assert.match(html, /og:image" content="http:\/\/127.0.0.1:/);
      const response = await fetch(`${base}/`);
      assert.match(await response.text(), /og:title/);
    },
  );
  await check(
    '导出真实 PNG：竖版 1080×1760，OG 1200×630；支持附件下载',
    async () => {
      for (const [endpoint, w, h] of [
        ['card', 1080, 1760],
        ['og', 1200, 630],
      ]) {
        const response = await fetch(
          `${base}/share/${endpoint}.png?${params}&download=1`,
        );
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), 'image/png');
        assert.match(response.headers.get('content-disposition'), /attachment/);
        const png = Buffer.from(await response.arrayBuffer());
        assert.equal(png.subarray(1, 4).toString(), 'PNG');
        assert.equal(png.readUInt32BE(16), w);
        assert.equal(png.readUInt32BE(20), h);
        assert.ok(png.length > 10000);
      }
    },
  );
  await check(
    '模一把只接收日期、胜负、七格反馈；非法日期与超过八行拒绝',
    async () => {
      const q = {
        type: 'guess',
        day: '2026-09-13',
        won: '1',
        grid: 'hmmnumh.hhhhhhh',
      };
      const data = resolveShare(q, db);
      assert.equal(data.rows.length, 2);
      assert.equal(data.target, '/#guess');
      assert.equal(data.historical, true);
      for (const bad of [
        { day: '2026-02-30' },
        { grid: 'hhhh' },
        { day: '2999-01-01' },
        { grid: Array(9).fill('hhhhhhh').join('.') },
      ])
        assert.equal(resolveShare({ ...q, ...bad }, db), null);
      const html = await (
        await fetch(
          `${base}/share?${new URLSearchParams(q)}&answer=SECRET_MODEL_NAME`,
        )
      ).text();
      assert.ok(!html.includes('SECRET_MODEL_NAME'));
      const answer = resolveShare(q, db, () => ({ name: '真实当日答案' }));
      assert.match(shareSvg(answer, base), /真实当日答案/);
      assert.match(shareSvg(answer, base, true), /真实当日答案/);
      assert.match(html, /今天的新题/);
    },
  );
  await check(
    '长模型名不截断、文本无未转义标签；图片不存在账号或票数伪证',
    () => {
      const data = resolveShare(Object.fromEntries(params), db);
      const svg = shareSvg(data, base + '/share?' + params);
      assert.match(svg, /&lt;script&gt;/);
      assert.match(svg, /GPT-6-astra-extra-long-thinking-2026/);
      assert.ok(!svg.includes('<script>'));
      assert.match(svg, /个人选择分享/);
      data.names[0] = 'very-long-model-name-'.repeat(8) + 'TAIL_MARKER';
      assert.match(shareSvg(data, base + '/share?' + params), /TAIL_MARKER/);
    },
  );
  await check(
    '题卡带作品对：链接固定同一对，缩略图齐才嵌图，缺图回落色块',
    async () => {
      const q = { type: 'prompt', prompt: '001', a: 'left', b: 'right' };
      const data = resolveShare(q, db);
      assert.deepEqual(data.pair, ['left', 'right']);
      assert.match(data.target, /duel=/);
      assert.match(data.target, /#arena\/001$/);
      const bare = resolveShare({ type: 'prompt', prompt: '001' }, db);
      assert.equal(bare.pair, undefined);
      assert.equal(bare.target, '/#arena/001');
      // 非法对（下架/跨题/自对决）退回通用题卡，不 404
      for (const bad of [{ b: 'hidden' }, { b: 'other' }, { b: 'left' }])
        assert.equal(
          resolveShare({ ...q, ...bad }, db).pair,
          undefined,
          JSON.stringify(bad),
        );
      const url = base + '/share?x';
      const withThumbs = shareSvg(
        {
          ...data,
          thumbs: ['data:image/png;base64,AA', 'data:image/png;base64,BB'],
        },
        url,
      );
      assert.equal(withThumbs.match(/<image /g).length, 2);
      assert.match(withThumbs, /preserveAspectRatio="xMidYMid meet"/);
      assert.ok(!withThumbs.includes('slice'));
      const fallback = shareSvg(data, url);
      assert.ok(!fallback.includes('<image '));
      assert.match(fallback, /#ff7c6c/);
      // HTTP：缩略图在盘上时竖卡正常出图
      const response = await fetch(
        `${base}/share/card.png?${new URLSearchParams(q)}`,
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      const original = db
        .prepare("SELECT content FROM works WHERE id='right'")
        .get().content;
      db.prepare("UPDATE works SET content=? WHERE id='right'").run(
        JSON.stringify({ kind: 'html', html: '<p>inline</p>' }),
      );
      fs.rmSync(path.join(thumbsDir, 'right.png'));
      const missing = await fetch(
        `${base}/share/card.png?${new URLSearchParams(q)}&t=2`,
      );
      assert.equal(missing.status, 200);
      db.prepare("UPDATE works SET content=? WHERE id='right'").run(original);
      fs.writeFileSync(path.join(thumbsDir, 'right.png'), TINY_PNG);
    },
  );
  await check('校准与机位变化使旧快照失效；对决卡也包含完整作品图', () => {
    const work = db.prepare("SELECT * FROM works WHERE id='left'").get();
    const before = thumbFingerprint(work);
    for (const extra of [
      { framing: { width: 1280, height: 900, zoom: 0.8, offsetY: -0.1 } },
      { camera: { position: [1, 2, 3] } },
    ])
      assert.notEqual(
        thumbFingerprint({
          ...work,
          content: JSON.stringify({ ...JSON.parse(work.content), ...extra }),
        }),
        before,
      );
    const data = resolveShare(Object.fromEntries(params), db);
    assert.deepEqual(data.pair, ['left', 'right']);
    for (const landscape of [false, true]) {
      const svg = shareSvg(
        {
          ...data,
          thumbs: ['data:image/png;base64,AA', 'data:image/png;base64,BB'],
        },
        base,
        landscape,
      );
      assert.equal(svg.match(/<image /g).length, 2);
      assert.ok(!svg.includes('slice'));
    }
  });
  await check('已缓存图片在作品下架后也拒绝访问', async () => {
    db.prepare("UPDATE works SET published=0 WHERE id='left'").run();
    assert.equal((await fetch(`${base}/share/card.png?${params}`)).status, 404);
  });
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(thumbsDir, { recursive: true, force: true });
  db.close();
}
console.log(`${tests} share checks passed`);
