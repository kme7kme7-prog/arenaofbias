// 视角校准桥校验（决策 102）：临时 DATA_DIR 起真服务端，把真实 007 importmap
// 作品复制进收件箱登记为 fixture，覆盖——
//   ① 未校准作品响应零注入（与不装桥时一致）；
//   ② ?aob=bridge 注入桥且 importmap 改写到 /works/__aob__/ 虚拟路由；
//   ③ 虚拟路由：three 转发、OrbitControls 包装、非法 URL/路径穿越拒绝；
//   ④ PATCH camera 写读删 + 与 framing 同批序列化；
//   ⑤ 存有视角后，无标记的前台请求也带桥与 __AOB_SAVED__。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tests = 0;
async function check(name, test) {
  await test();
  tests++;
  console.log(`PASS ${name}`);
}

const repo = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dataDir = await mkdtemp(path.join(tmpdir(), 'aob-camera-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;

// fixture：真实 importmap 黑洞作品复制进收件箱（登记会把它搬进临时 works 库）
await cp(
  path.join(repo, 'data/works/007/007-muse-spark-1.3-18356-2'),
  path.join(dataDir, 'inbox', 'muse-fixture'),
  { recursive: true },
);

const child = spawn(process.execPath, ['server/index.js'], {
  cwd: repo,
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(port),
    HOST: '127.0.0.1',
    ADMIN_OWNER: 'theowner',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
let exitCode = -1;
child.on('exit', (code) => {
  exitCode = code ?? -1;
});

for (let attempt = 0; ; attempt++) {
  if (exitCode >= 0) throw new Error(`测试服务端提前退出（code ${exitCode}）`);
  if (attempt > 100) throw new Error('测试服务端未就绪');
  const ok = await fetch(`${base}/api/works`).then(() => true).catch(() => false);
  if (ok) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const robustFetch = async (url, options, tries = 3) => {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (i >= tries - 1 || error?.cause?.code !== 'ECONNRESET') throw error;
    }
  }
};

const register = async () => {
  const response = await robustFetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: base },
    body: JSON.stringify({ username: 'theowner', password: 'owner-password-123' }),
  });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie').split(';')[0];
};

const patch = (cookie, id, changes) =>
  robustFetch(`${base}/api/admin/works/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', origin: base, cookie },
    body: JSON.stringify(changes),
  });

let workId = '';
let workSrc = '';
try {
  const cookie = await register();
  const registered = await robustFetch(`${base}/api/admin/inbox/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: base, cookie },
    body: JSON.stringify({
      name: 'muse-fixture',
      promptId: '007',
      modelName: 'Fixture Muse',
      publish: true,
    }),
  });
  assert.equal(registered.status, 201, 'fixture 登记成功');
  const { work } = await registered.json();
  workId = work.id;
  workSrc = work.content.src;

  await check('未校准作品零注入（前台请求与不装桥时一致）', async () => {
    const html = await (await robustFetch(`${base}${workSrc}`)).text();
    assert.ok(!html.includes('__AOB__'), 'must not contain the bridge');
  });

  await check('?aob=bridge 注入桥并把 importmap 指向虚拟路由', async () => {
    const html = await (await robustFetch(`${base}${workSrc}?aob=bridge`)).text();
    assert.ok(html.includes('window.__AOB__='), 'bridge runtime injected');
    assert.ok(html.includes('/works/__aob__/three.mjs?u='), 'three remapped');
    assert.ok(html.includes('/works/__aob__/ad/'), 'addons remapped');
    assert.ok(
      html.indexOf('window.__AOB__=') < html.indexOf('type="importmap"'),
      'bridge runs before the importmap',
    );
  });

  await check('虚拟路由：转发与包装成立，非法入参拒绝', async () => {
    const cdn = encodeURIComponent(
      'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
    );
    const three = await robustFetch(`${base}/works/__aob__/three.mjs?u=${cdn}`);
    assert.equal(three.status, 200);
    assert.ok((await three.text()).startsWith('export * from "https://'));
    const evil = await robustFetch(
      `${base}/works/__aob__/three.mjs?u=${encodeURIComponent('javascript:alert(1)')}`,
    );
    assert.equal(evil.status, 400, 'non-https origin rejected');
    const adBase = encodeURIComponent(
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/',
    );
    const oc = await robustFetch(
      `${base}/works/__aob__/ad/${adBase}/controls/OrbitControls.js`,
    );
    assert.ok((await oc.text()).includes('window.__AOB__.wrap('), 'controls wrapped');
    const other = await robustFetch(
      `${base}/works/__aob__/ad/${adBase}/controls/TrackballControls.js`,
    );
    assert.ok((await other.text()).startsWith('export * from "https://'), 'passthrough');
    const traversal = await robustFetch(
      `${base}/works/__aob__/ad/${adBase}/..%2F..%2Fevil.js`,
    );
    assert.equal(traversal.status, 400, 'path traversal rejected');
  });

  await check('PATCH camera：写、读、前台注入、删除', async () => {
    const camera = { position: [12, 7, 30], target: [0, 0, 0] };
    const saved = await patch(cookie, workId, { camera });
    assert.equal(saved.status, 200);
    assert.deepEqual((await saved.json()).work.content.camera, camera);
    const html = await (await robustFetch(`${base}${workSrc}`)).text();
    assert.ok(html.includes('window.__AOB_SAVED__='), 'saved camera injected');
    assert.ok(html.includes('"position":[12,7,30]'));
    assert.ok(
      html.indexOf('window.__AOB_SAVED__=') < html.indexOf('window.__AOB__='),
      'camera state must be in place before the bridge reads it',
    );
    const cleared = await patch(cookie, workId, { camera: null });
    assert.equal(cleared.status, 200);
    assert.equal((await cleared.json()).work.content.camera, undefined);
    const plain = await (await robustFetch(`${base}${workSrc}`)).text();
    assert.ok(!plain.includes('__AOB__'), 'back to zero injection');
  });

  await check('camera 校验口径：坏形状 400，与 framing 同批改不互相吞', async () => {
    const bad = await patch(cookie, workId, { camera: { position: [1, 2], target: [0, 0, 0] } });
    assert.equal(bad.status, 400);
    const both = await patch(cookie, workId, {
      framing: { width: 1280, height: 720, zoom: 1, offsetX: 0, offsetY: 0 },
      camera: { position: [1, 2, 3], target: [0, 0, 0] },
    });
    assert.equal(both.status, 200);
    const content = (await both.json()).work.content;
    assert.deepEqual(content.framing.zoom, 1, 'framing survived');
    assert.deepEqual(content.camera.position, [1, 2, 3], 'camera survived');
    await patch(cookie, workId, { framing: null, camera: null });
  });
} finally {
  child.kill();
  await new Promise((resolve) => {
    child.on('exit', resolve);
    setTimeout(resolve, 3000);
  });
  await rm(dataDir, { recursive: true, force: true, maxDuration: 5000 }).catch(
    () => {},
  );
}
console.log(`${tests} work-camera invariant checks passed.`);
