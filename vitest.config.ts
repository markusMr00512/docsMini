import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    // Default environment. Individual test files can override with a
    // @vitest-environment docblock when they need jsdom.
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.test.{ts,tsx}',
      'src/**/*.spec.{ts,tsx}',
      'mini-services/**/*.test.ts',
      'mini-services/**/*.spec.ts',
    ],
    exclude: ['node_modules', '.next', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/app/api/**', 'mini-services/collaboration/index.ts'],
      exclude: ['**/*.test.*', '**/*.spec.*'],
    },
    // Resolve path aliases the same way Next.js does.
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
