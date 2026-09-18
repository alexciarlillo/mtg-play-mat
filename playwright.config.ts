import { defineConfig } from '@playwright/test';

// Electron smoke tests run against the built app in out/, so run
// `npm run build` first (npm run test:e2e does).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results',
});
