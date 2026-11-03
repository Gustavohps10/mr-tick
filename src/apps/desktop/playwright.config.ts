import { defineConfig } from '@playwright/test'

function getWorkerCount(): number {
  if (process.env.CI) return 2
  if (process.env.WORKERS) return Number(process.env.WORKERS)
  // Native Win32 input and Electron focus share the same desktop session.
  if (process.platform === 'win32') return 1
  return 4
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: true,
  workers: getWorkerCount(),
  forbidOnly: Boolean(process.env.CI),
  retries: 4,
  ...(process.env.CI ? { grepInvert: /@local-windows/ } : {}),
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
