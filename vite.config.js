import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'esnext', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
});
