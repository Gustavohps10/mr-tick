import path from 'node:path'

import { configDefaults, defineConfig } from 'vitest/config'

// Previne erro 'Electron failed to install correctly' quando ELECTRON_SKIP_BINARY_DOWNLOAD=1 é usado no CI/Linux
if (!process.env.ELECTRON_OVERRIDE_DIST_PATH) {
  process.env.ELECTRON_OVERRIDE_DIST_PATH = process.cwd()
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@mr-tick/sdk': path.resolve(import.meta.dirname, './src/apps/sdk/src'),
      '@mr-tick/application': path.resolve(
        import.meta.dirname,
        './src/packages/application/src',
      ),
      '@mr-tick/adapters': path.resolve(
        import.meta.dirname,
        './src/packages/adapters/src',
      ),
      '@mr-tick/shared': path.resolve(
        import.meta.dirname,
        './src/packages/shared/src',
      ),
      '@mr-tick/domain': path.resolve(
        import.meta.dirname,
        './src/packages/domain/src',
      ),
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
          server: { deps: { inline: ['next-intl'] } },
          include: [
            'src/packages/!(ui)/**/*.spec.ts',
            'src/apps/**/*.spec.ts',
            'src/dev-addons/**/*.spec.ts',
          ],
          exclude: [
            ...configDefaults.exclude,
            '**/e2e/**',
            '**/*.e2e.spec.ts',
            'src/packages/ui/**',
            'src/apps/desktop/test-results*/**',
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
