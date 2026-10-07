// Read public text records only. Keep the original snapshot in ignored .local/.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const run = promisify(execFile);
const directory = path.resolve('.local/forum-review');
const promptId = 'q-a71a7e7e4bcaadc7';
async function readPublic(endpoint) {
  const { stdout } = await run('curl.exe', ['--ssl-no-revoke', '--fail', '--silent', '--show-error', '--max-time', '30',
    `https://api.arenaofbias.icu/api/${endpoint}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout);
}
const [catalog, roster] = await Promise.all([readPublic('prompts'), readPublic('works')]);
const prompt = catalog.prompts.find(item => item.id === promptId);
if (!prompt || prompt.kind !== 'text') throw new Error('The public forum prompt is unavailable');
const works = roster.works.filter(item => item.promptId === promptId);
if (works.length < 10) throw new Error('The public topic does not have enough works');
for (const work of works) {
  const content = JSON.parse(work.content);
  if (content.kind !== 'text' || !Array.isArray(content.story?.paragraphs) || !content.story.paragraphs.every(p => typeof p === 'string')) {
    throw new Error(`Not a native text answer: ${work.id}`);
  }
}
const snapshot = { fetchedAt: new Date().toISOString(), source: 'https://api.arenaofbias.icu/api/works', prompt, works,
  contentHashes: Object.fromEntries(works.map(work => [work.id, createHash('sha256').update(work.content).digest('hex')])) };
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
console.log(JSON.stringify({ topic: prompt.name, works: works.length, models: new Set(works.map(w => w.modelId)).size,
  fetchedAt: snapshot.fetchedAt, snapshot: path.join(directory, 'snapshot.json') }));
