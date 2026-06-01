/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist/client',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      // src/types.ts is pure type declarations (no runtime code) — its 0% line
      // is coverage noise, not an untested code path.
      exclude: ['src/test/**', 'src/main.tsx', 'src/types.ts', '**/*.d.ts', '**/index.ts'],
    },
  },
})
