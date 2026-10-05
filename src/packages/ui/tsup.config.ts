import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { cpSync, readdirSync } from 'fs'
import { defineConfig } from 'tsup'

import pkg from './package.json'

const componentEntries = readdirSync('src/components/ui', {
  withFileTypes: true,
})
  .filter(
    (entry) =>
      entry.isFile() &&
      /\.tsx?$/.test(entry.name) &&
      !entry.name.startsWith('index.') &&
      !/\.(spec|test)\./.test(entry.name),
  )
  .map((entry) => `src/components/ui/${entry.name}`)
  .sort()
const allDeps = [
  ...Object.keys(pkg.dependencies),
  ...Object.keys(pkg.peerDependencies),
]

export default defineConfig((options) => ({
  entry: [
    'src/components/index.ts',
    'src/hooks/index.ts',
    'src/lib/index.ts',
    'src/layouts/index.ts',
    'src/providers/index.ts',
    'src/pages/index.ts',
    'src/assets/index.ts',
    'src/styles/globals.css',
    'src/lib/utils.ts',
    ...componentEntries,
  ],
  format: ['esm'],
  dts: false,
  clean: !options.watch,
  splitting: true,
  // The extra Rollup pass strips client boundaries; esbuild handles tree shaking.
  treeshake: false,
  minify: false,

  banner: {
    js: '"use client";',
  },
  onSuccess: async () => {
    cpSync('src/assets', 'dist/ui', { recursive: true })
    if (options.watch)
      execFileSync(
        process.execPath,
        [
          fileURLToPath(import.meta.resolve('tsx/cli')),
          'scripts/build-declarations.ts',
        ],
        { stdio: 'inherit' },
      )
  },

  esbuildOptions(options) {
    options.jsx = 'automatic'
    options.treeShaking = true
    return options
  },

  external: [
    ...allDeps,
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    /^@radix-ui\//,
    /^@dnd-kit\//,
    /^@atlaskit\//,
    /^@tanstack\//,
    /^@tiptap\//,
    /^@hookform\//,
    /^@maskito\//,
    /^@faker-js\//,
    /^@stepperize\//,
    /^nuqs\//,
    /^rxdb\//,
    /^date-fns\//,
    /^zustand\//,
    /^react-icons\//,
    /^@mr-tick\//,
  ],

  loader: {
    '.css': 'copy',
    '.png': 'copy',
    '.svg': 'copy',
    '.jpg': 'copy',
    '.jpeg': 'copy',
    '.gif': 'copy',
  },

  tsconfig: './tsconfig.build.json',
}))
