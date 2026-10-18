import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'vite';

// A scoped release build: unrelated in-progress game entries are not published.
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react(), {
    name: 'ladder-script-csp', apply: 'build',
    transformIndexHtml: { order: 'post', handler(html) {
      const hashes = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map(match => `'sha256-${createHash('sha256').update(match[1].replaceAll('\r\n', '\n')).digest('base64')}'`);
      return html.replace(/<head>/i, `<head>\n<meta http-equiv="Content-Security-Policy" content="script-src 'self' ${hashes.join(' ')} https://challenges.cloudflare.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'">`);
    } },
  }],
  resolve: { alias: {
    '@': fileURLToPath(new URL('.', import.meta.url)),
    '/render.mjs': fileURLToPath(new URL('app/tanks/render.mjs', import.meta.url)),
    '/presentation.mjs': fileURLToPath(new URL('app/tanks/presentation.mjs', import.meta.url)),
  } },
  build: { outDir: '.local/tank-public-build', emptyOutDir: true, copyPublicDir: false,
    rolldownOptions: { input: {
      ladder: fileURLToPath(new URL('ladder.html', import.meta.url)),
      tanks: fileURLToPath(new URL('tanks.html', import.meta.url)),
    } },
  },
});
