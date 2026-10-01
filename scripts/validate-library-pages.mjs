// Build first. Many-prompt fixtures validate pagination and the menu footer.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright-core';

const app = express();
app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url))));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const prompts = Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1).padStart(3, '0'), name: `命题 ${i + 1}`, kind: i % 2 ? 'text' : 'web', category: '测试', code: 'TEST', prompt: `原文 ${i + 1}` }));
await mkdir('output/library-pages', { recursive: true });
try {
  for (const theme of ['paper', 'ink']) for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1080 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => {
      if (window !== window.top) return;
      localStorage.setItem('aob-theme', theme);
      localStorage.setItem('arena-language', 'zh');
      localStorage.setItem('aob-beta-notice', 'v3');
    }, theme);
    await page.route('**/api/**', route => route.fulfill({ json: { prompts, works: [], user: null } }));
    // Intercept cross-site navigation: validate destinations without starting a live blind match.
    await page.route('https://gallery.arenaofbias.icu/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Gallery destination fixture</title>' }));
    const origin = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(`${origin}#home`);
    const gallery = page.locator('.next-header nav a').filter({ hasText: '展览馆' });
    assert.equal(await gallery.getAttribute('href'), 'https://gallery.arenaofbias.icu/#/');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await gallery.click();
    await page.waitForURL('https://gallery.arenaofbias.icu/#/');
    await page.goto(`${origin}#play`);
    const footer = await page.locator('.legal-footer').boundingBox();
    assert.ok(Math.abs(footer.y + footer.height - 1080) <= 1, 'menu footer reaches viewport bottom');
    await page.screenshot({ path: `output/library-pages/menu-${theme}-${width}.png` });
    const formal = page.locator('a.play-classic-item').filter({ hasText: '正式测评' });
    assert.match(await formal.textContent(), /将跳转到展览馆/);
    await formal.click();
    await page.waitForURL('https://gallery.arenaofbias.icu/#/arena');
    await page.goto(`${origin}#prompts`);
    await page.waitForFunction(() => document.querySelector('.archive-summary strong')?.textContent === '25');
    const options = page.locator('.archive-option');
    const counter = page.locator('.archive-pagination output');
    assert.equal(await options.count(), 8);
    assert.equal((await counter.textContent()).trim(), '1 / 4');
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    assert.equal((await counter.textContent()).trim(), '2 / 4');
    assert.match(await page.locator('.archive-option[aria-pressed="true"]').textContent(), /009/);
    await page.getByRole('button', { name: '上一道命题', exact: true }).click();
    assert.equal((await counter.textContent()).trim(), '1 / 4', 'dossier previous moves directory back across a page boundary');
    await page.locator('.archive-option[aria-pressed="true"]').press('ArrowDown');
    assert.equal((await counter.textContent()).trim(), '2 / 4');
    assert.ok(await page.locator('.archive-option[aria-pressed="true"]').evaluate(node => node === document.activeElement));
    await page.locator('.archive-option[aria-pressed="true"]').press('End');
    assert.equal(await options.count(), 1);
    assert.equal((await counter.textContent()).trim(), '4 / 4');
    assert.ok(await page.getByRole('button', { name: '下一页', exact: true }).isDisabled());
    await page.getByRole('textbox', { name: '搜索提示词' }).fill('原文 25');
    assert.equal(await options.count(), 1);
    assert.equal(await page.locator('.archive-pagination').count(), 0);
    await page.getByRole('textbox', { name: '搜索提示词' }).fill('不存在');
    assert.equal(await options.count(), 0);
    await page.getByRole('button', { name: '查看全部提示词' }).click();
    assert.equal(await options.count(), 8);
    await page.locator('.archive-filters button').filter({ hasText: '文字' }).click();
    assert.equal((await counter.textContent()).trim(), '1 / 2');
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    assert.equal(await options.count(), 4);
    await page.locator('.archive-filters button').filter({ hasText: '全部' }).click();
    assert.equal((await counter.textContent()).trim(), '1 / 4');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `output/library-pages/library-${theme}-${width}.png`, fullPage: true });
    const visit = page.locator('.archive-enter');
    assert.match(await visit.textContent(), /前往展览馆.*浏览提示词与作品/s);
    await visit.click();
    await page.waitForURL('https://gallery.arenaofbias.icu/#/questions');
    assert.deepEqual(errors, []);
    console.log(`PASS ${theme}/${width}: footer, pages, partial last page, global search, filters, cross-page keyboard and dossier navigation`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
