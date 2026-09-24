import path from 'node:path'

import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@mr-tick/sdk': path.resolve(import.meta.dirname, './src/apps/sdk/src'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          include: ['src/packages/!(ui)/**/*.spec.ts', 'src/apps/**/*.spec.ts'],
          exclude: [
            ...configDefaults.exclude,
            '**/e2e/**',
            '**/*.e2e.spec.ts',
            'src/packages/ui/**',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/packages/ui/**/*.spec.{ts,tsx}'],
          exclude: [...configDefaults.exclude, '**/e2e/**', '**/*.e2e.spec.ts'],
        },
      },
    ],
  },
})
