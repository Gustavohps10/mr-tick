import image from '@rollup/plugin-image'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

import uiPackage from '../../packages/ui/package.json'

const uiSubpaths = Object.keys(uiPackage.exports).map(
  (subpath) => `@mr-tick/ui/${subpath.slice(2)}`,
)

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      viteStaticCopy({
        targets: [
          {
            src: [
              'src/main/assets/timer-icon.png',
              'src/main/assets/favicon.ico',
            ],
            dest: 'assets',
          },
        ],
      }),
    ],
    resolve: {
      alias: {
        '@mr-tick/IoC': resolve(__dirname, '../../packages/IoC.ts'),
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      rollupOptions: {
        input: 'src/main/index.ts',
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      rollupOptions: {
        input: 'src/preload/index.ts',
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
      dedupe: [
        'react',
        'react-dom',
        'react-router',
        'react-router-dom',
        'nuqs',
      ],
    },
    optimizeDeps: {
      exclude: ['@mr-tick/ui', ...uiSubpaths],
    },
    plugins: [react(), tailwindcss(), image()],
    build: {
      sourcemap: true,
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
})
