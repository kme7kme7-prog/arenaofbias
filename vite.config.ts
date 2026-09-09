import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'vite';

// VPS 版本：纯前端单页应用。
// 后端是 server/index.js（Express + SQLite），同一端口下托管构建产物并提供
// /api/comments。开发模式下由 Vite 起 5173 并代理 /api 到 3000。
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  resolve: {
    alias: {
      // 保持 '@/' 指向项目根目录（与 tsconfig paths 一致）。
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // changeOrigin 必须为 false：保留浏览器的 Host 头，服务端 sameOrigin 校验
      // （origin === http://<host>）才能通过；改写 Host 会让评论/登录/投票在
      // dev 代理下全部 403（生产不经 vite，不受影响）
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
