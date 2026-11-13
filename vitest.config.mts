import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json so tests import code the same way the app does.
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // `server-only` throws unless bundled by Next for the server. Tests run server code
      // directly in Node, so swap it for an empty module here.
      'server-only': fileURLToPath(new URL('./tests/stubs/empty.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
})
