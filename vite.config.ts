import { defineConfig } from 'vite';

// VoxelCraft build configuration.
// - `worker.format: 'es'` keeps Web Workers as ES modules so we can use imports inside them.
// - Cross-platform: Vite produces a static bundle that runs in any modern browser
//   on Windows, Linux and macOS.
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    outDir: 'dist',
  },
});
