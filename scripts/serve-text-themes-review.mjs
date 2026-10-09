// Local comparison only. No writes, credentials, proxy, or production backend mutations.
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import path from 'node:path';
const directory = path.resolve('.local/text-themes-review');
const snapshot = JSON.parse(await readFile(path.join(directory, 'snapshot.json'), 'utf8'));
const works = snapshot.works.map(work => snapshot.htmlFiles[work.id] ? { ...work,
  content: JSON.stringify({ ...JSON.parse(work.content), src: `/text-review-work/${work.id}` }) } : work);
const server = await createServer({
  configFile: path.resolve('vite.config.ts'), mode: 'text-themes-review', cacheDir: path.join(directory, 'vite-cache'),
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/text-review'), 'import.meta.env.VITE_ORANGE_REVIEW': JSON.stringify('1') },
  server: { host: '127.0.0.1', port: 5444, strictPort: true, proxy: {} },
  plugins: [{ name: 'text-review-fixture', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, 'http://127.0.0.1:5444');
      if (url.pathname.startsWith('/text-review-work/')) {
        const file = snapshot.htmlFiles[url.pathname.slice('/text-review-work/'.length)]?.file;
        if (!file || req.method !== 'GET') { res.statusCode = 404; return res.end(); }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        // Opaque sandbox keeps original cached HTML isolated from the review host.
        res.setHeader('Content-Security-Policy', "sandbox allow-scripts");
        return res.end(await readFile(path.join(directory, 'html', file)));
      }
      if (!url.pathname.startsWith('/text-review/api/') && !url.pathname.startsWith('/api/')) return next();
      res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET') { res.statusCode = 403; return res.end(JSON.stringify({ error: '本地试版不保存数据' })); }
      const endpoint = url.pathname.replace(/^\/text-review/, '');
      res.end(JSON.stringify(endpoint === '/api/works' ? { works } : endpoint === '/api/prompts' ? { prompts: snapshot.prompts }
        : endpoint === '/api/auth/me' ? { user: null } : endpoint === '/api/ratings' ? { ratings: {}, games: {} } : {}));
    });
  } }],
});
await server.listen();
console.log('Text themes: http://127.0.0.1:5444/reference/text-themes-review.html');
