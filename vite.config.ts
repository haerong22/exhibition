import { defineConfig } from 'vite';
import fs from 'fs';

export default defineConfig({
  base: '/',
  server: {
    host: 'test.ogq.me',
    port: 5173,
    https: {
      key: fs.readFileSync('key.pem'),
      cert: fs.readFileSync('cert.pem'),
    },
    proxy: {
      '/img-proxy': {
        target: 'https://dev-files.grafolio.ogq.me',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/img-proxy/, ''),
        secure: true,
      },
      '/api-proxy': {
        target: 'https://dev-api.grafolio.ogq.me',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, ''),
        secure: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) {
            return 'three';
          }
        },
      },
    },
  },
});
