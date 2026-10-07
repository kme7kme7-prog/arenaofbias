// Isolated local review with cached public records; never proxy or save a vote.
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import path from 'node:path';

const directory = path.resolve('.local/forum-review');
const snapshot = JSON.parse(await readFile(path.join(directory, 'snapshot.json'), 'utf8'));
const presentation = JSON.parse(await readFile(path.resolve('lib/forum-presentation.json'), 'utf8'));
const works = [...snapshot.works], prompts = [{ ...snapshot.prompt, name: presentation.title }];
for (const file of ['snapshot.json', 'comparison-works.json', 'comparison-prompts.json']) {
  try {
    const data = JSON.parse(await readFile(path.resolve('.local/orange-review', file), 'utf8'));
    if (file === 'snapshot.json') { works.push(...data.works); prompts.push(data.prompt); }
    else if (file === 'comparison-works.json') works.push(...data);
    else prompts.push(...data);
  } catch { /* Other accepted skins are optional offline comparisons. */ }
}
const server = await createServer({
  configFile: path.resolve('vite.config.ts'), mode: 'forum-review', cacheDir: path.join(directory, 'vite-cache'),
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/forum-review'), 'import.meta.env.VITE_ORANGE_REVIEW': JSON.stringify('1') },
  server: { host: '127.0.0.1', port: 5443, strictPort: true, proxy: {} },
  plugins: [{ name: 'forum-review-fixture', configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      const url = new URL(req.url, 'http://127.0.0.1:5443');
      if (!url.pathname.startsWith('/forum-review/api/') && !url.pathname.startsWith('/api/')) return next();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET') { res.statusCode = 403; return res.end(JSON.stringify({ error: '本地试版不保存数据' })); }
      const endpoint = url.pathname.replace(/^\/forum-review/, '');
      const payload = endpoint === '/api/works' ? { works } : endpoint === '/api/prompts' ? { prompts }
        : endpoint === '/api/auth/me' ? { user: null } : endpoint === '/api/ratings' ? { ratings: {}, games: {} } : {};
      res.end(JSON.stringify(payload));
    });
  } }],
});
await server.listen();
console.log(`Forum review: http://127.0.0.1:5443/#arena/${snapshot.prompt.id}`);
console.log(`${snapshot.works.length} unchanged public text answers; snapshot ${snapshot.fetchedAt}; all writes disabled.`);
