import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { createVisitorIdentity } from '../server/visitor.js';
import { inspectSubmissionZip } from '../server/submission-zip.js';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = await mkdtemp(path.join(tmpdir(), 'aob-beta-'));
const port = 22000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
let child,
  logs = '',
  db,
  count = 0;
async function start() {
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(port),
      HOST: '127.0.0.1',
      APP_ORIGIN: base,
      RATE_LIMIT_PER_MIN: '1000',
      ADMIN_OWNER: 'beta_owner',
      MAIL_DEV_LOG: '1',
      MAIL_COOLDOWN_MS: '1',
      MAIL_IP_MAX: '1000',
      MAIL_EMAIL_MAX: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (bytes) => {
    logs += bytes;
  });
  child.stderr.on('data', (bytes) => {
    logs += bytes;
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/works`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start: ${logs}`);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
}
const cookies = (response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
const json = (url, body, cookie = '', method = 'POST') =>
  fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', origin: base, cookie },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
const get = (url, cookie = '') =>
  fetch(`${base}${url}`, { headers: { cookie } });
async function check(name, test) {
  await test();
  console.log(`PASS ${++count} ${name}`);
}
async function register(name) {
  const email = `${name}@aob.test`;
  assert.equal(
    (await json('/api/auth/email/send', { purpose: 'register', email })).status,
    200,
  );
  const match = logs
    .split('\n')
    .find((line) => line.includes(`email=${email}`) && line.includes('code='));
  const response = await json('/api/auth/register', {
    username: name,
    email,
    password: 'beta-test-password-123',
    code: match.match(/code=(\d{6})/)[1],
  });
  assert.equal(response.status, 201);
  return { cookie: cookies(response), user: (await response.json()).user };
}
function zip(entries) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, text, attributes = 0] of entries) {
    const filename = Buffer.from(name),
      body = Buffer.from(text);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(body.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, body);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(body.length, 20);
    directory.writeUInt32LE(body.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(attributes >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length + body.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
try {
  await start();
  db = new Database(path.join(dataDir, 'comments.db'));
  const owner = await register('beta_owner'),
    other = await register('beta_other');
  const vote = {
    id: randomUUID(),
    promptId: '002',
    winnerRid: '002-a',
    winnerMid: 'inkwell',
    loserRid: '002-b',
    loserMid: 'echo',
    mode: 'blind',
  };
  let guest;
  await check(
    '游客娱乐票落库入榜，签名 cookie 保持匿名，不开放正式测评',
    async () => {
      const response = await json('/api/votes', vote);
      assert.equal(response.status, 201);
      guest = cookies(response);
      assert.match(guest, /^arena_visitor=/);
      const saved = db.prepare('SELECT * FROM votes WHERE id=?').get(vote.id);
      assert.equal(saved.user_id, null);
      assert.ok(saved.visitor_id);
      const flow = await (await get('/api/votes')).json();
      assert.ok(flow.votes.some((item) => item.id === vote.id));
      assert.equal(
        (
          await json(
            '/api/votes',
            { ...vote, id: randomUUID(), mode: 'formal' },
            guest,
          )
        ).status,
        401,
      );
    },
  );
  await check('同浏览器/账号/登录前后去重，票面幂等与 UUID 冲突', async () => {
    assert.equal((await json('/api/votes', vote, guest)).status, 200);
    assert.equal(
      (await json('/api/votes', { ...vote, id: randomUUID() }, guest)).status,
      409,
    );
    assert.equal(
      (
        await json(
          '/api/votes',
          { ...vote, id: randomUUID() },
          `${guest}; ${owner.cookie}`,
        )
      ).status,
      409,
    );
    assert.equal(
      (await json('/api/votes', vote, `${guest}; ${owner.cookie}`)).status,
      200,
    );
    assert.equal(
      (await json('/api/votes', { ...vote, outcome: 'draw' }, guest)).status,
      409,
    );
    assert.equal(
      (await json('/api/votes', { ...vote, id: randomUUID() }, other.cookie))
        .status,
      201,
    );
    assert.equal(
      (await json('/api/votes', { ...vote, id: randomUUID() }, other.cookie))
        .status,
      409,
    );
    assert.equal(
      (
        await json(
          '/api/votes',
          { ...vote, id: randomUUID(), mode: 'formal' },
          owner.cookie,
        )
      ).status,
      201,
    );
  });
  await check('签名身份重启不变；浏览器和 IP 限流独立生效', async () => {
    await stop();
    await start();
    assert.equal((await json('/api/votes', vote, guest)).status, 200);
    const limitsDb = new Database(':memory:');
    const identity = createVisitorIdentity(limitsDb, 10);
    let status;
    const response = {
      set() {
        return this;
      },
      status(value) {
        status = value;
        return this;
      },
      json() {},
    };
    for (let i = 0; i < 12; i++)
      assert.ok(identity.limit({ ip: 'browser-ip' }, response, 'same'));
    assert.equal(identity.limit({ ip: 'browser-ip' }, response, 'same'), false);
    assert.equal(status, 429);
    for (let i = 0; i < 60; i++)
      assert.ok(identity.limit({ ip: 'shared-ip' }, response, `new-${i}`));
    assert.equal(
      identity.limit({ ip: 'shared-ip' }, response, 'another'),
      false,
    );
    limitsDb.close();
  });
  await check('新评价按作品隔离，旧评价不混入，切账号队列被拒绝', async () => {
    db.prepare('INSERT INTO reactions VALUES (?,?,?,?,?,?)').run(
      randomUUID(),
      '002',
      'inkwell',
      'up',
      owner.user.id,
      Date.now(),
    );
    const source = db.prepare("SELECT * FROM works WHERE id='002-a'").get();
    db.prepare(
      'INSERT INTO works (id,prompt_id,model_id,model_name,title,is_demo,content,published,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(
      '002-a-second',
      '002',
      'inkwell',
      source.model_name,
      'Second work',
      0,
      source.content,
      1,
      Date.now(),
    );
    const reaction = {
      id: randomUUID(),
      promptId: '002',
      rid: '002-a',
      kind: 'up',
      userId: owner.user.id,
    };
    let response = await json('/api/reactions', reaction, owner.cookie);
    assert.equal(response.status, 201);
    let data = await response.json();
    assert.equal(data.counts['002-a'].up, 1);
    assert.equal(data.counts['002-a-second'], undefined);
    assert.equal(
      (await json('/api/reactions', reaction, other.cookie)).status,
      409,
    );
    response = await json(
      '/api/reactions',
      { ...reaction, kind: null },
      owner.cookie,
    );
    assert.equal(response.status, 201);
    data = await response.json();
    assert.equal(data.mine['002-a'], undefined);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reactions').get().n, 1);
  });
  const draft = async (filename, user = other) => {
    const response = await json(
      '/api/submissions',
      {
        promptId: '003',
        modelName: 'Beta Model',
        title: 'Beta work',
        notes: 'Original output; fixture test.',
        filename,
      },
      user.cookie,
    );
    assert.equal(response.status, 201);
    return (await response.json()).id;
  };
  const upload = (id, content, user = other) =>
    fetch(`${base}/api/submissions/${id}/file`, {
      method: 'PUT',
      headers: {
        origin: base,
        cookie: user.cookie,
        'Content-Type': 'application/octet-stream',
      },
      body: content,
    });
  let htmlId;
  await check('投稿鉴权、所有权、隔离原件与附件下载', async () => {
    assert.equal((await json('/api/submissions', {})).status, 401);
    assert.equal(
      (await json('/api/submissions', { promptId: {} }, other.cookie)).status,
      400,
    );
    htmlId = await draft('test.html');
    assert.equal(
      (
        await upload(
          htmlId,
          '<!doctype html><h1>Test</h1><script>parent.localStorage.clear()</script>',
        )
      ).status,
      201,
    );
    assert.equal((await get(`/api/submissions/${htmlId}/file`)).status, 401);
    const stranger = await register('beta_stranger');
    assert.equal(
      (await get(`/api/submissions/${htmlId}/file`, stranger.cookie)).status,
      404,
    );
    const attachment = await get(
      `/api/submissions/${htmlId}/file`,
      owner.cookie,
    );
    assert.match(attachment.headers.get('content-disposition'), /attachment/);
    assert.match(attachment.headers.get('content-security-policy'), /sandbox/);
    assert.equal((await readdir(path.join(dataDir, 'inbox'))).length, 0);
    assert.equal(
      (
        await json(
          `/api/admin/submissions/${htmlId}/review`,
          { action: 'approve', note: '' },
          other.cookie,
        )
      ).status,
      404,
    );
  });
  await check('通过只转入收件箱；登记后投稿脚本隔离，原件留存', async () => {
    const total = db.prepare('SELECT COUNT(*) AS n FROM works').get().n;
    const response = await json(
      `/api/admin/submissions/${htmlId}/review`,
      { action: 'approve', note: 'Checked' },
      owner.cookie,
    );
    assert.equal(response.status, 200);
    const { submission } = await response.json();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM works').get().n, total);
    const inbox = await (await get('/api/admin/inbox', owner.cookie)).json();
    const entry = inbox.entries.find(
      (item) => item.name === submission.inboxName,
    );
    assert.equal(entry.suggest.model, 'Beta Model');
    assert.equal(entry.submissionId, htmlId);
    const preview = await get(
      `/api/admin/inbox/serve/${submission.inboxName}`,
      owner.cookie,
    );
    assert.match(
      preview.headers.get('content-security-policy'),
      /sandbox allow-scripts/,
    );
    const encodedPreview = await get(
      `/api/admin/inbox/serve/${submission.inboxName.replace(/^s/, '%73')}?name=unrelated.html`,
      owner.cookie,
    );
    assert.equal(encodedPreview.status, 200);
    assert.match(
      encodedPreview.headers.get('content-security-policy'),
      /sandbox allow-scripts/,
    );
    const registered = await json(
      '/api/admin/inbox/register',
      {
        name: entry.name,
        modelName: 'Beta Model',
        promptId: '003',
        title: entry.suggest.title,
      },
      owner.cookie,
    );
    assert.equal(registered.status, 201);
    const { work } = await registered.json();
    assert.equal(work.content.sandboxed, true);
    assert.equal(Boolean(work.published), false);
    const document = await get(work.content.src);
    assert.match(
      document.headers.get('content-security-policy'),
      /sandbox allow-scripts/,
    );
    const encoded = await get(
      work.content.src.replace(
        /submission|beta/,
        (value) => `%${value.charCodeAt(0).toString(16)}${value.slice(1)}`,
      ),
    );
    assert.match(
      encoded.headers.get('content-security-policy'),
      /sandbox allow-scripts/,
    );
    assert.equal(document.headers.get('access-control-allow-origin'), '*');
    assert.ok(
      (await readFile(path.join(dataDir, 'submissions', htmlId))).length,
    );
  });
  await check(
    'ZIP 待审时不解压，通过后保留相对资源；拒绝穿越/链接/重复/超额目录',
    async () => {
      const archive = zip([
        [
          'project/index.html',
          '<script type="module" src="./main.js"></script>',
        ],
        ['project/main.js', 'document.body.textContent="ok"'],
      ]);
      const id = await draft('project.zip');
      assert.equal((await upload(id, archive)).status, 201);
      assert.equal(
        (await readdir(path.join(dataDir, 'submissions'))).some((name) =>
          name.endsWith('.html'),
        ),
        false,
      );
      const response = await json(
        `/api/admin/submissions/${id}/review`,
        { action: 'approve', note: '' },
        owner.cookie,
      );
      assert.equal(response.status, 200);
      const item = (await response.json()).submission;
      assert.match(
        await readFile(
          path.join(dataDir, 'inbox', item.inboxName, 'main.js'),
          'utf8',
        ),
        /ok/,
      );
      for (const entries of [
        [['../index.html', 'bad']],
        [
          ['index.html', 'ok'],
          ['link.js', 'bad', 0xa000 << 16],
        ],
        [
          ['index.html', 'ok'],
          ['INDEX.HTML', 'bad'],
        ],
        [
          ['index.html', 'ok'],
          ['.env', 'secret'],
        ],
      ])
        assert.throws(() => inspectSubmissionZip(zip(entries)));
      const huge = zip([['index.html', 'ok']]);
      const central = huge.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      huge.writeUInt32LE(100 * 1024 * 1024, central + 24);
      assert.throws(() => inspectSubmissionZip(huge));
    },
  );
  await check('退回保留说明与原件，不入库；审核幂等冲突明确返回', async () => {
    const id = await draft('story.txt');
    assert.equal((await upload(id, 'Story')).status, 201);
    assert.equal(
      (
        await json(
          `/api/admin/submissions/${id}/review`,
          { action: 'reject', note: '' },
          owner.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await json(
          `/api/admin/submissions/${id}/review`,
          { action: 'reject', note: 'Wrong prompt' },
          owner.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await json(
          `/api/admin/submissions/${id}/review`,
          { action: 'approve', note: '' },
          owner.cookie,
        )
      ).status,
      409,
    );
    const own = await (await get('/api/submissions', other.cookie)).json();
    assert.equal(
      own.submissions.find((item) => item.id === id).reviewNote,
      'Wrong prompt',
    );
    assert.equal(
      await readFile(path.join(dataDir, 'submissions', id), 'utf8'),
      'Story',
    );
  });
  await check('未完成上传过期释放名额，已提交原件不受清理影响', async () => {
    const old = await draft('unfinished.txt');
    db.prepare('UPDATE submissions SET created_at=? WHERE id=?').run(
      Date.now() - 7200000,
      old,
    );
    const current = await draft('fresh.txt');
    assert.equal(
      db.prepare('SELECT id FROM submissions WHERE id=?').get(old),
      undefined,
    );
    assert.ok(db.prepare('SELECT id FROM submissions WHERE id=?').get(current));
    assert.ok(
      (await readFile(path.join(dataDir, 'submissions', htmlId))).length,
    );
  });
} finally {
  db?.close();
  await stop();
  // mkdtemp 的绝对路径必须仍在系统临时目录内，才允许清理。
  assert.ok(
    path.dirname(dataDir) === path.resolve(tmpdir()) &&
      path.basename(dataDir).startsWith('aob-beta-'),
    'Unsafe cleanup path',
  );
  await rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(
    () => {},
  );
}
console.log(`${count} beta API groups passed`);
