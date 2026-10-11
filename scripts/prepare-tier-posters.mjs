import { chromium } from 'playwright-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const topics = JSON.parse(await readFile('reference/tier-play/topics.json'));
const b = await chromium.launch({ channel: 'msedge', headless: true });
const p = await b.newPage();
let total = 0;
for (const t of topics.filter((t) => t.kind === 'scene'))
  for (const [i] of t.workIds.entries()) {
    const alias = String.fromCharCode(97 + i);
    const source = `output/tier-play/posters/${t.id === '004' ? '' : t.id + '/'}${alias}.png`;
    const png = await readFile(source);
    const bytes = await p.evaluate(
      async (data) => {
        const img = new Image();
        img.src = data;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.9));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      },
      'data:image/png;base64,' + png.toString('base64'),
    );
    const dir = `public/tier/posters/${t.id}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/${alias}.webp`, Buffer.from(bytes));
    total += bytes.length;
  }
await b.close();
console.log('88 real-work posters:', total, 'bytes');
