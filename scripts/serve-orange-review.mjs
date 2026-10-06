// Isolated local review: no production credentials, writes, or backend proxy.
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import path from 'node:path';

const directory = path.resolve('.local/orange-review');
const snapshot = JSON.parse(await readFile(path.join(directory, 'snapshot.json'), 'utf8'));
const local = await Promise.all(['works', 'prompts'].map(async name => {
  const cache = path.join(directory, `comparison-${name}.json`);
  try {
    return JSON.parse(await readFile(cache, 'utf8'));
  } catch { /* Create a read-only local comparison snapshot on the first run. */ }
  try {
    const response = await fetch(`http://127.0.0.1:5190/api/${name}`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const records = (await response.json())[name].filter(item => (name === 'works' ? item.promptId : item.id) === '008');
    await writeFile(cache, JSON.stringify(records));
    return records;
  } catch (error) {
    console.warn(`Topic 008 comparison ${name} unavailable: ${error.message}`);
    return [];
  }
}));
const works = [...snapshot.works, ...local[0]];
const prompts = [snapshot.prompt, ...local[1]];
const server = await createServer({
  configFile: path.resolve('vite.config.ts'),
  mode: 'orange-review',
  cacheDir: path.join(directory, 'vite-cache'),
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/orange-review'),
    'import.meta.env.VITE_ORANGE_REVIEW': JSON.stringify('1'),
  },
  server: { host: '127.0.0.1', port: 5442, strictPort: true, proxy: {} },
  plugins: [{
    name: 'orange-review-fixture',
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1:5442');
        if (!url.pathname.startsWith('/orange-review/api/') && !url.pathname.startsWith('/api/')) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'GET') {
          res.statusCode = 403;
          return res.end(JSON.stringify({ error: '本地试版不保存数据' }));
        }
        const endpoint = url.pathname.replace(/^\/orange-review/, '');
        const payload = endpoint === '/api/works' ? { works }
          : endpoint === '/api/prompts' ? { prompts }
            : endpoint === '/api/auth/me' ? { user: null }
              : endpoint === '/api/ratings' ? { ratings: {}, games: {} }
                : {};
        res.end(JSON.stringify(payload));
      });
    },
  }],
});
await server.listen();
console.log(`Orange review: http://127.0.0.1:5442/#arena/${snapshot.prompt.id}`);
console.log(`${snapshot.works.length} public answers downloaded ${snapshot.fetchedAt}; all writes disabled.`);
