import { defineConfig } from '@playwright/test'

// Electron is a single-process app under test — one worker only, no retries on
// the first pass so failures show up loud. CI can override retries later.
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
})
