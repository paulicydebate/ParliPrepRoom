import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Which commit this build is from (shown in the help menu, so you can tell which version a page is running).
let build = 'dev';
try {
  build = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  // Built from changes not yet committed: say so, so the stamp never names a commit that is not what runs.
  if (execSync('git status --porcelain --untracked-files=no', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) build += '-dirty';
} catch {
  /* not a git checkout */
}

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(build) },
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
