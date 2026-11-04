import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    // The server code imports this Cloudflare-only module; tests use a stand-in.
    alias: { 'cloudflare:workers': new URL('./tests/stubs/cloudflare-workers.ts', import.meta.url).pathname },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
});
