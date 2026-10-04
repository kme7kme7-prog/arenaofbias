// The apex permits /portal.js under script-src 'self'; keep CSS inline.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const html = await readFile(new URL('portal/index.html', root), 'utf8');
const css = await readFile(new URL('portal/transition.css', root), 'utf8');
const js = await readFile(new URL('portal/transition.js', root), 'utf8');
const bundled = html.replace('<link rel="stylesheet" href="transition.css">', `<style>${css}</style>`)
  .replace('<script src="transition.js" defer></script>', '')
  .replace('</body>', '<script src="/portal.js"></script>\n</body>');
await mkdir(new URL('output/portal-dist/', root), { recursive:true });
await writeFile(new URL('output/portal-dist/index.html', root), bundled);
await writeFile(new URL('output/portal-dist/portal.js', root), js);
console.log('Built output/portal-dist/index.html and portal.js (CSP-compatible apex).');
