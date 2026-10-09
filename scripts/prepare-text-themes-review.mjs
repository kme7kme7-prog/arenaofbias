// Read-only public snapshot. Original work content is never rewritten on disk.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const run = promisify(execFile), directory = '.local/text-themes-review';
await mkdir(`${directory}/html`, { recursive: true });
async function publicRead(url) {
  const { stdout } = await run('curl.exe', ['--ssl-no-revoke', '--fail', '--silent', '--show-error', '--retry', '2', '--retry-delay', '1', '--max-time', '30', url], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}
const cached = process.argv.includes('--cached');
const [catalog, roster] = await Promise.all(['prompts', 'works'].map(async name => JSON.parse(cached
  ? await readFile(`${directory}/${name}.json`, 'utf8')
  : await publicRead(`https://api.arenaofbias.icu/api/${name}`))));
const prompts = catalog.prompts.filter(p => p.kind === 'text');
const works = roster.works.filter(w => prompts.some(p => p.id === w.promptId));
const htmlFiles = {};
for (const work of works) {
  const content = JSON.parse(work.content);
  if (content.kind !== 'html' || !content.src) continue;
  const url = new URL(content.src);
  if (!/^[wpc][0-9a-f]{32}\.w\.arenaofbias\.icu$/.test(url.hostname) || !/^[a-zA-Z0-9_-]+$/.test(work.id)) throw new Error(`Untrusted content URL: ${work.id}`);
  const html = await publicRead(url.href);
  await writeFile(`${directory}/html/${work.id}.html`, html);
  htmlFiles[work.id] = { file: `${work.id}.html`, source: url.href, sha256: createHash('sha256').update(html).digest('hex') };
}
const snapshot = { fetchedAt: new Date().toISOString(), prompts, works, htmlFiles,
  hashes: Object.fromEntries(works.map(w => [w.id, createHash('sha256').update(w.content).digest('hex')])) };
await writeFile(`${directory}/snapshot.json`, JSON.stringify(snapshot, null, 2));
console.log(JSON.stringify(prompts.map(p => ({ id: p.id, name: p.name, works: works.filter(w => w.promptId === p.id && !w.isDemo).length })), null, 2));
