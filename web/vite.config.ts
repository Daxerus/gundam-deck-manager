import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The SPA builds into the worker's ./public so a single `wrangler deploy` serves API + app.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../worker/public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
