import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'local-invite-address',
    apply: 'serve',
    transformIndexHtml(_html, context) {
      const networkUrl = context.server?.resolvedUrls?.network[0];
      return networkUrl ? [{ tag: 'meta', attrs: { name: 'dev-network-url', content: networkUrl }, injectTo: 'head' }] : [];
    },
  }],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022' },
});
