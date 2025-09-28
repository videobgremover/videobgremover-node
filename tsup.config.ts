import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false, // Keep readable for debugging
  target: 'es2020',
  outDir: 'dist',
  external: [
    // Mark peer dependencies as external
    'ffmpeg',
  ],
  banner: {
    js: '// VideoBGRemover Node.js SDK',
  },
})
