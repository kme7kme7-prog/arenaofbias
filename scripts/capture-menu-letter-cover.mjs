import { chromium } from 'playwright-core';
import { once } from 'node:events';
import { createMenuDemoApp } from './serve-menu-demo.mjs';

// Reuse the actual preview's DOM, typography and excerpts for its directory cover.
const server = createMenuDemoApp().listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 480, height: 440 },
    deviceScaleFactor: 2,
  });
  await page.goto(
    `http://127.0.0.1:${server.address().port}/reference/menu-demo/letters.html`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const cover = document.querySelector('.cards').cloneNode(true);
    cover.className = 'cover-capture';
    cover.removeAttribute('id');
    document.body.append(cover);
  });
  await page.addStyleTag({
    content: `
    html, body { background: transparent !important; }
    body > :not(.cover-capture) { display: none !important; }
    .cover-capture { position: relative; width:480px; height:440px; }
    .cover-capture .work-card { position:absolute; width:216px; height:324px; padding:20px 20px 0; grid-template-rows:minmax(0,1fr) 44px; max-width:none; box-shadow:1px 2px 0 #e2d7be,2px 4px 0 #f4ead6,0 10px 16px -8px #574b3340; }
    .cover-capture .work-a { left:39px; top:77px; transform:rotate(-10deg); z-index:2; }
    .cover-capture .work-b { left:232px; top:29px; transform:rotate(8deg); }
    .cover-capture .letter-top { margin-bottom:21px; }
    .cover-capture .letter-greeting { font-size:12px; }
    .cover-capture .letter-index { font-size:25px; }
    .cover-capture .letter-body { font-size:17px; line-height:1.8; }
    .cover-capture .letter-ellipsis { font-size:16px; margin:10px 0; }
    .cover-capture .letter-end { font-size:14px; line-height:1.8; }
    .cover-capture .identity-anonymous { font-size:10px; }
    .cover-capture .choice-icon { display:none; }
  `,
  });
  await page.screenshot({
    path: 'reference/menu-demo/assets/letter-cover.png',
    omitBackground: true,
  });
  console.log('Captured letter-cover.png from the letter preview.');
} finally {
  await browser.close();
  server.close();
}
