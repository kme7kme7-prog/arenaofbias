// Download public answers only. Originals and the review fixture stay in ignored .local/.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const run = promisify(execFile);
const directory = path.resolve('.local/orange-review');
const promptId = 'q-5ebd7c84dff7cd8f';
await mkdir(path.join(directory, 'originals'), { recursive: true });
async function readPublic(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/^(api\.arenaofbias\.icu|w[0-9a-f]{32}\.w\.arenaofbias\.icu)$/.test(parsed.hostname)) {
    throw new Error(`Unexpected public host: ${parsed.hostname}`);
  }
  const headers = path.join(directory, `headers-${createHash('sha256').update(url).digest('hex').slice(0, 16)}.txt`);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { stdout } = await run('curl.exe', ['--ssl-no-revoke', '--fail', '--silent', '--show-error', '--dump-header', headers, '--max-time', '25', url], { encoding: 'buffer', maxBuffer: 12 * 1024 * 1024 });
      return stdout.toString('utf8');
    } catch (error) {
      const response = await readFile(headers, 'utf8').catch(() => '');
      if (!response.includes('429') || attempt === 2) throw error;
      const retry = response.match(/retry-after:\s*(.+)/i)?.[1]?.trim();
      const wait = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(60000, Date.parse(retry || '') - Date.now() || 0);
      console.log(`Public service rate limit; waiting ${Math.ceil(wait / 1000)} seconds`);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
}
const [catalog, roster] = await Promise.all([
  readPublic('https://api.arenaofbias.icu/api/prompts').then(JSON.parse),
  readPublic('https://api.arenaofbias.icu/api/works').then(JSON.parse),
]);
const prompt = catalog.prompts.find(item => item.id === promptId);
if (!prompt) throw new Error('The public orange prompt is unavailable');
const works = roster.works.filter(item => item.promptId === promptId);
const extracted = [];
let cursor = 0;
await Promise.all(Array.from({ length: 1 }, async () => {
  while (cursor < works.length) {
    const work = works[cursor++];
    const source = JSON.parse(work.content);
    const filename = path.join(directory, 'originals', `${work.id}.html`);
    const html = await readFile(filename, 'utf8').catch(async () => {
      await new Promise(resolve => setTimeout(resolve, 1200));
      return readPublic(source.src);
    });
    if (!html.includes('<title>文本作品</title>')) throw new Error(`Not a platform text document: ${work.id}`);
    await writeFile(filename, html);
    // Parse in the standard-library HTML parser; never run a work's HTML or script.
    const { stdout } = await run('python', ['-X', 'utf8', '-c', `
from html.parser import HTMLParser
import sys,json
class Text(HTMLParser):
 def __init__(self):
  super().__init__(); self.active=False; self.parts=[]; self.item=0
 def handle_starttag(self,tag,attrs):
  if tag=='main': self.active=True
  if self.active and tag=='br': self.parts.append('\\n')
  if self.active and tag=='li':
   self.item+=1; self.parts.append(str(self.item)+'. ')
 def handle_endtag(self,tag):
  if tag=='main': self.active=False
  if self.active and tag in ('p','li','pre','h1','h2','h3'): self.parts.append('\\n')
 def handle_data(self,text):
  if self.active: self.parts.append(text)
p=Text(); p.feed(open(sys.argv[1],encoding='utf-8').read())
print(json.dumps([line.strip() for line in ''.join(p.parts).splitlines() if line.strip()],ensure_ascii=False))
`, filename], { encoding: 'utf8' });
    const paragraphs = JSON.parse(stdout);
    if (!paragraphs.length) throw new Error(`Empty answer: ${work.id}`);
    extracted.push({ ...work, originalContent: work.content, sha256: createHash('sha256').update(html).digest('hex'),
      content: JSON.stringify({ kind: 'text', story: { paragraphs } }) });
  }
}));
extracted.sort((a, b) => a.id.localeCompare(b.id));
const fixture = { fetchedAt: new Date().toISOString(), prompt, works: extracted };
await writeFile(path.join(directory, 'snapshot.json'), JSON.stringify(fixture, null, 2));
console.log(JSON.stringify({ prompt: prompt.name, count: extracted.length, bytes: Buffer.byteLength(JSON.stringify(fixture)),
  paragraphCounts: extracted.reduce((counts, work) => { const n = JSON.parse(work.content).story.paragraphs.length; counts[n] = (counts[n] || 0) + 1; return counts; }, {}),
  snapshot: path.join(directory, 'snapshot.json') }, null, 2));
