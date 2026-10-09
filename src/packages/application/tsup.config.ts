import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/local-runtime.ts'],
  format: ['esm'],
  dts: {
    resolve: true,
  },
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: false,
  tsconfig: './tsconfig.build.json',
})
