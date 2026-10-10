// Read-only rehearsal of the built main site and its actual shared content handler.
// The in-memory compatibility fixture never opens or writes the production database.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { openDatabase } from '../../Show2/fusion/arenaofbias-server/server/db.mjs';
import { createRouter } from '../../Show2/fusion/arenaofbias-server/server/http.mjs';
import { registerShow1Compat } from '../../Show2/fusion/arenaofbias-server/server/show1compat.mjs';
import { createContentHandler } from '../../Show2/fusion/arenaofbias-server/server/content.mjs';
import { config } from '../../Show2/fusion/arenaofbias-server/server/config.mjs';

const sitePort = Number(process.argv[2] || process.env.PLAYGROUND_SITE_PORT || 5450), contentPort = sitePort + 1;
const root = process.cwd(), siteOrigin = `http://127.0.0.1:${sitePort}`;
const sources = JSON.parse(await readFile('.local/object-stage/sources.json', 'utf8'));
const objectRoster = JSON.parse(await readFile('.local/object-stage-library/works.json', 'utf8'));
const text = JSON.parse(await readFile('.local/text-themes-review/snapshot.json', 'utf8'));
const byKey = new Map(sources.map(work => [work.key, work]));
const metadata = new Map(objectRoster.works.map(work => [work.id, work]));
const works = sources.map(work => ({ ...metadata.get(work.workId), content: JSON.stringify({ kind: 'html', src: `http://${work.key}.localhost:${contentPort}/` }) }));
for (const work of text.works) {
  const file = text.htmlFiles[work.id];
  if (!file) { works.push(work); continue; }
  const key = 'w' + createHash('md5').update(work.id).digest('hex');
  byKey.set(key, { id: work.id, workId: work.id, taskId: work.promptId, dir: path.resolve('.local/text-themes-review/html'), entry: file.file, moderation: { status: 'legacy' } });
  works.push({ ...work, content: JSON.stringify({ kind: 'html', src: `http://${key}.localhost:${contentPort}/` }) });
}
const objectData = JSON.parse(await readFile('.local/object-stage/data.json', 'utf8'));
const prompts = [...text.prompts.filter(prompt => !objectData.topics.some(topic => topic.promptId === prompt.id)),
  ...objectData.topics.map(topic => ({ id: topic.promptId, name: topic.name, prompt: topic.prompt, detail: topic.description, commentary: '', code: topic.promptId, category: '3D', kind: 'web' }))];
const workMap = Object.fromEntries(works.map(work => {
  const content = JSON.parse(work.content);
  return [work.id, { key: content.kind === 'html' ? new URL(content.src).hostname.split('.')[0] : null, up: work.id, task: work.promptId, round: work.promptId }];
}));
const snapshot = { generatedAt: '', prompts, works, workMap, upToRid: {},
  taskByRound: Object.fromEntries(prompts.map(prompt => [prompt.id, prompt.id])), roundByTask: Object.fromEntries(prompts.map(prompt => [prompt.id, prompt.id])) };
const library = { byContentKey: key => byKey.get(key), publicContent: () => true, calibrationOf: work => ({ camera: work.camera }), curated: () => [], draftByToken: () => null };
const router = createRouter(), db = openDatabase(':memory:');
registerShow1Compat(router, { db, library, catalog: { tasks: () => [], model: () => null }, snapshot, config: { contentTemplate: `http://{token}.localhost:${contentPort}` }, limit: {} });
const content = createContentHandler({ config, siteOrigins: [siteOrigin], library, arena: {}, readGuard: { file() {}, page() {} } });
const contentServer = createServer(content);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const site = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, siteOrigin);
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET') { res.writeHead(403); return res.end(JSON.stringify({ error: '接入预演不保存数据' })); }
      if (url.pathname === '/api/auth/me') return res.end('{"user":null}');
      if (url.pathname === '/api/ratings') return res.end('{"ratings":{},"games":{}}');
      const route = router.match(req.method, url.pathname);
      if (!route) return res.end('{}');
      return res.end(JSON.stringify(await route.handler({ req, res, url, params: route.params, ip: '127.0.0.1', user: null })));
    }
    const filename = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const base = path.resolve(root, 'dist'), file = path.resolve(base, '.' + filename);
    if (!file.startsWith(base + path.sep)) { res.writeHead(404); return res.end(); }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (error) { res.writeHead(404); res.end('预演资源暂时不可用'); console.error(error.message); }
});
site.listen(sitePort, '127.0.0.1'); contentServer.listen(contentPort, '127.0.0.1');
console.log(`Integration rehearsal: ${siteOrigin}/#play`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { site.close(); contentServer.close(); db.close(); });
