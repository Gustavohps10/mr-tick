import { defineConfig } from 'tsup'

import pkg from './package.json'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: {
      resolve: [/^@mr-tick\/(application|shared|domain)(\/.*)?$/],
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@mr-tick/application': [
            '../../packages/application/dist/index.d.ts',
          ],
          '@mr-tick/application/*': ['../../packages/application/dist/*.d.ts'],
          '@mr-tick/domain': ['../../packages/domain/dist/index.d.ts'],
          '@mr-tick/shared/*': ['../../packages/shared/dist/*/index.d.ts'],
        },
      },
    },
    clean: true,
    sourcemap: true,
    splitting: false,
    tsconfig: './tsconfig.build.json',
    noExternal: ['@mr-tick/application', '@mr-tick/shared', '@mr-tick/domain'],
    define: {
      __SDK_VERSION__: JSON.stringify(pkg.version),
    },
  },
  {
    entry: {
      cli: 'src/cli/index.ts',
    },
    format: ['cjs'],
    banner: {
      js: '#!/usr/bin/env node',
    },
    target: 'node18',
    platform: 'node',
    dts: false,
    sourcemap: true,
    splitting: false,
    tsconfig: './tsconfig.build.json',
    noExternal: [
      '@mr-tick/application',
      '@mr-tick/shared',
      '@mr-tick/domain',
      'commander',
      'inquirer',
      'js-yaml',
      'adm-zip',
    ],
    define: {
      __SDK_VERSION__: JSON.stringify(pkg.version),
    },
  },
])
