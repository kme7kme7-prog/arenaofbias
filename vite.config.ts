import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'vite';
import { metaTags, resolveShare, shareMeta } from './server/share.js';

// VPS 版本：前端两个入口——主站（index.html → src/main.tsx）与管理后台
//（admin.html → src/admin.tsx）。同仓库双应用（决策 040）：独立入口独立构建，
// 共享 lib/ 与 /api。后端是 server/index.js（Express + SQLite），同一端口下
// 托管构建产物。开发模式下由 Vite 起 5173 并代理 /api 到 3000。
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [
    react(),
    {
      name: 'development-social-meta',
      transformIndexHtml(html, context) {
        if (!context.server) return html;
        const origin = process.env.APP_ORIGIN || `http://localhost:${context.server.config.server.port}`;
        const data = resolveShare({}, null)!;
        return html.replace('<!-- social-meta -->', metaTags({ ...shareMeta(data, origin), url: origin + '/' }));
      },
    },
    {
      name: 'admin-entry-alias',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url && /^\/admin\/?(?:\?|$)/.test(req.url))
            req.url = req.url.replace(/^\/admin\/?/, '/admin.html');
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      // 保持 '@/' 指向项目根目录（与 tsconfig paths 一致）。
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Temp/ 放着用户的大型外部数据（如「超级结果」43 万文件）——不让 watcher
    // 监视：否则每次外部改动都触发全页 reload，且 Windows 目录句柄会锁住
    // 收件箱搬移；watcher 也曾因此被撑爆（2026-09-18）
    watch: { ignored: ['**/Temp/**'] },
    proxy: {
      // changeOrigin 必须为 false：保留浏览器的 Host 头，服务端 sameOrigin 校验
      // （origin === http://<host>）才能通过；改写 Host 会让评论/登录/投票在
      // dev 代理下全部 403（生产不经 vite，不受影响）
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false },
      // 作品文件由 Express 从 data/works 提供（决策 043），dev 下同样代理过去；
      // public/works 里的小文件 vite 自己直接返回，不冲突
      '/works': { target: 'http://127.0.0.1:3000', changeOrigin: false },
      '/share': { target: 'http://127.0.0.1:3000', changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url)),
        admin: fileURLToPath(new URL('admin.html', import.meta.url)),
      },
    },
  },
});
