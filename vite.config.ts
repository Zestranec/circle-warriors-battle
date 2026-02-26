import { defineConfig } from 'vite';

export default defineConfig({
  base: '/circle-warriors-battle/',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
