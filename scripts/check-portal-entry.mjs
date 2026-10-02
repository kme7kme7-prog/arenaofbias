import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const gallery = resolve(process.env.GALLERY_SOURCE ?? '../Show2/ArenaGalleri-intake-20261001');
// Git checkouts may use different line endings on Windows; compare protocol source.
const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const boot = read('public/entry-boot.js');
assert.equal(boot, read(`${gallery}/site/entry-boot.js`), 'both arrivals share the same protocol');
assert.match(boot, /phase !== 'settling'/, 'late readiness cannot reveal a failed sheet');
assert.match(boot, /25000/);
assert.match(boot, /document.fonts.ready/);
assert.match(boot, /img.decode/);
assert.match(boot, /prefers-reduced-motion/);
assert.match(boot, /返回入口/);
for (const path of ['index.html', `${gallery}/site/index.html`]) {
  const html = read(path);
  assert.ok(html.indexOf('dataset.entry') < html.indexOf('entry-boot.js'), 'first-paint cover precedes scripts');
  assert.match(html, /html\[data-entry\]::after/);
}
assert.match(read('portal/transition.js'), /await animation.finished; location.assign/);
assert.match(read('portal/transition.js'), /pageshow/);
assert.match(read('app/site-scale.css'), /html \{ zoom: .8; \}/);
console.log('Portal source invariants passed.');
