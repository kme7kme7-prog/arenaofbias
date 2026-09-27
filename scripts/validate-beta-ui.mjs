// 公测流程回归：真实临时 SQLite/HTTP + 独立浏览器；只有每日日期与手机分享能力用可控桩。
// 先 npm run build。不会连接线上、修改本机真实数据库或接管已有浏览器。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { chromium } from 'playwright-core';
import { createJiti } from 'jiti';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'output/playwright');
await mkdir(out, { recursive: true });
const dataDir = await mkdtemp(path.join(tmpdir(), 'aob-beta-ui-'));
const base = `http://127.0.0.1:${30000 + Math.floor(Math.random() * 8000)}`;
let logs = '',
  browser,
  db;
const results = [],
  errors = [];
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  windowsHide: true,
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: new URL(base).port,
    HOST: '127.0.0.1',
    APP_ORIGIN: base,
    RATE_LIMIT_PER_MIN: '1000',
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
async function check(name, fn) {
  await fn();
  results.push(name);
  console.log(`PASS ${name}`);
}
async function context(options = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion: 'reduce',
    ...options,
  });
  await ctx.addInitScript(() => {
    if (window !== window.top) return;
    try {
      localStorage.setItem('arena-language', 'zh');
      localStorage.setItem('aob-beta-notice', 'v3');
    } catch {
      /* 原图页和直接打开的隔离投稿不允许存储；与站点应用无关。 */
    }
  });
  ctx.on('page', (page) => {
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) => errors.push(error.message));
  });
  return ctx;
}
async function screenshot(page, name) {
  await page.screenshot({
    path: path.join(out, `beta-${name}.png`),
    fullPage: true,
  });
}
async function noOverflow(page, name) {
  const size = await page.evaluate(() => ({
    width: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(
    size.content <= size.width + 1,
    `${name} horizontal overflow: ${JSON.stringify(size)}`,
  );
}
try {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error('Temporary server stopped');
    if (logs.includes(`[arenaofbias] ${base}`)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser = await chromium.launch({
    executablePath:
      process.env.THUMB_BROWSER || (existsSync(edge) ? edge : undefined),
    headless: true,
  });
  db = new Database(path.join(dataDir, 'comments.db'));
  // 用仓库自带单文件鹈鹕呈现真实网页构图，临时库种子原本没有可显示的 003 文件。
  db.prepare("UPDATE works SET content=? WHERE prompt_id='003'").run(
    JSON.stringify({
      kind: 'html',
      src: '/works/pelican-cycle.html',
      framing: { width: 1280, height: 720 },
    }),
  );
  const guest = await context();
  const page = await guest.newPage();
  await check('匿名真实投票入榜，重开同对局仍去重', async () => {
    await page.goto(`${base}/#arena/002`);
    await page.waitForSelector('.phase-voting');
    await page.locator('.vote-a').click();
    await page.waitForSelector('.phase-result .vote-note[data-state="saved"]');
    assert.equal(
      db.prepare('SELECT COUNT(*) n FROM votes WHERE user_id IS NULL').get().n,
      1,
    );
    await page.reload();
    await page.waitForSelector('.phase-voting');
    await page.locator('.vote-b').click();
    await page.waitForSelector('.phase-result .vote-note[data-state="dup"]');
  });
  await check(
    '桌面及 320/390/768 窄屏的首页、竞技场、题库、榜单、玩法、投稿布局',
    async () => {
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: width < 700 ? 844 : 960 });
        for (const [route, ready] of [
          ['home', '.next-home'],
          ['arena/003', '.phase-voting'],
          ['prompts', '.prompt-library'],
          ['rank', '.rank-page'],
          ['play', '.play-classic'],
          ['submit', '.submission-main'],
        ]) {
          await page.goto(`${base}/#${route}`);
          await page.waitForSelector(ready);
          if (route === 'arena/003')
            await page.waitForFunction(
              () =>
                Number(
                  getComputedStyle(document.querySelector('.vote-draw'))
                    .opacity,
                ) > 0.99,
            );
          await page.evaluate(() => document.fonts.ready);
          await noOverflow(page, `${route}-${width}`);
          if (['home', 'arena/003', 'submit'].includes(route) || width === 390)
            await screenshot(page, `${route.replace('/', '-')}-${width}`);
          if (route === 'arena/003') {
            await page.evaluate(() => scrollTo(0, 500));
            const top = await page.locator('.topbar').boundingBox();
            assert.ok(Math.abs(top.y) < 1, 'arena navigation remains visible');
            assert.equal(
              await page.locator('.sequence-steps, .command-row').count(),
              0,
            );
            await page
              .getByRole('button', { name: '同一题库继续', exact: true })
              .click();
            await page.waitForSelector('.phase-voting');
            const heading = await page.locator('.briefing').boundingBox();
            assert.ok(
              heading.y >= top.height - 1,
              `prompt hidden behind navigation at ${width}: ${heading.y}/${top.height}`,
            );
          }
        }
      }
    },
  );
  const author = await context();
  const email = 'beta-ui-author@aob.test';
  await author.request.post(`${base}/api/auth/email/send`, {
    headers: { origin: base },
    data: { purpose: 'register', email },
  });
  const code = logs
    .split('\n')
    .find((line) => line.includes(`email=${email}`) && line.includes('code='))
    .match(/code=(\d{6})/)[1];
  const registered = await author.request.post(`${base}/api/auth/register`, {
    headers: { origin: base },
    data: {
      username: 'beta_ui_author',
      email,
      password: 'beta-ui-only-password',
      code,
    },
  });
  assert.equal(registered.status(), 201);
  const authorPage = await author.newPage();
  const admin = await context();
  assert.equal(
    (
      await admin.request.post(`${base}/api/auth/dev`, {
        headers: { origin: base },
        data: {},
      })
    ).status(),
    201,
  );
  const adminPage = await admin.newPage();
  await check('用户投稿、管理员审核、用户结果同步；审批前不公开', async () => {
    await authorPage.goto(`${base}/#submit`);
    await authorPage.getByLabel('题目', { exact: true }).selectOption('003');
    await authorPage
      .getByLabel('具体模型', { exact: true })
      .fill('Beta Browser Model');
    await authorPage
      .getByLabel('作品标题', { exact: true })
      .fill('浏览器投稿回归');
    await authorPage
      .getByLabel('测试说明', { exact: true })
      .fill('自动化验证临时原件。');
    const html =
      '<!doctype html><h1>Sandbox fixture</h1><script type="module" src="./module.js"></script><script>try{parent.document.body;window.parentBlocked=false}catch{window.parentBlocked=true}try{localStorage.getItem("x");window.storageBlocked=false}catch{window.storageBlocked=true}</script>';
    await authorPage
      .locator('input[type=file]')
      .setInputFiles({
        name: 'fixture.html',
        mimeType: 'text/html',
        buffer: Buffer.from(html),
      });
    await authorPage
      .getByRole('button', { name: '提交审核', exact: true })
      .click();
    await authorPage.getByText('待审核', { exact: true }).waitFor();
    const submitted = db.prepare('SELECT * FROM submissions').get();
    assert.equal(submitted.status, 'pending');
    await screenshot(authorPage, 'submit-pending');
    await authorPage.setViewportSize({ width: 390, height: 844 });
    await noOverflow(authorPage, 'submission-form-390');
    await screenshot(authorPage, 'submit-pending-390');
    await adminPage.goto(`${base}/admin#submissions`);
    await adminPage
      .getByRole('heading', { name: '浏览器投稿回归', exact: true })
      .waitFor();
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await noOverflow(adminPage, 'submission-review-390');
    await screenshot(adminPage, 'submit-review-390');
    adminPage.once('dialog', (dialog) => dialog.accept());
    await adminPage
      .getByRole('button', { name: '通过并转入收件箱', exact: true })
      .click();
    await adminPage.getByText('当前没有这类投稿。').waitFor();
    await authorPage.getByRole('button', { name: '刷新', exact: true }).click();
    await authorPage.getByText('审核通过', { exact: true }).waitFor();
    assert.equal(
      db
        .prepare('SELECT COUNT(*) n FROM works WHERE model_name=?')
        .get('Beta Browser Model').n,
      0,
    );
    const row = db
      .prepare('SELECT * FROM submissions WHERE id=?')
      .get(submitted.id);
    const response = await admin.request.post(
      `${base}/api/admin/inbox/register`,
      {
        headers: { origin: base },
        data: {
          name: row.inbox_name,
          promptId: '003',
          modelName: row.model_name,
          title: row.title,
        },
      },
    );
    assert.equal(response.status(), 201);
    const work = (await response.json()).work;
    const moduleFile = path.join(dataDir, 'works', '003', 'module.js');
    await mkdir(path.dirname(moduleFile), { recursive: true });
    await writeFile(moduleFile, 'window.moduleLoaded=true;');
    await page.goto(`${base}${work.content.src}`);
    await page.waitForFunction(() => window.moduleLoaded === true);
    // CSP 对直接打开原件也生效，静态 module 通过 CORS 加载。
    assert.equal(await page.evaluate(() => window.storageBlocked), true);
    await page.goto(`${base}/#home`);
    await page.evaluate((src) => {
      const frame = document.createElement('iframe');
      frame.src = src;
      frame.sandbox = 'allow-scripts';
      frame.id = 'isolation-fixture';
      document.body.append(frame);
    }, work.content.src);
    await page
      .frameLocator('#isolation-fixture')
      .getByRole('heading', { name: 'Sandbox fixture' })
      .waitFor();
    const target = page.frame({ url: `${base}${work.content.src}` });
    await target.waitForFunction(() => window.moduleLoaded === true);
    assert.equal(
      await target.evaluate(
        () => window.parentBlocked && window.storageBlocked,
      ),
      true,
    );
    assert.equal(
      (
        await admin.request.patch(`${base}/api/admin/works/${work.id}`, {
          headers: { origin: base },
          data: { published: true },
        })
      ).status(),
      200,
    );
    await page.goto(`${base}/capture.html?id=${work.id}`);
    await page.waitForFunction(
      () => document.documentElement.dataset.captureReady === 'true',
    );
    const capture = await page.locator('#capture-stage').screenshot();
    assert.ok(capture.length > 1000);
  });
  const daily = await context();
  const today = await (
    await daily.request.get(`${base}/api/guess/today`)
  ).json();
  const { GUESS_MODELS, judge } = await createJiti(import.meta.url).import(
    '../lib/guess-logic.ts',
  );
  const answer = GUESS_MODELS.find(
    (model) => model.difficulty <= 2 && model.modalities.length > 1,
  );
  const wrong = GUESS_MODELS.filter(
    (model) => model.difficulty <= 2 && model.id !== answer.id,
  );
  let day = today.dayKey,
    checks = 0,
    reports = 0,
    rollOnCheck = false;
  await daily.route('**/api/guess/today', (route) =>
    route.fulfill({ json: { ...today, dayKey: day } }),
  );
  await daily.route('**/api/guess/check', async (route) => {
    const body = route.request().postDataJSON();
    if (rollOnCheck) {
      day = '2026-10-02';
      rollOnCheck = false;
    }
    if (!body.gameId && body.dayKey !== day)
      return route.fulfill({ status: 409, json: { code: 'day-changed' } });
    checks++;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const feedback = judge(
      GUESS_MODELS.find((model) => model.id === body.guessId),
      answer,
    );
    return route.fulfill({
      json: { feedback, answer: feedback.won || body.final ? answer : null },
    });
  });
  await daily.route('**/api/guess/result', (route) => {
    reports++;
    return route.fulfill({ json: { ok: true } });
  });
  const dailyPage = await daily.newPage();
  const enterDaily = async (p) => {
    if (p.url() === `${base}/#guess`) await p.reload();
    else await p.goto(`${base}/#guess`);
    await p.locator('.guess-daily-card').click();
    await p.waitForSelector('.guess-search-section, .guess-result');
  };
  const guess = async (p, model) => {
    await p.getByRole('combobox').fill(model.name);
    await p.getByRole('combobox').press('Enter');
  };
  await check(
    '每日刷新续局、多标签并发只写一猜，完成锁定且只结算一次',
    async () => {
      await enterDaily(dailyPage);
      await guess(dailyPage, wrong[0]);
      await dailyPage.waitForSelector('tbody .guess-row:not(.guess-ghost)');
      await enterDaily(dailyPage);
      assert.equal(
        await dailyPage.locator('tbody .guess-row:not(.guess-ghost)').count(),
        1,
      );
      const second = await daily.newPage();
      await enterDaily(second);
      const before = checks;
      await Promise.all([
        dailyPage.getByRole('combobox').fill(wrong[1].name),
        second.getByRole('combobox').fill(wrong[1].name),
      ]);
      await Promise.all([
        dailyPage.getByRole('combobox').press('Enter'),
        second.getByRole('combobox').press('Enter'),
      ]);
      await dailyPage.waitForFunction(
        () =>
          document.querySelectorAll('tbody .guess-row:not(.guess-ghost)')
            .length === 2,
      );
      assert.equal(checks, before + 1);
      await guess(dailyPage, answer);
      await dailyPage.waitForSelector('.guess-result');
      assert.ok(
        await dailyPage
          .locator('.guess-row.is-correct .gcell[aria-label^="模态:"]')
          .evaluate((cell) => cell.classList.contains('hit')),
      );
      await second.waitForSelector('.guess-result');
      assert.equal(await second.getByRole('combobox').count(), 0);
      await enterDaily(dailyPage);
      assert.equal(await dailyPage.getByRole('combobox').count(), 0);
      assert.equal(
        await dailyPage
          .getByRole('button', { name: '再来一把', exact: true })
          .count(),
        0,
      );
      assert.equal(
        await dailyPage.evaluate(
          () => JSON.parse(localStorage.getItem('guess-stats')).played,
        ),
        1,
      );
      assert.equal(reports, 1);
      await screenshot(dailyPage, 'daily-finished');
      await second.close();
    },
  );
  await check('次日开放新题，服务器跨日拒绝旧棋盘，练习仍可重开', async () => {
    day = '2026-10-01';
    await enterDaily(dailyPage);
    assert.equal(
      await dailyPage.locator('tbody .guess-row:not(.guess-ghost)').count(),
      0,
    );
    await guess(dailyPage, wrong[0]);
    await dailyPage.waitForSelector('tbody .guess-row:not(.guess-ghost)');
    rollOnCheck = true;
    await guess(dailyPage, wrong[1]);
    await dailyPage
      .getByText('已过零点，新的一天开始了——已为你切到今天的题。')
      .waitFor();
    assert.equal(
      await dailyPage.locator('tbody .guess-row:not(.guess-ghost)').count(),
      0,
    );
    await dailyPage.reload();
    await dailyPage
      .locator('.guess-difficulty-card:not(.guess-daily-card)')
      .first()
      .click();
    await guess(dailyPage, wrong[0]);
    await dailyPage.locator('.guess-reveal').click();
    await dailyPage
      .getByRole('button', { name: '再来一把', exact: true })
      .click();
    await dailyPage.getByRole('combobox').waitFor();
    assert.equal(
      await dailyPage.locator('tbody .guess-row:not(.guess-ghost)').count(),
      0,
    );
  });
  await check(
    '八次用尽同样锁定，旧版只有结算标记的浏览器不能重开',
    async () => {
      day = '2026-10-03';
      await enterDaily(dailyPage);
      for (let i = 0; i < 8; i++) {
        await guess(dailyPage, wrong[i]);
        await dailyPage.waitForFunction(
          (n) =>
            document.querySelectorAll('tbody .guess-row:not(.guess-ghost)')
              .length === n,
          i + 1,
        );
      }
      await dailyPage.waitForSelector('.guess-result.is-loss');
      await enterDaily(dailyPage);
      assert.equal(await dailyPage.getByRole('combobox').count(), 0);
      const legacy = await context();
      const oldPage = await legacy.newPage();
      await oldPage.addInitScript((key) => {
        if (window === window.top)
          localStorage.setItem(`guess-settled:${key}`, '1');
      }, today.dayKey);
      await enterDaily(oldPage);
      await oldPage.waitForSelector('.guess-result');
      assert.equal(await oldPage.getByRole('combobox').count(), 0);
      await legacy.close();
    },
  );
  await check(
    '手机保存原图降级、原生分享取消/失败；桌面实际下载 PNG',
    async () => {
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );
      for (const native of [false, true]) {
        const mobile = await context({
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        });
        await mobile.route('**/share/card.png?*', (route) =>
          route.fulfill({ contentType: 'image/png', body: png }),
        );
        if (native)
          await mobile.addInitScript(() => {
            window.shareMode = 'ok';
            window.shareCalls = [];
            Object.defineProperty(navigator, 'canShare', { value: () => true });
            Object.defineProperty(navigator, 'share', {
              value: async (data) => {
                window.shareCalls.push({
                  active: navigator.userActivation.isActive,
                  files: data.files.length,
                  type: data.files[0].type,
                });
                if (window.shareMode !== 'ok')
                  throw new DOMException('fixture', window.shareMode);
              },
            });
          });
        else
          await mobile.addInitScript(() => {
            Object.defineProperty(navigator, 'share', { value: undefined });
            Object.defineProperty(navigator, 'canShare', { value: undefined });
          });
        const p = await mobile.newPage();
        await p.goto(`${base}/#home`);
        await p
          .getByRole('button', { name: '分享这个页面', exact: true })
          .click();
        const save = p.getByRole('link', { name: '保存高清图片', exact: true });
        await p.locator('.share-save:not(.is-disabled)').waitFor();
        assert.match(
          await p.locator('.share-preview img').getAttribute('src'),
          /^\/share\/card.png/,
        );
        if (native) {
          await save.click();
          assert.deepEqual(await p.evaluate(() => window.shareCalls[0]), {
            active: true,
            files: 1,
            type: 'image/png',
          });
          await p.evaluate(() => {
            window.shareMode = 'AbortError';
          });
          await save.click();
          assert.doesNotMatch(
            await p.locator('.share-status').innerText(),
            /不可用|失败/,
          );
          await p.evaluate(() => {
            window.shareMode = 'NotAllowedError';
          });
          await save.click();
          await p
            .getByText(
              '请点“打开原图保存”，长按图片保存；也可在系统浏览器中打开。',
            )
            .waitFor();
        } else {
          assert.equal(
            await p.evaluate(() => matchMedia('(pointer: coarse)').matches),
            true,
          );
          assert.equal(await save.getAttribute('target'), '_blank');
          const popup = mobile.waitForEvent('page');
          await save.click();
          const opened = await popup;
          await opened.waitForLoadState();
          assert.match(opened.url(), /\/share\/card.png\?/);
          await opened.close();
        }
        await noOverflow(p, `share-mobile-${native}`);
        await screenshot(p, `share-mobile-${native}`);
        // 外发的独立分享页使用另一份脚本，同样验证保存按钮与原图降级。
        await p.goto(`${base}/share?type=site`);
        await p.waitForSelector('.actions');
        if (native) {
          await p.waitForFunction(() => Boolean(imageFile));
          await p.locator('.actions a').first().click();
          assert.deepEqual(await p.evaluate(() => window.shareCalls[0]), {
            active: true,
            files: 1,
            type: 'image/png',
          });
        } else {
          const popup = mobile.waitForEvent('page');
          await p.locator('.actions a').first().click();
          const opened = await popup;
          await opened.waitForLoadState();
          assert.match(opened.url(), /\/share\/card.png\?/);
          await opened.close();
        }
        await noOverflow(p, `share-public-${native}`);
        await mobile.close();
      }
      await guest.route('**/share/card.png?*', (route) =>
        route.fulfill({ contentType: 'image/png', body: png }),
      );
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.goto(`${base}/#home`);
      await page
        .getByRole('button', { name: '分享这个页面', exact: true })
        .click();
      await page.locator('.share-save:not(.is-disabled)').waitFor();
      const download = page.waitForEvent('download');
      await page
        .getByRole('link', { name: '保存高清图片', exact: true })
        .click();
      assert.match(
        (await download).suggestedFilename(),
        /^arena-of-bias(?:-[a-z]+)?\.png$/,
      );
    },
  );
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally {
  await writeFile(
    path.join(out, 'beta-ui-results.json'),
    JSON.stringify({ passed: results, errors }, null, 2),
  );
  db?.close();
  await browser?.close();
  if (child.exitCode === null) {
    const exit = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await exit;
  }
  assert.equal(path.dirname(dataDir), path.resolve(tmpdir()));
  await rm(dataDir, { recursive: true, force: true, maxRetries: 3 });
}
console.log(`${results.length} beta browser groups passed`);
