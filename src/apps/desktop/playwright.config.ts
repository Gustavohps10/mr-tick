import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: true,
  workers: process.env.CI
    ? 2
    : process.env.WORKERS
      ? Number(process.env.WORKERS)
      : 4,
  forbidOnly: Boolean(process.env.CI),
  retries: 4,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    viewport: { width: 1600, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
})
