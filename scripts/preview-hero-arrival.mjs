// Isolated visual preview: actual application, fixture APIs, no production writes.
import { createServer } from 'vite';
const server = await createServer({
  server: { host: '127.0.0.1', port: 5436, strictPort: true },
  plugins: [{ name: 'hero-review-api', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url.startsWith('/api/')) return next();
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'GET') { res.statusCode = 405; return res.end('{}'); }
      res.end(JSON.stringify({ works: [], prompts: [], ratings: {}, user: null }));
    });
  } }],
});
await server.listen();
console.log('Hero arrival preview: http://127.0.0.1:5436/reference/hero-arrival-review.html');
