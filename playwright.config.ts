import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 45_000,
  reporter: 'list',
  outputDir: 'artifacts/playwright',
});
