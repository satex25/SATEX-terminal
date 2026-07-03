import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Vitest scopes to unit tests under src/ + the backtest CLI integration
// test under scripts/. The Playwright E2E suite lives in tests/e2e/ and is
// excluded here so `npm test` stays fast and doesn't try to spawn an
// Electron app it can't reach.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.ts'],
    exclude: ['node_modules/**', 'out/**', 'tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
})
