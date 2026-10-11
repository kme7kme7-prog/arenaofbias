import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export function createMenuDemoApp() {
  const app = express();
  app.disable('x-powered-by');
  app.get('/demo-fonts.css', (_req, res) =>
    res.sendFile(`${root}app/playground/fonts.css`),
  );
  app.use(
    '/reference/menu-demo',
    express.static(`${root}reference/menu-demo`, { etag: false, maxAge: 0 }),
  );
  app.use('/fonts', express.static(`${root}public/fonts`));
  app.use(express.static(`${root}dist`));
  return app;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.MENU_DEMO_PORT || 5456);
  createMenuDemoApp().listen(port, '127.0.0.1', () =>
    console.log(`Menu demo: http://127.0.0.1:${port}/reference/menu-demo/`),
  );
}
