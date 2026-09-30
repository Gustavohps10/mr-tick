import { cpSync, readFileSync } from 'fs'
import { defineConfig } from 'tsup'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const allDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
]

export default defineConfig({
  entry: [
    'src/components/index.ts',
    'src/hooks/index.ts',
    'src/lib/index.ts',
    'src/layouts/index.ts',
    'src/providers/index.ts',
    'src/pages/index.ts',
    'src/assets/index.ts',
    'src/styles/globals.css',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  minify: false,

  banner: {
    js: '"use client";',
  },
  onSuccess: async () => {
    cpSync('src/assets', 'dist/ui', { recursive: true })
  },

  esbuildOptions(options) {
    options.jsx = 'automatic'
    options.banner = {
      js: '"use client";',
    }
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
})
